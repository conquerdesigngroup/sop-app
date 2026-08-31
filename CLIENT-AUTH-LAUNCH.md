# Client Portal Auth — Launch Runbook

Built per `CLIENT-AUTH-BUILD.md` + `AUDIT-LOG-SPEC.md`. Everything below is
**done and verified in code** unless it is in §"You must do these in the
dashboard" — those three need the Supabase UI and cannot be done headless.

## What shipped

**Database (live on SOP-APP now):**
- `v28_client_auth_roster_and_role` — `portal_roster` (service-role only),
  `portal_signup_attempts`, `role='client'` added to the CHECK, `is_active_staff()`
  fixed to test role (landmine 3), `handle_new_user()` branches on
  `app_metadata.account_type`, five calendar/event SELECT policies scoped to
  `is_active_staff()` (they were `USING(true)` → a client JWT would have read the
  staff calendar), and `admin_roster_import` / `admin_client_list` RPCs.
- `v29_audit_log_overwatch` — `activity_logs` gains `actor_kind/actor_role/result/
  request_id` + 7 indexes; `log_activity()` write RPC (identity from JWT, service
  role may attribute system rows); `admin_activity_search()` / `admin_activity_facets()`
  read RPCs gated on `is_super_admin()` inside the function. UPDATE grant revoked
  (rows immutable).

**Edge functions (deployed, ACTIVE):** `portal-signup`, `portal-admin`.

**Frontend (behind `REACT_APP_CLIENT_AUTH`, default false):** portal login /
signup (3-step, OTP) / update-password / account pages; `PortalAuthContext`;
`ClientAccountsPage` at `/portal-admin/clients`; rebuilt `ActivityLogPage`
(filters-in-URL, keyset scroll, actor/entity drill-down, CSV export); client-role
gating in `AuthContext` (a client session never becomes staff `currentUser`);
`document_downloaded` logging wired into the portal file opens.

**Two-stage rollout (added after the initial build).** The login can be tested
in parallel with the live portal before it is ever forced on anyone:

- `REACT_APP_CLIENT_AUTH=true` — the login EXISTS: routes register and a small
  "Client login · beta" button appears below the two main tiles on the front
  door (`ChooserPage`). The Dancer Portal tile is unchanged — real families keep
  the access-code portal. A test account that logs in via the small button may
  then open any program WITHOUT the studio code, which is how you confirm the
  login gates access. Ships safely on its own; changes nothing for current
  clients.
- `REACT_APP_CLIENT_AUTH_REQUIRED=true` — the FULL launch: `ProgramGate` and
  `PortalHome` now demand a session and the access-code path retires. Pairs with
  v30. `REQUIRED` implies `CLIENT_AUTH`.

So the parallel-test build is `REACT_APP_CLIENT_AUTH=true`,
`REACT_APP_CLIENT_AUTH_REQUIRED=false`, v30 NOT applied.

**NOT applied yet, on purpose:** `supabase-migration-v30-close-anon-door.sql`.
It closes the anonymous portal reads and IS the flag flip, database-side.

## Verified by live test (2026-08-29)

W1: off-roster signup byte-identical to success & timing flat (0.46–0.51s both);
created client has `role='client'`, `is_active`, `app_metadata.account_type=client`;
signed-in client reads exactly its own profile row and zero rows from every staff
table; anon gets 0 from `portal_roster` and the audit RPCs; a browser `signUp`
with `app_metadata:{account_type:admin}` produced an **inactive team** row, not an
admin. W2: dirty CSV imports cleanly (dupes/malformed/unknown-program rejected with
reasons, nothing deleted), re-import is a no-op, email-change lets the client sign
in with the new address + existing password, deactivation blocks login and
reactivation restores it, team/client both get 403 from every action, every action
logged naming the admin. W3: identity cannot be forged (a client passing someone
else's `p_actor_id` recorded the client), `admin_activity_search` raises
"Not authorised" for admin/team/client/anon, a single-actor 7-day query over 101k
rows ran in **0.5ms**, no password/OTP/token/secret in any log row, logs are
un-updatable by everyone and deletable only by super_admin. Existing staff calendar
reads and the full profile directory still work.

**Coverage pass (2026-08-30).** AUDIT-LOG-SPEC §8.11 ("every mutation logs")
was audited function-by-function across every mutation family; 64 confirmed
gaps were wired: work hours (submit/edit/delete/approve/reject + pay rates),
all portal-admin content mutations (documents, classes incl. the cascading
delete, updates, events, gate + access-code changes), staff and client
auth failure paths, calendar events and attachments, the settings data wipe,
the data-integrity auto-fixes, and `document_downloaded` on staff opens and
portal media plays. `admin-users` now logs through the `log_activity` RPC like
every other function (its direct-insert side door is gone), and denials/
rollbacks in all four edge functions write `result='failure'` rows.
`v31_audit_log_truncate` additionally revokes TRUNCATE/TRIGGER/REFERENCES on
`activity_logs` from the API roles — TRUNCATE ignores RLS, so immutability
must not depend on PostgREST simply not exposing it. Known limit, by design:
anon portal visitors (the access-code stage) cannot write log rows at all;
`document_downloaded` becomes complete only once client login is the path.

## You must do these in the dashboard (launch blockers)

1. **Custom SMTP first** (Authentication → Settings). Supabase's built-in mailer
   only delivers to org-team addresses and is capped at ~2/hour, so signup/reset
   are untestable with a real parent address until this is set. Use Resend or
   Postmark with DKIM/SPF/DMARC on a sending subdomain. Then raise the rate limit
   (Authentication → Rate Limits) before inviting ~400 families, and stagger by
   program.

2. **Magic Link email template must contain `{{ .Token }}`** (Authentication →
   Email Templates → Magic Link). Email OTP shares the Magic Link template; without
   `{{ .Token }}` the email carries only a link and the 6-digit code screen has
   nothing to show. This is a hard dependency of the signup flow — confirmed
   against Supabase docs.

3. **Add the reset redirect URL** (Authentication → URL Configuration → Redirect
   URLs): `https://<your-domain>/portal/update-password` (and the localhost form
   if you test locally). Without it the reset link falls back to the Site URL and
   404s.

## Testing now (parallel, clients unaffected)

1. Import the roster in Client Accounts (`/portal-admin/clients` → Import roster),
   or add a couple of test roster rows.
2. Set `REACT_APP_CLIENT_AUTH=true` (leave `REACT_APP_CLIENT_AUTH_REQUIRED`
   false) in Vercel, redeploy. Do NOT apply v30.
3. The front door now shows "Client login · beta" below the two tiles. Test
   sign-up/verify/login/reset with test accounts there. Real families keep using
   the Dancer Portal tile (access code) exactly as before.
4. Note: until custom SMTP is set (§ above), the built-in mailer only delivers to
   addresses on the Supabase org team — so test with those addresses, or set SMTP
   first.

## Launch day, in order (when testing is done)

1. Set `REACT_APP_CLIENT_AUTH_REQUIRED=true` in Vercel (keep `REACT_APP_CLIENT_AUTH=true`),
   redeploy.
2. Apply `supabase-migration-v30-close-anon-door.sql`.
3. Smoke test: signed-out visitor → portal login; a client → content; staff →
   everything unchanged.
4. Keep the access-code path in the bundle for two weeks, then remove it and
   `verify_portal_code`'s anon grant.

Rollback: set `REACT_APP_CLIENT_AUTH_REQUIRED=false` (back to the safe parallel
stage), and if v30 was applied, re-create the anon policies (all recorded in the
v30 file header).

## One landmine worth knowing

On this project's GoTrue, `admin.createUser({ app_metadata })` applies the
metadata **after** the INSERT that fires `handle_new_user()`, so the trigger never
sees `account_type` and files the profile as team/inactive. `portal-signup`
rebuilds the row (DELETE + INSERT as `client` — the escalation trigger polices
UPDATE and super_admin INSERTs, not a plain client INSERT) immediately after
`createUser`. If a future Supabase upgrade supplies the metadata at INSERT time,
`handle_new_user`'s client branch takes over and the rebuild becomes a no-op.
