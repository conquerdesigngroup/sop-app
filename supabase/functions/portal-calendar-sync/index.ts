// =============================================================================
// portal-calendar-sync — Google Calendar into the parent portal
// =============================================================================
//
// Mirrors each configured Google calendar into portal_events as `source =
// 'google'` rows, so a parent's calendar is current whether or not anyone has
// opened the staff app. v9 built the shape: a partial unique index on
// (google_calendar_id, google_event_id) WHERE source = 'google', and the rule
// that the sync owns those rows and never touches 'manual' ones.
//
// WHY iCal AND NOT THE CALENDAR API  (v17)
//
// This used to authenticate as a service account against the Calendar API.
// That was never configured — portal_calendar_sources sat empty for months —
// because it cost a Google Cloud project, a JSON key and a per-calendar share
// before a single event appeared. v16 moved the staff calendar onto iCal feeds
// instead; this brings the portal onto the same mechanism, so there is one way
// this studio talks to Google rather than two.
//
// A feed is just a URL. The cost is that Google no longer expands recurring
// events for us, so ical.js does it here — including EXDATE for a cancelled
// week and RECURRENCE-ID for a class that moved once.
//
// WHO CALLS IT
//
//   cron  — pg_cron + pg_net, with the service role key.
//   admin — the "Sync now" button in the portal manager, with their own JWT.
//
// Told apart by comparing the bearer to the service role key. A user JWT must
// belong to an active admin. Refused again by portal_sync_google_events(),
// which checks auth.role() and is_admin() for itself.
//
// No secrets required. Deployed with verify_jwt: true.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import ICAL from 'https://esm.sh/ical.js@2.1.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  // A header the preflight does not list makes the browser refuse to send the
  // real request — an OPTIONS 200 followed by nothing.
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// A season of weekly classes is a few hundred instances. Runaway guard for a
// malformed RRULE with no UNTIL and no COUNT.
const MAX_OCCURRENCES = 2000;

interface SyncEvent {
  google_event_id: string;
  status: string;
  title: string;
  description: string;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_all_day: boolean;
}

/**
 * Google descriptions may contain HTML. The portal renders update and event
 * text as escaped plain text, so tags left in would be shown to parents
 * literally — `<b>Bring shoes</b>` on the page. Stripped rather than rendered:
 * making this the one place in the portal that emits HTML would undo the
 * decision phase 2 made about staff-authored text.
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

/** 'YYYY-MM-DD' -> UTC midnight, the convention portal_events stores. */
const allDayToIso = (date: string): string => `${date}T00:00:00.000Z`;

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
  id: string, item: any, startT: any, endT: any, cancelled: boolean
): SyncEvent | null => {
  if (cancelled) {
    return {
      google_event_id: id, status: 'cancelled',
      title: '', description: '', location: null,
      starts_at: null, ends_at: null, is_all_day: false,
    };
  }

  const isAllDay = Boolean(startT?.isDate);
  let starts_at: string | null = null;
  let ends_at: string | null = null;

  if (isAllDay) {
    const start = dateOnly(startT);
    starts_at = allDayToIso(start);
    // DTEND is EXCLUSIVE for DATE values — a single-day event on the 30th ends
    // on the 1st. The portal stores the last day inclusive, so it shifts back
    // and a one-day event ends up with no end at all.
    if (endT) {
      const last = shiftDays(dateOnly(endT), -1);
      ends_at = last > start ? allDayToIso(last) : null;
    }
  } else if (startT) {
    // portal_events stores real timestamptz instants, so unlike the staff
    // calendar there is no wall-clock splitting to do here — the instant is
    // the whole truth and the client renders it in the reader's zone.
    starts_at = startT.toJSDate().toISOString();
    ends_at = endT ? endT.toJSDate().toISOString() : null;
  }

  if (!starts_at) return null;

  return {
    google_event_id: id,
    status: 'confirmed',
    title: String(item.summary ?? '').trim(),
    description: toPlainText(item.description),
    location: String(item.location ?? '').trim() || null,
    starts_at, ends_at, is_all_day: isAllDay,
  };
};

/**
 * Parse a feed and flatten it into rows for the window.
 *
 * Recurring events are expanded into one row per occurrence: the portal
 * calendar is a list of dates, and an unexpanded rule would be a single row for
 * a class that meets every week.
 */
const parseFeed = (
  ics: string, windowStart: Date, windowEnd: Date
): { events: SyncEvent[]; expanded: number } => {
  const comp = new ICAL.Component(ICAL.parse(ics));

  // VTIMEZONE blocks first, or a TZID the feed defines itself resolves to UTC
  // and every time in that zone silently shifts.
  for (const vt of comp.getAllSubcomponents('vtimezone')) {
    const zone = new ICAL.Timezone(vt);
    if (!ICAL.TimezoneService.has(zone.tzid)) ICAL.TimezoneService.register(zone.tzid, zone);
  }

  const masters: any[] = [];
  const exceptions: any[] = [];
  for (const v of comp.getAllSubcomponents('vevent')) {
    (v.getFirstPropertyValue('recurrence-id') ? exceptions : masters).push(v);
  }

  const out: SyncEvent[] = [];
  let expanded = 0;

  for (const v of masters) {
    const ev = new ICAL.Event(v);

    // A single instance that was moved or edited arrives as its own VEVENT with
    // a RECURRENCE-ID. Relating it lets the iterator hand back the override
    // rather than the original slot.
    for (const ex of exceptions) {
      if (ex.getFirstPropertyValue('uid') === ev.uid) {
        try { ev.relateException(new ICAL.Event(ex)); } catch { /* not ours */ }
      }
    }

    const cancelled =
      String(v.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';

    if (!ev.isRecurring()) {
      const row = buildEvent(ev.uid, ev, ev.startDate, ev.endDate, cancelled);
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

      const row = buildEvent(id, details.item, details.startDate, details.endDate, cancelled || instCancelled);
      if (row) { out.push(row); expanded += 1; }
    }
  }

  return { events: out, expanded };
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

  // The straight comparison covers the cron job sending the service role key
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

    // Management or above, permanently: the parent portal is something a plain
    // admin keeps under the v13 split. `role !== 'admin'` would have locked out
    // every promoted account.
    const isManagement = profile?.role === 'admin' || profile?.role === 'super_admin';
    if (!profile || !isManagement || profile.is_active === false) {
      return json(403, { error: 'Admin access required' });
    }
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let requestedProgramId: string | null = null;
  try {
    requestedProgramId = (await req.json())?.programId ?? null;
  } catch {
    // cron posts {"source":"cron"}; an empty body is fine too.
  }

  let query = admin
    .from('portal_calendar_sources')
    .select('program_id, google_calendar_id, ics_url, days_back, days_ahead')
    .eq('is_enabled', true);
  if (requestedProgramId) query = query.eq('program_id', requestedProgramId);

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
      if (!source.ics_url) throw new Error('No iCal URL configured for this program');

      const res = await fetch(source.ics_url, { redirect: 'follow' });
      const body = await res.text();

      if (!res.ok) {
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

      const { events, expanded } = parseFeed(body, windowStart, windowEnd);

      const { data: counts, error: rpcErr } = await admin.rpc('portal_sync_google_events', {
        p_program_id: source.program_id,
        p_calendar_id: source.google_calendar_id,
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_events: events,
      });
      if (rpcErr) throw new Error(rpcErr.message);

      results.push({
        programId: source.program_id,
        parsed: events.length, fromRecurring: expanded,
        ...(counts ?? {}),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Sync failed for ${source.google_calendar_id}:`, message);
      await admin.rpc('portal_record_sync_failure', {
        p_program_id: source.program_id, p_message: message,
      });
      results.push({ programId: source.program_id, error: message });
    }
  }

  // 200 even when a calendar failed: the per-source outcome is in the body and
  // on the row, which is a better place to read it than cron.job_run_details.
  return json(200, { synced: results });
});
