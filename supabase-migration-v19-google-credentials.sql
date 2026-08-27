-- =============================================================================
-- v19 — the studio's Google connection, server side
-- =============================================================================
--
-- STATUS: APPLIED to prod 2026-08-27 as `v19_google_credentials` and
--         `v19b_google_credentials_revoke`.
--
-- WHAT THIS IS FOR
--
-- Two-way sync: events created or edited in the app appearing on the Google
-- calendar. That needs the app to write to Google when nobody is watching,
-- which needs a credential that outlives a browser tab. Today's OAuth flow
-- hands its tokens to the page and they live in localStorage — fine for a
-- person reading their own calendar, useless for a scheduled job.
--
-- WHY OAUTH AND NOT A SERVICE ACCOUNT
--
-- A service account was the plan, and the didancecenter.com Workspace blocks
-- service account keys outright:
--
--   iam.disableServiceAccountKeyCreation, enforced org-wide
--
-- Turning that off needs Organization Policy Administrator and weakens a
-- default Google security guardrail for every project under the domain.
-- OAuth needs neither. The service account didc-calendar-writer still exists
-- in didc-calendar-sync-506814 and is unused; it can be deleted.
--
-- WHY A TABLE AND NOT A VAULT SECRET
--
-- The refresh token is produced BY the consent flow, so it cannot be pasted in
-- ahead of time the way an API key can. It has to be written by the callback
-- that receives it, and a table is the only thing writable at run time.
-- (Contrast v18, where the service role key genuinely is a paste-ahead value
-- and Vault is right.)
--
-- WHY ONE ROW
--
-- One Google identity for the studio — info@didancecenter.com, which owns all
-- three calendars. Per-user tokens would attribute events to whoever happened
-- to be signed in, and break the sync when that person left. The check
-- constraint makes the single row structural rather than a convention.
--
-- WHY NO POLICIES, AND WHY ALSO REVOKE
--
-- RLS on with zero policies already returns no rows to anon and authenticated.
-- The revoke is the second lock: without it, one accidental "allow read" policy
-- later is enough to hand out a bearer credential for the studio's calendars.
-- portal_access_codes is locked the same way, which is why probing it as anon
-- returns 42501 rather than an empty list. Verified here the same way:
--
--   select * from google_credentials;   -- as anon -> 42501
-- =============================================================================

create table if not exists public.google_credentials (
  -- Single row, enforced. 'calendar' rather than a boolean or a magic integer
  -- so a second integration later gets its own obvious name.
  id            text primary key default 'calendar' check (id = 'calendar'),

  -- Which Google account consented. Shown in the UI so the studio can see at a
  -- glance that it is connected as info@ and not somebody's personal account.
  google_email  text,

  -- The credential itself. Long-lived: the consent screen is Internal to the
  -- didancecenter.com Workspace, so this does not carry the seven-day expiry
  -- that an External app in testing would.
  refresh_token text not null,

  -- What was granted. Worth storing: a token minted before a scope was added
  -- keeps the old, narrower scope, and the resulting 403 names nothing useful.
  scope         text,

  connected_by  uuid references public.profiles(id) on delete set null,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Filled by the push path. last_error is how a revoked token becomes visible
  -- in the UI instead of silently failing every write.
  last_used_at  timestamptz,
  last_error    text
);

alter table public.google_credentials enable row level security;

-- Deliberately no policies. See the header.

revoke all on public.google_credentials from anon;
revoke all on public.google_credentials from authenticated;

comment on table public.google_credentials is
  'The studio''s Google OAuth refresh token for calendar writes. Service role only — RLS is on with no policies by design. Written by the google-oauth Edge Function''s connect action.';

-- ----------------------------------------------------------------- verifying
--
--   select
--     (select count(*) from pg_policies where tablename='google_credentials') as policies,
--     (select relrowsecurity from pg_class where relname='google_credentials') as rls_on;
--   -- expect 0, true
--
--   -- and, as anon through PostgREST, expect 42501 rather than []
