// =============================================================================
// google-oauth — the Google token exchange, off the browser
// =============================================================================
//
// WHY THIS EXISTS
//
// src/services/googleCalendar.ts used to POST to Google's token endpoint from
// the browser with `client_secret: process.env.REACT_APP_GOOGLE_CLIENT_SECRET`.
// Every REACT_APP_* var is compiled into the CRA bundle, so the studio's OAuth
// client secret was served in plain text to anyone who opened didc.app and read
// the JavaScript. It was found in three chunks of the live production build.
//
// A client secret in a public bundle lets anyone run OAuth flows as this app —
// a Google consent screen carrying the studio's name, pointed wherever they
// like — and spend the project's quota. Google's own guidance is that a web
// application's secret never reaches a user agent.
//
// The exchange therefore happens here, where Deno.env is actually private.
//
// WHAT v19 ADDED, AND WHY
//
// `exchange` and `refresh` below still hand tokens back to the browser, which
// is what the original per-user Google Calendar feature is built on. That is a
// user's own token on their own device, and it is left alone.
//
// Two-way sync needs something different: a credential that outlives a browser
// tab, so the app can write to Google when nobody is watching. That is what
// `auth_url` / `connect` / `status` / `disconnect` are for. They store ONE
// refresh token for the studio, in google_credentials, which no client can
// read — RLS on, no policies, grants revoked.
//
// Note the service account is gone from this story. It was the original plan
// and the didancecenter.com Workspace blocks service account keys outright
// (iam.disableServiceAccountKeyCreation), so OAuth is what both calendars use.
// An earlier version of this comment claimed portal-calendar-sync authenticated
// as a service account; it reads iCal feeds and always did after v16.
//
// THE LEAKED SECRET IS DEALT WITH
//
// The client whose secret was in the public bundle is not this one. v19 created
// a fresh OAuth client ("DIDC App") in the didc-calendar-sync-506814 project,
// and GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET here are its values. The old
// client can be deleted in Google Cloud Console whenever the per-user feature
// below is retired; until then it still backs `exchange` and `refresh` for
// anyone holding an old token.
//
// REACT_APP_GOOGLE_CLIENT_SECRET must never come back to the Vercel project.
// The new client ID does not need to go there either: `auth_url` builds the
// authorization URL here, so nothing about this client reaches the bundle.
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_SERVICE_ROLE_KEY
// Deployed with verify_jwt: true — only a signed-in employee may use it, and
// the connection actions additionally require admin or above.
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

interface ExchangeBody {
  action: 'exchange';
  code: string;
  redirectUri: string;
}

interface RefreshBody {
  action: 'refresh';
  refreshToken: string;
}

/** Server-side connection actions. Admin or above — checked in the handler. */
interface AuthUrlBody { action: 'auth_url'; redirectUri: string }
interface ConnectBody { action: 'connect'; code: string; redirectUri: string }
interface StatusBody { action: 'status' }
interface DisconnectBody { action: 'disconnect' }

type Body =
  | ExchangeBody | RefreshBody
  | AuthUrlBody | ConnectBody | StatusBody | DisconnectBody;

/**
 * Redirect URIs this function will ever send a user to.
 *
 * Checked against a list rather than trusted from the body: the redirect is
 * where Google delivers the authorization code, so accepting an arbitrary one
 * turns this into a way to have Google hand the studio's calendar grant to
 * somebody else's site. Must match the OAuth client's own list exactly.
 */
const ALLOWED_REDIRECTS = new Set([
  'https://www.didc.app/auth/callback',
  'https://didc.app/auth/callback',
  'http://localhost:3002/auth/callback',
]);

// calendar.events is read AND write on events, which is the whole job — no
// need for the broader `calendar` scope that also lets you delete calendars.
// userinfo.email is only so the UI can say WHICH account is connected; a
// connection that silently belongs to someone's personal account is the thing
// worth being able to see.
const CONNECT_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Missing Authorization header' });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!url || !anonKey) {
    return json(500, { error: 'Function is missing Supabase environment configuration' });
  }
  if (!clientId || !clientSecret) {
    return json(500, { error: 'Google OAuth is not configured on the server' });
  }

  // The caller, as themselves. This function needs no privilege of its own —
  // it only needs to know that the person asking is a real, signed-in employee.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { error: 'Invalid or expired session' });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body must be JSON' });
  }

  // ------------------------------------------------ the studio's connection
  //
  // Split out from the per-user actions below because these read and write a
  // credential that acts for the whole studio. `exchange` and `refresh` only
  // ever touch a token the caller already holds, so any employee may use them.

  if (body.action === 'auth_url' || body.action === 'connect' ||
      body.action === 'status' || body.action === 'disconnect') {

    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!service) return json(500, { error: 'Function is missing the service role key' });

    const admin = createClient(url, service, { auth: { persistSession: false } });

    const { data: profile } = await admin
      .from('profiles').select('role, is_active').eq('id', userData.user.id).single();

    // Management or above, matching portal-calendar-sync. Connecting Google is
    // not something a general employee should be able to change under everyone.
    const isManagement = profile?.role === 'admin' || profile?.role === 'super_admin';
    if (!profile || !isManagement || profile.is_active === false) {
      return json(403, { error: 'Admin access required' });
    }

    if (body.action === 'status') {
      const { data } = await admin
        .from('google_credentials')
        .select('google_email, connected_at, last_used_at, last_error, scope')
        .eq('id', 'calendar').maybeSingle();
      // Never the token itself, not even to an admin: nothing in the UI needs
      // it, and a value that is never sent cannot be leaked by a screenshot.
      return json(200, {
        connected: Boolean(data),
        email: data?.google_email ?? null,
        connectedAt: data?.connected_at ?? null,
        lastUsedAt: data?.last_used_at ?? null,
        lastError: data?.last_error ?? null,
        scope: data?.scope ?? null,
      });
    }

    if (body.action === 'disconnect') {
      const { error: delErr } = await admin
        .from('google_credentials').delete().eq('id', 'calendar');
      if (delErr) return json(500, { error: delErr.message });
      // Google keeps its side of the grant until it is revoked in the account's
      // own security settings; this only forgets our copy.
      return json(200, { connected: false });
    }

    if (!ALLOWED_REDIRECTS.has(body.redirectUri)) {
      return json(400, { error: 'That redirect URI is not allowed' });
    }

    if (body.action === 'auth_url') {
      const p = new URLSearchParams({
        client_id: clientId,
        redirect_uri: body.redirectUri,
        response_type: 'code',
        scope: CONNECT_SCOPES,
        // offline + consent together are what actually produce a refresh
        // token. Without prompt=consent Google returns one only on the very
        // first authorisation ever, so a re-connect silently yields none and
        // the sync dies the moment the access token expires an hour later.
        access_type: 'offline',
        prompt: 'consent',
      });
      return json(200, { url: `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}` });
    }

    // connect
    if (!body.code) return json(400, { error: 'code is required' });

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: body.code,
        redirect_uri: body.redirectUri,
      }).toString(),
    });
    const tokens = await tokenRes.json().catch(() => null);

    if (!tokenRes.ok) {
      console.error('Google connect failed:', tokenRes.status, tokens?.error);
      return json(tokenRes.status, {
        error: tokens?.error ?? 'Google rejected the authorization code',
        description: tokens?.error_description ?? null,
      });
    }

    if (!tokens.refresh_token) {
      // Refusing beats storing an access token that dies in an hour and
      // leaves a "connected" badge lying about it.
      return json(400, {
        error: 'Google did not return a refresh token',
        description: 'Remove the app under Google Account → Security → Third-party access, then connect again.',
      });
    }

    // Whose calendar this now writes to. Best effort: a failure here costs a
    // label in the UI, not the connection.
    let email: string | null = null;
    try {
      const who = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (who.ok) email = (await who.json())?.email ?? null;
    } catch { /* label only */ }

    const { error: upErr } = await admin.from('google_credentials').upsert({
      id: 'calendar',
      google_email: email,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope ?? CONNECT_SCOPES,
      connected_by: userData.user.id,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: null,
    });
    if (upErr) return json(500, { error: upErr.message });

    return json(200, { connected: true, email });
  }

  // ------------------------------------------------------ per-user actions

  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });

  if (body.action === 'exchange') {
    if (!body.code || !body.redirectUri) {
      return json(400, { error: 'code and redirectUri are required' });
    }
    params.set('grant_type', 'authorization_code');
    params.set('code', body.code);
    params.set('redirect_uri', body.redirectUri);
  } else if (body.action === 'refresh') {
    if (!body.refreshToken) return json(400, { error: 'refreshToken is required' });
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', body.refreshToken);
  } else {
    return json(400, { error: 'Unknown action' });
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    // Google's error body names the client on some failures, so only the short
    // machine-readable fields are passed back rather than the whole thing.
    console.error('Google token endpoint failed:', res.status, payload?.error);
    return json(res.status, {
      error: payload?.error ?? 'Google rejected the token request',
      description: payload?.error_description ?? null,
    });
  }

  // A refresh grant does not return a new refresh token; the caller keeps the
  // one it already has.
  return json(200, {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? null,
    expires_in: payload.expires_in,
    token_type: payload.token_type ?? 'Bearer',
  });
});
