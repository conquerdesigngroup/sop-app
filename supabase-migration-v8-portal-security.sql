-- =============================================================================
-- v8 — close anon read access on profiles and sops
--
-- STATUS: APPLIED to prod 2026-08-21 (project sgppeenmvskwztaszkgn).
--         Verified by role impersonation — see VERIFY at the bottom.
-- =============================================================================
--
-- WHY THIS EXISTS
--
-- v6 hardened job_tasks, jobs, task_templates, work_hours and work_days. It did
-- not touch profiles or sops, whose policies were still the originals from
-- supabase-schema.sql:
--
--   profiles: FOR SELECT USING (true)
--   sops:     FOR SELECT USING (status = 'published' OR ...)
--
-- Neither carries a TO clause, so both apply to the `anon` role, and `anon`
-- holds the SELECT grant on both tables. Both predicates evaluate to true when
-- auth.uid() IS NULL. The anon key ships inside the public JS bundle, so as of
-- this migration ANY visitor could read:
--
--   * every row of profiles — name, email, role, department, is_active
--   * every published SOP, including all of its steps
--
-- ...with no session. Verified against production 2026-08-21 via pg_policies
-- and information_schema.role_table_grants.
--
-- This is being fixed now because the parent portal (v9) deliberately opens an
-- anon-readable surface on that same key. New public access must not be layered
-- on top of a model that is already leaking.
--
-- PAIRS WITH A CODE CHANGE
--
-- src/contexts/AuthContext.tsx called `await loadUsers()` unconditionally during
-- init — i.e. for logged-out visitors too. That call now sits inside the
-- `if (session?.user)` branch. Applying this migration without that change is
-- still safe (the query just returns zero rows and login is unaffected, because
-- signInWithPassword completes before any profile read), but the pointless
-- unauthenticated fetch would remain.
--
-- Apply in the Supabase SQL editor, same as v6 and v7.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. profiles — staff directory, authenticated only
-- -----------------------------------------------------------------------------
-- Kept deliberately broad (any signed-in user sees the whole directory) because
-- assignment pickers, avatars and "assigned by" labels throughout the app need
-- to resolve names for people other than the viewer. The change here is only
-- that a request with no JWT now sees nothing.

DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 2. sops — internal operating procedures, authenticated only
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view published SOPs" ON public.sops;
DROP POLICY IF EXISTS "Users can view published SOPs in their department" ON public.sops;

CREATE POLICY "sops_select_authenticated" ON public.sops
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR created_by = auth.uid()
    OR public.is_admin()
  );

-- -----------------------------------------------------------------------------
-- 3. profiles write policies — drop the self-referencing admin subqueries
-- -----------------------------------------------------------------------------
-- These predate v6 and re-implement the admin check as
-- `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')`
-- inside a policy that is itself ON profiles. That subquery is evaluated under
-- the profiles SELECT policy, so it was only ever safe because that policy was
-- the trivially-true one being replaced above.
--
-- public.is_admin() is SECURITY DEFINER and bypasses RLS, which is precisely why
-- v6 introduced it. Switching to it removes the recursion hazard rather than
-- leaving it to be reasoned about, and brings profiles in line with every other
-- table. It also tightens behaviour slightly and correctly: a deactivated admin
-- (is_active = false) can no longer edit profiles, matching v6 everywhere else.
--
-- "Admins can update all profiles" and "Admins can update any profile" are
-- byte-identical duplicates; they collapse into one.

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- "Users can update own profile" is left as-is: `auth.uid() = id` is already
-- correct, does not touch profiles recursively, and the
-- prevent_privilege_escalation() trigger from v6 still stops a user from
-- editing their own role or is_active through it.

-- Same treatment for the duplicate INSERT policies.
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Allow profile creation" ON public.profiles;

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- handle_new_user() is SECURITY DEFINER and bypasses RLS, so signup still works
-- regardless of the above.

-- -----------------------------------------------------------------------------
-- 4. sops write policies — same substitution
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can insert SOPs" ON public.sops;
DROP POLICY IF EXISTS "Admins can update SOPs" ON public.sops;
DROP POLICY IF EXISTS "Admins can delete SOPs" ON public.sops;

CREATE POLICY "sops_insert_admin" ON public.sops
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "sops_update_admin" ON public.sops
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "sops_delete_admin" ON public.sops
  FOR DELETE TO authenticated USING (public.is_admin());

COMMIT;

-- =============================================================================
-- VERIFY
-- =============================================================================
--
-- 1. THE AUTHORITATIVE CHECK — impersonate an unauthenticated PostgREST request
--    and count what it can actually reach. Reading policy text is not enough;
--    a predicate can deny anon without mentioning auth.uid() at all (see the
--    note in step 2). Every count must be 0:
--
--      BEGIN;
--      SET LOCAL ROLE anon;
--      SET LOCAL request.jwt.claims TO '';
--        SELECT 'profiles' t, count(*) FROM public.profiles
--        UNION ALL SELECT 'sops',           count(*) FROM public.sops
--        UNION ALL SELECT 'job_tasks',      count(*) FROM public.job_tasks
--        UNION ALL SELECT 'jobs',           count(*) FROM public.jobs
--        UNION ALL SELECT 'work_hours',     count(*) FROM public.work_hours
--        UNION ALL SELECT 'work_days',      count(*) FROM public.work_days
--        UNION ALL SELECT 'task_templates', count(*) FROM public.task_templates
--        UNION ALL SELECT 'activity_logs',  count(*) FROM public.activity_logs
--        UNION ALL SELECT 'work_schedule_templates', count(*)
--                    FROM public.work_schedule_templates;
--      ROLLBACK;
--
--    Result when applied: all zero.
--
-- 2. Policy-text sweep, as a secondary signal only. Note the auth.role() clause:
--    work_schedule_templates guards with `auth.role() = 'authenticated'`, which
--    correctly denies anon (auth.role() is NULL without a JWT) despite never
--    mentioning auth.uid(). Omitting it produces a false positive.
--
--      SELECT tablename, policyname, roles::text, qual
--      FROM pg_policies
--      WHERE schemaname = 'public'
--        AND cmd IN ('SELECT','ALL')
--        AND NOT ('authenticated' = ANY(roles))
--        AND qual NOT LIKE '%auth.uid()%'
--        AND qual NOT LIKE '%is_admin()%'
--        AND qual NOT LIKE '%auth.role()%';
--
-- 2b. From a browser console on the deployed site, signed out:
--
--      const { data } = await supabase.from('profiles').select('*');  // []
--      const { data } = await supabase.from('sops').select('*');      // []
--
-- 3. Signed in as an admin, confirm the app still works end to end:
--    /dashboard, /team (user CRUD), /sop (create + publish + archive),
--    /hours-input, /my-tasks.
--
-- 4. Signed in as a `team` user: /dashboard, /my-tasks, /hours-input, /sop
--    (read), and confirm they still see other members' names where expected.
--
-- ROLLBACK, if step 3 or 4 turns up a problem:
--
--   DROP POLICY "profiles_select_authenticated" ON public.profiles;
--   CREATE POLICY "Users can view all profiles"
--     ON public.profiles FOR SELECT USING (true);
--
-- =============================================================================
