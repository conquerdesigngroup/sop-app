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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

type Role = 'admin' | 'team';

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
  if (callerProfile.role !== 'admin' || callerProfile.is_active === false) {
    return json(403, { error: 'Admin access required' });
  }

  // ------------------------------------------------------------- dispatch
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body must be JSON' });
  }

  const logActivity = async (action: string, entityId: string, entityTitle: string, details: unknown) => {
    // Through `caller`: the activity_logs INSERT policy requires
    // user_id = auth.uid(), so the service role could not write this row.
    await caller.from('activity_logs').insert({
      user_id: callerId,
      user_email: callerProfile.email,
      user_name: `${callerProfile.first_name} ${callerProfile.last_name}`.trim(),
      action,
      entity_type: 'user',
      entity_id: entityId,
      entity_title: entityTitle,
      details,
    });
  };

  try {
    switch (body.action) {
      // ------------------------------------------------------ create_user
      case 'create_user': {
        const { email, password, firstName, lastName, role, department } = body;

        if (!email?.trim()) return json(400, { error: 'Email is required' });
        if (!password || password.length < MIN_PASSWORD) {
          return json(400, { error: `Password must be at least ${MIN_PASSWORD} characters` });
        }
        if (role !== 'admin' && role !== 'team') {
          return json(400, { error: "Role must be 'admin' or 'team'" });
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
          return json(dup ? 409 : 400, {
            error: dup ? 'A user with this email already exists' : msg,
          });
        }

        const newId = created.user.id;

        // handle_new_user() has now inserted the profile with role='team' and
        // whatever metadata was supplied. Correct it AS THE CALLER so the
        // privilege-escalation trigger validates the change against a real
        // admin uid. See the header note.
        const { error: patchErr } = await caller
          .from('profiles')
          .update({
            first_name: firstName ?? '',
            last_name: lastName ?? '',
            role,
            department: department ?? 'General',
            is_active: true,
            invited_by: callerId,
          })
          .eq('id', newId);

        if (patchErr) {
          // The auth user exists but its profile is wrong. Roll back rather than
          // leaving a half-made account that logs in as the wrong role.
          await admin.auth.admin.deleteUser(newId);
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
          .select('email, first_name, last_name')
          .eq('id', userId)
          .single();

        if (!target) return json(404, { error: 'No such user' });

        const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
        if (pwErr) return json(400, { error: pwErr.message });

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
