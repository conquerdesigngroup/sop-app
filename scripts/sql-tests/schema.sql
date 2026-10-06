-- =============================================================================
-- The slice of the production schema the SQL tests run against.
-- =============================================================================
--
-- Read off the live project (information_schema and pg_constraint, 2026-09-24),
-- not off the migration files: v34 changed the student identity index in
-- production and has no file in this repo, so replaying the migrations would
-- test against a key the database does not have.
--
-- Only what the functions under test touch is here. Everything that is
-- Supabase's rather than ours is a stub, and says so:
--
--   auth.uid()      reads request.jwt.claim.sub, which is where PostgREST puts it
--   studio_today()  reads test.today when a test sets it, so a test can stand on
--                   any date; production's reads the Pacific clock
--   log_activity()  writes the same row production's does, minus the columns
--                   no test reads
--
-- No data. Every test seeds its own invented families.
-- =============================================================================

create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.profiles (
  id         uuid primary key,
  email      text,
  first_name text,
  last_name  text,
  role       text not null default 'client',
  is_active  boolean default true
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
      and is_active is not false
  );
$$;

create or replace function public.studio_today() returns date
language sql stable set search_path = '' as $$
  select coalesce(
    nullif(current_setting('test.today', true), '')::date,
    (now() at time zone 'America/Los_Angeles')::date
  );
$$;

create table public.activity_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      text,
  action       text not null,
  entity_type  text,
  entity_id    text,
  entity_title text,
  details      jsonb not null default '{}'::jsonb,
  result       text not null default 'success',
  created_at   timestamptz not null default now()
);

create or replace function public.log_activity(
  p_action text, p_entity_type text, p_entity_id text default null,
  p_entity_title text default null, p_details jsonb default '{}'::jsonb,
  p_result text default 'success', p_actor_kind text default null,
  p_request_id text default null, p_actor_id text default null,
  p_actor_email text default null, p_actor_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_out uuid;
begin
  insert into public.activity_logs (user_id, action, entity_type, entity_id, entity_title, details, result)
  values (coalesce(auth.uid()::text, p_actor_id, 'system'), p_action, p_entity_type, p_entity_id,
          p_entity_title, coalesce(p_details, '{}'::jsonb), coalesce(p_result, 'success'))
  returning id into v_out;
  return v_out;
end;
$$;

create table public.portal_classes (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid not null default gen_random_uuid(),
  name              text not null,
  day_of_week       smallint,
  start_time        time,
  end_time          time,
  is_active         boolean not null default true,
  category          text not null default 'academy',
  age_min_years     smallint,
  age_max_years     smallint,
  season            text,
  season_start      date,
  season_end        date,
  external_class_id text
);

create table public.portal_households (
  id                  uuid primary key default gen_random_uuid(),
  external_account_id text unique,
  primary_email       text not null,
  display_name        text,
  status              text not null default 'active' check (status in ('active', 'inactive')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index idx_portal_households_email on public.portal_households (lower(primary_email));

create table public.portal_students (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.portal_households(id) on delete cascade,
  external_student_id text,
  first_name          text not null,
  last_name           text not null,
  display_name        text,
  status              text not null default 'active' check (status in ('active', 'inactive')),
  date_of_birth       date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- v34's key, as production has it: a null birthday is keyed on 1900-01-01.
create unique index idx_portal_students_natural on public.portal_students
  (household_id, lower(first_name), lower(last_name), coalesce(date_of_birth, '1900-01-01'::date))
  where external_student_id is null;

create table public.portal_enrollments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.portal_students(id) on delete cascade,
  class_id    uuid not null references public.portal_classes(id),
  season      text not null,
  status      text not null default 'active' check (status in ('active', 'dropped', 'completed')),
  enrolled_on date not null,
  dropped_on  date,
  created_at  timestamptz not null default now(),
  constraint portal_enrollments_unique unique (student_id, class_id, season),
  constraint portal_enrollments_dates check (dropped_on is null or dropped_on >= enrolled_on)
);

create table public.portal_class_sessions (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.portal_classes(id),
  session_date date not null,
  status       text not null default 'held' check (status in ('held', 'cancelled', 'closed')),
  source       text not null default 'import' check (source in ('import', 'manual', 'schedule')),
  note         text,
  created_at   timestamptz not null default now(),
  constraint portal_class_sessions_unique unique (class_id, session_date)
);

create table public.portal_attendance (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.portal_students(id) on delete cascade,
  class_id        uuid not null references public.portal_classes(id),
  session_id      uuid not null references public.portal_class_sessions(id) on delete cascade,
  status          text not null check (status in ('present', 'absent', 'excused', 'late', 'sick')),
  import_batch_id uuid,
  recorded_at     timestamptz not null default now(),
  recorded_by     uuid references public.profiles(id),
  source          text not null default 'app' check (source in ('app', 'import')),
  constraint portal_attendance_unique unique (student_id, session_id)
);

create table public.portal_attendance_history (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.portal_students(id) on delete cascade,
  class_id        uuid not null references public.portal_classes(id),
  session_id      uuid not null references public.portal_class_sessions(id) on delete cascade,
  old_status      text,
  new_status      text not null,
  changed_by      uuid references public.profiles(id),
  changed_at      timestamptz not null default now(),
  source          text not null check (source in ('app', 'import')),
  import_batch_id uuid,
  note            text
);

-- What staff_mark_attendance (v52, restated by v68) reads. The teacher branch
-- of can_edit_portal_class is not under test here, so it is admin-only.
create table public.portal_settings (
  id                         boolean primary key default true check (id),
  excused_counts_against     boolean not null default false,
  attendance_capture_enabled boolean not null default true
);
insert into public.portal_settings default values;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and role = 'super_admin' and is_active is not false);
$$;

create or replace function public.can_edit_portal_class(target_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin();
$$;

-- What admin_roster_import (live-admin-roster-import.sql) reads and writes, so
-- rule 7 is tested against the function that will later fill the birthday in.
-- claimed_by references auth.users in production; there is no auth.users here.
create table public.portal_programs (
  id   uuid primary key default gen_random_uuid(),
  slug text unique,
  name text
);

create table public.portal_roster (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  student_name  text not null,
  guardian_name text,
  program_id    uuid references public.portal_programs(id),
  external_id   text,
  status        text not null default 'active' check (status in ('active', 'inactive')),
  claimed_by    uuid,
  claimed_at    timestamptz,
  imported_at   timestamptz not null default now(),
  notes         text,
  member_type   text not null default 'guardian' check (member_type in ('guardian', 'student')),
  date_of_birth date,
  student_id    uuid references public.portal_students(id) on delete cascade,
  constraint portal_roster_type_student check (
    (member_type = 'student' and student_id is not null) or (member_type = 'guardian' and student_id is null))
);
create unique index portal_roster_email_external on public.portal_roster (lower(email), coalesce(external_id, student_name));

-- The roles PostgREST connects as, so the migration's grants have something to
-- land on. Supabase creates these; a bare Postgres does not.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
