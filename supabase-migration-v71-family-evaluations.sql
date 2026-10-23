-- =============================================================================
-- v71 — family_evaluations(): what a family reads, with the class name attached
-- =============================================================================
--
-- WHY A FUNCTION AND NOT A JOIN IN THE QUERY
--
-- The family card could read portal_evaluations directly: the v70 policy
-- already returns only submitted rows for the caller's own dancers. But the
-- class NAME is not guaranteed to come with them. Families read
-- portal_classes only where is_active is true, and 'allstars' classes only
-- where can_see_allstars() admits them (v55) — so a submitted evaluation stays
-- readable while its class no longer joins: a class made inactive after the
-- season, or an all-stars class on a family whose access later changed. The
-- screen would show "Class" with no name, on the one record a parent keeps.
--
-- So the read is a SECURITY DEFINER function that attaches the name itself and
-- applies the SAME visibility rule the policy does: status = 'submitted' and
-- can_see_student(). It is a read of exactly what the policy already allows,
-- with one column more. Nothing here widens who sees what.
--
-- Names are first_name + last_name. display_name — the household nickname — is
-- the family's own and is drawn by the card from the household read, not here.
-- =============================================================================

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
     and public.can_see_student(e.student_id)
   order by s.first_name, s.last_name, e.season desc, e.submitted_at desc;
$function$;

revoke all on function public.family_evaluations() from public, anon;
grant execute on function public.family_evaluations() to authenticated;

comment on function public.family_evaluations() is
  'The caller''s submitted evaluations with the class name attached. Same visibility as portal_evaluations_select_family; see v71.';
