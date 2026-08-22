-- =============================================================================
-- v10 — a self-signup must not become staff
-- =============================================================================
--
-- WHAT WAS WRONG
--
-- The project has public email signup enabled with mailer_autoconfirm on.
-- Anyone holding the anon key — which is compiled into the public JS bundle at
-- didc.app — could POST /auth/v1/signup and receive a confirmed account and an
-- access token in one request. handle_new_user() then created a profiles row
-- with role='team', and every policy keyed on "is there a session" opened up.
--
-- Verified against production 2026-08-22, then the probe account was deleted:
--
--     profiles         10 rows   (names, EMAIL ADDRESSES, roles)
--     sops             10 rows
--     work_days       255 rows
--     task_templates    5 rows
--
-- This walks straight past v8. v8 closed the `anon` role; this arrives as
-- `authenticated`, which is a different thing entirely. Every policy written as
-- `auth.uid() IS NOT NULL` treats "has a session" as "is staff", and after
-- signup a stranger has a session.
--
-- THE PRIMARY FIX IS NOT IN THIS FILE
--
-- Turn public signup off: Dashboard -> Authentication -> Sign In / Providers ->
-- Email -> "Allow new users to sign up" = off. Nobody signs up for this app;
-- accounts are created by an admin through the admin-users Edge Function, which
-- calls auth.admin.createUser and is unaffected by that setting.
--
-- This migration is the second layer, so that the door being reopened later —
-- by a settings change, a new provider, an invite flow — does not silently hand
-- out the staff directory again.
--
-- HOW IT WORKS
--
-- 1. A signup lands as is_active = false. Inert, not blocked: blocking would
--    make handle_new_user() raise, which would also break auth.admin.createUser
--    and therefore the admin's own "create user" button.
--
-- 2. Policies that meant "any signed-in person" now mean "any ACTIVE staff
--    member", via is_active_staff(). A self-signup satisfies the first and not
--    the second.
--
-- The Edge Function still works: it patches the new profile to is_active = true
-- as the calling admin, which prevent_privilege_escalation() permits because
-- that caller really is an admin.
--
-- Depends on v6 (is_admin), v8 (profiles/sops policies).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. is_active_staff()
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER so it reads profiles without being subject to the very
-- policies that call it, which is also what stops it recursing. search_path is
-- pinned: a SECURITY DEFINER function with a caller-controlled search_path is a
-- privilege-escalation primitive.
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_active IS NOT FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. New accounts start inactive
-- -----------------------------------------------------------------------------
-- Unchanged from v6 except is_active. role stays hardcoded to 'team' — v6 made
-- it so because reading it from raw_user_meta_data let a signup choose to be an
-- admin.
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
    'team',
    COALESCE(NEW.raw_user_meta_data->>'department', 'General'),
    -- Was true. An admin creating an account activates it immediately via the
    -- admin-users Edge Function; a stranger signing themselves up does not.
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. "Signed in" is no longer the same as "staff"
-- -----------------------------------------------------------------------------
-- Only the broad policies change. Ownership-scoped ones (work_hours, job_tasks,
-- jobs) already return nothing to a stranger because they compare against
-- auth.uid(), so they are left alone.

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated
  -- Own row stays readable regardless, so a deactivated person still gets a
  -- coherent app shell instead of a blank screen they cannot explain.
  USING (public.is_active_staff() OR id = auth.uid());

DROP POLICY IF EXISTS "sops_select_authenticated" ON public.sops;
CREATE POLICY "sops_select_authenticated" ON public.sops
  FOR SELECT TO authenticated
  USING (
    public.is_active_staff()
    AND (status = 'published' OR created_by = auth.uid() OR public.is_admin())
  );

DROP POLICY IF EXISTS "task_templates_select" ON public.task_templates;
CREATE POLICY "task_templates_select" ON public.task_templates
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "work_days_select" ON public.work_days;
CREATE POLICY "work_days_select" ON public.work_days
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "work_categories_select" ON public.work_categories;
CREATE POLICY "work_categories_select" ON public.work_categories
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "portal_ci_read" ON public.portal_class_instructors;
CREATE POLICY "portal_ci_read" ON public.portal_class_instructors
  FOR SELECT TO authenticated USING (public.is_active_staff());

COMMIT;

-- =============================================================================
-- VERIFY
-- =============================================================================
--
-- 1. Repeat the probe. Sign up with only the anon key, then with the returned
--    token read profiles / sops / work_days / task_templates. Every one must
--    return 0. Delete the probe account afterwards:
--
--      DELETE FROM public.profiles WHERE email = '<probe>';
--      DELETE FROM auth.users     WHERE email = '<probe>';
--
-- 2. Existing staff are unaffected — impersonate a real admin and a real team
--    member and confirm the directory, SOPs and work_days still load.
--
-- 3. Admin "create user" still works end to end: the Edge Function activates
--    the new profile as the calling admin.
--
-- =============================================================================
