// =============================================================================
// calendar-tidy — clear one exact boilerplate description from Google
// =============================================================================
//
// WHAT IT IS FOR
//
// The studio's calendars were built from a master schedule by a tool that
// stamped a bookkeeping line onto every event. 52 of 62 events carried the
// description "Status: Confirmed" and nothing else, which parents saw on every
// card in the portal — a third of each card spent saying nothing.
//
// WHY IT IS SHAPED THIS WAY
//
// It is deliberately not a general "edit descriptions" endpoint, because the
// other 10 descriptions are real working notes ("one of three competing
// windows — delete the two that don't happen") and losing those would be worse
// than the noise. So:
//
//   - It takes an EXACT string to match. A description that differs by a
//     character is left alone. There is no pattern, no prefix, no wildcard.
//   - It PATCHes `{ description: '' }` and nothing else. Titles, dates, times,
//     colours, reminders and attendees are not in the request body, so a bug
//     here cannot move an event or rename it — the worst it can do is clear a
//     description that matched the string it was given.
//   - dryRun is the default. It reports what it would touch and changes
//     nothing unless explicitly told to.
//
// A snapshot of every description was taken into
// calendar_description_backup_20260827 before this was first run, because
// calendar_events is a mirror that the sync rewrites every minute — the mirror
// is not a backup.
//
// Super admin or service role only. Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getAccessToken } from '../_shared/googleCalendar.ts';

const CAL_API = 'https://www.googleapis.com/calendar/v3/calendars';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

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

/**
 * The API addresses events by their bare id; rows store the iCal UID, which is
 * that id with '@google.com' on the end. Same derivation staff-calendar-push
 * uses. An id carrying '::' is a feed-era recurrence instance and is refused
 * rather than guessed at.
 */
const apiEventId = (uid: string): string | null => {
  if (!uid || uid.includes('::')) return null;
  return uid.split('@')[0] || null;
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
    if (!profile || profile.role !== 'super_admin' || profile.is_active === false) {
      return json(403, { error: 'Super admin access required' });
    }
  }

  let body: { match?: string; dryRun?: boolean } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    /* an empty body means a dry run with no match, which does nothing */
  }

  const match = typeof body.match === 'string' ? body.match : '';
  if (!match.trim()) {
    return json(400, { error: 'match is required: the exact description text to clear' });
  }
  // Default to true. Someone who wants to change 52 real calendar entries can
  // say so; a mistyped call should report, not act.
  const dryRun = body.dryRun !== false;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: rows, error: rowsErr } = await admin
    .from('calendar_events')
    .select('google_calendar_id, google_event_id, google_api_event_id, title, start_date')
    .eq('source', 'google')
    .eq('description', match);

  if (rowsErr) return json(500, { error: rowsErr.message });
  if (!rows?.length) return json(200, { match, matched: 0, note: 'Nothing has that exact description' });

  if (dryRun) {
    return json(200, {
      match,
      dryRun: true,
      matched: rows.length,
      wouldClear: rows.map(r => ({ title: r.title, date: r.start_date })),
    });
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return json(500, { error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set' });
  }

  const auth = await getAccessToken(admin, clientId, clientSecret);
  if (auth.error) return json(502, { error: auth.error });

  let cleared = 0;
  const failures: unknown[] = [];

  for (const row of rows) {
    const id = row.google_api_event_id || apiEventId(row.google_event_id);
    if (!id) {
      failures.push({ title: row.title, error: 'No usable Google id' });
      continue;
    }

    const res = await fetch(
      `${CAL_API}/${encodeURIComponent(row.google_calendar_id)}/events/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        // The entire request body. Nothing else can be affected.
        body: JSON.stringify({ description: '' }),
      }
    );

    if (res.ok) {
      cleared += 1;
    } else {
      const detail = (await res.text().catch(() => '')).slice(0, 160);
      failures.push({ title: row.title, status: res.status, detail });
    }
  }

  return json(200, { match, dryRun: false, matched: rows.length, cleared, failures });
});
