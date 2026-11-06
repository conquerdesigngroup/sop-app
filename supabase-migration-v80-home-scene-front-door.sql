-- =============================================================================
-- v80 -- the Home background on the front door too
--
-- WHAT CHANGES
--
-- home_scene_setting gains show_on_chooser (default false). When true, the
-- seasonal scene a super admin picked for staff Home replaces the refracted
-- glass behind the front door, the Staff / Parent page at "/"
-- (ChooserScene in src/components/HomeScene.tsx).
--
-- Reads already work for anon since v79, and writes stay super admin only
-- (v78), so this is a column and nothing else.
--
-- Depends on: v78, v79.
-- =============================================================================

BEGIN;

ALTER TABLE public.home_scene_setting
  ADD COLUMN IF NOT EXISTS show_on_chooser boolean NOT NULL DEFAULT false;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
--   SELECT show_on_chooser FROM public.home_scene_setting;   -- false
--
-- Rollback
--   ALTER TABLE public.home_scene_setting DROP COLUMN IF EXISTS show_on_chooser;
-- -----------------------------------------------------------------------------
