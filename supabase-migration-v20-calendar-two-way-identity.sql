-- =============================================================================
-- v20 — make the two halves of the calendar sync agree
-- =============================================================================
--
-- STATUS: APPLIED to prod 2026-08-27 as `v20_calendar_two_way_identity`.
--
-- An adversarial audit of the v19 push path (17 confirmed findings) established
-- that the round trip did not work at all. Two of them are one piece of work
-- and are fixed here; the rest are in the app and the Edge Functions.
--
-- 1. THE TWO HALVES KEYED ON DIFFERENT GOOGLE IDENTIFIERS
--
-- staff-calendar-push stored Google's Calendar API event id (`abc123`).
-- staff-calendar-sync stores the iCal UID from the basic.ics feed, which for
-- the same event is `abc123@google.com`. Google documents these as separate
-- fields. Nothing bridged them, and `iCalUID` appeared nowhere in the repo.
--
-- Consequences, all real and all routine rather than rare:
--
--   * The upsert below keys on (google_calendar_id, google_event_id), so a
--     pushed row never collided with its own feed row. The sync INSERTED a
--     second row, and the prune then DELETED the pushed one — resetting
--     created_by to the 'google-sync' sentinel and changing the row's uuid.
--     With v18's 30-minute cron that is the normal path.
--   * The surviving row then carried the UID, which the editor handed back as
--     a Calendar API path segment: PATCH /events/abc123%40google.com -> 404.
--     Every edit and every delete failed from that point on — for events the
--     app created AND for every event that had ever come through the sync.
--
-- The push header comment claimed the drift was "self-healing" because the
-- sync owns google rows and upserts by google_event_id. That was true only if
-- the two keys held the same value. They did not, so nothing healed.
--
-- The fix is to store both. google_event_id keeps the iCal UID, so the upsert
-- and the prune match on the value they always used. google_api_event_id
-- carries the API id, which is the only thing Google accepts in a URL.
--
-- 2. A STALE FEED PRUNED EVENTS THE APP HAD JUST PUSHED
--
-- The push writes through the API; the sync reads a cached ICS and deletes
-- every in-window google row the feed did not contain. A merely stale feed is
-- a well-formed VCALENDAR, so the `BEGIN:VCALENDAR` guard upstream passed and
-- the prune ran at full strength. The run that ate the event still set
-- last_status = 'ok'.
--
-- p_fetched_at closes it: a row touched within fifteen minutes of the fetch is
-- left alone. A genuinely deleted event simply waits one more cycle.
-- =============================================================================

-- 1 ------------------------------------------------------------ the column
--
-- Nullable, and stays null for every row the sync imported — the feed does not
-- carry it. Those events are addressed by stripping the '@google.com' suffix
-- off the UID, which is the shape Google uses for events it created. The column
-- exists so the pushed case never has to guess.

alter table public.calendar_events
  add column if not exists google_api_event_id text;

comment on column public.calendar_events.google_api_event_id is
  'Google Calendar API event id. Distinct from google_event_id, which holds the iCal UID (<api id>@google.com) the ICS feed reports. Only the API id may be used in a Calendar API URL.';


-- 2 -------------------------------------------------------------- the RPC
--
-- Dropped and recreated rather than replaced: adding a parameter changes the
-- signature, and CREATE OR REPLACE would leave the old four-argument version
-- in place as an ambiguous overload.
--
-- Everything except the two marked passages is unchanged from v15.

drop function if exists public.staff_sync_google_events(text, date, date, jsonb);

create or replace function public.staff_sync_google_events(
  p_calendar_id  text,
  p_window_start date,
  p_window_end   date,
  p_events       jsonb,
  -- When the feed was fetched. Null keeps the old, ungraced behaviour so an
  -- older caller cannot be broken by this migration.
  p_fetched_at   timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_exists   boolean;
  v_upserted integer := 0;
  v_removed  integer := 0;
  v_pruned   integer := 0;
BEGIN
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
    i.description, i.location,
    i.start_date, i.start_time, i.end_date, i.end_time, i.is_all_day,
    'google', p_calendar_id, i.google_event_id,
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
    -- CHANGED IN v20: google_api_event_id is deliberately NOT in this list.
    -- The feed does not carry it, so the push is the only thing that knows it;
    -- overwriting it with null here would undo the fix on the very next sync.

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  WITH kept AS (
    SELECT e->>'google_event_id' AS gid FROM jsonb_array_elements(p_events) e
  )
  DELETE FROM public.calendar_events ce
  WHERE ce.source = 'google'
    AND ce.google_calendar_id = p_calendar_id
    AND ce.start_date >= p_window_start::text
    AND ce.start_date <= p_window_end::text
    -- CHANGED IN v20: the grace period. Google's ICS feed is a cache and lags
    -- the API by minutes, so without this the sync deletes events the app
    -- pushed moments earlier — and reports 'ok' for having done it.
    AND (p_fetched_at IS NULL OR ce.updated_at < p_fetched_at - interval '15 minutes')
    AND NOT EXISTS (SELECT 1 FROM kept k WHERE k.gid = ce.google_event_id);

  GET DIAGNOSTICS v_pruned = ROW_COUNT;
  v_removed := v_removed + v_pruned;

  UPDATE public.calendar_sources
  SET last_run_at = now(), last_success_at = now(), last_status = 'ok',
      last_message = NULL, last_upserted = v_upserted, last_removed = v_removed,
      updated_at = now()
  WHERE google_calendar_id = p_calendar_id;

  RETURN jsonb_build_object('upserted', v_upserted, 'removed', v_removed);
END;
$function$;

-- ----------------------------------------------------------------- verifying
--
--   -- both ids present on a pushed row, only the UID on a synced one
--   select google_event_id, google_api_event_id, created_by
--     from calendar_events where source = 'google' order by updated_at desc limit 5;
--
--   -- the grace period is in the prune
--   select pg_get_functiondef('public.staff_sync_google_events(text,date,date,jsonb,timestamptz)'::regprocedure)
--     like '%p_fetched_at - interval%' as has_grace;
