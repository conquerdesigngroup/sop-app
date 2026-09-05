-- =============================================================================
-- Migration v42 — Web Push for families
-- =============================================================================
--
-- WHY THIS EXISTS
--
-- The portal only ever talked outward, and only when somebody opened it. A
-- cancelled class, a changed call time, a note addressed to one family — all of
-- it sat in a table hoping to be read. This is the delivery.
--
-- WHAT DOES NOT CHANGE, AND IS THE POINT
--
--   push_subscriptions   NOT touched. It is already
--                        `user_id references profiles(id)`, and clients HAVE
--                        profiles rows — handle_new_user() (v28) inserts them
--                        with role='client', is_active=true. Its RLS policy is
--                        `user_id = auth.uid()` for `authenticated`, so a
--                        signed-in parent could already store a subscription
--                        before this migration existed.
--   push_vapid           NOT touched. One keypair, shared with alert-push.
--                        Two senders, one identity: re-keying would silently
--                        invalidate every subscription already stored.
--   profiles.notification_preferences
--                        NOT touched. src/lib/portalNotifications.ts writes the
--                        family keys into the same JSONB the staff keys live
--                        in; they never share a row.
--
-- WHAT THIS ADDS
--
--   push_outbox            one row per notice that owes somebody a
--                          notification, drained by the Edge Function
--   portal_push_enqueue()  the AFTER trigger that fills it
--   portal_push_payload()  who should be told, and what the notification says
--   run_portal_push()      the pg_cron hook, same shape as run_alert_push()
--                          (v38) and run_calendar_syncs() (v18)
--
-- WHY AN OUTBOX AND NOT A CALL FROM THE BROWSER
--
-- Every write to portal_updates is a DIRECT CLIENT-SIDE INSERT —
-- PortalAdminContext for program and class notices, portalViewer's
-- sendHouseholdNote for a family note. No Edge Function is involved in
-- publishing anything, so there is no server-side moment to hook.
--
-- Calling the sender from the browser after the insert would make delivery
-- depend on a tab staying open: a super admin sends a family note from the
-- Viewer, shuts the laptop, and nothing is ever sent — with nobody to notice.
-- A trigger fires inside the same transaction as the insert, whatever wrote it.
--
-- WHY NOT POLL FOR ROWS PUBLISHED SINCE THE LAST RUN
--
-- Because "the last run" is state that has to live somewhere anyway, and it
-- answers the wrong question. A backdated published_at, or a row edited from
-- is_published=false to true, either double-sends or never sends. The outbox
-- makes "has this been sent" an explicit fact rather than an inference from
-- timestamps.

-- ---------------------------------------------------------------- outbox

create table if not exists public.push_outbox (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('update', 'document')),
  source_id  uuid not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   integer not null default 0,
  -- Set when a row was resolved WITHOUT sending — the notice was deleted or
  -- unpublished before the drain reached it, or nobody was owed it. Keeping
  -- the reason next to sent_at is what makes "sent 0" distinguishable from
  -- "never ran" when somebody asks why they got nothing.
  last_error text,

  -- The whole anti-repeat mechanism. A teacher fixing a typo in a live notice
  -- writes the row again; without this the family's phone buzzes twice for one
  -- announcement. The trigger's false->true guard is the first line of this
  -- defence and this constraint is the second.
  constraint push_outbox_source_unique unique (kind, source_id)
);

-- The drain's only query: oldest unsent first.
create index if not exists push_outbox_pending
  on public.push_outbox (created_at)
  where sent_at is null;

alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from public, anon, authenticated;
-- No policies at all, and no grants. Only the service role (BYPASSRLS) reaches
-- it. A parent has no business reading the queue of who is being told what.

-- ---------------------------------------------------------------- enqueue

create or replace function public.portal_push_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Publishing is the event, not writing. An UPDATE that leaves is_published
  -- true was an edit to something already announced, and an edit is not news.
  if NEW.is_published
     and (TG_OP = 'INSERT' or coalesce(OLD.is_published, false) = false)
  then
    insert into public.push_outbox (kind, source_id)
    values (TG_ARGV[0], NEW.id)
    on conflict (kind, source_id) do nothing;
  end if;
  return NEW;
end;
$$;

revoke all on function public.portal_push_enqueue() from public, anon, authenticated;

drop trigger if exists trg_portal_updates_push on public.portal_updates;
create trigger trg_portal_updates_push
  after insert or update of is_published on public.portal_updates
  for each row execute function public.portal_push_enqueue('update');

drop trigger if exists trg_portal_documents_push on public.portal_documents;
create trigger trg_portal_documents_push
  after insert or update of is_published on public.portal_documents
  for each row execute function public.portal_push_enqueue('document');

-- ---------------------------------------------------------------- audience
--
-- THIS IS THE INVERSE OF loadMyUpdates()
--
-- src/lib/attendanceQueries.ts already decides which notices apply to a given
-- family:
--
--     .filter(u => u.classId === null || enrolledClassIds.includes(u.classId))
--
-- plus RLS, which decides whether a household_id row is returned at all. This
-- asks the same question from the other end. THE TWO MUST AGREE: if push says
-- a notice applies and the Updates card does not, a parent taps a notification
-- and lands on a page where the notice is not there.
--
-- GUARDIANS ONLY.
--
-- portal_household_members pins a 'student' member to exactly one child by
-- CHECK constraint; a guardian is pinned to none and therefore sees the whole
-- household. Notifying a student login is a separate decision with its own
-- consent question — a message to a minor that their guardian did not send —
-- and is deliberately not made here.
--
-- Staff cannot be selected by any branch below: they have no
-- portal_household_members row. The explicit role='client' test is belt and
-- braces, so that a future membership row for a teacher's own child cannot
-- quietly route studio announcements into the staff digest's audience.

create or replace function public.portal_push_payload(p_kind text, p_source_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
  v_class_id   uuid;
  v_household  uuid;
  v_title      text;
  v_body       text;
  v_pinned     boolean := false;
  v_slug       text;
  v_pref       text;
  v_url        text;
  v_recipients jsonb;
begin
  if p_kind = 'update' then
    select u.program_id, u.class_id, u.household_id, u.title, u.body, u.is_pinned
      into v_program_id, v_class_id, v_household, v_title, v_body, v_pinned
      from public.portal_updates u
     where u.id = p_source_id and u.is_published;

  elsif p_kind = 'document' then
    select d.program_id, d.class_id, null::uuid, d.title, d.description, false
      into v_program_id, v_class_id, v_household, v_title, v_body, v_pinned
      from public.portal_documents d
     where d.id = p_source_id and d.is_published;

  else
    return jsonb_build_object('valid', false, 'reason', 'unknown kind');
  end if;

  -- Deleted, or unpublished again, between the trigger firing and the drain
  -- reaching it. Not an error: somebody changed their mind inside a minute,
  -- which is exactly when they should be able to.
  if v_program_id is null then
    return jsonb_build_object('valid', false, 'reason', 'no longer published');
  end if;

  select slug into v_slug from public.portal_programs where id = v_program_id;

  -- Which switch on the family's profile governs this notice. Mirrors
  -- PORTAL_NOTIFICATION_CATEGORIES in src/lib/portalNotifications.ts.
  v_pref := case
    when v_household is not null then 'familyNotes'
    when p_kind = 'document'     then 'newFiles'
    when v_class_id is not null  then 'classNotices'
    else                              'studioNotices'
  end;

  v_url := case
    when v_household is not null then '/portal/profile'
    when p_kind = 'document' and v_class_id is not null
      then '/portal/' || v_slug || '/classes/' || v_class_id::text
    when p_kind = 'document' then '/portal/' || v_slug || '/classes'
    else '/portal/' || v_slug || '/updates'
  end;

  select coalesce(jsonb_agg(distinct m.profile_id), '[]'::jsonb)
    into v_recipients
    from public.portal_household_members m
    join public.profiles p on p.id = m.profile_id
   where m.member_type = 'guardian'
     and p.role = 'client'
     and p.is_active
     -- Absent means the default, matching prefsFromRaw() and the rule
     -- alert-push already uses. A profile written before this feature existed
     -- has none of these keys and must not go silent because of it.
     and coalesce((p.notification_preferences ->> 'pushEnabled')::boolean, true)
     and coalesce(
           (p.notification_preferences ->> v_pref)::boolean,
           case when v_pref = 'newFiles' then false else true end
         )
     and case
       -- A note to one family. RLS decides this on the read side; here it is
       -- the household id itself, which is the same fact.
       when v_household is not null then
         m.household_id = v_household

       -- A class notice reaches the families with a child actually in it.
       when v_class_id is not null then exists (
         select 1
           from public.portal_enrollments e
           join public.portal_students s on s.id = e.student_id
          where e.class_id = v_class_id
            and e.status = 'active'
            and s.status = 'active'
            and s.household_id = m.household_id
       )

       -- Program-wide: anyone with an active enrollment anywhere in it.
       else exists (
         select 1
           from public.portal_enrollments e
           join public.portal_students s on s.id = e.student_id
           join public.portal_classes c on c.id = e.class_id
          where c.program_id = v_program_id
            and e.status = 'active'
            and s.status = 'active'
            and s.household_id = m.household_id
       )
     end;

  return jsonb_build_object(
    'valid', true,
    'title', v_title,
    'body', coalesce(v_body, ''),
    'url', v_url,
    -- is_pinned is the studio saying "this one matters" and is the only
    -- urgency signal that exists today. It is what lets a notice through the
    -- quiet hours the Edge Function keeps.
    'urgent', coalesce(v_pinned, false),
    'preference', v_pref,
    'recipients', v_recipients
  );
end;
$$;

revoke all on function public.portal_push_payload(text, uuid) from public, anon, authenticated;
grant execute on function public.portal_push_payload(text, uuid) to service_role;

-- ---------------------------------------------------------------- cron hook

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.run_portal_push()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  key text;
begin
  select decrypted_secret into key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if key is null then
    raise exception 'vault secret service_role_key is missing';
  end if;

  perform net.http_post(
    url := 'https://sgppeenmvskwztaszkgn.supabase.co/functions/v1/portal-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || key
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.run_portal_push() from public, anon, authenticated;

-- ---------------------------------------------------------------- schedule
--
-- EVERY MINUTE, and deliberately not on the second.
--
-- A studio notice is not a chat message. The minute of latency buys the
-- coalescing window that is the entire rate limit: an admin publishing five
-- notices in half a minute produces ONE notification saying there are five,
-- rather than five buzzes. That is worth far more than the latency costs.
--
-- Re-running this select is how the cadence is changed.

select cron.schedule(
  'portal-push-drain',
  '* * * * *',
  $$select public.run_portal_push()$$
);
