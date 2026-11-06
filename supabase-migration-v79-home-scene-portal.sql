-- =============================================================================
-- v79 -- the Home background on the parent portal too
--
-- WHAT CHANGES
--
-- 1. home_scene_setting gains show_on_portal (default false). When true, the
--    seasonal scene a super admin picked for staff Home is also drawn behind
--    every parent-portal page (PortalScene in src/components/HomeScene.tsx).
-- 2. The row becomes readable by everyone, anon included. Parents are not
--    staff, and some portal pages are open before sign-in, so v78's
--    is_active_staff() read would hide the setting from exactly the people it
--    is now for. What is exposed is the name of a scene, an end date and a
--    flag: nothing about anybody.
--
-- Writes are unchanged: super admin only (v78).
--
-- Depends on: v78.
-- Verification and rollback statements are at the bottom of the file.
-- =============================================================================

BEGIN;

ALTER TABLE public.home_scene_setting
  ADD COLUMN IF NOT EXISTS show_on_portal boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS home_scene_setting_select ON public.home_scene_setting;
CREATE POLICY home_scene_setting_select ON public.home_scene_setting
  FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.home_scene_setting TO anon;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
--   SELECT show_on_portal FROM public.home_scene_setting;   -- false
--   As anon: SELECT scene FROM public.home_scene_setting;   -- one row
--   As anon: UPDATE public.home_scene_setting SET scene='x'; -- refused
--
-- Rollback
--   DROP POLICY IF EXISTS home_scene_setting_select ON public.home_scene_setting;
--   CREATE POLICY home_scene_setting_select ON public.home_scene_setting
--     FOR SELECT TO authenticated USING ((SELECT public.is_active_staff()));
--   REVOKE SELECT ON public.home_scene_setting FROM anon;
--   ALTER TABLE public.home_scene_setting DROP COLUMN IF EXISTS show_on_portal;
-- -----------------------------------------------------------------------------
