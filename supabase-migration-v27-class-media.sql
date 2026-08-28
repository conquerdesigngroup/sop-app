-- =============================================================================
-- v27 -- a class can hold a video, and a photo is a photo
--
-- WHAT CHANGES
--
-- Two properties of the `portal-documents` bucket, and nothing else. No table,
-- no column, no policy. The rendering half of this change is entirely in the
-- app (src/lib/portalMedia.ts, src/components/portal/DocumentList.tsx) and
-- needs no schema at all -- a photo was always stored fine, it was just never
-- shown.
--
-- 1. allowed_mime_types gains video/mp4, video/quicktime, video/webm.
--
--    quicktime is what an iPhone calls a .mov, which is what a teacher will
--    actually pick; mp4 is the one that plays on every device it might be sent
--    to. Both are accepted rather than forcing a conversion nobody knows how
--    to do, and the upload form names the difference.
--
--    image/gif goes in at the same time. It was on the calendar-attachments
--    bucket and missing here for no reason anyone recorded.
--
-- 2. file_size_limit goes from 25 MB to 50 MB.
--
--    25 MB is roughly twenty seconds of phone video. That is not a routine, so
--    without this the video support above would be theatre.
--
-- THE TWO THINGS TO KNOW BEFORE THIS IS A GOOD IDEA
--
-- 50 MB is not a preference, it is the ceiling. The Supabase FREE plan caps a
-- single upload at 50 MB, so this value cannot be raised further without
-- moving to Pro. A minute of 1080p iPhone video is 60-90 MB, so a long clip
-- will still be refused -- by the bucket, with the app's own message.
--
-- The same plan caps TOTAL storage at 1 GB. Twenty full-size videos fills it,
-- and there is nothing in the app that watches that number or warns anyone.
-- Whoever runs this should keep an eye on Storage in the Supabase dashboard.
--
-- KEEP THIS FILE AND src/lib/portalAdmin.ts IN STEP
--
-- ALLOWED_DOCUMENT_MIME and MAX_DOCUMENT_BYTES there mirror the two values
-- set below, so a bad file is refused in the browser with a sentence instead
-- of at the API with an opaque failure after the whole upload. Change one and
-- the other drifts silently -- the app would start rejecting files the bucket
-- accepts, or promising uploads the bucket will refuse.
--
-- Verification and rollback are at the bottom of the file.
-- =============================================================================

UPDATE storage.buckets
   SET file_size_limit = 50 * 1024 * 1024,
       allowed_mime_types = ARRAY[
         'application/pdf',
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/gif',
         'image/heic',
         'audio/mpeg',
         'audio/mp4',
         'video/mp4',
         'video/quicktime',
         'video/webm',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'text/plain'
       ]
 WHERE id = 'portal-documents';

-- =============================================================================
-- VERIFY
--
--   SELECT id, file_size_limit, allowed_mime_types
--     FROM storage.buckets
--    WHERE id = 'portal-documents';
--   -- file_size_limit  52428800
--   -- allowed_mime_types includes video/mp4, video/quicktime, video/webm
--
--   -- Nothing about who may read it moved. Both buckets still let anon SELECT,
--   -- which is what lets a parent's device sign a URL without an account:
--   SELECT policyname, cmd, roles::text
--     FROM pg_policies
--    WHERE schemaname = 'storage' AND tablename = 'objects'
--      AND policyname LIKE 'portal_docs%'
--    ORDER BY policyname;
--
-- ROLLBACK
--
--   UPDATE storage.buckets
--      SET file_size_limit = 25 * 1024 * 1024,
--          allowed_mime_types = ARRAY[
--            'application/pdf','image/jpeg','image/png','image/webp','image/heic',
--            'audio/mpeg','audio/mp4','application/msword',
--            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
--            'text/plain'
--          ]
--    WHERE id = 'portal-documents';
--
--   -- Rolling back does NOT delete anything already uploaded. A video stored
--   -- while the limit was 50 MB stays readable; the bucket only checks these
--   -- on the way in. Set MAX_DOCUMENT_BYTES and ALLOWED_DOCUMENT_MIME in
--   -- src/lib/portalAdmin.ts back at the same time.
-- =============================================================================
