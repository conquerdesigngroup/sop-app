-- =============================================================================
-- Migration v36 — the Portal Viewer: oversight reads, and a note to one family
-- =============================================================================
--
-- Two things, and they are not the same kind of change.
--
-- READING is almost entirely already permitted. v33 wrote every one of its
-- policies as `<the family's own rows> OR is_admin()`, so an admin can already
-- select households, students, enrollments, attendance and sessions. The
-- Viewer needs no new privilege at all — only the three overview views below,
-- which exist so a list screen is one round trip instead of four.
--
-- WRITING is new, and it is the part that needed care.
--
-- THE ANON TRAP
--
-- portal_updates is readable by `anon`: the access-code portal has no login,
-- and v30 (which closes that door) is written but deliberately NOT applied
-- while the access-code path is still live. So the live read policy today is
--
--     for select to anon, authenticated using (is_published)
--
-- Adding household_id and stopping there would publish every personal note to
-- the entire internet — anyone holding the access code, which is to say anyone.
-- The broadcast policy below therefore says `household_id is null` explicitly.
-- A personal note is not "not selected by the app"; it is not selectable.
--
-- v30 has been amended in the same commit so that when it is finally applied it
-- recreates the policy WITH that clause. Without that amendment, the day the
-- portal goes login-only is the day every private note becomes visible to every
-- signed-in parent — a landmine armed months in advance.
--
-- WHY portal_updates AND NOT A NEW TABLE
--
-- Because a parent should read it where they read everything else. It sorts
-- with the rest of their notices, renders in the same card, and needs no second
-- feed to check. The cost is that this table now has two audiences, and that
-- cost is paid once, here, in the policies.
-- =============================================================================

-- 1. The column ------------------------------------------------------------

alter table public.portal_updates
  add column if not exists household_id uuid
    references public.portal_households(id) on delete cascade;

comment on column public.portal_updates.household_id is
  'Set = a note to ONE family, readable only by that household. Null = broadcast.';

create index if not exists idx_portal_updates_household
  on public.portal_updates (household_id)
  where household_id is not null;

-- A note is addressed to a class or to a family, never to both. Without this a
-- row could be scoped two ways at once and the read policies would disagree
-- about which audience wins.
alter table public.portal_updates
  drop constraint if exists portal_updates_scope_check;
alter table public.portal_updates
  add constraint portal_updates_scope_check
  check (household_id is null or class_id is null);

-- 2. Reading ---------------------------------------------------------------
--
-- Split in two rather than widened, so the broadcast path keeps exactly the
-- reach it has today and the personal path starts from nothing.

drop policy if exists portal_updates_read on public.portal_updates;
create policy portal_updates_read on public.portal_updates
  for select to anon, authenticated
  using (is_published and household_id is null);

-- The only way a personal note is ever selected by a client. is_household_member
-- is SECURITY DEFINER and pivots on auth.uid(), so a parent cannot ask for
-- another family's id and be answered.
drop policy if exists portal_updates_read_household on public.portal_updates;
create policy portal_updates_read_household on public.portal_updates
  for select to authenticated
  using (
    is_published
    and household_id is not null
    and (select public.is_household_member(household_id))
  );

-- portal_updates_read_staff is left exactly as it is: is_admin() OR
-- can_edit_portal_class(class_id). A personal note has class_id NULL and
-- can_edit_portal_class(NULL) collapses to is_admin(), so an instructor holding
-- a class does NOT gain sight of anyone's private note. Admins do — they can
-- already read the whole household tree from v33, and a note they cannot see is
-- a note nobody can moderate.

-- 3. Writing ---------------------------------------------------------------
--
-- Super admin only, per the owner's instruction. CASE rather than OR because
-- the two branches are genuinely different rules, and an OR would let an admin
-- who satisfies the broadcast branch write a personal row.

drop policy if exists portal_updates_insert on public.portal_updates;
create policy portal_updates_insert on public.portal_updates
  for insert to authenticated
  with check (
    case when household_id is null
      then public.is_admin() or public.can_edit_portal_class(class_id)
      else public.is_super_admin()
    end
  );

-- USING tests the OLD row, WITH CHECK the NEW one, and both matter here:
-- USING stops a non-super-admin editing an existing personal note; WITH CHECK
-- stops anyone turning a broadcast into a personal note (or the reverse) to
-- land on the side of the rule they satisfy.
drop policy if exists portal_updates_update on public.portal_updates;
create policy portal_updates_update on public.portal_updates
  for update to authenticated
  using (
    case when household_id is null
      then public.is_admin() or public.can_edit_portal_class(class_id)
      else public.is_super_admin()
    end
  )
  with check (
    case when household_id is null
      then public.is_admin() or public.can_edit_portal_class(class_id)
      else public.is_super_admin()
    end
  );

drop policy if exists portal_updates_delete on public.portal_updates;
create policy portal_updates_delete on public.portal_updates
  for delete to authenticated
  using (
    case when household_id is null
      then public.is_admin() or public.can_edit_portal_class(class_id)
      else public.is_super_admin()
    end
  );

-- 4. The three overview views ----------------------------------------------
--
-- security_invoker on all three, so none of them is a way around the policies
-- above. For an admin every underlying policy already says `OR is_admin()` and
-- the counts are complete; for a client the same views return their own single
-- row with their own counts. No client-facing code reads them — they exist to
-- make one staff list one request.

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
     from public.portal_updates u where u.household_id = h.id) as last_note_at
from public.portal_households h;

revoke all on public.portal_admin_household_overview from anon, authenticated;
grant select on public.portal_admin_household_overview to authenticated;

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
    where e.student_id = s.id and e.status = 'active')::int as enrollment_count
from public.portal_students s
join public.portal_households h on h.id = s.household_id;

revoke all on public.portal_admin_student_overview from anon, authenticated;
grant select on public.portal_admin_student_overview to authenticated;

create or replace view public.portal_admin_class_overview
with (security_invoker = true) as
select
  c.id,
  c.program_id,
  c.name,
  c.category,
  c.style,
  c.level,
  c.day_of_week,
  c.start_time,
  c.end_time,
  c.location,
  c.instructor_name,
  c.season,
  c.is_active,
  c.external_class_id,
  (select count(*) from public.portal_enrollments e
    where e.class_id = c.id and e.status = 'active')::int as active_enrollments
from public.portal_classes c;

revoke all on public.portal_admin_class_overview from anon, authenticated;
grant select on public.portal_admin_class_overview to authenticated;

-- 5. Indexes the Viewer's joins lean on ------------------------------------
--
-- Postgres does NOT index a foreign key column for you. The roster screen
-- filters enrollments by class and the household screen filters them by
-- student; both were sequential scans over 1,111 rows before this.
create index if not exists idx_portal_enrollments_class on public.portal_enrollments (class_id);
create index if not exists idx_portal_enrollments_student on public.portal_enrollments (student_id);

-- =============================================================================
-- Verified against production on 2026-09-01, with a real row rather than by
-- reading the policies. A probe note addressed to one household:
--
--   anon                    0 personal, 1 broadcast
--   signed-in NON-member    0 personal, 1 broadcast
--   the family itself       1 personal, 1 broadcast
--
-- and on writes, attempting the same insert under each role:
--
--   admin        refused (insufficient_privilege)
--   super_admin  allowed
--
-- The probe rows were deleted afterwards. Re-run this the same way — set the
-- role and the JWT claims, count what comes back — if these policies are ever
-- edited; reading them is not the same as testing them, and the anon grant on
-- this table makes the difference public.
-- =============================================================================
