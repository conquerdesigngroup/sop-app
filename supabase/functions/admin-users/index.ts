// =============================================================================
// admin-users — privileged user management for studio admins
// =============================================================================
//
// WHY THIS EXISTS
//
// AuthContext.addUser() used supabase.auth.signUp(), which is the wrong
// primitive for an admin creating someone else's account. Two concrete bugs:
//
//   1. signUp() issues a session for the NEW user, so the admin doing the
//      creating gets silently signed in as the person they just created.
//
//   2. The chosen role was discarded. handle_new_user() hardcodes role='team'
//      (v6, deliberately — it was a privilege-escalation hole), so every user an
//      admin created came out a team member no matter what was selected.
//
// There was also no way for an admin to reset anyone else's password, which is
// why password resets were being done by hand in the Supabase dashboard.
//
// Fixing this needs the service role key, and that key can never go in a CRA
// bundle — every REACT_APP_* var is compiled into public JS. Hence a function.
//
// THE TWO-CLIENT PATTERN — the important part
//
// `admin` holds the service role: it bypasses RLS entirely and is the only way
// to reach auth.admin.*. `caller` carries the requester's own JWT.
//
// Anything touching public.profiles goes through `caller`, NOT `admin`. That is
// not stylistic. prevent_privilege_escalation() (v6) is a BEFORE UPDATE trigger
// that calls is_admin(), which resolves auth.uid(). Under the service role
// auth.uid() is NULL, so is_admin() is false and the trigger REJECTS every role
// change. Writing profiles as the caller means auth.uid() is the real admin, the
// trigger passes for the right reason, and the database — not this function —
// stays the thing enforcing who may change a role.
//
// The service role is therefore used for exactly what has no SQL equivalent:
// creating an auth user and setting a password.
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

type Role = 'super_admin' | 'admin' | 'team';

interface CreateUserBody {
  action: 'create_user';
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  department: string;
}

interface SetPasswordBody {
  action: 'set_password';
  userId: string;
  password: string;
}

type Body = CreateUserBody | SetPasswordBody;

const MIN_PASSWORD = 8;

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

  // Service role. Bypasses RLS. Used ONLY for auth.admin.* and for reading the
  // caller's own profile during the authorisation check below.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // The caller, as themselves. Every profiles write goes through this.
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

  // Read the caller's profile with the service role so the answer cannot be
  // influenced by whatever RLS would or would not show them.
  const { data: callerProfile, error: profileErr } = await admin
    .from('profiles')
    .select('role, is_active, email, first_name, last_name')
    .eq('id', callerId)
    .single();

  if (profileErr || !callerProfile) {
    return json(403, { error: 'No profile found for this account' });
  }
  // Management or above. NOT `role !== 'admin'`: once v13 promotes anyone, that
  // test is false for the most privileged accounts in the system and would lock
  // the super admins out of the one function that exists for them.
  //
  // This stays admin-or-above ON PURPOSE for now. Tightening it to super-admin-
  // only belongs in the deploy AFTER v13 — do it before and, with zero rows
  // holding the new role, nobody at all can create a login or reset a password.
  const callerIsManagement =
    callerProfile.role === 'admin' || callerProfile.role === 'super_admin';
  const callerIsSuperAdmin = callerProfile.role === 'super_admin';

  // ------------------------------------------------------------- dispatch
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body must be JSON' });
  }

  // Through `caller`: with a session, log_activity takes identity from the
  // JWT, so these rows name the real person whatever this code claims.
  const logActivity = async (
    action: string,
    entityId: string | null,
    entityTitle: string | null,
    details: Record<string, unknown>,
    result: 'success' | 'failure' = 'success',
    entityType = 'user',
  ) => {
    const { error } = await caller.rpc('log_activity', {
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_entity_title: entityTitle,
      p_details: details,
      p_result: result,
    });
    if (error) console.error('admin-users could not write log:', error.message);
  };

  if (!callerIsManagement || callerProfile.is_active === false) {
    // A refused probe of a privileged endpoint is a fact worth keeping. The
    // caller has a session, so the row names them.
    await logActivity(
      'admin_users_denied',
      null,
      null,
      {
        attemptedAction: body?.action ?? 'unknown',
        reason: callerIsManagement ? 'account_deactivated' : 'not_admin',
      },
      'failure',
      'system',
    );
    return json(403, { error: 'Admin access required' });
  }

  try {
    switch (body.action) {
      // ------------------------------------------------------ create_user
      case 'create_user': {
        const { email, password, firstName, lastName, role, department } = body;

        if (!email?.trim()) return json(400, { error: 'Email is required' });
        if (!password || password.length < MIN_PASSWORD) {
          return json(400, { error: `Password must be at least ${MIN_PASSWORD} characters` });
        }
        if (role !== 'admin' && role !== 'team' && role !== 'super_admin') {
          return json(400, { error: "Role must be 'super_admin', 'admin' or 'team'" });
        }
        // Nobody grants a tier they do not hold. This mirrors rule 2 of
        // prevent_privilege_escalation() rather than replacing it — the database
        // refuses it either way; refusing here gives a real message instead of a
        // constraint error, and stops a half-made auth account being created
        // first and rolled back.
        if (role === 'super_admin' && !callerIsSuperAdmin) {
          return json(403, { error: 'Only a super admin may create a super admin' });
        }

        // email_confirm: true — an admin handing someone their account should
        // not also require the new hire to find a confirmation email first.
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: email.trim().toLowerCase(),
          password,
          email_confirm: true,
          user_metadata: {
            first_name: firstName ?? '',
            last_name: lastName ?? '',
            department: department ?? 'General',
          },
        });

        if (createErr || !created?.user) {
          const msg = createErr?.message ?? 'Could not create the account';
          const dup = /already|registered|exists/i.test(msg);
          await logActivity(
            'user_created',
            null,
            `${firstName ?? ''} ${lastName ?? ''}`.trim(),
            { newUserEmail: email, reason: dup ? 'already_registered' : msg },
            'failure',
          );
          return json(dup ? 409 : 400, {
            error: dup ? 'A user with this email already exists' : msg,
          });
        }

        const newId = created.user.id;

        // handle_new_user() has now inserted the profile with role='team' and
        // whatever metadata was supplied. Correct it AS THE CALLER so the
        // privilege-escalation trigger validates the change against a real
        // admin uid. See the header note.
        // .select() is not decoration. Without it PostgREST answers an UPDATE
        // with 204 and no body, and `error` is null even when ZERO rows matched
        // — so an RLS refusal or a trigger rejection read as success and left a
        // new account sitting at role='team', is_active=false, with the caller
        // told it worked. The row count is the only honest signal.
        const { data: patched, error: patchErr } = await caller
          .from('profiles')
          .update({
            first_name: firstName ?? '',
            last_name: lastName ?? '',
            role,
            department: department ?? 'General',
            is_active: true,
            invited_by: callerId,
          })
          .eq('id', newId)
          .select('id');

        if (!patchErr && (!patched || patched.length === 0)) {
          await admin.auth.admin.deleteUser(newId);
          // The account existed briefly and was destroyed — one failure row
          // keeps the create/delete pair from vanishing without trace.
          await logActivity(
            'user_created',
            newId,
            `${firstName ?? ''} ${lastName ?? ''}`.trim(),
            { newUserEmail: email, reason: 'profile_update_refused', rolledBack: true },
            'failure',
          );
          return json(500, {
            error: 'Account was created but its profile could not be set — the '
              + 'update was refused. The account has been removed, please try again.',
          });
        }

        if (patchErr) {
          // The auth user exists but its profile is wrong. Roll back rather than
          // leaving a half-made account that logs in as the wrong role.
          await admin.auth.admin.deleteUser(newId);
          await logActivity(
            'user_created',
            newId,
            `${firstName ?? ''} ${lastName ?? ''}`.trim(),
            { newUserEmail: email, reason: patchErr.message, rolledBack: true },
            'failure',
          );
          return json(500, {
            error: `Account was created but its profile could not be set (${patchErr.message}). The account has been removed — please try again.`,
          });
        }

        await logActivity('user_created', newId, `${firstName ?? ''} ${lastName ?? ''}`.trim(), {
          newUserEmail: email,
          newUserRole: role,
          newUserDepartment: department,
        });

        return json(200, { success: true, userId: newId });
      }

      // ----------------------------------------------------- set_password
      case 'set_password': {
        const { userId, password } = body;

        if (!userId) return json(400, { error: 'userId is required' });
        if (!password || password.length < MIN_PASSWORD) {
          return json(400, { error: `Password must be at least ${MIN_PASSWORD} characters` });
        }

        const { data: target } = await admin
          .from('profiles')
          .select('email, first_name, last_name, role')
          .eq('id', userId)
          .single();

        if (!target) return json(404, { error: 'No such user' });

        // A password reset is account takeover by another name. While this
        // function is still open to admin-or-above, an admin resetting a super
        // admin's password would hand themselves pay and provisioning one login
        // later — so the target's tier is checked even though the caller's is
        // not yet. Inert until v13 promotes anyone; wrong to add afterwards.
        if (target.role === 'super_admin' && !callerIsSuperAdmin) {
          await logActivity(
            'user_password_changed',
            userId,
            `${target.first_name} ${target.last_name}`.trim(),
            { resetByAdmin: true, targetEmail: target.email, reason: 'target_super_admin' },
            'failure',
          );
          return json(403, { error: "Only a super admin may reset a super admin's password" });
        }

        const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
        if (pwErr) {
          await logActivity(
            'user_password_changed',
            userId,
            `${target.first_name} ${target.last_name}`.trim(),
            { resetByAdmin: true, targetEmail: target.email, reason: pwErr.message },
            'failure',
          );
          return json(400, { error: pwErr.message });
        }

        await logActivity(
          'user_password_changed',
          userId,
          `${target.first_name} ${target.last_name}`.trim(),
          { resetByAdmin: true, targetEmail: target.email },
        );

        return json(200, { success: true });
      }

      default:
        return json(400, { error: 'Unknown action' });
    }
  } catch (err) {
    console.error('admin-users failed:', err);
    return json(500, { error: err instanceof Error ? err.message : 'Unexpected error' });
  }
});
