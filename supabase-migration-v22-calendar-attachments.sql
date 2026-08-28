-- =============================================================================
-- v22 — links and files on a calendar event
-- =============================================================================
--
-- WHAT THIS ADDS
--
-- Staff can hang a hyperlink or a file (a flyer, a schedule, a photo) on any
-- calendar event, and whoever can see the event can open it. An address
-- already had a home: the editor's Location field, which round-trips to Google
-- like the title does. This is for the two things Google cannot carry for us.
--
-- WHY IT IS NOT A COLUMN ON calendar_events
--
-- Two reasons, and the second is the load-bearing one.
--
--   1. There can be more than one. A competition has a schedule AND a map.
--
--   2. THE STAFF CALENDAR AND THE PARENT PORTAL ARE DIFFERENT TABLES. Events
--      live in calendar_events for staff and portal_events for parents, both
--      filled from the same Google calendars by two different syncs. A column
--      on one is invisible to the other. What the two DO share is the pair
--      (google_calendar_id, google_event_id) — identical values in both since
--      v21 keyed them on iCalUID — so attachments hang off that pair and both
--      sides find them with the same lookup.
--
-- WHY THE SYNC DOES NOT WIPE THIS
--
-- staff_sync_google_events upserts an explicit column list. Anything outside
-- it survives, which is the same reason google_api_event_id survives. Nothing
-- here touches calendar_events at all, so the every-minute rewrite cannot
-- disturb it.
--
-- THE ONE REAL FOOTGUN
--
-- An attachment is keyed by the Google event id, so DELETING AN EVENT IN
-- GOOGLE AND RE-ADDING IT ORPHANS ITS ATTACHMENTS — the new event gets a new
-- id and the old rows point at something that no longer exists. That is not
-- theoretical: it is exactly what happens when the studio rebuilds a term's
-- calendar. Rebuild first, attach second.
--
-- Orphans are harmless (nothing joins to them) but they do keep their storage
-- objects. Section 5 leaves a query for finding them.
--
-- VISIBILITY FOLLOWS THE CALENDAR
--
-- A file on a Studio or All-Stars event is parent-visible; one on the Staff
-- calendar is not. That is already exactly how an event's title and details
-- behave, and inventing a second, different rule for files would be a trap —
-- someone would eventually assume the wrong one. Enforced in RLS below rather
-- than by the client choosing not to ask.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Which calendars are parent-facing
-- =============================================================================

-- SECURITY DEFINER on purpose. An anon RLS policy that reads
-- portal_calendar_sources directly gets nothing back — that table is revoked
-- from anon (v12), so the subquery would silently be empty and every parent
-- would see no attachments at all. This answers the one narrow question
-- without widening what anon can read.
CREATE OR REPLACE FUNCTION public.is_portal_calendar(p_calendar_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_calendar_sources
     WHERE google_calendar_id = p_calendar_id
       AND is_enabled
  );
$$;

COMMENT ON FUNCTION public.is_portal_calendar(text) IS
  'True when a Google calendar feeds a parent portal programme. Used by the attachment read policy so anon sees Studio and All-Stars but never Staff.';

-- =============================================================================
-- 2. The attachments
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.calendar_event_attachments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The event, named the way BOTH sides name it. Not a foreign key: there is
  -- no single table to point at, and a hard reference to calendar_events would
  -- be cascade-deleted every time the sync pruned a row that Google had merely
  -- moved out of the window.
  google_calendar_id text NOT NULL CHECK (btrim(google_calendar_id) <> ''),
  google_event_id    text NOT NULL CHECK (btrim(google_event_id) <> ''),

  kind               text NOT NULL CHECK (kind IN ('link', 'file')),

  -- kind = 'link'
  url                text,
  label              text,

  -- kind = 'file'
  storage_path       text,
  file_name          text,
  mime_type          text,
  size_bytes         bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),

  sort_order         integer NOT NULL DEFAULT 0,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- A row is one thing or the other, never a half-filled both.
  CONSTRAINT calendar_attachment_shape CHECK (
    (kind = 'link' AND url IS NOT NULL AND storage_path IS NULL)
    OR
    (kind = 'file' AND storage_path IS NOT NULL AND url IS NULL)
  ),

  -- Stops `javascript:` and friends reaching an href. The UI renders these as
  -- real links, so this is the last line where a scheme can be refused.
  CONSTRAINT calendar_attachment_url_scheme CHECK (
    url IS NULL OR url ~* '^https?://'
  )
);

CREATE INDEX IF NOT EXISTS calendar_event_attachments_event_idx
  ON public.calendar_event_attachments (google_calendar_id, google_event_id);

DROP TRIGGER IF EXISTS set_calendar_event_attachments_updated_at
  ON public.calendar_event_attachments;
CREATE TRIGGER set_calendar_event_attachments_updated_at
  BEFORE UPDATE ON public.calendar_event_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 3. Who may see and change them
-- =============================================================================

ALTER TABLE public.calendar_event_attachments ENABLE ROW LEVEL SECURITY;

-- RLS with no grant is still a grant: revoke as well, or a policy-less path
-- leaves the table readable. Same lesson as portal_access_codes.
REVOKE ALL ON public.calendar_event_attachments FROM anon, authenticated;
GRANT SELECT ON public.calendar_event_attachments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event_attachments TO authenticated;

-- Parents: only calendars that actually feed a portal programme. The Staff
-- calendar is not one, so its attachments are invisible here no matter what
-- the client asks for.
DROP POLICY IF EXISTS calendar_attachments_anon_read ON public.calendar_event_attachments;
CREATE POLICY calendar_attachments_anon_read ON public.calendar_event_attachments
  FOR SELECT TO anon
  USING (public.is_portal_calendar(google_calendar_id));

-- Signed-in staff can read everything; only admins can change anything.
DROP POLICY IF EXISTS calendar_attachments_staff_read ON public.calendar_event_attachments;
CREATE POLICY calendar_attachments_staff_read ON public.calendar_event_attachments
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS calendar_attachments_admin_write ON public.calendar_event_attachments;
CREATE POLICY calendar_attachments_admin_write ON public.calendar_event_attachments
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.calendar_event_attachments IS
  'Links and files hung on a Google calendar event, keyed by (google_calendar_id, google_event_id) so the staff calendar and the parent portal — different tables — both find them. Deleting the event in Google orphans these; see the v22 header.';

COMMIT;

-- =============================================================================
-- 4. The bucket
-- =============================================================================
--
-- Same shape as portal-documents (v10): private, 25 MB, a fixed mime list.
-- Reads are anon-allowed at the object level and the path is a uuid, exactly
-- as portal documents already work — discoverability is controlled by the row
-- above, which anon cannot see for a Staff-calendar attachment.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'calendar-attachments',
  'calendar-attachments',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS calendar_attachments_read ON storage.objects;
CREATE POLICY calendar_attachments_read ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'calendar-attachments');

DROP POLICY IF EXISTS calendar_attachments_insert ON storage.objects;
CREATE POLICY calendar_attachments_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'calendar-attachments' AND public.is_admin());

DROP POLICY IF EXISTS calendar_attachments_update ON storage.objects;
CREATE POLICY calendar_attachments_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'calendar-attachments' AND public.is_admin())
  WITH CHECK (bucket_id = 'calendar-attachments' AND public.is_admin());

DROP POLICY IF EXISTS calendar_attachments_delete ON storage.objects;
CREATE POLICY calendar_attachments_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'calendar-attachments' AND public.is_admin());

-- =============================================================================
-- 5. Finding orphans later
-- =============================================================================
--
-- Attachments whose event no longer exists on either side. Expected after a
-- calendar rebuild. Read it before deleting anything — an event merely moved
-- outside the sync window looks identical from here.
--
--   SELECT a.*
--     FROM public.calendar_event_attachments a
--    WHERE NOT EXISTS (
--            SELECT 1 FROM public.calendar_events e
--             WHERE e.google_calendar_id = a.google_calendar_id
--               AND e.google_event_id    = a.google_event_id)
--      AND NOT EXISTS (
--            SELECT 1 FROM public.portal_events p
--             WHERE p.google_calendar_id = a.google_calendar_id
--               AND p.google_event_id    = a.google_event_id);
--
-- Removing the row does NOT remove the stored file. Collect storage_path from
-- the rows first, delete the objects, then the rows.
-- =============================================================================
