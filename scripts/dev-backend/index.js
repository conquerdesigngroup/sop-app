#!/usr/bin/env node
/**
 * A fake Supabase, for looking at the app without a real one.
 *
 *   npm run dev:backend      # this, on :3099
 *   npm start                # the app, pointed at it by .env.local
 *
 * WHY THIS EXISTS
 *
 * Two pages' worth of this app can be seen without a backend. Everything else —
 * every staff route, and every portal page below a section — reads Supabase
 * before it renders, so with no credentials it draws an error card, and an
 * audit of it measures the error card and reports CLEAN. `npm run audit:mobile`
 * says as much in its own output: without AUDIT_EMAIL it skips 20 of its 35
 * rows, and those are the rows where CLAUDE.md records that every bug of the
 * first full run was found.
 *
 * The alternative was a test login on the real studio's roster. That is 349 real
 * households and 395 real children, in whose class lists and attendance screens
 * an invented dancer would sit unmarked. This does the same job with none of
 * that, and it runs with no network at all.
 *
 * WHAT IT IS NOT
 *
 * Not Postgres, and emphatically not RLS. Every row here is served to whoever
 * asks; the policies that decide who may really see what are in the migrations
 * and can only be tested against a real database. So this proves layout,
 * navigation, empty states and the snake_case-to-camelCase mappers. It cannot
 * prove that an Academy family is refused All-Star content — test that with the
 * SQL seed and a real project.
 *
 * It also never runs in a deployed build. It is a script in scripts/, not code
 * in src/: there is nothing to tree-shake out and nothing to guard, because
 * none of it is in the bundle.
 */

const http = require('http');
const { URL } = require('url');
const { query } = require('./pgrest');
const { tables, LOGIN_EMAIL } = require('./seed');

const PORT = Number(process.env.DEV_BACKEND_PORT || 3099);

// Mutable copy: writes land here so a form's save does not appear to fail, and
// vanish on restart. See the pgrest.js header.
const db = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v]]));

const json = (res, status, body, extraHeaders = {}) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': 'content-range',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    ...extraHeaders,
  });
  res.end(body === null ? '' : JSON.stringify(body));
};

// --- auth -------------------------------------------------------------------

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

/**
 * A structurally valid JWT with a nonsense signature.
 *
 * supabase-js reads the payload to find the user and the expiry; it never
 * verifies the signature, because verifying is the server's job. So this is
 * enough to be a session, and is worthless anywhere that actually checks — which
 * is the property you want from a fixture credential.
 */
const accessToken = (user) => {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 }),
    'dev-backend-not-a-real-signature',
  ].join('.');
};

const userFor = (email) => {
  const profile = db.profiles.find((p) => p.email === email) || db.profiles[0];
  return {
    id: profile.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: profile.email,
    email_confirmed_at: profile.created_at,
    phone: '',
    confirmed_at: profile.created_at,
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { first_name: profile.first_name, last_name: profile.last_name },
    identities: [],
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
};

const sessionFor = (email) => {
  const user = userFor(email);
  return {
    access_token: accessToken(user),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'dev-backend-refresh-token',
    user,
  };
};

const handleAuth = (req, res, url, body) => {
  const path = url.pathname.replace('/auth/v1', '');

  // Any password. A check here would guard a fixture from its own author.
  if (path === '/token' || path === '/signup' || path === '/verify') {
    const email = (body && (body.email || body.gotrue_meta_security?.email)) || LOGIN_EMAIL;
    return json(res, 200, sessionFor(email));
  }
  if (path === '/user') {
    if (req.method === 'PUT') return json(res, 200, userFor(LOGIN_EMAIL));
    return json(res, 200, userFor(LOGIN_EMAIL));
  }
  if (path === '/logout') return json(res, 204, null);
  if (path === '/recover' || path === '/otp' || path === '/resend') return json(res, 200, {});

  return json(res, 404, { message: `dev-backend: no auth route ${path}` });
};

// --- rpc --------------------------------------------------------------------

/**
 * Answers for the functions the app calls.
 *
 * Permissive where the answer decides whether a control is offered — this login
 * is a super admin and should see everything there is to look at. Anything not
 * listed returns null, which every caller already treats as "no".
 */
const RPC = {
  can_edit_portal: () => true,
  is_portal_calendar: () => true,
  verify_portal_code: () => true,
  portal_program_has_code: () => false,
  portal_calendar_token: () => 'dev-backend-calendar-token',
  record_install_ping: () => null,
  log_activity: () => null,
  portal_log_download: () => null,
  set_portal_code: () => null,
  link_household_member: () => null,
  staff_mark_attendance: () => null,
  staff_set_session_status: () => null,
  admin_download_stats: () => [],
  admin_activity_search: () => [],
  admin_activity_facets: () => [],
};

// --- rest -------------------------------------------------------------------

const handleRest = (req, res, url, body) => {
  const table = url.pathname.replace('/rest/v1/', '').split('/')[0];

  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const name = url.pathname.replace('/rest/v1/rpc/', '');
    const fn = RPC[name];
    if (!fn) {
      console.warn(`  ! unmapped rpc ${name} -> null (add it to RPC in scripts/dev-backend/index.js)`);
      return json(res, 200, null);
    }
    return json(res, 200, fn(body));
  }

  const params = [...url.searchParams.entries()];
  // `.single()` / `.maybeSingle()` ask for an object rather than an array.
  const wantsObject = (req.headers.accept || '').includes('vnd.pgrst.object');

  if (req.method === 'GET') {
    if (!db[table]) console.warn(`  ! no seed for ${table} -> [] (add it to scripts/dev-backend/seed.js)`);
    const rows = query(db, table, params);
    if (wantsObject) {
      // PostgREST is strict here and so is this: .single() on no rows is the
      // error the app branches on, and softening it hides that branch.
      if (rows.length !== 1) {
        return json(res, 406, {
          code: 'PGRST116',
          message: `JSON object requested, multiple (or no) rows returned`,
          details: `Results contain ${rows.length} rows`,
        });
      }
      return json(res, 200, rows[0]);
    }
    return json(res, 200, rows, { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
  }

  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
    db[table] = db[table] || [];
    const incoming = Array.isArray(body) ? body : [body];

    let written;
    if (req.method === 'POST') {
      written = incoming.map((row) => ({
        id: row.id || `dev-${Math.random().toString(36).slice(2, 10)}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...row,
      }));
      db[table].push(...written);
    } else {
      const targets = query(db, table, params);
      written = targets.map((row) => Object.assign(row, incoming[0], { updated_at: new Date().toISOString() }));
    }

    const returns = (req.headers.prefer || '').includes('return=representation');
    if (!returns) return json(res, 201, null);
    return json(res, 201, wantsObject ? written[0] : written);
  }

  if (req.method === 'DELETE') {
    const doomed = new Set(query(db, table, params).map((r) => r.id));
    db[table] = (db[table] || []).filter((r) => !doomed.has(r.id));
    return json(res, 204, null);
  }

  return json(res, 405, { message: `dev-backend: ${req.method} not handled` });
};

// --- storage and edge functions --------------------------------------------

const handleStorage = (req, res, url) => {
  if (url.pathname.includes('/object/sign/')) {
    // A URL shaped like the real one. It 404s if followed, which is the truth:
    // there are no files behind this fixture.
    const path = url.pathname.split('/object/sign/')[1];
    return json(res, 200, { signedURL: `/storage/v1/object/public/${path}?token=dev-backend` });
  }
  if (url.pathname.includes('/object/list/')) return json(res, 200, []);
  if (req.method === 'POST' || req.method === 'PUT') return json(res, 200, { Key: 'dev-backend/upload' });
  return json(res, 404, { message: 'dev-backend: no such object' });
};

const handleFunctions = (req, res, url) => {
  const name = url.pathname.replace('/functions/v1/', '');
  console.warn(`  · edge function ${name} -> {} (stub)`);
  return json(res, 200, {});
};

// --- server -----------------------------------------------------------------

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, null);

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let body = null;
    if (chunks.length) {
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        body = null;
      }
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    try {
      if (url.pathname.startsWith('/auth/v1')) return handleAuth(req, res, url, body);
      if (url.pathname.startsWith('/rest/v1')) return handleRest(req, res, url, body);
      if (url.pathname.startsWith('/storage/v1')) return handleStorage(req, res, url);
      if (url.pathname.startsWith('/functions/v1')) return handleFunctions(req, res, url);
      return json(res, 404, { message: `dev-backend: no route ${url.pathname}` });
    } catch (e) {
      // Loud. A fixture that swallows its own errors is worse than no fixture,
      // because the page renders something and you believe it.
      console.error(`  !! ${req.method} ${url.pathname}: ${e.message}`);
      return json(res, 500, { message: String(e.message) });
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`
  dev backend listening on http://localhost:${PORT}

  Point the app at it — .env.local, then restart npm start:

    REACT_APP_SUPABASE_URL=http://localhost:${PORT}
    REACT_APP_SUPABASE_ANON_KEY=dev-backend-anon-key

  Sign in with ${LOGIN_EMAIL} and any password (super_admin).
  Nothing here is real and nothing is written to disk.
`);
});
