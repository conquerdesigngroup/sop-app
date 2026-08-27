-- =============================================================================
-- v17 — the parent portal subscribes to Google too
-- =============================================================================
--
-- STATUS: APPLIED to prod 2026-08-27, in three steps run through the Supabase
--         MCP connection rather than as one file. Recorded here in the order
--         they were applied so the repo describes the database that exists.
--
-- WHAT THIS FINISHES
--
-- v16 moved the STAFF calendar off the Google Calendar API and onto iCal feeds.
-- portal_calendar_sources still expected the service account, which is why it
-- had sat empty since phase 2 and why the two portal pages showed only the four
-- sample events each. This gives it the same two columns and points each
-- program at a calendar, so there is one way this studio talks to Google.
--
-- WHICH CALENDAR FEEDS WHICH PAGE
--
--   All-Star Dancers        -> DIDC - ALLSTARS
--   Academy / TNT Dancers   -> DIDC - CALENDER
--
-- Academy points at the same calendar the staff Calendar shows as "Studio".
-- That is deliberate and not a mistake to tidy up: portal_events and
-- calendar_events are separate tables with separate syncs, each owning its own
-- rows, so a studio-wide date appearing on both the staff calendar and the
-- Academy parent page is the intended result. Give Academy its own Google
-- calendar if that stops being what you want.
--
-- THE FEEDS ARE PUBLIC
--
-- Same constraint v16 hit: Workspace policy on didancecenter.com removes the
-- "Secret address in iCal format" field, so the public feed is the only feed.
-- Anyone with the URL can read these calendars. Keep private detail out of
-- event titles and descriptions.
--
-- Note also that a calendar made public defaults to free/busy only, which
-- renders every title as the literal word "Busy". Both calendars here have
-- "See all event details" set for public users; check that first if a sync
-- reports a healthy count of events that all say Busy.
-- =============================================================================


-- 1 ---------------------------------------------------------------- columns
--
-- Mirrors v16's shape on calendar_sources exactly. time_zone is carried even
-- though portal_events stores real timestamptz instants and so needs no
-- wall-clock splitting: it documents the calendar the feed came from, and the
-- column costs nothing against two rows.

alter table public.portal_calendar_sources
  add column if not exists ics_url   text,
  add column if not exists time_zone text not null default 'America/Los_Angeles';


-- 2 ------------------------------------------------------------ the sources
--
-- days_back 60 so a parent opening the app in October still sees September's
-- competition; days_ahead 365 to cover a full season. publish_imported is true
-- because an event a parent cannot see is not worth syncing — anything that
-- should be private should not be on a public feed in the first place.

insert into public.portal_calendar_sources
  (program_id, google_calendar_id, ics_url, time_zone,
   is_enabled, days_back, days_ahead, publish_imported)
select p.id, v.cal_id,
       'https://calendar.google.com/calendar/ical/'
         || replace(v.cal_id, '@', '%40') || '/public/basic.ics',
       'America/Los_Angeles', true, 60, 365, true
from (values
  ('allstars', 'c_6297b14bc3f4f314b85c1ee2b36060e12688a9a64820d621468d132a9cb4ce84@group.calendar.google.com'),
  ('academy',  'c_5ec521b88928c8224d641a7b1f068a286492fffcdae90f6a421fb53b96ea1da1@group.calendar.google.com')
) as v(slug, cal_id)
join public.portal_programs p on p.slug = v.slug
on conflict (program_id) do update
  set google_calendar_id = excluded.google_calendar_id,
      ics_url            = excluded.ics_url,
      time_zone          = excluded.time_zone,
      is_enabled         = true;


-- 3 --------------------------------------------------- the sample content out
--
-- Every class, update and event seeded by supabase-portal-sample-content.sql
-- was invented, and once the real Google dates arrived the two sat side by side
-- with nothing telling a parent which was which.
--
-- Deleted by the seed's own timestamps rather than by title, so anything the
-- studio has written since is untouched. `source <> 'google'` on the events is
-- belt and braces — the seeded rows all predate the sync — and keeps this from
-- ever deleting a synced row if it is re-run.
--
-- WHAT CASCADES, WHICH IS THE PART THAT BIT
--
-- portal_documents.class_id and portal_updates.class_id are both ON DELETE
-- CASCADE. Deleting a class silently deletes every document and update attached
-- to it. A 'TEST CLASS' the studio had added by hand was removed alongside the
-- seed and took two uploaded images and one real update with it. The storage
-- objects survive a row delete, so the documents were rebuilt from
-- storage.objects; the update's body was gone.
--
-- Snapshot the rows before deleting a class. The backup table below is what
-- that looked like, and it is why the classes came back cheaply and the update
-- did not.

create table if not exists public.portal_sample_backup_20260827 (
  tbl          text,
  row          jsonb,
  backed_up_at timestamptz default now()
);
alter table public.portal_sample_backup_20260827 enable row level security;

-- No policies, so only the service role reads it. It is a safety net, not app
-- data, and it holds a copy of everything the deletes below removed.

insert into public.portal_sample_backup_20260827 (tbl, row)
select 'classes', to_jsonb(c) from public.portal_classes c
 where c.created_at = '2026-08-21 22:56:07.613089+00' or c.name = 'TEST CLASS';
insert into public.portal_sample_backup_20260827 (tbl, row)
select 'class_instructors', to_jsonb(i) from public.portal_class_instructors i
 where i.class_id in (select id from public.portal_classes
                       where created_at = '2026-08-21 22:56:07.613089+00'
                          or name = 'TEST CLASS');
insert into public.portal_sample_backup_20260827 (tbl, row)
select 'updates', to_jsonb(u) from public.portal_updates u
 where u.created_at = '2026-08-21 22:56:41.135319+00';
insert into public.portal_sample_backup_20260827 (tbl, row)
select 'events', to_jsonb(e) from public.portal_events e
 where e.created_at = '2026-08-21 22:56:41.135319+00' and e.source <> 'google';

delete from public.portal_class_instructors
 where class_id in (select id from public.portal_classes
                     where created_at = '2026-08-21 22:56:07.613089+00'
                        or name = 'TEST CLASS');
delete from public.portal_classes
 where created_at = '2026-08-21 22:56:07.613089+00' or name = 'TEST CLASS';
delete from public.portal_updates
 where created_at = '2026-08-21 22:56:41.135319+00';
delete from public.portal_events
 where created_at = '2026-08-21 22:56:41.135319+00' and source <> 'google';

-- The two images, rebuilt from the surviving storage objects. Re-attached to
-- the program rather than to a class, because the class they hung off is gone.
--
-- THEN DELETED AGAIN, and the reason is worth keeping. A portal_documents row
-- with class_id IS NULL is unreachable from every screen:
--
--   * /portal/:program/documents is a redirect to ../classes.
--   * ClassDetail fetches documents with a class id, never `null`.
--   * DocumentsSection is only ever rendered from ClassWorkspace, always with
--     `scope`, and filters `d.classId === scope.classId`.
--
-- So the studio could neither see nor delete them, and the `!scope` branch of
-- DocumentsSection — the one carrying allowStudioWide — cannot render at all.
-- Program-wide documents are a retired concept here, not a broken one: files
-- belong to a class now. The INSERT is kept below as the restore recipe if a
-- studio-wide surface ever comes back; it is followed by the delete that is
-- actually in effect.
insert into public.portal_documents
  (id, program_id, class_id, title, description, category, storage_path,
   file_name, mime_type, size_bytes, sort_order, is_published, uploaded_by,
   created_at, updated_at)
values
  ('6cf6589d-3b18-4dcc-97e4-0616c29744c6',
   'f8884351-8ca4-4e30-86a1-14269c7439ca', null, 'IMG_4119', '', null,
   'allstars/af7b80ad-2e45-4c6c-b692-f1e4472201dc-img_4119.jpeg', 'IMG_4119.jpeg',
   'image/jpeg', 3368492, 0, true, '5c105738-9614-4ba8-bc01-1a69fc9105fa',
   '2026-08-26 22:39:20.320155+00', now()),
  ('939510f3-3177-4d07-961e-f0c745ad3a16',
   'f8884351-8ca4-4e30-86a1-14269c7439ca', null, 'IMG_3602', '', null,
   'allstars/8c16f100-750a-4f62-9ad1-47384cda7ce1-img_3602.jpeg', 'IMG_3602.jpeg',
   'image/jpeg', 2727971, 0, true, 'd212908e-9790-40af-b692-cbfc5933a351',
   '2026-08-27 00:26:46.538016+00', now())
on conflict (id) do nothing;

-- Unreachable, so removed. The storage objects are deliberately left in place:
-- they are the only copy, and an orphaned object costs bytes while a broken
-- download costs a parent's trust.
delete from public.portal_documents where class_id is null;


-- ----------------------------------------------------------------- verifying
--
-- After running portal-calendar-sync, both rows should report ok with a
-- non-zero count. last_status null means it has never run, which is what the
-- portal pages looked like for a day.
--
--   select p.name, s.last_status, s.last_upserted, s.last_run_at
--     from portal_calendar_sources s
--     join portal_programs p on p.id = s.program_id;
