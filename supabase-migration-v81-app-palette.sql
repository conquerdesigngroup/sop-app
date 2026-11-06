-- =============================================================================
-- v81 -- app colors: a holiday palette for the whole app
--
-- WHAT CHANGES
--
-- home_scene_setting (v78) gains two columns, beside the Home background it
-- already holds:
--
--   palette          'electric' (the everyday DIDC pink) or a palette id from
--                    src/lib/appPalettes.ts ('christmas', 'halloween', ...).
--   palette_ends_on  last day the palette shows; the morning after, the app
--                    goes back to electric on its own. NULL = until switched.
--
-- A palette only swaps the accent colour (buttons, active tabs, links, focus
-- rings). Surfaces and text are untouched, in light and dark mode.
--
-- Reads already work for everyone, anon included, since v79 (the front door
-- and login screens wear the palette too), and writes stay super admin only
-- (v78), so this is two columns and nothing else. Before it is applied the
-- app reads the missing columns as "electric", so shipping the code first is
-- safe.
--
-- palette is free text for the same reason scene is: palettes are code, and
-- an old build reading a newer id falls back to electric.
--
-- Depends on: v78, v79.
-- =============================================================================

BEGIN;

ALTER TABLE public.home_scene_setting
  ADD COLUMN IF NOT EXISTS palette text NOT NULL DEFAULT 'electric'
    CHECK (char_length(palette) BETWEEN 1 AND 40),
  ADD COLUMN IF NOT EXISTS palette_ends_on date;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
--   SELECT palette, palette_ends_on FROM public.home_scene_setting;  -- 'electric', NULL
--   As a manager (not super admin):
--     UPDATE public.home_scene_setting SET palette = 'halloween';   -- 0 rows
--
-- Rollback
--   ALTER TABLE public.home_scene_setting
--     DROP COLUMN IF EXISTS palette,
--     DROP COLUMN IF EXISTS palette_ends_on;
-- -----------------------------------------------------------------------------
