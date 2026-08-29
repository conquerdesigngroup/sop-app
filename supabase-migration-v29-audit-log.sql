-- =============================================================================
-- Migration v29 — audit log overwatch: one write door, super-admin-only reads
-- =============================================================================
--
-- Workstream 3 of CLIENT-AUTH-BUILD.md, designed in AUDIT-LOG-SPEC.md. The goal
-- stated there: pick any person, any document, any day, and get the answer in
-- under three clicks — and have that stay true as features are added.
--
-- WHAT CHANGES
--
--   * activity_logs grows actor_kind / actor_role / result / request_id.
--     actor_role is a deliberate SNAPSHOT: if someone is demoted next month the
--     log must still say what they were when they acted. Never resolve it by
--     joining profiles at read time.
--   * Indexes for every filter the admin surface offers. Without them each one
--     is a sequential scan, and at ~400 clients this table reaches six figures
--     within a year.
--   * log_activity() replaces direct INSERTs everywhere. With a session, the
--     caller does NOT get to say who they are — identity comes from the JWT,
--     otherwise any authenticated user could forge rows attributing their
--     actions to someone else. With no session (service role, cron), the
--     attribution parameters are honoured because there is nothing else to go
--     on, and only the service key can reach that branch.
--   * admin_activity_search() / admin_activity_facets(): SECURITY DEFINER reads
--     gated on is_super_admin() INSIDE the function — definer functions bypass
--     RLS, so without the explicit check this would publish the audit log to
--     every logged-in parent.
--
-- WHAT DOES NOT CHANGE
--
--   * The INSERT policy (user_id = auth.uid()::text) stays as a backstop
--     against anything writing directly instead of through the RPC.
--   * SELECT stays super-admin only. DELETE stays super-admin only.
--   * There is still no UPDATE policy: rows are immutable. The explicit REVOKE
--     below makes that true even where a table grant would otherwise apply.
--
-- RETENTION — decided 2026-08-29, recorded here so the next person knows it was
-- a decision and not an oversight: at 24 MONTHS rows move to an
-- activity_logs_archive table (same shape, created_at index only) via a monthly
-- pg_cron job. Nothing is ever deleted. The job is not built yet because the
-- first eligible row is two years away.

-- ---------------------------------------------------------------- 1. columns

alter table public.activity_logs
  add column actor_kind  text not null default 'staff'
    check (actor_kind in ('staff','client','system')),
  add column actor_role  text,
  add column result      text not null default 'success'
    check (result in ('success','failure')),
  add column request_id  text;

-- Everything already in the table predates client accounts, except the rows the
-- app wrote for itself, which used the literal id 'system'.
update public.activity_logs set actor_kind = 'system' where user_id = 'system';

revoke update on public.activity_logs from anon, authenticated;

-- ---------------------------------------------------------------- 2. indexes

create index activity_logs_created_at  on public.activity_logs (created_at desc);
create index activity_logs_actor       on public.activity_logs (user_id, created_at desc);
create index activity_logs_entity      on public.activity_logs (entity_type, entity_id, created_at desc);
create index activity_logs_action      on public.activity_logs (action, created_at desc);
create index activity_logs_kind        on public.activity_logs (actor_kind, created_at desc);
create index activity_logs_details_gin on public.activity_logs using gin (details);

-- Free text over the human-readable columns.
create extension if not exists pg_trgm with schema extensions;
create index activity_logs_search on public.activity_logs
  using gin ((coalesce(user_name,'') || ' ' ||
              coalesce(user_email,'') || ' ' ||
              coalesce(entity_title,'')) extensions.gin_trgm_ops);

-- ------------------------------------------------- 3. the write door: RPC

create or replace function public.log_activity(
  p_action       text,
  p_entity_type  text,
  p_entity_id    text default null,
  p_entity_title text default null,
  p_details      jsonb default '{}'::jsonb,
  p_result       text default 'success',
  p_actor_kind   text default null,
  p_request_id   text default null,
  -- honoured ONLY when there is no session (service role / system actions)
  p_actor_id     text default null,
  p_actor_email  text default null,
  p_actor_name   text default null
) returns uuid
language plpgsql security definer set search_path = 'public'
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_id    text;
  v_email text;
  v_name  text;
  v_role  text;
  v_kind  text;
  v_out   uuid;
begin
  if v_uid is not null then
    -- A real session. Identity comes from the JWT, not the parameters — see
    -- the migration header.
    select p.id::text, p.email, btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), p.role
      into v_id, v_email, v_name, v_role
      from public.profiles p where p.id = v_uid;

    -- A session with no profile row should still leave a trace, not an error.
    v_id    := coalesce(v_id, v_uid::text);
    v_name  := coalesce(nullif(v_name, ''), v_email, 'Unknown');
    v_kind  := case when v_role = 'client' then 'client' else 'staff' end;
  else
    -- No session: service role or a system job. Only reachable with the
    -- service key, which never leaves the server.
    v_id    := coalesce(p_actor_id, 'system');
    v_email := p_actor_email;
    v_name  := coalesce(p_actor_name, 'System');
    v_role  := null;
    v_kind  := coalesce(p_actor_kind, 'system');
  end if;

  insert into public.activity_logs
    (user_id, user_email, user_name, actor_kind, actor_role,
     action, entity_type, entity_id, entity_title,
     details, result, request_id)
  values
    (v_id, v_email, v_name, v_kind, v_role,
     p_action, p_entity_type, p_entity_id, p_entity_title,
     coalesce(p_details, '{}'::jsonb), coalesce(p_result, 'success'), p_request_id)
  returning id into v_out;

  return v_out;
end;
$fn$;

revoke execute on function public.log_activity(text, text, text, text, jsonb, text, text, text, text, text, text) from public, anon;
grant execute on function public.log_activity(text, text, text, text, jsonb, text, text, text, text, text, text) to authenticated, service_role;

-- ------------------------------------------------------- 4. the read path

create or replace function public.admin_activity_search(
  p_from         timestamptz default null,
  p_to           timestamptz default null,
  p_actor_ids    text[]      default null,
  p_actor_kinds  text[]      default null,
  p_actions      text[]      default null,
  p_entity_types text[]      default null,
  p_entity_id    text        default null,
  p_result       text        default null,
  p_search       text        default null,
  p_cursor_ts    timestamptz default null,   -- keyset pagination
  p_cursor_id    uuid        default null,
  p_limit        int         default 50
) returns setof public.activity_logs
language plpgsql stable security definer set search_path = 'public'
as $fn$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorised';
  end if;

  return query
  select * from public.activity_logs l
  where (p_from is null or l.created_at >= p_from)
    and (p_to   is null or l.created_at <  p_to)
    and (p_actor_ids    is null or l.user_id     = any(p_actor_ids))
    and (p_actor_kinds  is null or l.actor_kind  = any(p_actor_kinds))
    and (p_actions      is null or l.action      = any(p_actions))
    and (p_entity_types is null or l.entity_type = any(p_entity_types))
    and (p_entity_id    is null or l.entity_id   = p_entity_id)
    and (p_result       is null or l.result      = p_result)
    and (p_search is null or
         (coalesce(l.user_name,'') || ' ' || coalesce(l.user_email,'') || ' ' ||
          coalesce(l.entity_title,'')) ilike '%' || p_search || '%')
    -- keyset, not OFFSET: offset pagination degrades badly and double-counts
    -- when new rows arrive mid-scroll, which on a live log is constantly
    and (p_cursor_ts is null or (l.created_at, l.id) < (p_cursor_ts, p_cursor_id))
  order by l.created_at desc, l.id desc
  limit least(coalesce(p_limit, 50), 200);
end;
$fn$;

revoke execute on function public.admin_activity_search(timestamptz, timestamptz, text[], text[], text[], text[], text, text, text, timestamptz, uuid, int) from public, anon;
grant execute on function public.admin_activity_search(timestamptz, timestamptz, text[], text[], text[], text[], text, text, text, timestamptz, uuid, int) to authenticated, service_role;

-- Distinct actions, entity types and actors within a date range, with counts —
-- so the filter dropdowns offer only values that actually occur. The UI caches
-- this per session.
create or replace function public.admin_activity_facets(
  p_from timestamptz default null,
  p_to   timestamptz default null
) returns jsonb
language plpgsql stable security definer set search_path = 'public'
as $fn$
declare
  v_out jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Not authorised';
  end if;

  select jsonb_build_object(
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('action', a.action, 'count', a.n) order by a.n desc)
        from (select l.action, count(*) n from public.activity_logs l
               where (p_from is null or l.created_at >= p_from)
                 and (p_to   is null or l.created_at <  p_to)
               group by l.action) a
    ), '[]'::jsonb),
    'entity_types', coalesce((
      select jsonb_agg(jsonb_build_object('entity_type', a.entity_type, 'count', a.n) order by a.n desc)
        from (select l.entity_type, count(*) n from public.activity_logs l
               where (p_from is null or l.created_at >= p_from)
                 and (p_to   is null or l.created_at <  p_to)
               group by l.entity_type) a
    ), '[]'::jsonb),
    'actors', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.user_id, 'name', a.name, 'email', a.email,
               'kind', a.kind, 'count', a.n) order by a.n desc)
        from (select l.user_id,
                     max(l.user_name)  as name,
                     max(l.user_email) as email,
                     max(l.actor_kind) as kind,
                     count(*) n
                from public.activity_logs l
               where (p_from is null or l.created_at >= p_from)
                 and (p_to   is null or l.created_at <  p_to)
               group by l.user_id
               order by n desc
               limit 1000) a
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$fn$;

revoke execute on function public.admin_activity_facets(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_activity_facets(timestamptz, timestamptz) to authenticated, service_role;
