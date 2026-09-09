-- =============================================================================
-- v53 -- the avatar people can actually keep, and a face for the staff app
--
-- WHAT CHANGES
--
-- 1. portal_instructor_looks gains shape/pattern/ring, and its icon_key and
--    palette_key CHECKs stop being enums.
-- 2. A new table, portal_avatar_prefs -- where a family's own avatar is stored.
--    It has never been stored anywhere.
-- 3. profiles gains avatar_path.
-- 4. A new private bucket, staff-photos.
--
-- ---------------------------------------------------------------------------
-- 1. WHY THE ENUMS COME OUT, HAVING BEEN PUT IN DELIBERATELY IN v46
-- ---------------------------------------------------------------------------
--
-- v46 wrote icon_key and palette_key as enum CHECKs listing the six icons and
-- eight colours that existed, on the reasoning that every column should mirror
-- a constant in src/lib/avatarPalette.ts. That reasoning is sound and the
-- mechanism is not: the set grew to thirty icons and sixteen colours, the
-- picker offers all of them, and the database would refuse to store any of the
-- new ones. A save the database rejects is exactly the failure v46's own header
-- calls the unsafe direction, arrived at by a route it did not anticipate --
-- not the policy drifting from the UI, but the UI outgrowing the CHECK.
--
-- Worse, it fails at the WORST moment. The constraint and the bundle have to
-- land together, so a deploy that ships an icon before its migration turns
-- every save by every admin into 23514 until somebody notices.
--
-- The enum is therefore replaced by a FORMAT check -- a short lowercase slug.
-- What the enum was actually buying, in each of its two jobs:
--
--   Taste. "Not white-on-yellow" is enforced by the picker only ever offering
--   curated pairs, which is where it was always enforced; the CHECK never saw
--   a colour it had to reject that the UI had not already refused to offer.
--
--   Safety. Nil. These two columns are LOOKUP KEYS. paletteEntry() falls back
--   for an unknown key and ICON_PATHS[k] ?? star does the same, both by
--   design, because an installed phone that has not reloaded is routinely
--   behind the database. Neither value is ever interpolated into markup, CSS
--   or a URL. An unrecognised slug renders the default and nothing else.
--
-- The columns that ARE rendered as text keep their tight CHECKs, and gain them
-- where they are new: initials stays ^[A-Z]{0,2}$, and display_name is length-
-- and control-character-checked. That is where the real boundary is.
--
-- shape and pattern DO get enums, and the difference is that they are closed by
-- the renderer rather than by taste: each value is a branch in ProfileAvatar,
-- three and six of them, and a seventh cannot be added by picking a nicer name.
--
-- ---------------------------------------------------------------------------
-- 2. WHY A FAMILY'S AVATAR GETS ITS OWN TABLE
-- ---------------------------------------------------------------------------
--
-- The obvious home is portal_household_members: it already has a unique
-- profile_id and it already has RLS. It is the wrong home, and dangerously so.
-- That table is an AUTHORIZATION record -- member_type and student_id are what
-- decide whether a login sees one dancer or a whole family. Letting a client
-- UPDATE its own row there to change a colour would let it change those two as
-- well, because Postgres does not split one table's columns across two
-- policies. v46 hit the same wall from the other side and wrote it down.
--
-- So: a new table, whose entire contents are decoration, whose boundary is
-- therefore free to be "your own row and no other", and where the worst thing a
-- crafted request can do is give itself an ugly avatar.
--
-- Nobody else can read it. A sibling's mark on the dashboard is drawn from a
-- deterministic hash of the child's name (HouseholdCard), not from this table,
-- so no cross-household read is needed to render anything.
--
-- ---------------------------------------------------------------------------
-- 3. WHY STAFF PHOTOS GET A BUCKET OF THEIR OWN
-- ---------------------------------------------------------------------------
--
-- portal-documents is the obvious place and it is the one place this must not
-- go. Its portal_docs_read policy lets anon SELECT -- that is how a signed URL
-- works for a parent who is only holding a studio code -- so an object in it
-- can be signed by anybody who knows its key. A staff photograph is not a
-- parent-facing asset and the owner's decision was explicitly "staff app only".
--
-- staff-photos is private, readable only by public.is_active_staff(), and
-- writable only inside the writer's own uid folder. A parent has an account and
-- is `authenticated`, so `authenticated` is NOT the right read test here; that
-- distinction is the whole point of the bucket.
--
-- profiles.avatar_path holds the object KEY, not a URL. A signed URL expires,
-- so a stored one rots; the app signs on read. avatar_url is left alone -- it
-- is unused on all 44 rows and naming a storage key "url" would be a lie the
-- next reader has to discover.
--
-- Depends on: v46 (portal_instructor_looks), v13 (is_super_admin),
--             public.is_active_staff, public.profiles.
--
-- Verification and rollback statements are at the bottom of the file.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The teacher mark catches up with the picker
-- -----------------------------------------------------------------------------

ALTER TABLE public.portal_instructor_looks
  DROP CONSTRAINT IF EXISTS portal_instructor_looks_icon_key_check,
  DROP CONSTRAINT IF EXISTS portal_instructor_looks_palette_key_check;

ALTER TABLE public.portal_instructor_looks
  ADD CONSTRAINT portal_instructor_looks_icon_key_check
    CHECK (icon_key ~ '^[a-z][a-z0-9_]{0,31}$'),
  ADD CONSTRAINT portal_instructor_looks_palette_key_check
    CHECK (palette_key ~ '^[a-z][a-z0-9_]{0,31}$');

-- Defaults chosen to reproduce the tile these rows already draw, so the three
-- stored looks are unchanged by this migration and need no backfill.
ALTER TABLE public.portal_instructor_looks
  ADD COLUMN IF NOT EXISTS shape text NOT NULL DEFAULT 'rounded',
  ADD COLUMN IF NOT EXISTS pattern text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS ring boolean NOT NULL DEFAULT false;

ALTER TABLE public.portal_instructor_looks
  DROP CONSTRAINT IF EXISTS portal_instructor_looks_shape_check,
  DROP CONSTRAINT IF EXISTS portal_instructor_looks_pattern_check;

ALTER TABLE public.portal_instructor_looks
  ADD CONSTRAINT portal_instructor_looks_shape_check
    CHECK (shape IN ('rounded', 'circle', 'squircle')),
  ADD CONSTRAINT portal_instructor_looks_pattern_check
    CHECK (pattern IN ('none', 'duotone', 'dots', 'stripes', 'confetti', 'spotlight'));

-- -----------------------------------------------------------------------------
-- 2. Where a family's own avatar lives
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.portal_avatar_prefs (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,

  mode text NOT NULL DEFAULT 'initials'
    CHECK (mode IN ('initials', 'icon')),

  -- Rendered as text, so checked as text. Empty means "use the name", which is
  -- the same convention portal_instructor_looks.initials already carries.
  initials text NOT NULL DEFAULT ''
    CHECK (initials ~ '^[A-Z]{0,2}$'),

  icon_key text NOT NULL DEFAULT 'star'
    CHECK (icon_key ~ '^[a-z][a-z0-9_]{0,31}$'),
  palette_key text NOT NULL DEFAULT 'violet'
    CHECK (palette_key ~ '^[a-z][a-z0-9_]{0,31}$'),

  shape text NOT NULL DEFAULT 'rounded'
    CHECK (shape IN ('rounded', 'circle', 'squircle')),
  pattern text NOT NULL DEFAULT 'none'
    CHECK (pattern IN ('none', 'duotone', 'dots', 'stripes', 'confetti', 'spotlight')),
  ring boolean NOT NULL DEFAULT false,

  -- The household nickname (§5.3). Bounded and control-character free because
  -- unlike every key above it is displayed verbatim. It is deliberately NOT the
  -- roster name: rosters, attendance and invoices always use the enrolment name
  -- from Enrolio, because the studio has to match a child to a paid
  -- registration and "Bug" is not on the invoice.
  display_name text NOT NULL DEFAULT ''
    CHECK (length(display_name) <= 24 AND display_name !~ '[[:cntrl:]]'),

  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_avatar_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_avatar_prefs_own_read ON public.portal_avatar_prefs;
DROP POLICY IF EXISTS portal_avatar_prefs_own_write ON public.portal_avatar_prefs;

-- Your own row, and nobody else's, in either direction. No admin override:
-- there is nothing here the studio needs to see, and "the office can read it"
-- would be a claim about a child's chosen nickname that nobody asked for.
CREATE POLICY portal_avatar_prefs_own_read
  ON public.portal_avatar_prefs
  FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY portal_avatar_prefs_own_write
  ON public.portal_avatar_prefs
  FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. The staff photo
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_path text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_avatar_path_check;

-- '<uid>/<filename>'. Same class of guard as v46's hero_path prefix: it
-- constrains what the app will try to SIGN, and the storage policies below are
-- what actually decide who may write where.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_path_check
    CHECK (
      avatar_path IS NULL
      OR avatar_path ~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9._-]{1,80}$'
    );

INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-photos', 'staff-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS staff_photos_read ON storage.objects;
DROP POLICY IF EXISTS staff_photos_write_own ON storage.objects;
DROP POLICY IF EXISTS staff_photos_update_own ON storage.objects;
DROP POLICY IF EXISTS staff_photos_delete_own ON storage.objects;

-- is_active_staff(), NOT `authenticated`. Every parent has an account, so
-- `authenticated` would put staff photographs one signed URL away from the
-- parent portal -- the exact thing this bucket exists to prevent.
CREATE POLICY staff_photos_read
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'staff-photos' AND public.is_active_staff());

CREATE POLICY staff_photos_write_own
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'staff-photos'
    AND public.is_active_staff()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY staff_photos_update_own
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'staff-photos'
    AND public.is_active_staff()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Your own, or an admin's, so an account can be cleaned up after somebody
-- leaves without needing their password.
CREATE POLICY staff_photos_delete_own
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'staff-photos'
    AND (
      ((storage.foldername(name))[1] = auth.uid()::text AND public.is_active_staff())
      OR public.is_admin()
    )
  );

COMMIT;

-- =============================================================================
-- VERIFY
-- =============================================================================
-- The three stored looks must be untouched, and all three new columns present:
--
--   select name_key, icon_key, palette_key, shape, pattern, ring
--     from public.portal_instructor_looks order by name_key;
--
-- The widened CHECK must accept an icon that did not exist in v46:
--
--   select 'tutu' ~ '^[a-z][a-z0-9_]{0,31}$' as accepts_new_icon;
--
-- The prefs table must refuse a row that is not yours. Run as a signed-in
-- client, NOT as service role, which bypasses RLS and would look like a pass:
--
--   insert into public.portal_avatar_prefs (profile_id) values (gen_random_uuid());
--
-- The bucket must exist and be private:
--
--   select id, public from storage.buckets where id = 'staff-photos';
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- begin;
--   drop table if exists public.portal_avatar_prefs;
--   alter table public.portal_instructor_looks
--     drop column if exists shape,
--     drop column if exists pattern,
--     drop column if exists ring;
--   alter table public.profiles drop column if exists avatar_path;
--   drop policy if exists staff_photos_read on storage.objects;
--   drop policy if exists staff_photos_write_own on storage.objects;
--   drop policy if exists staff_photos_update_own on storage.objects;
--   drop policy if exists staff_photos_delete_own on storage.objects;
--   -- Objects must be removed before the bucket will drop.
--   delete from storage.objects where bucket_id = 'staff-photos';
--   delete from storage.buckets where id = 'staff-photos';
--   -- NOTE: restoring the v46 enum CHECKs will FAIL if any row has since
--   -- stored one of the new icons or colours. Check first:
--   --   select name_key, icon_key, palette_key from public.portal_instructor_looks;
-- commit;
