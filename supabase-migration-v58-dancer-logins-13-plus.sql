-- =============================================================================
-- v58 -- dancer logins are for ages 13 and up
-- =============================================================================
--
-- WHAT CHANGES
--
--   admin_roster_add_student() refuses a dancer who is under 13 on the studio's
--   own calendar day, or who has no date of birth on file. Nothing else in the
--   function changes.
--
-- WHY
--
-- v51 let the front desk give any dancer a login of their own, with no age
-- check anywhere. 330 of the 395 active dancers are under 13 (2026-09-17). A
-- login in a child's own name, with their own email address, is personal
-- information collected FROM that child -- which is where COPPA starts asking
-- for verifiable parental consent. The family's own account already shows a
-- younger dancer everything, so the line costs nobody access.
--
-- The Privacy Policy and Terms of Use (src/lib/legalDocs.ts) state the rule,
-- and the Client Accounts picker refuses first (studentLogin.ts,
-- DANCER_LOGIN_MIN_AGE). This is the authority; those are the explanation.
-- Change all three together.
--
-- A missing date of birth is refused rather than waved through: nothing would
-- show the dancer is old enough. Every active dancer had one when this was
-- written, from the roster import (v49).
--
-- BUILT FROM THE LIVE DEFINITION
--
-- The body below is pg_get_functiondef() of the function as deployed on
-- 2026-09-18, with the age check added -- not a copy of the v51 file. (It
-- matched v51 exactly; the point of reading it live is v30's lesson that a
-- stale file is not a safe one.)
--
-- CONSEQUENCES WORTH KNOWING
--
--   * No existing login is affected: the 4 active dancer logins on 2026-09-17
--     all belong to dancers aged 13 or over. Revoking and re-granting is the
--     only path through this check.
--   * A dancer turns 13 on their birthday, Pacific time -- studio_today()
--     (v52), the same day the picker's age reads.
--
-- ROLLBACK
--
-- Re-run the admin_roster_add_student definition from v51.
-- =============================================================================

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

  -- A row pointing at an archived record can never link, so refusing here is
  -- the difference between "no" and a login that silently never works.
  if v_student.status <> 'active' then
    raise exception '%''s record is archived. Restore the dancer first.', v_name;
  end if;

  select * into v_household from public.portal_households where id = v_student.household_id;
  if not found or v_household.status <> 'active' then
    raise exception '%''s family record is archived. Restore the family first.', v_name;
  end if;

  -- v58: 13 and up. See the header.
  if v_student.date_of_birth is null then
    raise exception 'There is no date of birth on file for %, and dancer logins are for ages 13 and up. Import the roster with it first.', v_name;
  end if;
  if v_student.date_of_birth > (public.studio_today() - interval '13 years')::date then
    raise exception '% is under 13. Dancer logins are for ages 13 and up; their family''s account already covers them.', v_name;
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

-- Unchanged from v51; restated so this file stands on its own.
revoke execute on function public.admin_roster_add_student(uuid, text, text) from public, anon;
grant  execute on function public.admin_roster_add_student(uuid, text, text) to authenticated, service_role;
