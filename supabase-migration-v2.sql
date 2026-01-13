-- Migration script to update Supabase schema for Job Tasks, Jobs, Templates, and Activity Logs
-- Run this in your Supabase SQL Editor if you already have the old schema

-- =============================================
-- CREATE TASK TEMPLATES TABLE (if not exists)
-- =============================================
CREATE TABLE IF NOT EXISTS public.task_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  department TEXT NOT NULL,
  estimated_duration INTEGER,
  priority TEXT DEFAULT 'medium',
  sop_ids TEXT[] DEFAULT '{}',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- DROP OLD job_tasks TABLE AND RECREATE
-- =============================================
-- WARNING: This will delete existing job_tasks data. Back up if needed.

DROP TABLE IF EXISTS public.job_tasks CASCADE;

CREATE TABLE public.job_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  template_id UUID REFERENCES public.task_templates(id) ON DELETE SET NULL,
  assigned_to TEXT[] DEFAULT '{}',  -- Array of user IDs (supports multiple assignees)
  assigned_by TEXT NOT NULL,
  department TEXT,
  category TEXT,
  scheduled_date DATE NOT NULL,
  due_time TEXT,
  estimated_duration INTEGER, -- in minutes
  status TEXT NOT NULL CHECK (status IN ('pending', 'in-progress', 'completed', 'overdue', 'draft', 'archived')) DEFAULT 'pending',
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_steps TEXT[] DEFAULT '{}',
  progress_percentage INTEGER DEFAULT 0,
  sop_ids TEXT[] DEFAULT '{}',  -- Array of SOP IDs
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by TEXT,
  completion_notes TEXT,
  completion_photos TEXT[] DEFAULT '{}',
  comments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- CREATE JOBS TABLE (new)
-- =============================================
DROP TABLE IF EXISTS public.jobs CASCADE;

CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT[] DEFAULT '{}',  -- Array of user IDs
  assigned_by TEXT NOT NULL,
  department TEXT,
  scheduled_date DATE NOT NULL,
  due_time TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in-progress', 'completed', 'overdue', 'draft', 'archived')) DEFAULT 'pending',
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Embedded tasks within the job
  completed_tasks_count INTEGER DEFAULT 0,
  total_tasks_count INTEGER DEFAULT 0,
  progress_percentage INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by TEXT,
  completion_notes TEXT,
  comments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- UPDATE TASK TEMPLATES TABLE
-- =============================================
-- Add new columns if they don't exist
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS sop_ids TEXT[] DEFAULT '{}';
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;

-- Drop old columns that are no longer needed (if they exist)
ALTER TABLE public.task_templates DROP COLUMN IF EXISTS sop_id;
ALTER TABLE public.task_templates DROP COLUMN IF EXISTS assigned_role;
ALTER TABLE public.task_templates DROP COLUMN IF EXISTS tags;
ALTER TABLE public.task_templates DROP COLUMN IF EXISTS requires_approval;

-- Change created_by to TEXT if it's UUID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates'
    AND column_name = 'created_by'
    AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.task_templates ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;
  END IF;
END $$;

-- =============================================
-- INDEXES
-- =============================================
DROP INDEX IF EXISTS idx_job_tasks_assigned_to;
DROP INDEX IF EXISTS idx_job_tasks_assigned_by;
CREATE INDEX IF NOT EXISTS idx_job_tasks_status ON public.job_tasks(status);
CREATE INDEX IF NOT EXISTS idx_job_tasks_scheduled_date ON public.job_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_job_tasks_template_id ON public.job_tasks(template_id);
CREATE INDEX IF NOT EXISTS idx_job_tasks_department ON public.job_tasks(department);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON public.jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_jobs_department ON public.jobs(department);

DROP INDEX IF EXISTS idx_task_templates_sop_id;
CREATE INDEX IF NOT EXISTS idx_task_templates_category ON public.task_templates(category);

-- =============================================
-- TRIGGERS
-- =============================================
DROP TRIGGER IF EXISTS update_job_tasks_updated_at ON public.job_tasks;
DROP TRIGGER IF EXISTS update_jobs_updated_at ON public.jobs;

CREATE TRIGGER update_job_tasks_updated_at
  BEFORE UPDATE ON public.job_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE public.job_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their assigned tasks" ON public.job_tasks;
DROP POLICY IF EXISTS "Admins can insert job tasks" ON public.job_tasks;
DROP POLICY IF EXISTS "Users can update their assigned tasks" ON public.job_tasks;
DROP POLICY IF EXISTS "Admins can delete job tasks" ON public.job_tasks;
DROP POLICY IF EXISTS "Allow all for authenticated users on job_tasks" ON public.job_tasks;

DROP POLICY IF EXISTS "Admins can view all jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can insert jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can update jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can delete jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow all for authenticated users on jobs" ON public.jobs;

-- Simplified policies: Allow all operations for authenticated users
CREATE POLICY "Allow all for authenticated users on job_tasks"
  ON public.job_tasks FOR ALL
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow all for authenticated users on jobs"
  ON public.jobs FOR ALL
  USING (auth.uid() IS NOT NULL);

-- =============================================
-- ACTIVITY LOGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_title TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on activity_logs
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Activity logs policies
DROP POLICY IF EXISTS "Admins can view all activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON public.activity_logs;

CREATE POLICY "Admins can view all activity logs"
  ON public.activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can insert activity logs"
  ON public.activity_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Activity logs index
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_type ON public.activity_logs(entity_type);

-- =============================================
-- TASK TEMPLATES RLS POLICIES
-- =============================================
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users on task_templates" ON public.task_templates;
CREATE POLICY "Allow all for authenticated users on task_templates"
  ON public.task_templates FOR ALL
  USING (auth.uid() IS NOT NULL);

-- =============================================
-- Done! Your schema is now updated.
-- =============================================
