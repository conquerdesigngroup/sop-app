-- =============================================================================
-- v59 — WHEN EACH FAMILY SIGNED UP
--
-- The Portal Viewer's Families tab could say WHO had signed up (v48's Access
-- filter) but not WHEN. The question the owner is actually asking during the
-- launch is "who is new since I last looked?", and 58 families sorted by
-- surname do not answer it.
--
-- One column, appended to v57's view: signed_up_at.
--
-- WHICH TIMESTAMP, AND WHY NOT linked_at
--
-- portal_household_members.linked_at looks like the obvious answer and is not.
-- Measured 2026-09-18: 10 of 61 membership rows have it NULL — they predate the
-- column — so a sort on it would drop a sixth of the signed-up families to the
-- bottom for a reason the screen could not explain. It also answers a different
-- question: when the LINK was made. Before v47 that was sometimes days after
-- the account, and a link repaired by hand today would read as a signup today.
--
-- profiles.created_at is filled in for every account and is the moment the
-- person actually signed up. That is the one used.
--
-- WHOSE ACCOUNT COUNTS
--
--   * every login that has claimed this household — the same set linked_logins
--     counts, dancer logins (v51) included, so "Signed up" and its date always
--     describe the same people;
--   * AND an unclaimed client account carrying the household's address — v48's
--     "Account not linked". A family who signed up an hour ago and failed to
--     link is exactly the one that must not sort to the bottom of "newest".
--
-- The EARLIEST of those, so the date is when the family first got an account
-- and does not jump when a second guardian registers a month later.
--
-- NULL when nobody has an account, which is what makes the app leave the date
-- off rather than print one.
--
-- SECURITY: unchanged from v57. The view stays security_invoker, so profiles
-- RLS still applies to the reader — staff see every account, a client can only
-- resolve their own. No new read access.
-- =============================================================================

create or replace view public.portal_admin_household_overview
with (security_invoker = true) as
select
  h.id,
  h.external_account_id,
  h.primary_email,
  h.display_name,
  h.status,
  h.created_at,
  -- EVERY child on the account, not just the active ones — see v36a/v57.
  (select count(*) from public.portal_students s
    where s.household_id = h.id)::int as student_count,
  (select count(*) from public.portal_household_members m
    where m.household_id = h.id)::int as linked_logins,
  (select count(*) from public.portal_enrollments e
     join public.portal_students s on s.id = e.student_id
    where s.household_id = h.id and e.status = 'active')::int as enrollment_count,
  coalesce((
    select array_agg(distinct c.category)
      from public.portal_enrollments e
      join public.portal_students s on s.id = e.student_id
      join public.portal_classes c on c.id = e.class_id
     where s.household_id = h.id and e.status = 'active' and c.category is not null
  ), '{}') as categories,
  (select max(coalesce(u.published_at, u.created_at))
     from public.portal_updates u where u.household_id = h.id) as last_note_at,
  -- v48.
  (select count(*) from public.profiles p
    where p.role = 'client'
      and lower(p.email) = lower(h.primary_email)
      and not exists (
        select 1 from public.portal_household_members m2 where m2.profile_id = p.id
      ))::int as unlinked_accounts,
  -- v57.
  nullif(btrim(coalesce(ap.first_name, '') || ' ' || coalesce(ap.last_name, '')), '')
    as account_name,
  ap.email as account_email,
  -- v59. When this family first had an account — see the header.
  (select min(p.created_at)
     from public.profiles p
    where exists (
            select 1 from public.portal_household_members m3
             where m3.profile_id = p.id and m3.household_id = h.id
          )
       -- The same stranded-account test as unlinked_accounts above, so a family
       -- counted there always has a date here.
       or (p.role = 'client'
           and lower(p.email) = lower(h.primary_email)
           and not exists (
             select 1 from public.portal_household_members m4 where m4.profile_id = p.id
           ))) as signed_up_at
from public.portal_households h
left join public.profiles ap
  on ap.id = public.portal_household_account_id(h.id, h.primary_email);

revoke all on public.portal_admin_household_overview from anon, authenticated;
grant select on public.portal_admin_household_overview to authenticated;
