// =============================================================================
// portal-calendar-sync — Google Calendar into the parent portal
// =============================================================================
//
// Mirrors each configured Google calendar into portal_events as `source =
// 'google'` rows, so a parent's calendar is current whether or not anyone has
// opened the staff app. v9 built the shape and v23 widened it: a partial unique
// index on (program_id, google_calendar_id, google_event_id) WHERE source =
// 'google', and the rule that the sync owns those rows and never touches
// 'manual' ones.
//
// A PROGRAM MAY READ SEVERAL CALENDARS  (v23)
//
// All-Stars reads the All-Stars calendar and the Studio calendar, and Studio
// also feeds `academy` — so one Google event is a row for two programs at once.
// The loop below was already per-source and needed no change for that; what it
// needed was to say WHICH source each result and each failure belongs to, since
// a program's status line is no longer a single row.
//
// WHY THE CALENDAR API AND NOT THE iCal FEED  (v21)
//
// v17 put this on Google's secret iCal address, on the reasoning that a feed
// is just a URL and needs no credentials. True, and it worked — but a feed
// caps how fresh the portal can ever be. Google rate-limits those addresses
// hard (measured 27 Aug 2026: one scheduled run in five rejected with HTTP
// 429, and a second fetch inside twenty minutes rejected reliably), so polling
// faster to get fresher data is the one thing that makes it worse. And a feed
// cannot be pushed: Google has no way to tell us something moved.
//
// The API has neither limit, and supports events.watch. The credential is
// already here — the studio account connected for the staff editor carries the
// calendar.events scope, which reads and watches as well as writes.
//
// Recurrence is Google's problem again now (singleEvents=true), which is why
// ical.js, the occurrence iterator and the EXDATE handling are all gone.
//
// Row identity is unchanged: google_event_id held the iCal UID and the API
// returns exactly that as iCalUID, so this renumbered nothing on cutover.
//
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Deployed with
// verify_jwt: true.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  getAccessToken,
  listEvents,
  shiftDate,
  toPlainText,
} from '../_shared/googleCalendar.ts';

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

/** 'YYYY-MM-DD' -> UTC midnight, the convention portal_events stores. */
const allDayToIso = (date: string): string => `${date}T00:00:00.000Z`;

/**
 * One Google API event -> one portal row.
 *
 * The identifier is iCalUID, not id. Both are unique per occurrence once
 * singleEvents is on, but iCalUID is the value the feed path wrote, so using it
 * means this switch matched every existing row instead of replacing the lot.
 */
const fromGoogle = (item: any): SyncEvent | null => {
  const id = String(item.iCalUID ?? '').trim();
  if (!id) return null;

  const isAllDay = Boolean(item.start?.date);
  let starts_at: string | null = null;
  let ends_at: string | null = null;

  if (isAllDay) {
    const start = item.start.date as string;
    starts_at = allDayToIso(start);
    // end.date is EXCLUSIVE — a single-day event on the 30th ends on the 1st.
    // The portal stores the last day inclusive, so it shifts back, and a
    // one-day event ends up with no end at all. Same rule the feed path had
    // for DTEND, and the exact inverse of what staff-calendar-push writes.
    if (item.end?.date) {
      const last = shiftDate(item.end.date as string, -1);
      ends_at = last > start ? allDayToIso(last) : null;
    }
  } else if (item.start?.dateTime) {
    // portal_events stores real timestamptz instants, so unlike the staff
    // calendar there is no wall-clock splitting to do — the instant is the
    // whole truth and the client renders it in the reader's zone.
    starts_at = new Date(item.start.dateTime).toISOString();
    ends_at = item.end?.dateTime ? new Date(item.end.dateTime).toISOString() : null;
  }

  if (!starts_at) return null;

  return {
    google_event_id: id,
    status: 'confirmed',
    title: String(item.summary ?? '').trim(),
    description: toPlainText(item.description),
    location: String(item.location ?? '').trim() || null,
    starts_at,
    ends_at,
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
    .select('program_id, google_calendar_id, days_back, days_ahead')
    .eq('is_enabled', true);
  if (requestedProgramId) query = query.eq('program_id', requestedProgramId);

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
    // Recorded against every source, not just returned. Otherwise the rows keep
    // showing the last good run and the portal looks healthy while it silently
    // stops updating.
    for (const source of sources) {
      await admin.rpc('portal_record_sync_failure', {
        p_program_id: source.program_id,
        p_message: auth.error,
        p_calendar_id: source.google_calendar_id,
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
      const { items } = await listEvents(
        accessToken, source.google_calendar_id, windowStart, windowEnd
      );
      const events = items
        .map(fromGoogle)
        .filter((e): e is SyncEvent => e !== null);

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
        calendarId: source.google_calendar_id,
        fetched: items.length, parsed: events.length,
        ...(counts ?? {}),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Sync failed for ${source.google_calendar_id}:`, message);
      await admin.rpc('portal_record_sync_failure', {
        p_program_id: source.program_id,
        p_message: message,
        p_calendar_id: source.google_calendar_id,
      });
      results.push({
        programId: source.program_id,
        calendarId: source.google_calendar_id,
        error: message,
      });
    }
  }

  // 200 even when a calendar failed: the per-source outcome is in the body and
  // on the row, which is a better place to read it than cron.job_run_details.
  return json(200, { synced: results });
});
