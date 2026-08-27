// =============================================================================
// staff-calendar-push — the app writes back to Google
// =============================================================================
//
// The other half of the staff calendar. staff-calendar-sync pulls Google into
// calendar_events; this pushes an admin's create/edit/delete out to Google.
//
// GOOGLE IS THE SOURCE OF TRUTH
//
// Nothing here writes calendar_events until Google has accepted the change.
// The order matters: a row written first and a failed API call second leaves
// the app showing an event the studio's calendar has never heard of, and the
// next sync deletes it again — a change that appears to work and then quietly
// undoes itself an hour later.
//
// So: call Google, and only on success record the row. If the API call fails
// the studio gets an error and the database is untouched.
//
// WHAT THE CLIENT SENDS, AND WHY IT IS TWO SHAPES
//
//   googleEvent — the Google resource, built by src/lib/googleEventMap.ts
//   row         — the same event in calendar_events' own columns
//
// The mapping between them is the part that silently puts an event on the
// wrong day (Google's end.date is EXCLUSIVE; calendar_events stores the last
// day INCLUSIVE), so it lives in a tested module rather than in here. Both
// shapes are field-whitelisted below — neither is written through as given.
//
// They could in principle disagree, and an admin who forced that would get a
// row that briefly differs from Google until the next sync corrects it. That
// sync owns every source='google' row and upserts by google_event_id, so the
// drift is self-healing, and an admin can already edit Google directly.
//
// AUTH
//
//   admin / super_admin — the studio's own people, via their JWT
//   service role        — reserved for a future scheduled push
//
// Google itself is reached with the studio's refresh token from
// google_credentials, which only the service role can read.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  // A header the preflight does not list makes the browser send OPTIONS and
  // then nothing at all. x-application-name has done this here before.
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
const CAL_API = 'https://www.googleapis.com/calendar/v3/calendars';

interface GoogleDateTime { date?: string; dateTime?: string; timeZone?: string }

interface PushBody {
  action: 'create' | 'update' | 'delete';
  calendarId: string;
  /** calendar_events.id — required for update and delete. */
  eventId?: string;
  /** Google's own id — required for update and delete. */
  googleEventId?: string;
  googleEvent?: {
    summary?: string;
    description?: string;
    location?: string;
    start?: GoogleDateTime;
    end?: GoogleDateTime;
  };
  row?: Record<string, unknown>;
}

/**
 * Copy only the fields Google is allowed to be told about.
 *
 * The client builds this object, so writing it through as given would let an
 * admin set attendees, organiser, conferencing or reminders on a studio
 * calendar via an app that has no UI for any of it. Five fields is the whole
 * feature; anything else is dropped silently rather than rejected, because a
 * future client sending an extra field should not break the save.
 */
const cleanDateTime = (d: GoogleDateTime | undefined): GoogleDateTime | null => {
  if (!d) return null;
  if (typeof d.date === 'string') return { date: d.date };
  if (typeof d.dateTime === 'string') {
    return d.timeZone
      ? { dateTime: d.dateTime, timeZone: String(d.timeZone) }
      : { dateTime: d.dateTime };
  }
  return null;
};

const cleanGoogleEvent = (raw: PushBody['googleEvent']) => {
  const start = cleanDateTime(raw?.start);
  const end = cleanDateTime(raw?.end);
  const summary = String(raw?.summary ?? '').trim();

  if (!summary) return { error: 'An event needs a title.' };
  if (!start || !end) return { error: 'An event needs a start and an end.' };
  // Mixing the two forms produces a 400 from Google that names neither field.
  if (Boolean(start.date) !== Boolean(end.date)) {
    return { error: 'An event must be all-day at both ends, or neither.' };
  }

  const out: Record<string, unknown> = { summary, start, end };
  const description = String(raw?.description ?? '').trim();
  const location = String(raw?.location ?? '').trim();
  if (description) out.description = description;
  if (location) out.location = location;
  return { event: out };
};

/** calendar_events columns the app may set. `source` and the google ids are
 *  set here, not by the caller — they are what the sync uses for ownership. */
const ROW_FIELDS = [
  'title', 'description', 'location',
  'start_date', 'start_time', 'end_date', 'end_time',
  'is_all_day',
] as const;

const cleanRow = (raw: Record<string, unknown> | undefined) => {
  const out: Record<string, unknown> = {};
  for (const f of ROW_FIELDS) {
    if (raw && f in raw) out[f] = raw[f];
  }
  return out;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!url || !anonKey || !serviceKey) {
    return json(500, { error: 'Function is missing Supabase environment configuration' });
  }
  if (!clientId || !clientSecret) {
    return json(500, { error: 'Google OAuth is not configured on the server' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Missing Authorization header' });
  const bearer = authHeader.replace(/^Bearer\s+/i, '');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Same shape as the sync functions: the service role is let through for a
  // future scheduled push; anyone else must be a real, active admin.
  const isService = bearer === serviceKey;
  // calendar_events.created_by is NOT NULL, so who is doing this has to survive
  // past the auth check rather than being scoped to it.
  let actor = 'cron';

  if (!isService) {
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: 'Invalid or expired session' });

    const { data: profile } = await admin
      .from('profiles').select('role, is_active').eq('id', userData.user.id).single();

    const isManagement = profile?.role === 'admin' || profile?.role === 'super_admin';
    if (!profile || !isManagement || profile.is_active === false) {
      return json(403, { error: 'Only admins can change the studio calendar.' });
    }

    actor = userData.user.id;
  }

  let body: PushBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body must be JSON' });
  }

  if (!['create', 'update', 'delete'].includes(body.action)) {
    return json(400, { error: 'Unknown action' });
  }

  // The calendar must be one this studio actually syncs. Without this an admin
  // could write to any calendar id they could name, including someone else's.
  const { data: source } = await admin
    .from('calendar_sources')
    .select('google_calendar_id, label, time_zone, is_enabled')
    .eq('google_calendar_id', body.calendarId)
    .maybeSingle();

  if (!source || source.is_enabled === false) {
    return json(400, { error: 'That is not one of the studio calendars.' });
  }

  // ------------------------------------------------------------ the token
  const { data: cred } = await admin
    .from('google_credentials')
    .select('refresh_token')
    .eq('id', 'calendar')
    .maybeSingle();

  if (!cred?.refresh_token) {
    return json(409, {
      error: 'Google is not connected.',
      description: 'Connect the studio Google account on the Calendar page first.',
    });
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: cred.refresh_token,
    }).toString(),
  });
  const tokenPayload = await tokenRes.json().catch(() => null);

  if (!tokenRes.ok || !tokenPayload?.access_token) {
    // invalid_grant means the studio revoked the app, or changed the password
    // on that account. Recorded so the UI can say "reconnect" rather than
    // showing the same opaque failure on every save from now on.
    const reason = tokenPayload?.error ?? 'token_refresh_failed';
    await admin.from('google_credentials')
      .update({ last_error: reason, updated_at: new Date().toISOString() })
      .eq('id', 'calendar');
    return json(502, {
      error: 'Google refused the stored connection.',
      description: reason === 'invalid_grant'
        ? 'The connection was revoked. Reconnect the studio Google account.'
        : reason,
    });
  }

  const accessToken = tokenPayload.access_token as string;
  const calPath = `${CAL_API}/${encodeURIComponent(body.calendarId)}/events`;

  // ------------------------------------------------------------- delete
  if (body.action === 'delete') {
    if (!body.googleEventId) return json(400, { error: 'googleEventId is required' });

    const res = await fetch(`${calPath}/${encodeURIComponent(body.googleEventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // 410 Gone means it was already deleted in Google. That is the state the
    // caller asked for, so it is a success, not an error to show the studio.
    if (!res.ok && res.status !== 410) {
      const detail = await res.text().catch(() => '');
      console.error('Google delete failed:', res.status, detail.slice(0, 300));
      return json(res.status, { error: 'Google refused the delete.', status: res.status });
    }

    if (body.eventId) {
      await admin.from('calendar_events').delete().eq('id', body.eventId);
    }
    await admin.from('google_credentials')
      .update({ last_used_at: new Date().toISOString(), last_error: null })
      .eq('id', 'calendar');

    return json(200, { deleted: true });
  }

  // -------------------------------------------------------- create / update
  const cleaned = cleanGoogleEvent(body.googleEvent);
  if ('error' in cleaned) return json(400, { error: cleaned.error });

  const isUpdate = body.action === 'update';
  if (isUpdate && !body.googleEventId) {
    return json(400, { error: 'googleEventId is required to update' });
  }
  // Both, or the row write below runs .eq('id', undefined) and PostgREST
  // happily updates nothing while reporting success.
  if (isUpdate && !body.eventId) {
    return json(400, { error: 'eventId is required to update' });
  }

  const res = await fetch(
    isUpdate ? `${calPath}/${encodeURIComponent(body.googleEventId!)}` : calPath,
    {
      // PATCH, not PUT: an update should not blank fields this app has no UI
      // for. A recurrence rule set in Google survives an edit made here.
      method: isUpdate ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cleaned.event),
    }
  );
  const saved = await res.json().catch(() => null);

  if (!res.ok) {
    console.error('Google write failed:', res.status, saved?.error?.message);
    return json(res.status, {
      error: 'Google refused the change.',
      description: saved?.error?.message ?? null,
      status: res.status,
    });
  }

  // Google has it. Now the row — from the app's own values plus the id Google
  // just assigned, which is the only thing here the app did not already know.
  const row = {
    ...cleanRow(body.row),
    source: 'google',
    google_calendar_id: body.calendarId,
    google_event_id: saved.id,
    updated_at: new Date().toISOString(),
  };

  const { data: written, error: writeErr } = isUpdate
    ? await admin.from('calendar_events').update(row).eq('id', body.eventId!).select().maybeSingle()
    // created_by only on insert: an edit should not reassign authorship of an
    // event somebody else made.
    : await admin.from('calendar_events').insert({ ...row, created_by: actor }).select().maybeSingle();

  if (writeErr) {
    // Google is already updated, so this is not a failure the studio can
    // retry into a clean state — say so plainly. The next sync reconciles it.
    console.error('Row write failed after a successful Google write:', writeErr.message);
    return json(200, {
      googleEventId: saved.id,
      row: null,
      warning: 'Saved to Google, but the app copy did not update. The next sync will correct it.',
    });
  }

  await admin.from('google_credentials')
    .update({ last_used_at: new Date().toISOString(), last_error: null })
    .eq('id', 'calendar');

  return json(200, { googleEventId: saved.id, row: written });
});
