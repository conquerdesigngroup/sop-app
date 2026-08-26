-- =============================================================================
-- v13 — a super admin tier above admin
-- =============================================================================
--
-- STATUS: NOT YET APPLIED. Apply order is client → Edge Functions → this file.
--         See "APPLY ORDER" below; running this first logs every promoted user
--         out of their own admin UI until the client catches up.
--
-- WHAT THIS DOES
--
--   super_admin  everything, and alone controls pay and logins.
--   admin        tasks, SOPs, the calendar, and the whole parent portal
--                including assigning who may post to a class.
--   team         unchanged.
--
-- Day one: tzuppardo@, suzizuppardo@ and alyssahagenn@ become super_admin. The
-- other two current admins stay admin and therefore LOSE pay, hours, the team
-- schedule and login management. That is the intended effect, decided by the
-- owner, and it is the whole reason this migration exists — it is not a
-- side effect to be surprised by later.
--
-- THE LEVERAGE, AND WHY is_admin() IS NOT RENAMED
--
-- 21 of the 32 policies that call is_admin() are things admin keeps: SOPs, jobs,
-- job_tasks, task_templates and every portal_* table. Widening the function body
-- reclassifies all of them at once, with no policy edits. The 11 that must NOT
-- follow are rewritten below onto is_super_admin(), one at a time, by name.
--
-- Renaming it to is_admin_or_above() would be a 32-site diff in a project whose
-- stated house rule is that a large diff is a bug. A COMMENT carries the meaning
-- instead — see §7.
--
-- STATEMENT ORDER IS THE DESIGN, NOT A STYLE CHOICE
--
-- §3 promotes before §4 installs the new trigger. That is deliberate: the new
-- trigger refuses to mint a super_admin from anyone who is not already one, so
-- the first three cannot be created under the rules they establish. The
-- bootstrap has to happen while the old trigger is still in force. Dropping the
-- old trigger for the duration is cleaner than impersonating an admin with
-- SET LOCAL request.jwt.claims — DDL is transactional in Postgres, so no client
-- ever observes a window where profiles has no guard at all.
--
-- §7 widens is_admin() LAST. Between §5 and §7 the promoted three hold
-- is_super_admin() and so already have pay, while plain admins have already
-- lost it — the desired end state — and only then is everything else handed
-- back. Nothing outside this transaction sees any of it.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH
--
--   work_categories_select   is_active_staff(), and it stays that way.
--                            WorkHoursContext nests both pay-table loads inside
--                            this query's success branch and uses it as the
--                            hasV7Schema probe. Tightening it does not restrict
--                            pay; it silently disables the hours feature.
--   activity_logs SELECT     USING (true) for authenticated — every staff member
--                            can read the whole audit log today. Pre-existing,
--                            unrelated to tiers, and reported separately rather
--                            than fixed in the same breath as a role change.
--   calendar_events          SELECT/INSERT/UPDATE/DELETE are all USING (true).
--                            Any signed-in user can create or delete a calendar
--                            event. Also pre-existing and also reported
--                            separately. Admin "keeping the calendar" is
--                            currently true of everyone.
--   Employees' own rows      Every "OR employee_id = auth.uid()" branch is kept
--                            verbatim. Nobody loses access to their own hours,
--                            their own work days or their own schedule.
--
-- VERIFY BY IMPERSONATION, NOT BY READING
--
-- The checks are at the end of this file, in a transaction meant to be rolled
-- back — the house idiom from v8, v9, v11 and v12. Reading policy text is not
-- sufficient: a predicate can deny a role without ever naming it.
--
-- Migration ledger name: v13_super_admin
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Let the column hold the new value.
--
-- The constraint is unnamed in supabase-schema.sql; its real name was read from
-- pg_constraint rather than guessed, because a wrong name fails on the first
-- statement of the migration.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'team'));


-- -----------------------------------------------------------------------------
-- 2. The narrow test.
--
-- Same shape as is_admin(): STABLE so the planner may cache it within a
-- statement, SECURITY DEFINER so it can read profiles regardless of the caller's
-- own row visibility, and a pinned search_path so a rogue schema cannot shadow
-- `profiles`.
--
-- The revoke names PUBLIC as well as anon. v6 revoked from anon alone, which
-- leaves the default PUBLIC grant intact and the function reachable at
-- /rest/v1/rpc/ — v7 §520 documented that trap and every function since has done
-- it this way.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'
      AND is_active IS NOT FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

COMMENT ON FUNCTION public.is_super_admin() IS
  'True only for an active super_admin. The narrow test: pay, hours and login '
  'management. For "management or above" use public.is_admin().';


-- -----------------------------------------------------------------------------
-- 3. Bootstrap the first three, under the OLD rules.
--
-- The trigger is dropped for these two statements because the new one (§4)
-- cannot create the first super_admin by construction, and because in a SQL
-- editor session auth.uid() is NULL — so the OLD trigger's is_admin() is false
-- and would reject this UPDATE with 'Only admins may change role or active
-- status'. Superuser bypasses RLS but NOT triggers.
--
-- Targeted by email because that is checkable by eye. The count assertion is
-- what makes it safe: a typo or a changed address fails the migration instead
-- of silently promoting nobody and leaving a tier with no members and a trigger
-- that will not let anyone in.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_prevent_privilege_escalation ON public.profiles;

UPDATE public.profiles
SET role = 'super_admin'
WHERE lower(email) IN (
  'tzuppardo@gmail.com',
  'suzizuppardo@gmail.com',
  'alyssahagenn@gmail.com'
);

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM public.profiles
  WHERE role = 'super_admin' AND is_active IS NOT FALSE;

  IF n <> 3 THEN
    RAISE EXCEPTION
      'Expected exactly 3 active super admins after promotion, found %. '
      'Check the three email addresses against public.profiles and re-run.', n;
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 4. A tier-aware guard, and the same guard on INSERT.
--
-- The old body asked one question — "is the actor an admin" — and nothing else.
-- It never compared the actor's tier to the tier being written and had no
-- self-promotion rule, so the moment §1 admitted the new value every admin could
-- PATCH their own row to super_admin and this trigger would have allowed it.
-- That is the single most important change in this file.
--
-- Rule 3 covers is_active as well as role on purpose. An admin who can
-- deactivate the super admins has, one request later, a database with no super
-- admin in it and is_admin() true for themselves — deactivation is escalation
-- wearing a different name.
--
-- Rule 4 stops the last active super admin removing themselves, which would
-- leave pay and provisioning permanently unreachable: no one left can mint a
-- replacement, because rule 2 requires an existing super admin to do it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nothing privileged changed. Names, departments and the rest are governed by
  -- the RLS policies alone, exactly as before.
  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NEW;
  END IF;

  -- Rule 1 — unchanged from v6: only management may touch these at all.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may change role or active status';
  END IF;

  -- Rule 2 — minting. Nobody grants a tier they do not hold.
  IF NEW.role = 'super_admin'
     AND OLD.role IS DISTINCT FROM 'super_admin'
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may grant super admin';
  END IF;

  -- Rule 3 — a super admin is only editable by a super admin. Demotion and
  -- deactivation both land here.
  IF OLD.role = 'super_admin' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may change another super admin';
  END IF;

  -- Rule 4 — never zero. Counted excluding this row, so "the last one" is
  -- judged on who would remain.
  IF OLD.role = 'super_admin'
     AND (NEW.role IS DISTINCT FROM 'super_admin' OR NEW.is_active IS FALSE)
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE role = 'super_admin'
         AND is_active IS NOT FALSE
         AND id <> OLD.id
     ) THEN
    RAISE EXCEPTION 'There must be at least one active super admin';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privilege_escalation();

-- INSERT needs its own guard. profiles_insert allows
-- WITH CHECK (auth.uid() = id OR is_admin()), so without this an admin could
-- create a brand new row that is already super_admin and never touch UPDATE.
-- handle_new_user() is unaffected: it hardcodes role='team'.
CREATE OR REPLACE FUNCTION public.prevent_privileged_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'super_admin' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may create a super admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_privileged_insert ON public.profiles;
CREATE TRIGGER trg_prevent_privileged_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privileged_insert();


-- -----------------------------------------------------------------------------
-- 5. Pay — super admin only.
--
-- Two tables, one policy each. v7 §12 put pay in its own table rather than as
-- columns on work_hours precisely because RLS is row-level: an employee reading
-- their own work_hours row receives every column of it, and column privileges
-- cannot separate admin from employee because both are the `authenticated`
-- Postgres role. That argument applies unchanged one tier up, which is why this
-- step is two statements and not a schema redesign.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS employee_pay_rates_admin_only ON public.employee_pay_rates;
CREATE POLICY employee_pay_rates_admin_only ON public.employee_pay_rates
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS work_hours_pay_admin_only ON public.work_hours_pay;
CREATE POLICY work_hours_pay_admin_only ON public.work_hours_pay
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


-- -----------------------------------------------------------------------------
-- 6. Hours, work days and schedule templates — super admin only, with every
--    "my own rows" branch preserved verbatim.
--
-- Note what this does NOT break: work_hours_freeze_pay() is SECURITY DEFINER, so
-- approving an entry still writes work_hours_pay even though the approver cannot
-- read that table. Approval and pricing were already separable; nobody needs to
-- see a rate to settle a timesheet.
--
-- With admin removed from work_hours entirely, only a super admin can approve.
-- That follows from the owner's decision that admin does not get hours at all.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS work_hours_select ON public.work_hours;
CREATE POLICY work_hours_select ON public.work_hours
  FOR SELECT USING (
    public.is_super_admin() OR employee_id = (auth.uid())::text
  );

DROP POLICY IF EXISTS work_hours_insert ON public.work_hours;
CREATE POLICY work_hours_insert ON public.work_hours
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (employee_id = (auth.uid())::text AND status = 'pending')
  );

DROP POLICY IF EXISTS work_hours_update ON public.work_hours;
CREATE POLICY work_hours_update ON public.work_hours
  FOR UPDATE USING (
    public.is_super_admin()
    OR (employee_id = (auth.uid())::text AND status = ANY (ARRAY['pending', 'rejected']))
  ) WITH CHECK (
    public.is_super_admin()
    OR (employee_id = (auth.uid())::text AND status = 'pending')
  );

DROP POLICY IF EXISTS work_hours_delete ON public.work_hours;
CREATE POLICY work_hours_delete ON public.work_hours
  FOR DELETE USING (
    public.is_super_admin()
    OR (employee_id = (auth.uid())::text AND status = ANY (ARRAY['pending', 'rejected']))
  );

DROP POLICY IF EXISTS work_days_write ON public.work_days;
CREATE POLICY work_days_write ON public.work_days
  FOR ALL USING (
    public.is_super_admin() OR employee_id = (auth.uid())::text
  ) WITH CHECK (
    public.is_super_admin() OR employee_id = (auth.uid())::text
  );

DROP POLICY IF EXISTS work_schedule_templates_select ON public.work_schedule_templates;
CREATE POLICY work_schedule_templates_select ON public.work_schedule_templates
  FOR SELECT USING (
    public.is_super_admin() OR employee_id = (auth.uid())::text
  );

DROP POLICY IF EXISTS work_schedule_templates_write ON public.work_schedule_templates;
CREATE POLICY work_schedule_templates_write ON public.work_schedule_templates
  FOR ALL USING (
    public.is_super_admin() OR employee_id = (auth.uid())::text
  ) WITH CHECK (
    public.is_super_admin() OR employee_id = (auth.uid())::text
  );

-- The work-category list is one of "the variables on hours", so editing it moves
-- up. Reading it does NOT — see the header note on work_categories_select.
DROP POLICY IF EXISTS work_categories_write ON public.work_categories;
CREATE POLICY work_categories_write ON public.work_categories
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Deleting audit history is not something an admin needs. Reading it is
-- untouched here and is its own pre-existing problem.
DROP POLICY IF EXISTS activity_logs_delete_admin ON public.activity_logs;
CREATE POLICY activity_logs_delete_admin ON public.activity_logs
  FOR DELETE USING (public.is_super_admin());


-- -----------------------------------------------------------------------------
-- 7. LAST: is_admin() becomes "management or above".
--
-- Every remaining call site — SOPs, jobs, job_tasks, task_templates, all the
-- portal_* tables, profiles_insert and profiles_update_admin — is something an
-- admin keeps, so widening the body reclassifies them all correctly without a
-- single policy edit.
--
-- profiles_update_admin staying is_admin() is deliberate and is the division of
-- labour the trigger exists for: an admin may edit the directory, while the role
-- and is_active COLUMNS are protected by §4 regardless of which policy allowed
-- the update.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
      AND is_active IS NOT FALSE
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'True for admin AND super_admin — "management or above". Widened in v13. The '
  'narrow test is public.is_super_admin(). A new policy should use is_admin() '
  'unless it guards pay, hours, or login management.';


-- =============================================================================
-- VERIFICATION — run separately, inside a transaction you roll back.
-- =============================================================================
--
-- BEGIN;
--
-- -- (a) No straggler compares the role string directly. Must return zero rows.
-- SELECT tablename, policyname
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename <> 'profiles'
--   AND (coalesce(qual,'') || coalesce(with_check,'')) ~ '''(admin|super_admin|team)''';
--
-- -- (b) As a plain admin: pay is invisible, portal and SOPs still work.
-- SET LOCAL role TO authenticated;
-- SET LOCAL request.jwt.claims TO '{"sub":"<A PLAIN ADMIN UUID>","role":"authenticated"}';
-- SELECT count(*) AS should_be_0 FROM public.employee_pay_rates;
-- SELECT count(*) AS should_be_0 FROM public.work_hours_pay;
-- SELECT count(*) AS should_be_0_or_own FROM public.work_hours;
-- SELECT public.is_admin() AS should_be_true, public.is_super_admin() AS should_be_false;
-- SELECT count(*) AS should_be_nonzero FROM public.sops;
-- SELECT count(*) AS should_be_nonzero FROM public.portal_classes;
--
-- -- (c) The four escalation attempts. ALL FOUR MUST RAISE.
-- UPDATE public.profiles SET role='super_admin' WHERE id = '<THIS ADMIN>';        -- rule 2
-- UPDATE public.profiles SET role='admin'       WHERE id = '<A SUPER ADMIN>';     -- rule 3
-- UPDATE public.profiles SET is_active=false    WHERE id = '<A SUPER ADMIN>';     -- rule 3
-- INSERT INTO public.profiles (id, email, role) VALUES (gen_random_uuid(), 'x@y.z', 'super_admin'); -- insert guard
--
-- -- (d) As a super admin: pay is readable again.
-- SET LOCAL request.jwt.claims TO '{"sub":"<A SUPER ADMIN UUID>","role":"authenticated"}';
-- SELECT public.is_super_admin() AS should_be_true;
-- SELECT count(*) AS should_be_nonzero FROM public.employee_pay_rates;
--
-- ROLLBACK;
--
-- =============================================================================
-- ROLLBACK OF THIS MIGRATION
-- =============================================================================
--
-- Reversible, in this order: demote every super_admin back to 'admin'; restore
-- is_admin() to role = 'admin'; restore the eleven policies in §5 and §6 to
-- is_admin(); restore the v6 trigger body; drop trg_prevent_privileged_insert
-- and is_super_admin(); narrow profiles_role_check back to ('admin','team') —
-- which fails unless the demotion in the first step actually took, and that
-- failure is a feature.
-- =============================================================================
