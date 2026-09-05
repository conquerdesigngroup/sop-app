-- =============================================================================
-- Migration v43 — who downloaded what, including visitors with no account
-- =============================================================================
--
-- WHY THIS EXISTS
--
-- The studio has no idea whether anything it posts is ever opened. There are
-- 1,167 rows in activity_logs and NOT ONE of them is a download: the three
-- call sites that log `document_downloaded` are all gated on a signed-in
-- staff member or client, and client logins are still switched off. Meanwhile
-- the people actually using the portal today are anonymous — they typed the
-- studio access code, they have no account, and nothing they do is recorded.
--
-- activity_logs has had `ip_address` and `user_agent` columns since it was
-- created. Both are empty on every row, because log_activity() never filled
-- them in.
--
-- WHAT THIS ADDS
--
--   client_ip()             the caller's real IP, from the edge, not from them
--   log_activity()          now records ip_address and user_agent — EVERY
--                           existing call site gains this with no code change
--   portal_log_download()   the narrow door an anonymous visitor may use
--   admin_download_stats()  "how many times has this been opened", per file
--
-- WHY NOT SIMPLY GRANT anon EXECUTE ON log_activity()
--
-- Because log_activity honours p_actor_id / p_actor_email / p_actor_name when
-- there is no session — that path exists for the service role and system jobs.
-- Granting it to anon would let anybody on the internet write audit entries
-- attributed to any person they liked, which is worse than having no audit at
-- all: a log that can be forged is evidence of nothing.
--
-- portal_log_download() therefore takes ONE argument, a document id, and
-- accepts no identity of any kind. Who, where and what are all resolved on
-- this side.
--
-- ALSO IN THIS MIGRATION (applied as v43b): activity_logs_actor_kind_check
-- gains 'visitor'. The original CHECK allowed staff/client/system only, and
-- caught this on the first real call — there was no value for "a person using
-- the portal with the access code", because until now such a person could not
-- write to the log at all.

-- ---------------------------------------------------------------- client ip
--
-- cf-connecting-ip is written by Cloudflare at the edge and OVERWRITES
-- anything the client sent, so it cannot be spoofed from a browser.
-- x-forwarded-for is the fallback and is only trusted as far as its FIRST hop,
-- which is the one Cloudflare appended; the rest of that header is whatever
-- the caller chose to put there.
--
-- Verified against this project's own REST endpoint before this was written:
-- both headers arrive, and cf-ipcountry alongside them.

create or replace function public.client_ip()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    nullif(btrim(current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(
      coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''), ',', 1)), '')
  );
$fn$;

revoke all on function public.client_ip() from public, anon, authenticated;

create or replace function public.client_country()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select nullif(btrim(current_setting('request.headers', true)::jsonb ->> 'cf-ipcountry'), '');
$fn$;

revoke all on function public.client_country() from public, anon, authenticated;

-- ---------------------------------------------------------------- the log
--
-- Byte-for-byte the v29 body, plus ip_address and user_agent. Nothing else
-- about it changes: identity still comes from the JWT and still ignores what
-- the caller claims.

create or replace function public.log_activity(
  p_action       text,
  p_entity_type  text,
  p_entity_id    text default null,
  p_entity_title text default null,
  p_details      jsonb default '{}'::jsonb,
  p_result       text default 'success',
  p_actor_kind   text default null,
  p_request_id   text default null,
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
    select p.id::text, p.email, btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), p.role
      into v_id, v_email, v_name, v_role
      from public.profiles p where p.id = v_uid;

    v_id    := coalesce(v_id, v_uid::text);
    v_name  := coalesce(nullif(v_name, ''), v_email, 'Unknown');
    v_kind  := case when v_role = 'client' then 'client' else 'staff' end;
  else
    v_id    := coalesce(p_actor_id, 'system');
    v_email := p_actor_email;
    v_name  := coalesce(p_actor_name, 'System');
    v_role  := null;
    v_kind  := coalesce(p_actor_kind, 'system');
  end if;

  insert into public.activity_logs
    (user_id, user_email, user_name, actor_kind, actor_role,
     action, entity_type, entity_id, entity_title,
     details, result, request_id, ip_address, user_agent)
  values
    (v_id, v_email, v_name, v_kind, v_role,
     p_action, p_entity_type, p_entity_id, p_entity_title,
     coalesce(p_details, '{}'::jsonb), coalesce(p_result, 'success'), p_request_id,
     public.client_ip(),
     left(coalesce(current_setting('request.headers', true)::jsonb ->> 'user-agent', ''), 400))
  returning id into v_out;

  return v_out;
end;
$fn$;

-- ------------------------------------------------------- the anonymous door
--
-- ONE ARGUMENT, AND IT IS NOT AN IDENTITY.
--
-- The caller says which document was opened. Everything else — who they are,
-- where they are, what the file is called, which class it belongs to — is
-- resolved here, so there is nothing for a caller to lie about. An id that is
-- not a real published document logs nothing at all and returns null, which
-- also means this cannot be used to probe for which ids exist.
--
-- DEDUPED ON PURPOSE, 15 MINUTES PER IP PER FILE.
--
-- Two different things are solved by the same window. A parent on a slow phone
-- taps Save three times before the video starts coming down — that is ONE
-- download, and counting it as three makes the number a lie. And an endpoint
-- that anonymous callers may write to is a way to fill somebody's table up;
-- the window caps what one address can add to roughly four rows an hour per
-- file. Neither problem is worth a second mechanism.

create or replace function public.portal_log_download(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_doc     record;
  v_ip      text := public.client_ip();
  v_uid     uuid := auth.uid();
  v_recent  uuid;
  v_id      text;
  v_email   text;
  v_name    text;
  v_role    text;
  v_kind    text;
  v_out     uuid;
begin
  select d.id, d.title, d.file_name, d.mime_type, d.class_id, d.program_id,
         c.name as class_name, pr.slug as program_slug
    into v_doc
    from public.portal_documents d
    left join public.portal_classes  c  on c.id  = d.class_id
    left join public.portal_programs pr on pr.id = d.program_id
   where d.id = p_document_id
     and d.is_published;

  -- Not a real published file. Log nothing, say nothing.
  if not found then
    return null;
  end if;

  -- Already counted this file, from this address, in the last quarter hour.
  select l.id into v_recent
    from public.activity_logs l
   where l.action = 'document_downloaded'
     and l.entity_id = p_document_id::text
     and l.created_at > now() - interval '15 minutes'
     and (
       (v_ip is not null and l.ip_address is not distinct from v_ip)
       or (v_uid is not null and l.user_id = v_uid::text)
     )
   limit 1;

  if v_recent is not null then
    return v_recent;
  end if;

  if v_uid is not null then
    select p.id::text, p.email, btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), p.role
      into v_id, v_email, v_name, v_role
      from public.profiles p where p.id = v_uid;
    v_id   := coalesce(v_id, v_uid::text);
    v_name := coalesce(nullif(v_name, ''), v_email, 'Unknown');
    v_kind := case when v_role = 'client' then 'client' else 'staff' end;
  else
    -- The access-code visitor. A real person the studio cannot name, which is
    -- exactly why the address and the count are the only handles there are.
    v_id   := 'anon';
    v_name := 'Portal visitor';
    v_kind := 'visitor';
  end if;

  insert into public.activity_logs
    (user_id, user_email, user_name, actor_kind, actor_role,
     action, entity_type, entity_id, entity_title,
     details, result, ip_address, user_agent)
  values
    (v_id, v_email, v_name, v_kind, v_role,
     'document_downloaded', 'document', v_doc.id::text, v_doc.title,
     jsonb_strip_nulls(jsonb_build_object(
       'fileName',    v_doc.file_name,
       'mimeType',    v_doc.mime_type,
       'classId',     v_doc.class_id,
       'className',   v_doc.class_name,
       'programSlug', v_doc.program_slug,
       'country',     public.client_country()
     )),
     'success', v_ip,
     left(coalesce(current_setting('request.headers', true)::jsonb ->> 'user-agent', ''), 400))
  returning id into v_out;

  return v_out;
end;
$fn$;

-- The whole point: a visitor with no account can reach this, and can reach
-- nothing else through it.
revoke all on function public.portal_log_download(uuid) from public;
grant execute on function public.portal_log_download(uuid) to anon, authenticated;

-- The dedupe lookup, and the stats rollup, both read this shape.
create index if not exists activity_logs_downloads
  on public.activity_logs (entity_id, created_at desc)
  where action = 'document_downloaded';

-- ---------------------------------------------------------------- the counts

create or replace function public.admin_download_stats(
  p_from  timestamptz default now() - interval '90 days',
  p_to    timestamptz default now(),
  p_limit integer     default 200
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_rows
  from (
    select l.entity_id                                        as document_id,
           max(l.entity_title)                                as title,
           max(l.details ->> 'className')                     as class_name,
           max(l.details ->> 'programSlug')                   as program_slug,
           max(l.details ->> 'fileName')                      as file_name,
           count(*)                                           as downloads,
           count(distinct l.ip_address)                       as unique_addresses,
           count(*) filter (where l.actor_kind = 'visitor')   as by_visitors,
           count(*) filter (where l.actor_kind = 'client')    as by_families,
           count(*) filter (where l.actor_kind = 'staff')     as by_staff,
           min(l.created_at)                                  as first_download,
           max(l.created_at)                                  as last_download
      from public.activity_logs l
     where l.action = 'document_downloaded'
       and l.created_at >= p_from
       and l.created_at <= p_to
     group by l.entity_id
     order by count(*) desc, max(l.created_at) desc
     limit greatest(1, least(p_limit, 1000))
  ) t;

  return jsonb_build_object('from', p_from, 'to', p_to, 'rows', v_rows);
end;
$fn$;

revoke all on function public.admin_download_stats(timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.admin_download_stats(timestamptz, timestamptz, integer) to authenticated, service_role;


-- ---------------------------------------------------------- actor kind
--
-- Applied separately as v43b. 'visitor' is a real person the studio cannot
-- name: not staff, not a known client, and emphatically not the system, which
-- is what they would otherwise have to be filed as.
--
-- ActivityLogPage's kindBadge() fell through to "Staff" for any unrecognised
-- kind, so a visitor would have been badged as a member of staff on every row.
-- That is fixed alongside this.

alter table public.activity_logs
  drop constraint if exists activity_logs_actor_kind_check;

alter table public.activity_logs
  add constraint activity_logs_actor_kind_check
  check (actor_kind = any (array['staff'::text, 'client'::text, 'system'::text, 'visitor'::text]));
