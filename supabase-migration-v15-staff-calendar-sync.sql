-- =============================================================================
-- v15 — the staff Calendar subscribes to Google instead of being authored
-- =============================================================================
--
-- STATUS: APPLIED to prod 2026-08-26 as `v15_calendar_sources_and_rls` and
--         `v15_staff_sync_google_events`.
--
--         SUPERSEDED IN PART BY v16. Everything here still stands except the
--         data source: the Edge Function no longer reads the Google Calendar
--         API with a service account, it subscribes to each calendar's iCal
--         feed. Ignore the service-account setup notes below — v16 explains
--         why, and there is nothing to set up in Google Cloud any more.
--
-- WHY
--
-- The staff Calendar was never a shared calendar. EventContext wrote to
-- localStorage and never called Supabase at all, so every person saw their own
-- private calendar, nothing was shared between staff or between one person's
-- devices, and clearing site data wiped it. calendar_events existed and held
-- exactly three rows, written by an older build in May and orphaned since.
--
-- It now becomes a subscription to three Google calendars under one account
-- (info@didancecenter.com), each one a category with its own colour. Nobody
-- authors events in the app any more — Google is the source of truth and the
-- app is a window onto it.
--
-- ONE ACCOUNT, MANY CALENDARS
--
-- Deliberately not multi-account. One service account reads all three, so
-- there is one credential to manage and the calendar id is just a column.
-- This mirrors portal_calendar_sources (v12) rather than inventing a second
-- pattern; the Edge Function is the portal one with the program swapped for a
-- source row.
--
-- WHAT HAPPENS TO THE THREE EXISTING ROWS
--
-- They stay, as source = 'manual'. They are from May and long past, and
-- deleting a colleague's data to tidy a migration is not a trade worth making.
-- The prune in staff_sync_google_events() only ever touches source = 'google'.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- §1  The calendars we subscribe to
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.calendar_sources (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_calendar_id text NOT NULL UNIQUE,
  -- What a human sees: legend chip, filter button.
  label              text NOT NULL,
  -- Stable key the client filters on. Kept separate from label so renaming a
  -- calendar in the UI does not silently reset everyone's saved filter.
  slug               text NOT NULL UNIQUE,
  color              text NOT NULL,
  sort_order         integer NOT NULL DEFAULT 0,
  is_enabled         boolean NOT NULL DEFAULT true,
  -- The fetch window. Anything outside it is neither imported nor pruned.
  days_back          integer NOT NULL DEFAULT 60,
  days_ahead         integer NOT NULL DEFAULT 365,
  last_run_at        timestamptz,
  last_success_at    timestamptz,
  last_status        text,
  last_message       text,
  last_upserted      integer,
  last_removed       integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_sources_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

COMMENT ON TABLE public.calendar_sources IS
  'v15: one row per Google calendar the staff Calendar subscribes to. One '
  'Google account, several calendars, each a category with its own colour.';

-- -----------------------------------------------------------------------------
-- §2  calendar_events learns where a row came from
-- -----------------------------------------------------------------------------

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS source             text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_event_id    text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_source_check'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD CONSTRAINT calendar_events_source_check CHECK (source IN ('manual', 'google'));
  END IF;
END $$;

-- The upsert target. Partial, so the three legacy manual rows — which have NULL
-- for both google columns — are not dragged into a uniqueness rule that has
-- nothing to say about them.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_google_uniq
  ON public.calendar_events (google_calendar_id, google_event_id)
  WHERE source = 'google';

CREATE INDEX IF NOT EXISTS calendar_events_start_date_idx
  ON public.calendar_events (start_date);

-- -----------------------------------------------------------------------------
-- §3  RLS
--
-- The old policies were four permissive "Allow authenticated ..." rules, one
-- per command — every signed-in account, team members included, could create,
-- edit and delete anyone's calendar events. That was already wrong; now that
-- the calendar is a read-only mirror it is also pointless, because a write the
-- app never makes would be silently undone by the next sync anyway.
--
-- Reads stay open to all staff. Writes go to super admins only, as an escape
-- hatch for the legacy manual rows. The sync itself does not rely on a policy:
-- staff_sync_google_events() is SECURITY DEFINER.
-- -----------------------------------------------------------------------------

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read calendar_events"   ON public.calendar_events;
DROP POLICY IF EXISTS "Allow authenticated insert calendar_events" ON public.calendar_events;
DROP POLICY IF EXISTS "Allow authenticated update calendar_events" ON public.calendar_events;
DROP POLICY IF EXISTS "Allow authenticated delete calendar_events" ON public.calendar_events;

DROP POLICY IF EXISTS calendar_events_select ON public.calendar_events;
CREATE POLICY calendar_events_select ON public.calendar_events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS calendar_events_write ON public.calendar_events;
CREATE POLICY calendar_events_write ON public.calendar_events
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER TABLE public.calendar_sources ENABLE ROW LEVEL SECURITY;

-- Every signed-in user reads this: the client needs the label and colour to
-- render the legend and the filter. Nothing here is sensitive.
DROP POLICY IF EXISTS calendar_sources_select ON public.calendar_sources;
CREATE POLICY calendar_sources_select ON public.calendar_sources
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS calendar_sources_write ON public.calendar_sources;
CREATE POLICY calendar_sources_write ON public.calendar_sources
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

REVOKE ALL ON public.calendar_sources FROM anon;
REVOKE ALL ON public.calendar_events  FROM anon;

-- -----------------------------------------------------------------------------
-- §4  The sync itself
--
-- Upsert then prune, in one transaction, so the calendar is never briefly empty
-- while a run is in flight.
--
-- The Edge Function hands over start_date/start_time already split and already
-- converted into the studio's timezone. That conversion is deliberately NOT
-- done here: calendar_events stores date and time as TEXT with no zone, so the
-- only correct reading of '19:30' is "19:30 where the studio is", and the one
-- place that knows the calendar's timeZone is the caller that fetched it.
-- Doing it in SQL would mean guessing at the server's zone, which is UTC.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_sync_google_events(
  p_calendar_id  text,
  p_window_start date,
  p_window_end   date,
  p_events       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists   boolean;
  v_upserted integer := 0;
  v_removed  integer := 0;
  v_pruned   integer := 0;
BEGIN
  -- service_role reaches this from the scheduled function; a super admin from a
  -- "Sync now" button. Nobody else, and never anon.
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not permitted to sync calendar events';
  END IF;

  IF p_window_end <= p_window_start THEN
    RAISE EXCEPTION 'Window end must be after window start';
  END IF;

  SELECT true INTO v_exists FROM public.calendar_sources
  WHERE google_calendar_id = p_calendar_id;
  IF v_exists IS NULL THEN
    RAISE EXCEPTION 'Unknown calendar source: %', p_calendar_id;
  END IF;

  -- Cancelled events arrive as tombstones rather than as absences, so they are
  -- removed explicitly rather than left to the prune — which only looks inside
  -- the window and would miss one cancelled outside it.
  WITH cancelled AS (
    SELECT e->>'google_event_id' AS gid
    FROM jsonb_array_elements(p_events) e
    WHERE e->>'status' = 'cancelled'
  )
  DELETE FROM public.calendar_events ce
  USING cancelled c
  WHERE ce.source = 'google'
    AND ce.google_calendar_id = p_calendar_id
    AND ce.google_event_id = c.gid;

  GET DIAGNOSTICS v_removed = ROW_COUNT;

  WITH incoming AS (
    SELECT
      e->>'google_event_id'                        AS google_event_id,
      NULLIF(btrim(e->>'title'), '')               AS title,
      COALESCE(e->>'description', '')              AS description,
      NULLIF(btrim(e->>'location'), '')            AS location,
      e->>'start_date'                             AS start_date,
      NULLIF(e->>'start_time', '')                 AS start_time,
      NULLIF(e->>'end_date', '')                   AS end_date,
      NULLIF(e->>'end_time', '')                   AS end_time,
      COALESCE((e->>'is_all_day')::boolean, false) AS is_all_day
    FROM jsonb_array_elements(p_events) e
    WHERE COALESCE(e->>'status', 'confirmed') <> 'cancelled'
  )
  INSERT INTO public.calendar_events (
    title, description, location,
    start_date, start_time, end_date, end_time, is_all_day,
    source, google_calendar_id, google_event_id, created_by
  )
  SELECT
    COALESCE(i.title, '(untitled event)'),
    i.description,
    i.location,
    i.start_date, i.start_time, i.end_date, i.end_time, i.is_all_day,
    'google', p_calendar_id, i.google_event_id,
    -- No human authored these. created_by is TEXT and carries a uuid for manual
    -- rows, so a sentinel rather than a fake user id.
    'google-sync'
  FROM incoming i
  ON CONFLICT (google_calendar_id, google_event_id) WHERE source = 'google'
  DO UPDATE SET
    title       = EXCLUDED.title,
    description = EXCLUDED.description,
    location    = EXCLUDED.location,
    start_date  = EXCLUDED.start_date,
    start_time  = EXCLUDED.start_time,
    end_date    = EXCLUDED.end_date,
    end_time    = EXCLUDED.end_time,
    is_all_day  = EXCLUDED.is_all_day,
    updated_at  = now();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  -- Events that vanished from Google with no tombstone: deleted long ago, or
  -- moved out of the window. Bounded by calendar AND window, so a truncated or
  -- empty payload can never clear rows it simply did not fetch.
  WITH kept AS (
    SELECT e->>'google_event_id' AS gid FROM jsonb_array_elements(p_events) e
  )
  DELETE FROM public.calendar_events ce
  WHERE ce.source = 'google'
    AND ce.google_calendar_id = p_calendar_id
    AND ce.start_date >= p_window_start::text
    AND ce.start_date <= p_window_end::text
    AND NOT EXISTS (SELECT 1 FROM kept k WHERE k.gid = ce.google_event_id);

  -- GET DIAGNOSTICS assigns outright rather than adding, so the two deletes are
  -- counted separately and summed here.
  GET DIAGNOSTICS v_pruned = ROW_COUNT;
  v_removed := v_removed + v_pruned;

  UPDATE public.calendar_sources
  SET last_run_at     = now(),
      last_success_at = now(),
      last_status     = 'ok',
      last_message    = NULL,
      last_upserted   = v_upserted,
      last_removed    = v_removed,
      updated_at      = now()
  WHERE google_calendar_id = p_calendar_id;

  RETURN jsonb_build_object('upserted', v_upserted, 'removed', v_removed);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_sync_google_events(text, date, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_sync_google_events(text, date, date, jsonb)
  TO authenticated, service_role;

-- Recorded separately so a failure is visible on the row rather than only in
-- the function logs, and so a calendar that broke does not keep showing a
-- stale "ok" from an earlier run.
CREATE OR REPLACE FUNCTION public.staff_record_sync_failure(
  p_calendar_id text,
  p_message     text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  UPDATE public.calendar_sources
  SET last_run_at  = now(),
      last_status  = 'error',
      last_message = left(COALESCE(p_message, 'Unknown error'), 500),
      updated_at   = now()
  WHERE google_calendar_id = p_calendar_id;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_record_sync_failure(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_record_sync_failure(text, text)
  TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- §5  The three calendars
--
-- Ids read from the live account rather than typed from a screenshot. Colours
-- follow what Google shows so the app and the Google UI agree at a glance.
-- -----------------------------------------------------------------------------

INSERT INTO public.calendar_sources (google_calendar_id, label, slug, color, sort_order)
VALUES
  ('c_5ec521b88928c8224d641a7b1f068a286492fffcdae90f6a421fb53b96ea1da1@group.calendar.google.com',
   'Studio',    'studio',   '#E53935', 1),
  ('c_6297b14bc3f4f314b85c1ee2b36060e12688a9a64820d621468d132a9cb4ce84@group.calendar.google.com',
   'All-Stars', 'allstars', '#7C6CF0', 2),
  ('c_3e271ca3561be864b401cd12b7b4859b8981e0d9347bd4c78a309be3ef4f46ca@group.calendar.google.com',
   'Staff',     'staff',    '#3B82F6', 3)
ON CONFLICT (google_calendar_id) DO UPDATE
SET label = EXCLUDED.label, slug = EXCLUDED.slug,
    color = EXCLUDED.color, sort_order = EXCLUDED.sort_order;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
--   DELETE FROM public.calendar_events WHERE source = 'google';
--   DROP FUNCTION IF EXISTS public.staff_sync_google_events(text, date, date, jsonb);
--   DROP FUNCTION IF EXISTS public.staff_record_sync_failure(text, text);
--   DROP TABLE IF EXISTS public.calendar_sources;
--   DROP INDEX IF EXISTS public.calendar_events_google_uniq;
--   ALTER TABLE public.calendar_events
--     DROP CONSTRAINT IF EXISTS calendar_events_source_check,
--     DROP COLUMN IF EXISTS source,
--     DROP COLUMN IF EXISTS google_calendar_id,
--     DROP COLUMN IF EXISTS google_event_id;
--   -- and restore the four permissive policies, if you really want them back.
-- =============================================================================
