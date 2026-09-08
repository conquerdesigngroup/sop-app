-- =============================================================================
-- Migration v49 — the roster file carries date of birth, and seeds the student
-- =============================================================================
--
-- WHY
--
-- Until now the roster import wrote one thing: an allowlist row saying "this
-- email may create a login". The actual child — the record with a date of birth,
-- a household and eventually enrolments and attendance — lived in
-- portal_students, which has NO importer at all. It was loaded once, by hand,
-- straight from an Enrolio export.
--
-- That split has already cost us. The 2026-09-08 import added twelve roster
-- rows; seven of those children then had to be inserted into portal_students by
-- hand, together with six households, with the GHL contact ids fetched one at a
-- time. Worse, the roster CSV silently *accepted* a date-of-birth column and
-- threw it away, because an unrecognised header maps to null. A file that looks
-- imported and is half-imported is the failure this schema is supposed to
-- prevent.
--
-- So the roster file becomes the whole job: parent, email, child, date of birth.
-- One import, both sides.
--
-- THE RULE THAT KEEPS THIS SAFE — no date of birth, no student row
--
-- portal_students' natural identity is (household, first, last, dob) — that is
-- the unique index v33 wrote for rows with no external_student_id. A student
-- inserted with a null dob is therefore keyed on '1900-01-01', and the day a
-- real dob arrives the key moves and the next import inserts the child a second
-- time. There is no way to spot that afterwards: two plausible rows, one child.
--
-- So a row without a usable date of birth still gets its roster entry — the
-- parent can still sign up, nothing regresses — but no student record, and the
-- result says how many were held back. Missing data is visible; a duplicated
-- child is not.
--
-- WHAT IT WILL NOT DO
--
--   * It never deletes, and never flips status — same as before.
--   * It does not touch enrolments, classes, sessions or attendance. Those come
--     from the class export and are matched on name+day+time (see v33).
--   * It does not invent external_account_id. Households created here have it
--     NULL, to be backfilled by email when a real account export next runs.
--     Inventing an id would collide with the GHL contact ids already in the
--     table under a value that means nothing to Enrolio.
-- =============================================================================

-- ---------------------------------------------------------------- 1. column

alter table public.portal_roster
  add column if not exists date_of_birth date;

comment on column public.portal_roster.date_of_birth is
  'Child''s date of birth as supplied by the enrolment export. Also seeds '
  'portal_students.date_of_birth on import; a row without one gets no student record.';

-- ------------------------------------------------------- 2. the import RPC
--
-- Signature is unchanged, so the edge function and the UI keep working against
-- the old shape until they are updated. The returned jsonb gains keys; it never
-- loses one.

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
    -- See the header: without a dob there is no stable identity for a student,
    -- so the child is counted and skipped rather than inserted unkeyed.

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
    'rejected', v_rejected,
    'filename', p_filename
  );
end;
$fn$;

revoke execute on function public.admin_roster_import(jsonb, text) from public, anon;
grant execute on function public.admin_roster_import(jsonb, text) to authenticated, service_role;
