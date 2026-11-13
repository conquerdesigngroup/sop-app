-- =============================================================================
-- v83 -- photos and files in a shift report's chat
--
-- WHAT THIS ADDS
--
-- 1. shift_report_comments.files -- a jsonb array of file records, the same
--    shape as job_tasks.files (v76): {id, path, name, mimeType, size,
--    uploadedBy, uploadedAt}.
-- 2. A message may now be files with no words. The body check from v77 is
--    replaced with one that accepts an empty body when the message has files.
--
-- WHY THE task-files BUCKET AND NOT A NEW ONE
--
-- It already has exactly the rules a shift report's chat needs: private, read
-- by active staff only (parents are `authenticated`, so that is not the test),
-- writes only into the uploader's own uid folder, 25 MB per file, any type.
-- The chat itself is staff-only (v77), so a file in it has the same audience
-- as a file on a task. A second bucket would be a second copy of four
-- policies to keep in step.
--
-- WHY DELETING A MESSAGE DELETES ITS FILES (unlike a task, v76)
--
-- A task file is shared by reference between a template and every task made
-- from it, so removing it from one row must not delete the object. A chat
-- file is uploaded for one message and nothing else ever points at it, so the
-- app removes the object when the message is deleted. The storage delete
-- policy from v76 already allows that for the uploader and for an admin.
--
-- Depends on: v76 (task-files bucket), v77 (shift_report_comments).
-- =============================================================================

BEGIN;

ALTER TABLE public.shift_report_comments
  ADD COLUMN IF NOT EXISTS files jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.shift_report_comments
  DROP CONSTRAINT IF EXISTS shift_report_comments_files_is_array;
ALTER TABLE public.shift_report_comments
  ADD CONSTRAINT shift_report_comments_files_is_array
  CHECK (jsonb_typeof(files) = 'array' AND jsonb_array_length(files) <= 10);

-- v77 declared the body check inline, so Postgres named it
-- shift_report_comments_body_check.
ALTER TABLE public.shift_report_comments
  DROP CONSTRAINT IF EXISTS shift_report_comments_body_check;
ALTER TABLE public.shift_report_comments
  DROP CONSTRAINT IF EXISTS shift_report_comments_body_or_files;
ALTER TABLE public.shift_report_comments
  ADD CONSTRAINT shift_report_comments_body_or_files
  CHECK (
    char_length(body) <= 4000
    AND (char_length(btrim(body)) >= 1 OR jsonb_array_length(files) >= 1)
  );

COMMENT ON COLUMN public.shift_report_comments.files IS
  'Photos and files sent with the message: [{id, path, name, mimeType, size, uploadedBy, uploadedAt}]. path is a key in the private task-files bucket; the app signs it on read. See v83.';

COMMIT;

-- =============================================================================
-- VERIFY
-- =============================================================================
--   select column_name, data_type from information_schema.columns
--    where table_name = 'shift_report_comments' and column_name = 'files';
--   select conname from pg_constraint
--    where conrelid = 'public.shift_report_comments'::regclass and contype = 'c';
--   -- expect shift_report_comments_files_is_array and
--   -- shift_report_comments_body_or_files, and no shift_report_comments_body_check
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- begin;
--   delete from public.shift_report_comments where char_length(btrim(body)) = 0;
--   alter table public.shift_report_comments drop constraint if exists shift_report_comments_body_or_files;
--   alter table public.shift_report_comments drop constraint if exists shift_report_comments_files_is_array;
--   alter table public.shift_report_comments drop column if exists files;
--   alter table public.shift_report_comments
--     add constraint shift_report_comments_body_check
--     check (char_length(btrim(body)) between 1 and 4000);
-- commit;
