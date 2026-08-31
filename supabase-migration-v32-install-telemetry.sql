-- =============================================================================
-- Migration v32 — how many families actually installed the app
-- =============================================================================
--
-- WHY THIS EXISTS
--
-- Web Push on iOS only reaches a site that has been added to the Home Screen.
-- A parent with the portal open in a Safari tab cannot receive a notification,
-- ever, no matter what the code does. Android and desktop have no such rule.
--
-- So the value of building push is bounded by one unknown number: the share of
-- parents who installed. Nobody knows it. This migration is how we find out
-- BEFORE writing a subscription table, a VAPID keypair, a send path and a
-- permission flow that might reach a tenth of the audience.
--
-- WHAT IT DELIBERATELY DOES NOT COLLECT
--
-- No user id, no session id, no IP, no user agent string, no timestamps finer
-- than a date. The table cannot answer "did Rosa install the app" because it
-- holds no row about Rosa — only "on this day, N standalone and M browser hits
-- from iOS". That is the entire question being asked, and collecting anything
-- more would be gathering data about children's families for no reason.
--
-- Counting is per browser per day, enforced client-side (see
-- src/lib/displayMode.ts). That makes the numbers "daily actives by mode",
-- which is the right denominator for a reach estimate — not unique people, and
-- not page views.
--
-- HONEST LIMITATION
--
-- The RPC below is callable by anon, because the population being measured is
-- anonymous: the portal is still access-code based and the client-auth flag is
-- off. Anyone who reads the bundle could therefore call it in a loop and skew
-- the counts. That is accepted: the numbers inform a build/don't-build
-- decision, they are not billing, and the alternative — an Edge Function — is
-- equally unauthenticated and only adds a deploy step. If the counts ever look
-- absurd, that is the explanation to check first.
-- =============================================================================

-- 1. The aggregate table -------------------------------------------------------

create table if not exists public.portal_install_stats (
  day           date    not null default current_date,
  display_mode  text    not null check (display_mode in ('standalone', 'browser')),
  platform      text    not null check (platform in ('ios', 'android', 'desktop', 'other')),
  hits          integer not null default 0,

  -- The primary key IS the aggregation. One row per bucket per day means the
  -- table stays tiny forever and there is no per-visit row to re-identify.
  primary key (day, display_mode, platform)
);

comment on table public.portal_install_stats is
  'Anonymous daily counts of PWA display mode, to size the reachable audience for web push. No per-user rows by design.';

-- 2. The write path ------------------------------------------------------------
--
-- security definer so the caller needs no table grant at all: anon can increment
-- a counter and can do nothing else, least of all read the table back.
--
-- The CHECK constraints above would already reject bad input, but they would do
-- it with a constraint violation surfaced to an anonymous caller. Validating
-- here turns that into a clean, quiet no-op and keeps the surface dull.

create or replace function public.record_install_ping(
  p_display_mode text,
  p_platform     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_display_mode is null or p_display_mode not in ('standalone', 'browser') then
    return;
  end if;

  if p_platform is null or p_platform not in ('ios', 'android', 'desktop', 'other') then
    return;
  end if;

  insert into public.portal_install_stats (day, display_mode, platform, hits)
  values (current_date, p_display_mode, p_platform, 1)
  on conflict (day, display_mode, platform)
  do update set hits = public.portal_install_stats.hits + 1;
end;
$$;

comment on function public.record_install_ping(text, text) is
  'Increments one anonymous daily counter. Returns void: nothing is readable through it.';

-- 3. RLS — read is staff-only, write is only ever through the function ---------

alter table public.portal_install_stats enable row level security;

-- No INSERT/UPDATE/DELETE policy exists, for anybody. The only writer is the
-- security-definer function above, which runs as its owner and bypasses RLS.
-- The service role also bypasses RLS, which is how a future admin screen or a
-- manual query can backfill or correct a row.
drop policy if exists portal_install_stats_select_admin on public.portal_install_stats;
create policy portal_install_stats_select_admin
  on public.portal_install_stats
  for select
  to authenticated
  using (public.is_admin());

-- 4. Grants --------------------------------------------------------------------
--
-- anon may execute the counter and nothing else. It has no grant on the table,
-- so even a SELECT attempt fails before RLS is consulted.

revoke all on public.portal_install_stats from anon, authenticated;
grant select on public.portal_install_stats to authenticated;

revoke all on function public.record_install_ping(text, text) from public;
grant execute on function public.record_install_ping(text, text) to anon, authenticated;

-- =============================================================================
-- Reading the answer
--
-- The question "what share of parents could receive a push notification" is
-- the standalone share on iOS. Android and desktop can receive push in a plain
-- tab, so they are reachable regardless of mode and are not part of the gate.
--
--   select
--     platform,
--     sum(hits) filter (where display_mode = 'standalone') as installed,
--     sum(hits) filter (where display_mode = 'browser')    as in_browser,
--     round(
--       100.0 * sum(hits) filter (where display_mode = 'standalone')
--       / nullif(sum(hits), 0)
--     , 1) as installed_pct
--   from portal_install_stats
--   where day >= current_date - 28
--   group by platform
--   order by platform;
--
-- Let it run for two to four weeks before reading anything into it. A single
-- week over a holiday is not a signal.
-- =============================================================================
