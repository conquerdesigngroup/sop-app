-- =============================================================================
-- v9 — parent portal schema
--
-- STATUS: APPLIED to prod 2026-08-21 (project sgppeenmvskwztaszkgn), as four
--         migrations: v9_portal_tables, v9_portal_functions, v9_portal_rls,
--         v9_portal_storage_and_seed.
--
-- NOTE FOR ANYONE RE-RUNNING THIS BY HAND: sections 1-9 create the tables and
-- section 11 turns RLS on. Do not stop in between. Supabase grants
-- SELECT/INSERT/UPDATE/DELETE to `anon` by default on new tables in `public`,
-- so between those two points every portal table — including
-- portal_access_codes — is world-writable. That window happened during the
-- original apply and was closed immediately; section 11 now also REVOKEs the
-- write grants outright rather than relying on RLS alone.
-- =============================================================================
--
-- Adds the client-facing content model: programs, classes, updates, documents
-- and events, plus the per-class instructor grants that let a teacher publish to
-- their own class and nothing else.
--
-- WHAT IS DIFFERENT ABOUT THESE TABLES
--
-- Every other table in this schema is staff-only. These are the ONLY tables the
-- `anon` role can read, and they are readable deliberately: the portal has no
-- login. v8 closed the accidental anon access on profiles and sops precisely so
-- that this surface is the intentional one rather than one of several.
--
-- CONSEQUENCE — WHAT MUST NOT GO IN HERE
--
-- The studio access code is a soft gate. It is verified against a bcrypt hash
-- that never leaves the database (verify_portal_code below), which is far better
-- than a constant in the JS bundle — but the CONTENT is still readable by anyone
-- who has the anon key, and the anon key ships in the public bundle. The code
-- stops casual browsing. It does not stop a determined person.
--
-- So: class schedules, studio announcements, policies, costume lists, music,
-- event dates — fine. Student names, parent contact details, medical notes,
-- payment information — NOT in these tables. Billing lives in Enrollio.
--
-- Upgrading to a real gate later is a policy swap, not a rewrite: change the
-- `TO anon, authenticated` SELECT policies below to require a claim, and have
-- verify_portal_code mint a scoped session. No table or component changes.
--
-- Depends on: v6 (public.is_admin), v8 (anon access closed elsewhere).
-- Apply in the Supabase SQL editor, same as v6/v7/v8.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Programs — the three compartments of the studio (two of them live here;
--    Billing & Admin is an external link to Enrollio and has no row).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_programs (
  id            uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  -- Matches the ProgramSlug union in src/lib/portal.ts, which is what the
  -- router validates against. The DB owns the display strings so a rename does
  -- not need a deploy; the code owns only the slug, which routes depend on.
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name          text NOT NULL CHECK (btrim(name) <> ''),
  blurb         text NOT NULL DEFAULT '',
  requires_code boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Access codes — separate table on purpose.
--
--    This is the one portal table with NO policy of any kind. RLS is enabled and
--    nothing grants access, so it is unreachable through PostgREST by anon,
--    authenticated, admin, anyone. The only path to it is verify_portal_code(),
--    which is SECURITY DEFINER. Keeping the hash in its own table rather than a
--    column on portal_programs means no future "select *" on programs can ever
--    leak it.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_access_codes (
  program_id uuid PRIMARY KEY REFERENCES public.portal_programs(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. Classes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_classes (
  id           uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id   uuid NOT NULL REFERENCES public.portal_programs(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (btrim(name) <> ''),
  -- 0 = Sunday, matching JS Date.getDay(). NULL for classes with no fixed day.
  day_of_week  smallint CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   time,
  end_time     time,
  level        text,
  location     text,
  description  text NOT NULL DEFAULT '',
  -- Display name only ("Miss Sarah"). Deliberately NOT a profile FK: who is
  -- shown to parents and who may edit the class are different questions, and
  -- the second one is portal_class_instructors below.
  instructor_name text,
  sort_order   integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_classes_time_order
    CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time)
);

-- -----------------------------------------------------------------------------
-- 4. Instructor grants — which staff may publish to which class.
--
--    A junction table rather than a new role: profiles.role is constrained to
--    CHECK (role IN ('admin','team')), and altering that constraint to add a
--    'teacher' role would still not express "this teacher, that class".
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_class_instructors (
  class_id   uuid NOT NULL REFERENCES public.portal_classes(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, profile_id)
);

-- -----------------------------------------------------------------------------
-- 5. Updates — announcements, program-wide or per class.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_updates (
  id           uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id   uuid NOT NULL REFERENCES public.portal_programs(id) ON DELETE CASCADE,
  -- NULL = program-wide. Only admins may write those; a teacher's reach is
  -- bounded by the classes they are assigned to.
  class_id     uuid REFERENCES public.portal_classes(id) ON DELETE CASCADE,
  title        text NOT NULL CHECK (btrim(title) <> ''),
  body         text NOT NULL DEFAULT '',
  is_pinned    boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  author_id    uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 6. Events — the portal calendar.
--
--    Deliberately NOT the existing calendar_events table. That one stores dates
--    as text and is staff-scoped; reusing it would mean opening a staff table to
--    anon, where one policy slip leaks internal scheduling. A separate table has
--    no blast radius on existing data.
--
--    timestamptz, not text. The text-date pattern in calendar_events is what
--    caused the local-date parsing bug fixed in 721b48f.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_events (
  id           uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id   uuid NOT NULL REFERENCES public.portal_programs(id) ON DELETE CASCADE,
  class_id     uuid REFERENCES public.portal_classes(id) ON DELETE SET NULL,
  title        text NOT NULL CHECK (btrim(title) <> ''),
  description  text NOT NULL DEFAULT '',
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz,
  is_all_day   boolean NOT NULL DEFAULT false,
  location     text,
  -- 'manual' rows are authored in the app. 'google' rows are owned by the
  -- phase-4 sync and will be overwritten by it; the sync never touches 'manual'.
  source       text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','google')),
  google_calendar_id text,
  google_event_id    text,
  is_published boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_events_date_order
    CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

-- One row per Google event, so the phase-4 sync can upsert idempotently.
CREATE UNIQUE INDEX IF NOT EXISTS portal_events_google_uniq
  ON public.portal_events (google_calendar_id, google_event_id)
  WHERE source = 'google';

-- -----------------------------------------------------------------------------
-- 7. Documents — files in Supabase Storage.
--
--    First use of Storage in this project. Existing image handling base64-encodes
--    into text columns (see ImageUpload.tsx); that is not viable for the PDFs
--    parents need, and should not be copied here.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_documents (
  id           uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id   uuid NOT NULL REFERENCES public.portal_programs(id) ON DELETE CASCADE,
  class_id     uuid REFERENCES public.portal_classes(id) ON DELETE CASCADE,
  title        text NOT NULL CHECK (btrim(title) <> ''),
  description  text NOT NULL DEFAULT '',
  category     text,
  -- Object key inside the 'portal-documents' bucket.
  storage_path text NOT NULL UNIQUE,
  file_name    text NOT NULL,
  mime_type    text,
  size_bytes   bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  sort_order   integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  uploaded_by  uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 8. Indexes — every FK plus the filters the portal actually queries on.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_portal_classes_program   ON public.portal_classes (program_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_portal_ci_profile        ON public.portal_class_instructors (profile_id);
CREATE INDEX IF NOT EXISTS idx_portal_updates_program   ON public.portal_updates (program_id, is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_updates_class     ON public.portal_updates (class_id, is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_events_program    ON public.portal_events (program_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_portal_events_class      ON public.portal_events (class_id);
CREATE INDEX IF NOT EXISTS idx_portal_documents_program ON public.portal_documents (program_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_portal_documents_class   ON public.portal_documents (class_id);

-- -----------------------------------------------------------------------------
-- 9. updated_at triggers — reuse the function from supabase-schema.sql.
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'portal_programs','portal_classes','portal_updates','portal_events','portal_documents'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_%1$s_updated_at ON public.%1$s', t);
    EXECUTE format(
      'CREATE TRIGGER set_%1$s_updated_at BEFORE UPDATE ON public.%1$s
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- 10. Helper functions
-- =============================================================================

BEGIN;

-- Can the current user publish to this class?
--
-- SECURITY DEFINER so it can read portal_class_instructors and profiles without
-- being subject to their policies — the same reason v6 introduced is_admin(),
-- and what keeps the write policies below from recursing.
--
-- search_path is pinned: a SECURITY DEFINER function with a caller-controlled
-- search_path is a privilege-escalation primitive.
CREATE OR REPLACE FUNCTION public.can_edit_portal_class(target_class uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR (
        target_class IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.portal_class_instructors pci
          JOIN public.profiles p ON p.id = pci.profile_id
          WHERE pci.class_id = target_class
            AND pci.profile_id = auth.uid()
            AND p.is_active IS NOT FALSE
        )
      );
$$;

REVOKE ALL ON FUNCTION public.can_edit_portal_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_portal_class(uuid) TO authenticated;

-- Does the current user have portal authoring rights at all?
-- Used by the staff UI to decide whether to show the portal admin area.
CREATE OR REPLACE FUNCTION public.can_edit_portal()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.portal_class_instructors pci
        JOIN public.profiles p ON p.id = pci.profile_id
        WHERE pci.profile_id = auth.uid()
          AND p.is_active IS NOT FALSE
      );
$$;

REVOKE ALL ON FUNCTION public.can_edit_portal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_portal() TO authenticated;

-- Verify a studio access code.
--
-- The hash never leaves the database. The browser sends a candidate string and
-- gets back a boolean — it never receives anything it could work backwards from,
-- which is the whole reason portal_access_codes has no RLS policy and this
-- function is SECURITY DEFINER.
--
-- Granted to anon because parents are, by design, not signed in.
--
-- Returns true when the program does not require a code, so opening a section up
-- is a one-field change rather than handing out a shared secret.
--
-- extensions.crypt is referenced by schema: pgcrypto lives in `extensions` here,
-- and search_path is pinned to public.
CREATE OR REPLACE FUNCTION public.verify_portal_code(p_slug text, p_code text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_id    uuid;
  v_requires_code boolean;
  v_hash          text;
BEGIN
  SELECT id, requires_code
    INTO v_program_id, v_requires_code
  FROM public.portal_programs
  WHERE slug = p_slug AND is_active;

  IF v_program_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT v_requires_code THEN
    RETURN true;
  END IF;

  SELECT code_hash INTO v_hash
  FROM public.portal_access_codes
  WHERE program_id = v_program_id;

  -- Requires a code but none is configured: fail closed. Better that a section
  -- is unreachable and someone calls the front desk than that a
  -- misconfiguration silently opens it.
  IF v_hash IS NULL OR p_code IS NULL THEN
    RETURN false;
  END IF;

  RETURN extensions.crypt(p_code, v_hash) = v_hash;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_portal_code(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_portal_code(text, text) TO anon, authenticated;

-- Set or change a program's access code. Admin only, enforced inside the
-- function because the table it writes to is unreachable by policy.
-- Cost factor 8: bcrypt at ~10ms per attempt, which makes the RPC an
-- unattractive brute-force target without making the gate feel slow.
CREATE OR REPLACE FUNCTION public.set_portal_code(p_slug text, p_code text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may set a portal access code';
  END IF;

  IF p_code IS NULL OR length(btrim(p_code)) < 4 THEN
    RAISE EXCEPTION 'Access code must be at least 4 characters';
  END IF;

  SELECT id INTO v_program_id FROM public.portal_programs WHERE slug = p_slug;
  IF v_program_id IS NULL THEN
    RAISE EXCEPTION 'Unknown program slug: %', p_slug;
  END IF;

  INSERT INTO public.portal_access_codes (program_id, code_hash, updated_by, updated_at)
  VALUES (v_program_id, extensions.crypt(btrim(p_code), extensions.gen_salt('bf', 8)), auth.uid(), now())
  ON CONFLICT (program_id) DO UPDATE
    SET code_hash = EXCLUDED.code_hash,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_portal_code(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_portal_code(text, text) TO authenticated;

COMMIT;

-- =============================================================================
-- 11. Row Level Security
-- =============================================================================
--
-- Read  — TO anon, authenticated, published/active rows only.
-- Write — admin for program-wide rows; admin or assigned instructor for rows
--         belonging to a class.
--
-- Every policy names its roles explicitly. The bug v8 fixed was a policy with no
-- TO clause silently applying to anon; on the one set of tables anon is meant to
-- reach, being explicit matters more, not less.
-- =============================================================================

BEGIN;

ALTER TABLE public.portal_programs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_access_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_classes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_class_instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_updates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_documents         ENABLE ROW LEVEL SECURITY;

-- Idempotent re-run: drop anything previously created on these tables so a
-- leftover permissive policy cannot OR its way past the ones below.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename LIKE 'portal\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Supabase grants INSERT/UPDATE/DELETE to anon by default on new public tables.
-- The policies above already deny them, but parents only ever read, so the
-- grants should not exist either. Two independent things have to be wrong
-- before anon can write, instead of one.
REVOKE INSERT, UPDATE, DELETE ON
  public.portal_programs, public.portal_access_codes, public.portal_classes,
  public.portal_class_instructors, public.portal_updates, public.portal_events,
  public.portal_documents
FROM anon;

-- The access-code table is reachable by nobody through PostgREST.
REVOKE ALL ON public.portal_access_codes FROM anon, authenticated;

-- --------------------------------------------------------------- programs
CREATE POLICY portal_programs_read ON public.portal_programs
  FOR SELECT TO anon, authenticated USING (is_active);

CREATE POLICY portal_programs_write ON public.portal_programs
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------- access codes
-- Intentionally no policies. RLS is on and nothing grants access, so the table
-- is unreachable through PostgREST by every role. verify_portal_code() and
-- set_portal_code() are SECURITY DEFINER and are the only way in.

-- --------------------------------------------------------------- classes
CREATE POLICY portal_classes_read ON public.portal_classes
  FOR SELECT TO anon, authenticated USING (is_active);

CREATE POLICY portal_classes_write ON public.portal_classes
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------- instructor grants
-- Staff data, not parent-facing: authenticated read, admin write.
CREATE POLICY portal_ci_read ON public.portal_class_instructors
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY portal_ci_write ON public.portal_class_instructors
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- --------------------------------------------------------------- updates
CREATE POLICY portal_updates_read ON public.portal_updates
  FOR SELECT TO anon, authenticated USING (is_published);

-- Staff see their own drafts too, so an unpublished update is editable.
CREATE POLICY portal_updates_read_staff ON public.portal_updates
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.can_edit_portal_class(class_id));

CREATE POLICY portal_updates_insert ON public.portal_updates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.can_edit_portal_class(class_id));

CREATE POLICY portal_updates_update ON public.portal_updates
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.can_edit_portal_class(class_id))
  -- Re-checked on the NEW row so a teacher cannot move an update onto a class
  -- they do not hold, or promote it to program-wide by nulling class_id.
  WITH CHECK (public.is_admin() OR public.can_edit_portal_class(class_id));

CREATE POLICY portal_updates_delete ON public.portal_updates
  FOR DELETE TO authenticated
  USING (public.is_admin() OR public.can_edit_portal_class(class_id));

-- ---------------------------------------------------------------- events
CREATE POLICY portal_events_read ON public.portal_events
  FOR SELECT TO anon, authenticated USING (is_published);

CREATE POLICY portal_events_read_staff ON public.portal_events
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.can_edit_portal_class(class_id));

CREATE POLICY portal_events_insert ON public.portal_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.can_edit_portal_class(class_id));

CREATE POLICY portal_events_update ON public.portal_events
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.can_edit_portal_class(class_id))
  WITH CHECK (public.is_admin() OR public.can_edit_portal_class(class_id));

CREATE POLICY portal_events_delete ON public.portal_events
  FOR DELETE TO authenticated
  USING (public.is_admin() OR public.can_edit_portal_class(class_id));

-- ------------------------------------------------------------- documents
CREATE POLICY portal_documents_read ON public.portal_documents
  FOR SELECT TO anon, authenticated USING (is_published);

CREATE POLICY portal_documents_read_staff ON public.portal_documents
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.can_edit_portal_class(class_id));

CREATE POLICY portal_documents_insert ON public.portal_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.can_edit_portal_class(class_id));

CREATE POLICY portal_documents_update ON public.portal_documents
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.can_edit_portal_class(class_id))
  WITH CHECK (public.is_admin() OR public.can_edit_portal_class(class_id));

CREATE POLICY portal_documents_delete ON public.portal_documents
  FOR DELETE TO authenticated
  USING (public.is_admin() OR public.can_edit_portal_class(class_id));

COMMIT;

-- =============================================================================
-- 12. Storage — the portal-documents bucket
-- =============================================================================
--
-- Private bucket read through signed URLs rather than a public bucket. Same
-- practical exposure today (anon may read), but files are not permanently
-- hot-linkable, and revoking parent access later is one policy drop instead of
-- re-uploading everything.
-- =============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portal-documents',
  'portal-documents',
  false,
  26214400,  -- 25 MB; these are handouts and PDFs, not video
  ARRAY[
    'application/pdf',
    'image/jpeg','image/png','image/webp','image/heic',
    'audio/mpeg','audio/mp4',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS portal_docs_read     ON storage.objects;
DROP POLICY IF EXISTS portal_docs_insert   ON storage.objects;
DROP POLICY IF EXISTS portal_docs_update   ON storage.objects;
DROP POLICY IF EXISTS portal_docs_delete   ON storage.objects;

CREATE POLICY portal_docs_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'portal-documents');

-- Any portal author may upload; which class a file belongs to is enforced on
-- the portal_documents row, and an orphaned object with no row is invisible.
CREATE POLICY portal_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'portal-documents' AND public.can_edit_portal());

CREATE POLICY portal_docs_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'portal-documents' AND public.can_edit_portal())
  WITH CHECK (bucket_id = 'portal-documents' AND public.can_edit_portal());

CREATE POLICY portal_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'portal-documents' AND public.can_edit_portal());

COMMIT;

-- =============================================================================
-- 13. Seed the two programs
-- =============================================================================

BEGIN;

INSERT INTO public.portal_programs (slug, name, blurb, sort_order, requires_code)
VALUES
  ('allstars', 'All-Star Dancers',      'Competition team schedules, updates and documents', 1, true),
  ('academy',  'Academy / TNT Dancers', 'Class schedules, updates and documents',            2, true)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      blurb = EXCLUDED.blurb,
      sort_order = EXCLUDED.sort_order;

COMMIT;

-- =============================================================================
-- SET THE ACCESS CODES  ←  REQUIRED BEFORE EITHER SECTION OPENS
-- =============================================================================
--
-- Both programs ship with requires_code = true and NO code row, so
-- verify_portal_code() fails closed and neither section is reachable yet. That
-- is deliberate: a misconfiguration should lock the door, not leave it open.
--
-- Run this as an ADMIN (set_portal_code checks is_admin(), so it must be run
-- from a signed-in admin session, not the SQL editor's service role):
--
--   SELECT public.set_portal_code('allstars', 'your-allstars-code');
--   SELECT public.set_portal_code('academy',  'your-academy-code');
--
-- To open a section with no code at all:
--
--   UPDATE public.portal_programs SET requires_code = false WHERE slug = 'academy';
--
-- =============================================================================
-- VERIFY
-- =============================================================================
--
-- 1. anon reads exactly the portal tables and nothing else. Counts should be
--    non-zero only for portal_programs (2) and whatever content exists:
--
--      BEGIN;
--      SET LOCAL ROLE anon;
--      SET LOCAL request.jwt.claims TO '';
--        SELECT 'portal_programs' t, count(*) FROM public.portal_programs
--        UNION ALL SELECT 'portal_classes',   count(*) FROM public.portal_classes
--        UNION ALL SELECT 'portal_updates',   count(*) FROM public.portal_updates
--        UNION ALL SELECT 'profiles',         count(*) FROM public.profiles;
--      ROLLBACK;
--
-- 2. The access-code table is unreachable even for a superuser-less role:
--
--      BEGIN;
--      SET LOCAL ROLE anon;
--        SELECT count(*) FROM public.portal_access_codes;   -- 0 rows, RLS denies
--      ROLLBACK;
--
-- 3. A teacher may write to their class and NOT to another. See the probe in
--    the phase-3 notes; the WITH CHECK on portal_updates_update is the one that
--    stops an update being moved onto a class the teacher does not hold.
--
-- =============================================================================
