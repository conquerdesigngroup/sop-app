-- =============================================================================
-- v48 — TELL "HAS AN ACCOUNT, NOT LINKED" APART FROM "NEVER SIGNED UP"
--
-- The Portal Viewer showed one bit where there are three states, and the two it
-- collapsed need opposite responses from the studio:
--
--   linked           the family is in. Nothing to do.
--   account, no link they signed up and cannot see their dancers. A BUG, or a
--                    household that is inactive or filed under another address.
--                    Somebody has to look at it.
--   no account       they have never signed up. Chase them.
--
-- Until v47 the middle state was common and invisible, which is how two
-- families sat in the "never signed up" pile for an afternoon while holding
-- working, verified accounts. v47 stops it being created at signup; this makes
-- it VISIBLE when it happens anyway — an inactive household, a link that
-- errored, an address that changed in Enrolio after the account was made.
--
-- WHY COUNTED HERE AND NOT DERIVED IN THE APP
--
-- The Viewer loads households, students and classes; it never loads profiles,
-- and it should not start — the client roster is 343 rows and profiles is the
-- whole staff table. The count belongs next to linked_logins, computed by the
-- same view, so the two answers cannot disagree.
--
-- SECURITY: the view is security_invoker, so profiles RLS applies to the
-- caller. profiles_select_authenticated is `is_active_staff() OR id =
-- auth.uid()`, so staff (who are the only people who can open the Viewer) get
-- a true count, and a client reading their own household row can only ever
-- count themselves. No new exposure.
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
  -- EVERY child on the account, not just the active ones. The family detail
  -- screen lists them all — a withdrawn dancer is kept because she explains an
  -- attendance history that would otherwise have no owner — so counting only
  -- the active ones here put "2 dancers" in the list above a detail page
  -- showing three. Two screens disagreeing about a family is worse than either
  -- number alone. Withdrawn children are marked in the detail instead.
  (select count(*) from public.portal_students s
    where s.household_id = h.id)::int as student_count,
  -- The honest answer to "have they got in yet?", without touching auth.users:
  -- a member row exists only after a signed-in client claims the household.
  (select count(*) from public.portal_household_members m
    where m.household_id = h.id)::int as linked_logins,
  (select count(*) from public.portal_enrollments e
     join public.portal_students s on s.id = e.student_id
    where s.household_id = h.id and e.status = 'active')::int as enrollment_count,
  -- Which programs this family is entitled to, derived from the classes their
  -- children are actually in. This is the rule the owner set for Stage 2
  -- scoping, computed here so the Viewer shows the same answer the portal will.
  coalesce((
    select array_agg(distinct c.category)
      from public.portal_enrollments e
      join public.portal_students s on s.id = e.student_id
      join public.portal_classes c on c.id = e.class_id
     where s.household_id = h.id and e.status = 'active' and c.category is not null
  ), '{}') as categories,
  (select max(coalesce(u.published_at, u.created_at))
     from public.portal_updates u where u.household_id = h.id) as last_note_at,
  -- New in v48, and LAST on purpose: `create or replace view` cannot insert a
  -- column into the middle of an existing one ("cannot change name of view
  -- column"), and dropping the view to reorder it would be a bigger operation
  -- than the column is worth. The app selects * and maps by name, so position
  -- carries no meaning — it reads next to linked_logins in the TypeScript.
  --
  -- Client accounts carrying this family's address that have NOT claimed it.
  -- Matched on email because that is the only thing joining the two: an
  -- unlinked account has, by definition, no row pointing at the household.
  -- lower() on both sides, matching link_household_member_for().
  (select count(*) from public.profiles p
    where p.role = 'client'
      and lower(p.email) = lower(h.primary_email)
      and not exists (
        select 1 from public.portal_household_members m2 where m2.profile_id = p.id
      ))::int as unlinked_accounts
from public.portal_households h;

revoke all on public.portal_admin_household_overview from anon, authenticated;
grant select on public.portal_admin_household_overview to authenticated;
