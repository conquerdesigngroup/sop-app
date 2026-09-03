-- =============================================================================
-- Migration v33 — attendance core: households, students, enrollments, sessions
-- =============================================================================
--
-- ATTENDANCE-PROFILE-BUILD.md Workstream 1. The profile cards (v32 branch) have
-- been running against an in-repo fixture; this is the schema they were shaped
-- against, so switching them on is a flag, not a rewrite.
--
-- THE RULE THAT MAKES CLASS MATCHING SAFE
--
-- Enrolio is the source of truth and may never expose a stable class ID, so
-- classes have to be matched on name + day + time. That matching is fallible,
-- which is exactly why attendance must never point at it:
--
--   portal_attendance references portal_classes.id, the stable UUID. The match
--   key only ever decides WHICH uuid an incoming CSV row belongs to. Renaming
--   or rescheduling a class changes its match key and leaves every attendance
--   row untouched.
--
-- THE DENOMINATOR IS THE WHOLE FEATURE
--
-- A percentage is a fraction and every way this can be unfair lives in the
-- denominator. portal_attendance_summary subtracts, in order: sessions the
-- studio cancelled, sessions before the child enrolled, sessions after they
-- dropped, and — by studio policy, not arithmetic — excused absences. Each is
-- visible in portal_attendance_detail so a parent counting Tuesdays on their
-- calendar can see why the number is what it is.
--
-- SECURITY POSTURE
--
-- This is children's behavioural data. Every table below is deny-by-default:
-- RLS on, no permissive policy, client SELECT only through the two
-- security-definer helpers, and NO client INSERT/UPDATE/DELETE anywhere. anon
-- gets nothing. team gets nothing. Both views are security_invoker so the
-- caller's RLS applies rather than the view owner's — without that a view is a
-- hole straight through every policy in this file.
--
-- KNOWN GAP, DELIBERATE
--
-- Staff access is admin/super_admin only. Scoping teachers to their own classes
-- is not possible yet: portal_classes.instructor_name is free text with no FK to
-- profiles, and matching on a name would leak across two instructors who share
-- a first name.
-- =============================================================================

create extension if not exists pg_trgm;

-- =============================================================================
-- 1. Class identity
-- =============================================================================

alter table public.portal_classes
  add column if not exists external_class_id text,
  add column if not exists superseded_by     uuid references public.portal_classes(id),
  -- Shoes, tights, hair. A LIST, not a paragraph: a paragraph gets skimmed on a
  -- phone at 5:20pm, four short items get read. NULL means the studio has not
  -- filled it in, which is different from '{}' meaning "nothing special needed".
  add column if not exists what_to_bring     text[];

comment on column public.portal_classes.external_class_id is
  'Enrolio''s class ID if it ever appears. Takes precedence over match_key.';

-- One definition, two callers: the generated column below and the importer,
-- which must compute an identical key for an incoming CSV row. IMMUTABLE is
-- required for a generated column and is honest here — same inputs, same key.
create or replace function public.portal_class_match_key(
  p_name        text,
  p_day_of_week integer,
  p_start_time  time
)
returns text
language sql
immutable
-- Pure, and every function it calls lives in pg_catalog (always searched
-- first), so an empty search_path resolves everything. Pinned because this
-- backs a STORED GENERATED column: whatever it returns is written to disk and
-- is what the importer matches incoming CSV rows against.
set search_path = ''
as $$
  select
    -- collapse punctuation to spaces, squeeze runs, trim, lower
    btrim(regexp_replace(
      lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9]+', ' ', 'g')),
      '\s+', ' ', 'g'
    ))
    || '|' || coalesce(p_day_of_week::text, '')
    || '|' || coalesce(to_char(p_start_time, 'HH24:MI'), '');
$$;

-- day_of_week is smallint on this table, and the helper takes integer. The cast
-- is explicit because a GENERATED expression is resolved once, at DDL time, and
-- leaning on an implicit cast there is how a migration fails halfway through.
alter table public.portal_classes
  add column if not exists match_key text
  generated always as (
    public.portal_class_match_key(name, day_of_week::integer, start_time)
  ) stored;

create index if not exists idx_portal_classes_match_key
  on public.portal_classes (match_key);

-- Fuzzy lookup for the review queue: "Contemprary Ballet" must suggest the real
-- class rather than propose a new one.
create index if not exists idx_portal_classes_name_trgm
  on public.portal_classes using gin (lower(name) gin_trgm_ops);

-- =============================================================================
-- 2. Households, students, members
-- =============================================================================

create table if not exists public.portal_households (
  id                  uuid primary key default gen_random_uuid(),
  external_account_id text unique,
  primary_email       text not null,
  display_name        text,
  status              text not null default 'active' check (status in ('active', 'inactive')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- citext is not enabled here, so case-insensitivity is enforced by the index.
-- Household resolution lower()s the incoming email to match.
create unique index if not exists idx_portal_households_email
  on public.portal_households (lower(primary_email));

create table if not exists public.portal_students (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.portal_households(id) on delete cascade,
  external_student_id text,
  first_name          text not null,
  last_name           text not null,
  -- The nickname. Shown INSIDE the household only; rosters, admin screens and
  -- attendance records always carry the enrollment name from Enrolio, because
  -- the studio matches a child to a paid registration and "Bug" is not on the
  -- invoice.
  display_name        text,
  status              text not null default 'active' check (status in ('active', 'inactive')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- When Enrolio supplies a student ID it is unique on its own. When it does not,
-- a child is identified by name within their household — hence two partial
-- indexes rather than one compound constraint.
create unique index if not exists idx_portal_students_external
  on public.portal_students (external_student_id)
  where external_student_id is not null;

create unique index if not exists idx_portal_students_name
  on public.portal_students (household_id, lower(first_name), lower(last_name))
  where external_student_id is null;

create index if not exists idx_portal_students_household
  on public.portal_students (household_id);

-- Which portal login belongs to which household, and as what.
create table if not exists public.portal_household_members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.portal_households(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  member_type  text not null check (member_type in ('guardian', 'student')),
  student_id   uuid references public.portal_students(id) on delete cascade,

  -- The visibility rule, enforced in the shape of the row rather than trusted
  -- to the application: a student member is pinned to exactly one child, a
  -- guardian is pinned to none and therefore sees the whole household.
  constraint portal_household_members_type_student check (
    (member_type = 'student'  and student_id is not null) or
    (member_type = 'guardian' and student_id is null)
  ),

  -- One login belongs to one household.
  constraint portal_household_members_profile_unique unique (profile_id)
);

create index if not exists idx_portal_household_members_profile
  on public.portal_household_members (profile_id);

-- A student's own email needs a gated signup path too, and this is how it gets
-- one without inventing a second mechanism alongside portal_roster.
alter table public.portal_roster
  add column if not exists member_type text not null default 'guardian';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'portal_roster_member_type_check') then
    alter table public.portal_roster
      add constraint portal_roster_member_type_check
      check (member_type in ('guardian', 'student'));
  end if;
end $$;

-- =============================================================================
-- 3. Enrollments, sessions, attendance
-- =============================================================================

create table if not exists public.portal_enrollments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.portal_students(id) on delete cascade,
  class_id    uuid not null references public.portal_classes(id),
  season      text not null,
  status      text not null default 'active' check (status in ('active', 'dropped', 'completed')),
  -- A dropped class deletes nothing. Status flips, dropped_on is set, and the
  -- history stays queryable under "Past classes".
  enrolled_on date not null,
  dropped_on  date,
  created_at  timestamptz not null default now(),

  constraint portal_enrollments_unique unique (student_id, class_id, season),
  constraint portal_enrollments_dates check (dropped_on is null or dropped_on >= enrolled_on)
);

create index if not exists idx_portal_enrollments_student on public.portal_enrollments (student_id);
create index if not exists idx_portal_enrollments_class   on public.portal_enrollments (class_id);

create table if not exists public.portal_class_sessions (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.portal_classes(id),
  session_date date not null,
  -- 'held' is the only status that counts. An admin marking a session
  -- 'cancelled' or 'closed' removes it from every denominator retroactively —
  -- which is the entire reason sessions are tracked apart from attendance.
  status       text not null default 'held' check (status in ('held', 'cancelled', 'closed')),
  source       text not null default 'import' check (source in ('import', 'manual')),
  note         text,
  created_at   timestamptz not null default now(),

  constraint portal_class_sessions_unique unique (class_id, session_date)
);

create table if not exists public.portal_attendance (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.portal_students(id) on delete cascade,
  class_id        uuid not null references public.portal_classes(id),
  session_id      uuid not null references public.portal_class_sessions(id) on delete cascade,
  status          text not null check (status in ('present', 'absent', 'excused', 'late')),
  import_batch_id uuid,
  recorded_at     timestamptz not null default now(),

  -- THE most important constraint in the spec. Enrolio reports overlap by
  -- design — a monthly report contains the weeks already imported — so
  -- re-importing must upsert on this key and never duplicate.
  constraint portal_attendance_unique unique (student_id, session_id)
);

create index if not exists idx_portal_attendance_class   on public.portal_attendance (class_id);
create index if not exists idx_portal_attendance_session on public.portal_attendance (session_id);

-- Studio policy, not arithmetic. A settings row because §3.6 is explicit that
-- this is a question the studio may revisit.
create table if not exists public.portal_settings (
  id                     boolean primary key default true check (id),
  excused_counts_against boolean not null default false,
  updated_at             timestamptz not null default now()
);

insert into public.portal_settings (id) values (true) on conflict (id) do nothing;

-- =============================================================================
-- 4. Visibility helpers
--
-- security definer so a client can be asked "may you see this student" without
-- being granted read on the membership tables themselves. Both are STABLE, so
-- wrapping a call in (select ...) inside a policy lets Postgres evaluate it once
-- as an InitPlan instead of once per row.
-- =============================================================================

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portal_household_members m
    where m.profile_id = auth.uid()
      and m.household_id = p_household_id
  );
$$;

create or replace function public.can_see_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portal_household_members m
    join public.portal_students s on s.id = p_student_id
    where m.profile_id = auth.uid()
      and m.household_id = s.household_id
      -- A guardian sees every child in the household. A student sees only
      -- themselves. Nobody sees anything outside their household.
      and (m.member_type = 'guardian' or m.student_id = p_student_id)
  );
$$;

revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.can_see_student(uuid)     from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.can_see_student(uuid)     to authenticated;

-- =============================================================================
-- 5. RLS — deny by default
-- =============================================================================

alter table public.portal_households        enable row level security;
alter table public.portal_students          enable row level security;
alter table public.portal_household_members enable row level security;
alter table public.portal_enrollments       enable row level security;
alter table public.portal_class_sessions    enable row level security;
alter table public.portal_attendance        enable row level security;
alter table public.portal_settings          enable row level security;

-- No INSERT, UPDATE or DELETE policy is created for ANY table in this file, for
-- any role. Every write is admin-side or Edge Function, both of which use the
-- service role and bypass RLS. That is the intent, not an omission.

drop policy if exists portal_households_select on public.portal_households;
create policy portal_households_select on public.portal_households
  for select to authenticated
  using ((select public.is_household_member(id)) or (select public.is_admin()));

drop policy if exists portal_students_select on public.portal_students;
create policy portal_students_select on public.portal_students
  for select to authenticated
  using ((select public.can_see_student(id)) or (select public.is_admin()));

drop policy if exists portal_household_members_select on public.portal_household_members;
create policy portal_household_members_select on public.portal_household_members
  for select to authenticated
  using (profile_id = auth.uid() or (select public.is_admin()));

drop policy if exists portal_enrollments_select on public.portal_enrollments;
create policy portal_enrollments_select on public.portal_enrollments
  for select to authenticated
  using ((select public.can_see_student(student_id)) or (select public.is_admin()));

drop policy if exists portal_attendance_select on public.portal_attendance;
create policy portal_attendance_select on public.portal_attendance
  for select to authenticated
  using ((select public.can_see_student(student_id)) or (select public.is_admin()));

-- Sessions carry no per-child information — they are "this class met on this
-- date" — but they are still scoped to a class the reader is enrolled in, so a
-- signed-in client cannot enumerate the studio's whole timetable history.
drop policy if exists portal_class_sessions_select on public.portal_class_sessions;
create policy portal_class_sessions_select on public.portal_class_sessions
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.portal_enrollments e
      where e.class_id = portal_class_sessions.class_id
        and (select public.can_see_student(e.student_id))
    )
  );

-- Everyone signed in may read the policy flag; only admins change it, and only
-- through the service role.
drop policy if exists portal_settings_select on public.portal_settings;
create policy portal_settings_select on public.portal_settings
  for select to authenticated using (true);

revoke all on public.portal_households, public.portal_students,
              public.portal_household_members, public.portal_enrollments,
              public.portal_class_sessions, public.portal_attendance,
              public.portal_settings
  from anon, authenticated;

grant select on public.portal_households, public.portal_students,
                public.portal_household_members, public.portal_enrollments,
                public.portal_class_sessions, public.portal_attendance,
                public.portal_settings
  to authenticated;

-- =============================================================================
-- 6. portal_attendance_summary
--
-- The single definition of the percentage, so no client invents its own.
--
-- security_invoker = true is load-bearing. A view runs as its OWNER by default,
-- which would hand every caller every household's numbers straight through the
-- policies above.
--
-- A held session with no attendance row counts as attended=false. That matches
-- the TypeScript implementation in src/lib/attendanceSummary.ts, and the two
-- must agree — see ATTENDANCE-NOTES.md item 3.
-- =============================================================================

create or replace view public.portal_attendance_summary
with (security_invoker = true) as
with ranges as (
  select * from (values ('month'), ('season'), ('all')) as r(range)
),
scoped as (
  select
    e.id               as enrollment_id,
    e.student_id,
    e.class_id,
    e.season,
    e.status,
    e.enrolled_on,
    e.dropped_on,
    r.range,
    s.id               as session_id,
    a.status           as mark,
    (
      s.status = 'held'
      and s.session_date >= e.enrolled_on
      and (e.dropped_on is null or s.session_date <= e.dropped_on)
      and (a.status is distinct from 'excused' or cfg.excused_counts_against)
    )                  as counts
  from public.portal_enrollments e
  join public.portal_classes c            on c.id = e.class_id
  cross join ranges r
  cross join public.portal_settings cfg
  join public.portal_class_sessions s
    on s.class_id = e.class_id
   and case r.range
         when 'month'  then date_trunc('month', s.session_date)
                            = date_trunc('month', current_date)
         when 'season' then (c.season_start is null or s.session_date >= c.season_start)
                        and (c.season_end   is null or s.session_date <= c.season_end)
         else true
       end
  left join public.portal_attendance a
    on a.session_id = s.id
   and a.student_id = e.student_id
)
select
  sc.student_id,
  sc.class_id,
  sc.enrollment_id,
  sc.range,
  sc.season,
  sc.status,
  sc.enrolled_on,
  sc.dropped_on,
  count(*) filter (where sc.counts and sc.mark in ('present', 'late'))::int as attended,
  count(*) filter (where sc.counts)::int                                    as counted,
  case
    when count(*) filter (where sc.counts) = 0 then null
    -- NULL, never 0. A class that has not met has no percentage, and rendering
    -- that as 0% tells a parent their child missed everything.
    else round(
      100.0 * count(*) filter (where sc.counts and sc.mark in ('present', 'late'))
      / count(*) filter (where sc.counts)
    )::int
  end                                                                       as percent,
  c.name          as class_name,
  c.style         as class_style,
  c.category      as class_category,
  c.day_of_week,
  c.start_time,
  c.end_time,
  c.season_start,
  c.season_end,
  c.location      as class_location,
  c.instructor_name,
  c.level         as class_level,
  c.what_to_bring
from scoped sc
join public.portal_classes c on c.id = sc.class_id
group by
  sc.student_id, sc.class_id, sc.enrollment_id, sc.range, sc.season, sc.status,
  sc.enrolled_on, sc.dropped_on, c.name, c.style, c.category, c.day_of_week,
  c.start_time, c.end_time, c.season_start, c.season_end, c.location,
  c.instructor_name, c.level, c.what_to_bring;

-- =============================================================================
-- 7. portal_attendance_detail
--
-- Session by session, with the REASON each excluded one does not count. Showing
-- the exclusions is what makes the summary checkable: a parent who counts
-- eleven Tuesdays and reads "9 of 10" needs to see the tenth marked
-- "studio closed" or the number looks like a bug.
-- =============================================================================

create or replace view public.portal_attendance_detail
with (security_invoker = true) as
select
  e.student_id,
  e.class_id,
  s.id           as session_id,
  s.session_date,
  s.status       as session_status,
  s.note,
  a.status,
  (
    s.status = 'held'
    and s.session_date >= e.enrolled_on
    and (e.dropped_on is null or s.session_date <= e.dropped_on)
    and (a.status is distinct from 'excused' or cfg.excused_counts_against)
  ) as counts_toward_total,
  case
    when s.status = 'cancelled'                  then 'cancelled'
    when s.status = 'closed'                     then 'closed'
    when s.session_date < e.enrolled_on          then 'before-enrollment'
    when e.dropped_on is not null
     and s.session_date > e.dropped_on           then 'after-drop'
    when a.status = 'excused'
     and not cfg.excused_counts_against          then 'excused'
    else null
  end as excluded_reason
from public.portal_enrollments e
join public.portal_class_sessions s on s.class_id = e.class_id
cross join public.portal_settings cfg
left join public.portal_attendance a
  on a.session_id = s.id
 and a.student_id = e.student_id;

-- Revoke BEFORE granting, and from authenticated as well as anon. Supabase
-- grants ALL by default on new objects in public, so a freshly created view
-- arrives carrying INSERT/UPDATE/DELETE/TRUNCATE. Neither view is auto-updatable
-- and security_invoker would block a write at the base table anyway, but a
-- read-only reporting view holding TRUNCATE reads as a hole in an audit.
revoke all on public.portal_attendance_summary from anon, authenticated;
revoke all on public.portal_attendance_detail  from anon, authenticated;

grant select on public.portal_attendance_summary to authenticated;
grant select on public.portal_attendance_detail  to authenticated;
