-- =============================================================================
-- v78 -- the Home background: a seasonal scene for staff Home
--
-- WHAT CHANGES
--
-- One new table, home_scene_setting, holding ONE row (id = 1): which
-- background every staff member's Home screen draws, and optionally the last
-- day it shows. The app reads it in src/hooks/useHomeScene.ts; a super admin
-- writes it in Settings -> Home background.
--
--   scene    'contours' (the everyday field) or a scene id from
--            src/lib/homeScenes.ts ('snow', 'village', 'lights', ...).
--   ends_on  last day the scene shows; the morning after, Home goes back to
--            the contour field on its own. NULL = until switched off.
--
-- Nothing existing moves. With this applied and no row written, Home looks
-- exactly as it does today. Before it is applied, the app treats the missing
-- table as "no seasonal scene", so shipping the code first is safe.
--
-- WHY scene IS FREE TEXT AND NOT A CHECK LIST
--
-- Scenes are code. A CHECK of known ids would mean a migration for every new
-- scene, and an old build reading a newer id already falls back to the
-- contour field (effectiveSceneId). The length check only stops junk.
--
-- WHO MAY DO WHAT
--
--   read   any active staff member (everyone whose Home draws it)
--   write  super admin only, as the owner asked
--
-- Depends on: v13 (public.is_super_admin), v77 (public.is_active_staff).
-- Verification and rollback statements are at the bottom of the file.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.home_scene_setting (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  scene       text NOT NULL DEFAULT 'contours' CHECK (char_length(scene) BETWEEN 1 AND 40),
  ends_on     date,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.home_scene_setting ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_scene_setting_select ON public.home_scene_setting;
DROP POLICY IF EXISTS home_scene_setting_insert ON public.home_scene_setting;
DROP POLICY IF EXISTS home_scene_setting_update ON public.home_scene_setting;

CREATE POLICY home_scene_setting_select ON public.home_scene_setting
  FOR SELECT TO authenticated
  USING ((SELECT public.is_active_staff()));

CREATE POLICY home_scene_setting_insert ON public.home_scene_setting
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_super_admin()));

CREATE POLICY home_scene_setting_update ON public.home_scene_setting
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

-- Whoever saved it, whatever the client sent.
CREATE OR REPLACE FUNCTION public.home_scene_setting_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS home_scene_setting_stamp ON public.home_scene_setting;
CREATE TRIGGER home_scene_setting_stamp
  BEFORE INSERT OR UPDATE ON public.home_scene_setting
  FOR EACH ROW EXECUTE FUNCTION public.home_scene_setting_stamp();

REVOKE ALL ON public.home_scene_setting FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.home_scene_setting TO authenticated;

INSERT INTO public.home_scene_setting (id, scene) VALUES (1, 'contours')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
--   SELECT * FROM public.home_scene_setting;           -- one row, 'contours'
--   As a manager (not super admin):
--     UPDATE public.home_scene_setting SET scene = 'snow';   -- 0 rows
--
-- Rollback
--   DROP TABLE IF EXISTS public.home_scene_setting;
--   DROP FUNCTION IF EXISTS public.home_scene_setting_stamp();
-- -----------------------------------------------------------------------------
