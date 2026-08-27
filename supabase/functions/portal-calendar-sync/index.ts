// =============================================================================
// portal-calendar-sync — Google Calendar into the parent portal (phase 4)
// =============================================================================
//
// Mirrors each configured Google calendar into portal_events as `source =
// 'google'` rows, so a parent's calendar is current whether or not anyone has
// opened the staff app. v9 built the shape for this: a partial unique index on
// (google_calendar_id, google_event_id) WHERE source = 'google', and the note
// that the sync owns those rows and never touches 'manual' ones.
//
// WHO CALLS IT
//
//   cron   — pg_cron + pg_net, twice an hour, with the service role key.
//   admin  — the "Sync now" button in the portal manager, with their own JWT.
//
// Those are told apart by comparing the bearer token to the service role key.
// A user JWT is then required to belong to an active admin. Anything else is
// refused here, and refused again by portal_sync_google_events(), which checks
// auth.role() and is_admin() for itself.
//
// WHY A SERVICE ACCOUNT AND NOT THE STAFF OAUTH TOKENS
//
// An unattended job cannot depend on a person's refresh token. It breaks when
// they leave, when they revoke access, and — if the OAuth consent screen is
// still in Testing — every seven days, silently. A service account with the
// studio calendar shared to it read-only has no such expiry and belongs to the
// studio rather than to an employee.
//
// SETUP
//
//   1. Google Cloud → IAM → Service Accounts → create one, add a JSON key.
//   2. Google Calendar → the studio calendar → Settings and sharing → share
//      with the service account's email, "See all event details".
//   3. Copy the Calendar ID from the same settings page into
//      portal_calendar_sources.google_calendar_id (v12, section 3).
//   4. Set GOOGLE_SERVICE_ACCOUNT_JSON here to the whole key file.
//
// Secrets: GOOGLE_SERVICE_ACCOUNT_JSON
// Deployed with verify_jwt: true.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  // Reflected from the request rather than hard-coded. src/lib/supabase.ts sets
  // a global 'x-application-name' header on EVERY Supabase call, and a header
  // the preflight does not allow makes the browser refuse to send the real
  // request — an OPTIONS 200 followed by nothing, and "Failed to send a request
  // to the Edge Function" on the client. Listing headers by hand means every
  // future one silently breaks this the same way.
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const PAGE_SIZE = 250;
const MAX_PAGES = 20; // 5000 events; a studio season is a fraction of that

// ------------------------------------------------------------- service account

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64urlJson = (value: unknown): string =>
  b64url(new TextEncoder().encode(JSON.stringify(value)));

/**
 * Sign the assertion Google swaps for an access token.
 *
 * The key file's private_key is PEM-wrapped PKCS#8; Web Crypto wants the raw
 * DER, hence the strip-and-decode.
 */
const importPrivateKey = async (pem: string): Promise<CryptoKey> => {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
};

const getGoogleAccessToken = async (): Promise<string> => {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');

  let key: { client_email: string; private_key: string };
  try {
    key = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  if (!key.client_email || !key.private_key) {
    throw new Error('Service account key is missing client_email or private_key');
  }

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: key.client_email,
    scope: CALENDAR_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson(claims)}`;
  const cryptoKey = await importPrivateKey(key.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const assertion = `${signingInput}.${b64url(new Uint8Array(signature))}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.access_token) {
    throw new Error(
      `Google refused the service account: ${payload?.error ?? res.status} ${payload?.error_description ?? ''}`.trim()
    );
  }
  return payload.access_token as string;
};

// -------------------------------------------------------------------- mapping

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

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
const toPlainText = (html: string | undefined): string => {
  if (!html) return '';
  return html
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

const shiftDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

const mapEvent = (e: GoogleEvent): SyncEvent | null => {
  const status = e.status ?? 'confirmed';

  // A cancelled instance still needs its id so the row can be removed.
  if (status === 'cancelled') {
    return {
      google_event_id: e.id,
      status,
      title: '',
      description: '',
      location: null,
      starts_at: null,
      ends_at: null,
      is_all_day: false,
    };
  }

  const isAllDay = !!e.start?.date;
  let startsAt: string | null = null;
  let endsAt: string | null = null;

  if (isAllDay) {
    startsAt = allDayToIso(e.start!.date!);
    // Google's all-day end.date is EXCLUSIVE — a single-day event on the 30th
    // ends on the 1st. The portal stores the last day inclusive, so it is
    // shifted back, and a one-day event ends up with no end at all.
    if (e.end?.date) {
      const lastDay = shiftDays(e.end.date, -1);
      endsAt = lastDay > e.start!.date! ? allDayToIso(lastDay) : null;
    }
  } else if (e.start?.dateTime) {
    startsAt = new Date(e.start.dateTime).toISOString();
    endsAt = e.end?.dateTime ? new Date(e.end.dateTime).toISOString() : null;
  }

  // No usable start: nothing sensible to put on a calendar.
  if (!startsAt) return null;

  return {
    google_event_id: e.id,
    status,
    title: (e.summary ?? '').trim(),
    description: toPlainText(e.description),
    location: e.location?.trim() || null,
    starts_at: startsAt,
    ends_at: endsAt,
    is_all_day: isAllDay,
  };
};

// ---------------------------------------------------------------------- fetch

const fetchCalendarEvents = async (
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleEvent[]> => {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      // Recurring events are expanded into instances: the portal calendar is a
      // list of dates, and an unexpanded RRULE would be one row for a class
      // that meets weekly.
      singleEvents: 'true',
      showDeleted: 'true',
      orderBy: 'startTime',
      maxResults: String(PAGE_SIZE),
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = payload?.error?.message ?? `HTTP ${res.status}`;
      // 404 here almost always means the calendar was never shared with the
      // service account, which is the one setup step that is easy to miss.
      throw new Error(
        res.status === 404
          ? `Calendar not found or not shared with the service account (${calendarId})`
          : `Google Calendar API: ${reason}`
      );
    }

    events.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken;
    pages += 1;
  } while (pageToken && pages < MAX_PAGES);

  if (pageToken) {
    // Stopping early is fine for the upsert but NOT for the prune, which would
    // read the missing pages as deletions. The caller turns this into an error.
    throw new Error(`Calendar has more than ${PAGE_SIZE * MAX_PAGES} events in the window`);
  }

  return events;
};

/**
 * The `role` claim, without verifying the signature.
 *
 * Safe only because this is never the thing granting access: Supabase's own
 * gateway has already verified the JWT (verify_jwt: true) before the function
 * runs, so by here the token is known-good and this is just reading it.
 */
const jwtRole = (token: string): string | null => {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalised = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalised.padEnd(Math.ceil(normalised.length / 4) * 4, '=')));
    return decoded?.role ?? null;
  } catch {
    return null;
  }
};

// ----------------------------------------------------------------------- main

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

  // ---------------------------------------------------------- authorise
  //
  // Two callers, told apart by the token. The straight comparison covers the
  // cron job, which sends the service role key verbatim. The claim check is the
  // fallback for a project on the newer API key format, where the key the cron
  // holds and SUPABASE_SERVICE_ROLE_KEY here are not byte-identical but both
  // still carry role=service_role. Without it the setup fails as a 403 that
  // looks like a permissions bug rather than a key-format mismatch.
  const isCron = bearer === serviceKey || jwtRole(bearer) === 'service_role';

  if (!isCron) {
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: 'Invalid or expired session' });

    // Read the profile with the service role, so RLS cannot shape the answer.
    const probe = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: profile } = await probe
      .from('profiles')
      .select('role, is_active')
      .eq('id', userData.user.id)
      .single();

    // Management or above, permanently: the calendar and the whole parent
    // portal are things a plain admin keeps under the v13 split. `role !==
    // 'admin'` would have locked out every promoted account.
    const isManagement = profile?.role === 'admin' || profile?.role === 'super_admin';
    if (!profile || !isManagement || profile.is_active === false) {
      return json(403, { error: 'Admin access required' });
    }
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let requestedProgramId: string | null = null;
  try {
    const body = await req.json();
    requestedProgramId = body?.programId ?? null;
  } catch {
    // cron posts {"source":"cron"}; an empty body is fine too.
  }

  // ------------------------------------------------------------- sources
  let query = admin
    .from('portal_calendar_sources')
    .select('program_id, google_calendar_id, is_enabled, days_back, days_ahead')
    .eq('is_enabled', true);

  if (requestedProgramId) query = query.eq('program_id', requestedProgramId);

  const { data: sources, error: sourcesErr } = await query;
  if (sourcesErr) {
    console.error('Could not read calendar sources:', sourcesErr);
    return json(500, { error: 'Could not read calendar sources' });
  }
  if (!sources?.length) {
    return json(200, { synced: [], note: 'No enabled calendar sources' });
  }

  // One token for the whole run: it is valid for an hour and does not depend on
  // which calendar is being read.
  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Service account auth failed:', message);
    // Every source failed for the same reason, and each needs to say so in the
    // manager rather than sitting on a stale "ok" from an earlier run.
    await Promise.all(
      sources.map(s =>
        admin.rpc('portal_record_sync_failure', { p_program_id: s.program_id, p_message: message })
      )
    );
    return json(502, { error: message });
  }

  const results: unknown[] = [];

  for (const source of sources) {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - source.days_back);
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + source.days_ahead);

    try {
      const raw = await fetchCalendarEvents(
        accessToken,
        source.google_calendar_id,
        windowStart.toISOString(),
        windowEnd.toISOString()
      );

      const events = raw.map(mapEvent).filter((e): e is SyncEvent => e !== null);

      const { data: counts, error: rpcErr } = await admin.rpc('portal_sync_google_events', {
        p_program_id: source.program_id,
        p_calendar_id: source.google_calendar_id,
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_events: events,
      });

      if (rpcErr) throw new Error(rpcErr.message);

      results.push({ programId: source.program_id, fetched: raw.length, ...(counts ?? {}) });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Sync failed for ${source.google_calendar_id}:`, message);
      await admin.rpc('portal_record_sync_failure', {
        p_program_id: source.program_id,
        p_message: message,
      });
      results.push({ programId: source.program_id, error: message });
    }
  }

  // 200 even when a calendar failed: the per-source outcome is in the body and
  // on the row, and a non-2xx would make cron.job_run_details the place people
  // look for a problem that is better described in the manager.
  return json(200, { synced: results });
});
