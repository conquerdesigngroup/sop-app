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
// WHAT THIS DELIBERATELY DOES NOT FIX
//
// The resulting tokens are still handed back to the browser and kept in
// localStorage, which is what the existing staff Google Calendar feature is
// built on. That is a smaller problem of a different kind — a user's own token
// on their own device — and moving it server-side would mean rewriting that
// feature rather than closing the hole. The parent portal's own sync does not
// use any of this: it authenticates as a service account, in
// portal-calendar-sync, with no user tokens at all.
//
// AFTER DEPLOYING THIS, ROTATE THE SECRET
//
// The old one is public and stays public — it is in builds people already have.
// Rotate it in Google Cloud Console → Credentials, set GOOGLE_CLIENT_SECRET
// here, and delete REACT_APP_GOOGLE_CLIENT_SECRET from the Vercel project so a
// future build cannot resurrect it.
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Deployed with verify_jwt: true — only a signed-in employee may use it.
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

type Body = ExchangeBody | RefreshBody;

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
