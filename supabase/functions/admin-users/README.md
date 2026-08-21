# admin-users

Privileged user management for studio admins: create an account with the right
role, and reset someone else's password.

Deployed to project `sgppeenmvskwztaszkgn` with `verify_jwt: true`.

## Why it exists

`AuthContext.addUser()` used to call `supabase.auth.signUp()`. Two bugs came
out of that:

1. **`signUp()` issues a session for the new user.** The admin doing the
   creating was silently signed in as the person they had just created.
2. **The chosen role was discarded.** `handle_new_user()` hardcodes
   `role = 'team'` (v6, deliberately — it was a privilege-escalation hole), so
   the trigger always won. Every account an admin made came out a team member.
   The manual-insert fallback that would have corrected it only ran when the
   trigger had *not* created the profile, which never happens.

There was also no way for an admin to reset another user's password, which is
why resets were being done by hand in the Supabase dashboard.

Doing this properly needs `auth.admin.*`, which needs the service role key,
which can never ship in a CRA bundle — every `REACT_APP_*` var is compiled into
public JS.

## The two-client pattern

The function builds two Supabase clients and the split is load-bearing:

| client | key | used for |
|---|---|---|
| `admin` | service role | `auth.admin.createUser`, `auth.admin.updateUserById`, and reading the caller's own profile during authorisation |
| `caller` | anon + the caller's `Authorization` header | **every write to `public.profiles`** and the activity log |

Profile writes must go through `caller`. `prevent_privilege_escalation()` (v6)
is a `BEFORE UPDATE` trigger that calls `is_admin()`, which resolves
`auth.uid()`. Under the service role `auth.uid()` is NULL, `is_admin()` is
false, and **the trigger rejects the role change**.

This was verified against the live database rather than assumed:

```
service role blocked: t  |  admin succeeded: t
```

So using the service role for the profile patch would have made every user
creation fail at the role step — and, because the function rolls back on that
failure, silently delete the account it had just made.

Writing as the caller also keeps the invariant honest: the database, not this
function, is still the thing deciding who may change a role.

## Environment

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are injected
by the platform. Nothing to configure.

## Auth → URL Configuration (separate, and it has bitten us)

Password-reset emails are built from the project's **Site URL** unless the
caller passes an explicit `redirectTo`. That setting pointed at a different
application, so every reset email sent from the dashboard landed on the wrong
app — the token was valid and consumed there.

Two things follow:

- **Site URL** must be the SOP app's production origin.
- **Redirect URLs** must include that origin, or the explicit `redirectTo` that
  `requestPasswordReset()` sends is ignored and Supabase silently falls back to
  the Site URL.

`AuthContext.requestPasswordReset()` always passes
`${window.location.origin}/reset-password`, so the in-app forgot-password flow
is correct independently of the Site URL — provided the origin is allow-listed.

## Actions

```jsonc
// admin only, enforced against the caller's own JWT
{ "action": "create_user",
  "email": "...", "password": "...",
  "firstName": "...", "lastName": "...",
  "role": "admin" | "team", "department": "..." }

{ "action": "set_password", "userId": "<uuid>", "password": "..." }
```

Accounts are created with `email_confirm: true` — an admin handing someone
their login should not also require them to find a confirmation email.

## Redeploying

Via the Supabase MCP `deploy_edge_function`, or:

```bash
supabase functions deploy admin-users --project-ref sgppeenmvskwztaszkgn
```

## What is and is not verified

Verified: the authorisation paths (no header → 401, bad JWT → 401, CORS
preflight → 200) and, in SQL, the trigger behaviour the two-client split exists
for.

Not verified end to end: `create_user` and `set_password` against a real admin
session, which needs a genuine login. Test both from the app after signing in.
