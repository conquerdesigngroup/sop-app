-- =============================================================================
-- MAINTENANCE -- files in the bucket that no row points at
--
-- Not a migration. Nothing here runs automatically and nothing here is part of
-- the schema; this is the recovery tool for a specific mess, kept because the
-- mess is invisible from inside the app and hard to clean up once made.
--
-- WHAT AN ORPHAN IS
--
-- An object in `portal-documents` with no portal_documents row whose
-- storage_path matches it. The app lists the bucket only by row, so an orphan
-- is invisible in the manager, invisible to parents, still billed, and still
-- counting against the 1 GB free-plan cap.
--
-- WHY YOU CANNOT JUST DELETE THE ROW
--
--   DELETE FROM storage.objects WHERE ...
--   ERROR:  Direct deletion from storage tables is not allowed.
--           Use the Storage API instead.
--   HINT:   This prevents accidental data loss from orphaned objects.
--
-- Supabase blocks it with the trigger storage.protect_delete, and it is right
-- to. The row is only an index; the bytes live in object storage and are
-- removed by the API. Deleting the row alone strands the bytes for good.
--
-- There IS an override, `storage.allow_delete_query`. Do not use it here. It
-- does exactly what the hint warns about and leaves you worse off than before,
-- because an orphan with an index row can still be cleaned up and one without
-- cannot be reached by anything.
--
-- HOW THIS WORKS INSTEAD
--
-- pg_net calls the real Storage API from inside Postgres, authenticated with
-- the service_role_key already in Supabase Vault. The key is read straight
-- into the request header and never reaches the client.
--
-- TWO SAFETY CONDITIONS, BOTH LOAD-BEARING
--
--   no matching row   -- a live file always has one
--   older than 1 hour -- uploadDocument writes the OBJECT first and the ROW
--                        second, so every upload is briefly indistinguishable
--                        from an orphan. Without the age check this would race
--                        a teacher's upload and delete it mid-flight.
--
-- THIS SHOULD STOP HAPPENING
--
-- deleteDocument used to delete the row first and shrug if the file delete
-- failed, which is how two files came to sit here for two days. It now removes
-- the file first and aborts if it cannot, so a failure leaves a row you can
-- retry rather than a file you cannot reach. If this script ever finds
-- anything again, that is worth investigating rather than just cleaning.
-- =============================================================================

-- 1. LOOK FIRST. Never run step 2 without reading this.
select o.name,
       pg_size_pretty((o.metadata->>'size')::bigint) as size,
       o.created_at,
       o.created_at < now() - interval '1 hour' as old_enough_to_delete
  from storage.objects o
 where o.bucket_id = 'portal-documents'
   and not exists (select 1 from portal_documents d where d.storage_path = o.name)
 order by o.created_at;

-- 2. DELETE them through the Storage API. Returns one request id per file.
-- with orphan as (
--   select o.name
--     from storage.objects o
--    where o.bucket_id = 'portal-documents'
--      and o.created_at < now() - interval '1 hour'
--      and not exists (select 1 from portal_documents d where d.storage_path = o.name)
-- )
-- select o.name,
--        net.http_delete(
--          url := 'https://sgppeenmvskwztaszkgn.supabase.co/storage/v1/object/portal-documents/' || o.name,
--          headers := jsonb_build_object(
--            'Authorization',
--            'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
--          ),
--          timeout_milliseconds := 15000
--        ) as request_id
--   from orphan o;

-- 3. CONFIRM. pg_net is asynchronous — the rows above are queued, not done.
-- Give it a few seconds, then check every request id from step 2:
--
--   select id, status_code, content from net._http_response where id in (...);
--   -- 200 {"message":"Successfully deleted"}
--
-- A 400 carrying {"statusCode":"404","code":"NoSuchKey"} means the object was
-- already gone and its index row is stale; that one needs Supabase support or
-- the dashboard, not this script.

-- Run on 2026-08-28 against two files stranded on 26 and 27 August
-- (5.8 MB total). Both returned 200; the bucket was empty afterwards.
