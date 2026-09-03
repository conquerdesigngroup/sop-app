-- =============================================================================
-- Migration v37 — a dancer's divisions, so the Viewer can filter on them
-- =============================================================================
--
-- portal_admin_household_overview already carries `categories`: which of
-- All-Stars / Academy / TNT a family's children are actually enrolled in,
-- derived from the classes rather than declared on the account. That is the
-- rule the owner set, and it is the only place the answer lives.
--
-- The dancer list needs the same fact per child. Deriving it in the browser
-- would mean shipping all 1,111 enrollments to build a three-item array per
-- student, so it belongs here beside the household version.
--
-- ACTIVE ENROLLMENTS ONLY, deliberately, and consistent with the household
-- view. A child whose only enrollment was dropped in October is not in that
-- division now; she appears under "Not enrolled", which is the honest answer
-- and a category worth being able to filter for in its own right — 72 of the
-- 343 households are in exactly that state today.
-- =============================================================================

create or replace view public.portal_admin_student_overview
with (security_invoker = true) as
select
  s.id,
  s.first_name,
  s.last_name,
  s.display_name,
  s.date_of_birth,
  s.status,
  s.external_student_id,
  h.id            as household_id,
  h.display_name  as household_name,
  h.primary_email,
  (select count(*) from public.portal_enrollments e
    where e.student_id = s.id and e.status = 'active')::int as enrollment_count,
  coalesce((
    select array_agg(distinct c.category)
      from public.portal_enrollments e
      join public.portal_classes c on c.id = e.class_id
     where e.student_id = s.id and e.status = 'active' and c.category is not null
  ), '{}') as categories
from public.portal_students s
join public.portal_households h on h.id = s.household_id;

revoke all on public.portal_admin_student_overview from anon, authenticated;
grant select on public.portal_admin_student_overview to authenticated;
