-- =============================================================================
-- Migration v68 — the roster sync, corrected after independent review
-- =============================================================================
--
-- v67 shipped admin_enrollment_import and recorded a starting point. An
-- adversarial review of it (2026-09-24) then found, each with a failing test:
--
--   1. A second contact record sharing the email of a contact matched BY ID
--      became a brand-new family: a second household, a second child, and
--      both enrolled. (The duplicate check only compared unmatched contacts.)
--   2. The unknown-sibling check counted names instead of comparing them. A
--      one-dancer family whose All Students named only a child the app has
--      never met still enrolled the known dancer — a 14-year-old into a 5–7
--      class.
--   3. A family the sync had never seen — one missing from the starting-point
--      file, or created since outside the sync — had no memory, so every
--      sticky tag it carried counted as new and was enrolled.
--   4. Tag memory changed only by an apply, and the screen offered no apply in
--      a week with nothing to add or drop, so memory went stale: a later drop
--      was missed, a later re-join hidden.
--   5. A teacher's mark could commit after apply's guard and before its
--      fingerprint — a dancer dropped as of yesterday, marked today.
--   6. Nothing stopped a broken export: a file whose Tags came out empty
--      dropped every remembered place in one tap. The whole-class warning went
--      quiet whenever any holder's family was missing from the file.
--   9. A starting point that matched no class tag reported "recorded" and left
--      the next preview a first run.
--  11. An inactive class could be enrolled into, and an inactive, untagged
--      duplicate title blocked every sync.
--  12. An active place already carrying an earlier dropped_on previewed as a
--      clean drop and then failed apply on the fingerprint, every sync; a mark
--      before a new place's start blocked the whole file for good.
--  14. Conflicts ignored season though the unique key includes it; the class
--      season was not in the plan hash; last_sync_on came from activity_logs,
--      which any signed-in user can write.
--
-- (7, 8, 10 and 13 were screen, wording and claim fixes; see the PR.)
--
-- WHAT CHANGES
--
-- portal_enrollment_import_runs — one row per recorded starting point and per
--   applied sync. "First run" and "last synced" now come from here, a table only
--   this function writes, instead of from the activity log.
--
-- portal_enrollment_import_seen — every family present in a recorded or
--   applied export, including those carrying no class tag. A family the sync
--   has never seen that ALREADY EXISTED at the starting point has its tags
--   recorded and nothing acted on, and is listed for a person; its next sync
--   diffs against that. A family CREATED after the starting point (the roster
--   import, a hand entry) is new, and its tags are new. (Finding 3.)
--
-- Matching: an unmatched contact whose email is on a contact that did match
--   joins that family; an email on contacts matched to two families is
--   reported, and an unmatched contact carrying it is not imported. (1)
--
-- Unknown dancers: every name in All Students is compared with the family's
--   dancers (case, spaces and punctuation ignored). One the app does not have
--   stops the one-dancer and age rules for that family's new tags. (2)
--
-- Memory changes count as changes: the preview reports them and apply saves
--   them even in a week with no roster change. (4)
--
-- staff_mark_attendance takes a SHARED advisory lock on the key apply locks
--   exclusively, before its roster check. A mark waits the second a sync takes
--   to commit, and then sees the rosters it left. Marks never wait for each
--   other. (5)
--
-- Guards: a file with no class tag at all is refused, for a starting point
--   too; a sync dropping 20 or more places, or 5 or more that are at least 10%
--   of the places the families in the file hold, must be confirmed
--   (p_confirm); the whole-class warning counts only dancers whose family is
--   in the file. (6, 9)
--
-- Classes: a title shared by several classes resolves to the one active class
--   among them; it blocks only when the file actually uses it and it is still
--   ambiguous. A tag for an inactive class never enrols. (11)
--
-- A drop keeps an earlier end already on the row (it never moves a past
--   roster); a mark before a new place's start stops THAT place, listed for a
--   person, not the whole file; conflicts are per season; the class season is
--   in the hash. (12, 14)
--
-- THE v67 STARTING POINT IS CLEARED
--
-- It recorded tags but not which families were present, and families present
-- with no class tag cannot be recovered without the file. No sync was ever
-- applied on it, so nothing is lost: record it again from the same 24 Sep
-- export and the tags come back identical, with the families alongside.
--
-- NOT FIXED HERE, AND SAID SO
--
--   * A class a dancer holds whose family was never tagged for it is never
--     dropped — there is no tag to disappear. The preview now lists them.
--   * Tags "for a person" have no in-app resolution yet: the app has no
--     enrolment editor. The preview says what resolves each kind on its own
--     (a birthday or a dancer added by the roster import) and which need a
--     place added or ended by hand.
--   * Rule 7's dancers are split on the last space. admin_roster_import finds
--     them later when it is given the name in one column, which it splits the
--     same way. Given separate first/last columns that split a several-word
--     surname differently, it will not, and creates a second dancer.
--
-- A SECOND REVIEW (2026-09-24, before this was applied) found no blocker.
-- Fixed here: running this file again no longer clears a recorded starting
-- point. Left for the next migration, before the screen is used:
--   * nothing asks for confirmation before many places or new families are
--     ADDED — only drops are counted;
--   * the unknown-dancer check takes a spelling variant or an extra middle
--     name in All Students for a dancer the app does not have;
--   * a family seen for the first time, in a week with nothing else to save,
--     is never marked seen: memory_changes counts tags only, and the screen
--     offers no button;
--   * a mark covered by an earlier season's place in the class still counts
--     as a mark before the new place's start;
--   * a place that has not started yet, or a dancer with two active places in
--     one class, still blocks the whole file instead of that place;
--   * the whole-class warning counts places the sync could never drop.
-- =============================================================================

-- ------------------------------------------------------------ 1. run log

create table if not exists public.portal_enrollment_import_runs (
  id       uuid primary key default gen_random_uuid(),
  mode     text not null check (mode in ('baseline', 'apply')),
  as_of    date not null,
  run_at   timestamptz not null default now(),
  run_by   uuid references public.profiles(id) on delete set null,
  filename text,
  counts   jsonb not null default '{}'::jsonb
);

comment on table public.portal_enrollment_import_runs is
  'Each recorded starting point and applied roster sync (admin_enrollment_import). '
  'The first baseline row is the starting point; see v68.';

alter table public.portal_enrollment_import_runs enable row level security;
revoke all on public.portal_enrollment_import_runs from anon, authenticated;

-- ------------------------------------------------------- 2. seen families

create table if not exists public.portal_enrollment_import_seen (
  household_id  uuid primary key references public.portal_households(id) on delete cascade,
  first_seen_on date not null,
  last_seen_on  date not null
);

comment on table public.portal_enrollment_import_seen is
  'Families present in a recorded or applied contacts export, with or without class tags. '
  'A family missing here that existed at the starting point is recorded, not acted on; see v68.';

alter table public.portal_enrollment_import_seen enable row level security;
revoke all on public.portal_enrollment_import_seen from anon, authenticated;

-- ------------------------------------------- 3. clear v67's starting point
--
-- Only while v68 has recorded nothing. Run again after its starting point, this
-- file would otherwise wipe the memory and keep the run log, and the next
-- preview would take every remembered tag for a new one.

delete from public.portal_enrollment_import_tags
 where not exists (select 1 from public.portal_enrollment_import_runs);

-- ------------------------------------------------- 4. tag key, one more entity

create or replace function public.portal_enrollment_tag_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(regexp_replace(
    replace(replace(replace(replace(replace(replace(replace(coalesce(p, ''),
      '&quot;', '"'), '&#39;', ''''), '&#039;', ''''), '&apos;', ''''), '&lt;', '<'), '&gt;', '>'), '&amp;', '&'),
    '\s+', ' ', 'g')));
$$;

revoke all on function public.portal_enrollment_tag_key(text) from public, anon, authenticated;

-- ------------------------------------------- 5. marks wait for a sync in flight
--
-- v52's function, restated exactly (it is unchanged in production since) with
-- one line added, marked. Without it a mark could pass the roster check just
-- before a sync commits a drop and land just after it.

CREATE OR REPLACE FUNCTION public.staff_mark_attendance(
  p_session_id uuid,
  p_marks      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_class_id       uuid;
  v_session_status text;
  v_session_date   date;
  v_enabled        boolean;
  m                jsonb;
  v_student        uuid;
  v_status         text;
  v_old            text;
  v_written        int := 0;
  v_unchanged      int := 0;
BEGIN
  IF p_marks IS NULL OR jsonb_typeof(p_marks) <> 'array' THEN
    RAISE EXCEPTION 'marks must be a JSON array';
  END IF;

  -- v68: admin_enrollment_import holds this key EXCLUSIVELY while it applies.
  -- Shared here, so marks never wait for each other, only for a sync — and the
  -- roster check below then reads the rosters that sync committed.
  PERFORM pg_advisory_xact_lock_shared(hashtext('public.admin_enrollment_import'));

  SELECT class_id, status, session_date
    INTO v_class_id, v_session_status, v_session_date
    FROM public.portal_class_sessions
   WHERE id = p_session_id;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'No such class session';
  END IF;

  -- can_edit_portal_class is `is_admin() OR teaches this class`, which is
  -- exactly the rule: a teacher marks their own classes, an admin marks any.
  IF NOT public.can_edit_portal_class(v_class_id) THEN
    RAISE EXCEPTION 'You do not teach this class';
  END IF;

  SELECT attendance_capture_enabled INTO v_enabled FROM public.portal_settings WHERE id;
  IF NOT v_enabled AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Attendance is now imported from Enrolio and can no longer be taken in the app';
  END IF;

  IF v_session_status <> 'held' THEN
    RAISE EXCEPTION 'That date is marked % - set it back to held before taking attendance', v_session_status;
  END IF;

  -- A class that has not happened cannot have been attended. Without this a
  -- mistyped date silently creates a present mark in November.
  IF v_session_date > public.studio_today() THEN
    RAISE EXCEPTION 'That class has not happened yet';
  END IF;

  FOR m IN SELECT * FROM jsonb_array_elements(p_marks) LOOP
    v_student := nullif(m->>'student_id', '')::uuid;
    v_status  := m->>'status';

    IF v_student IS NULL THEN
      RAISE EXCEPTION 'A mark is missing its student_id';
    END IF;
    IF v_status IS NULL OR v_status NOT IN ('present', 'absent', 'excused', 'late', 'sick') THEN
      RAISE EXCEPTION 'Unknown attendance status %', coalesce(v_status, 'null');
    END IF;

    -- The roster as it was on the day, matching portal_attendance_gaps. A
    -- dancer who dropped in October cannot be marked for a November class.
    IF NOT EXISTS (
      SELECT 1 FROM public.portal_enrollments e
      WHERE e.student_id = v_student
        AND e.class_id   = v_class_id
        AND e.enrolled_on <= v_session_date
        AND (e.dropped_on IS NULL OR e.dropped_on >= v_session_date)
    ) THEN
      RAISE EXCEPTION 'That dancer was not on this roster on %', v_session_date;
    END IF;

    SELECT status INTO v_old
      FROM public.portal_attendance
     WHERE student_id = v_student AND session_id = p_session_id;

    -- Re-marking a dancer the same thing is what a teacher scrolling back
    -- through a saved list does constantly. It is not a change, it does not
    -- earn a history row, and counting it as one would bury the real edits.
    IF v_old IS DISTINCT FROM v_status THEN
      INSERT INTO public.portal_attendance
        (student_id, class_id, session_id, status, source, recorded_by, recorded_at)
      VALUES
        (v_student, v_class_id, p_session_id, v_status, 'app', auth.uid(), now())
      ON CONFLICT (student_id, session_id) DO UPDATE
        SET status      = excluded.status,
            source      = 'app',
            recorded_by = auth.uid(),
            recorded_at = now();

      INSERT INTO public.portal_attendance_history
        (student_id, class_id, session_id, old_status, new_status, changed_by, source)
      VALUES
        (v_student, v_class_id, p_session_id, v_old, v_status, auth.uid(), 'app');

      v_written := v_written + 1;
    ELSE
      v_unchanged := v_unchanged + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('written', v_written, 'unchanged', v_unchanged);
END
$fn$;

REVOKE ALL ON FUNCTION public.staff_mark_attendance(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_mark_attendance(uuid, jsonb) TO authenticated;

-- ------------------------------------------------------------------- 6. the RPC
--
-- One parameter more than v67 (p_confirm), so v67's is dropped rather than
-- overloaded: PostgREST picks a function by its named arguments, and two
-- candidates would make every call ambiguous.

drop function if exists public.admin_enrollment_import(jsonb, text, text, text);

create or replace function public.admin_enrollment_import(
  p_contacts jsonb,
  p_mode     text    default 'preview',
  p_expect   text    default null,
  p_filename text    default null,
  p_confirm  boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_as_of      date;
  v_drop_day   date;
  v_first      boolean;
  v_start_at   timestamptz;
  v_last_sync  date;
  v_plan_hash  text;
  v_base_hash  text;
  v_result     jsonb;
  v_before     jsonb;
  v_after      jsonb;
  v_count      int;
  v_drops      int;
  v_places     int;
  v_confirm    boolean;
  v_block      record;
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;
  if p_mode is null or p_mode not in ('preview', 'apply', 'baseline') then
    raise exception 'mode must be preview, apply or baseline';
  end if;
  if p_contacts is null or jsonb_typeof(p_contacts) <> 'array' then
    raise exception 'contacts must be a JSON array';
  end if;
  if jsonb_array_length(p_contacts) = 0 then
    raise exception 'That file has no contacts in it';
  end if;
  if jsonb_array_length(p_contacts) > 5000 then
    raise exception 'Import at most 5000 contacts at a time';
  end if;

  if p_mode <> 'preview' then
    if p_expect is null then
      raise exception 'Preview the file before applying it';
    end if;
    -- One sync at a time, and no mark mid-sync: staff_mark_attendance takes
    -- this key shared. A second sync waits here, then recomputes against what
    -- the first wrote and finds its preview stale.
    perform pg_advisory_xact_lock(hashtext('public.admin_enrollment_import'));
  end if;

  v_as_of    := public.studio_today();
  v_drop_day := v_as_of - 1;
  select min(r.run_at) into v_start_at from public.portal_enrollment_import_runs r where r.mode = 'baseline';
  v_first     := v_start_at is null;
  select max(r.as_of) into v_last_sync from public.portal_enrollment_import_runs r;

  drop table if exists pg_temp._ei_contact, pg_temp._ei_tag, pg_temp._ei_class_all, pg_temp._ei_class,
    pg_temp._ei_ambiguous, pg_temp._ei_family, pg_temp._ei_family_tag, pg_temp._ei_name, pg_temp._ei_dancer,
    pg_temp._ei_unknown, pg_temp._ei_held, pg_temp._ei_fstat, pg_temp._ei_assign, pg_temp._ei_newfam,
    pg_temp._ei_newdancer, pg_temp._ei_drop, pg_temp._ei_block, pg_temp._ei_base, pg_temp._ei_email_conflict;

  -- ------------------------------------------------------------ the file

  create temp table _ei_contact on commit drop as
  select t.ord::int                                             as ord,
         case when (t.x->>'row') ~ '^[0-9]{1,7}$' then (t.x->>'row')::int end as row_no,
         nullif(btrim(coalesce(t.x->>'contact_id', '')), '')    as contact_id,
         nullif(lower(btrim(coalesce(t.x->>'email', ''))), '')  as email,
         btrim(coalesce(t.x->>'first_name', ''))                as first_name,
         btrim(coalesce(t.x->>'last_name', ''))                 as last_name,
         case when jsonb_typeof(t.x->'tags') = 'array' then t.x->'tags' else '[]'::jsonb end as tags,
         case when jsonb_typeof(t.x->'students') = 'array' then t.x->'students' else '[]'::jsonb end as students,
         null::uuid                                             as household_id
    from jsonb_array_elements(p_contacts) with ordinality as t(x, ord);

  -- Rule 1: the GHL contact id, then the email.
  update _ei_contact c
     set household_id = h.id
    from public.portal_households h
   where c.contact_id is not null
     and h.external_account_id = c.contact_id;

  update _ei_contact c
     set household_id = h.id
    from public.portal_households h
   where c.household_id is null
     and c.email is not null
     and lower(h.primary_email) = c.email;

  -- ...then the family of another contact record carrying the same email: two
  -- parents, one family, one of them known to the app under an old address.
  -- Only when that points at ONE family.
  create temp table _ei_email_conflict on commit drop as
  select c.email, array_agg(distinct c.household_id) as households
    from _ei_contact c
   where c.household_id is not null and c.email is not null
   group by c.email
  having count(distinct c.household_id) > 1;

  update _ei_contact c
     set household_id = m.household_id
    from (select c2.email, min(c2.household_id::text)::uuid as household_id
            from _ei_contact c2
           where c2.household_id is not null and c2.email is not null
           group by c2.email
          having count(distinct c2.household_id) = 1) m
   where c.household_id is null
     and c.email = m.email;

  create temp table _ei_tag on commit drop as
  select distinct c.ord, c.household_id, public.portal_enrollment_tag_key(e.v) as tag
    from _ei_contact c
    cross join lateral jsonb_array_elements_text(c.tags) as e(v);
  delete from _ei_tag where tag = '';

  -- A title held by several classes resolves to the one ACTIVE class among
  -- them — last season's copy switched off in the app is not a second class.
  -- Still ambiguous only with two active, or two inactive and none active.
  create temp table _ei_class_all on commit drop as
  select k.id as class_id, public.portal_enrollment_tag_key(k.external_class_id) as tag_key,
         k.is_active, k.season
    from public.portal_classes k
   where k.external_class_id is not null
     and public.portal_enrollment_tag_key(k.external_class_id) <> '';

  create temp table _ei_class on commit drop as
  select a.tag_key,
         case when count(*) filter (where a.is_active) = 1
                then (array_agg(a.class_id) filter (where a.is_active))[1]
              when count(*) = 1
                then (array_agg(a.class_id))[1]
         end as class_id
    from _ei_class_all a
   group by a.tag_key;

  create temp table _ei_ambiguous on commit drop as
  select k.tag_key from _ei_class k where k.class_id is null;
  delete from _ei_class where class_id is null;

  -- All Students: entities decoded, Enrolio's stray trailing asterisk dropped,
  -- whitespace collapsed. `key` ignores case, spaces and punctuation, so
  -- "Vesper- Lund" and "Vesper-Lund" are one dancer.
  create temp table _ei_name on commit drop as
  select distinct c.ord, c.household_id,
         btrim(regexp_replace(regexp_replace(
           replace(replace(replace(replace(replace(e.v, '&#39;', ''''), '&#039;', ''''), '&apos;', ''''), '&quot;', '"'), '&amp;', '&'),
           '\*+\s*$', ''), '\s+', ' ', 'g')) as name
    from _ei_contact c
    cross join lateral jsonb_array_elements_text(c.students) as e(v);
  delete from _ei_name where name is null or name = '';
  alter table _ei_name add column key text;
  update _ei_name set key = regexp_replace(lower(name), '[^[:alnum:]]+', '', 'g');

  -- ------------------------------------------------ the families it knows
  --
  -- first_seen: the sync has never seen this family, and it already existed
  -- when the starting point was recorded — so its tags are of unknown age and
  -- are recorded rather than acted on. A family created since is new.

  create temp table _ei_family on commit drop as
  select c.household_id,
         count(*)::int as contacts,
         (not v_first
          and not exists (select 1 from public.portal_enrollment_import_seen s where s.household_id = c.household_id)
          and (select h.created_at from public.portal_households h where h.id = c.household_id) < v_start_at
         ) as first_seen
    from _ei_contact c
   where c.household_id is not null
   group by c.household_id;

  create temp table _ei_family_tag on commit drop as
  select distinct t.household_id, k.class_id
    from _ei_tag t
    join _ei_class k on k.tag_key = t.tag
   where t.household_id is not null;

  create temp table _ei_dancer on commit drop as
  select s.household_id, s.id as student_id,
         btrim(s.first_name || ' ' || s.last_name) as name,
         regexp_replace(lower(s.first_name || s.last_name), '[^[:alnum:]]+', '', 'g') as key,
         s.date_of_birth,
         case when s.date_of_birth is not null
              then extract(year from age(v_as_of::timestamp, s.date_of_birth::timestamp))::int end as age
    from public.portal_students s
    join _ei_family f on f.household_id = s.household_id
   where s.status = 'active';

  -- Names in All Students that are none of the family's dancers. Fewer names
  -- than dancers is normal — the column is often incomplete.
  create temp table _ei_unknown on commit drop as
  select distinct n.household_id, n.name
    from _ei_name n
   where n.household_id is not null
     and not exists (select 1 from _ei_dancer d
                      where d.household_id = n.household_id and d.key = n.key);

  -- A class counts as held when ANY student of the household — active or not —
  -- has an active enrolment in it.
  create temp table _ei_held on commit drop as
  select distinct s.household_id, e.class_id
    from public.portal_enrollments e
    join public.portal_students s on s.id = e.student_id
    join _ei_family f on f.household_id = s.household_id
   where e.status = 'active';

  create temp table _ei_fstat on commit drop as
  select f.household_id,
         (select count(*) from _ei_dancer d where d.household_id = f.household_id)::int as dancers,
         (select count(*) from _ei_dancer d
           where d.household_id = f.household_id and d.date_of_birth is null)::int     as no_birthday,
         (select count(*) from _ei_unknown u where u.household_id = f.household_id)::int as unknown
    from _ei_family f
   where not f.first_seen;

  -- ----------------------------------------------- rule 2, existing families

  create temp table _ei_assign on commit drop as
  select nt.household_id,
         null::int  as ord,
         nt.class_id,
         case
           when fs.dancers = 0 or fs.unknown > 0 then null
           when fs.dancers = 1 then (select d.student_id from _ei_dancer d where d.household_id = nt.household_id)
           when fs.no_birthday > 0 then null
           when fit.fits = 1 then fit.only_one
         end        as student_id,
         null::text as new_dancer_key,
         case
           when fs.dancers = 0          then 'no_dancers'
           when fs.unknown > 0          then 'export_names_unknown_dancer'
           when fs.dancers = 1          then 'only_dancer'
           when fs.no_birthday > 0      then 'missing_birthday'
           when fit.fits = 1            then 'only_sibling_in_age_range'
           when fit.fits = 0            then 'no_sibling_in_age_range'
           else                              'several_siblings_in_age_range'
         end        as reason,
         null::text as conflict,
         null::date as conflict_on
    from (
      select ft.household_id, ft.class_id
        from _ei_family_tag ft
        join _ei_fstat fs0 on fs0.household_id = ft.household_id
       where not exists (select 1 from public.portal_enrollment_import_tags b
                          where b.household_id = ft.household_id and b.class_id = ft.class_id)
         and not exists (select 1 from _ei_held h
                          where h.household_id = ft.household_id and h.class_id = ft.class_id)
    ) nt
    join _ei_fstat fs on fs.household_id = nt.household_id
    join public.portal_classes k on k.id = nt.class_id
    cross join lateral (
      select count(*)::int as fits, (array_agg(d.student_id))[1] as only_one
        from _ei_dancer d
       where d.household_id = nt.household_id
         and d.age is not null
         and (k.age_min_years is null or d.age >= k.age_min_years)
         and (k.age_max_years is null or d.age <= k.age_max_years)
    ) fit;

  -- ------------------------------------------------ rule 7, new families

  create temp table _ei_newfam on commit drop as
  select c.ord, c.row_no, c.contact_id, c.email, c.first_name, c.last_name,
         case
           when c.email is null
             or c.email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then 'invalid_email'
           when exists (select 1 from _ei_email_conflict x where x.email = c.email) then 'email_on_two_families'
           when exists (select 1 from _ei_contact o
                         where o.household_id is null and o.ord <> c.ord
                           and (o.email = c.email
                                or (c.contact_id is not null and o.contact_id = c.contact_id))) then 'duplicate_contact'
           when not exists (select 1 from _ei_name n where n.ord = c.ord) then 'no_dancer_name'
           -- Split on the last space, as admin_roster_import does with a name
           -- in one column. A single word has no surname to split off.
           when exists (select 1 from _ei_name n
                         where n.ord = c.ord and position(' ' in n.name) = 0) then 'dancer_name_needs_surname'
         end                                         as problem,
         'new:' || coalesce(c.contact_id, c.email, c.ord::text) as family_key,
         null::uuid                                  as household_id
    from _ei_contact c
   where c.household_id is null;

  create temp table _ei_newdancer on commit drop as
  select distinct on (nf.ord, lower(n.name))
         nf.ord,
         n.name,
         btrim(left(n.name, length(n.name) - length(substring(n.name from '[^ ]+$')))) as first_name,
         substring(n.name from '[^ ]+$')                                               as last_name,
         nf.family_key || '|' || lower(n.name)                                         as dancer_key,
         null::uuid                                                                    as student_id
    from _ei_newfam nf
    join _ei_name n on n.ord = nf.ord
   where nf.problem is null
   order by nf.ord, lower(n.name), n.name;

  -- Every tag of a new family is new. One dancer takes them all; several have no
  -- birthday yet, so no age range can pick one.
  insert into _ei_assign (household_id, ord, class_id, student_id, new_dancer_key, reason, conflict, conflict_on)
  select distinct null::uuid, nf.ord, k.class_id, null::uuid,
         case when nd.dancers = 1 then nd.only_key end,
         case when nd.dancers = 1 then 'only_dancer' else 'missing_birthday' end,
         null::text, null::date
    from _ei_newfam nf
    join (select ord, count(*)::int as dancers, min(dancer_key) as only_key
            from _ei_newdancer group by ord) nd on nd.ord = nf.ord
    join _ei_tag t on t.ord = nf.ord
    join _ei_class k on k.tag_key = t.tag
   where nf.problem is null;

  -- What stops an assigned place, one place at a time. The unique key is
  -- (student, class, SEASON): only a row in this class's season is in the way.
  -- Reopening a dropped row would put the dancer back on every roster in
  -- between, so it is listed instead. A mark already on the class before today
  -- would fall outside a place starting today, so that place waits for a
  -- person — it does not stop the rest of the file.
  update _ei_assign a
     set conflict = coalesce(
           (select 'class_off_schedule' from public.portal_classes k where k.id = a.class_id and not k.is_active),
           (select 'class_has_no_season' from public.portal_classes k where k.id = a.class_id and k.season is null),
           (select 'already_' || e.status
              from public.portal_enrollments e
              join public.portal_classes k on k.id = a.class_id
             where e.student_id = a.student_id and e.class_id = a.class_id and e.season = k.season
             order by e.enrolled_on desc limit 1),
           (select 'marked_before_start'
              from public.portal_attendance at
              join public.portal_class_sessions s on s.id = at.session_id
             where at.student_id = a.student_id and at.class_id = a.class_id and s.session_date < v_as_of
             limit 1)),
         conflict_on = coalesce(
           (select e.dropped_on
              from public.portal_enrollments e
              join public.portal_classes k on k.id = a.class_id
             where e.student_id = a.student_id and e.class_id = a.class_id and e.season = k.season
             order by e.enrolled_on desc limit 1),
           (select max(s.session_date)
              from public.portal_attendance at
              join public.portal_class_sessions s on s.id = at.session_id
             where at.student_id = a.student_id and at.class_id = a.class_id and s.session_date < v_as_of))
   where a.student_id is not null or a.new_dancer_key is not null;

  -- ------------------------------------------------------------- rule 3
  --
  -- A drop keeps an earlier end already on the row: moving it later would put
  -- the dancer back on past rosters. Only a missing or later end becomes the
  -- day before the import.

  create temp table _ei_drop on commit drop as
  select e.id as enrollment_id, e.student_id, e.class_id, e.enrolled_on, s.household_id,
         least(coalesce(e.dropped_on, v_drop_day), v_drop_day)            as new_dropped_on,
         (e.dropped_on is null or e.dropped_on > v_drop_day)              as moves_end
    from public.portal_enrollment_import_tags b
    join _ei_family f on f.household_id = b.household_id and not f.first_seen
    join public.portal_students s on s.household_id = b.household_id
    join public.portal_enrollments e on e.student_id = s.id and e.class_id = b.class_id
   where e.status = 'active'
     and not exists (select 1 from _ei_family_tag ft
                      where ft.household_id = b.household_id and ft.class_id = b.class_id);

  -- ------------------------------------------------------------ guards

  create temp table _ei_block (
    kind       text not null,
    reason     text not null,
    student_id uuid,
    class_id   uuid,
    on_date    date,
    detail     text
  ) on commit drop;

  -- A file with no class tag at all is a broken export (the Tags column came
  -- out empty, or it is a different export), and applied it would drop every
  -- remembered place at once.
  -- Any class counts here, ambiguous or switched off: those have their own
  -- reasons, and "no class tags" would send somebody looking in the wrong place.
  if not exists (select 1 from _ei_tag t join _ei_class_all k on k.tag_key = t.tag) then
    insert into _ei_block (kind, reason) values ('file', 'no_class_tags');
  end if;

  insert into _ei_block (kind, reason, detail)
  select distinct 'class', 'duplicate_class_title', a.tag_key
    from _ei_ambiguous a
   where exists (select 1 from _ei_tag t where t.tag = a.tag_key);

  insert into _ei_block (kind, reason, student_id, class_id)
  select distinct 'drop', 'several_active_enrollments', d.student_id, d.class_id
    from _ei_drop d
   where (select count(*) from public.portal_enrollments e
           where e.student_id = d.student_id and e.class_id = d.class_id and e.status = 'active') <> 1;

  insert into _ei_block (kind, reason, student_id, class_id, on_date)
  select 'drop', 'enrolled_after_drop_day', d.student_id, d.class_id, d.enrolled_on
    from _ei_drop d
   where d.moves_end and d.enrolled_on > v_drop_day;

  insert into _ei_block (kind, reason, student_id, class_id, on_date)
  select 'drop', 'marked_after_drop_day', d.student_id, d.class_id, max(s.session_date)
    from _ei_drop d
    join public.portal_attendance a on a.student_id = d.student_id and a.class_id = d.class_id
    join public.portal_class_sessions s on s.id = a.session_id
   where d.moves_end and s.session_date > v_drop_day
   group by d.student_id, d.class_id;

  -- A large drop is usually a damaged or filtered export, so it has to be
  -- confirmed: 20 or more, or at least a tenth of the places the families in
  -- this file hold.
  select count(*) into v_drops from _ei_drop;
  select count(*) into v_places
    from public.portal_enrollments e
    join public.portal_students s on s.id = e.student_id
    join _ei_family f on f.household_id = s.household_id
   where e.status = 'active';
  v_confirm := v_drops >= 20 or (v_drops >= 5 and v_drops * 10 >= v_places);

  -- A first run only records: nothing is added, dropped or decided, so none of
  -- it is offered — a list of places under "nothing will change" is a list
  -- somebody will act on. Only a broken file or an ambiguous class still stops
  -- the recording.
  if v_first then
    delete from _ei_assign;
    delete from _ei_drop;
    delete from _ei_block where kind not in ('file', 'class');
  end if;

  -- ----------------------------------------------- what apply would remember
  --
  -- A family seen before: everything tagged now, minus the new tags nobody
  -- could take (so they come back). A family seen for the first time: all of
  -- it, acted on by nobody. A new family: the tags that became places.

  create temp table _ei_base on commit drop as
  select ft.household_id, null::text as family_key, ft.class_id
    from _ei_family_tag ft
   where not exists (
           select 1 from _ei_assign a
            where a.household_id = ft.household_id and a.class_id = ft.class_id
              and (a.conflict is not null or (a.student_id is null and a.new_dancer_key is null)))
  union all
  select null::uuid, nf.family_key, a.class_id
    from _ei_assign a
    join _ei_newfam nf on nf.ord = a.ord
   where a.new_dancer_key is not null and a.conflict is null;

  -- ------------------------------------------------------------- hashes
  --
  -- Over everything apply would write — places with the season they would get,
  -- drops with the end they would get, new families and dancers, the memory
  -- written and removed, the families marked seen — and the date. Each section
  -- keeps its place when empty.

  v_plan_hash := md5(concat_ws('#', 'apply', v_as_of::text,
    coalesce((select string_agg(coalesce(a.student_id::text, a.new_dancer_key) || '>' || a.class_id::text
                                || '@' || coalesce(k.season, ''), ','
                                order by coalesce(a.student_id::text, a.new_dancer_key), a.class_id::text)
                from _ei_assign a join public.portal_classes k on k.id = a.class_id
               where (a.student_id is not null or a.new_dancer_key is not null) and a.conflict is null), ''),
    coalesce((select string_agg(d.enrollment_id::text || '<' || d.new_dropped_on::text, ',' order by d.enrollment_id::text)
                from _ei_drop d), ''),
    coalesce((select string_agg(nf.family_key || '/' || nf.email || '/' || nf.last_name, ','
                                order by nf.family_key)
                from _ei_newfam nf where nf.problem is null), ''),
    coalesce((select string_agg(nd.dancer_key || '/' || nd.name, ',' order by nd.dancer_key) from _ei_newdancer nd), ''),
    coalesce((select string_agg(coalesce(b.household_id::text, b.family_key) || '>' || b.class_id::text, ','
                                order by coalesce(b.household_id::text, b.family_key), b.class_id::text)
                from _ei_base b), ''),
    coalesce((select string_agg(b.household_id::text || '>' || b.class_id::text, ','
                                order by b.household_id::text, b.class_id::text)
                from public.portal_enrollment_import_tags b
                join _ei_family f on f.household_id = b.household_id), ''),
    coalesce((select string_agg(f.household_id::text, ',' order by f.household_id::text) from _ei_family f), '')));

  v_base_hash := md5(concat_ws('#', 'baseline', v_as_of::text,
    coalesce((select string_agg(ft.household_id::text || '>' || ft.class_id::text, ','
                                order by ft.household_id::text, ft.class_id::text)
                from _ei_family_tag ft), ''),
    coalesce((select string_agg(f.household_id::text, ',' order by f.household_id::text) from _ei_family f), '')));

  -- ------------------------------------------------------------- the diff

  v_result := jsonb_build_object(
    'mode',          p_mode,
    'filename',      p_filename,
    'as_of',         v_as_of,
    'drop_day',      v_drop_day,
    'first_import',  v_first,
    'last_sync_on',  v_last_sync,
    'plan_hash',     v_plan_hash,
    'baseline_hash', v_base_hash,
    'confirm_drops', v_confirm,

    'adds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'student_id',   a.student_id,
               'student_name', coalesce(d.name, nd.name),
               'new_dancer',   a.new_dancer_key is not null,
               'household_id', a.household_id,
               'family',       coalesce(h.display_name, nullif(nf.last_name, ''), nd.last_name),
               'email',        coalesce(h.primary_email, nf.email),
               'class_id',     k.id,
               'class_name',   k.name,
               'day_of_week',  k.day_of_week,
               'start_time',   k.start_time,
               'reason',       a.reason)
             order by k.name, k.day_of_week, k.start_time, coalesce(d.name, nd.name))
        from _ei_assign a
        join public.portal_classes k on k.id = a.class_id
        left join _ei_dancer d on d.student_id = a.student_id
        left join _ei_newdancer nd on nd.dancer_key = a.new_dancer_key
        left join public.portal_households h on h.id = a.household_id
        left join _ei_newfam nf on nf.ord = a.ord
       where (a.student_id is not null or a.new_dancer_key is not null) and a.conflict is null), '[]'::jsonb),

    'drops', coalesce((
      select jsonb_agg(jsonb_build_object(
               'enrollment_id',  d.enrollment_id,
               'student_id',     d.student_id,
               'student_name',   btrim(s.first_name || ' ' || s.last_name),
               'household_id',   d.household_id,
               'family',         h.display_name,
               'email',          h.primary_email,
               'class_id',       k.id,
               'class_name',     k.name,
               'day_of_week',    k.day_of_week,
               'start_time',     k.start_time,
               'enrolled_on',    d.enrolled_on,
               'last_day',       d.new_dropped_on)
             order by k.name, k.day_of_week, k.start_time, s.first_name, s.last_name)
        from _ei_drop d
        join public.portal_students s on s.id = d.student_id
        join public.portal_households h on h.id = d.household_id
        join public.portal_classes k on k.id = d.class_id), '[]'::jsonb),

    -- Every dancer in the file who holds the class is losing it at once — far
    -- more often a class renamed in Enrolio before the class list was
    -- re-imported than a class that ended. Families missing from the file are
    -- left out of the count, since they are never dropped.
    'whole_class_drops', coalesce((
      select jsonb_agg(jsonb_build_object(
               'class_id', k.id, 'class_name', k.name, 'day_of_week', k.day_of_week,
               'start_time', k.start_time, 'dropping', x.dropping)
             order by k.name, k.day_of_week, k.start_time)
        from (select d.class_id, count(*)::int as dropping from _ei_drop d group by d.class_id) x
        join public.portal_classes k on k.id = x.class_id
       where x.dropping = (select count(*) from public.portal_enrollments e
                             join public.portal_students s on s.id = e.student_id
                             join _ei_family f on f.household_id = s.household_id
                            where e.class_id = x.class_id and e.status = 'active')
         and not exists (select 1 from _ei_assign a
                          where a.class_id = x.class_id and a.conflict is null
                            and (a.student_id is not null or a.new_dancer_key is not null))), '[]'::jsonb),

    'unassigned', coalesce((
      select jsonb_agg(jsonb_build_object(
               'household_id', a.household_id,
               'family',       coalesce(h.display_name, nullif(nf.last_name, '')),
               'email',        coalesce(h.primary_email, nf.email),
               'class_id',     k.id,
               'class_name',   k.name,
               'day_of_week',  k.day_of_week,
               'start_time',   k.start_time,
               'age_min',      k.age_min_years,
               'age_max',      k.age_max_years,
               'reason',       a.reason,
               'dancers', coalesce(
                 (select jsonb_agg(jsonb_build_object('name', d.name, 'age', d.age) order by d.name)
                    from _ei_dancer d where a.household_id is not null and d.household_id = a.household_id),
                 (select jsonb_agg(jsonb_build_object('name', nd.name, 'age', null) order by nd.name)
                    from _ei_newdancer nd where a.ord is not null and nd.ord = a.ord),
                 '[]'::jsonb),
               'export_names', coalesce(
                 (select jsonb_agg(distinct n.name order by n.name) from _ei_name n
                   where (a.household_id is not null and n.household_id = a.household_id)
                      or (a.ord is not null and n.ord = a.ord)),
                 '[]'::jsonb),
               'unknown_names', coalesce(
                 (select jsonb_agg(u.name order by u.name) from _ei_unknown u
                   where a.household_id is not null and u.household_id = a.household_id),
                 '[]'::jsonb))
             order by coalesce(h.display_name, nf.last_name), k.name, k.day_of_week, k.start_time)
        from _ei_assign a
        join public.portal_classes k on k.id = a.class_id
        left join public.portal_households h on h.id = a.household_id
        left join _ei_newfam nf on nf.ord = a.ord
       where a.student_id is null and a.new_dancer_key is null), '[]'::jsonb),

    'conflicts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'student_id',   a.student_id,
               'student_name', coalesce(d.name, nd.name),
               'family',       coalesce(h.display_name, nullif(nf.last_name, '')),
               'class_id',     k.id,
               'class_name',   k.name,
               'day_of_week',  k.day_of_week,
               'start_time',   k.start_time,
               'conflict',     a.conflict,
               'on',           a.conflict_on)
             order by k.name, coalesce(d.name, nd.name))
        from _ei_assign a
        join public.portal_classes k on k.id = a.class_id
        left join _ei_dancer d on d.student_id = a.student_id
        left join _ei_newdancer nd on nd.dancer_key = a.new_dancer_key
        left join public.portal_households h on h.id = a.household_id
        left join _ei_newfam nf on nf.ord = a.ord
       where a.conflict is not null), '[]'::jsonb),

    'blocked', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind',         b.kind,
               'reason',       b.reason,
               'on',           b.on_date,
               'detail',       b.detail,
               'student_name', btrim(s.first_name || ' ' || s.last_name),
               'class_name',   k.name,
               'day_of_week',  k.day_of_week,
               'start_time',   k.start_time)
             order by b.kind, k.name, s.first_name, s.last_name, b.reason)
        from _ei_block b
        left join public.portal_students s on s.id = b.student_id
        left join public.portal_classes k on k.id = b.class_id), '[]'::jsonb),

    'first_seen_families', coalesce((
      select jsonb_agg(jsonb_build_object(
               'household_id', f.household_id,
               'family',       h.display_name,
               'email',        h.primary_email,
               'tags',         (select count(*) from _ei_family_tag ft where ft.household_id = f.household_id),
               'active_enrollments',
                 (select count(*) from public.portal_enrollments e
                    join public.portal_students s on s.id = e.student_id
                   where s.household_id = f.household_id and e.status = 'active'))
             order by h.display_name, h.primary_email)
        from _ei_family f
        join public.portal_households h on h.id = f.household_id
       where f.first_seen), '[]'::jsonb),

    'new_families', coalesce((
      select jsonb_agg(jsonb_build_object(
               'row',          nf.row_no,
               'contact_id',   nf.contact_id,
               'email',        nf.email,
               'contact_name', btrim(nf.first_name || ' ' || nf.last_name),
               'family',       coalesce(nullif(nf.last_name, ''),
                                        (select nd.last_name from _ei_newdancer nd
                                          where nd.ord = nf.ord order by nd.name limit 1)),
               'dancers',      (select jsonb_agg(nd.name order by nd.name) from _ei_newdancer nd
                                 where nd.ord = nf.ord))
             order by nf.row_no, nf.ord)
        from _ei_newfam nf
       where nf.problem is null), '[]'::jsonb),

    'not_imported', coalesce((
      select jsonb_agg(jsonb_build_object(
               'row',          nf.row_no,
               'contact_id',   nf.contact_id,
               'email',        nf.email,
               'contact_name', btrim(nf.first_name || ' ' || nf.last_name),
               'reason',       nf.problem,
               'names',        coalesce((select jsonb_agg(n.name order by n.name) from _ei_name n
                                          where n.ord = nf.ord), '[]'::jsonb))
             order by nf.row_no, nf.ord)
        from _ei_newfam nf
       where nf.problem is not null), '[]'::jsonb),

    'merged_contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'household_id', f.household_id,
               'family',       h.display_name,
               'email',        h.primary_email,
               'contacts',     f.contacts)
             order by h.display_name, h.primary_email)
        from _ei_family f
        join public.portal_households h on h.id = f.household_id
       where f.contacts > 1), '[]'::jsonb),

    'email_conflicts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'email',    x.email,
               'families', (select jsonb_agg(coalesce(h.display_name, h.primary_email) order by h.display_name)
                              from public.portal_households h where h.id = any(x.households)))
             order by x.email)
        from _ei_email_conflict x), '[]'::jsonb),

    'missing_families', coalesce((
      select jsonb_agg(jsonb_build_object(
               'household_id',       m.id,
               'family',             m.display_name,
               'email',              m.primary_email,
               'dancers',            m.dancers,
               'active_enrollments', m.active_enrollments)
             order by m.active_enrollments desc, m.display_name, m.primary_email)
        from (
          select h.id, h.display_name, h.primary_email,
                 (select count(*) from public.portal_students s
                   where s.household_id = h.id and s.status = 'active')::int as dancers,
                 (select count(*) from public.portal_enrollments e
                    join public.portal_students s on s.id = e.student_id
                   where s.household_id = h.id and e.status = 'active')::int  as active_enrollments
            from public.portal_households h
           where not exists (select 1 from _ei_family f where f.household_id = h.id)
        ) m), '[]'::jsonb),

    -- Places a dancer holds in a class the family was never tagged for: the
    -- sync can never drop these, because there is no tag to disappear.
    'held_untagged', coalesce((
      select jsonb_agg(jsonb_build_object(
               'student_name', btrim(s.first_name || ' ' || s.last_name),
               'family',       h.display_name,
               'class_name',   k.name,
               'day_of_week',  k.day_of_week,
               'start_time',   k.start_time,
               'enrolled_on',  e.enrolled_on)
             order by k.name, s.first_name, s.last_name)
        from public.portal_enrollments e
        join public.portal_students s on s.id = e.student_id
        join _ei_family f on f.household_id = s.household_id and not f.first_seen
        join public.portal_households h on h.id = s.household_id
        join public.portal_classes k on k.id = e.class_id
       where e.status = 'active'
         and not exists (select 1 from _ei_family_tag ft where ft.household_id = f.household_id and ft.class_id = e.class_id)
         and not exists (select 1 from public.portal_enrollment_import_tags b
                          where b.household_id = f.household_id and b.class_id = e.class_id)), '[]'::jsonb),

    -- Tags remembered from an earlier export that nobody in the family holds:
    -- usually left behind in Enrolio after a class change. Ignored.
    'tagged_unheld', coalesce((
      select jsonb_agg(jsonb_build_object(
               'family',      h.display_name,
               'email',       h.primary_email,
               'class_name',  k.name,
               'day_of_week', k.day_of_week,
               'start_time',  k.start_time)
             order by h.display_name, k.name)
        from _ei_family_tag ft
        join _ei_family f on f.household_id = ft.household_id and not f.first_seen
        join public.portal_households h on h.id = ft.household_id
        join public.portal_classes k on k.id = ft.class_id
       where exists (select 1 from public.portal_enrollment_import_tags b
                      where b.household_id = ft.household_id and b.class_id = ft.class_id)
         and not exists (select 1 from _ei_held hd where hd.household_id = ft.household_id and hd.class_id = ft.class_id)), '[]'::jsonb),

    'unmatched_tags', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tag', x.tag, 'families', x.families,
               'looks_like_class', x.tag ~ '\([^()]*\)\s*$')
             order by x.families desc, x.tag)
        from (
          select t.tag, count(distinct coalesce(t.household_id::text, 'contact' || t.ord::text))::int as families
            from _ei_tag t
           where not exists (select 1 from _ei_class k where k.tag_key = t.tag)
           group by t.tag
        ) x), '[]'::jsonb),

    'memory_changes', jsonb_build_object(
      'added', (select count(*) from _ei_base x
                 where x.household_id is null
                    or not exists (select 1 from public.portal_enrollment_import_tags b
                                    where b.household_id = x.household_id and b.class_id = x.class_id)),
      'removed', (select count(*) from public.portal_enrollment_import_tags b
                   join _ei_family f on f.household_id = b.household_id
                  where not exists (select 1 from _ei_base x
                                     where x.household_id = b.household_id and x.class_id = b.class_id))),

    'baseline_counts', jsonb_build_object(
      'families', (select count(*) from _ei_family),
      'tags',     (select count(*) from _ei_family_tag))
  );

  v_result := v_result || jsonb_build_object('counts', jsonb_build_object(
    'contacts',             (select count(*) from _ei_contact),
    'families',             (select count(*) from _ei_family),
    'adds',                 jsonb_array_length(v_result->'adds'),
    'drops',                jsonb_array_length(v_result->'drops'),
    'unassigned',           jsonb_array_length(v_result->'unassigned'),
    'conflicts',            jsonb_array_length(v_result->'conflicts'),
    'blocked',              jsonb_array_length(v_result->'blocked'),
    'first_seen_families',  jsonb_array_length(v_result->'first_seen_families'),
    'new_families',         jsonb_array_length(v_result->'new_families'),
    'new_dancers',          (select count(*) from _ei_newdancer),
    'not_imported',         jsonb_array_length(v_result->'not_imported'),
    'merged_contacts',      jsonb_array_length(v_result->'merged_contacts'),
    'email_conflicts',      jsonb_array_length(v_result->'email_conflicts'),
    'missing_families',     jsonb_array_length(v_result->'missing_families'),
    'held_untagged',        jsonb_array_length(v_result->'held_untagged'),
    'tagged_unheld',        jsonb_array_length(v_result->'tagged_unheld'),
    'memory_changes',       (v_result->'memory_changes'->>'added')::int + (v_result->'memory_changes'->>'removed')::int,
    'unmatched_class_tags',
      (select count(*) from jsonb_array_elements(v_result->'unmatched_tags') u
        where (u->>'looks_like_class')::boolean)
  ));

  if p_mode = 'preview' then
    return v_result;
  end if;

  -- The first blocking reason, in words, for either mode.
  select b.*, btrim(s.first_name || ' ' || s.last_name) as student_name, k.name as class_name
    into v_block
    from _ei_block b
    left join public.portal_students s on s.id = b.student_id
    left join public.portal_classes k on k.id = b.class_id
   where p_mode = 'apply' or b.kind in ('file', 'class')
   order by case b.kind when 'file' then 0 when 'class' then 1 else 2 end, b.reason
   limit 1;
  if found then
    raise exception '%', case v_block.reason
      when 'no_class_tags' then
        'This file has no class tags at all — it looks like a different or damaged export. Nothing was changed.'
      when 'duplicate_class_title' then format(
        'Two active classes share the Enrolio title "%s", so its tag cannot be told apart. Nothing was changed.',
        v_block.detail)
      when 'marked_after_drop_day' then format(
        '%s has an attendance mark in %s on %s, after the day they would be dropped (%s). Nothing was changed — sync again tomorrow.',
        v_block.student_name, v_block.class_name, v_block.on_date, v_drop_day)
      when 'enrolled_after_drop_day' then format(
        '%s''s place in %s starts on %s, so it cannot end on %s. Nothing was changed.',
        v_block.student_name, v_block.class_name, v_block.on_date, v_drop_day)
      when 'several_active_enrollments' then format(
        '%s holds more than one active place in %s, so the drop is ambiguous. Nothing was changed.',
        v_block.student_name, v_block.class_name)
      else 'Something in this file blocks the sync. Nothing was changed.'
    end;
  end if;

  -- ------------------------------------------------ baseline (first run)

  if p_mode = 'baseline' then
    if not v_first then
      raise exception 'A starting point is already recorded. Preview the file and apply it instead.';
    end if;
    if p_expect <> v_base_hash then
      raise exception 'The class list or the date has changed since this preview. Preview the file again.';
    end if;

    delete from public.portal_enrollment_import_tags b
     using _ei_family f
     where b.household_id = f.household_id;

    insert into public.portal_enrollment_import_tags (household_id, class_id, recorded_on)
    select ft.household_id, ft.class_id, v_as_of from _ei_family_tag ft;
    get diagnostics v_count = row_count;

    insert into public.portal_enrollment_import_seen (household_id, first_seen_on, last_seen_on)
    select f.household_id, v_as_of, v_as_of from _ei_family f
    on conflict (household_id) do update set last_seen_on = excluded.last_seen_on;

    insert into public.portal_enrollment_import_runs (mode, as_of, run_by, filename, counts)
    values ('baseline', v_as_of, auth.uid(), p_filename,
            jsonb_build_object('families', (select count(*) from _ei_family), 'tags_recorded', v_count));

    perform public.log_activity(
      'enrollment_import_baseline', 'enrollment', null, coalesce(p_filename, 'contacts export'),
      jsonb_build_object('as_of', v_as_of, 'families', (select count(*) from _ei_family),
                         'tags_recorded', v_count),
      'success');

    return v_result || jsonb_build_object('recorded', true, 'tags_recorded', v_count);
  end if;

  -- ---------------------------------------------------------------- apply

  if v_first then
    raise exception 'No starting point is recorded yet. Record the export the rosters were last brought up to date with first.';
  end if;
  if p_expect <> v_plan_hash then
    raise exception 'The rosters, the class list or the date have changed since this preview. Preview the file again, then apply.';
  end if;
  if v_confirm and not coalesce(p_confirm, false) then
    raise exception 'This sync drops % places. Tick the confirmation in the preview, then apply. Nothing was changed.', v_drops;
  end if;

  v_before := public.portal_attendance_fingerprint(v_as_of);

  -- Rule 7: households, then their dancers, then everyone's enrolments.
  with ins as (
    insert into public.portal_households (external_account_id, primary_email, display_name, status)
    select nf.contact_id, nf.email,
           coalesce(nullif(nf.last_name, ''),
                    (select nd.last_name from _ei_newdancer nd where nd.ord = nf.ord order by nd.name limit 1)),
           'active'
      from _ei_newfam nf
     where nf.problem is null
    returning id, lower(primary_email) as email
  )
  update _ei_newfam nf
     set household_id = ins.id
    from ins
   where nf.problem is null and ins.email = nf.email;

  with ins as (
    insert into public.portal_students (household_id, first_name, last_name, date_of_birth, status)
    select nf.household_id, nd.first_name, nd.last_name, null, 'active'
      from _ei_newdancer nd
      join _ei_newfam nf on nf.ord = nd.ord
    returning id, household_id, lower(first_name) as first_l, lower(last_name) as last_l
  )
  update _ei_newdancer nd
     set student_id = ins.id
    from ins, _ei_newfam nf
   where nf.ord = nd.ord
     and ins.household_id = nf.household_id
     and ins.first_l = lower(nd.first_name)
     and ins.last_l = lower(nd.last_name);

  insert into public.portal_enrollments (student_id, class_id, season, status, enrolled_on)
  select coalesce(a.student_id, nd.student_id), a.class_id, k.season, 'active', v_as_of
    from _ei_assign a
    join public.portal_classes k on k.id = a.class_id
    left join _ei_newdancer nd on nd.dancer_key = a.new_dancer_key
   where (a.student_id is not null or a.new_dancer_key is not null)
     and a.conflict is null;

  update public.portal_enrollments e
     set status = 'dropped', dropped_on = d.new_dropped_on
    from _ei_drop d
   where e.id = d.enrollment_id
     and e.status = 'active';
  get diagnostics v_count = row_count;
  if v_count <> v_drops then
    raise exception 'A dancer due to be dropped had already left the class. Nothing was changed — preview again.';
  end if;

  -- Remember what this export said, for the families it covered. Families
  -- missing from it keep what they had (rule 6).
  delete from public.portal_enrollment_import_tags b
   using _ei_family f
   where b.household_id = f.household_id
     and not exists (select 1 from _ei_base x
                      where x.household_id = b.household_id and x.class_id = b.class_id);

  insert into public.portal_enrollment_import_tags (household_id, class_id, recorded_on)
  select coalesce(x.household_id, nf.household_id), x.class_id, v_as_of
    from _ei_base x
    left join _ei_newfam nf on nf.family_key = x.family_key
  on conflict (household_id, class_id) do nothing;

  insert into public.portal_enrollment_import_seen (household_id, first_seen_on, last_seen_on)
  select f.household_id, v_as_of, v_as_of from _ei_family f
  union
  select nf.household_id, v_as_of, v_as_of from _ei_newfam nf where nf.household_id is not null
  on conflict (household_id) do update set last_seen_on = excluded.last_seen_on;

  v_after := public.portal_attendance_fingerprint(v_as_of);
  if v_after is distinct from v_before then
    raise exception 'Stopped: attendance or a past roster would have changed. Nothing was saved.';
  end if;

  insert into public.portal_enrollment_import_runs (mode, as_of, run_by, filename, counts)
  values ('apply', v_as_of, auth.uid(), p_filename, v_result->'counts');

  perform public.log_activity(
    'enrollments_imported', 'enrollment', null, coalesce(p_filename, 'contacts export'),
    jsonb_build_object(
      'as_of',            v_as_of,
      'added',            v_result->'counts'->'adds',
      'dropped',          v_result->'counts'->'drops',
      'families_created', v_result->'counts'->'new_families',
      'dancers_created',  v_result->'counts'->'new_dancers',
      'unassigned',       v_result->'counts'->'unassigned',
      'conflicts',        v_result->'counts'->'conflicts',
      'first_seen',       v_result->'counts'->'first_seen_families',
      'memory_changes',   v_result->'counts'->'memory_changes',
      'attendance_rows',  v_after->'attendance'->'rows'),
    'success');

  return v_result || jsonb_build_object(
    'applied', true,
    'fingerprint', jsonb_build_object('before', v_before, 'after', v_after));
end;
$fn$;

revoke execute on function public.admin_enrollment_import(jsonb, text, text, text, boolean) from public, anon;
grant execute on function public.admin_enrollment_import(jsonb, text, text, text, boolean) to authenticated, service_role;

-- =============================================================================
-- VERIFY
--
--   -- The one importer, with the new signature, and nothing left of the old:
--   select pg_get_function_identity_arguments(oid) from pg_proc
--    where proname = 'admin_enrollment_import';            -- one row, five arguments
--
--   -- Marks take the shared lock:
--   select position('pg_advisory_xact_lock_shared' in pg_get_functiondef(
--     'public.staff_mark_attendance(uuid, jsonb)'::regprocedure)) > 0;   -- true
--
--   -- After the starting point is recorded again from the 24 Sep export:
--   select count(*) from portal_enrollment_import_tags;    -- 1,110
--   select count(*) from portal_enrollment_import_seen;    -- 347
--   select mode, as_of from portal_enrollment_import_runs; -- baseline, 2026-09-24
--
-- RESET THE STARTING POINT (only if it was recorded from the wrong file)
--
--   The first run can be done again only by hand. Before any sync has been
--   applied this loses nothing; after one, whatever it applied stays applied
--   and the next preview diffs against the new starting point.
--
--   delete from public.portal_enrollment_import_tags;
--   delete from public.portal_enrollment_import_seen;
--   delete from public.portal_enrollment_import_runs;
--
-- ROLLBACK
--
--   Restore v67's admin_enrollment_import(jsonb, text, text, text) and v52's
--   staff_mark_attendance from their files, then:
--   drop function if exists public.admin_enrollment_import(jsonb, text, text, text, boolean);
--   drop table if exists public.portal_enrollment_import_seen;
--   drop table if exists public.portal_enrollment_import_runs;
-- =============================================================================
