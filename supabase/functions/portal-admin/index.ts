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
    | 'roster_deactivate'
    | 'roster_reactivate'
    | 'client_list'
    | 'client_set_email'
    | 'client_set_password'
    | 'client_set_active'
    | 'client_unlink';
  rows?: unknown[];
  filename?: string;
  rosterId?: string;
  filter?: string;
  search?: string;
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
