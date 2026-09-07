-- =============================================================================
-- v47 — LINK A FAMILY WHEN THEY SIGN UP, NOT WHEN THEY HAPPEN TO OPEN A PAGE
--
-- portal_household_members is the row that says "this login belongs to this
-- family". Every RLS policy pivots on it, the Portal Viewer's "Signed up"
-- badge counts it, and until now the ONLY thing that could create one was
-- link_household_member(), called from loadHouseholdSummary() — i.e. from
-- whichever page happened to read the household.
--
-- Until 2026-09-07 the only such page was /portal/profile, one tap in from the
-- portal home. So a parent who signed up, verified their email and stopped at
-- the front door was never linked: real account, real household, no row, and
-- a Viewer that called them "Not signed up" alongside the 334 families who
-- have never signed up at all.
--
-- Measured on 2026-09-07: 12 client accounts, 9 linked. Of the four families
-- who signed up that afternoon, the two who tapped through to their profile
-- were linked and the two who did not were not. Nothing distinguished them at
-- the front door.
--
-- WHY NOT A TRIGGER ON auth.users
--
-- It was the obvious answer and it does not work here. handle_new_user() fires
-- on the INSERT into auth.users, and portal-signup then DELETES and re-INSERTS
-- the profile row to correct its role (GoTrue applies app_metadata after the
-- insert that fires the trigger, so the trigger files a client as a default
-- team row). portal_household_members.profile_id is ON DELETE CASCADE, so a
-- membership created by that trigger is destroyed seconds later by the profile
-- rebuild — leaving exactly the bug this migration exists to fix, with no
-- trace of why. The link has to happen AFTER the rebuild, which means the
-- signup function, which means a function it can call.
--
-- WHAT CHANGES
--
--   1. link_household_member_for(profile_id) — the matching rule, in one
--      place, callable with the service role.
--   2. link_household_member() delegates to it. The self-service RPC stays
--      exactly as it was from a client's point of view, and remains the safety
--      net for the accounts created before this migration.
--   3. portal_household_members.linked_at, so signup-to-link drift is
--      observable instead of being invisible for a fortnight.
--   4. A backfill for every client account already stranded.
-- =============================================================================

-- 1. The rule, named once ---------------------------------------------------
--
-- SECURITY: this takes a profile id as an ARGUMENT, so it must never be
-- reachable by a client — a parent who could call it with somebody else's id
-- would put their own login into another family's household and read every
-- child in it. It is revoked from anon and authenticated below. The
-- self-service wrapper is security definer, so it can still call this while
-- being unable to pass anything but auth.uid().

create or replace function public.link_household_member_for(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text;
  v_household uuid;
  v_existing  uuid;
begin
  if p_profile_id is null then
    return null;
  end if;

  -- Already linked: idempotent, and a second call must never move somebody.
  select household_id into v_existing
    from public.portal_household_members
   where profile_id = p_profile_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- The email on the account itself, never one a caller supplies.
  select lower(email) into v_email from auth.users where id = p_profile_id;
  if v_email is null then
    return null;
  end if;

  select id into v_household
    from public.portal_households
   where lower(primary_email) = v_email
     and status = 'active'
   limit 1;
  if v_household is null then
    return null;
  end if;

  -- Guardian: sees every child in the household. A student member is pinned to
  -- one child and is created by an admin, never self-service — a login cannot
  -- be allowed to declare itself a particular child.
  insert into public.portal_household_members (household_id, profile_id, member_type, student_id)
  values (v_household, p_profile_id, 'guardian', null)
  on conflict (profile_id) do nothing;

  return v_household;
end;
$$;

revoke all on function public.link_household_member_for(uuid) from public, anon, authenticated;

-- Said out loud rather than relied upon. Supabase's default privileges on the
-- public schema grant EXECUTE to service_role directly, so the revoke above
-- leaves it standing — but portal-signup calling this is the whole point of
-- the migration, and "it happens to still work because of a platform default"
-- is not a thing to leave unwritten. Verified after applying: the ACL is
-- {postgres=X, service_role=X} and nothing else.
grant execute on function public.link_household_member_for(uuid) to service_role;

comment on function public.link_household_member_for(uuid) is
  'Links a profile to the active household holding that account''s own email. '
  'Service role only — it takes a profile id, so a client must never reach it. '
  'Clients use link_household_member(), which can only pass their own uid.';

-- 2. The self-service RPC, now a wrapper -------------------------------------
--
-- Unchanged from a client's point of view: same name, same signature, same
-- guarantee that it can only ever link the caller to the household carrying
-- the caller's own email. It stays in loadHouseholdSummary() as the net for
-- every account created before this migration.

create or replace function public.link_household_member()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  return public.link_household_member_for(auth.uid());
end;
$$;

revoke all on function public.link_household_member() from public, anon;
grant execute on function public.link_household_member() to authenticated;

comment on function public.link_household_member() is
  'Links the signed-in client to the household holding their own JWT email. Cannot target another household.';

-- 3. When the link happened --------------------------------------------------
--
-- The reason this bug survived unseen: there was no timestamp on the
-- membership row, so "signed up at 14:14, linked never" was not a question the
-- data could be asked. Null means the row predates this column, which is not
-- the same as "linked at the moment of this migration" and should not be
-- written as if it were.

alter table public.portal_household_members
  add column if not exists linked_at timestamptz;

alter table public.portal_household_members
  alter column linked_at set default now();

comment on column public.portal_household_members.linked_at is
  'When this login claimed the household. Null for rows created before v47.';

-- 4. Backfill the stranded accounts ------------------------------------------
--
-- Every client profile whose email matches an active household and which has
-- no membership row — the same rule the function above applies, so this can
-- only produce links that a visit to the portal would have produced anyway.
--
-- Written as a rule rather than as a list of the two families it fixes today,
-- because this repository is public and their addresses are not.
--
-- distinct on (p.id): a profile matching two households would otherwise offer
-- two rows for one unique profile_id. Deterministic rather than arbitrary.

insert into public.portal_household_members (household_id, profile_id, member_type, student_id, linked_at)
select distinct on (p.id)
       h.id, p.id, 'guardian', null, now()
  from public.profiles p
  join public.portal_households h
    on lower(h.primary_email) = lower(p.email)
   and h.status = 'active'
 where p.role = 'client'
   and not exists (
     select 1 from public.portal_household_members m where m.profile_id = p.id
   )
 order by p.id, h.created_at
on conflict (profile_id) do nothing;
