-- =============================================================================
-- v77 -- work hours on a Team Schedule day
--
-- WHAT THIS ADDS
--
-- work_days.start_time and work_days.end_time: the hours someone is rostered
-- for on a scheduled day ("Tuesday, 9:00 AM - 5:00 PM"). Both are nullable.
-- A day with no times is still a scheduled day, it just has no set hours --
-- which is every row that exists today, so nothing is backfilled.
--
-- These are PLANNED hours. Hours actually worked stay in work_hours (Hours
-- Input) and nothing here reads or writes that table.
--
-- ---------------------------------------------------------------------------
-- WHY `time` AND NOT `timestamptz`
-- ---------------------------------------------------------------------------
--
-- work_date is already a plain `date`, and the studio works in one timezone.
-- A wall-clock `time` beside it is what the person picked and what is shown
-- back; a timestamptz would re-render the shift in whatever timezone the
-- viewing device happens to be in.
--
-- ---------------------------------------------------------------------------
-- THE CHECK
-- ---------------------------------------------------------------------------
--
-- Both set or both null, and the end after the start. The app enforces the
-- same thing before saving (src/components/hours/workDayHours.ts,
-- validateShift); the constraint is there so a half-filled row can never
-- reach the calendar as "9:00 AM - ". Shifts past midnight are not supported,
-- the studio does not run any.
--
-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Unchanged. The existing work_days policies are row-level, so they already
-- cover the new columns.
--
-- ROLLBACK
--   ALTER TABLE public.work_days DROP CONSTRAINT IF EXISTS work_days_hours_valid;
--   ALTER TABLE public.work_days DROP COLUMN IF EXISTS end_time;
--   ALTER TABLE public.work_days DROP COLUMN IF EXISTS start_time;
-- =============================================================================

BEGIN;

ALTER TABLE public.work_days ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE public.work_days ADD COLUMN IF NOT EXISTS end_time   time;

ALTER TABLE public.work_days DROP CONSTRAINT IF EXISTS work_days_hours_valid;
ALTER TABLE public.work_days ADD CONSTRAINT work_days_hours_valid CHECK (
  (start_time IS NULL AND end_time IS NULL)
  OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
);

COMMENT ON COLUMN public.work_days.start_time IS
  'Planned start of the shift (wall clock). NULL = no set hours. See v77.';
COMMENT ON COLUMN public.work_days.end_time IS
  'Planned end of the shift (wall clock). NULL together with start_time. See v77.';

COMMIT;

-- PostgREST caches the schema; without this the new columns are rejected
-- until the cache next reloads on its own.
NOTIFY pgrst, 'reload schema';
