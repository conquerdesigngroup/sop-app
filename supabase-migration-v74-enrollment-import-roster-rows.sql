-- =============================================================================
-- Migration v74 — the roster sync gives each new family a sign-up roster row
-- =============================================================================
--
-- Rule 7 of admin_enrollment_import creates a household, its dancers and their
-- places for a contact the app has never seen. It did not write portal_roster,
-- and portal-signup only lets an address make an account if it is on
-- portal_roster. So every family created by Portal Manager → Classes → Sync
-- rosters was in the app, enrolled, and locked out of signing up — with the
-- same "if your email is on our roster, a code is on its way" a typo gets.
-- Found on the first applied sync (2026-10-23): its new families, and a handful
-- of households seeded by hand on 2026-09-24 the same way, had no row. Those
-- were given one by hand that day; this stops it recurring.
--
-- WHAT CHANGES
--
--   Apply, after creating the new dancers, inserts one active guardian row per
--   new dancer: email = the household's address, student_name = the dancer's
--   name as the sync wrote it, guardian_name = the contact's name. That is the
--   shape of every guardian row admin_roster_import writes (program_id and
--   external_id null), and the name is the one admin_roster_import later
--   matches on, so a students-export import that fills in the birthday finds
--   the row rather than adding a second — when it spells the name the same way
--   (it compares names exactly; a different spelling adds a second guardian
--   row, which costs nothing at signup). A row already there for that address
--   and name is left alone, including one an admin set inactive: that may have
--   been on purpose, so it is not switched back on. An address that is already
--   a dancer's own login is never given a guardian row. (Rule 7 still seeds a
--   household on such an address, as it did under v69 — a separate fix.)
--   The apply result and its activity log entry gain roster_rows.
--
-- WHAT DOES NOT
--
--   Preview, baseline, the plan hash and every rule: the new statement runs
--   only in apply, after the plan is fixed. portal_roster is not in the
--   attendance fingerprint. Families that already exist are not touched — a
--   household with no roster row that the sync did not create is the roster
--   import's business, not the sync's.
--
-- The function keeps v69's signature and is otherwise v69's, character for
-- character; diff the two to review. Safe to run again.
-- =============================================================================

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
  v_adds       int;
  v_new_fams   int;
  v_confirm_adds boolean;
  v_roster_rows int;
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
    pg_temp._ei_newdancer, pg_temp._ei_drop, pg_temp._ei_block, pg_temp._ei_base, pg_temp._ei_email_conflict,
    pg_temp._ei_known, pg_temp._ei_spelling, pg_temp._ei_match, pg_temp._ei_inactive;

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
  -- "Vesper- Lund" and "Vesper-Lund" are one dancer — and since v69 so are
  -- "Zoë" and "Zoe": portal_enrollment_name_key also folds accents.
  create temp table _ei_name on commit drop as
  select distinct c.ord, c.household_id,
         btrim(regexp_replace(regexp_replace(
           replace(replace(replace(replace(replace(e.v, '&#39;', ''''), '&#039;', ''''), '&apos;', ''''), '&quot;', '"'), '&amp;', '&'),
           '\*+\s*$', ''), '\s+', ' ', 'g')) as name
    from _ei_contact c
    cross join lateral jsonb_array_elements_text(c.students) as e(v);
  delete from _ei_name where name is null or name = '';
  alter table _ei_name add column key text;
  update _ei_name set key = public.portal_enrollment_name_key(name);

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
         public.portal_enrollment_name_key(s.first_name || s.last_name) as key,
         s.date_of_birth,
         case when s.date_of_birth is not null
              then extract(year from age(v_as_of::timestamp, s.date_of_birth::timestamp))::int end as age
    from public.portal_students s
    join _ei_family f on f.household_id = s.household_id
   where s.status = 'active';

  -- Everyone the app has for these families, dancing or not.
  create temp table _ei_known on commit drop as
  select s.household_id, btrim(s.first_name || ' ' || s.last_name) as name, s.first_name, s.last_name,
         public.portal_enrollment_name_key(s.first_name || s.last_name) as key,
         s.status = 'active' as active
    from public.portal_students s
    join _ei_family f on f.household_id = s.household_id;

  -- Each name in All Students against each of them. A name spelled the same
  -- is that student; so is one with the same whole first name and a surname a
  -- middle name, a second surname or a letter or two away — agreed with the
  -- studio for v69, and safe only because two children in one family do not
  -- share a first name.
  --
  -- A close match never stands for a student the same contact already lists
  -- by exact name: "Mary Kate Smith" beside "Mary Smith" is a sister, not
  -- Mary with a middle name.
  create temp table _ei_match on commit drop as
  select n.household_id, n.name as export_name, k.name as dancer, k.key as dancer_key, k.active,
         (k.key = n.key) as exact
    from _ei_name n
    join _ei_known k on k.household_id = n.household_id
   where k.key = n.key
      or (public.portal_enrollment_name_close(n.name, k.first_name, k.last_name)
          and not exists (select 1 from _ei_name n2 where n2.ord = n.ord and n2.key = k.key));

  -- Taken for a dancer spelled another way: listed, so a wrong one can be seen.
  create temp table _ei_spelling on commit drop as
  select distinct m.household_id, m.export_name, m.dancer
    from _ei_match m
   where not m.exact
     and not exists (select 1 from _ei_match x
                      where x.household_id = m.household_id and x.export_name = m.export_name and x.exact);

  -- A name that is only a student the app has marked inactive: probably
  -- someone coming back. The family's new tags wait — placed on an active
  -- sibling, a returning dancer's class would go to the wrong child.
  create temp table _ei_inactive on commit drop as
  select distinct m.household_id, m.export_name as name, m.dancer
    from _ei_match m
   where not m.active
     and not exists (select 1 from _ei_match a
                      where a.household_id = m.household_id and a.export_name = m.export_name and a.active);

  -- Names in All Students that are none of the family's students. Fewer names
  -- than dancers is normal — the column is often incomplete. Each carries the
  -- student it is perhaps a misspelling of, when one is that close and no
  -- other name in the file is already that student.
  create temp table _ei_unknown on commit drop as
  select distinct n.household_id, n.name,
         (select k.name from _ei_known k
           where k.household_id = n.household_id
             and not exists (select 1 from _ei_match m where m.household_id = k.household_id and m.dancer_key = k.key)
             and public.portal_enrollment_edit_distance(k.key, n.key) <= 3
             and public.portal_enrollment_edit_distance(k.key, n.key) * 3 <= least(length(k.key), length(n.key))
           order by public.portal_enrollment_edit_distance(k.key, n.key), k.name
           limit 1) as likely
    from _ei_name n
   where n.household_id is not null
     and not exists (select 1 from _ei_match m where m.household_id = n.household_id and m.export_name = n.name);

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
         (select count(*) from _ei_unknown u where u.household_id = f.household_id)::int as unknown,
         (select count(*) from _ei_inactive i where i.household_id = f.household_id)::int as inactive
    from _ei_family f
   where not f.first_seen;

  -- ----------------------------------------------- rule 2, existing families

  create temp table _ei_assign on commit drop as
  select nt.household_id,
         null::int  as ord,
         nt.class_id,
         case
           when fs.dancers = 0 or fs.unknown > 0 or fs.inactive > 0 then null
           when fs.dancers = 1 and fit.far = 1 then null
           when fs.dancers = 1 then (select d.student_id from _ei_dancer d where d.household_id = nt.household_id)
           when fs.no_birthday > 0 then null
           when fit.fits = 1 then fit.only_one
         end        as student_id,
         null::text as new_dancer_key,
         case
           when fs.inactive > 0         then 'export_names_inactive_dancer'
           when fs.dancers = 0          then 'no_dancers'
           when fs.unknown > 0          then 'export_names_unknown_dancer'
           -- v69, agreed with the studio: the one dancer takes a new tag
           -- unless they are 3 or more years outside its age range — then it
           -- is more likely a child the app does not have yet.
           when fs.dancers = 1 and fit.far = 1
                                        then 'only_dancer_outside_age_range'
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
      select count(*) filter (where (k.age_min_years is null or d.age >= k.age_min_years)
                                and (k.age_max_years is null or d.age <= k.age_max_years))::int as fits,
             (array_agg(d.student_id) filter (where (k.age_min_years is null or d.age >= k.age_min_years)
                                                and (k.age_max_years is null or d.age <= k.age_max_years)))[1] as only_one,
             count(*) filter (where d.age <= k.age_min_years - 3 or d.age >= k.age_max_years + 3)::int as far
        from _ei_dancer d
       where d.household_id = nt.household_id
         and d.age is not null
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
  -- between, so it is listed instead. A mark on the class before today that
  -- no place of theirs covers would fall outside a place starting today, so
  -- that place waits for a person — it does not stop the rest of the file.
  -- Marks last season's place covers are not in the way (v69).
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
               and not exists (select 1 from public.portal_enrollments e
                                where e.student_id = at.student_id and e.class_id = at.class_id
                                  and e.enrolled_on <= s.session_date
                                  and (e.dropped_on is null or e.dropped_on >= s.session_date))
             limit 1)),
         conflict_on = coalesce(
           (select e.dropped_on
              from public.portal_enrollments e
              join public.portal_classes k on k.id = a.class_id
             where e.student_id = a.student_id and e.class_id = a.class_id and e.season = k.season
             order by e.enrolled_on desc limit 1),
           (select min(s.session_date)
              from public.portal_attendance at
              join public.portal_class_sessions s on s.id = at.session_id
             where at.student_id = a.student_id and at.class_id = a.class_id and s.session_date < v_as_of
               and not exists (select 1 from public.portal_enrollments e
                                where e.student_id = at.student_id and e.class_id = at.class_id
                                  and e.enrolled_on <= s.session_date
                                  and (e.dropped_on is null or e.dropped_on >= s.session_date))))
   where a.student_id is not null or a.new_dancer_key is not null;

  -- ------------------------------------------------------------- rule 3
  --
  -- A drop keeps an earlier end already on the row: moving it later would put
  -- the dancer back on past rosters. Only a missing or later end becomes the
  -- day before the import.

  create temp table _ei_drop on commit drop as
  select e.id as enrollment_id, e.student_id, e.class_id, e.enrolled_on, s.household_id,
         least(coalesce(e.dropped_on, v_drop_day), v_drop_day)            as new_dropped_on,
         (e.dropped_on is null or e.dropped_on > v_drop_day)              as moves_end,
         null::text as hold,
         null::date as hold_on
    from public.portal_enrollment_import_tags b
    join _ei_family f on f.household_id = b.household_id and not f.first_seen
    join public.portal_students s on s.household_id = b.household_id
    join public.portal_enrollments e on e.student_id = s.id and e.class_id = b.class_id
   where e.status = 'active'
     and not exists (select 1 from _ei_family_tag ft
                      where ft.household_id = b.household_id and ft.class_id = b.class_id);

  -- A drop that cannot be written safely is held for a person — that place,
  -- not the whole file (v69) — and its tag stays remembered, so the next sync
  -- looks at it again:
  --   several_active_places  which of the places ends is ambiguous;
  --   starts_after_drop_day  the place has not begun, so it cannot end the day
  --                          before this sync;
  --   marked_after_drop_day  a teacher has marked them since, and ending the
  --                          place as of yesterday would orphan that mark.
  update _ei_drop d set hold = 'several_active_places'
   where (select count(*) from public.portal_enrollments e
           where e.student_id = d.student_id and e.class_id = d.class_id and e.status = 'active') <> 1;

  update _ei_drop d set hold = 'starts_after_drop_day', hold_on = d.enrolled_on
   where d.hold is null and d.moves_end and d.enrolled_on > v_drop_day;

  update _ei_drop d
     set hold    = 'marked_after_drop_day',
         hold_on = (select max(s.session_date)
                      from public.portal_attendance a
                      join public.portal_class_sessions s on s.id = a.session_id
                     where a.student_id = d.student_id and a.class_id = d.class_id and s.session_date > v_drop_day)
   where d.hold is null and d.moves_end
     and exists (select 1 from public.portal_attendance a
                   join public.portal_class_sessions s on s.id = a.session_id
                  where a.student_id = d.student_id and a.class_id = d.class_id and s.session_date > v_drop_day);

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

  -- A first run only records: nothing is added, dropped or decided, so none of
  -- it is offered — a list of places under "nothing will change" is a list
  -- somebody will act on. Only a broken file or an ambiguous class still stops
  -- the recording.
  if v_first then
    delete from _ei_assign;
    delete from _ei_drop;
  end if;

  -- A large drop is usually a damaged or filtered export, so it has to be
  -- confirmed: 20 or more, or 5 or more that are at least a tenth of the
  -- places the families in this file hold.
  select count(*) into v_drops from _ei_drop where hold is null;
  select count(*) into v_places
    from public.portal_enrollments e
    join public.portal_students s on s.id = e.student_id
    join _ei_family f on f.household_id = s.household_id
   where e.status = 'active';
  v_confirm := v_drops >= 20 or (v_drops >= 5 and v_drops * 10 >= v_places);

  -- A large addition is as likely a wrong export — every contact instead of
  -- Current Families creates each past family again — so 20 or more places,
  -- or 10 or more new families, must be confirmed too (v69).
  select count(*) into v_adds
    from _ei_assign a
   where (a.student_id is not null or a.new_dancer_key is not null) and a.conflict is null;
  select count(*) into v_new_fams from _ei_newfam nf where nf.problem is null;
  v_confirm_adds := not v_first and (v_adds >= 20 or v_new_fams >= 10);

  -- ----------------------------------------------- what apply would remember
  --
  -- A family seen before: everything tagged now, minus the new tags nobody
  -- could take (so they come back), plus the gone tags whose drop is held (so
  -- that comes back too). A family seen for the first time: all of it, acted
  -- on by nobody. A new family: the tags that became places.

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
   where a.new_dancer_key is not null and a.conflict is null
  union all
  select distinct d.household_id, null::text, d.class_id
    from _ei_drop d
   where d.hold is not null;

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
                from _ei_drop d where d.hold is null), ''),
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
    'confirm_adds',  v_confirm_adds,

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
        join public.portal_classes k on k.id = d.class_id
       where d.hold is null), '[]'::jsonb),

    'held_drops', coalesce((
      select jsonb_agg(jsonb_build_object(
               'student_id',   x.student_id,
               'student_name', btrim(s.first_name || ' ' || s.last_name),
               'family',       h.display_name,
               'class_id',     k.id,
               'class_name',   k.name,
               'day_of_week',  k.day_of_week,
               'start_time',   k.start_time,
               'reason',       x.hold,
               'on',           x.hold_on)
             order by k.name, k.day_of_week, k.start_time, s.first_name, s.last_name)
        from (select distinct d.student_id, d.class_id, d.household_id, d.hold, d.hold_on
                from _ei_drop d where d.hold is not null) x
        join public.portal_students s on s.id = x.student_id
        join public.portal_households h on h.id = x.household_id
        join public.portal_classes k on k.id = x.class_id), '[]'::jsonb),

    -- Every place the sync could drop in the class has lost its tag at once:
    -- far more often a class renamed in Enrolio before the class list was
    -- re-imported than a class that ended. Only places the sync could drop
    -- count — a family in the file, seen before, tagged for the class at the
    -- last sync — so a place added by hand without a tag cannot silence it.
    -- It needs two families losing the tag at once: from one family, a rename
    -- cannot be told from an ordinary leaver (stale class tags are too common
    -- to be a sign), so a class only one family in the file is tagged for is
    -- never called out (v69).
    'whole_class_drops', coalesce((
      select jsonb_agg(jsonb_build_object(
               'class_id', k.id, 'class_name', k.name, 'day_of_week', k.day_of_week,
               'start_time', k.start_time, 'dropping', x.dropping, 'held', x.held, 'families', x.families)
             order by k.name, k.day_of_week, k.start_time)
        from (select d.class_id,
                     count(distinct d.student_id) filter (where d.hold is null)::int     as dropping,
                     count(distinct d.student_id) filter (where d.hold is not null)::int as held,
                     count(distinct d.household_id)::int                                 as families,
                     count(*)::int                                                        as places
                from _ei_drop d
               group by d.class_id) x
        join public.portal_classes k on k.id = x.class_id
       where x.places = (select count(*) from public.portal_enrollments e
                           join public.portal_students s on s.id = e.student_id
                           join _ei_family f on f.household_id = s.household_id and not f.first_seen
                           join public.portal_enrollment_import_tags b
                             on b.household_id = s.household_id and b.class_id = e.class_id
                          where e.class_id = x.class_id and e.status = 'active')
         and x.families >= 2
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
                 (select jsonb_agg(jsonb_build_object('name', u.name, 'likely', u.likely) order by u.name)
                    from _ei_unknown u
                   where a.household_id is not null and u.household_id = a.household_id),
                 '[]'::jsonb),
               'inactive_names', coalesce(
                 (select jsonb_agg(jsonb_build_object('name', i.name, 'dancer', i.dancer) order by i.name)
                    from _ei_inactive i
                   where a.household_id is not null and i.household_id = a.household_id),
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

    -- Names in All Students taken for a dancer the app spells differently.
    'spelling_matches', coalesce((
      select jsonb_agg(jsonb_build_object('family', h.display_name, 'export_name', p.export_name, 'dancer', p.dancer)
             order by h.display_name, p.export_name)
        from _ei_spelling p
        join public.portal_households h on h.id = p.household_id), '[]'::jsonb),

    'memory_changes', jsonb_build_object(
      'added', (select count(*) from _ei_base x
                 where x.household_id is null
                    or not exists (select 1 from public.portal_enrollment_import_tags b
                                    where b.household_id = x.household_id and b.class_id = x.class_id)),
      'removed', (select count(*) from public.portal_enrollment_import_tags b
                   join _ei_family f on f.household_id = b.household_id
                  where not exists (select 1 from _ei_base x
                                     where x.household_id = b.household_id and x.class_id = b.class_id)),
      -- A family seen for the first time is marked seen by apply, even with no
      -- tag to remember; left unsaved, its next real class looks old (v69).
      'families_seen', (select count(*) from _ei_family f where f.first_seen)),

    'baseline_counts', jsonb_build_object(
      'families', (select count(*) from _ei_family),
      'tags',     (select count(*) from _ei_family_tag))
  );

  v_result := v_result || jsonb_build_object('counts', jsonb_build_object(
    'contacts',             (select count(*) from _ei_contact),
    'families',             (select count(*) from _ei_family),
    'adds',                 jsonb_array_length(v_result->'adds'),
    'drops',                jsonb_array_length(v_result->'drops'),
    'held_drops',           jsonb_array_length(v_result->'held_drops'),
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
    'spelling_matches',     jsonb_array_length(v_result->'spelling_matches'),
    'memory_changes',       (v_result->'memory_changes'->>'added')::int + (v_result->'memory_changes'->>'removed')::int
                              + (v_result->'memory_changes'->>'families_seen')::int,
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
        'More than one class has the Enrolio title "%s", so its tag cannot be told apart — keep exactly one of them switched on. Nothing was changed.',
        v_block.detail)
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
  if (v_confirm or v_confirm_adds) and not coalesce(p_confirm, false) then
    raise exception 'This sync %. Tick the confirmation in the preview, then apply. Nothing was changed.',
      regexp_replace(concat_ws(', ',
        case when v_confirm then format('drops %s places', v_drops) end,
        case when v_confirm_adds and v_adds > 0
             then format('adds %s %s', v_adds, case when v_adds = 1 then 'place' else 'places' end) end,
        case when v_confirm_adds and v_new_fams > 0
             then format('creates %s new %s', v_new_fams, case when v_new_fams = 1 then 'family' else 'families' end) end),
        ', ([^,]*)$', ' and \1');
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

  -- v74: and the sign-up roster row each new dancer's family needs. Sign-up
  -- admits an address only if it is on portal_roster, so a family created here
  -- without one was in the app and could not make an account. One guardian row
  -- per dancer, the shape admin_roster_import writes, keyed on the name as the
  -- sync wrote it: a later roster import naming that dancer the same way finds
  -- the row instead of adding a second. An address that is already a dancer's
  -- own login is never made a guardian's.
  insert into public.portal_roster (email, student_name, guardian_name, member_type, status)
  select nf.email,
         nd.first_name || ' ' || nd.last_name,
         nullif(btrim(concat_ws(' ', nf.first_name, nf.last_name)), ''),
         'guardian', 'active'
    from _ei_newdancer nd
    join _ei_newfam nf on nf.ord = nd.ord
   where nf.problem is null
     and not exists (select 1 from public.portal_roster r
                      where lower(r.email) = nf.email
                        and r.member_type = 'student' and r.status = 'active')
  on conflict do nothing;
  get diagnostics v_roster_rows = row_count;

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
     and d.hold is null
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
      'held_drops',       v_result->'counts'->'held_drops',
      'families_created', v_result->'counts'->'new_families',
      'dancers_created',  v_result->'counts'->'new_dancers',
      'unassigned',       v_result->'counts'->'unassigned',
      'conflicts',        v_result->'counts'->'conflicts',
      'first_seen',       v_result->'counts'->'first_seen_families',
      'memory_changes',   v_result->'counts'->'memory_changes',
      'attendance_rows',  v_after->'attendance'->'rows',
      'roster_rows',      v_roster_rows),
    'success');

  return v_result || jsonb_build_object(
    'applied', true,
    'roster_rows', v_roster_rows,
    'fingerprint', jsonb_build_object('before', v_before, 'after', v_after));
end;
$fn$;

revoke execute on function public.admin_enrollment_import(jsonb, text, text, text, boolean) from public, anon;
grant execute on function public.admin_enrollment_import(jsonb, text, text, text, boolean) to authenticated, service_role;

-- =============================================================================
-- VERIFY
--
--   -- Still one importer, five arguments:
--   select pg_get_function_identity_arguments(oid) from pg_proc
--    where proname = 'admin_enrollment_import';
--
--   -- After the next applied sync that creates a family: no household with
--   -- dancers lacks a sign-up row.
--   select count(*) from portal_households h
--    where exists (select 1 from portal_students s where s.household_id = h.id)
--      and not exists (select 1 from portal_roster r where lower(r.email) = lower(h.primary_email));
--
-- ROLLBACK
--
--   Re-run section 2 of supabase-migration-v69-enrollment-import-second-review.sql
--   (from "create or replace function public.admin_enrollment_import(" to its
--   grant). Roster rows already written stay; they are what signup needs.
-- =============================================================================
