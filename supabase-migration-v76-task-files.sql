-- =============================================================================
-- v76 -- photos and files on a task, and pictures on a task's steps
--
-- WHAT THIS ADDS
--
-- 1. job_tasks.files and task_templates.files -- jsonb arrays of file records.
-- 2. A private bucket, task-files, readable by staff only.
--
-- Step pictures need no column: they ride inside the existing steps jsonb as
-- steps[].images, the same record shape as files.
--
-- ---------------------------------------------------------------------------
-- WHY A NEW COLUMN AND NOT job_tasks.attachments
-- ---------------------------------------------------------------------------
--
-- The live table already has an `attachments text[]` column. No migration in
-- this repo created it, no code reads or writes it, and it is empty on every
-- row (checked 2026-11-06: 0 of 98). A text[] can only hold a bare string per
-- file, and a file needs a name, a type and a size beside its key to be shown
-- as anything better than a uuid. Rather than change the type of a column
-- whose origin is unknown, it is left alone and `files` is added beside it.
--
-- ---------------------------------------------------------------------------
-- WHY THE RECORD HOLDS A STORAGE KEY, NOT A URL
-- ---------------------------------------------------------------------------
--
-- The bucket is private, so a browser needs a SIGNED url, and a signed url
-- expires. A stored one would turn every picture in every task into a broken
-- image an hour after it was attached. The app signs on read (lib/taskFiles).
--
-- ---------------------------------------------------------------------------
-- WHY is_active_staff() AND NOT `authenticated`
-- ---------------------------------------------------------------------------
--
-- Every parent has an account and is `authenticated`. A screenshot of the
-- front desk computer or a supplier invoice on a task is staff business, so
-- the read test is the same one staff-photos uses (v53).
--
-- Writes are limited to the uploader's own uid folder, like staff-photos, so
-- one person cannot overwrite or delete another's file by guessing its key.
-- Admins may delete anything, for clean-up.
--
-- ---------------------------------------------------------------------------
-- WHY REMOVING A FILE FROM A TASK DOES NOT DELETE THE OBJECT
-- ---------------------------------------------------------------------------
--
-- One object is routinely referenced from several rows: a template's picture
-- is copied by reference into every task made from it, and every copy of a
-- recurring task carries the same records. Deleting the object when it is
-- taken off one task would break it on all the others. The app therefore only
-- deletes an object that was uploaded and then discarded before it was ever
-- saved. Section 3 has a query for finding objects nothing points at.
--
-- Depends on: public.is_active_staff (v10/v28), public.is_admin (v6/v13).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Where a task's files are listed
-- -----------------------------------------------------------------------------

ALTER TABLE public.job_tasks
  ADD COLUMN IF NOT EXISTS files jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.task_templates
  ADD COLUMN IF NOT EXISTS files jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.job_tasks
  DROP CONSTRAINT IF EXISTS job_tasks_files_is_array;
ALTER TABLE public.job_tasks
  ADD CONSTRAINT job_tasks_files_is_array CHECK (jsonb_typeof(files) = 'array');

ALTER TABLE public.task_templates
  DROP CONSTRAINT IF EXISTS task_templates_files_is_array;
ALTER TABLE public.task_templates
  ADD CONSTRAINT task_templates_files_is_array CHECK (jsonb_typeof(files) = 'array');

COMMENT ON COLUMN public.job_tasks.files IS
  'Photos and files attached to the task: [{id, path, name, mimeType, size, uploadedBy, uploadedAt}]. path is a key in the private task-files bucket; the app signs it on read. See v76.';
COMMENT ON COLUMN public.task_templates.files IS
  'Same shape as job_tasks.files; copied by reference into tasks made from the template. See v76.';

-- -----------------------------------------------------------------------------
-- 2. The bucket
-- -----------------------------------------------------------------------------
--
-- 25 MB, the same ceiling as calendar-attachments. No mime list: the ask was
-- "any file", the bucket is private and staff-only, and every object is opened
-- through a signed url on the storage domain, never inlined into the app.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('task-files', 'task-files', false, 26214400, NULL)
ON CONFLICT (id) DO UPDATE
  SET public          = false,
      file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS task_files_read ON storage.objects;
DROP POLICY IF EXISTS task_files_insert_own ON storage.objects;
DROP POLICY IF EXISTS task_files_update_own ON storage.objects;
DROP POLICY IF EXISTS task_files_delete_own ON storage.objects;

CREATE POLICY task_files_read
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'task-files' AND public.is_active_staff());

CREATE POLICY task_files_insert_own
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'task-files'
    AND public.is_active_staff()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY task_files_update_own
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'task-files'
    AND public.is_active_staff()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY task_files_delete_own
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'task-files'
    AND (
      ((storage.foldername(name))[1] = auth.uid()::text AND public.is_active_staff())
      OR public.is_admin()
    )
  );

COMMIT;

-- =============================================================================
-- 3. Finding objects nothing points at
-- =============================================================================
--
-- Read before deleting anything. Removing an object here is permanent.
--
--   WITH referenced AS (
--     SELECT f->>'path' AS path FROM public.job_tasks, jsonb_array_elements(files) f
--     UNION
--     SELECT f->>'path' FROM public.task_templates, jsonb_array_elements(files) f
--     UNION
--     SELECT i->>'path' FROM public.job_tasks, jsonb_array_elements(steps) s,
--            jsonb_array_elements(COALESCE(s->'images', '[]'::jsonb)) i
--     UNION
--     SELECT i->>'path' FROM public.task_templates, jsonb_array_elements(steps) s,
--            jsonb_array_elements(COALESCE(s->'images', '[]'::jsonb)) i
--   )
--   SELECT o.name, o.created_at
--     FROM storage.objects o
--    WHERE o.bucket_id = 'task-files'
--      AND o.name NOT IN (SELECT path FROM referenced WHERE path IS NOT NULL);
--
-- =============================================================================
-- VERIFY
-- =============================================================================
--   select column_name, data_type from information_schema.columns
--    where table_name in ('job_tasks','task_templates') and column_name = 'files';
--   select id, public, file_size_limit from storage.buckets where id = 'task-files';
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- begin;
--   drop policy if exists task_files_read on storage.objects;
--   drop policy if exists task_files_insert_own on storage.objects;
--   drop policy if exists task_files_update_own on storage.objects;
--   drop policy if exists task_files_delete_own on storage.objects;
--   delete from storage.objects where bucket_id = 'task-files';
--   delete from storage.buckets where id = 'task-files';
--   alter table public.job_tasks drop column if exists files;
--   alter table public.task_templates drop column if exists files;
-- commit;
