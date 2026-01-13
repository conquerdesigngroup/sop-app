-- Migration v2.1: Add recurrence support to job_tasks
-- This allows job tasks to have recurring schedules (daily, weekly, monthly)

-- Add recurrence fields to job_tasks table
ALTER TABLE job_tasks
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_pattern JSONB;

-- Update existing rows to have explicit false value
UPDATE job_tasks
SET is_recurring = false
WHERE is_recurring IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN job_tasks.is_recurring IS 'Whether this job task repeats on a schedule';
COMMENT ON COLUMN job_tasks.recurrence_pattern IS 'JSON object defining recurrence rules: {frequency: "daily"|"weekly"|"monthly", days: ["monday", "tuesday", ...], endDate?: string}';

-- Create index for filtering recurring tasks (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_job_tasks_recurring
ON job_tasks(is_recurring)
WHERE is_recurring = true;

-- Verify the migration
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'job_tasks'
  AND column_name IN ('is_recurring', 'recurrence_pattern');
