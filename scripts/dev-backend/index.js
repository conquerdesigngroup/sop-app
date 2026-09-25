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
 * The roster sync (v67/v68), answered from the seed rather than computed.
 *
 * The rules are tested against a real Postgres in scripts/sql-tests; this only
 * has to give the screen something of every kind to draw — adds, a drop, a new
 * family, the lists for a person — so the preview can be looked at on a phone.
 * Whatever file is uploaded gets the same diff; after an apply the next preview
 * is empty, the way re-syncing the same export is.
 *
 *   DEV_ROSTER_SYNC_FIRST=1    no starting point recorded yet
 *   DEV_ROSTER_SYNC_BLOCKED=1  a dancer marked today who is due to be dropped
 *   DEV_ROSTER_SYNC_CONFIRM=1  a drop large enough to need confirming
 */
const rosterSync = {
  started: process.env.DEV_ROSTER_SYNC_FIRST !== '1',
  applied: false,
};

const enrollmentImport = (body) => {
  const contacts = Array.isArray(body && body.p_contacts) ? body.p_contacts : [];
  const mode = (body && body.p_mode) || 'preview';
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const cls = (i) => {
    const c = db.portal_classes[i % db.portal_classes.length];
    return { class_id: c.id, class_name: c.name, day_of_week: c.day_of_week, start_time: c.start_time };
  };
  const student = (i) => db.portal_students[i % db.portal_students.length];
  const household = (s) => db.portal_households.find((h) => h.id === s.household_id) || {};
  const name = (s) => `${s.first_name} ${s.last_name}`;
  const empty = rosterSync.applied || !rosterSync.started;

  const adds = empty ? [] : [0, 1].map((i) => {
    const s = student(i);
    return {
      student_id: s.id, student_name: name(s), new_dancer: false, household_id: s.household_id,
      family: household(s).display_name, email: household(s).primary_email, reason: 'only_dancer', ...cls(i + 9),
    };
  }).concat([{
    student_id: null, student_name: 'Omar Haddad', new_dancer: true, household_id: null,
    family: 'Haddad', email: 'haddad@localhost', reason: 'only_dancer', ...cls(12),
  }]);
  const dropped = db.portal_enrollments.find((e) => e.status === 'active');
  const drops = empty || !dropped ? [] : [(() => {
    const s = db.portal_students.find((x) => x.id === dropped.student_id);
    const k = db.portal_classes.find((c) => c.id === dropped.class_id);
    return {
      enrollment_id: dropped.id, student_id: s.id, student_name: name(s), household_id: s.household_id,
      family: household(s).display_name, email: household(s).primary_email, class_id: k.id,
      class_name: k.name, day_of_week: k.day_of_week, start_time: k.start_time, enrolled_on: dropped.enrolled_on,
      last_day: yesterday,
    };
  })()];
  const siblings = db.portal_students.filter((s) => s.household_id === student(0).household_id);
  const unassigned = empty ? [] : [{
    household_id: student(0).household_id, family: household(student(0)).display_name,
    email: household(student(0)).primary_email, age_min: null, age_max: null,
    reason: 'several_siblings_in_age_range',
    dancers: siblings.map((s, i) => ({ name: name(s), age: 7 + i * 3 })),
    export_names: siblings.map(name), unknown_names: [], ...cls(8),
  }, {
    household_id: student(1).household_id, family: household(student(1)).display_name,
    email: household(student(1)).primary_email, age_min: 5, age_max: 7,
    reason: 'export_names_unknown_dancer',
    dancers: [{ name: name(student(1)), age: 12 }],
    export_names: ['Tomas Boateng'], unknown_names: ['Tomas Boateng'], ...cls(3),
  }];
  const wasDropped = db.portal_enrollments.find((e) => e.status === 'dropped');
  const conflicts = empty || !wasDropped ? [] : [{
    student_id: wasDropped.student_id,
    student_name: name(db.portal_students.find((s) => s.id === wasDropped.student_id)),
    family: null, conflict: 'already_dropped', on: wasDropped.dropped_on,
    ...cls(db.portal_classes.findIndex((c) => c.id === wasDropped.class_id)),
  }];
  const blocked = process.env.DEV_ROSTER_SYNC_BLOCKED === '1' && drops.length ? [{
    kind: 'drop', reason: 'marked_after_drop_day', on: today, detail: null,
    student_name: drops[0].student_name, class_name: drops[0].class_name,
    day_of_week: drops[0].day_of_week, start_time: drops[0].start_time,
  }] : [];
  const newFamilies = [{
    row: 7, contact_id: 'dev-contact-7', email: 'haddad@localhost', contact_name: 'Sam Haddad',
    family: 'Haddad', dancers: ['Omar Haddad'],
  }].filter(() => !rosterSync.applied);
  const notImported = [{
    row: 12, contact_id: 'dev-contact-12', email: 'no-dancer@localhost', contact_name: 'Rene Okafor',
    reason: 'no_dancer_name', names: [],
  }];
  const missing = db.portal_households.slice(-2).map((h, i) => ({
    household_id: h.id, family: h.display_name, email: h.primary_email, dancers: 1, active_enrollments: i,
  }));
  const firstSeen = empty ? [] : db.portal_households.slice(2, 3).map((h) => ({
    household_id: h.id, family: h.display_name, email: h.primary_email, tags: 3, active_enrollments: 1,
  }));
  const unmatched = [
    { tag: 'mini jazz 1 (dana/m-5pm)', families: 4, looks_like_class: true },
    { tag: 'all-star bb (jess/m-6pm) — a much older title that runs long', families: 1, looks_like_class: true },
    { tag: 'current family', families: contacts.length, looks_like_class: false },
  ];
  const sticky = db.portal_households.slice(0, 2).map((h, i) => ({
    family: h.display_name, email: h.primary_email, ...cls(i + 4),
  }));
  const heldUntagged = [{ student_name: name(student(2)), family: household(student(2)).display_name, enrolled_on: '2026-08-31', ...cls(6) }];

  const plan = {
    mode,
    filename: (body && body.p_filename) || null,
    as_of: today,
    drop_day: yesterday,
    first_import: !rosterSync.started,
    last_sync_on: rosterSync.started ? yesterday : null,
    plan_hash: `dev-plan-${rosterSync.applied ? 'done' : 'pending'}`,
    baseline_hash: 'dev-baseline',
    confirm_drops: process.env.DEV_ROSTER_SYNC_CONFIRM === '1' && drops.length > 0,
    adds: rosterSync.started ? adds : [],
    drops: rosterSync.started ? drops : [],
    whole_class_drops: [],
    unassigned: rosterSync.started ? unassigned : [],
    conflicts: rosterSync.started ? conflicts : [],
    blocked,
    first_seen_families: firstSeen,
    new_families: newFamilies,
    not_imported: notImported,
    merged_contacts: [{ household_id: db.portal_households[0].id, family: db.portal_households[0].display_name, email: db.portal_households[0].primary_email, contacts: 2 }],
    email_conflicts: empty ? [] : [{ email: 'shared@localhost', families: ['Alvarez', 'Chen'] }],
    missing_families: missing,
    held_untagged: heldUntagged,
    tagged_unheld: rosterSync.started ? sticky : [],
    unmatched_tags: unmatched,
    memory_changes: { added: empty ? 0 : 3, removed: empty ? 0 : 1 },
    baseline_counts: { families: Math.max(contacts.length - 1, 0), tags: 42 },
  };
  plan.counts = {
    contacts: contacts.length, families: Math.max(contacts.length - 1, 0), adds: plan.adds.length,
    drops: plan.drops.length, unassigned: plan.unassigned.length, conflicts: plan.conflicts.length,
    blocked: blocked.length, first_seen_families: firstSeen.length, new_families: newFamilies.length,
    new_dancers: newFamilies.length, not_imported: notImported.length, merged_contacts: 1,
    email_conflicts: plan.email_conflicts.length, missing_families: missing.length,
    held_untagged: heldUntagged.length, tagged_unheld: plan.tagged_unheld.length,
    memory_changes: plan.memory_changes.added + plan.memory_changes.removed,
    unmatched_class_tags: unmatched.filter((t) => t.looks_like_class).length,
  };

  if (mode === 'baseline') {
    rosterSync.started = true;
    return { ...plan, recorded: true, tags_recorded: 42 };
  }
  if (mode === 'apply') {
    rosterSync.applied = true;
    const fingerprint = {
      attendance: { rows: 128, md5: 'dev' }, sessions: { rows: 66, md5: 'dev' },
      history: { rows: 131, md5: 'dev' }, past_rosters: { rows: 540, md5: 'dev', before: today },
    };
    return { ...plan, applied: true, fingerprint: { before: fingerprint, after: fingerprint } };
  }
  return plan;
};

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
  admin_enrollment_import: enrollmentImport,
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
