-- =============================================================================
-- Migration v35 — make the seeded data reachable by the families it belongs to
-- =============================================================================
--
-- An adversarial audit of the v33/v34 seed found three things that would have
-- made the beta silently useless. All three are fixed here.
--
-- 1. THE ENROLLMENT LIST HUNG OFF THE WRONG TABLE
--
-- portal_attendance_summary aggregates SESSIONS. With no attendance imported it
-- returns zero rows — correctly, there is nothing to aggregate. But the client
-- read its class list from that view, so an enrolled child produced no rows and
-- the card rendered "No classes this season". That sentence is false: the child
-- is enrolled, the studio has simply not imported attendance yet.
--
-- Enrollment and attendance are different facts with different lifetimes. The
-- new portal_my_enrollments view always returns a row per enrollment and LEFT
-- JOINs the numbers, so "enrolled, no sessions yet" is representable — which is
-- the true state of every family in this database today.
--
-- 2. NOTHING COULD LINK A PARENT TO THEIR HOUSEHOLD
--
-- portal_household_members is the table every RLS policy pivots on, and nothing
-- in the schema or the app could create a row in it. Every signed-in parent
-- would have seen "No dancers linked yet" forever. link_household_member()
-- closes that: a signed-in client claims the household carrying their own email.
--
-- 3. THE SEEDED FAMILIES COULD NOT SIGN UP
--
-- portal-signup gates on portal_roster, which held 2 rows against 342 seeded
-- households. Every family would have been refused at account creation — and
-- refused silently, because the endpoint is deliberately enumeration-safe.
-- The roster is now derived from the households themselves.
-- =============================================================================

-- 1. Data corrections from the audit --------------------------------------

-- Same child, entered twice in Enrolio with a ten-year typo in the birth year
-- (2026 vs 2016). date_of_birth is the identity discriminator, so the typo
-- split one child into two records. Neither row has enrollments; drop the
-- future-dated one. Guarded so re-running cannot delete a real child.
delete from public.portal_students s
 where s.date_of_birth > current_date
   and not exists (select 1 from public.portal_enrollments e where e.student_id = s.id);

-- The class inserted in the v33 seed never got its Enrolio title recorded in
-- source_title, unlike the other 102.
update public.portal_classes
   set source_title = external_class_id
 where source_title is null
   and external_class_id is not null;

-- 2. anon holds TRUNCATE on public tables ---------------------------------
--
-- A Supabase default, not something any migration here asked for. Unreachable
-- through PostgREST, which emits no TRUNCATE verb, so this is a latent
-- misconfiguration rather than a live hole — but "protected because the API
-- happens not to expose the verb" is not a posture worth keeping.

do $$
declare t record;
begin
  for t in
    select table_name
      from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon' and privilege_type = 'TRUNCATE'
     group by table_name
  loop
    execute format('revoke truncate on public.%I from anon', t.table_name);
  end loop;
end $$;

-- 3. The signup allowlist, derived from the seeded households -------------
--
-- One row per (guardian email, child), which is the shape portal-signup already
-- expects: one email may cover several students, and the unique index is on
-- (lower(email), coalesce(external_id, student_name)).

insert into public.portal_roster (email, student_name, guardian_name, status, notes)
select lower(h.primary_email),
       s.first_name || ' ' || s.last_name,
       h.display_name,
       'active',
       'derived from Enrolio seed v33'
  from public.portal_students s
  join public.portal_households h on h.id = s.household_id
 where s.status = 'active'
on conflict (lower(email), coalesce(external_id, student_name)) do nothing;

-- 4. Self-service household linking ---------------------------------------
--
-- The one write a client may cause, and it is deliberately not an INSERT policy:
-- the function decides, so a client cannot choose WHICH household to join. It
-- can only claim the household whose primary_email equals the email on its own
-- JWT, and only if it is not already a member of one.
--
-- Returns the household id, or null when the caller's email matches nothing —
-- which is the honest answer for a parent whose family has not been imported.

create or replace function public.link_household_member()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_household uuid;
  v_existing uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  -- Already linked: idempotent, and a second call must never move somebody.
  select household_id into v_existing
    from public.portal_household_members
   where profile_id = auth.uid();
  if v_existing is not null then
    return v_existing;
  end if;

  -- The email on the caller's own token, never one they supply.
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return null;
  end if;

  select id into v_household
    from public.portal_households
   where lower(primary_email) = v_email
     and status = 'active';
  if v_household is null then
    return null;
  end if;

  -- Guardian: sees every child in the household. A student member is pinned to
  -- one child and is created by an admin, never self-service — a login cannot
  -- be allowed to declare itself a particular child.
  insert into public.portal_household_members (household_id, profile_id, member_type, student_id)
  values (v_household, auth.uid(), 'guardian', null)
  on conflict (profile_id) do nothing;

  return v_household;
end;
$$;

revoke all on function public.link_household_member() from public, anon;
grant execute on function public.link_household_member() to authenticated;

comment on function public.link_household_member() is
  'Links the signed-in client to the household holding their own JWT email. Cannot target another household.';

-- 5. portal_my_enrollments -------------------------------------------------
--
-- The class list a family is entitled to, INDEPENDENT of whether any attendance
-- has ever been imported. Numbers are LEFT JOINed, so counted = 0 and
-- percent = null is representable and means "enrolled, no sessions yet" rather
-- than "not enrolled".
--
-- security_invoker, so the caller's RLS on portal_enrollments applies. Without
-- it this view would hand every household every other household's enrollments.

create or replace view public.portal_my_enrollments
with (security_invoker = true) as
with ranges as (
  select * from (values ('month'), ('season'), ('all')) as r(range)
)
select
  e.id                as enrollment_id,
  e.student_id,
  e.class_id,
  e.season,
  e.status,
  e.enrolled_on,
  e.dropped_on,
  r.range,
  coalesce(sm.attended, 0)::int as attended,
  coalesce(sm.counted, 0)::int  as counted,
  sm.percent,                          -- null when nothing counts. Never 0.
  c.name            as class_name,
  c.style           as class_style,
  c.category        as class_category,
  c.day_of_week,
  c.start_time,
  c.end_time,
  c.season_start,
  c.season_end,
  c.location        as class_location,
  c.instructor_name,
  c.level           as class_level,
  c.what_to_bring,
  -- Dates this class is known NOT to meet, so the schedule projection can skip
  -- them without a second round trip.
  coalesce((
    select array_agg(cs.session_date order by cs.session_date)
      from public.portal_class_sessions cs
     where cs.class_id = e.class_id and cs.status <> 'held'
  ), '{}') as cancelled_dates
from public.portal_enrollments e
join public.portal_classes c on c.id = e.class_id
cross join ranges r
left join public.portal_attendance_summary sm
       on sm.student_id = e.student_id
      and sm.class_id   = e.class_id
      and sm.range      = r.range;

revoke all on public.portal_my_enrollments from anon, authenticated;
grant select on public.portal_my_enrollments to authenticated;
