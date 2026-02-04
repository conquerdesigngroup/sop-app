-- Migration script to add Work Days table (simple day marking without hours)
-- Run this in your Supabase SQL Editor

-- =============================================
-- CREATE WORK_DAYS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.work_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id TEXT NOT NULL,
  work_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'confirmed', 'cancelled')) DEFAULT 'scheduled',
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(employee_id, work_date)
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_work_days_employee_id ON public.work_days(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_days_work_date ON public.work_days(work_date);
CREATE INDEX IF NOT EXISTS idx_work_days_status ON public.work_days(status);
CREATE INDEX IF NOT EXISTS idx_work_days_employee_date ON public.work_days(employee_id, work_date);

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================
ALTER TABLE public.work_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to work days for authenticated users"
  ON public.work_days FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert work days for authenticated users"
  ON public.work_days FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update work days for authenticated users"
  ON public.work_days FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow delete work days for authenticated users"
  ON public.work_days FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================
-- ENABLE REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_days;

-- =============================================
-- CREATE UPDATED_AT TRIGGER
-- =============================================
CREATE TRIGGER work_days_updated_at
  BEFORE UPDATE ON public.work_days
  FOR EACH ROW EXECUTE FUNCTION update_work_hours_updated_at();
