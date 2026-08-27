// =============================================================================
// staff-calendar-sync — mirror the studio's Google calendars into the app
// =============================================================================
//
// The staff Calendar is a read-only mirror of three Google calendars under one
// studio account. Nobody authors events in the app; Google is the source of
// truth and this pulls it in.
//
// WHY THE GOOGLE API AND NOT iCal  (v21)
//
// v16 put this on Google's secret iCal address because a feed needs no
// credentials. It worked, but it caps how fresh a calendar can be: Google
// rate-limits those addresses hard (measured 27 Aug 2026 — one scheduled run
// in five rejected with HTTP 429), so polling faster to get fresher data is
// the one thing guaranteed to make it worse. And a feed cannot be pushed.
//
// The lag was already known here: the prune below carries a fifteen-minute
// grace period written specifically because "Google's ICS is a cache that lags
// the API", so an event this app had just pushed was missing from the feed and
// got pruned. Reading the API means the reader and the writer are looking at
// the same thing, and that grace period is now belt and braces rather than
// load-bearing.
//
// Recurrence is Google's problem again (singleEvents=true), so ical.js, the
// occurrence iterator and the EXDATE handling are gone.
//
// Row identity is unchanged: google_event_id held the iCal UID and the API
// returns exactly that as iCalUID, so this renumbered nothing on cutover.
//
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  getAccessToken,
  listEvents,
  shiftDate,
  toPlainText,
} from '../_shared/googleCalendar.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  // Reflected rather than hard-coded: a header the preflight does not list makes
  // the browser refuse to send the real request — an OPTIONS 200 followed by
  // nothing, and "Failed to send a request to the Edge Function" on the client.
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// Only reached if Google's response and the stored column are both empty.
const FALLBACK_TZ = 'America/Los_Angeles';

interface SyncEvent {
  google_event_id: string;
  status: string;
  title: string;
  description: string;
  location: string | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  is_all_day: boolean;
}

const localParts = (d: Date, timeZone: string): { date: string; time: string } => ({
  // en-CA formats as YYYY-MM-DD, which is the storage format.
  date: new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d),
  time: new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d),
});

/**
 * One Google API event -> one staff calendar row.
 *
 * Keyed on iCalUID rather than id. Both are unique per occurrence once
 * singleEvents is on, but iCalUID is what the feed path wrote, so using it
 * matched every existing row on cutover instead of replacing all 62.
 */
const fromGoogle = (item: any, timeZone: string): SyncEvent | null => {
  const id = String(item.iCalUID ?? '').trim();
  if (!id) return null;

  const isAllDay = Boolean(item.start?.date);
  let start_date: string | null = null;
  let start_time: string | null = null;
  let end_date: string | null = null;
  let end_time: string | null = null;

  if (isAllDay) {
    start_date = item.start.date as string;
    // end.date is EXCLUSIVE: a one-day event on the 30th ends on the 1st. We
    // store the last day inclusive, so it shifts back and a single-day event
    // gets no end at all. The exact inverse of what staff-calendar-push
    // writes, and the pair has to stay that way or a round trip loses a day.
    if (item.end?.date) {
      const last = shiftDate(item.end.date as string, -1);
      end_date = last > start_date ? last : null;
    }
  } else if (item.start?.dateTime) {
    // The instant, rendered in the studio's zone. Storing wall-clock rather
    // than UTC is what makes a 4pm class stay at 4pm across a DST change.
    const s = localParts(new Date(item.start.dateTime), timeZone);
    start_date = s.date;
    start_time = s.time;
    if (item.end?.dateTime) {
      const e = localParts(new Date(item.end.dateTime), timeZone);
      end_time = e.time;
      // Only worth storing when it genuinely spans days; otherwise it is noise.
      end_date = e.date !== start_date ? e.date : null;
    }
  }

  if (!start_date) return null;

  return {
    google_event_id: id,
    status: 'confirmed',
    title: String(item.summary ?? '').trim(),
    description: toPlainText(item.description),
    location: String(item.location ?? '').trim() || null,
    start_date, start_time, end_date, end_time,
    is_all_day: isAllDay,
  };
};

/**
 * The `role` claim, without verifying the signature. Safe only because this is
 * never the thing granting access: Supabase's gateway has already verified the
 * JWT (verify_jwt: true) before the function runs.
 */
const jwtRole = (token: string): string | null => {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const n = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(n.padEnd(Math.ceil(n.length / 4) * 4, '='))).role ?? null;
  } catch {
    return null;
  }
};

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) {
    return json(500, { error: 'Function is missing Supabase environment configuration' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Missing Authorization header' });
  const bearer = authHeader.replace(/^Bearer\s+/i, '');

  // The straight comparison covers a cron job sending the service role key
  // verbatim; the claim check is the fallback for the newer key format, where
  // the two are not byte-identical but both carry role=service_role.
  const isCron = bearer === serviceKey || jwtRole(bearer) === 'service_role';

  if (!isCron) {
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: 'Invalid or expired session' });

    const probe = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: profile } = await probe
      .from('profiles').select('role, is_active').eq('id', userData.user.id).single();

    // Super admin only, matching staff_sync_google_events(). Which calendars the
    // studio subscribes to is configuration, and v13 put that with super admins.
    if (!profile || profile.role !== 'super_admin' || profile.is_active === false) {
      return json(403, { error: 'Super admin access required' });
    }
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let requestedCalendarId: string | null = null;
  try {
    requestedCalendarId = (await req.json())?.calendarId ?? null;
  } catch {
    // cron posts {"source":"cron"}; an empty body is fine too.
  }

  let query = admin
    .from('calendar_sources')
    .select('google_calendar_id, label, time_zone, days_back, days_ahead')
    .eq('is_enabled', true);
  if (requestedCalendarId) query = query.eq('google_calendar_id', requestedCalendarId);

  const { data: sources, error: sourcesErr } = await query;
  if (sourcesErr) {
    console.error('Could not read calendar sources:', sourcesErr);
    return json(500, { error: 'Could not read calendar sources' });
  }
  if (!sources?.length) return json(200, { synced: [], note: 'No enabled calendar sources' });

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return json(500, { error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set' });
  }

  const auth = await getAccessToken(admin, clientId, clientSecret);
  if (auth.error) {
    // Recorded against every calendar rather than only returned. Otherwise the
    // rows keep showing the last good run and the calendar looks healthy while
    // it has quietly stopped updating.
    for (const source of sources) {
      await admin.rpc('staff_record_sync_failure', {
        p_calendar_id: source.google_calendar_id, p_message: auth.error,
      });
    }
    return json(502, { error: auth.error });
  }
  const accessToken = auth.token;

  const results: unknown[] = [];

  for (const source of sources) {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - source.days_back);
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + source.days_ahead);

    try {
      // Stamped BEFORE the request, not after. The prune's grace period is
      // measured from this, and a slow read would otherwise narrow the very
      // window it exists to provide.
      const fetchedAt = new Date().toISOString();

      const { items, timeZone: apiTimeZone } = await listEvents(
        accessToken, source.google_calendar_id, windowStart, windowEnd
      );
      // Google's own answer first, the stored value as a fallback — the same
      // precedence the feed had, where X-WR-TIMEZONE beat the column.
      const timeZone = apiTimeZone || source.time_zone || FALLBACK_TZ;
      const events = items
        .map(item => fromGoogle(item, timeZone))
        .filter((e): e is SyncEvent => e !== null);

      const { data: counts, error: rpcErr } = await admin.rpc('staff_sync_google_events', {
        p_calendar_id: source.google_calendar_id,
        p_window_start: isoDate(windowStart),
        p_window_end: isoDate(windowEnd),
        p_events: events,
        // When this read happened. The prune spares rows touched within
        // fifteen minutes of it. That grace was written because Google's ICS
        // lagged the API, so an event this app had just pushed was missing
        // from the feed, got pruned, and the run reported 'ok' for doing it.
        // Reading the API closes that gap — reader and writer now see the same
        // thing — so this is a guard against clock skew rather than the thing
        // holding the two directions together.
        p_fetched_at: fetchedAt,
      });
      if (rpcErr) throw new Error(rpcErr.message);

      results.push({
        calendar: source.label, timeZone,
        fetched: items.length, parsed: events.length,
        ...(counts ?? {}),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Sync failed for ${source.label}:`, message);
      await admin.rpc('staff_record_sync_failure', {
        p_calendar_id: source.google_calendar_id, p_message: message,
      });
      results.push({ calendar: source.label, error: message });
    }
  }

  // 200 even when one calendar failed: the per-source outcome is in the body and
  // on the row, which is a better place to read it than the function logs.
  return json(200, { synced: results });
});
