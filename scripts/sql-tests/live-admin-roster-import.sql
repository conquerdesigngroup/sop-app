-- =============================================================================
-- admin_roster_import exactly as production runs it (the v51 version), read with
-- pg_get_functiondef on 2026-09-24. Loaded by the SQL tests so rule 7 — dancers
-- created without a birthday — is checked against the real function that later
-- fills the birthday in, not a copy of its lookups. Refresh it if v51 changes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_roster_import(p_rows jsonb, p_filename text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    v_key := v_email || '|' || coalesce(v_ext, v_student);
    if v_key = any(v_seen) then
      v_rejected := v_rejected || jsonb_build_object('row', idx, 'email', v_email, 'reason', 'duplicate_in_file');
      continue;
    end if;
    v_seen := array_append(v_seen, v_key);

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
$function$
;
