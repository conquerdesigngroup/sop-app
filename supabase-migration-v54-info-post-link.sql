-- =============================================================================
-- v54 -- one link on an info post
--
-- WHAT CHANGES
--
-- portal_updates gains link_url and link_label. Nothing else moves: every read
-- of this table is a select('*'), and every policy on it asks about
-- is_published / class_id / household_id, none of which this touches.
--
-- WHY A COLUMN AND NOT A LINK TYPED INTO THE BODY
--
-- The body is plain text end to end, deliberately: the parent renderer splits
-- it on blank lines and lets React escape every line, because putting
-- staff-authored text through dangerouslySetInnerHTML would make the info post
-- editor stored XSS against every family. The editor's own placeholder says so
-- -- "links are not clickable".
--
-- So a URL in the body is a URL the parent has to retype into a phone browser,
-- which is the same as no link at all. A separate column is the only way to
-- render a real anchor without loosening the body, because the value never
-- passes through a text renderer: it goes straight into an href, where it can
-- be validated as a whole rather than found inside prose.
--
-- WHY THE SCHEME IS CHECKED HERE AS WELL AS TWICE IN THE CLIENT
--
-- Because it ends up in an href, and `javascript:` in an href is the oldest
-- trick there is. calendar_event_attachments.url has been guarded this way
-- since v22 for exactly this reason. The editor's check is for the person
-- typing and saveUpdate's is for every other caller; this one is for
-- everything that is neither -- a script, a console, a future import.
-- =============================================================================

-- 1. The columns -----------------------------------------------------------

alter table public.portal_updates
  add column if not exists link_url   text,
  add column if not exists link_label text;

comment on column public.portal_updates.link_url is
  'Optional http(s) link rendered as a button under the post. NULL = no link.';

comment on column public.portal_updates.link_label is
  'What that button says. NULL falls back to the link host.';

-- 2. The scheme ------------------------------------------------------------

alter table public.portal_updates
  drop constraint if exists portal_updates_link_url_check;
alter table public.portal_updates
  add constraint portal_updates_link_url_check
  check (link_url is null or link_url ~* '^https?://[^[:space:]]+$');

-- 3. A label is only a label when there is something to label ---------------
--
-- A label with no link is dead weight nothing would ever render, and an empty
-- string is not a label. Both collapse to NULL on the way in (see
-- normalizeLinkLabel); this refuses the rows that arrive by some other route.

alter table public.portal_updates
  drop constraint if exists portal_updates_link_label_check;
alter table public.portal_updates
  add constraint portal_updates_link_label_check
  check (link_label is null or (link_url is not null and btrim(link_label) <> ''));
