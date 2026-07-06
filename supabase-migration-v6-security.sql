-- ============================================================
-- Migration v6: SECURITY HARDENING
-- ============================================================
-- Fixes critical RLS and privilege-escalation issues found in a
-- July 2026 security audit. Review each section before running —
-- this migration intentionally REMOVES the "any authenticated user
-- can do anything" policies that v2/v4/v5 introduced.
--
-- Run in the Supabase SQL editor as the postgres role.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helper: cached admin check.
--    Every per-row EXISTS(...) subquery in a policy re-runs per row;
--    a STABLE SECURITY DEFINER function lets Postgres cache it
--    per statement, and keeps policy definitions readable.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active IS NOT FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ------------------------------------------------------------
-- 1. Signup can no longer choose its own role.
--    Previously handle_new_user() copied role from client-supplied
--    raw_user_meta_data, letting anyone sign up as admin.
--    New users are ALWAYS 'team'; promote via an admin flow.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role, department, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    'team',  -- hardcoded: role is never client-controlled
    COALESCE(NEW.raw_user_meta_data->>'department', 'General'),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 2. Users cannot change their own role / is_active.
--    A BEFORE UPDATE trigger rejects privilege changes made by
--    non-admins regardless of which RLS policy allowed the update.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may change role or active status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privilege_escalation();

-- ------------------------------------------------------------
-- 3. jobs / job_tasks / task_templates: restore role-based policies.
--    v2 replaced these with USING (auth.uid() IS NOT NULL), which let
--    any team member read/modify/delete everything.
--
--    RLS policies are OR'd together, so a leftover permissive policy
--    would defeat the new ones. Drop ALL existing policies on the
--    affected tables first (names drifted across v2/v4/v5).
-- ------------------------------------------------------------
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('job_tasks', 'jobs', 'task_templates', 'work_hours', 'work_days')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- job_tasks
DROP POLICY IF EXISTS "Allow all operations on job_tasks" ON public.job_tasks;
DROP POLICY IF EXISTS "Authenticated users can view job tasks" ON public.job_tasks;
DROP POLICY IF EXISTS "Authenticated users can manage job tasks" ON public.job_tasks;

CREATE POLICY "job_tasks_select" ON public.job_tasks
  FOR SELECT USING (
    public.is_admin() OR auth.uid()::text = ANY (assigned_to)
  );

CREATE POLICY "job_tasks_insert" ON public.job_tasks
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "job_tasks_update" ON public.job_tasks
  FOR UPDATE USING (
    public.is_admin() OR auth.uid()::text = ANY (assigned_to)
  ) WITH CHECK (
    public.is_admin() OR auth.uid()::text = ANY (assigned_to)
  );

CREATE POLICY "job_tasks_delete" ON public.job_tasks
  FOR DELETE USING (public.is_admin());

-- jobs
DROP POLICY IF EXISTS "Allow all operations on jobs" ON public.jobs;
DROP POLICY IF EXISTS "Authenticated users can view jobs" ON public.jobs;
DROP POLICY IF EXISTS "Authenticated users can manage jobs" ON public.jobs;

CREATE POLICY "jobs_select" ON public.jobs
  FOR SELECT USING (
    public.is_admin() OR auth.uid()::text = ANY (assigned_to)
  );

CREATE POLICY "jobs_insert" ON public.jobs
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "jobs_update" ON public.jobs
  FOR UPDATE USING (
    public.is_admin() OR auth.uid()::text = ANY (assigned_to)
  ) WITH CHECK (
    public.is_admin() OR auth.uid()::text = ANY (assigned_to)
  );

CREATE POLICY "jobs_delete" ON public.jobs
  FOR DELETE USING (public.is_admin());

-- task_templates: everyone can read, only admins write
DROP POLICY IF EXISTS "Allow all operations on task_templates" ON public.task_templates;
DROP POLICY IF EXISTS "Authenticated users can manage task templates" ON public.task_templates;

CREATE POLICY "task_templates_select" ON public.task_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "task_templates_write" ON public.task_templates
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- 4. work_hours / work_days: employees manage only their own
--    PENDING entries; only admins approve or edit others'.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all operations on work_hours" ON public.work_hours;
DROP POLICY IF EXISTS "Authenticated users can manage work hours" ON public.work_hours;
DROP POLICY IF EXISTS "Users can view work hours" ON public.work_hours;
DROP POLICY IF EXISTS "Users can insert work hours" ON public.work_hours;
DROP POLICY IF EXISTS "Users can update work hours" ON public.work_hours;
DROP POLICY IF EXISTS "Users can delete work hours" ON public.work_hours;

CREATE POLICY "work_hours_select" ON public.work_hours
  FOR SELECT USING (
    public.is_admin() OR employee_id = auth.uid()::text
  );

CREATE POLICY "work_hours_insert" ON public.work_hours
  FOR INSERT WITH CHECK (
    public.is_admin() OR (employee_id = auth.uid()::text AND status = 'pending')
  );

CREATE POLICY "work_hours_update" ON public.work_hours
  FOR UPDATE USING (
    public.is_admin() OR (employee_id = auth.uid()::text AND status = 'pending')
  ) WITH CHECK (
    public.is_admin() OR (employee_id = auth.uid()::text AND status = 'pending')
  );

CREATE POLICY "work_hours_delete" ON public.work_hours
  FOR DELETE USING (
    public.is_admin() OR (employee_id = auth.uid()::text AND status = 'pending')
  );

DROP POLICY IF EXISTS "Allow all operations on work_days" ON public.work_days;
DROP POLICY IF EXISTS "Authenticated users can manage work days" ON public.work_days;
DROP POLICY IF EXISTS "Users can view work days" ON public.work_days;
DROP POLICY IF EXISTS "Users can insert work days" ON public.work_days;
DROP POLICY IF EXISTS "Users can update work days" ON public.work_days;
DROP POLICY IF EXISTS "Users can delete work days" ON public.work_days;

CREATE POLICY "work_days_select" ON public.work_days
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "work_days_write" ON public.work_days
  FOR ALL USING (
    public.is_admin() OR employee_id = auth.uid()::text
  ) WITH CHECK (
    public.is_admin() OR employee_id = auth.uid()::text
  );

-- The summary view runs with definer rights by default and would
-- bypass the RLS above.
ALTER VIEW IF EXISTS public.work_hours_summary SET (security_invoker = true);

-- ------------------------------------------------------------
-- 5. activity_logs: writes must be attributed to the caller.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.activity_logs;

-- Live DB had differently-named permissive policies (found during apply):
DROP POLICY IF EXISTS "Allow authenticated insert activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow authenticated delete activity_logs" ON public.activity_logs;

-- user_id is TEXT in v2-migrated DBs and UUID in fresh ones; cast both sides
CREATE POLICY "activity_logs_insert" ON public.activity_logs
  FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

-- Audit logs: only admins may delete
CREATE POLICY "activity_logs_delete_admin" ON public.activity_logs
  FOR DELETE USING (public.is_admin());

-- ------------------------------------------------------------
-- 6. Indexes for the array-membership checks used by policies
--    and app filters (= ANY(assigned_to) does a seq scan otherwise).
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_job_tasks_assigned_to ON public.job_tasks USING GIN (assigned_to);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_to ON public.jobs USING GIN (assigned_to);
CREATE INDEX IF NOT EXISTS idx_profiles_invited_by ON public.profiles (invited_by);
CREATE INDEX IF NOT EXISTS idx_work_hours_employee_date ON public.work_hours (employee_id, work_date);

-- ============================================================
-- NOT COVERED BY THIS MIGRATION (requires app/infra changes):
--  * Google OAuth token exchange must move to an Edge Function —
--    REACT_APP_GOOGLE_CLIENT_SECRET is compiled into the public JS
--    bundle and must be rotated after migrating.
--  * Admin "create user" should call auth.admin.createUser from an
--    Edge Function instead of client-side signUp (which replaces the
--    admin's own session).
-- ============================================================
