-- =============================================================================
-- v12 — Google Calendar into the portal calendar (phase 4)
--
-- STATUS: sections 1 and 2 APPLIED to prod 2026-08-21, as two migrations
--         (v12_portal_calendar_sources, v12_portal_sync_google_events).
--
--         Section 3 is a worked example, not a step — the portal manager writes
--         that row. Section 4 (the schedule) is NOT applied: it needs a Vault
--         secret and is only worth turning on once a manual sync has succeeded.
--
--         Both Edge Functions are deployed (google-oauth, portal-calendar-sync)
--         but neither has its Google secret set yet, so nothing syncs.
--
-- VERIFIED ON APPLY, in a transaction that was rolled back:
--   two new events           -> 2 upserted, 0 removed
--   one renamed, one cancelled -> 1 upserted, 1 removed
--   empty payload            -> the in-window row pruned, and a 'google' row
--                               OUTSIDE the window untouched
--   the 8 existing 'manual' events unchanged throughout
-- The ON CONFLICT did infer the partial index, which was the open question.
--
-- v9 reserved the shape this fills: portal_events.source is CHECK IN
-- ('manual','google'), and portal_events_google_uniq is a partial unique index
-- on (google_calendar_id, google_event_id) WHERE source = 'google'. Nothing
-- wrote 'google' rows until now.
--
-- THE RULE THAT MAKES THIS SAFE TO RUN REPEATEDLY
--
-- The sync owns 'google' rows and nothing else. It may insert, update and
-- delete them; it must never read, alter or delete a 'manual' row. Every
-- statement in portal_sync_google_events() carries `source = 'google'` for that
-- reason, and the delete that prunes vanished events is bounded by both the
-- calendar id and the window that was actually fetched — otherwise a single
-- failed page of results would wipe a season of events that are still there.
--
-- WHY THE CALENDAR ID IS NOT A COLUMN ON portal_programs
--
-- portal_programs is anon-readable — it has to be, it is what the chooser
-- lists. Adding the Google calendar id to it would widen the anon surface v8
-- and v9 spent their time narrowing. It lives in its own staff-only table
-- instead, which also gives the sync somewhere to record what it did.
-- =============================================================================

-- =============================================================================
-- 1. Which Google calendar feeds which program
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.portal_calendar_sources (
  program_id        uuid PRIMARY KEY REFERENCES public.portal_programs(id) ON DELETE CASCADE,
  -- e.g. 'studio@example.com' or '...@group.calendar.google.com'
  google_calendar_id text NOT NULL CHECK (btrim(google_calendar_id) <> ''),
  is_enabled        boolean NOT NULL DEFAULT true,

  -- How much of the calendar to mirror. A month back keeps a calendar opened on
  -- the 1st from looking empty; a year forward covers a full competition season.
  days_back         integer NOT NULL DEFAULT 30  CHECK (days_back  BETWEEN 0 AND 365),
  days_ahead        integer NOT NULL DEFAULT 365 CHECK (days_ahead BETWEEN 1 AND 730),

  -- False lands imported events as drafts, so a studio can review what Google
  -- sends before parents see it. True is the useful default: an event on the
  -- studio calendar is already a decision someone made.
  publish_imported  boolean NOT NULL DEFAULT true,

  -- What the last run did. Written by the function under the service role.
  last_run_at       timestamptz,
  last_success_at   timestamptz,
  last_status       text CHECK (last_status IN ('ok', 'error')),
  last_message      text,
  last_upserted     integer,
  last_removed      integer,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Same trigger function and the same set_<table>_updated_at name as every
-- other table, from supabase-schema.sql.
DROP TRIGGER IF EXISTS set_portal_calendar_sources_updated_at ON public.portal_calendar_sources;
CREATE TRIGGER set_portal_calendar_sources_updated_at
  BEFORE UPDATE ON public.portal_calendar_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.portal_calendar_sources ENABLE ROW LEVEL SECURITY;

-- Staff configuration, not portal content: anon has no business here at all.
REVOKE ALL ON public.portal_calendar_sources FROM anon;

DROP POLICY IF EXISTS portal_calendar_sources_admin ON public.portal_calendar_sources;
CREATE POLICY portal_calendar_sources_admin ON public.portal_calendar_sources
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMIT;

-- =============================================================================
-- 2. The merge
--
-- One call per calendar per run. Doing this as a function rather than as an
-- upsert from the Edge Function is not decoration:
--
--   * portal_events_google_uniq is a PARTIAL index. ON CONFLICT can only infer
--     a partial index when the predicate is restated, which PostgREST's upsert
--     has no way to express — it would fail with "no unique or exclusion
--     constraint matching the ON CONFLICT specification".
--
--   * The prune has to see the same snapshot as the upsert. Split across two
--     round trips it can delete an event that the second call is about to
--     re-add, which parents would see as a calendar that flickers.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.portal_sync_google_events(
  p_program_id   uuid,
  p_calendar_id  text,
  p_window_start timestamptz,
  p_window_end   timestamptz,
  p_events       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_publish   boolean;
  v_upserted  integer := 0;
  v_removed   integer := 0;
  v_pruned    integer := 0;
BEGIN
  -- service_role reaches this from the scheduled function; an admin reaches it
  -- from the "Sync now" button. Nobody else, and never anon.
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not permitted to sync portal events';
  END IF;

  IF p_window_end <= p_window_start THEN
    RAISE EXCEPTION 'Window end must be after window start';
  END IF;

  SELECT publish_imported INTO v_publish
  FROM public.portal_calendar_sources
  WHERE program_id = p_program_id;

  IF v_publish IS NULL THEN
    RAISE EXCEPTION 'No calendar source configured for this program';
  END IF;

  -- Cancelled events arrive in the feed as tombstones rather than as absences,
  -- so they are removed explicitly before the prune rather than left to it.
  WITH cancelled AS (
    SELECT e->>'google_event_id' AS gid
    FROM jsonb_array_elements(p_events) e
    WHERE e->>'status' = 'cancelled'
  )
  DELETE FROM public.portal_events pe
  USING cancelled c
  WHERE pe.source = 'google'
    AND pe.program_id = p_program_id
    AND pe.google_calendar_id = p_calendar_id
    AND pe.google_event_id = c.gid;

  GET DIAGNOSTICS v_removed = ROW_COUNT;

  WITH incoming AS (
    SELECT
      e->>'google_event_id'                 AS google_event_id,
      NULLIF(btrim(e->>'title'), '')        AS title,
      COALESCE(e->>'description', '')       AS description,
      NULLIF(btrim(e->>'location'), '')     AS location,
      (e->>'starts_at')::timestamptz        AS starts_at,
      NULLIF(e->>'ends_at', '')::timestamptz AS ends_at,
      COALESCE((e->>'is_all_day')::boolean, false) AS is_all_day
    FROM jsonb_array_elements(p_events) e
    WHERE COALESCE(e->>'status', 'confirmed') <> 'cancelled'
  )
  INSERT INTO public.portal_events (
    program_id, class_id, title, description, starts_at, ends_at, is_all_day,
    location, source, google_calendar_id, google_event_id, is_published
  )
  SELECT
    p_program_id,
    NULL,                                   -- imported events are program-wide
    COALESCE(i.title, '(untitled event)'),  -- title is NOT NULL and CHECKed
    i.description,
    i.starts_at,
    i.ends_at,
    i.is_all_day,
    i.location,
    'google',
    p_calendar_id,
    i.google_event_id,
    v_publish
  FROM incoming i
  ON CONFLICT (google_calendar_id, google_event_id) WHERE source = 'google'
  DO UPDATE SET
    title        = EXCLUDED.title,
    description  = EXCLUDED.description,
    starts_at    = EXCLUDED.starts_at,
    ends_at      = EXCLUDED.ends_at,
    is_all_day   = EXCLUDED.is_all_day,
    location     = EXCLUDED.location,
    program_id   = EXCLUDED.program_id,
    updated_at   = now();
    -- is_published is deliberately NOT updated: an admin who unpublishes an
    -- imported event has made a decision, and the next sync should not undo it.

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  -- Events that vanished from Google without a tombstone — deleted long ago, or
  -- moved out of the window. Bounded by calendar AND window: an empty or
  -- truncated payload must never be able to clear rows it simply did not fetch.
  WITH kept AS (
    SELECT e->>'google_event_id' AS gid FROM jsonb_array_elements(p_events) e
  )
  DELETE FROM public.portal_events pe
  WHERE pe.source = 'google'
    AND pe.program_id = p_program_id
    AND pe.google_calendar_id = p_calendar_id
    AND pe.starts_at >= p_window_start
    AND pe.starts_at <= p_window_end
    AND NOT EXISTS (SELECT 1 FROM kept k WHERE k.gid = pe.google_event_id);

  -- GET DIAGNOSTICS assigns a variable outright, so the two deletes are counted
  -- separately and added here.
  GET DIAGNOSTICS v_pruned = ROW_COUNT;
  v_removed := v_removed + v_pruned;

  UPDATE public.portal_calendar_sources
  SET last_run_at     = now(),
      last_success_at = now(),
      last_status     = 'ok',
      last_message    = NULL,
      last_upserted   = v_upserted,
      last_removed    = v_removed
  WHERE program_id = p_program_id;

  RETURN jsonb_build_object('upserted', v_upserted, 'removed', v_removed);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_sync_google_events(uuid, text, timestamptz, timestamptz, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_sync_google_events(uuid, text, timestamptz, timestamptz, jsonb)
  TO authenticated, service_role;

-- Recorded separately so a failure is visible in the UI instead of being
-- swallowed by a function that only ever writes its state on success.
CREATE OR REPLACE FUNCTION public.portal_record_sync_failure(
  p_program_id uuid,
  p_message    text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not permitted to record a sync failure';
  END IF;

  UPDATE public.portal_calendar_sources
  SET last_run_at  = now(),
      last_status  = 'error',
      -- Truncated: this is rendered in the manager, and a Google error body can
      -- run to kilobytes.
      last_message = left(COALESCE(p_message, 'Unknown error'), 500)
  WHERE program_id = p_program_id;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_record_sync_failure(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_record_sync_failure(uuid, text) TO authenticated, service_role;

COMMIT;

-- =============================================================================
-- 3. Point a program at a calendar
--
-- The calendar id is the one from Google Calendar → Settings → "Integrate
-- calendar" → Calendar ID. Share that calendar with the service account's email
-- (See details and sharing → Share with specific people → "See all event
-- details") or the sync sees nothing and reports 404.
--
--   INSERT INTO public.portal_calendar_sources (program_id, google_calendar_id)
--   SELECT id, 'studio-events@group.calendar.google.com'
--   FROM public.portal_programs WHERE slug = 'allstars';
--
-- To pause one without losing the setting:
--
--   UPDATE public.portal_calendar_sources SET is_enabled = false
--   WHERE program_id = (SELECT id FROM public.portal_programs WHERE slug = 'allstars');
-- =============================================================================

-- =============================================================================
-- 4. The schedule — RUN THIS LAST
--
-- Needs the portal-calendar-sync function deployed, and a Vault secret holding
-- the key cron authenticates with. Run the whole section as one statement in
-- the SQL editor, replacing the placeholder.
--
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   CREATE EXTENSION IF NOT EXISTS pg_net;
--
--   -- The service role key, from Project Settings → API. It is stored
--   -- encrypted; it must not be written into the cron job body, which is
--   -- readable by anyone who can read cron.job.
--   SELECT vault.create_secret(
--     'PASTE_SERVICE_ROLE_KEY_HERE',
--     'portal_calendar_sync_key',
--     'Bearer token cron uses to call portal-calendar-sync'
--   );
--
--   SELECT cron.schedule(
--     'portal-calendar-sync',
--     '7,37 * * * *',          -- twice an hour, off the hour
--     $cron$
--     SELECT net.http_post(
--       url     := 'https://sgppeenmvskwztaszkgn.supabase.co/functions/v1/portal-calendar-sync',
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'Authorization', 'Bearer ' || (
--           SELECT decrypted_secret FROM vault.decrypted_secrets
--           WHERE name = 'portal_calendar_sync_key'
--         )
--       ),
--       body    := '{"source":"cron"}'::jsonb
--     );
--     $cron$
--   );
--
-- To watch it:
--
--   SELECT * FROM cron.job;
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--   SELECT program_id, last_status, last_message, last_run_at, last_upserted
--   FROM public.portal_calendar_sources;
--
-- To stop it:
--
--   SELECT cron.unschedule('portal-calendar-sync');
--
-- cron.job_run_details records that the HTTP call was made, not what the
-- function did with it. last_status on portal_calendar_sources is the one that
-- says whether Google actually answered.
-- =============================================================================

-- =============================================================================
-- VERIFY
-- =============================================================================
--
-- 1. anon cannot see the configuration:
--
--      BEGIN;
--      SET LOCAL ROLE anon;
--        SELECT count(*) FROM public.portal_calendar_sources;   -- 0 rows / denied
--      ROLLBACK;
--
-- 2. A manual event is never touched by a sync. Create one, run a sync, and
--    confirm it is still there with source = 'manual':
--
--      SELECT title, source FROM public.portal_events
--      WHERE program_id = '<id>' ORDER BY starts_at;
--
-- 3. The merge is idempotent. Run the sync twice and the second run should
--    report upserted = the same count and removed = 0, with no duplicate rows:
--
--      SELECT google_event_id, count(*) FROM public.portal_events
--      WHERE source = 'google' GROUP BY 1 HAVING count(*) > 1;   -- 0 rows
-- =============================================================================
