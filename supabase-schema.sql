-- SOP App Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- USERS TABLE
-- =============================================
-- Note: Supabase auth.users handles authentication
-- We create a profiles table for additional user data

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'team')),
  department TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  invited_by UUID REFERENCES auth.users(id),
  avatar_url TEXT,
  notification_preferences JSONB DEFAULT '{
    "pushEnabled": true,
    "emailEnabled": true,
    "calendarSyncEnabled": false,
    "taskReminders": true,
    "overdueAlerts": true
  }'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- SOPS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.sops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  department TEXT NOT NULL,
  category TEXT NOT NULL,
  icon TEXT,
  image_url TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  is_template BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE
);

-- =============================================
-- TASK TEMPLATES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.task_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  sop_id UUID REFERENCES public.sops(id) ON DELETE SET NULL,
  department TEXT NOT NULL,
  assigned_role TEXT,
  estimated_duration INTEGER, -- in minutes
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  recurrence_pattern JSONB,
  requires_approval BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- JOB TASKS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.job_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  template_id UUID REFERENCES public.task_templates(id) ON DELETE SET NULL,
  sop_id UUID REFERENCES public.sops(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) NOT NULL,
  assigned_by UUID REFERENCES auth.users(id) NOT NULL,
  scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in-progress', 'completed', 'blocked')) DEFAULT 'pending',
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_steps TEXT[] DEFAULT '{}',
  comments JSONB DEFAULT '[]'::jsonb,
  completion_photos TEXT[] DEFAULT '{}',
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- INDEXES for Performance
-- =============================================

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON public.profiles(department);

-- SOPs indexes
CREATE INDEX IF NOT EXISTS idx_sops_status ON public.sops(status);
CREATE INDEX IF NOT EXISTS idx_sops_department ON public.sops(department);
CREATE INDEX IF NOT EXISTS idx_sops_category ON public.sops(category);
CREATE INDEX IF NOT EXISTS idx_sops_created_by ON public.sops(created_by);
CREATE INDEX IF NOT EXISTS idx_sops_is_template ON public.sops(is_template);

-- Task Templates indexes
CREATE INDEX IF NOT EXISTS idx_task_templates_department ON public.task_templates(department);
CREATE INDEX IF NOT EXISTS idx_task_templates_sop_id ON public.task_templates(sop_id);
CREATE INDEX IF NOT EXISTS idx_task_templates_created_by ON public.task_templates(created_by);

-- Job Tasks indexes
CREATE INDEX IF NOT EXISTS idx_job_tasks_assigned_to ON public.job_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_job_tasks_assigned_by ON public.job_tasks(assigned_by);
CREATE INDEX IF NOT EXISTS idx_job_tasks_status ON public.job_tasks(status);
CREATE INDEX IF NOT EXISTS idx_job_tasks_scheduled_date ON public.job_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_job_tasks_template_id ON public.job_tasks(template_id);

-- =============================================
-- TRIGGERS for updated_at timestamps
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sops_updated_at
  BEFORE UPDATE ON public.sops
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_templates_updated_at
  BEFORE UPDATE ON public.task_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_tasks_updated_at
  BEFORE UPDATE ON public.job_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_tasks ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- SOPs policies
CREATE POLICY "Users can view published SOPs in their department"
  ON public.sops FOR SELECT
  USING (
    status = 'published' OR
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert SOPs"
  ON public.sops FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update SOPs"
  ON public.sops FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete SOPs"
  ON public.sops FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Task Templates policies
CREATE POLICY "Admins can view all task templates"
  ON public.task_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can manage task templates"
  ON public.task_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Job Tasks policies
CREATE POLICY "Users can view their assigned tasks"
  ON public.job_tasks FOR SELECT
  USING (
    assigned_to = auth.uid() OR
    assigned_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert job tasks"
  ON public.job_tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can update their assigned tasks"
  ON public.job_tasks FOR UPDATE
  USING (
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete job tasks"
  ON public.job_tasks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =============================================
-- FUNCTIONS for Common Operations
-- =============================================

-- Function to create profile after user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role, department)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'Name'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'team'),
    COALESCE(NEW.raw_user_meta_data->>'department', 'General')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- INITIAL DATA (Optional - for testing)
-- =============================================

-- You can add sample data here after setting up authentication
-- Example: INSERT INTO public.profiles ...

COMMENT ON TABLE public.profiles IS 'Extended user profile information';
COMMENT ON TABLE public.sops IS 'Standard Operating Procedures';
COMMENT ON TABLE public.task_templates IS 'Reusable task templates';
COMMENT ON TABLE public.job_tasks IS 'Assigned tasks for team members';
