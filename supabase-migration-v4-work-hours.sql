-- Migration script to add Work Hours tracking tables
-- Run this in your Supabase SQL Editor

-- =============================================
-- CREATE WORK_HOURS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.work_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id TEXT NOT NULL,
  work_date DATE NOT NULL,
  start_time TEXT NOT NULL,  -- HH:MM format (e.g., "09:00")
  end_time TEXT NOT NULL,    -- HH:MM format (e.g., "17:00")
  break_minutes INTEGER DEFAULT 0,
  total_hours NUMERIC(5,2) NOT NULL,  -- Calculated total work hours
  notes TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  approved_by TEXT,           -- Admin user ID who approved/rejected
  approved_at TIMESTAMP WITH TIME ZONE,
  created_by TEXT NOT NULL,   -- User who created (can be employee or admin)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for common queries
CREATE INDEX IF NOT EXISTS idx_work_hours_employee_id ON public.work_hours(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_hours_work_date ON public.work_hours(work_date);
CREATE INDEX IF NOT EXISTS idx_work_hours_status ON public.work_hours(status);

-- Composite index for date range queries by employee
CREATE INDEX IF NOT EXISTS idx_work_hours_employee_date ON public.work_hours(employee_id, work_date);

-- =============================================
-- CREATE WORK_SCHEDULE_TEMPLATES TABLE (optional - for recurring schedules)
-- =============================================
CREATE TABLE IF NOT EXISTS public.work_schedule_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),  -- 0-6 (Sunday-Saturday)
  start_time TEXT NOT NULL,    -- Default start time
  end_time TEXT NOT NULL,      -- Default end time
  break_minutes INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(employee_id, day_of_week)
);

-- Add index for schedule lookups
CREATE INDEX IF NOT EXISTS idx_work_schedule_employee ON public.work_schedule_templates(employee_id);

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================
ALTER TABLE public.work_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_schedule_templates ENABLE ROW LEVEL SECURITY;

-- Work hours policies
-- Allow authenticated users to read all work hours (for team visibility)
CREATE POLICY "Allow read access to work hours for authenticated users"
  ON public.work_hours
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert their own work hours
CREATE POLICY "Allow insert work hours for authenticated users"
  ON public.work_hours
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update work hours
-- In production, you may want to restrict this to the employee or admin
CREATE POLICY "Allow update work hours for authenticated users"
  ON public.work_hours
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to delete work hours
-- In production, you may want to restrict this to admin only
CREATE POLICY "Allow delete work hours for authenticated users"
  ON public.work_hours
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- Work schedule template policies
CREATE POLICY "Allow read access to work schedules for authenticated users"
  ON public.work_schedule_templates
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert work schedules for authenticated users"
  ON public.work_schedule_templates
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update work schedules for authenticated users"
  ON public.work_schedule_templates
  FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow delete work schedules for authenticated users"
  ON public.work_schedule_templates
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- =============================================
-- ENABLE REALTIME FOR WORK_HOURS TABLE
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_hours;

-- =============================================
-- CREATE UPDATED_AT TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION update_work_hours_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_hours_updated_at
  BEFORE UPDATE ON public.work_hours
  FOR EACH ROW
  EXECUTE FUNCTION update_work_hours_updated_at();

CREATE TRIGGER work_schedule_templates_updated_at
  BEFORE UPDATE ON public.work_schedule_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_work_hours_updated_at();

-- =============================================
-- HELPER VIEW FOR WORK HOURS SUMMARY (optional)
-- =============================================
CREATE OR REPLACE VIEW public.work_hours_summary AS
SELECT
  employee_id,
  DATE_TRUNC('week', work_date) as week_start,
  SUM(total_hours) as total_hours,
  SUM(CASE WHEN status = 'approved' THEN total_hours ELSE 0 END) as approved_hours,
  SUM(CASE WHEN status = 'pending' THEN total_hours ELSE 0 END) as pending_hours,
  COUNT(DISTINCT work_date) as days_worked
FROM public.work_hours
GROUP BY employee_id, DATE_TRUNC('week', work_date);

-- Grant access to the view
GRANT SELECT ON public.work_hours_summary TO authenticated;
