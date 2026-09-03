-- =============================================================================
-- Migration v41 — a downloadable MP4 for each class video
-- =============================================================================
--
-- WHY THIS EXISTS
--
-- v40 put class videos on Cloudflare Stream, which plays them but hands out
-- no file: the only original is the multi-gigabyte upload. Parents asked for
-- a download. Stream can build an MP4 per video on request, but it builds it
-- after the encode finishes and takes a while about it, so a row has to
-- remember whether the file exists yet. A Download button that 404s for the
-- first few minutes is worse than one that appears when the file does.
--
--   stream_download_url  https://customer-<code>.cloudflarestream.com/<uid>/downloads/default.mp4
--                        once Cloudflare reports the MP4 ready; null before.
--                        Written by the portal-stream function's status
--                        action, which the staff screen polls.
--
-- Only a Stream row may carry one; bucket files download through signed URLs.
-- =============================================================================

ALTER TABLE public.portal_documents
  ADD COLUMN IF NOT EXISTS stream_download_url text;

ALTER TABLE public.portal_documents
  ADD CONSTRAINT portal_documents_download_needs_stream
    CHECK (stream_download_url IS NULL OR stream_uid IS NOT NULL);

-- Rollback:
--   ALTER TABLE public.portal_documents
--     DROP CONSTRAINT portal_documents_download_needs_stream,
--     DROP COLUMN stream_download_url;
