// =============================================================================
// staff-calendar-sync — subscribe the staff Calendar to iCal feeds
// =============================================================================
//
// The staff Calendar is a read-only mirror of three Google calendars under one
// studio account. Nobody authors events in the app; Google is the source of
// truth and this pulls it in.
//
// WHY iCal AND NOT THE GOOGLE API
//
// The first version of this read the Calendar API with a service account. It
// worked, but it cost a Google Cloud project, a JSON key and a per-calendar
// share before a single event showed up — a lot of setup for "show me these
// three calendars". An iCal feed is just a URL. Subscribing to one is what
// every other calendar app does, and it needs no Google Cloud at all.
//
// The cost is that Google is no longer expanding recurring events for us: a
// feed carries the RRULE and we expand it here. That is what ical.js is for,
// and it is also what handles the parts that are easy to get wrong by hand —
// EXDATE for a cancelled week, RECURRENCE-ID for a class that moved once, and
// the VTIMEZONE definitions that make a 4pm class 4pm across a DST boundary.
//
// TWO SHAPES OF URL, both fine in calendar_sources.ics_url:
//
//   public  .../ical/<ID>/public/basic.ics          — needs the calendar ticked
//                                                     "Make available to public"
//   secret  .../ical/<ID>/private-<TOKEN>/basic.ics — from "Secret address in
//                                                     iCal format"; stays private
//
// The feed is fetched server-side, so a secret address never reaches a browser.
//
// No secrets required. Deployed with verify_jwt: true.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import ICAL from 'https://esm.sh/ical.js@2.1.0';

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

const FALLBACK_TZ = 'America/Los_Angeles';
// A season of weekly classes is a few hundred instances. This is the runaway
// guard for a malformed RRULE with no UNTIL and no COUNT, which would otherwise
// iterate forever.
const MAX_OCCURRENCES = 2000;

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

/**
 * Google descriptions may contain HTML. The calendar renders event text as
 * escaped plain text, so tags left in would show literally — a class note
 * reading `<b>Bring shoes</b>` on the page.
 */
const toPlainText = (html: string | undefined | null): string => {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * An instant, as the wall clock reads it where the studio is.
 *
 * calendar_events stores date and time as TEXT with no zone and the app renders
 * them verbatim, so "19:30" has to already mean 19:30 in the studio's zone.
 * Deriving it from the UTC instant instead would show a 7pm class as 2am the
 * next day for half the year, and the drift would change at every DST boundary.
 */
const localParts = (d: Date, timeZone: string): { date: string; time: string } => ({
  // en-CA formats as YYYY-MM-DD, which is the storage format.
  date: new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d),
  time: new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d),
});

/** ICAL.Time for an all-day value -> 'YYYY-MM-DD', with no zone maths at all. */
const dateOnly = (t: any): string =>
  `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;

const shiftDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

const buildEvent = (
  id: string,
  item: any,
  startT: any,
  endT: any,
  timeZone: string,
  cancelled: boolean
): SyncEvent | null => {
  if (cancelled) {
    return {
      google_event_id: id, status: 'cancelled',
      title: '', description: '', location: null,
      start_date: null, start_time: null, end_date: null, end_time: null,
      is_all_day: false,
    };
  }

  const isAllDay = Boolean(startT?.isDate);
  let start_date: string | null = null;
  let start_time: string | null = null;
  let end_date: string | null = null;
  let end_time: string | null = null;

  if (isAllDay) {
    start_date = dateOnly(startT);
    // DTEND is EXCLUSIVE for DATE values, exactly as in the Google API: a
    // one-day event on the 30th ends on the 1st. We store the last day
    // inclusive, so it shifts back and a single-day event gets no end at all.
    if (endT) {
      const last = shiftDays(dateOnly(endT), -1);
      end_date = last > start_date ? last : null;
    }
  } else if (startT) {
    const s = localParts(startT.toJSDate(), timeZone);
    start_date = s.date;
    start_time = s.time;
    if (endT) {
      const e = localParts(endT.toJSDate(), timeZone);
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
 * Parse a feed and flatten it into rows for the window.
 *
 * Recurring events are expanded into one row per occurrence: the calendar is a
 * list of dates, and an unexpanded rule would be a single row for a class that
 * meets every week.
 */
const parseFeed = (
  ics: string,
  windowStart: Date,
  windowEnd: Date,
  fallbackTz: string
): { events: SyncEvent[]; timeZone: string; expanded: number } => {
  const comp = new ICAL.Component(ICAL.parse(ics));

  // VTIMEZONE blocks first, or a TZID the feed defines itself resolves to UTC
  // and every time in that zone silently shifts.
  for (const vt of comp.getAllSubcomponents('vtimezone')) {
    const zone = new ICAL.Timezone(vt);
    if (!ICAL.TimezoneService.has(zone.tzid)) ICAL.TimezoneService.register(zone.tzid, zone);
  }

  const timeZone = String(comp.getFirstPropertyValue('x-wr-timezone') || fallbackTz);

  const vevents = comp.getAllSubcomponents('vevent');
  const masters: any[] = [];
  const exceptions: any[] = [];
  for (const v of vevents) {
    (v.getFirstPropertyValue('recurrence-id') ? exceptions : masters).push(v);
  }

  const out: SyncEvent[] = [];
  let expanded = 0;

  for (const v of masters) {
    const ev = new ICAL.Event(v);

    // A single instance that was moved or edited arrives as its own VEVENT with
    // a RECURRENCE-ID. Relating it lets the iterator below hand back the
    // override rather than the original slot.
    for (const ex of exceptions) {
      if (ex.getFirstPropertyValue('uid') === ev.uid) {
        try { ev.relateException(new ICAL.Event(ex)); } catch { /* not ours */ }
      }
    }

    const cancelled = String(v.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';

    if (!ev.isRecurring()) {
      const row = buildEvent(ev.uid, ev, ev.startDate, ev.endDate, timeZone, cancelled);
      if (row) out.push(row);
      continue;
    }

    const it = ev.iterator();
    let next;
    let n = 0;
    while ((next = it.next()) && n < MAX_OCCURRENCES) {
      n += 1;
      const when = next.toJSDate();
      if (when > windowEnd) break;
      if (when < windowStart) continue;

      let details;
      try {
        details = ev.getOccurrenceDetails(next);
      } catch {
        continue; // EXDATE'd, or an occurrence ical.js cannot resolve
      }

      // Each instance needs its own stable id, or every occurrence of a weekly
      // class would collide on the same UID and only one would survive.
      const id = `${ev.uid}::${next.toString()}`;
      const instCancelled =
        String(details.item?.component?.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';

      const row = buildEvent(
        id, details.item, details.startDate, details.endDate, timeZone, cancelled || instCancelled
      );
      if (row) { out.push(row); expanded += 1; }
    }
  }

  return { events: out, timeZone, expanded };
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
    .select('google_calendar_id, label, ics_url, time_zone, days_back, days_ahead')
    .eq('is_enabled', true);
  if (requestedCalendarId) query = query.eq('google_calendar_id', requestedCalendarId);

  const { data: sources, error: sourcesErr } = await query;
  if (sourcesErr) {
    console.error('Could not read calendar sources:', sourcesErr);
    return json(500, { error: 'Could not read calendar sources' });
  }
  if (!sources?.length) return json(200, { synced: [], note: 'No enabled calendar sources' });

  const results: unknown[] = [];

  for (const source of sources) {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - source.days_back);
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + source.days_ahead);

    try {
      if (!source.ics_url) throw new Error('No iCal URL configured for this calendar');

      const res = await fetch(source.ics_url, { redirect: 'follow' });
      const body = await res.text();

      if (!res.ok) {
        // 404 on the public URL is the one everybody hits: the calendar has not
        // been made public, so the public feed does not exist yet.
        throw new Error(
          res.status === 404
            ? 'Feed not found (404). If this is the public URL, tick "Make available to public" in that calendar\'s Settings and sharing — or paste its secret iCal address instead.'
            : `Could not fetch the feed: HTTP ${res.status}`
        );
      }
      if (!body.includes('BEGIN:VCALENDAR')) {
        // A private calendar answers a public URL with an HTML sign-in page
        // rather than an error, so a 200 is not on its own proof of a feed.
        throw new Error('That URL did not return a calendar feed. The calendar is probably not public yet.');
      }

      const { events, timeZone, expanded } = parseFeed(
        body, windowStart, windowEnd, source.time_zone || FALLBACK_TZ
      );

      const { data: counts, error: rpcErr } = await admin.rpc('staff_sync_google_events', {
        p_calendar_id: source.google_calendar_id,
        p_window_start: isoDate(windowStart),
        p_window_end: isoDate(windowEnd),
        p_events: events,
      });
      if (rpcErr) throw new Error(rpcErr.message);

      results.push({
        calendar: source.label, timeZone,
        parsed: events.length, fromRecurring: expanded,
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
