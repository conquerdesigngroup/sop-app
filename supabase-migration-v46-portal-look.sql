-- =============================================================================
-- v46 -- the portal's look: a picture on a program, a mark on a teacher
--
-- WHAT CHANGES
--
-- 1. portal_programs gains hero_path and hero_alt -- a picture for the top of
--    a program's page, held as an object key in the existing portal-documents
--    bucket.
-- 2. A new table, portal_instructor_looks, holding one avatar per teacher NAME.
--
-- Nothing existing moves. Both are additive and both are optional: with this
-- migration applied and no rows written, every screen looks exactly as it does
-- today, because the app draws a deterministic default when there is no row.
--
-- WHY THE TEACHER LOOK IS KEYED BY NAME AND NOT BY PROFILE
--
-- portal_classes.instructor_name is free text. It is not a foreign key to
-- anybody -- that was true in v9 and is still true after v44 gave teachers
-- their grants, because portal_class_instructors answers "who may edit this"
-- and not "whose name is printed on the schedule". Nine of the studio's
-- teachers have accounts and at least one does not.
--
-- So the key is normalizeName(instructor_name) from src/lib/instructorMatch.ts
-- -- the same fold the bulk-assign screen already matches on, which means
-- "Ky'Ree" and "Kyree" get one look rather than two. Keying on profile_id
-- instead would leave every account-less teacher unstyleable, which is the
-- wrong half of the studio to drop.
--
-- WHO MAY WRITE WHAT, AND THE ONE ASYMMETRY
--
-- portal_instructor_looks is a new table so its boundary is free to set, and
-- it is set where the owner asked for it: is_super_admin(). Reads are open to
-- anon, because a parent who is not signed in still sees the schedule.
--
-- The hero columns are NOT narrowed to super admin, and this is worth being
-- explicit about rather than quietly inconsistent. They live on
-- portal_programs, whose portal_programs_write policy is FOR ALL USING
-- is_admin(), and Postgres does not split one table's columns across two
-- policies -- doing it with column-level GRANTs means revoking the table-level
-- UPDATE and re-granting every other column by name, which then silently fails
-- open for every column a later migration adds. So the database rule for the
-- hero stays is_admin(), while the editor that offers it is super-admin only.
--
-- That is the UI being STRICTER than the policy, which is the safe direction:
-- nobody is shown a control whose save will be refused. The unsafe direction --
-- offering a save the database rejects -- is what src/lib/roles.ts exists to
-- prevent, and this is not that.
--
-- WHY hero_path IS CONSTRAINED TO A PREFIX
--
-- The hero is signed and rendered on a page anon can open. Any object key in
-- portal-documents can be signed by whoever can write the row, so an unchecked
-- hero_path is a way to put a specific family's uploaded document on the front
-- of a program page -- by mistake, or on purpose. The CHECK keeps hero objects
-- in their own 'programs/' prefix, where nothing private is ever written.
--
-- This is a guard on what the app will display, not a storage boundary: the
-- bucket's own portal_docs_read policy already lets anon SELECT, which is how
-- signed URLs work for parents at all. The point is that the program page
-- cannot be pointed at a class's private file.
--
-- Depends on: v13 (public.is_super_admin), v9 (portal_programs, the bucket).
--
-- Verification and rollback statements are at the bottom of the file.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The program hero
-- -----------------------------------------------------------------------------

ALTER TABLE public.portal_programs
  ADD COLUMN IF NOT EXISTS hero_path text,
  -- Written by the person who uploads the picture, never generated. A hero is
  -- decorative for most readers and load-bearing for one, and "program hero
  -- image" is not a description of anything.
  ADD COLUMN IF NOT EXISTS hero_alt text;

-- Separate statement so a re-run on a database that already has the columns
-- still installs the constraint.
ALTER TABLE public.portal_programs
  DROP CONSTRAINT IF EXISTS portal_programs_hero_path_prefix;

ALTER TABLE public.portal_programs
  ADD CONSTRAINT portal_programs_hero_path_prefix
  CHECK (hero_path IS NULL OR hero_path ~ '^programs/[A-Za-z0-9._/-]+$');

-- -----------------------------------------------------------------------------
-- 2. The teacher's mark
--
-- Every column mirrors a constant in src/lib/avatarPalette.ts, and the CHECKs
-- are the third place that list is enforced -- the picker only offers them, and
-- validateAvatar() re-checks on the write path. Three, not two, because this
-- table is readable by anon and a bad palette key here is a broken colour on
-- every parent's schedule rather than one person's own profile.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.portal_instructor_looks (
  -- normalizeName(instructor_name). Lower case, no punctuation, single spaces.
  name_key     text PRIMARY KEY CHECK (btrim(name_key) <> ''),
  -- The name as the schedule spells it, so the editor can list the teachers a
  -- person recognises rather than the folded keys.
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  mode         text NOT NULL DEFAULT 'initials' CHECK (mode IN ('initials', 'icon')),
  -- Empty means "use the initials of the name", which is the default the app
  -- computes. Two letters maximum, matching validateAvatar.
  initials     text NOT NULL DEFAULT '' CHECK (initials ~ '^[A-Z]{0,2}$'),
  icon_key     text NOT NULL DEFAULT 'star'
                 CHECK (icon_key IN ('star', 'bolt', 'heart', 'note', 'shoe', 'flame')),
  palette_key  text NOT NULL
                 CHECK (palette_key IN ('electric', 'violet', 'teal', 'cobalt',
                                        'amber', 'rose', 'moss', 'slate')),
  updated_by   uuid REFERENCES auth.users(id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_instructor_looks ENABLE ROW LEVEL SECURITY;

-- Idempotent re-run: drop first so a leftover permissive policy cannot OR its
-- way past these. Same pattern as v9.
DROP POLICY IF EXISTS portal_instructor_looks_read  ON public.portal_instructor_looks;
DROP POLICY IF EXISTS portal_instructor_looks_write ON public.portal_instructor_looks;

-- No is_active filter and no USING clause worth writing: the whole table is a
-- handful of rows of colour, and a parent who is not signed in sees the
-- schedule these belong to.
CREATE POLICY portal_instructor_looks_read ON public.portal_instructor_looks
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY portal_instructor_looks_write ON public.portal_instructor_looks
  FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

COMMIT;

-- =============================================================================
-- VERIFY
--
--   -- The columns and the prefix guard exist:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'portal_programs'
--      AND column_name IN ('hero_path', 'hero_alt');        -- two rows
--
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.portal_programs'::regclass
--      AND conname = 'portal_programs_hero_path_prefix';    -- one row
--
--   -- The guard actually refuses a path outside the prefix:
--   --   UPDATE public.portal_programs SET hero_path = 'classes/x/secret.pdf';
--   --   ERROR:  new row ... violates check constraint
--
--   -- Both policies are on, and only the read one reaches anon:
--   SELECT policyname, roles, cmd FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'portal_instructor_looks';
--   -- portal_instructor_looks_read  {anon,authenticated} SELECT
--   -- portal_instructor_looks_write {authenticated}      ALL
--
--   -- Existing programs are untouched and still readable by anon:
--   SELECT slug, name, hero_path IS NULL AS no_hero FROM public.portal_programs
--    ORDER BY sort_order;                       -- both rows, no_hero true
--
-- ROLLBACK
--
--   BEGIN;
--   DROP TABLE IF EXISTS public.portal_instructor_looks;
--   ALTER TABLE public.portal_programs
--     DROP CONSTRAINT IF EXISTS portal_programs_hero_path_prefix;
--   ALTER TABLE public.portal_programs
--     DROP COLUMN IF EXISTS hero_path,
--     DROP COLUMN IF EXISTS hero_alt;
--   COMMIT;
--
--   NOTE: this drops the pictures' addresses, not the pictures. The objects
--   stay in portal-documents under programs/ and have to be removed from the
--   bucket separately if that is what you want.
-- =============================================================================
