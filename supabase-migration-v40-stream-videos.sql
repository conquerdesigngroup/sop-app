-- =============================================================================
-- Migration v40 — class videos live in Cloudflare Stream
-- =============================================================================
--
-- WHY THIS EXISTS
--
-- A phone records a 30-minute class as 1 to 3 GB. Supabase Storage keeps the
-- file exactly as recorded, every parent who watches pulls the whole thing
-- down again, and an iPhone .mov often will not play on Android at all. A
-- video service exists to solve precisely that: the teacher's phone uploads
-- straight to Cloudflare Stream, Stream re-encodes it into several sizes and
-- serves the one each viewer's connection can carry. Photos, PDFs and audio
-- stay in the bucket; nothing about them changes.
--
-- WHAT CHANGES
--
-- portal_documents gains four nullable columns and one rule:
--
--   stream_uid           Cloudflare's 32-hex video id. UNIQUE.
--   stream_playback_url  https://customer-<code>.cloudflarestream.com/<uid>
--                        Stored because the customer code is per account and
--                        the app should not carry it as config. Append
--                        /iframe, /watch or /thumbnails/thumbnail.jpg.
--   stream_status        pending → ready | error, written by the portal-stream
--                        Edge Function when it asks Cloudflare.
--   duration_seconds     Reported by Cloudflare once processed.
--
--   storage_path becomes nullable, and a CHECK says a row lives in exactly one
--   place: bucket (storage_path, nothing Stream) or Stream (stream_uid + status
--   + playback url, no storage_path). Half-filled rows are the bug this rules
--   out — a row with a uid but no playback url would render nothing for
--   parents and be invisible as a fault.
--
-- WHAT DOES NOT CHANGE
--
-- No policy moves. Reads are `is_published` for everyone and staff-scoped for
-- authors as before; the new columns ride along under `select *`. The bucket,
-- its limit (v39) and its policies are untouched — anything that is not a
-- video still goes there.
--
-- THE OTHER HALF
--
-- supabase/functions/portal-stream/index.ts mints upload tickets, reports
-- status and deletes videos, using two secrets set on that function:
-- CF_ACCOUNT_ID and CF_STREAM_TOKEN (a Cloudflare API token with Stream Edit
-- and nothing else). src/lib/portalStream*.ts is the client side.
--
-- Applied via the Supabase MCP as v40_stream_videos.
-- =============================================================================

BEGIN;

ALTER TABLE public.portal_documents
  ALTER COLUMN storage_path DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS stream_uid          text,
  ADD COLUMN IF NOT EXISTS stream_playback_url text,
  ADD COLUMN IF NOT EXISTS stream_status       text,
  ADD COLUMN IF NOT EXISTS duration_seconds    integer;

ALTER TABLE public.portal_documents
  ADD CONSTRAINT portal_documents_stream_uid_key UNIQUE (stream_uid),
  ADD CONSTRAINT portal_documents_stream_status_check
    CHECK (stream_status IS NULL OR stream_status IN ('pending', 'ready', 'error')),
  ADD CONSTRAINT portal_documents_duration_check
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  ADD CONSTRAINT portal_documents_one_home CHECK (
    (storage_path IS NOT NULL
      AND stream_uid IS NULL AND stream_status IS NULL AND stream_playback_url IS NULL)
    OR
    (storage_path IS NULL
      AND stream_uid IS NOT NULL AND stream_status IS NOT NULL AND stream_playback_url IS NOT NULL)
  );

-- The staff screen polls only rows still encoding; keep that lookup cheap.
CREATE INDEX IF NOT EXISTS idx_portal_documents_stream_pending
  ON public.portal_documents (stream_uid)
  WHERE stream_status = 'pending';

COMMIT;

-- =============================================================================
-- VERIFY
--
--   SELECT column_name, is_nullable, data_type
--     FROM information_schema.columns
--    WHERE table_name = 'portal_documents'
--      AND column_name IN ('storage_path','stream_uid','stream_playback_url','stream_status','duration_seconds');
--   -- storage_path YES; the four new columns present
--
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.portal_documents'::regclass AND conname LIKE 'portal_documents_%';
--
-- ROLLBACK
--
--   Only safe once no row has a stream_uid (those rows would violate NOT NULL):
--
--   ALTER TABLE public.portal_documents
--     DROP CONSTRAINT portal_documents_one_home,
--     DROP CONSTRAINT portal_documents_duration_check,
--     DROP CONSTRAINT portal_documents_stream_status_check,
--     DROP CONSTRAINT portal_documents_stream_uid_key,
--     DROP COLUMN duration_seconds, DROP COLUMN stream_status,
--     DROP COLUMN stream_playback_url, DROP COLUMN stream_uid,
--     ALTER COLUMN storage_path SET NOT NULL;
--   DROP INDEX IF EXISTS idx_portal_documents_stream_pending;
-- =============================================================================
