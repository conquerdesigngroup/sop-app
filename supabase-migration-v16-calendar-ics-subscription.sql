-- =============================================================================
-- v16 — subscribe by iCal feed instead of the Google API
-- =============================================================================
--
-- STATUS: APPLIED to prod 2026-08-26 as `v16_calendar_ics_subscription`.
--
-- WHY THIS REPLACES HALF OF v15
--
-- v15 read the three calendars through the Google Calendar API with a service
-- account. It worked, and it was the wrong call: it cost a Google Cloud
-- project, a JSON key and a per-calendar share before a single event appeared.
-- The ask was "subscribe to these three calendars so they show up in the UI",
-- and a service account is not what subscribing means.
--
-- An iCal feed is a URL. That is the whole integration.
--
-- WHAT v15 KEEPS
--
-- Everything except the fetch: calendar_sources, the source/google_calendar_id/
-- google_event_id columns, the partial unique index, staff_sync_google_events()
-- and its upsert-then-prune, and the RLS that stopped every signed-in user from
-- writing calendar events. Only the Edge Function's data source changed.
--
-- TWO SHAPES OF URL
--
--   public  https://calendar.google.com/calendar/ical/<ID>/public/basic.ics
--           Works once the calendar is ticked "Make available to public".
--           Derivable from the calendar id, so it is prefilled below and there
--           is nothing to paste.
--
--   secret  https://calendar.google.com/calendar/ical/<ID>/private-<TOKEN>/basic.ics
--           From "Secret address in iCal format". Keeps the calendar private;
--           has to be pasted in, because the token cannot be derived.
--
-- The feed is fetched server-side by the Edge Function, so a secret address is
-- never exposed to a browser.
--
-- RECURRING EVENTS
--
-- The one real cost of leaving the API: Google no longer expands recurrences,
-- so the function does it with ical.js — including EXDATE for a cancelled week
-- and RECURRENCE-ID for a class that moved once. Each occurrence is stored
-- under `<UID>::<occurrence>` so a weekly class does not collapse into one row.
-- =============================================================================

ALTER TABLE public.calendar_sources
  ADD COLUMN IF NOT EXISTS ics_url  text,
  -- Google puts the calendar's zone in the feed as X-WR-TIMEZONE. This is the
  -- fallback for a feed that omits it, and the zone wall-clock times are
  -- rendered in — calendar_events stores date and time as zoneless TEXT.
  ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'America/Los_Angeles';

UPDATE public.calendar_sources
SET ics_url = 'https://calendar.google.com/calendar/ical/'
              || replace(google_calendar_id, '@', '%40')
              || '/public/basic.ics'
WHERE ics_url IS NULL;

COMMENT ON COLUMN public.calendar_sources.ics_url IS
  'v16: the iCal feed to subscribe to. Public form is prefilled and works once the calendar is public; paste the "Secret address in iCal format" here instead to keep it private.';

-- To keep a calendar private, replace its prefilled public URL:
--
--   UPDATE public.calendar_sources
--   SET ics_url = '<the secret iCal address>'
--   WHERE slug = 'staff';
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--   ALTER TABLE public.calendar_sources
--     DROP COLUMN IF EXISTS ics_url,
--     DROP COLUMN IF EXISTS time_zone;
--   -- and redeploy the service-account version of staff-calendar-sync.
-- =============================================================================
