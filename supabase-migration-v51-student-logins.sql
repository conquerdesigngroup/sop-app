-- =============================================================================
-- Migration v51 — a dancer's own login
-- =============================================================================
--
-- WHY
--
-- A portal login has always been a PARENT's login: link_household_member_for()
-- finds a family by matching the account's own email against
-- portal_households.primary_email, and files every login as a 'guardian', which
-- sees every dancer in the household.
--
-- Teens and seniors want their own account. The enrolment system cannot yet
-- export a report that would provision one, so the studio grants it by hand:
-- find a dancer already on file, attach that dancer's own email, done.
--
-- WHAT WAS ALREADY HERE, AND IS NOT BEING REINVENTED
--
-- Student-scoped VIEWING has been built since v33 and has simply never had a
-- way to be created:
--
--   * portal_household_members pins a 'student' member to exactly one child by
--     CHECK constraint (v33), and to none for a 'guardian'.
--   * can_see_student() already ends
--         and (m.member_type = 'guardian' or m.student_id = p_student_id)
--   * attendanceQueries.loadHouseholdSummary already narrows the dancer list to
--     that one child; profileCards hides the "Your dancers" card; AttendanceCard
--     hides the sibling switcher.
--   * portal_roster.member_type ('guardian'|'student') was added in v33 for
--     exactly this and has been read by nothing since.
--
-- So this migration provisions a permissions model that already exists. It does
-- not invent one.
--
-- WHAT THIS FILE CHANGES
--
--   1. portal_roster gains student_id — which dancer a login is for.
--   2. link_household_member_for() learns to create a student member.
--   3. admin_roster_import() stops seeding a household from a dancer's address.
--   4. portal_push_payload() stops excluding dancers, and stops sending them
--      their siblings' class notices.
--   5. admin_roster_add_student() / admin_roster_revoke_student().
--
-- Schema and the rules that read it ship together on purpose: a column with no
-- rule is a trap, and a rule with no column does not run.
--
-- SAFE TO APPLY ON ITS OWN. With no student roster rows in existence — verified
-- 0 of 402 before writing this — the rewritten link function is behaviourally
-- identical to the one it replaces.
-- =============================================================================

-- ------------------------------------------------- 1. which dancer, if any

alter table public.portal_roster
  add column if not exists student_id uuid
    references public.portal_students(id) on delete cascade;

comment on column public.portal_roster.student_id is
  'The dancer this login is for. Set only on member_type=''student'' rows. '
  'ON DELETE CASCADE matches portal_household_members.student_id: ON DELETE SET '
  'NULL would leave a row violating portal_roster_type_student and make every '
  'student delete fail with a check violation instead of an explanation.';

-- Written symmetrically to portal_household_members_type_student (v33) so the
-- two tables state the same rule in the same shape. The guardian half is the
-- one that is easy to omit and should not be: without it a guardian row can
-- carry a stale student_id that reads as meaningful and is silently ignored.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'portal_roster_type_student') then
    alter table public.portal_roster
      add constraint portal_roster_type_student check (
        (member_type = 'student'  and student_id is not null) or
        (member_type = 'guardian' and student_id is null)
      );
  end if;
end $$;

-- A per-row CHECK cannot express either duplicate that actually matters, and
-- both are the kind that are only noticed once two people are confused about
-- who can see what. Partial, so deactivating a mistyped row frees the dancer
-- AND the address for a correct one while the wrong row stays in history.
create unique index if not exists portal_roster_student_unique
  on public.portal_roster (student_id)
  where student_id is not null and status = 'active';

-- This one is load-bearing beyond hygiene: it is what makes the lookup in
-- link_household_member_for provably single-row rather than "ordered by
-- something, and hoping".
create unique index if not exists portal_roster_student_email_unique
  on public.portal_roster (lower(email))
  where member_type = 'student' and status = 'active';

-- ------------------------------------------------------- 2. the link rule
--
-- Supersedes the body written in v47. The comment in v47 (and in v35) saying a
-- student member is "created by an admin, never self-service" remains TRUE in
-- substance and is now stale in wording: the admin still declares the child,
-- in a roster row no client can write, and the login only materialises a
-- decision already made.

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
  v_student_id uuid;
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

  -- 1. A DANCER'S OWN LOGIN, granted by an admin against one specific child.
  --
  -- THIS MUST BE TESTED BEFORE THE HOUSEHOLD LOOKUP BELOW, and the ordering is
  -- the whole correctness argument rather than a preference. A teenager who
  -- gave the enrolment system their own address is exactly the case where a
  -- household already carries primary_email = that address. Guardian-first
  -- would match it and file the dancer as a GUARDIAN OF THE WHOLE FAMILY,
  -- seeing every sibling — the precise failure a dancer login exists to
  -- prevent, on its single most likely input.
  --
  -- The household comes from the STUDENT, never from the email: a dancer's own
  -- address normally matches no household at all, which is why this function
  -- returned null for them before today.
  select r.student_id, s.household_id
    into v_student_id, v_household
    from public.portal_roster r
    join public.portal_students   s on s.id = r.student_id
    join public.portal_households h on h.id = s.household_id
   where lower(r.email) = v_email
     and r.member_type = 'student'
     and r.status = 'active'
     and s.status = 'active'
     and h.status = 'active'
     -- A second person on that address can never inherit the first one's child.
     and (r.claimed_by is null or r.claimed_by = p_profile_id)
   limit 1;   -- at most one row: portal_roster_student_email_unique (v51)

  if v_household is not null then
    insert into public.portal_household_members (household_id, profile_id, member_type, student_id)
    values (v_household, p_profile_id, 'student', v_student_id)
    on conflict (profile_id) do nothing;
    return v_household;
  end if;

  -- 2. Everything else: the household holding this account's own address.
  select id into v_household
    from public.portal_households
   where lower(primary_email) = v_email
     and status = 'active'
   limit 1;
  if v_household is null then
    return null;
  end if;

  -- Guardian: sees every child in the household. A login still cannot declare
  -- itself a particular child — only an admin can, by writing the roster row
  -- read above, which no client may touch (v28 revokes all on portal_roster).
  -- What changed in v51 is who does the declaring, not whether it is trusted.
  insert into public.portal_household_members (household_id, profile_id, member_type, student_id)
  values (v_household, p_profile_id, 'guardian', null)
  on conflict (profile_id) do nothing;

  return v_household;
end;
$$;

-- ------------------------------------------- 3. imports and dancer addresses
--
-- Supersedes the body written in v49. One guard added; everything else is v49
-- byte for byte.

create or replace function public.admin_roster_import(
  p_rows     jsonb,
  p_filename text default null
) returns jsonb
language plpgsql security definer set search_path = 'public'
as $fn$
declare
  r          jsonb;
  idx        int := 0;
  v_email    text;
  v_student  text;
  v_guardian text;
  v_slug     text;
  v_ext      text;
  v_notes    text;
  v_first    text;
  v_last     text;
  v_dob_txt  text;
  v_dob      date;
  v_dob_bad  boolean;
  v_program  uuid;
  v_house    uuid;
  v_stu      uuid;
  v_existing public.portal_roster%rowtype;
  v_inserted int := 0;
  v_updated  int := 0;
  v_unchanged int := 0;
  v_auto_claimed int := 0;
  v_households int := 0;
  v_students_new int := 0;
  v_students_upd int := 0;
  v_no_dob   int := 0;
  v_student_rows int := 0;
  v_rejected jsonb := '[]'::jsonb;
  v_seen     text[] := '{}';
  v_key      text;
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    v_email    := lower(btrim(coalesce(r->>'email', '')));
    v_student  := btrim(coalesce(r->>'student_name', ''));
    v_guardian := nullif(btrim(coalesce(r->>'guardian_name', '')), '');
    v_slug     := nullif(btrim(coalesce(r->>'program_slug', '')), '');
    v_ext      := nullif(btrim(coalesce(r->>'external_id', '')), '');
    v_notes    := nullif(btrim(coalesce(r->>'notes', '')), '');
    v_first    := nullif(btrim(coalesce(r->>'student_first_name', '')), '');
    v_last     := nullif(btrim(coalesce(r->>'student_last_name', '')), '');

    -- Either spelling of the name is accepted, and each fills in for the other.
    -- Splitting is on the LAST space, so "Laura Izabella Solares" keeps the two
    -- given names together. It is a fallback, not a preference: a file that
    -- supplies first and last is never re-split, which is the only way names
    -- like "Mikayla Stewart- Moore" survive.
    if v_first is null and v_last is null and position(' ' in v_student) > 0 then
      v_last  := btrim(substring(v_student from '[^ ]+$'));
      v_first := btrim(left(v_student, length(v_student) - length(v_last)));
    end if;
    if v_student = '' and v_first is not null and v_last is not null then
      v_student := v_first || ' ' || v_last;
    end if;

    if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      v_rejected := v_rejected || jsonb_build_object('row', idx, 'email', v_email, 'reason', 'invalid_email');
      continue;
    end if;
    if v_student = '' then
      v_rejected := v_rejected || jsonb_build_object('row', idx, 'email', v_email, 'reason', 'missing_student_name');
      continue;
    end if;

    -- A date that will not parse is rejected outright rather than quietly
    -- dropped: a typo'd birthday is exactly the thing that must not import
    -- looking successful.
    v_dob := null;
    v_dob_bad := false;
    v_dob_txt := nullif(btrim(coalesce(r->>'date_of_birth', '')), '');
    if v_dob_txt is not null then
      begin
        v_dob := v_dob_txt::date;
      exception when others then
        v_dob_bad := true;
      end;
    end if;
    if v_dob_bad
       or (v_dob is not null and (v_dob > current_date or v_dob < date '1900-01-01')) then
      v_rejected := v_rejected || jsonb_build_object('row', idx, 'email', v_email, 'reason', 'invalid_dob');
      continue;
    end if;

    v_program := null;
    if v_slug is not null then
      select id into v_program from public.portal_programs where slug = v_slug;
      if v_program is null then
        v_rejected := v_rejected || jsonb_build_object('row', idx, 'email', v_email, 'reason', 'unknown_program');
        continue;
      end if;
    end if;

    -- Same identity key as the unique index. A duplicate inside one file is
    -- reported rather than silently collapsed, so the admin can fix the export.
    v_key := v_email || '|' || coalesce(v_ext, v_student);
    if v_key = any(v_seen) then
      v_rejected := v_rejected || jsonb_build_object('row', idx, 'email', v_email, 'reason', 'duplicate_in_file');
      continue;
    end if;
    v_seen := array_append(v_seen, v_key);

    -- ------------------------------------------------------ the allowlist row

    select * into v_existing from public.portal_roster
      where lower(email) = v_email
        and coalesce(external_id, student_name) = coalesce(v_ext, v_student);

    if not found then
      insert into public.portal_roster (email, student_name, guardian_name, program_id, external_id, notes, date_of_birth)
      values (v_email, v_student, v_guardian, v_program, v_ext, v_notes, v_dob);
      v_inserted := v_inserted + 1;
    elsif v_existing.student_name  is distinct from v_student
       or v_existing.guardian_name is distinct from v_guardian
       or v_existing.program_id    is distinct from v_program
       or v_existing.notes         is distinct from v_notes
       or (v_dob is not null and v_existing.date_of_birth is distinct from v_dob) then
      -- status is deliberately NOT touched: an admin's deactivate outranks the
      -- next export, which never deletes and so never "un-lists" anyone. A dob
      -- already on the row is never blanked by a file that omits the column.
      update public.portal_roster
         set student_name = v_student,
             guardian_name = v_guardian,
             program_id = v_program,
             notes = v_notes,
             date_of_birth = coalesce(v_dob, date_of_birth),
             imported_at = now()
       where id = v_existing.id;
      v_updated := v_updated + 1;
    else
      v_unchanged := v_unchanged + 1;
    end if;

    -- -------------------------------------------- the household and the child
    --
    -- A DANCER'S OWN ADDRESS NEVER SEEDS A HOUSEHOLD. Once a teen holds a login,
    -- their email is a live roster address; an export that later lists it as the
    -- contact for any child would seed a SECOND household on that address and a
    -- duplicate child inside it. Tested by email rather than by the matched row,
    -- because the export may name a different child than the one the login is
    -- pinned to — and that child does not belong to the teen's address either.
    if exists (
      select 1 from public.portal_roster
       where lower(email) = v_email and member_type = 'student' and status = 'active'
    ) then
      v_student_rows := v_student_rows + 1;
      continue;
    end if;

    -- Without a dob there is no stable identity for a student, so the child is
    -- counted and skipped rather than inserted unkeyed.

    if v_dob is null or v_first is null or v_last is null then
      v_no_dob := v_no_dob + 1;
      continue;
    end if;

    select id into v_house from public.portal_households
      where lower(primary_email) = v_email;

    if v_house is null then
      insert into public.portal_households (primary_email, display_name, status)
      values (v_email, coalesce(v_guardian, v_last), 'active')
      returning id into v_house;
      v_households := v_households + 1;
    end if;

    -- Exact natural key first. Then the same child with a different birthday,
    -- which is a correction to apply — not a second child to create. Only a
    -- name we have never seen in this household inserts.
    select id into v_stu from public.portal_students
      where household_id = v_house
        and external_student_id is null
        and lower(first_name) = lower(v_first)
        and lower(last_name)  = lower(v_last)
        and coalesce(date_of_birth, date '1900-01-01') = v_dob;

    if v_stu is null then
      select id into v_stu from public.portal_students
        where household_id = v_house
          and external_student_id is null
          and lower(first_name) = lower(v_first)
          and lower(last_name)  = lower(v_last);

      if v_stu is null then
        insert into public.portal_students (household_id, first_name, last_name, date_of_birth, status)
        values (v_house, v_first, v_last, v_dob, 'active');
        v_students_new := v_students_new + 1;
      else
        update public.portal_students
           set date_of_birth = v_dob, updated_at = now()
         where id = v_stu;
        v_students_upd := v_students_upd + 1;
      end if;
    end if;
  end loop;

  -- A second student arriving for a guardian who already has an account should
  -- not sit unclaimed forever — signup would refuse the duplicate email anyway.
  with c as (
    update public.portal_roster r
       set claimed_by = p.id, claimed_at = now()
      from public.profiles p
     where r.claimed_by is null
       and r.status = 'active'
       and p.role = 'client'
       and lower(p.email) = lower(r.email)
    returning r.id
  )
  select count(*) into v_auto_claimed from c;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'auto_claimed', v_auto_claimed,
    'households_created', v_households,
    'students_created', v_students_new,
    'students_updated', v_students_upd,
    'students_skipped_no_dob', v_no_dob,
    'students_skipped_student_row', v_student_rows,
    'rejected', v_rejected,
    'filename', p_filename
  );
end;
$fn$;

-- ---------------------------------------------------------- 4. push audience
--
-- Supersedes the body written in v42, whose "GUARDIANS ONLY" header block
-- documents the opposite decision and is superseded with it. Two changes:
--
--   * Dancers are no longer excluded. v42 declined to notify a student login
--     citing "a message to a minor that their guardian did not send"; the
--     studio owner has since decided a dancer with their own account should be
--     told about their own dancing.
--
--   * A LIVE LEAK IS CLOSED. Both enrollment branches tested only
--     s.household_id = m.household_id, which for a pinned dancer would have
--     pushed them their SIBLING's class notices — data their own portal
--     correctly refuses to show them. Each branch now carries the same tail as
--     can_see_student(), spelled identically so the two are greppable as one
--     rule.
--
-- Family notes stay household-scoped and so do reach a dancer. That is
-- deliberate: v42's own invariant is that push audience must equal what the
-- Updates card shows, and a student member can already read household notes
-- through portal_updates_read_household (v36).

create or replace function public.portal_push_payload(p_kind text, p_source_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
  v_class_id   uuid;
  v_household  uuid;
  v_title      text;
  v_body       text;
  v_pinned     boolean := false;
  v_slug       text;
  v_pref       text;
  v_url        text;
  v_recipients jsonb;
begin
  if p_kind = 'update' then
    select u.program_id, u.class_id, u.household_id, u.title, u.body, u.is_pinned
      into v_program_id, v_class_id, v_household, v_title, v_body, v_pinned
      from public.portal_updates u
     where u.id = p_source_id and u.is_published;

  elsif p_kind = 'document' then
    select d.program_id, d.class_id, null::uuid, d.title, d.description, false
      into v_program_id, v_class_id, v_household, v_title, v_body, v_pinned
      from public.portal_documents d
     where d.id = p_source_id and d.is_published;

  else
    return jsonb_build_object('valid', false, 'reason', 'unknown kind');
  end if;

  -- Deleted, or unpublished again, between the trigger firing and the drain
  -- reaching it. Not an error: somebody changed their mind inside a minute,
  -- which is exactly when they should be able to.
  if v_program_id is null then
    return jsonb_build_object('valid', false, 'reason', 'no longer published');
  end if;

  select slug into v_slug from public.portal_programs where id = v_program_id;

  -- Which switch on the family's profile governs this notice. Mirrors
  -- PORTAL_NOTIFICATION_CATEGORIES in src/lib/portalNotifications.ts.
  v_pref := case
    when v_household is not null then 'familyNotes'
    when p_kind = 'document'     then 'newFiles'
    when v_class_id is not null  then 'classNotices'
    else                              'studioNotices'
  end;

  v_url := case
    when v_household is not null then '/portal/profile'
    when p_kind = 'document' and v_class_id is not null
      then '/portal/' || v_slug || '/classes/' || v_class_id::text
    when p_kind = 'document' then '/portal/' || v_slug || '/classes'
    else '/portal/' || v_slug || '/updates'
  end;

  select coalesce(jsonb_agg(distinct m.profile_id), '[]'::jsonb)
    into v_recipients
    from public.portal_household_members m
    join public.profiles p on p.id = m.profile_id
   where p.role = 'client'
     and p.is_active
     -- Absent means the default, matching prefsFromRaw() and the rule
     -- alert-push already uses. A profile written before this feature existed
     -- has none of these keys and must not go silent because of it.
     and coalesce((p.notification_preferences ->> 'pushEnabled')::boolean, true)
     and coalesce(
           (p.notification_preferences ->> v_pref)::boolean,
           case when v_pref = 'newFiles' then false else true end
         )
     and case
       -- A note to one family. RLS decides this on the read side; here it is
       -- the household id itself, which is the same fact.
       when v_household is not null then
         m.household_id = v_household

       -- A class notice reaches the families with a child actually in it.
       when v_class_id is not null then exists (
         select 1
           from public.portal_enrollments e
           join public.portal_students s on s.id = e.student_id
          where e.class_id = v_class_id
            and e.status = 'active'
            and s.status = 'active'
            and s.household_id = m.household_id
            -- Same tail as can_see_student(): a pinned dancer is not an
            -- audience for a sibling's class.
            and (m.member_type = 'guardian' or s.id = m.student_id)
       )

       -- Program-wide: anyone with an active enrollment anywhere in it.
       else exists (
         select 1
           from public.portal_enrollments e
           join public.portal_students s on s.id = e.student_id
           join public.portal_classes c on c.id = e.class_id
          where c.program_id = v_program_id
            and e.status = 'active'
            and s.status = 'active'
            and s.household_id = m.household_id
            -- Same tail as can_see_student(): a pinned dancer is not an
            -- audience for a sibling's class.
            and (m.member_type = 'guardian' or s.id = m.student_id)
       )
     end;

  return jsonb_build_object(
    'valid', true,
    'title', v_title,
    'body', coalesce(v_body, ''),
    'url', v_url,
    -- is_pinned is the studio saying "this one matters" and is the only
    -- urgency signal that exists today. It is what lets a notice through the
    -- quiet hours the Edge Function keeps.
    'urgent', coalesce(v_pinned, false),
    'preference', v_pref,
    'recipients', v_recipients
  );
end;
$$;

revoke all on function public.portal_push_payload(text, uuid) from public, anon, authenticated;
grant execute on function public.portal_push_payload(text, uuid) to service_role;

-- ------------------------------------------------ 5. granting and revoking

create or replace function public.admin_roster_add_student(
  p_student_id uuid,
  p_email      text,
  p_notes      text default null
) returns jsonb
language plpgsql security definer set search_path = 'public'
as $fn$
declare
  v_email     text;
  v_student   public.portal_students%rowtype;
  v_household public.portal_households%rowtype;
  v_profile   record;
  v_roster_id uuid;
  v_claimed   boolean := false;
  v_linked    boolean := false;
  v_name      text;
  v_other     text;
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That is not a valid email address.';
  end if;

  select * into v_student from public.portal_students where id = p_student_id;
  if not found then
    raise exception 'No such dancer.';
  end if;
  v_name := btrim(v_student.first_name || ' ' || v_student.last_name);

  -- A row pointing at an archived record can never link (see §2), so refusing
  -- here is the difference between "no" and a login that silently never works.
  if v_student.status <> 'active' then
    raise exception '%''s record is archived. Restore the dancer first.', v_name;
  end if;

  select * into v_household from public.portal_households where id = v_student.household_id;
  if not found or v_household.status <> 'active' then
    raise exception '%''s family record is archived. Restore the family first.', v_name;
  end if;

  -- Otherwise the parent who later registers on their own address is filed as a
  -- STUDENT and silently sees exactly one of their own children.
  if lower(coalesce(v_household.primary_email, '')) = v_email then
    raise exception 'That is the family''s own account address. A dancer login needs their own address.';
  end if;

  select student_name into v_other from public.portal_roster
   where student_id = p_student_id and status = 'active' limit 1;
  if v_other is not null then
    raise exception '% already has a dancer login.', v_name;
  end if;

  select student_name into v_other from public.portal_roster
   where lower(email) = v_email and member_type = 'student' and status = 'active' limit 1;
  if v_other is not null then
    raise exception 'That address is already set up as a dancer login for %.', v_other;
  end if;

  -- portal_roster_email_external (v28) would raise a bare 23505 here. Answer in
  -- English instead — this is the family already listed under the teen's own
  -- address, which is a normal thing to have happened.
  if exists (
    select 1 from public.portal_roster
     where lower(email) = v_email
       and coalesce(external_id, student_name) = v_name
  ) then
    raise exception 'That address is already on the roster for % as a parent sign-up. Deactivate that row first, or use a different address.', v_name;
  end if;

  select p.id, p.role, p.is_active,
         exists (select 1 from public.portal_household_members m where m.profile_id = p.id) as has_member
    into v_profile
    from public.profiles p
   where lower(p.email) = v_email
   limit 1;

  if v_profile.id is not null then
    -- A staff address on the client allowlist is a route around the roster gate.
    if v_profile.role <> 'client' then
      raise exception 'That address belongs to a staff account.';
    end if;
    -- Nothing may move an existing member out of the family they are in.
    if v_profile.has_member then
      raise exception 'That address already has a portal account linked to a family.';
    end if;
  end if;

  insert into public.portal_roster
    (email, student_name, guardian_name, notes, member_type, student_id, date_of_birth)
  values
    (v_email, v_name, v_household.display_name,
     nullif(btrim(coalesce(p_notes, '')), ''),
     'student', p_student_id, v_student.date_of_birth)
  returning id into v_roster_id;

  -- An account already sitting on that address with nowhere to belong is the
  -- most useful case in the whole feature: finish the job now rather than wait
  -- for a signup that will never come.
  if v_profile.id is not null then
    update public.portal_roster
       set claimed_by = v_profile.id, claimed_at = now()
     where id = v_roster_id;
    v_claimed := true;
    v_linked  := public.link_household_member_for(v_profile.id) is not null;
  end if;

  return jsonb_build_object(
    'roster_id',      v_roster_id,
    'student_name',   v_name,
    'household_name', v_household.display_name,
    'email',          v_email,
    'claimed',        v_claimed,
    'linked',         v_linked
  );
end;
$fn$;

revoke execute on function public.admin_roster_add_student(uuid, text, text) from public, anon;
grant  execute on function public.admin_roster_add_student(uuid, text, text) to authenticated, service_role;

-- The undo. Deactivating the roster row alone revokes NOTHING once someone has
-- registered — access lives in portal_household_members, and the roster row
-- only governs whether a new account may be created. So this removes the
-- membership too, which is what returns a dancer to having no login.
--
-- The account itself survives, unlinked and unable to re-register. Banning it
-- is a separate, louder act and stays a separate action.
create or replace function public.admin_roster_revoke_student(p_roster_id uuid)
returns jsonb
language plpgsql security definer set search_path = 'public'
as $fn$
declare
  v_row     public.portal_roster%rowtype;
  v_removed int := 0;
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  select * into v_row from public.portal_roster where id = p_roster_id;
  if not found then
    raise exception 'No such roster row.';
  end if;
  if v_row.member_type <> 'student' then
    raise exception 'That is a parent sign-up row, not a dancer login.';
  end if;

  with d as (
    delete from public.portal_household_members
     where member_type = 'student'
       and student_id  = v_row.student_id
    returning 1
  )
  select count(*) into v_removed from d;

  update public.portal_roster set status = 'inactive' where id = p_roster_id;

  return jsonb_build_object(
    'roster_id',      p_roster_id,
    'student_name',   v_row.student_name,
    'email',          v_row.email,
    'logins_removed', v_removed
  );
end;
$fn$;

revoke execute on function public.admin_roster_revoke_student(uuid) from public, anon;
grant  execute on function public.admin_roster_revoke_student(uuid) to authenticated, service_role;

-- ------------------------------------------------- 6. showing dancer rows
--
-- Supersedes the body written in v28. The list has no way to tell a dancer
-- login from a parent sign-up, and the difference matters at the point where an
-- admin is about to click Deactivate: for a dancer who has already registered,
-- deactivating the roster row revokes NOTHING, because access lives in
-- portal_household_members. The page cannot warn about that without being told
-- which rows are which.
--
-- Adds member_type, student_id, the dancer's own name, whether a membership
-- actually exists, and a 'student' filter. Everything else is v28 byte for byte.

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
   where (p_filter <> 'claimed'   or r.claimed_by is not null)
     and (p_filter <> 'unclaimed' or (r.claimed_by is null and r.status = 'active'))
     and (p_filter <> 'inactive'  or r.status = 'inactive')
     and (p_filter <> 'student'   or r.member_type = 'student')
     and (p_search is null or p_search = ''
          or r.email ilike '%' || p_search || '%'
          or r.student_name ilike '%' || p_search || '%'
          or coalesce(r.guardian_name, '') ilike '%' || p_search || '%');

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
           u.banned_until
      from public.portal_roster r
      left join public.portal_programs pg on pg.id = r.program_id
      left join public.profiles p on p.id = r.claimed_by
      left join auth.users u on u.id = r.claimed_by
      left join public.portal_students s on s.id = r.student_id
     where (p_filter <> 'claimed'   or r.claimed_by is not null)
       and (p_filter <> 'unclaimed' or (r.claimed_by is null and r.status = 'active'))
       and (p_filter <> 'inactive'  or r.status = 'inactive')
       and (p_filter <> 'student'   or r.member_type = 'student')
       and (p_search is null or p_search = ''
            or r.email ilike '%' || p_search || '%'
            or r.student_name ilike '%' || p_search || '%'
            or coalesce(r.guardian_name, '') ilike '%' || p_search || '%')
     order by lower(r.email), r.student_name
     limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)
  ) t;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$fn$;

revoke execute on function public.admin_client_list(text, text, int, int) from public, anon;
grant execute on function public.admin_client_list(text, text, int, int) to authenticated, service_role;
