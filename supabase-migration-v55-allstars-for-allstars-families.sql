-- =============================================================================
-- v55 -- All-Star content is for All-Star families; info posts can go to both
-- =============================================================================
--
-- WHAT CHANGES
--
--   1. can_see_allstars() -- the one definition of an All-Star family.
--   2. The read policies on portal_programs, portal_classes, portal_updates,
--      portal_events, portal_documents, calendar_event_attachments and both
--      storage buckets stop returning All-Star rows to anyone else.
--   3. portal_updates.program_id may be NULL, meaning EVERYONE: one info post
--      for All-Star and Academy/TNT families alike. portal_push_payload learns
--      who to notify for one.
--
-- WHY
--
-- v30 opened every portal read to any signed-in account, on the build decision
-- that any client may see any class. The studio's rule is narrower, and was
-- never written down in the database: the All-Star section is the competition
-- company, and a family with no dancer on a team does not see it -- its
-- schedule, its calendar, its posts or its files.
--
-- Measured on 2026-09-17 before this migration, signed in as a real family
-- whose only enrolments are Academy classes: 30 All-Star classes, 37 All-Star
-- events, the 11 All-Star class videos and the All-Star post, all readable. The
-- portal home drew an All-Star tile for every family and ProgramGate let any
-- session through it, so none of that needed more than a tap.
--
-- WHY THE DATABASE AND NOT THE SCREENS
--
-- Hiding the tile is not the rule, it is one consequence of it. Every screen
-- that could show All-Star content -- the tile, the gate, the dashboard's
-- Updates and Files cards, the schedule, the calendar, a class page, a signed
-- URL -- reads one of the tables below. Filter here and each of them is right
-- by construction, including the ones nobody has written yet; filter in the
-- screens and the next card leaks. It is the same lesson PR #83 recorded for
-- household reads: a visibility rule in the UI ends up doing a security
-- boundary's job.
--
-- WHO IS AN ALL-STAR FAMILY
--
-- A login whose household has an ACTIVE dancer in an ACTIVE enrolment in an
-- active class whose category is 'allstars' -- the category, because that is
-- what PROGRAM_CLASS_CATEGORIES and the schedules key on. Nothing an All-Star
-- family could read before is hidden from them now.
--
-- A student login pinned to one dancer (v51) counts only through that dancer,
-- the same tail as can_see_student() and portal_push_payload: a sibling's team
-- is not theirs.
--
-- Staff -- is_active_staff(): super_admin, admin and team -- see everything, as
-- before. Teachers hold classes in both sections and edit from the same tables.
--
-- CONSEQUENCES WORTH KNOWING BEFORE THEY ARE REPORTED AS BUGS
--
--   * A new All-Star family sees the All-Star section from the first class
--     import that enrols them, not from the day they join the team. That is
--     the safe direction: nobody sees it by mistake, a new family waits.
--   * When a season's All-Star enrolments stop being 'active', those families
--     lose the section until the next season's are imported.
--   * portal_programs_read_anon is untouched. The login screen still names
--     both sections before anyone signs in; names and blurbs are what the
--     studio's public website already prints.
--   * The calendar subscription feed reads with the anon key (see its header),
--     which has read no events at all since v30. Nothing here changes that, and
--     it must not be "fixed" by switching the feed to the service role: that
--     would publish the All-Star calendar at a guessable URL.
--
-- EVERYONE POSTS
--
-- An info post used to belong to exactly one section. The welcome note written
-- to every family on 2026-09-09 had to be filed under one of them, went under
-- All-Stars, and would have vanished for Academy/TNT families the moment this
-- migration ran -- so it was re-addressed to everyone straight after applying
-- it. A NULL program_id is the honest shape for "both": it belongs
-- to no single section, every family can read it, and the CHECK below keeps it
-- studio-wide -- a post addressed to one class or one household always has the
-- section that class or household lives in. Writing one is admin-only without
-- a new policy: its class_id is NULL, and can_edit_portal_class(NULL) is false
-- for everyone who is not an admin.
--
-- ROLLBACK
--
-- Recreate the v30 policies (recorded in supabase-migration-v30-close-anon-
-- door.sql), restore the v51 portal_push_payload, and before setting
-- program_id NOT NULL again give every NULL row a program.
-- =============================================================================

-- 1. Who counts as an All-Star family ----------------------------------------

create or replace function public.can_see_allstars()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_staff()
      or exists (
        select 1
          from public.portal_household_members m
          join public.portal_students s    on s.household_id = m.household_id
          join public.portal_enrollments e on e.student_id = s.id
          join public.portal_classes c     on c.id = e.class_id
         where m.profile_id = auth.uid()
           and (m.member_type = 'guardian' or s.id = m.student_id)
           and s.status = 'active'
           and e.status = 'active'
           and c.is_active
           and c.category = 'allstars'
      );
$$;

revoke all on function public.can_see_allstars() from public, anon;
grant execute on function public.can_see_allstars() to authenticated;

-- 2. Whether a row is All-Star content ---------------------------------------
--
-- SECURITY DEFINER is the point, not a convenience. The lookups have to see the
-- All-Star program and classes that the caller's own policies are about to
-- hide; run as the caller, an Academy family would find no All-Star class to
-- compare against and every All-Star row would pass as safe.
--
-- The program OR the class, because either one makes a row All-Star content.
-- Every row today agrees with its class, and a post on an All-Star class that
-- somebody files under the other section must not slip out through the gap.

create or replace function public.portal_is_allstars(p_program_id uuid, p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.portal_programs
            where id = p_program_id and slug = 'allstars'
         )
      or exists (
           select 1 from public.portal_classes
            where id = p_class_id and category = 'allstars'
         );
$$;

revoke all on function public.portal_is_allstars(uuid, uuid) from public, anon;
grant execute on function public.portal_is_allstars(uuid, uuid) to authenticated;

-- A stored file is All-Star content when it sits under the All-Star folder
-- (buildStoragePath names the folder after the section), belongs to an
-- All-Star document row, or is the All-Star section's hero picture.
create or replace function public.portal_object_is_allstars(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select split_part(p_name, '/', 1) = 'allstars'
      or exists (
           select 1 from public.portal_documents d
            where d.storage_path = p_name
              and public.portal_is_allstars(d.program_id, d.class_id)
         )
      or exists (
           select 1 from public.portal_programs p
            where p.hero_path = p_name and p.slug = 'allstars'
         );
$$;

revoke all on function public.portal_object_is_allstars(text) from public, anon;
grant execute on function public.portal_object_is_allstars(text) to authenticated;

-- A Google calendar is readable when it feeds a section the caller may see.
-- The studio's shared calendar feeds both sections, so its attachments stay
-- open to everyone; the All-Star-only calendar's do not.
create or replace function public.portal_calendar_is_visible(p_calendar_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.portal_calendar_sources s
      join public.portal_programs p on p.id = s.program_id
     where s.google_calendar_id = p_calendar_id
       and s.is_enabled
       and (p.slug <> 'allstars' or public.can_see_allstars())
  );
$$;

revoke all on function public.portal_calendar_is_visible(text) from public, anon;
grant execute on function public.portal_calendar_is_visible(text) to authenticated;

-- 3. The read policies -------------------------------------------------------
--
-- `(select public.can_see_allstars())` is written as a subquery so Postgres
-- evaluates it once per statement rather than once per row. The *_read_staff
-- policies are untouched: they OR with these, and staff pass these anyway.

drop policy if exists "portal_programs_read" on public.portal_programs;
create policy "portal_programs_read" on public.portal_programs
  for select to authenticated
  using (is_active and (slug <> 'allstars' or (select public.can_see_allstars())));

drop policy if exists "portal_classes_read" on public.portal_classes;
create policy "portal_classes_read" on public.portal_classes
  for select to authenticated
  using (
    is_active
    and (category is distinct from 'allstars' or (select public.can_see_allstars()))
  );

-- `household_id is null` stays: v36's notes to one family are read through
-- portal_updates_read_household alone. See the v30 comment on this policy.
drop policy if exists "portal_updates_read" on public.portal_updates;
create policy "portal_updates_read" on public.portal_updates
  for select to authenticated
  using (
    is_published
    and household_id is null
    and ((select public.can_see_allstars()) or not public.portal_is_allstars(program_id, class_id))
  );

drop policy if exists "portal_events_read" on public.portal_events;
create policy "portal_events_read" on public.portal_events
  for select to authenticated
  using (
    is_published
    and ((select public.can_see_allstars()) or not public.portal_is_allstars(program_id, class_id))
  );

drop policy if exists "portal_documents_read" on public.portal_documents;
create policy "portal_documents_read" on public.portal_documents
  for select to authenticated
  using (
    is_published
    and ((select public.can_see_allstars()) or not public.portal_is_allstars(program_id, class_id))
  );

drop policy if exists "calendar_attachments_portal_read" on public.calendar_event_attachments;
create policy "calendar_attachments_portal_read" on public.calendar_event_attachments
  for select to authenticated
  using (public.portal_calendar_is_visible(google_calendar_id));

-- Signed URLs are minted against these, so a hidden row's file must be hidden
-- here too or it stays one createSignedUrl away.
drop policy if exists "portal_docs_read" on storage.objects;
create policy "portal_docs_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'portal-documents'
    and ((select public.can_see_allstars()) or not public.portal_object_is_allstars(name))
  );

-- Was the whole bucket. Staff keep that; a family now reaches only the files
-- hung on events of a calendar it may see.
drop policy if exists "calendar_attachments_read" on storage.objects;
create policy "calendar_attachments_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'calendar-attachments'
    and (
      (select public.is_active_staff())
      or exists (
        select 1
          from public.calendar_event_attachments a
         where a.storage_path = objects.name
           and public.portal_calendar_is_visible(a.google_calendar_id)
      )
    )
  );

-- 4. Info posts for everyone -------------------------------------------------

alter table public.portal_updates
  alter column program_id drop not null;

comment on column public.portal_updates.program_id is
  'The section this post belongs to. NULL = everyone: All-Star and Academy/TNT families alike (v55).';

alter table public.portal_updates
  drop constraint if exists portal_updates_everyone_is_studio_wide;
alter table public.portal_updates
  add constraint portal_updates_everyone_is_studio_wide
  check (program_id is not null or (class_id is null and household_id is null));

-- 5. Who is notified of an everyone post --------------------------------------
--
-- As v51 left it, with three changes, each marked. The old "no longer
-- published" test was `v_program_id is null`, which an everyone post now is by
-- design; FOUND is what that test always meant.

create or replace function public.portal_push_payload(p_kind text, p_source_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
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

  -- v55: FOUND, not `v_program_id is null`.
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'no longer published');
  end if;

  select slug into v_slug from public.portal_programs where id = v_program_id;

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
    -- v55: an everyone post has no one section to open, and the dashboard's
    -- Updates card shows it to every family.
    when v_program_id is null then '/portal'
    else '/portal/' || v_slug || '/updates'
  end;

  select coalesce(jsonb_agg(distinct m.profile_id), '[]'::jsonb)
    into v_recipients
    from public.portal_household_members m
    join public.profiles p on p.id = m.profile_id
   where p.role = 'client'
     and p.is_active
     and coalesce((p.notification_preferences ->> 'pushEnabled')::boolean, true)
     and coalesce(
           (p.notification_preferences ->> v_pref)::boolean,
           case when v_pref = 'newFiles' then false else true end
         )
     and case
       when v_household is not null then
         m.household_id = v_household

       when v_class_id is not null then exists (
         select 1
           from public.portal_enrollments e
           join public.portal_students s on s.id = e.student_id
          where e.class_id = v_class_id
            and e.status = 'active'
            and s.status = 'active'
            and s.household_id = m.household_id
            -- Same tail as can_see_student(): a pinned dancer is not an
            -- audience for a sibling's class.
            and (m.member_type = 'guardian' or s.id = m.student_id)
       )

       -- v55: everyone -- the program-wide rule below, without the program.
       when v_program_id is null then exists (
         select 1
           from public.portal_enrollments e
           join public.portal_students s on s.id = e.student_id
          where e.status = 'active'
            and s.status = 'active'
            and s.household_id = m.household_id
            and (m.member_type = 'guardian' or s.id = m.student_id)
       )

       else exists (
         select 1
           from public.portal_enrollments e
           join public.portal_students s on s.id = e.student_id
           join public.portal_classes c on c.id = e.class_id
          where c.program_id = v_program_id
            and e.status = 'active'
            and s.status = 'active'
            and s.household_id = m.household_id
            -- Same tail as can_see_student(): a pinned dancer is not an
            -- audience for a sibling's class.
            and (m.member_type = 'guardian' or s.id = m.student_id)
       )
     end;

  return jsonb_build_object(
    'valid', true,
    'title', v_title,
    'body', coalesce(v_body, ''),
    'url', v_url,
    'urgent', coalesce(v_pinned, false),
    'preference', v_pref,
    'recipients', v_recipients
  );
end;
$function$;

revoke all on function public.portal_push_payload(text, uuid) from public, anon, authenticated;
grant execute on function public.portal_push_payload(text, uuid) to service_role;
