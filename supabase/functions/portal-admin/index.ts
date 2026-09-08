// =============================================================================
// portal-admin — client-account management for studio admins
// =============================================================================
//
// WHY A SECOND FUNCTION
//
// admin-users is staff-only and already dense; mixing "reset a teacher's
// password" and "unlink a roster row" into one dispatch invites the wrong
// authorisation check on the wrong branch. This function manages CLIENT
// accounts and the roster, nothing else — every account-mutating action here
// refuses a target whose profile role is not 'client', so it can never be used
// as a side door around admin-users' super-admin rules.
//
// THE TWO-CLIENT PATTERN (same as admin-users — read its header)
//
// `admin` holds the service role: auth.admin.*, portal_roster (which has no
// client-facing grants), and reading profiles for authorisation. `caller`
// carries the requester's JWT and is used for everything where the DATABASE
// should decide as the real person:
//
//   * profiles writes — prevent_privilege_escalation() resolves auth.uid(), so
//     is_active toggles MUST run as the caller or the trigger rejects them.
//   * admin_roster_import / admin_client_list — SECURITY DEFINER functions
//     that gate on is_admin() about the real caller.
//   * log_activity — with a session, identity comes from the JWT, so every log
//     row names the admin who actually did it without this code saying so.
//
// EVERY ACTION LOGS. That includes refused ones: a team member or client
// poking this endpoint writes a portal_admin_denied row with result=failure,
// which is exactly the kind of thing the audit log exists to notice.
//
// DEACTIVATION uses both levers: profiles.is_active=false (what the app and
// RLS consult) AND an auth ban (what GoTrue consults). The profile flag alone
// does not stop sign-in; the ban alone would leave RLS thinking they are
// active. Reactivation clears both, same password.
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

const MIN_PASSWORD = 10;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Effectively permanent; GoTrue has no unbounded ban, so a century stands in.
const BAN_FOREVER = '876000h';
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => '\\' + m);

interface Body {
  action:
    | 'roster_import'
    | 'class_import'
    | 'roster_deactivate'
    | 'roster_reactivate'
    | 'client_list'
    | 'client_access_events'
    | 'client_set_email'
    | 'client_set_password'
    | 'client_set_active'
    | 'client_unlink';
  rows?: unknown[];
  filename?: string;
  rosterId?: string;
  filter?: string;
  search?: string;
  days?: number;
  limit?: number;
  offset?: number;
  userId?: string;
  newEmail?: string;
  password?: string;
  isActive?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Missing Authorization header' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) {
    return json(500, { error: 'Function is missing Supabase environment configuration' });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  // ---------------------------------------------------------- authorise
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { error: 'Invalid or expired session' });
  }
  const callerId = userData.user.id;

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role, is_active, email, first_name, last_name')
    .eq('id', callerId)
    .single();

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body must be JSON' });
  }

  // Through `caller`: with a session, log_activity takes identity from the
  // JWT, so these rows name the real person whatever this code claims.
  const log = async (
    action: string,
    entityType: string,
    entityId: string | null,
    entityTitle: string | null,
    details: Record<string, unknown>,
    result: 'success' | 'failure' = 'success',
  ) => {
    const { error } = await caller.rpc('log_activity', {
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_entity_title: entityTitle,
      p_details: details,
      p_result: result,
    });
    if (error) console.error('portal-admin could not write log:', error.message);
  };

  const callerIsManagement =
    callerProfile?.role === 'admin' || callerProfile?.role === 'super_admin';

  if (!callerProfile || !callerIsManagement || callerProfile.is_active === false) {
    // A team member or a client probing an admin endpoint is a fact worth
    // keeping. They have a session, so the row names them.
    await log(
      'portal_admin_denied',
      'user',
      callerId,
      null,
      { attemptedAction: body?.action ?? 'unknown' },
      'failure',
    );
    return json(403, { error: 'Admin access required' });
  }

  // Loads the target and refuses anything that is not a client account, so
  // this function cannot touch staff. Returns null after answering.
  const requireClientTarget = async (userId: string | undefined) => {
    if (!userId) {
      return { resp: json(400, { error: 'userId is required' }), target: null };
    }
    const { data: target } = await admin
      .from('profiles')
      .select('id, email, first_name, last_name, role, is_active')
      .eq('id', userId)
      .single();
    if (!target) return { resp: json(404, { error: 'No such user' }), target: null };
    if (target.role !== 'client') {
      await log(
        'portal_admin_denied',
        'user',
        userId,
        null,
        { attemptedAction: body.action, reason: 'target_not_client' },
        'failure',
      );
      return {
        resp: json(403, { error: 'portal-admin manages client accounts only — use Team Management for staff' }),
        target: null,
      };
    }
    return { resp: null, target };
  };

  try {
    switch (body.action) {
      // ---------------------------------------------------- roster_import
      case 'roster_import': {
        if (!Array.isArray(body.rows) || body.rows.length === 0) {
          return json(400, { error: 'rows must be a non-empty array' });
        }
        if (body.rows.length > 2000) {
          return json(400, { error: 'Import at most 2000 rows at a time' });
        }

        const { data, error } = await caller.rpc('admin_roster_import', {
          p_rows: body.rows,
          p_filename: body.filename ?? null,
        });
        if (error) return json(400, { error: error.message });

        await log('roster_imported', 'roster', null, body.filename ?? 'roster import', {
          inserted: data?.inserted ?? 0,
          updated: data?.updated ?? 0,
          unchanged: data?.unchanged ?? 0,
          auto_claimed: data?.auto_claimed ?? 0,
          rejected: Array.isArray(data?.rejected) ? data.rejected.length : 0,
          filename: body.filename ?? null,
        });

        return json(200, { success: true, result: data });
      }

      // ------------------------------------------------------ class_import
      //
      // The schedule half of the Enrolio export. Same shape as roster_import:
      // the RPC does the work and gates on is_admin() about the real caller,
      // this logs it once so the log cannot be forgotten by one path.
      case 'class_import': {
        if (!Array.isArray(body.rows) || body.rows.length === 0) {
          return json(400, { error: 'rows must be a non-empty array' });
        }
        if (body.rows.length > 2000) {
          return json(400, { error: 'Import at most 2000 rows at a time' });
        }

        const { data, error } = await caller.rpc('admin_class_import', {
          p_rows: body.rows,
          p_filename: body.filename ?? null,
        });
        if (error) {
          await log('classes_imported', 'class', null, body.filename ?? 'class import',
            { reason: error.message }, 'failure');
          return json(400, { error: error.message });
        }

        await log('classes_imported', 'class', null, body.filename ?? 'class import', {
          inserted: data?.inserted ?? 0,
          updated: data?.updated ?? 0,
          unchanged: data?.unchanged ?? 0,
          rejected: Array.isArray(data?.rejected) ? data.rejected.length : 0,
          active_not_in_file: Array.isArray(data?.active_not_in_file) ? data.active_not_in_file.length : 0,
          filename: body.filename ?? null,
        });

        return json(200, { success: true, result: data });
      }

      // ------------------------------------------------ roster_deactivate
      case 'roster_deactivate': {
        if (!body.rosterId) return json(400, { error: 'rosterId is required' });

        const { data: rows, error } = await admin
          .from('portal_roster')
          .update({ status: 'inactive' })
          .eq('id', body.rosterId)
          .select('id, email, student_name');
        if (error) {
          await log('roster_row_deactivated', 'roster', body.rosterId, null, { reason: error.message }, 'failure');
          return json(400, { error: error.message });
        }
        if (!rows || rows.length === 0) return json(404, { error: 'No such roster row' });

        await log('roster_row_deactivated', 'roster', body.rosterId, rows[0].student_name, {
          email: rows[0].email,
        });
        return json(200, { success: true });
      }

      // ------------------------------------------------ roster_reactivate
      // The undo for the action above. Imports deliberately never touch
      // status (an admin's deactivate outranks the next export), so without
      // this a slipped finger would be permanent.
      case 'roster_reactivate': {
        if (!body.rosterId) return json(400, { error: 'rosterId is required' });

        const { data: rows, error } = await admin
          .from('portal_roster')
          .update({ status: 'active' })
          .eq('id', body.rosterId)
          .select('id, email, student_name');
        if (error) {
          await log('roster_row_reactivated', 'roster', body.rosterId, null, { reason: error.message }, 'failure');
          return json(400, { error: error.message });
        }
        if (!rows || rows.length === 0) return json(404, { error: 'No such roster row' });

        await log('roster_row_reactivated', 'roster', body.rosterId, rows[0].student_name, {
          email: rows[0].email,
        });
        return json(200, { success: true });
      }

      // -------------------------------------------------------- client_list
      case 'client_list': {
        const { data, error } = await caller.rpc('admin_client_list', {
          p_filter: body.filter ?? 'all',
          p_search: body.search ?? null,
          p_limit: body.limit ?? 100,
          p_offset: body.offset ?? 0,
        });
        if (error) return json(400, { error: error.message });
        return json(200, { success: true, ...data });
      }

      // --------------------------------------------- client_access_events
      // WHO IS TRYING TO GET IN, AND WHETHER THEY CAN.
      //
      // Read-only. The four things the front desk needs the morning after a
      // launch — a failed sign-in, a reset request, a registration, a failed
      // code — already write to activity_logs; nothing new is recorded here.
      // What this adds is the three facts that say what the event MEANT, none
      // of which the browser can see for itself:
      //
      //   * is there an account on this address at all
      //   * has that account claimed a household (v47/v48's "signed up" as
      //     against "account not linked")
      //   * is the address one the studio actually holds
      //
      // Without the first one, every row reads "failed to sign in" and the
      // family who has no account to sign in TO is indistinguishable from the
      // one who fat-fingered a password. Those two need opposite phone calls.
      //
      // WHY NOT portal_signup_attempts: that table is the rate-limit ledger,
      // and portal-signup prunes it to the last 24 hours on every call, so it
      // cannot answer "what happened this week". Measured 2026-09-08: 95
      // sign-in failures in activity_logs against 66 surviving in the ledger.
      //
      // NOT LOGGED, deliberately. This is a read, and the app-wide refresh
      // calls it on every pull-to-refresh; an audit row per glance would bury
      // the rows worth reading. client_list does not log either.
      case 'client_access_events': {
        const days = Math.min(Math.max(Math.round(body.days ?? 30), 1), 90);
        const since = new Date(Date.now() - days * 86400000).toISOString();

        // activity_logs action -> the word the front desk uses for it.
        const KIND: Record<string, string> = {
          user_sign_in_failed: 'signin_failed',
          user_password_reset_requested: 'reset_requested',
          client_signed_up: 'registered',
          client_email_verified: 'verified',
          client_email_verify_failed: 'verify_failed',
          client_signup_rejected: 'rejected',
        };

        const { data: logs, error: logErr } = await admin
          .from('activity_logs')
          .select('action, details, entity_title, user_email, created_at')
          .in('action', Object.keys(KIND))
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(4000);
        if (logErr) return json(400, { error: logErr.message });

        // user_sign_in_failed is written by the STAFF login too (AuthContext).
        // Only the portal's rows carry one of these two marks, and a staff
        // member's mistyped password has no business on a parents screen.
        const isPortalRow = (row: any) => {
          if (row.action !== 'user_sign_in_failed') return true;
          const d = row.details ?? {};
          return d.source === 'client_reported' || d.surface === 'portal';
        };

        // The address is in a different place depending on who wrote the row:
        // portal-signup puts it in details.email, a signed-in client's own
        // rows carry user_email, and the deactivated-sign-in path has only
        // entity_title.
        const emailOf = (row: any) =>
          String(row.details?.email ?? row.user_email ?? row.entity_title ?? '')
            .trim()
            .toLowerCase();

        const rows = (logs ?? []).filter(
          (r: any) => isPortalRow(r) && emailOf(r).includes('@'),
        );

        // Reference data. Whole-table reads on purpose: these are 38 profiles,
        // 349 households, 395 students and 17 memberships as of 2026-09-08, and
        // matching in memory is what lets the join be case-insensitive on both
        // sides — PostgREST .in() is not. Bounded so a future 10k roster
        // degrades to a partial answer rather than a timeout.
        const [profRes, hhRes, memRes, stuRes] = await Promise.all([
          admin.from('profiles').select('id, email, role, is_active').limit(5000),
          admin.from('portal_households').select('id, primary_email, display_name, status').limit(5000),
          admin.from('portal_household_members').select('profile_id, household_id').limit(5000),
          admin.from('portal_students').select('household_id').limit(20000),
        ]);

        const linkedProfileIds = new Set(
          (memRes.data ?? []).map((m: any) => m.profile_id),
        );
        const profileByEmail = new Map<string, any>();
        for (const p of profRes.data ?? []) {
          const key = String(p.email ?? '').trim().toLowerCase();
          if (key) profileByEmail.set(key, p);
        }
        const studentsByHousehold = new Map<string, number>();
        for (const st of stuRes.data ?? []) {
          if (!st.household_id) continue;
          studentsByHousehold.set(st.household_id, (studentsByHousehold.get(st.household_id) ?? 0) + 1);
        }
        const householdByEmail = new Map<string, any>();
        for (const h of hhRes.data ?? []) {
          const key = String(h.primary_email ?? '').trim().toLowerCase();
          if (key) householdByEmail.set(key, h);
        }

        const blank = () => ({
          signin_failed: 0,
          reset_requested: 0,
          registered: 0,
          verified: 0,
          verify_failed: 0,
          rejected: 0,
        });

        const people = new Map<string, any>();
        const events: any[] = [];

        for (const row of rows) {
          const email = emailOf(row);
          const kind = KIND[row.action];
          const at = row.created_at;

          let person = people.get(email);
          if (!person) {
            const profile = profileByEmail.get(email) ?? null;
            const household = householdByEmail.get(email) ?? null;
            person = {
              email,
              householdId: household?.id ?? null,
              householdName: household?.display_name ?? null,
              householdStatus: household?.status ?? null,
              studentCount: household ? studentsByHousehold.get(household.id) ?? 0 : 0,
              emailKnown: !!household,
              hasAccount: !!profile,
              accountRole: profile?.role ?? null,
              accountActive: profile ? profile.is_active !== false : null,
              isLinked: profile ? linkedProfileIds.has(profile.id) : false,
              counts: blank(),
              firstAt: at,
              lastAt: at,
              lastIp: row.details?.ip ?? null,
            };
            people.set(email, person);
          }

          person.counts[kind] += 1;
          // rows arrive newest first, so only the floor ever moves.
          if (at < person.firstAt) person.firstAt = at;

          if (events.length < 300) {
            events.push({
              at,
              kind,
              email,
              ip: row.details?.ip ?? null,
              reason: row.details?.reason ?? null,
            });
          }
        }

        return json(200, {
          success: true,
          days,
          people: Array.from(people.values()),
          events,
          truncated: rows.length >= 4000,
        });
      }

      // --------------------------------------------------- client_set_email
      // The single most common support task this system will generate: the
      // family changed their email in the enrollment system, the import
      // brought in the new address as an unclaimed row, and their account
      // still lives on the old one. This moves the ACCOUNT to the new address
      // — password and history intact, nobody re-registers — and claims any
      // waiting roster rows for it.
      case 'client_set_email': {
        const newEmail = (body.newEmail ?? '').trim().toLowerCase();
        if (!EMAIL_RE.test(newEmail)) return json(400, { error: 'A valid new email is required' });

        const { resp, target } = await requireClientTarget(body.userId);
        if (resp) return resp;
        const oldEmail = target!.email;
        if (oldEmail.toLowerCase() === newEmail) {
          return json(400, { error: 'That is already this client’s email' });
        }

        const { data: clash } = await admin
          .from('profiles')
          .select('id')
          .ilike('email', escapeLike(newEmail))
          .neq('id', target!.id)
          .limit(1);
        if (clash && clash.length > 0) {
          await log(
            'user_email_changed',
            'user',
            target!.id,
            `${target!.first_name} ${target!.last_name}`.trim() || oldEmail,
            { reason: 'email_in_use' },
            'failure',
          );
          return json(409, { error: 'Another account already uses that email' });
        }

        // email_confirm: true — the admin is vouching for the address; making
        // the family chase a confirmation email would defeat the point.
        const { error: authErr } = await admin.auth.admin.updateUserById(target!.id, {
          email: newEmail,
          email_confirm: true,
        });
        if (authErr) return json(400, { error: authErr.message });

        // profiles.email is what the app and the roster join read. As the
        // caller, with .select() — a zero-row refusal must be a failure, not a
        // silent success (see admin-users).
        const { data: patched, error: patchErr } = await caller
          .from('profiles')
          .update({ email: newEmail })
          .eq('id', target!.id)
          .select('id');

        if (patchErr || !patched || patched.length === 0) {
          // Roll the auth email back rather than leaving auth and profile
          // disagreeing about who this account belongs to.
          await admin.auth.admin.updateUserById(target!.id, { email: oldEmail, email_confirm: true });
          await log(
            'user_email_changed',
            'user',
            target!.id,
            `${target!.first_name} ${target!.last_name}`.trim() || oldEmail,
            {
              email: { from: oldEmail, to: newEmail },
              rolledBack: true,
              reason: patchErr?.message ?? 'profile_update_refused',
            },
            'failure',
          );
          return json(500, {
            error: 'The account email could not be updated in the profile — the change has been rolled back',
          });
        }

        // Waiting roster rows for the new address belong to this account now.
        const { data: claimed } = await admin
          .from('portal_roster')
          .update({ claimed_by: target!.id, claimed_at: new Date().toISOString() })
          .is('claimed_by', null)
          .eq('status', 'active')
          .ilike('email', escapeLike(newEmail))
          .select('id');

        await log(
          'user_email_changed',
          'user',
          target!.id,
          `${target!.first_name} ${target!.last_name}`.trim() || newEmail,
          { email: { from: oldEmail, to: newEmail }, roster_rows_claimed: claimed?.length ?? 0 },
        );
        return json(200, { success: true, rosterRowsClaimed: claimed?.length ?? 0 });
      }

      // ------------------------------------------------ client_set_password
      case 'client_set_password': {
        if (!body.password || body.password.length < MIN_PASSWORD) {
          return json(400, { error: `Password must be at least ${MIN_PASSWORD} characters` });
        }
        const { resp, target } = await requireClientTarget(body.userId);
        if (resp) return resp;

        const { error: pwErr } = await admin.auth.admin.updateUserById(target!.id, {
          password: body.password,
        });
        if (pwErr) return json(400, { error: pwErr.message });

        await log(
          'user_password_changed',
          'user',
          target!.id,
          `${target!.first_name} ${target!.last_name}`.trim() || target!.email,
          { resetByAdmin: true, targetEmail: target!.email },
        );
        return json(200, { success: true });
      }

      // -------------------------------------------------- client_set_active
      case 'client_set_active': {
        if (typeof body.isActive !== 'boolean') {
          return json(400, { error: 'isActive must be true or false' });
        }
        const { resp, target } = await requireClientTarget(body.userId);
        if (resp) return resp;

        // As the caller: prevent_privilege_escalation() validates is_active
        // changes against auth.uid(), which is NULL for the service role.
        const { data: patched, error: patchErr } = await caller
          .from('profiles')
          .update({ is_active: body.isActive })
          .eq('id', target!.id)
          .select('id');
        if (patchErr) return json(400, { error: patchErr.message });
        if (!patched || patched.length === 0) {
          await log(
            body.isActive ? 'user_activated' : 'user_deactivated',
            'user',
            target!.id,
            `${target!.first_name} ${target!.last_name}`.trim() || target!.email,
            { reason: 'profile_update_refused' },
            'failure',
          );
          return json(500, { error: 'The profile update was refused' });
        }

        // The auth-side lever. Without it a deactivated client signs in fine
        // and only finds empty pages.
        const { error: banErr } = await admin.auth.admin.updateUserById(target!.id, {
          ban_duration: body.isActive ? 'none' : BAN_FOREVER,
        });
        if (banErr) {
          // Revert the profile so the two levers never disagree.
          await caller.from('profiles').update({ is_active: !body.isActive }).eq('id', target!.id).select('id');
          await log(
            body.isActive ? 'user_activated' : 'user_deactivated',
            'user',
            target!.id,
            `${target!.first_name} ${target!.last_name}`.trim() || target!.email,
            { reverted: true, reason: banErr.message },
            'failure',
          );
          return json(500, { error: `Could not ${body.isActive ? 'unban' : 'ban'} the account: ${banErr.message}` });
        }

        await log(
          body.isActive ? 'user_activated' : 'user_deactivated',
          'user',
          target!.id,
          `${target!.first_name} ${target!.last_name}`.trim() || target!.email,
          { targetEmail: target!.email },
        );
        return json(200, { success: true });
      }

      // ------------------------------------------------------ client_unlink
      case 'client_unlink': {
        if (!body.rosterId) return json(400, { error: 'rosterId is required' });

        const { data: rows, error } = await admin
          .from('portal_roster')
          .update({ claimed_by: null, claimed_at: null })
          .eq('id', body.rosterId)
          .select('id, email, student_name');
        if (error) {
          await log('roster_row_unlinked', 'roster', body.rosterId, null, { reason: error.message }, 'failure');
          return json(400, { error: error.message });
        }
        if (!rows || rows.length === 0) return json(404, { error: 'No such roster row' });

        await log('roster_row_unlinked', 'roster', body.rosterId, rows[0].student_name, {
          email: rows[0].email,
        });
        return json(200, { success: true });
      }

      default:
        return json(400, { error: 'Unknown action' });
    }
  } catch (err) {
    console.error('portal-admin failed:', err);
    return json(500, { error: err instanceof Error ? err.message : 'Unexpected error' });
  }
});
