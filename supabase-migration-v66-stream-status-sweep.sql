-- =============================================================================
-- v66 — keep class videos' status current without anyone watching
-- =============================================================================
--
-- THE BUG
--
-- A video row is written as stream_status = 'pending' the moment its upload
-- finishes, and the only thing that ever moved it on was the editor's Files
-- list: while it was open it asked portal-stream `status` every ten seconds,
-- for at most ten minutes. Upload three videos back to back, or close the tab
-- before Cloudflare finishes encoding, and the row stays 'pending' for good.
--
-- On 2026-09-23 six rows were in that state, the oldest five days old. Every
-- one was playable on Cloudflare (manifest and thumbnail 200). Parents saw
-- "Still processing — check back in a few minutes" instead of a player, and
-- five more ready videos had never had their MP4 requested, so no Download.
--
-- THE FIX
--
-- portal-stream gained a `sweep` action (service role only) that runs the
-- same check for every unfinished video from the last 30 days. This schedules
-- it every five minutes — the same shape as run_alert_push() in v38: the
-- service-role key from Vault, a fire-and-forget net.http_post.
--
-- It checks the table FIRST and makes no call at all when nothing is
-- unfinished, which is almost always: the cron fires 288 times a day and the
-- function should run a handful of those.
-- =============================================================================

create or replace function public.run_portal_stream_sweep()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  key text;
begin
  -- The same predicate the function's sweep uses. Keep the two in step.
  if not exists (
    select 1
    from public.portal_documents
    where stream_uid is not null
      and created_at >= now() - interval '30 days'
      and (stream_status = 'pending'
           or (stream_status = 'ready' and stream_download_url is null))
  ) then
    return;
  end if;

  select decrypted_secret into key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if key is null then
    raise exception 'vault secret service_role_key is missing';
  end if;

  perform net.http_post(
    url := 'https://sgppeenmvskwztaszkgn.supabase.co/functions/v1/portal-stream',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || key
    ),
    body := '{"action":"sweep"}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.run_portal_stream_sweep() from public, anon, authenticated;

-- ---------------------------------------------------------------- schedule
-- A call, not DDL, so it sits at the end; re-running it replaces the job.

select cron.schedule(
  'portal-stream-sweep',
  '*/5 * * * *',
  $$select public.run_portal_stream_sweep()$$
);
