-- =============================================================================
-- Migration v67 — syncing class rosters from the Enrolio contacts export
--
-- APPLIED to SOP-APP (sgppeenmvskwztaszkgn) on 2026-09-24 as
-- 20260924193821 v67_enrollment_import. The starting point was recorded the
-- same day from the 24 Sep export the hand sync used: 1,110 class tags across
-- 286 families, with no roster, attendance or household row changed; the same
-- file then previewed with nothing to add, drop, block or decide.
--
-- CORRECTED BY v68, after an independent review found a duplicate-family bug
-- and several gaps in what follows. Read v68's header before relying on any
-- claim here; v68 replaces the function and clears this starting point so it
-- can be recorded again with the families it was missing.
-- =============================================================================
--
-- WHY
--
-- Classes have an importer (v50) and families have one (v49). Enrolments had
-- none: the rosters were seeded by hand on 2026-09-02 and brought up to date by
-- hand-written SQL on 2026-09-11 and again on 2026-09-24. This is that second
-- job as a feature, run from Portal Manager: upload the "Export Contacts —
-- Current Families" CSV, read the diff, apply it.
--
-- THE EXPORT
--
-- One row per Enrolio contact. `Contact Id` is portal_households
-- .external_account_id. `Tags` is a comma list, and a class tag is the Enrolio
-- class title — which v50 stores, lower-cased, as portal_classes
-- .external_class_id. Everything else in Tags ('current family', 'enrolled',
-- 'trial', and titles from older schedules that match no class) is ignored.
-- `All Students` names the family's dancers, when it is filled in.
--
-- THE RULES, AS THE STUDIO CONFIRMED THEM ON 2026-09-24
--
--   1. A contact is matched to a household by external_account_id, then email.
--      Two contacts that land on one household are one family: their tags are
--      combined. (One family in the 24 Sep file has thirteen class tags on one
--      parent's record and none on the other's; read separately, the second
--      record would have dropped all thirteen.)
--   2. Tags belong to the FAMILY, not to a dancer. With one dancer, a new tag is
--      theirs. With several, it goes to a sibling only when the class's
--      age_min_years..age_max_years admits exactly one of them, by age on the
--      import date. Anything else is listed for a human. Level names ("Mini",
--      "Teen") are never used to guess.
--   3. A dancer's class whose tag is gone from the family is DROPPED, with
--      dropped_on the day before the import. Nothing is ever deleted.
--   4. A new enrolment starts ON the import date.
--   5. A class tag counts whether or not the family also has 'enrolled'.
--   6. A family in the app but missing from the export is reported, never
--      dropped.
--   7. A contact with no household becomes one, with its dancers from All
--      Students — first/last split on the last space and NO date of birth, which
--      is exactly what admin_roster_import's name fallback looks for when it
--      later arrives with one (v49: household by email, then first+last with
--      the birthday ignored). Two contacts on one new email, and contacts that
--      name no dancer, are reported rather than guessed at.
--
-- "NEW" AND "GONE" ARE MEASURED AGAINST THE LAST SYNC, NOT AGAINST THE ROSTER
--
-- The rules say "a newly tagged class" and "a tag that is gone", and both mean
-- relative to the export the rosters were last brought up to date with. That is
-- how the 24 Sep sync was done, and it is not a nicety. Measured against the
-- rosters instead, the same 24 Sep file proposes 47 places the hand sync did not
-- make. 45 are tags that have sat on the family since the 1 Sep export, and for
-- 44 of those Enrolio's own per-dancer students export shows nobody in the
-- family taking the class (the 45th dancer is missing from that export). Tags
-- are added when a family joins a class and are not reliably removed when they
-- leave it.
--
-- So portal_enrollment_import_tags remembers, per household, the class tags it
-- carried at the last applied import:
--
--   newly tagged = tagged now, not remembered, and held by no dancer in the
--                  family                                  -> rule 2
--   gone         = remembered, not tagged now              -> rule 3, for any
--                  active enrolment in that class
--   unchanged    = remembered and tagged                   -> nothing, ever
--
-- Replaying the 24 Sep sync through these rules, from the rosters as they stood
-- that morning with the 1 Sep export as the memory, reproduces all 20 of its
-- enrolments and 40 of its 48 drops with nothing extra dropped. The eight it
-- does not reproduce were judgement calls outside the rules: four dancers
-- dropped while the family still carries the tag, three drops for families not
-- in the export at all (rule 6 now forbids those), and one tag that came and
-- went between two exports. It would also have enrolled two dancers the hand
-- sync did not: tags that first appeared in the 24 Sep file, which the rules do
-- assign.
--
-- A tag that is listed for a human — no sibling fits, several do, a dancer with
-- no birthday, a dancer the unique key will not take again — is NOT remembered,
-- so it comes back on every preview until something resolves it.
--
-- THE FIRST RUN
--
-- With nothing remembered, every tag looks new. Apply therefore refuses until a
-- starting point is recorded (mode 'baseline'): the export the rosters were
-- last brought up to date with — for this studio, the 24 Sep file the hand sync
-- used — recorded as-is, with no roster changes. Baseline refuses once
-- anything is remembered, so it cannot later be used to skip a sync.
--
-- WHAT IT WRITES, AND WHAT IT NEVER TOUCHES
--
-- Writes: portal_enrollments (insert; status/dropped_on on a drop),
-- portal_households and portal_students (rule 7 only), this migration's tag
-- memory, and one activity_logs row per apply — logged in the same transaction,
-- so a logged import is an applied one.
--
-- Never: portal_attendance, portal_class_sessions, portal_attendance_history.
-- Past rosters must not move, and they cannot: a roster for a date is
-- `enrolled_on <= date AND (dropped_on IS NULL OR dropped_on >= date)`, new
-- enrolments start today and drops end yesterday. Apply does not take that on
-- trust. It fingerprints all three tables and every roster of every session
-- before today (portal_attendance_fingerprint, below), before and after its
-- writes, in the same transaction, and raises if any of them moved.
--
-- ALL OR NOTHING
--
-- Preview returns the diff and a hash of everything apply would write. Apply
-- recomputes both under an advisory lock, and refuses if the hash differs (the
-- rosters, the class list or the date changed since the preview) or if any
-- guard trips:
--
--   * each drop matches exactly one active enrolment;
--   * no attendance mark falls after a new dropped_on — a dancer marked in
--     today's class cannot be dropped as of yesterday, so that sync waits a day;
--   * no attendance mark falls before a new enrolled_on;
--   * no two classes share a title, which would make one tag two classes.
--
-- The preview lists anything that would trip a guard, so apply is not offered
-- blind. It still re-checks: a teacher can mark a class between the two calls.
-- =============================================================================

-- --------------------------------------------------------- 1. the tag memory

create table if not exists public.portal_enrollment_import_tags (
  household_id uuid not null references public.portal_households(id) on delete cascade,
  class_id     uuid not null references public.portal_classes(id) on delete cascade,
  recorded_on  date not null,
  primary key (household_id, class_id)
);

comment on table public.portal_enrollment_import_tags is
  'The class tags each family carried in the contacts export at the last applied roster sync '
  '(admin_enrollment_import). A sync acts on tags that appeared or disappeared since; see v67.';

-- Deny-all, like the attendance tables: only the SECURITY DEFINER function
-- below reads or writes it.
alter table public.portal_enrollment_import_tags enable row level security;
revoke all on public.portal_enrollment_import_tags from anon, authenticated;

-- ------------------------------------------------- 2. matching a tag to a class
--
-- One normalisation for both sides of the join. The export HTML-escapes its
-- tags ("turns &amp; jumps") and v50 stores the title as it came; comparing
-- anything less forgiving would make a class's tag vanish from every family,
-- and a vanished tag is a drop.

create or replace function public.portal_enrollment_tag_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(regexp_replace(
    replace(replace(replace(replace(replace(replace(coalesce(p, ''),
      '&quot;', '"'), '&#39;', ''''), '&#039;', ''''), '&lt;', '<'), '&gt;', '>'), '&amp;', '&'),
    '\s+', ' ', 'g')));
$$;

revoke all on function public.portal_enrollment_tag_key(text) from public, anon, authenticated;

-- ------------------------------------------ 3. what must not move, as one value
--
-- Row count and an md5 over every column of every row, for attendance, sessions
-- and attendance history, and the same for the roster of every session dated
-- before p_before. The import calls it either side of its writes; it is also the
-- verification query (see VERIFY at the bottom).

create or replace function public.portal_attendance_fingerprint(p_before date)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'attendance', (
      select jsonb_build_object('rows', count(*),
                                'md5', md5(coalesce(string_agg(a::text, ',' order by a.id), '')))
        from public.portal_attendance a),
    'sessions', (
      select jsonb_build_object('rows', count(*),
                                'md5', md5(coalesce(string_agg(s::text, ',' order by s.id), '')))
        from public.portal_class_sessions s),
    'history', (
      select jsonb_build_object('rows', count(*),
                                'md5', md5(coalesce(string_agg(h::text, ',' order by h.id), '')))
        from public.portal_attendance_history h),
    'past_rosters', (
      select jsonb_build_object('rows', count(*),
                                'before', p_before,
                                'md5', md5(coalesce(string_agg(r.session_id::text || ':' || r.student_id::text, ','
                                                               order by r.session_id, r.student_id), '')))
        from (
          select s.id as session_id, e.student_id
            from public.portal_class_sessions s
            join public.portal_enrollments e
              on e.class_id = s.class_id
             and e.enrolled_on <= s.session_date
             and (e.dropped_on is null or e.dropped_on >= s.session_date)
           where s.session_date < p_before
        ) r)
  );
$$;

revoke all on function public.portal_attendance_fingerprint(date) from public, anon, authenticated;
grant execute on function public.portal_attendance_fingerprint(date) to service_role;

-- ------------------------------------------------------------------- 4. the RPC
--
-- p_contacts: one object per export row, as src/lib/enrollmentImport.ts builds
--   it — { row, contact_id, email, first_name, last_name, tags[], students[] }.
--   Validated here again; the parser is not trusted.
-- p_mode: 'preview' (no writes), 'apply', or 'baseline' (first run only).
-- p_expect: the plan_hash (apply) or baseline_hash (baseline) the preview gave.
--
-- search_path is public only; the working tables are pg_temp, which Postgres
-- searches first for relations, and every real table below is schema-qualified
-- so nothing a session creates can stand in for one.

create or replace function public.admin_enrollment_import(
  p_contacts jsonb,
  p_mode     text default 'preview',
  p_expect   text default null,
  p_filename text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_as_of     date;
  v_drop_day  date;
  v_first     boolean;
  v_plan_hash text;
  v_base_hash text;
  v_result    jsonb;
  v_before    jsonb;
  v_after     jsonb;
  v_count     int;
  v_block     record;
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
    -- One sync at a time. A second one waits here, then recomputes against
    -- what the first wrote and finds its preview stale.
    perform pg_advisory_xact_lock(hashtext('public.admin_enrollment_import'));
  end if;

  v_as_of    := public.studio_today();
  v_drop_day := v_as_of - 1;
  v_first    := not exists (select 1 from public.portal_enrollment_import_tags);

  drop table if exists pg_temp._ei_contact, pg_temp._ei_tag, pg_temp._ei_class,
    pg_temp._ei_family, pg_temp._ei_family_tag, pg_temp._ei_name, pg_temp._ei_dancer,
    pg_temp._ei_held, pg_temp._ei_fstat, pg_temp._ei_assign, pg_temp._ei_newfam,
    pg_temp._ei_newdancer, pg_temp._ei_drop, pg_temp._ei_block, pg_temp._ei_base;

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

  create temp table _ei_tag on commit drop as
  select distinct c.ord, c.household_id, public.portal_enrollment_tag_key(e.v) as tag
    from _ei_contact c
    cross join lateral jsonb_array_elements_text(c.tags) as e(v);
  delete from _ei_tag where tag = '';

  create temp table _ei_class on commit drop as
  select k.id as class_id, public.portal_enrollment_tag_key(k.external_class_id) as tag_key
    from public.portal_classes k
   where k.external_class_id is not null
     and public.portal_enrollment_tag_key(k.external_class_id) <> '';

  -- All Students: entities decoded, Enrolio's stray trailing asterisk dropped,
  -- whitespace collapsed. Used to count a family's dancers and, for a new
  -- family, to name them.
  create temp table _ei_name on commit drop as
  select distinct c.ord, c.household_id,
         btrim(regexp_replace(regexp_replace(
           replace(replace(replace(replace(e.v, '&#39;', ''''), '&#039;', ''''), '&quot;', '"'), '&amp;', '&'),
           '\*+\s*$', ''), '\s+', ' ', 'g')) as name
    from _ei_contact c
    cross join lateral jsonb_array_elements_text(c.students) as e(v);
  delete from _ei_name where name is null or name = '';

  -- ------------------------------------------------ the families it knows

  create temp table _ei_family on commit drop as
  select c.household_id, count(*)::int as contacts
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
         s.date_of_birth,
         case when s.date_of_birth is not null
              then extract(year from age(v_as_of::timestamp, s.date_of_birth::timestamp))::int end as age
    from public.portal_students s
    join _ei_family f on f.household_id = s.household_id
   where s.status = 'active';

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
         (select count(distinct lower(n.name)) from _ei_name n
           where n.household_id = f.household_id)::int                                 as named
    from _ei_family f;

  -- ----------------------------------------------- rule 2, existing families
  --
  -- More names in All Students than dancers in the app means a dancer the app
  -- has not met — a new sibling — so even a one-dancer family is not treated as
  -- one. (Fewer names is normal: the column is often incomplete.)

  create temp table _ei_assign on commit drop as
  select nt.household_id,
         null::int  as ord,
         nt.class_id,
         case
           when fs.dancers = 0 or fs.named > fs.dancers then null
           when fs.dancers = 1 then (select d.student_id from _ei_dancer d where d.household_id = nt.household_id)
           when fs.no_birthday > 0 then null
           when fit.fits = 1 then fit.only_one
         end        as student_id,
         null::text as new_dancer_key,
         case
           when fs.dancers = 0          then 'no_dancers'
           when fs.named > fs.dancers   then 'export_lists_more_dancers'
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
           when exists (select 1 from _ei_contact o
                         where o.household_id is null and o.ord <> c.ord
                           and (o.email = c.email
                                or (c.contact_id is not null and o.contact_id = c.contact_id))) then 'duplicate_contact'
           when not exists (select 1 from _ei_name n where n.ord = c.ord) then 'no_dancer_name'
           -- Split on the last space, as admin_roster_import does. A single
           -- word has no surname to split off, and inventing one would key the
           -- dancer where the roster import will never find them.
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

  -- The unique key is (student, class, season): a dancer dropped from a class
  -- cannot be enrolled in it again as a second row. Reopening the old row would
  -- put them back on every roster in between, so it is listed instead.
  update _ei_assign a
     set conflict    = coalesce(
                         (select 'already_' || e.status from public.portal_enrollments e
                           where e.student_id = a.student_id and e.class_id = a.class_id
                           order by e.enrolled_on desc limit 1),
                         (select 'class_has_no_season' from public.portal_classes k
                           where k.id = a.class_id and k.season is null)),
         conflict_on = (select e.dropped_on from public.portal_enrollments e
                         where e.student_id = a.student_id and e.class_id = a.class_id
                         order by e.enrolled_on desc limit 1)
   where a.student_id is not null or a.new_dancer_key is not null;

  -- ------------------------------------------------------------- rule 3

  create temp table _ei_drop on commit drop as
  select e.id as enrollment_id, e.student_id, e.class_id, e.enrolled_on, s.household_id
    from public.portal_enrollment_import_tags b
    join _ei_family f on f.household_id = b.household_id
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

  insert into _ei_block (kind, reason, detail)
  select 'class', 'duplicate_class_title', min(k.tag_key)
    from _ei_class k
   group by k.tag_key
  having count(*) > 1;

  insert into _ei_block (kind, reason, student_id, class_id)
  select distinct 'drop', 'several_active_enrollments', d.student_id, d.class_id
    from _ei_drop d
   where (select count(*) from public.portal_enrollments e
           where e.student_id = d.student_id and e.class_id = d.class_id and e.status = 'active') <> 1;

  insert into _ei_block (kind, reason, student_id, class_id, on_date)
  select 'drop', 'enrolled_after_drop_day', d.student_id, d.class_id, d.enrolled_on
    from _ei_drop d
   where d.enrolled_on > v_drop_day;

  insert into _ei_block (kind, reason, student_id, class_id, on_date)
  select 'drop', 'marked_after_drop_day', d.student_id, d.class_id, max(s.session_date)
    from _ei_drop d
    join public.portal_attendance a on a.student_id = d.student_id and a.class_id = d.class_id
    join public.portal_class_sessions s on s.id = a.session_id
   where s.session_date > v_drop_day
   group by d.student_id, d.class_id;

  insert into _ei_block (kind, reason, student_id, class_id, on_date)
  select 'add', 'marked_before_enrolled_on', a2.student_id, a2.class_id, max(s.session_date)
    from _ei_assign a2
    join public.portal_attendance a on a.student_id = a2.student_id and a.class_id = a2.class_id
    join public.portal_class_sessions s on s.id = a.session_id
   where a2.student_id is not null and a2.conflict is null
     and s.session_date < v_as_of
   group by a2.student_id, a2.class_id;

  -- ----------------------------------------------- what apply would remember
  --
  -- Everything tagged now, minus the new tags nobody could take. Tags that are
  -- gone fall out by not being here.

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
  -- Over everything apply would write, and the date it would write it with.
  -- Each section keeps its place when empty, so two different plans cannot
  -- run together into one string.

  v_plan_hash := md5(concat_ws('#', 'apply', v_as_of::text,
    coalesce((select string_agg(coalesce(a.student_id::text, a.new_dancer_key) || '>' || a.class_id::text, ','
                                order by coalesce(a.student_id::text, a.new_dancer_key), a.class_id::text)
                from _ei_assign a
               where (a.student_id is not null or a.new_dancer_key is not null) and a.conflict is null), ''),
    coalesce((select string_agg(d.enrollment_id::text, ',' order by d.enrollment_id::text) from _ei_drop d), ''),
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
                join _ei_family f on f.household_id = b.household_id), '')));

  v_base_hash := md5(concat_ws('#', 'baseline', v_as_of::text,
    coalesce((select string_agg(ft.household_id::text || '>' || ft.class_id::text, ','
                                order by ft.household_id::text, ft.class_id::text)
                from _ei_family_tag ft), '')));

  -- ------------------------------------------------------------- the diff

  v_result := jsonb_build_object(
    'mode',         p_mode,
    'filename',     p_filename,
    'as_of',        v_as_of,
    'drop_day',     v_drop_day,
    'first_import', v_first,
    -- From the log this function writes, in the same transaction as the sync
    -- it describes. The screen compares it with the newest activity in the file
    -- to catch last week's export being picked by mistake: applied, an older
    -- file drops everyone who joined a class since.
    'last_sync_on', (
      select max((l.details->>'as_of')::date)
        from public.activity_logs l
       where l.action in ('enrollments_imported', 'enrollment_import_baseline')
         and l.result = 'success'
         and l.details->>'as_of' ~ '^\d{4}-\d{2}-\d{2}$'),
    'plan_hash',    v_plan_hash,
    'baseline_hash', v_base_hash,

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
               'enrollment_id', d.enrollment_id,
               'student_id',    d.student_id,
               'student_name',  btrim(s.first_name || ' ' || s.last_name),
               'household_id',  d.household_id,
               'family',        h.display_name,
               'email',         h.primary_email,
               'class_id',      k.id,
               'class_name',    k.name,
               'day_of_week',   k.day_of_week,
               'start_time',    k.start_time,
               'enrolled_on',   d.enrolled_on)
             order by k.name, k.day_of_week, k.start_time, s.first_name, s.last_name)
        from _ei_drop d
        join public.portal_students s on s.id = d.student_id
        join public.portal_households h on h.id = d.household_id
        join public.portal_classes k on k.id = d.class_id), '[]'::jsonb),

    -- A class losing every dancer at once is far more often a class renamed in
    -- Enrolio before the class list was re-imported than a class that ended:
    -- the old title vanishes from every family together.
    'whole_class_drops', coalesce((
      select jsonb_agg(jsonb_build_object(
               'class_id', k.id, 'class_name', k.name, 'day_of_week', k.day_of_week,
               'start_time', k.start_time, 'dropping', x.dropping)
             order by k.name, k.day_of_week, k.start_time)
        from (select d.class_id, count(*)::int as dropping from _ei_drop d group by d.class_id) x
        join public.portal_classes k on k.id = x.class_id
       where x.dropping = (select count(*) from public.portal_enrollments e
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
               'dropped_on',   a.conflict_on)
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
        ) x), '[]'::jsonb)
  );

  v_result := v_result || jsonb_build_object('counts', jsonb_build_object(
    'contacts',         (select count(*) from _ei_contact),
    'families',         (select count(*) from _ei_family),
    'adds',             jsonb_array_length(v_result->'adds'),
    'drops',            jsonb_array_length(v_result->'drops'),
    'unassigned',       jsonb_array_length(v_result->'unassigned'),
    'conflicts',        jsonb_array_length(v_result->'conflicts'),
    'blocked',          jsonb_array_length(v_result->'blocked'),
    'new_families',     jsonb_array_length(v_result->'new_families'),
    'new_dancers',      (select count(*) from _ei_newdancer),
    'not_imported',     jsonb_array_length(v_result->'not_imported'),
    'merged_contacts',  jsonb_array_length(v_result->'merged_contacts'),
    'missing_families', jsonb_array_length(v_result->'missing_families'),
    'unmatched_class_tags',
      (select count(*) from jsonb_array_elements(v_result->'unmatched_tags') u
        where (u->>'looks_like_class')::boolean)
  ));

  if p_mode = 'preview' then
    return v_result;
  end if;

  -- ------------------------------------------------ baseline (first run)

  if p_mode = 'baseline' then
    if not v_first then
      raise exception 'A starting point is already recorded. Preview the file and apply it instead.';
    end if;
    if p_expect <> v_base_hash then
      raise exception 'The class list or the date has changed since this preview. Preview the file again.';
    end if;

    insert into public.portal_enrollment_import_tags (household_id, class_id, recorded_on)
    select ft.household_id, ft.class_id, v_as_of from _ei_family_tag ft;
    get diagnostics v_count = row_count;

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

  select b.*, btrim(s.first_name || ' ' || s.last_name) as student_name, k.name as class_name
    into v_block
    from _ei_block b
    left join public.portal_students s on s.id = b.student_id
    left join public.portal_classes k on k.id = b.class_id
   order by b.kind, b.reason
   limit 1;
  if found then
    raise exception '%', case v_block.reason
      when 'marked_after_drop_day' then format(
        '%s has an attendance mark in %s on %s, after the day they would be dropped (%s). Nothing was changed — sync again tomorrow.',
        v_block.student_name, v_block.class_name, v_block.on_date, v_drop_day)
      when 'enrolled_after_drop_day' then format(
        '%s only joined %s on %s, so cannot be dropped as of %s. Nothing was changed — sync again tomorrow.',
        v_block.student_name, v_block.class_name, v_block.on_date, v_drop_day)
      when 'marked_before_enrolled_on' then format(
        '%s already has an attendance mark in %s on %s, before they would join it. Nothing was changed.',
        v_block.student_name, v_block.class_name, v_block.on_date)
      when 'several_active_enrollments' then format(
        '%s holds more than one active place in %s, so the drop is ambiguous. Nothing was changed.',
        v_block.student_name, v_block.class_name)
      when 'duplicate_class_title' then format(
        'Two classes share the Enrolio title "%s", so its tag cannot be told apart. Nothing was changed.',
        v_block.detail)
      else 'Something in this file blocks the sync. Nothing was changed.'
    end;
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
     set status = 'dropped', dropped_on = v_drop_day
    from _ei_drop d
   where e.id = d.enrollment_id
     and e.status = 'active';
  get diagnostics v_count = row_count;
  if v_count <> (select count(*) from _ei_drop) then
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

  v_after := public.portal_attendance_fingerprint(v_as_of);
  if v_after is distinct from v_before then
    raise exception 'Stopped: attendance or a past roster would have changed. Nothing was saved.';
  end if;

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
      'attendance_rows',  v_after->'attendance'->'rows'),
    'success');

  return v_result || jsonb_build_object(
    'applied', true,
    'fingerprint', jsonb_build_object('before', v_before, 'after', v_after));
end;
$fn$;

revoke execute on function public.admin_enrollment_import(jsonb, text, text, text) from public, anon;
grant execute on function public.admin_enrollment_import(jsonb, text, text, text) to authenticated, service_role;

-- =============================================================================
-- VERIFY
--
--   -- 1. Nobody but the function can see the memory:
--   select relrowsecurity from pg_class where oid = 'public.portal_enrollment_import_tags'::regclass;  -- true
--   select count(*) from pg_policies where tablename = 'portal_enrollment_import_tags';               -- 0
--
--   -- 2. Attendance and past rosters unchanged by an apply. Take the value
--   --    before, apply from Portal Manager, take it again; the two must be
--   --    identical. (Apply also does this itself, in its own transaction.)
--   select public.portal_attendance_fingerprint(public.studio_today());
--
--   -- 3. Every enrolment an apply wrote starts on its day and every drop ends
--   --    the day before; nothing else moved:
--   select enrolled_on, dropped_on, status, count(*) from public.portal_enrollments
--    group by 1, 2, 3 order by 1 desc, 2 desc nulls last;
--
-- ROLLBACK
--
--   drop function if exists public.admin_enrollment_import(jsonb, text, text, text);
--   drop function if exists public.portal_attendance_fingerprint(date);
--   drop function if exists public.portal_enrollment_tag_key(text);
--   drop table if exists public.portal_enrollment_import_tags;
--
--   That removes the importer, not what it did: enrolments, households and
--   dancers it wrote are ordinary rows. Undo an apply by hand if ever needed —
--   status back to 'active' and dropped_on null for its drops (they carry the
--   day before the import), and its enrolments are the ones with enrolled_on
--   on the import day. The activity log row says which day that was.
-- =============================================================================
