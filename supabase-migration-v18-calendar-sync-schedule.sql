-- =============================================================================
-- v18 — the calendars refresh themselves
-- =============================================================================
--
-- STATUS: APPLIED to prod 2026-08-27 as `v18_calendar_sync_schedule`, plus the
--         cron.schedule() call at the bottom.
--
--         DORMANT UNTIL THE VAULT SECRET IS SET. See "The one manual step".
--
-- WHAT THIS FIXES
--
-- Both syncs only ever ran when an admin pressed "Sync now". A date changed in
-- Google was invisible to parents until somebody remembered to press it, which
-- is the kind of chore that gets done for a fortnight and then never again.
--
-- Every 30 minutes, chosen with Tony. The work is two HTTPS fetches and a few
-- dozen upserts, so the cadence is limited by taste rather than cost.
--
-- WHY NOT SYNC WHEN SOMEONE OPENS THE APP
--
-- It was the other option considered, and it is worse in three ways.
--
--   1. The portal is anonymous. Parents are not signed in, and both sync
--      functions require an admin JWT or the service role key. Letting a page
--      load trigger one means an endpoint any stranger can hit.
--   2. Forty parents at 6pm is forty concurrent syncs of the same two feeds,
--      all writing the same rows.
--   3. It does not even help the visit that triggers it. Fetch and parse takes
--      seconds, so that parent still sees stale data; only the NEXT visitor
--      benefits — which is exactly what a schedule delivers without the
--      stampede.
--
-- Not a caching problem, incidentally: Google serves these feeds
-- `no-cache, no-store, max-age=0`, so polling frequently does return current
-- data. The objection is who may trigger it and how many at once.
--
-- WHY A FUNCTION RATHER THAN TWO net.http_post CALLS IN THE JOB BODY
--
-- cron.job stores its command as plain text, readable by anyone who can read
-- the cron schema. Putting the service role key in the command writes it into
-- that table in the clear. The key stays in Vault and is read at run time, so
-- the schedule itself holds nothing secret:
--
--   select command from cron.job;  ->  select public.run_calendar_syncs()
--
-- THE ONE MANUAL STEP
--
-- The service role key must be in Vault under the name `service_role_key`. It
-- is deliberately NOT in this file and was never handled by the assistant that
-- wrote it — it is the key that bypasses every RLS policy in the database.
--
--   select vault.create_secret('<service role key>', 'service_role_key');
--
-- Until then every run fails loudly with
--
--   vault secret "service_role_key" is not set — see v18 migration header
--
-- which is the intended behaviour. A job that silently does nothing is worse
-- than one that says why.
--
-- VERIFYING
--
--   select jobname, schedule, active from cron.job;
--
--   select status, return_message, start_time
--     from cron.job_run_details
--    where jobname = 'calendar-sync-30min'
--    order by start_time desc limit 5;
--
--   -- the thing that actually matters: did the sync write anything
--   select 'staff' as side, name, last_status, last_synced_at from calendar_sources
--   union all
--   select 'portal', p.name, s.last_status, s.last_run_at
--     from portal_calendar_sources s join portal_programs p on p.id = s.program_id;
--
-- TO CHANGE THE CADENCE OR STOP IT
--
--   select cron.schedule('calendar-sync-30min', '*/15 * * * *',
--                        $$select public.run_calendar_syncs()$$);  -- re-times it
--   select cron.unschedule('calendar-sync-30min');                 -- stops it
-- =============================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.run_calendar_syncs()
returns void
language plpgsql
security definer
-- Pinned: a SECURITY DEFINER function without this resolves unqualified names
-- against the caller's search_path, which is how a definer function gets turned
-- into someone else's privilege escalation.
set search_path = public, extensions, vault, net
as $$
declare
  key text;
begin
  select decrypted_secret into key
    from vault.decrypted_secrets
   where name = 'service_role_key';

  if key is null then
    raise exception
      'vault secret "service_role_key" is not set — see v18 migration header';
  end if;

  -- Fire and forget. pg_net queues the request and returns an id immediately;
  -- it does not hold the cron worker open for the length of two ICS fetches.
  -- The outcome of each run lands in the sources' last_status either way, which
  -- is the thing worth reading.
  perform net.http_post(
    url     := 'https://sgppeenmvskwztaszkgn.supabase.co/functions/v1/staff-calendar-sync',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || key),
    body    := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 55000
  );

  perform net.http_post(
    url     := 'https://sgppeenmvskwztaszkgn.supabase.co/functions/v1/portal-calendar-sync',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || key),
    body    := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 55000
  );
end;
$$;

-- It reads the service role key. Nobody holding an anon or user JWT gets to
-- call it, and PostgREST must not expose it at all.
revoke all on function public.run_calendar_syncs() from public;
revoke all on function public.run_calendar_syncs() from anon;
revoke all on function public.run_calendar_syncs() from authenticated;

comment on function public.run_calendar_syncs() is
  'Invoked by the calendar-sync-30min cron job. Reads service_role_key from Vault and POSTs to both sync Edge Functions. Not callable by anon or authenticated.';

-- Applied separately from the migration above, because cron.schedule() is a
-- call rather than DDL and re-running it is how you re-time the job.
select cron.schedule(
  'calendar-sync-30min',
  '*/30 * * * *',
  $$select public.run_calendar_syncs()$$
);
