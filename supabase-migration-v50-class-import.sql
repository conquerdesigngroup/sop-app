-- =============================================================================
-- Migration v50 — importing the class list from the Enrolio classes export
-- =============================================================================
--
-- WHY
--
-- portal_classes was loaded once, by hand, and has had no importer since. A
-- season's worth of schedule changes — a class moving room, an instructor
-- swapping, a fee changing — has had no way in.
--
-- WHAT THE EXPORT OWNS, AND WHAT IT MUST NOT TOUCH
--
-- The export carries schedule and commercial facts: day, times, room,
-- instructor, description, fees, capacity, age range, season dates, and the
-- Group that becomes `category`. Those it owns, and an import overwrites them.
--
-- It does NOT carry `style`, `level`, `age_group`, `sort_order`, `what_to_bring`
-- or `is_active`. Those were derived or curated inside the app — `style` is
-- 'Hip Hop' where the export only ever says the class is called
-- "Jr/teen Hip Hop 2", and `sort_order` is the schedule's display order. An
-- import that rewrote them from the file would quietly undo every correction
-- anyone has made. So they are never written on update.
--
-- THE TITLE IS A LABEL, NOT A SCHEDULE
--
-- Enrolio bakes the schedule into the class title at creation and never
-- refreshes it. "All-Star Bb (chill/m-6pm)" actually meets **Saturday 09:00** —
-- the Days and Start Time columns are right and the title is three days and
-- nine hours wrong. So the title is used only as an identifier
-- (`external_class_id`); every schedule fact comes from the columns.
--
-- MATCHING, AND WHY IT NEVER REPOINTS ATTENDANCE
--
-- Per v33: portal_attendance references portal_classes.id, the stable UUID, and
-- a match key only ever decides WHICH uuid an incoming row belongs to. This
-- function matches on `match_key` (normalised name | day | time) first, then on
-- `external_class_id` (the lower-cased title) — so a class whose title went
-- stale still matches on its real schedule, and a class that was rescheduled
-- still matches on its title.
--
-- When BOTH fail the row is inserted as a new class and reported as new. It is
-- never assumed to be a rename of something else, and nothing is ever
-- superseded, deactivated or deleted automatically: a class that has moved far
-- enough to lose both keys is indistinguishable from a genuinely new class, and
-- guessing wrong would orphan a term of attendance. The result names them so a
-- human can decide.
-- =============================================================================

-- --------------------------------------------------------------- the RPC

create or replace function public.admin_class_import(
  p_rows     jsonb,
  p_filename text default null
) returns jsonb
language plpgsql security definer set search_path = 'public'
as $fn$
declare
  r           jsonb;
  idx         int := 0;
  v_title     text;
  v_name      text;
  v_ext       text;
  v_dow       int;
  v_start     time;
  v_end       time;
  v_room      text;
  v_instr     text;
  v_desc      text;
  v_group     text;
  v_category  text;
  v_program   uuid;
  v_cap       int;
  v_tuition   numeric;
  v_regfee    numeric;
  v_cycle     text;
  v_agemin    int;
  v_agemax    int;
  v_sstart    date;
  v_send      date;
  v_regopen   date;
  v_season    text;
  v_key       text;
  v_id        uuid;
  v_inserted  int := 0;
  v_updated   int := 0;
  v_unchanged int := 0;
  v_rejected  jsonb := '[]'::jsonb;
  v_new       jsonb := '[]'::jsonb;
  v_seen      text[] := '{}';
  v_seen_keys text[] := '{}';
  v_missing   jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    v_title := btrim(coalesce(r->>'title', ''));

    if v_title = '' then
      v_rejected := v_rejected || jsonb_build_object('row', idx, 'title', '', 'reason', 'missing_title');
      continue;
    end if;

    -- "Ballet 2b / Pre Pointe (Morgan/M-7:15PM)" -> "Ballet 2b / Pre Pointe".
    -- Only a trailing parenthesised group is stripped, so a name that itself
    -- contains brackets mid-string is left alone.
    v_name := coalesce(substring(v_title from '^(.*?)\s*\([^()]*\)\s*$'), v_title);
    v_name := btrim(v_name);
    v_ext  := lower(v_title);

    v_dow   := nullif(btrim(coalesce(r->>'day_of_week', '')), '')::int;
    begin
      v_start := nullif(btrim(coalesce(r->>'start_time', '')), '')::time;
      v_end   := nullif(btrim(coalesce(r->>'end_time', '')), '')::time;
    exception when others then
      v_start := null;
    end;

    if v_dow is null or v_dow < 0 or v_dow > 6 then
      v_rejected := v_rejected || jsonb_build_object('row', idx, 'title', v_title, 'reason', 'invalid_day');
      continue;
    end if;
    if v_start is null then
      v_rejected := v_rejected || jsonb_build_object('row', idx, 'title', v_title, 'reason', 'invalid_time');
      continue;
    end if;

    -- Group -> category -> program. TNT is run under Academy, which is why the
    -- two are not the same lookup.
    v_group := lower(btrim(coalesce(r->>'group', '')));
    v_category := replace(v_group, '-', '');
    if v_category not in ('academy', 'allstars', 'tnt') then
      v_rejected := v_rejected || jsonb_build_object('row', idx, 'title', v_title, 'reason', 'unknown_group');
      continue;
    end if;
    select id into v_program from public.portal_programs
     where slug = case when v_category = 'allstars' then 'allstars' else 'academy' end;

    -- match_key is a GENERATED column, computed by portal_class_match_key().
    -- Calling that same function is the only way the lookup is guaranteed to
    -- agree with what the database will store; a second hand-rolled
    -- normalisation here would drift the first time either changed.
    v_key := public.portal_class_match_key(v_name, v_dow, v_start);

    if v_key = any(v_seen) then
      v_rejected := v_rejected || jsonb_build_object('row', idx, 'title', v_title, 'reason', 'duplicate_in_file');
      continue;
    end if;
    v_seen := array_append(v_seen, v_key);

    v_room    := nullif(btrim(coalesce(r->>'room', '')), '');
    v_instr   := nullif(btrim(coalesce(r->>'instructor', '')), '');
    v_desc    := nullif(btrim(coalesce(r->>'description', '')), '');
    v_cycle   := nullif(btrim(coalesce(r->>'billing_cycle', '')), '');
    v_cap     := nullif(btrim(coalesce(r->>'capacity', '')), '')::int;
    v_tuition := nullif(btrim(coalesce(r->>'tuition_fee', '')), '')::numeric;
    v_regfee  := nullif(btrim(coalesce(r->>'registration_fee', '')), '')::numeric;
    v_agemin  := nullif(btrim(coalesce(r->>'age_min_years', '')), '')::int;
    v_agemax  := nullif(btrim(coalesce(r->>'age_max_years', '')), '')::int;
    v_sstart  := nullif(btrim(coalesce(r->>'season_start', '')), '')::date;
    v_send    := nullif(btrim(coalesce(r->>'season_end', '')), '')::date;
    v_regopen := nullif(btrim(coalesce(r->>'registration_opens', '')), '')::date;

    v_season := case
      when v_sstart is not null and v_send is not null and extract(year from v_send) > extract(year from v_sstart)
        then extract(year from v_sstart)::text || '-' || extract(year from v_send)::text
      when v_sstart is not null then extract(year from v_sstart)::text
      else null end;

    -- Schedule first, title second. Either alone identifies the class; needing
    -- both would fail on exactly the two things that change most.
    select id into v_id from public.portal_classes where match_key = v_key;
    if v_id is null then
      select id into v_id from public.portal_classes where external_class_id = v_ext;
    end if;

    if v_id is null then
      insert into public.portal_classes (
        program_id, name, day_of_week, start_time, end_time, location, description,
        instructor_name, category, capacity, tuition_fee, registration_fee, billing_cycle,
        age_min_years, age_max_years, season, season_start, season_end, registration_opens,
        external_class_id, source_title, is_active
      ) values (
        v_program, v_name, v_dow, v_start, v_end, v_room, v_desc,
        v_instr, v_category, v_cap, v_tuition, v_regfee, v_cycle,
        v_agemin, v_agemax, v_season, v_sstart, v_send, v_regopen,
        v_ext, v_title, true
      ) returning id into v_id;
      v_inserted := v_inserted + 1;
      v_new := v_new || jsonb_build_object('title', v_title, 'name', v_name);
    else
      -- style / level / age_group / sort_order / what_to_bring / is_active /
      -- source_title are curated in-app and deliberately absent here.
      update public.portal_classes set
        program_id         = v_program,
        name               = v_name,
        day_of_week        = v_dow,
        start_time         = v_start,
        end_time           = v_end,
        location           = v_room,
        description        = v_desc,
        instructor_name    = v_instr,
        category           = v_category,
        capacity           = v_cap,
        tuition_fee        = v_tuition,
        registration_fee   = v_regfee,
        billing_cycle      = v_cycle,
        age_min_years      = v_agemin,
        age_max_years      = v_agemax,
        season             = coalesce(v_season, season),
        season_start       = v_sstart,
        season_end         = v_send,
        registration_opens = v_regopen,
        external_class_id  = v_ext,
        updated_at         = now()
      where id = v_id
        and (program_id, name, day_of_week, start_time, end_time, location, description,
             instructor_name, category, capacity, tuition_fee, registration_fee, billing_cycle,
             age_min_years, age_max_years, season_start, season_end, registration_opens,
             external_class_id)
            is distinct from
            (v_program, v_name, v_dow, v_start, v_end, v_room, v_desc,
             v_instr, v_category, v_cap, v_tuition, v_regfee, v_cycle,
             v_agemin, v_agemax, v_sstart, v_send, v_regopen, v_ext);

      if found then v_updated := v_updated + 1; else v_unchanged := v_unchanged + 1; end if;
    end if;

    v_seen_keys := array_append(v_seen_keys, v_key);
  end loop;

  -- Informational only. An active class the file did not mention is very often
  -- a class that simply ended, but it can equally be one that moved far enough
  -- to lose both keys and has just been re-inserted above. Nothing is changed
  -- either way; the pair of lists is what lets a human tell them apart.
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'match_key', match_key)), '[]'::jsonb)
    into v_missing
    from public.portal_classes
   where is_active and not (match_key = any(v_seen_keys));

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'rejected', v_rejected,
    'new_classes', v_new,
    'active_not_in_file', v_missing,
    'filename', p_filename
  );
end;
$fn$;

revoke execute on function public.admin_class_import(jsonb, text) from public, anon;
grant execute on function public.admin_class_import(jsonb, text) to authenticated, service_role;
