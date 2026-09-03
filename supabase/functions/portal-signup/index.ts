// =============================================================================
// portal-signup — roster-gated client registration, without an oracle
// =============================================================================
//
// WHY THIS EXISTS
//
// Parents may only create an account if their email is on portal_roster, the
// allowlist imported from the enrollment system. Browser-side signUp() cannot
// enforce that (and cannot set app_metadata.account_type, which is what makes
// handle_new_user() produce a client profile instead of an inactive staff one),
// so every portal signup comes through here with the service role.
//
// THE ENUMERATION RULE — the design constraint that shapes everything
//
// This endpoint must never behave differently for an email that is on the
// roster versus one that is not. Not in the response body, not in the status,
// not in the timing. Anything else turns it into a machine for testing which
// families attend the studio.
//
// The body is easy: every action returns exactly { ok: true } once the request
// parses. Timing is the hard part — createUser plus an SMTP send costs the
// on-roster path the better part of a second that the off-roster path does not
// spend. Padding with sleep() only works until real work exceeds the pad. So
// instead NOTHING roster-dependent happens before the response: the handler
// validates the shape of the request, waits out a fixed floor, and answers
// { ok: true }; the actual lookup / create / claim / email runs afterwards in a
// background task (EdgeRuntime.waitUntil). The response cannot leak what the
// work decides because the response is written before the work starts.
//
// The user-facing contract matches: "If your email is on file, a code is on
// its way." The UI proceeds to the code screen regardless.
//
// RATE LIMITING
//
// Edge function instances share no memory, so the counters live in
// portal_signup_attempts (v28, service-role only). Checked inside the deferred
// task: an over-limit request still gets its identical { ok: true }, it just
// does nothing and logs client_signup_rejected / rate_limited.
//
// THE OTP
//
// register creates the auth user with email_confirm: false and then sends the
// six-digit code by calling signInWithOtp(shouldCreateUser: false) SERVER-SIDE.
// Sending from the browser would leak: GoTrue answers 422 for an address with
// no account, and that difference is visible in devtools. From here, nobody
// sees it. Verification (auth.verifyOtp type 'email') stays in the browser —
// its errors are the same for a wrong code and a nonexistent account.
// Confirmed against current Supabase docs 2026-08-29: the Magic Link template
// must contain {{ .Token }} for the email to carry a code, and verifyOtp both
// confirms the address and returns a session.
//
// Logging goes through log_activity() (v29) with the service key: auth.uid()
// is NULL here, so the attribution parameters are honoured.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

// One body for every outcome. Declared once so a future edit cannot fork it.
const OK_BODY = { ok: true };

// Six, matching CLIENT_MIN_PASSWORD in src/lib/clientAuth.ts. The browser
// check is convenience; this is the gate a crafted request has to pass.
const MIN_PASSWORD = 6;
const FLOOR_MS = 250;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ilike is used as case-insensitive equality, so the pattern characters that
// live legally inside email addresses (most commonly '_') must be escaped or
// foo_bar@x.com would also match fooXbar@x.com's roster row.
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => '\\' + m);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Runs work after the response is sent. waitUntil keeps the instance alive; if
// the runtime ever lacks it, awaiting inline is a correctness fallback that
// costs only timing flatness.
const defer = (p: Promise<unknown>): Promise<unknown> | void => {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) {
    rt.waitUntil(p.catch((e) => console.error('portal-signup deferred task failed:', e)));
    return;
  }
  return p.catch((e) => console.error('portal-signup deferred task failed:', e));
};

interface BaseBody {
  action: 'check' | 'register' | 'resend' | 'signin_failed' | 'verify_failed' | 'reset_requested';
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) {
    return json(500, { error: 'Function is missing Supabase environment configuration' });
  }

  let body: BaseBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body must be JSON' });
  }

  const started = Date.now();
  const respondOk = async () => {
    await sleep(Math.max(0, FLOOR_MS - (Date.now() - started)));
    return json(200, OK_BODY);
  };

  // Shape validation may answer differently — it reflects what the CALLER
  // typed, never what the database contains.
  const email = (body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json(400, { error: 'A valid email address is required' });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  // Plain anon client, used only to ask GoTrue to send the OTP email.
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  const log = async (
    action: string,
    result: 'success' | 'failure',
    details: Record<string, unknown>,
    actor?: { id: string; email: string; name?: string },
  ) => {
    const { error } = await admin.rpc('log_activity', {
      p_action: action,
      p_entity_type: 'user',
      p_entity_id: actor?.id ?? null,
      p_entity_title: actor?.name || email,
      p_details: details,
      p_result: result,
      p_actor_kind: actor ? 'client' : 'system',
      p_actor_id: actor?.id ?? null,
      p_actor_email: actor?.email ?? null,
      p_actor_name: actor?.name ?? null,
    });
    if (error) console.error('portal-signup could not write log:', error.message);
  };

  // Sliding-window counter over portal_signup_attempts. Recording happens
  // before counting-callers act, pruning keeps the table from growing forever.
  const overLimit = async (kind: string, perEmailHour: number, perIpHour: number) => {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await admin.from('portal_signup_attempts').delete().lt('created_at', dayAgo);

    const [byEmail, byIp] = await Promise.all([
      admin
        .from('portal_signup_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('kind', kind)
        .ilike('email', escapeLike(email))
        .gte('created_at', hourAgo),
      admin
        .from('portal_signup_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('kind', kind)
        .eq('ip', ip)
        .gte('created_at', hourAgo),
    ]);

    await admin.from('portal_signup_attempts').insert({ kind, email, ip });

    return (byEmail.count ?? 0) >= perEmailHour || (byIp.count ?? 0) >= perIpHour;
  };

  switch (body.action) {
    // ------------------------------------------------------------- check
    // UX step only. The register action re-checks the roster server-side, so
    // nothing here is trusted — and nothing here is revealed.
    case 'check': {
      defer(
        (async () => {
          await admin
            .from('portal_roster')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .ilike('email', escapeLike(email));
        })(),
      );
      return respondOk();
    }

    // ---------------------------------------------------------- register
    case 'register': {
      const password = body.password ?? '';
      if (password.length < MIN_PASSWORD) {
        return json(400, { error: `Password must be at least ${MIN_PASSWORD} characters` });
      }
      const firstName = (body.firstName ?? '').trim().slice(0, 80);
      const lastName = (body.lastName ?? '').trim().slice(0, 80);

      defer(
        (async () => {
          if (await overLimit('register', 5, 20)) {
            await log('client_signup_rejected', 'failure', { email, reason: 'rate_limited', ip });
            return;
          }

          const { data: rows, error: rosterErr } = await admin
            .from('portal_roster')
            .select('id, claimed_by')
            .eq('status', 'active')
            .ilike('email', escapeLike(email));

          if (rosterErr) {
            console.error('portal-signup roster lookup failed:', rosterErr.message);
            await log('client_signup_rejected', 'failure', {
              email,
              reason: 'roster_lookup_failed',
              message: rosterErr.message,
            });
            return;
          }
          if (!rows || rows.length === 0) {
            await log('client_signup_rejected', 'failure', { email, reason: 'not_on_roster' });
            return;
          }
          if (rows.every((r) => r.claimed_by !== null)) {
            await log('client_signup_rejected', 'failure', { email, reason: 'already_claimed' });
            return;
          }

          // app_metadata is the unforgeable signal handle_new_user() keys on:
          // it is settable only through auth.admin.*, never by a self-signup.
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: false,
            app_metadata: { account_type: 'client' },
            user_metadata: { first_name: firstName, last_name: lastName },
          });

          if (createErr || !created?.user) {
            const msg = createErr?.message ?? 'unknown';
            const dup = /already|registered|exists/i.test(msg);
            await log('client_signup_rejected', 'failure', {
              email,
              reason: dup ? 'already_registered' : 'create_failed',
              ...(dup ? {} : { message: msg }),
            });
            return;
          }

          const userId = created.user.id;
          const name = `${firstName} ${lastName}`.trim() || email;

          // Measured on this project (2026-08-29): GoTrue applies the
          // app_metadata from createUser AFTER the INSERT that fires
          // handle_new_user(), so the trigger sees no account_type and files
          // the profile as a default team/inactive row. The role cannot be
          // UPDATEd afterwards — prevent_privilege_escalation() rejects role
          // changes with no JWT behind them — but it has nothing to say about
          // an INSERT, so the fix is to rebuild the row as what it is. The
          // inactive team profile grants nothing during the window, and if the
          // rebuild fails the half-made account is removed rather than left
          // behind with the wrong shape.
          await admin.from('profiles').delete().eq('id', userId);
          const { data: prof, error: profErr } = await admin
            .from('profiles')
            .insert({
              id: userId,
              email,
              first_name: firstName,
              last_name: lastName,
              role: 'client',
              department: 'Client',
              is_active: true,
            })
            .select('id');

          if (profErr || !prof || prof.length === 0) {
            await admin.auth.admin.deleteUser(userId);
            await log('client_signup_rejected', 'failure', {
              email,
              reason: 'profile_rebuild_failed',
              message: profErr?.message ?? 'no row returned',
            });
            return;
          }

          // One guardian email can cover several students; the account claims
          // every unclaimed active row for it.
          const { data: claimed, error: claimErr } = await admin
            .from('portal_roster')
            .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
            .is('claimed_by', null)
            .eq('status', 'active')
            .ilike('email', escapeLike(email))
            .select('id');
          if (claimErr) console.error('portal-signup claim failed:', claimErr.message);

          // The six-digit code, sent from the server so GoTrue's "no such
          // account" 422 is never visible to a browser. The Magic Link email
          // template must contain {{ .Token }}.
          const { error: otpErr } = await anon.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: false },
          });
          if (otpErr) console.error('portal-signup OTP send failed:', otpErr.message);

          await log(
            'client_signed_up',
            'success',
            { email, roster_rows_claimed: claimed?.length ?? 0, otp_sent: !otpErr },
            { id: userId, email, name },
          );
        })(),
      );
      return respondOk();
    }

    // ------------------------------------------------------------ resend
    // "Send me a new code" on the verification screen. Same silence: a resend
    // for an address with no account sends nothing and says nothing.
    //
    // It also sends nothing for an address that HAS an account but is not a
    // client. signInWithOtp(shouldCreateUser:false) will happily mail a
    // working sign-in code to ANY existing user, so without this guard a
    // resend aimed at a staff address would log that staff account straight
    // into the portal — bypassing the roster gate that register enforces. The
    // register path files a family as role='client'; resend only proceeds when
    // it finds exactly that. Everything else is indistinguishable from an
    // address with no account, preserving the enumeration silence.
    case 'resend': {
      defer(
        (async () => {
          if (await overLimit('resend', 5, 20)) {
            await log('client_otp_resent', 'failure', { email, reason: 'rate_limited', ip });
            return;
          }

          const { data: profs } = await admin
            .from('profiles')
            .select('role')
            .ilike('email', escapeLike(email))
            .limit(1);
          if (profs?.[0]?.role !== 'client') {
            await log('client_otp_resent', 'failure', { email, reason: 'not_a_client' });
            return;
          }

          const { error } = await anon.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: false },
          });
          if (!error) {
            await log('client_otp_resent', 'success', { email });
          } else {
            console.error('portal-signup resend OTP failed:', error.message);
            await log('client_otp_resent', 'failure', {
              email,
              reason: 'send_failed',
              message: error.message,
            });
          }
        })(),
      );
      return respondOk();
    }

    // ----------------------------------------------------- signin_failed
    // Telemetry for the audit log. GoTrue on this project writes no
    // auth.audit_log_entries (verified empty 2026-08-29), so the app reports
    // its own failed sign-ins. The row is marked client_reported because this
    // endpoint cannot verify the attempt happened; the rate limit bounds the
    // noise a hostile caller can generate, and no privilege depends on it.
    case 'signin_failed': {
      defer(
        (async () => {
          if (await overLimit('signin_failed', 10, 20)) return;
          await log('user_sign_in_failed', 'failure', { email, source: 'client_reported', ip });
        })(),
      );
      return respondOk();
    }

    // ----------------------------------------------------- verify_failed
    // Same telemetry as signin_failed, for the verify screen. The browser's
    // verifyOtp error is identical for a wrong code and a nonexistent account
    // (deliberately), and the browser is anon there — v29 revokes log_activity
    // from anon — so without this row, brute-forcing codes is invisible to the
    // audit log while failed sign-ins are not. Never the attempted code.
    case 'verify_failed': {
      defer(
        (async () => {
          if (await overLimit('verify_failed', 10, 20)) return;
          await log('client_email_verify_failed', 'failure', { email, source: 'client_reported', ip });
        })(),
      );
      return respondOk();
    }

    // ---------------------------------------------------- reset_requested
    // The reset form only renders signed out (PortalLogin redirects sessions
    // away), so the same anon constraint applies: the browser cannot write
    // this row itself and reports it here instead.
    case 'reset_requested': {
      defer(
        (async () => {
          if (await overLimit('reset_requested', 5, 20)) return;
          await log('user_password_reset_requested', 'success', { email, source: 'client_reported', ip });
        })(),
      );
      return respondOk();
    }

    default:
      return json(400, { error: 'Unknown action' });
  }
});
