-- =============================================================================
-- v23 — more than one Google calendar per portal program
-- =============================================================================
--
-- STATUS: NOT YET APPLIED.
--
-- WHAT THIS IS FOR
--
-- All-Star families need the Studio calendar as well as the All-Stars one. A
-- competition weekend is on All-Stars; the day the building is shut is on
-- Studio. Today a parent has to know which of those two facts lives where,
-- which is not something a parent should have to know.
--
-- Two things stood in the way, and only the first one is obvious.
--
--   1. portal_calendar_sources had program_id as its PRIMARY KEY, so a program
--      could name exactly one calendar. That is the easy half.
--
--   2. portal_events_google_uniq was a partial unique index on
--      (google_calendar_id, google_event_id) — NO program_id. That is the half
--      that would have bitten silently.
--
-- WHY (2) MATTERS, BECAUSE IT IS NOT OBVIOUS
--
-- The Studio calendar is ALREADY the source for the `academy` program (v17
-- seeded it). Pointing All-Stars at the same calendar means one Google event
-- has to exist as a portal_events row for BOTH programs at once.
--
-- Under the old index it could not. The second program's upsert would collide
-- on the first program's row and the DO UPDATE would rewrite program_id, so
-- each run would drag every shared event over to whichever program synced
-- last. Sync order is not stable, so parents would watch events appear and
-- vanish on a schedule, and nothing anywhere would report an error — every
-- individual run would say "ok, 40 written".
--
-- A portal_events row is a per-program projection of a Google event, not the
-- event itself. The index now says so.
--
-- WHAT DOES NOT CHANGE
--
--   * The sync still owns 'google' rows and never touches 'manual' ones.
--   * The prune is still bounded by program AND calendar AND window, so one
--     program's sync can never clear another program's rows, and a truncated
--     page of results still cannot wipe a season.
--   * is_portal_calendar() (v22) already asks only "does ANY program read this
--     calendar", so attachments on Studio events become visible to All-Star
--     families for free, which is the right answer.
--   * Row identity is still the iCalUID (v21). Nothing is renumbered.
--
-- THE ONE THING TO KNOW BEFORE RUNNING IT
--
-- Attaching a second calendar duplicates any event that genuinely appears on
-- BOTH Google calendars — two Google events means two rows, because they are
-- two events as far as anything here can tell. If the studio double-posts a
-- competition to Studio and All-Stars, All-Star parents see it twice. The fix
-- is on the Google side (post it once), not here: de-duplicating by title and
-- time would eventually swallow a real pair of same-named events on the same
-- day, which is a worse failure than a visible duplicate.
--
-- VERIFY AND ROLLBACK are at the bottom.
-- =============================================================================


-- =============================================================================
-- 1. A program may name several calendars
-- =============================================================================

BEGIN;

ALTER TABLE public.portal_calendar_sources
  DROP CONSTRAINT IF EXISTS portal_calendar_sources_pkey;

-- (program_id, google_calendar_id): a program may read many calendars, and a
-- calendar may feed many programs. Deliberately NOT unique on
-- google_calendar_id alone — Studio feeding both academy and All-Stars is the
-- entire point of this migration.
ALTER TABLE public.portal_calendar_sources
  ADD CONSTRAINT portal_calendar_sources_pkey
  PRIMARY KEY (program_id, google_calendar_id);

COMMENT ON TABLE public.portal_calendar_sources IS
  'Which Google calendars feed which portal program. Many-to-many since v23: All-Stars reads both the All-Stars and Studio calendars.';

COMMIT;


-- =============================================================================
-- 2. One portal row per (program, calendar, event)
--
-- Widening a unique index can only ever permit more, so this cannot fail on
-- existing data: any pair that was unique under the old index is still unique
-- under the new one.
-- =============================================================================

BEGIN;

DROP INDEX IF EXISTS public.portal_events_google_uniq;

CREATE UNIQUE INDEX portal_events_google_uniq
  ON public.portal_events (program_id, google_calendar_id, google_event_id)
  WHERE source = 'google';

COMMIT;


-- =============================================================================
-- 3. The merge, scoped to one source rather than one program
--
-- Same function, same signature, same guarantees. Three changes, all of them
-- consequences of a program now having more than one row in
-- portal_calendar_sources:
--
--   * publish_imported is read for THIS calendar. Unscoped, SELECT INTO would
--     quietly take whichever row Postgres handed back first and apply one
--     calendar's publish setting to another's events.
--   * the ON CONFLICT target restates the widened index from section 2.
--   * the status write lands on THIS source's row, so a per-calendar failure is
--     legible instead of being smeared across every calendar the program reads.
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

  -- Scoped to the calendar since v23. A program has several of these rows now.
  SELECT publish_imported INTO v_publish
  FROM public.portal_calendar_sources
  WHERE program_id = p_program_id
    AND google_calendar_id = p_calendar_id;

  IF v_publish IS NULL THEN
    RAISE EXCEPTION 'Calendar % is not a configured source for this program', p_calendar_id;
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
  ON CONFLICT (program_id, google_calendar_id, google_event_id) WHERE source = 'google'
  DO UPDATE SET
    title        = EXCLUDED.title,
    description  = EXCLUDED.description,
    starts_at    = EXCLUDED.starts_at,
    ends_at      = EXCLUDED.ends_at,
    is_all_day   = EXCLUDED.is_all_day,
    location     = EXCLUDED.location,
    updated_at   = now();
    -- program_id is no longer assigned here: it is part of the conflict target
    -- now, so it cannot differ, and the old assignment is exactly the statement
    -- that used to drag shared events between programs.
    --
    -- is_published is deliberately NOT updated: an admin who unpublishes an
    -- imported event has made a decision, and the next sync should not undo it.

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  -- Events that vanished from Google without a tombstone — deleted long ago, or
  -- moved out of the window. Bounded by program AND calendar AND window: an
  -- empty or truncated payload must never be able to clear rows it simply did
  -- not fetch, and one source must never prune another's.
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
  WHERE program_id = p_program_id
    AND google_calendar_id = p_calendar_id;

  RETURN jsonb_build_object('upserted', v_upserted, 'removed', v_removed);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_sync_google_events(uuid, text, timestamptz, timestamptz, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_sync_google_events(uuid, text, timestamptz, timestamptz, jsonb)
  TO authenticated, service_role;

COMMIT;


-- =============================================================================
-- 4. Failures, recorded against the calendar that failed
--
-- p_calendar_id is optional, and the default is what makes the deploy order not
-- matter: the currently deployed Edge Function calls this with two arguments,
-- and until it is redeployed those calls resolve here with p_calendar_id NULL
-- and behave exactly as they did before — the failure is recorded against every
-- source of the program. Slightly noisy, never wrong.
--
-- The two-argument version is DROPPED rather than kept. Leaving both would make
-- a two-argument call ambiguous, and Postgres would refuse it outright with
-- "function is not unique" — which is the sync failing to record that the sync
-- failed, i.e. the one error nobody would ever see.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.portal_record_sync_failure(uuid, text);

CREATE OR REPLACE FUNCTION public.portal_record_sync_failure(
  p_program_id  uuid,
  p_message     text,
  p_calendar_id text DEFAULT NULL
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
  WHERE program_id = p_program_id
    AND (p_calendar_id IS NULL OR google_calendar_id = p_calendar_id);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_record_sync_failure(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_record_sync_failure(uuid, text, text)
  TO authenticated, service_role;

COMMIT;


-- =============================================================================
-- 5. Give All-Stars the Studio calendar
--
-- The row All-Stars already has (the All-Stars calendar) is untouched; this
-- adds the second one beside it. Same window as v17 used for both programs:
-- 60 days back so a parent opening the app in October still sees September,
-- 365 ahead for a full season.
--
-- Run this, then "Sync now" in the portal manager.
-- =============================================================================

BEGIN;

INSERT INTO public.portal_calendar_sources
  (program_id, google_calendar_id, time_zone,
   is_enabled, days_back, days_ahead, publish_imported)
SELECT p.id,
       'c_5ec521b88928c8224d641a7b1f068a286492fffcdae90f6a421fb53b96ea1da1@group.calendar.google.com',
       'America/Los_Angeles', true, 60, 365, true
FROM public.portal_programs p
WHERE p.slug = 'allstars'
ON CONFLICT (program_id, google_calendar_id) DO UPDATE
  SET is_enabled = true;

COMMIT;


-- =============================================================================
-- VERIFY
-- =============================================================================
--
-- 1. All-Stars now reads two calendars, and academy still reads Studio:
--
--      SELECT p.slug, s.google_calendar_id, s.is_enabled
--      FROM public.portal_calendar_sources s
--      JOIN public.portal_programs p ON p.id = s.program_id
--      ORDER BY p.slug, s.google_calendar_id;
--
-- 2. The shared Studio event exists once per program, not once in total. After
--    a sync, this should return TWO rows for any Studio event — one per
--    program — and both should stay put across repeated runs:
--
--      SELECT p.slug, e.title, e.starts_at
--      FROM public.portal_events e
--      JOIN public.portal_programs p ON p.id = e.program_id
--      WHERE e.source = 'google'
--        AND e.google_calendar_id LIKE 'c_5ec5%'
--      ORDER BY e.starts_at, p.slug
--      LIMIT 20;
--
-- 3. THE REGRESSION THIS MIGRATION EXISTS TO PREVENT. Run the sync twice and
--    compare. If program_id is moving between runs, the old bug is still live:
--
--      SELECT program_id, count(*) FROM public.portal_events
--      WHERE source = 'google' GROUP BY 1;      -- stable across two runs
--
-- 4. Still idempotent, still no duplicates within a program:
--
--      SELECT program_id, google_calendar_id, google_event_id, count(*)
--      FROM public.portal_events WHERE source = 'google'
--      GROUP BY 1, 2, 3 HAVING count(*) > 1;    -- 0 rows
--
-- 5. Manual events untouched:
--
--      SELECT count(*) FROM public.portal_events WHERE source = 'manual';
--
-- 6. anon still cannot read the configuration:
--
--      BEGIN;
--      SET LOCAL ROLE anon;
--        SELECT count(*) FROM public.portal_calendar_sources;   -- 0 rows / denied
--      ROLLBACK;
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
-- Drop the extra source FIRST — while (program_id, google_calendar_id) is still
-- the key — or the primary key cannot go back to program_id alone.
--
--   DELETE FROM public.portal_events
--    WHERE source = 'google'
--      AND google_calendar_id = 'c_5ec5...@group.calendar.google.com'
--      AND program_id = (SELECT id FROM public.portal_programs WHERE slug = 'allstars');
--
--   DELETE FROM public.portal_calendar_sources
--    WHERE google_calendar_id = 'c_5ec5...@group.calendar.google.com'
--      AND program_id = (SELECT id FROM public.portal_programs WHERE slug = 'allstars');
--
--   ALTER TABLE public.portal_calendar_sources
--     DROP CONSTRAINT portal_calendar_sources_pkey,
--     ADD  CONSTRAINT portal_calendar_sources_pkey PRIMARY KEY (program_id);
--
--   DROP INDEX IF EXISTS public.portal_events_google_uniq;
--   CREATE UNIQUE INDEX portal_events_google_uniq
--     ON public.portal_events (google_calendar_id, google_event_id)
--     WHERE source = 'google';
--
-- Then re-run sections 2 and 3 of v12 to restore the old function bodies, and
-- redeploy the previous portal-calendar-sync.
-- =============================================================================
