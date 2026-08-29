-- =============================================================================
-- Migration v28 — client accounts: roster allowlist, the 'client' role, and
-- retiring the "authenticated means staff" assumption
-- =============================================================================
--
-- First half of CLIENT-AUTH-BUILD.md (Workstream 1). Parents get real logins;
-- this migration makes the database ready for them WITHOUT changing anything a
-- staff account or the anon portal can observe today:
--
--   * portal_roster          — the allowlist imported from the enrollment
--                              system. Service role only: an unauthenticated
--                              visitor must never be able to probe who is on it.
--   * portal_signup_attempts — rate-limit ledger for the portal-signup function.
--   * profiles.role          — CHECK widened to allow 'client'.
--   * is_active_staff()      — now actually asks "is this staff". Until clients
--                              existed, "has an active profile" answered the
--                              same question by accident. The moment one client
--                              row is active, the old test hands them the whole
--                              staff directory via profiles_select_authenticated.
--   * handle_new_user()      — branches on app_metadata.account_type='client'.
--                              app_metadata is settable only through
--                              auth.admin.*, never by a browser signUp(), so the
--                              role decision cannot be forged client-side. The
--                              staff path is byte-identical to v10: role='team',
--                              is_active=false.
--   * five SELECT policies   — calendar_events, calendar_sources,
--                              calendar_event_attachments, event_tags and
--                              event_templates granted reads to plain
--                              `authenticated` with USING (true). That meant
--                              "staff" only while staff were the only people
--                              with logins; a client JWT would read the entire
--                              staff calendar. Scoped to is_active_staff().
--                              Staff behaviour is unchanged because the new
--                              role test passes for every staff tier.
--
-- prevent_privilege_escalation() (v6) rejects role changes made under the
-- service role (auth.uid() is NULL there), so a client's role cannot be patched
-- after creation — it must be right at INSERT time. That is why
-- handle_new_user() keys off app_metadata rather than portal-signup fixing the
-- row afterwards.
--
-- The anon portal-read policies are deliberately NOT touched here. Closing them
-- breaks the live access-code portal, so that lands at feature-flag flip time —
-- see supabase-migration-v30-close-anon-door.sql.

-- ---------------------------------------------------------------- 1. roster

create table public.portal_roster (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  student_name  text not null,
  guardian_name text,
  program_id    uuid references public.portal_programs(id),
  external_id   text,                     -- id from the enrollment software
  status        text not null default 'active'
                check (status in ('active','inactive')),
  claimed_by    uuid references auth.users(id),
  claimed_at    timestamptz,
  imported_at   timestamptz not null default now(),
  notes         text
);

-- One guardian email can cover several students, so email is NOT unique.
-- Lookups are case-insensitive; rows are stored lowercased and indexed that way.
create unique index portal_roster_email_external
  on public.portal_roster (lower(email), coalesce(external_id, student_name));
create index portal_roster_email on public.portal_roster (lower(email));
create index portal_roster_claimed_by on public.portal_roster (claimed_by);

-- RLS on, no policies, and the default table grants revoked: only the service
-- role (BYPASSRLS) and SECURITY DEFINER functions below can touch it.
alter table public.portal_roster enable row level security;
revoke all on public.portal_roster from anon, authenticated;

-- --------------------------------------------------- 2. signup rate limiting
--
-- Edge functions are stateless across instances, so "5 attempts per email per
-- hour" has to live somewhere shared. portal-signup inserts a row per attempt
-- and counts the window; old rows are pruned opportunistically by the function.

create table public.portal_signup_attempts (
  id         bigint generated always as identity primary key,
  kind       text not null,               -- 'register' | 'resend' | 'signin_failed'
  email      text,
  ip         text,
  created_at timestamptz not null default now()
);

create index portal_signup_attempts_email
  on public.portal_signup_attempts (lower(email), created_at);
create index portal_signup_attempts_ip
  on public.portal_signup_attempts (ip, created_at);

alter table public.portal_signup_attempts enable row level security;
revoke all on public.portal_signup_attempts from anon, authenticated;

-- ------------------------------------------------------- 3. the client role

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin','admin','team','client'));

-- v28: is_active_staff() previously answered "does this person have an active
-- profile", which was the same question as "is this person staff" only because
-- clients did not exist. It does not mean that any more.
create or replace function public.is_active_staff()
returns boolean language sql stable security definer set search_path = 'public'
as $fn$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active is not false
      and role in ('super_admin','admin','team')
  );
$fn$;

-- ------------------------------------------------------ 4. handle_new_user()
--
-- app_metadata is settable only via auth.admin.* (portal-signup, after the
-- roster check), never by a self-signup — which is why the role decision keys
-- off it and not user_metadata. Everything else is the v10 behaviour: a bare
-- signUp() still lands as an inactive team member that an admin must promote.
--
-- MEASURED CAVEAT (2026-08-29): on this project's GoTrue, admin createUser
-- applies app_metadata AFTER the INSERT that fires this trigger, so the client
-- branch below never fires for portal signups — the row lands as team/inactive
-- and portal-signup rebuilds it (DELETE + INSERT, which the escalation trigger
-- does not police) immediately after. The branch stays because it is the
-- correct behaviour the moment GoTrue supplies the metadata at INSERT time,
-- and because it documents what account_type means.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = 'public'
as $fn$
begin
  if NEW.raw_app_meta_data->>'account_type' = 'client' then
    insert into public.profiles (id, email, first_name, last_name, role, department, is_active)
    values (
      NEW.id,
      NEW.email,
      coalesce(NEW.raw_user_meta_data->>'first_name', ''),
      coalesce(NEW.raw_user_meta_data->>'last_name', ''),
      'client',
      'Client',
      true
    )
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, email, first_name, last_name, role, department, is_active)
    values (
      NEW.id,
      NEW.email,
      coalesce(NEW.raw_user_meta_data->>'first_name', ''),
      coalesce(NEW.raw_user_meta_data->>'last_name', ''),
      'team',
      coalesce(NEW.raw_user_meta_data->>'department', 'General'),
      false
    )
    on conflict (id) do nothing;
  end if;
  return NEW;
end;
$fn$;

-- ------------------------------- 5. reads that assumed authenticated == staff
--
-- Every one of these was USING (true) to `authenticated`. Correct while the
-- only logins were staff logins; a privilege leak the day the first client
-- signs in. is_active_staff() is true for every staff tier, so staff notice
-- nothing.

drop policy "calendar_events_select" on public.calendar_events;
create policy "calendar_events_select" on public.calendar_events
  for select to authenticated using (is_active_staff());

drop policy "calendar_sources_select" on public.calendar_sources;
create policy "calendar_sources_select" on public.calendar_sources
  for select to authenticated using (is_active_staff());

drop policy "calendar_attachments_staff_read" on public.calendar_event_attachments;
create policy "calendar_attachments_staff_read" on public.calendar_event_attachments
  for select to authenticated using (is_active_staff());

drop policy "Allow authenticated read event_tags" on public.event_tags;
create policy "Allow authenticated read event_tags" on public.event_tags
  for select to authenticated using (is_active_staff());

drop policy "Allow authenticated read event_templates" on public.event_templates;
create policy "Allow authenticated read event_templates" on public.event_templates
  for select to authenticated using (is_active_staff());

-- ------------------------------------------------- 6. admin roster functions
--
-- Called by the portal-admin Edge Function as the CALLER (their JWT flows
-- through, so is_admin() answers about the real person). SECURITY DEFINER so
-- they can reach portal_roster and auth.users, which have no client-facing
-- grants; the authorisation is therefore the explicit is_admin() check inside,
-- not RLS. Neither function writes the activity log — portal-admin does, once
-- per action, so the log call cannot be forgotten by one path and not another.

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
  v_program  uuid;
  v_existing public.portal_roster%rowtype;
  v_inserted int := 0;
  v_updated  int := 0;
  v_unchanged int := 0;
  v_auto_claimed int := 0;
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

    if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      v_rejected := v_rejected || jsonb_build_object('row', idx, 'email', v_email, 'reason', 'invalid_email');
      continue;
    end if;
    if v_student = '' then
      v_rejected := v_rejected || jsonb_build_object('row', idx, 'email', v_email, 'reason', 'missing_student_name');
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

    select * into v_existing from public.portal_roster
      where lower(email) = v_email
        and coalesce(external_id, student_name) = coalesce(v_ext, v_student);

    if not found then
      insert into public.portal_roster (email, student_name, guardian_name, program_id, external_id, notes)
      values (v_email, v_student, v_guardian, v_program, v_ext, v_notes);
      v_inserted := v_inserted + 1;
    elsif v_existing.student_name  is distinct from v_student
       or v_existing.guardian_name is distinct from v_guardian
       or v_existing.program_id    is distinct from v_program
       or v_existing.notes         is distinct from v_notes then
      -- status is deliberately NOT touched: an admin's deactivate outranks the
      -- next export, which never deletes and so never "un-lists" anyone.
      update public.portal_roster
         set student_name = v_student,
             guardian_name = v_guardian,
             program_id = v_program,
             notes = v_notes,
             imported_at = now()
       where id = v_existing.id;
      v_updated := v_updated + 1;
    else
      v_unchanged := v_unchanged + 1;
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
    'rejected', v_rejected,
    'filename', p_filename
  );
end;
$fn$;

revoke execute on function public.admin_roster_import(jsonb, text) from public, anon;
grant execute on function public.admin_roster_import(jsonb, text) to authenticated, service_role;

-- Roster rows joined to the account that claimed them, plus the auth facts an
-- admin needs at a glance (last sign-in, confirmed, banned). auth.users is
-- reachable only because this is SECURITY DEFINER — hence the explicit gate.
create or replace function public.admin_client_list(
  p_filter text default 'all',        -- all | claimed | unclaimed | inactive
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
     and (p_search is null or p_search = ''
          or r.email ilike '%' || p_search || '%'
          or r.student_name ilike '%' || p_search || '%'
          or coalesce(r.guardian_name, '') ilike '%' || p_search || '%');

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_rows
  from (
    select r.id, r.email, r.student_name, r.guardian_name, r.external_id,
           r.status, r.claimed_by, r.claimed_at, r.imported_at, r.notes,
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
     where (p_filter <> 'claimed'   or r.claimed_by is not null)
       and (p_filter <> 'unclaimed' or (r.claimed_by is null and r.status = 'active'))
       and (p_filter <> 'inactive'  or r.status = 'inactive')
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
