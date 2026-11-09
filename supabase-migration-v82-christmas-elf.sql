-- =============================================================================
-- v82 -- the Christmas elf: a hide-and-seek elf a super admin switches on
--
-- WHAT CHANGES
--
-- home_scene_setting (v78) gains three columns, beside the Home background
-- and the app palette it already holds:
--
--   elf_enabled    he is out (hiding somewhere in the app each day).
--   elf_ends_on    last day he hides; the morning after he goes home on his
--                  own. NULL = until switched off.
--   elf_on_portal  parents can find him on the parent portal too.
--
-- Where he hides each day and whether someone has found him are not stored:
-- the hiding place is worked out from the date in src/lib/elfScout.ts, so
-- every device agrees, and "found" is remembered on the device until midnight.
--
-- Reads already work for everyone, anon included, since v79, and writes stay
-- super admin only (v78), so this is three columns and nothing else. Before it
-- is applied the app reads the missing columns as "off", so shipping the code
-- first is safe.
--
-- Depends on: v78, v79.
-- =============================================================================

BEGIN;

ALTER TABLE public.home_scene_setting
  ADD COLUMN IF NOT EXISTS elf_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS elf_ends_on date,
  ADD COLUMN IF NOT EXISTS elf_on_portal boolean NOT NULL DEFAULT false;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification
--   SELECT elf_enabled, elf_ends_on, elf_on_portal FROM public.home_scene_setting;  -- false, NULL, false
--   As a manager (not super admin):
--     UPDATE public.home_scene_setting SET elf_enabled = true;   -- 0 rows
--
-- Rollback
--   ALTER TABLE public.home_scene_setting
--     DROP COLUMN IF EXISTS elf_enabled,
--     DROP COLUMN IF EXISTS elf_ends_on,
--     DROP COLUMN IF EXISTS elf_on_portal;
-- -----------------------------------------------------------------------------
