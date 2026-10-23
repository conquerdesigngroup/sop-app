-- =============================================================================
-- v72 — evaluations are read by guardians, not by a dancer's own login
-- =============================================================================
--
-- v70's family policy used can_see_student(), which admits a guardian AND the
-- dancer's own login (portal_household_members.student_id, v51). That was left
-- as an open decision in EVALUATIONS-BUILD.md §5.1. The owner decided on
-- 2026-10-22: only parents with a login see evaluations. A dancer's comment and
-- move-up flag are written for the family, and a child reading "needs work"
-- about themselves on their own phone is not what the teacher was writing for.
--
-- One helper, is_guardian_of(), used by BOTH the policy and family_evaluations()
-- so the two reads cannot drift apart. It is can_see_student() minus the
-- student branch. Attendance is untouched: a dancer still sees their own
-- attendance (can_see_student stays as it is).
--
-- The dashboard card hides itself for a student login as well
-- (lib/profileCards.ts), so a dancer does not get an "Evaluations" card that
-- is forever empty — but that is a courtesy; this is the lock.
-- =============================================================================

create or replace function public.is_guardian_of(p_student_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.portal_household_members m
      join public.portal_students s on s.id = p_student_id
     where m.profile_id = auth.uid()
       and m.household_id = s.household_id
       and m.member_type = 'guardian'
  );
$function$;

revoke all on function public.is_guardian_of(uuid) from public, anon;
grant execute on function public.is_guardian_of(uuid) to authenticated;

comment on function public.is_guardian_of(uuid) is
  'True when the caller is a GUARDIAN member of the dancer''s household. can_see_student() without the dancer''s-own-login branch. v72.';

-- The read policy. Same name as v70's, so a re-run of v70 would put the wide
-- version back: v70 must not be re-applied after this without re-applying v72.
drop policy if exists portal_evaluations_select_family on public.portal_evaluations;
create policy portal_evaluations_select_family on public.portal_evaluations
  for select to authenticated
  using (status = 'submitted' and (select public.is_guardian_of(student_id)));

-- The family read, v71, under the same rule.
create or replace function public.family_evaluations()
returns table (
  id              uuid,
  student_id      uuid,
  first_name      text,
  last_name       text,
  class_id        uuid,
  class_name      text,
  instructor_name text,
  season          text,
  round           text,
  performance     smallint,
  attendance      smallint,
  showmanship     smallint,
  comment         text,
  move_up         boolean,
  submitted_at    timestamptz
)
language sql stable security definer set search_path to 'public'
as $function$
  select e.id, e.student_id, s.first_name, s.last_name,
         e.class_id, c.name, c.instructor_name,
         e.season, e.round,
         e.performance, e.attendance, e.showmanship,
         e.comment, e.move_up, e.submitted_at
    from public.portal_evaluations e
    join public.portal_students s on s.id = e.student_id
    join public.portal_classes  c on c.id = e.class_id
   where e.status = 'submitted'
     and public.is_guardian_of(e.student_id)
   order by s.first_name, s.last_name, e.season desc, e.submitted_at desc;
$function$;

comment on function public.family_evaluations() is
  'The caller''s submitted evaluations with the class name attached, guardians only. Same visibility as portal_evaluations_select_family; see v71, v72.';
