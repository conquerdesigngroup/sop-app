-- =============================================================================
-- v57 — THE NAME ON THE ACCOUNT, AND WHICH DANCERS CAN ACTUALLY GET IN
--
-- Two things the staff screens could not say, both because the answer was in a
-- table they never read.
--
-- 1. EVERY FAMILY WAS A SURNAME
--
-- portal_households.display_name is written by the roster import as
-- `coalesce(guardian_name, student_last_name)` (v49), and the Enrolio export
-- carries a surname in that column. Measured on this database 2026-09-17:
--
--     349 households, 341 with a single-word display_name
--     406 roster rows, 394 with a single-word guardian_name
--      58 client profiles, 0 missing a first name, 0 missing a last name
--
-- So the studio holds the full name of every person who has signed up — in
-- profiles, where the Portal Viewer, the family panel and the access-events
-- list never looked. Three screens said "Kettenbrink" about a family whose
-- account says "Brittany Kettenbrink" one join away.
--
-- This adds that join. It does NOT rewrite display_name: the surname is still
-- the right label for a FAMILY (and for the 294 who have not signed up it is
-- the only thing we have), so the person's name is a new column beside it and
-- the app decides which to show where. Nothing is overwritten, so nothing is
-- lost if the guess about which to show turns out wrong.
--
-- 2. THE DANCER LIST COULD NOT SAY WHO HAD AN ACCOUNT
--
-- The Families tab has had an Access filter since v48 — signed up / not linked
-- / not signed up. The Dancers tab had nothing, so "which of these children can
-- actually open the portal" was a question you answered by opening 395 records
-- one at a time. The membership rows that answer it (v33's
-- portal_household_members, and v51's dancer logins pinned to one child) are
-- counted here next to the dancer rather than fetched per row.
--
-- SECURITY: both views stay security_invoker and the new function is NOT
-- security definer, so profiles RLS still applies to whoever is reading —
-- profiles_select_authenticated is `is_active_staff() OR id = auth.uid()`.
-- Staff (the only people who can open these screens) see the names; a client
-- reading their own household row can still only resolve themselves. This
-- opens no new read access, exactly as v48 did not.
-- =============================================================================

-- 1. Which login speaks for a household ------------------------------------
--
-- One definition, used by both views, because two copies of "the family's
-- account" is how the two screens end up naming the same family differently.
--
-- Returns the profile id, not the name, so a caller can join and take whatever
-- it needs (name, email, active flag) from one lookup.
create or replace function public.portal_household_account_id(
  p_household_id uuid,
  p_email text
) returns uuid
language sql
stable
set search_path = 'public'
as $$
  select p.id
    from public.profiles p
    left join public.portal_household_members m on m.profile_id = p.id
   where p.role = 'client'
     -- A dancer's own login (v51) carries the DANCER's name. Naming a family
     -- after their eleven-year-old is worse than naming them after a surname.
     and coalesce(m.member_type, 'guardian') <> 'student'
     -- Either it has claimed this household, or it carries the household's
     -- address and has not claimed anything — v48's "account not linked",
     -- which is the state where knowing the person's name matters most.
     and (m.household_id = p_household_id or lower(p.email) = lower(p_email))
   order by
     -- A login that actually claimed this household outranks one that merely
     -- shares its address.
     (m.household_id is not distinct from p_household_id) desc,
     -- Then the oldest, so a family with two guardian logins does not change
     -- name between two renders of the same list.
     p.created_at asc,
     p.id asc
   limit 1
$$;

revoke execute on function public.portal_household_account_id(uuid, text) from public, anon;
grant execute on function public.portal_household_account_id(uuid, text) to authenticated, service_role;

-- 2. Households: the person's name, beside the family's -----------------------
--
-- `create or replace view` cannot insert a column into the middle of an
-- existing view, so account_name and account_email are appended after v48's
-- unlinked_accounts. The app selects * and maps by name; position carries no
-- meaning.
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
  -- screen lists them all — a withdrawn dancer is kept because they explain an
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
  -- v48. Client accounts carrying this family's address that have NOT claimed
  -- it. Matched on email because that is the only thing joining the two: an
  -- unlinked account has, by definition, no row pointing at the household.
  (select count(*) from public.profiles p
    where p.role = 'client'
      and lower(p.email) = lower(h.primary_email)
      and not exists (
        select 1 from public.portal_household_members m2 where m2.profile_id = p.id
      ))::int as unlinked_accounts,
  -- v57. The name the person typed when they signed up. NULL when nobody has
  -- an account — which is the honest answer, and is what makes the app fall
  -- back to the surname rather than printing half a name.
  nullif(btrim(coalesce(ap.first_name, '') || ' ' || coalesce(ap.last_name, '')), '')
    as account_name,
  -- The address the account actually signs in with. Usually the household's
  -- own, and worth showing when it is not: "Change email" (client accounts)
  -- moves an account without moving the roster address it came from.
  ap.email as account_email
from public.portal_households h
-- At most one row: the function returns a single profile id, which is a
-- primary key. A left join, so a family nobody has signed up for is still here.
left join public.profiles ap
  on ap.id = public.portal_household_account_id(h.id, h.primary_email);

revoke all on public.portal_admin_household_overview from anon, authenticated;
grant select on public.portal_admin_household_overview to authenticated;

-- 3. Dancers: who has a login, and whose -------------------------------------
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
  -- v37. Active enrollments only, consistent with the household view: a child
  -- whose only enrollment was dropped in October is not in that division now.
  coalesce((
    select array_agg(distinct c.category)
      from public.portal_enrollments e
      join public.portal_classes c on c.id = e.class_id
     where e.student_id = s.id and e.status = 'active' and c.category is not null
  ), '{}') as categories,
  -- v57, appended for the same reason as above.
  --
  -- THREE STATES, SAME SHAPE AS THE FAMILY LIST'S
  --
  -- own_logins  — this child has their OWN login (v51). They see themselves
  --               and no sibling. One dancer on this database today.
  -- household_logins — somebody in the family has signed up, so this child is
  --               visible to a parent even with no login of their own. 70 of 395
  --               dancers are in exactly that state; 71 can be seen by anybody
  --               at all.
  -- neither     — nobody can see this child in the portal: 324 of 395. That is
  --               the number the studio is actually trying to move, and it was
  --               not on any screen.
  (select count(*) from public.portal_household_members m
    where m.member_type = 'student' and m.student_id = s.id)::int as own_logins,
  (select count(*) from public.portal_household_members m
    where m.household_id = h.id)::int as household_logins,
  -- Which address that dancer signs in with, so the front desk can answer
  -- "my login doesn't work" without opening another screen.
  (select p.email
     from public.portal_household_members m
     join public.profiles p on p.id = m.profile_id
    where m.member_type = 'student' and m.student_id = s.id
    order by p.created_at asc, p.id asc
    limit 1) as own_login_email,
  -- The parent's full name, so the dancer list can say who the family is
  -- rather than repeating the child's own surname back at the reader.
  nullif(btrim(coalesce(ap.first_name, '') || ' ' || coalesce(ap.last_name, '')), '')
    as household_account_name
from public.portal_students s
join public.portal_households h on h.id = s.household_id
left join public.profiles ap
  on ap.id = public.portal_household_account_id(h.id, h.primary_email);

revoke all on public.portal_admin_student_overview from anon, authenticated;
grant select on public.portal_admin_student_overview to authenticated;

-- 4. Client accounts: find a family by the name they signed up with ----------
--
-- Two changes to v51's function, both about the same complaint:
--
--   * the search matched email, student_name and guardian_name — so typing a
--     parent's FIRST name found nothing, on a page whose whole job is finding
--     one family. profiles.first_name / last_name are now searched too.
--   * household_id is returned, so the page can offer a way through to that
--     family's full record in the Portal Viewer instead of dead-ending on the
--     roster row. Matched on the address, which is the same join v48 uses.
--
-- Everything else is v51 unchanged.
create or replace function public.admin_client_list(
  p_filter text default 'all',        -- all | claimed | unclaimed | inactive | student
  p_search text default null,
  p_limit  int  default 100,
  p_offset int  default 0
) returns jsonb
language plpgsql stable security definer set search_path = 'public'
as $fn$
declare
  v_total int;
  v_rows  jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  select count(*) into v_total
    from public.portal_roster r
    left join public.profiles p on p.id = r.claimed_by
   where (p_filter <> 'claimed'   or r.claimed_by is not null)
     and (p_filter <> 'unclaimed' or (r.claimed_by is null and r.status = 'active'))
     and (p_filter <> 'inactive'  or r.status = 'inactive')
     and (p_filter <> 'student'   or r.member_type = 'student')
     and (p_search is null or p_search = ''
          or r.email ilike '%' || p_search || '%'
          or r.student_name ilike '%' || p_search || '%'
          or coalesce(r.guardian_name, '') ilike '%' || p_search || '%'
          or coalesce(p.first_name, '') ilike '%' || p_search || '%'
          or coalesce(p.last_name, '') ilike '%' || p_search || '%'
          or btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
             ilike '%' || p_search || '%');

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_rows
  from (
    select r.id, r.email, r.student_name, r.guardian_name, r.external_id,
           r.status, r.claimed_by, r.claimed_at, r.imported_at, r.notes,
           r.member_type, r.student_id,
           btrim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) as dancer_name,
           -- The membership IS the access. A student row can be claimed and
           -- still carry no membership (the link failed), and can be
           -- deactivated while the membership stands — which is exactly the
           -- state the Deactivate copy has to warn about.
           exists (
             select 1 from public.portal_household_members m
              where m.member_type = 'student' and m.student_id = r.student_id
           ) as has_login,
           pg.name  as program_name,
           pg.slug  as program_slug,
           p.first_name, p.last_name,
           p.is_active as account_active,
           p.email as account_email,
           u.last_sign_in_at,
           u.email_confirmed_at,
           u.banned_until,
           -- v57. The family this roster row belongs to, so the page can open
           -- their record rather than describing it.
           hh.id as household_id,
           hh.display_name as household_name
      from public.portal_roster r
      left join public.portal_programs pg on pg.id = r.program_id
      left join public.profiles p on p.id = r.claimed_by
      left join auth.users u on u.id = r.claimed_by
      left join public.portal_students s on s.id = r.student_id
      -- LATERAL with a limit, not a plain join on the address. Nothing in the
      -- schema stops two households sharing an email (there is no unique index
      -- on primary_email, only the convention that the import makes one row per
      -- address), and a plain join would then silently show every roster row
      -- for that family TWICE. A duplicated account card on this page is a
      -- second "Disable" button for the same login.
      left join lateral (
        select h2.id, h2.display_name
          from public.portal_households h2
         where lower(h2.primary_email) = lower(r.email)
         order by h2.created_at asc, h2.id asc
         limit 1
      ) hh on true
     where (p_filter <> 'claimed'   or r.claimed_by is not null)
       and (p_filter <> 'unclaimed' or (r.claimed_by is null and r.status = 'active'))
       and (p_filter <> 'inactive'  or r.status = 'inactive')
       and (p_filter <> 'student'   or r.member_type = 'student')
       and (p_search is null or p_search = ''
            or r.email ilike '%' || p_search || '%'
            or r.student_name ilike '%' || p_search || '%'
            or coalesce(r.guardian_name, '') ilike '%' || p_search || '%'
            or coalesce(p.first_name, '') ilike '%' || p_search || '%'
            or coalesce(p.last_name, '') ilike '%' || p_search || '%'
            or btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
               ilike '%' || p_search || '%')
     order by lower(r.email), r.student_name
     limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)
  ) t;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$fn$;

revoke execute on function public.admin_client_list(text, text, int, int) from public, anon;
grant execute on function public.admin_client_list(text, text, int, int) to authenticated, service_role;

-- =============================================================================
-- WHAT THIS DOES NOT DO
--
-- It does not invent a first name for the 294 families who have never signed
-- up. Nothing in this database holds one: the Enrolio export's guardian column
-- is a surname, and the only other name on the row is the dancer's. Those
-- families read as "Kettenbrink family" with their dancers listed under them,
-- which is true, rather than as a bare surname that looks like a broken field.
-- The full name appears the moment they register.
-- =============================================================================
