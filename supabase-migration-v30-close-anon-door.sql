-- =============================================================================
-- Migration v30 — close the anon door on portal content
-- =============================================================================
--
-- ⚠️  NOT YET APPLIED. Apply this at the moment REACT_APP_CLIENT_AUTH flips to
-- true in production, and not a minute before.
--
-- WHY IT WAITS
--
-- The live access-code portal reads every portal_* table and signs storage URLs
-- with the `anon` role — that is the entire mechanism of the no-login portal.
-- Running this migration while the access-code portal is still the live path
-- logs every parent out of everything instantly. Conversely, until it runs, a
-- client login is decorative: the data stays readable without one. So this
-- migration IS the flag flip, database-side. Sequence on launch day:
--
--   1. Set REACT_APP_CLIENT_AUTH=true in Vercel, redeploy.
--   2. Apply this migration.
--   3. Smoke-test: a signed-out visitor sees the portal login, a signed-in
--      client sees content, staff see everything they saw before.
--
-- Rollback is the mirror: re-create the anon policies (they are all recorded
-- here) and flip the flag back off.
--
-- WHAT STAYS OPEN, DELIBERATELY
--
--   * portal_programs stays readable by anon. The portal login/sign-up screens
--     and the public chooser page render before any session exists, and the
--     program list is names and blurbs already printed on the studio's public
--     website. Everything with substance (classes, documents, updates, events,
--     files) closes.
--   * verify_portal_code() keeps its anon grant while the legacy access-code
--     path remains in the bundle (the spec keeps both paths for two weeks after
--     the flip). Remove it together with the access-code UI.

-- Classes, documents, updates, events: anon out, any signed-in account in.
-- Per the build decision, any logged-in client may view any class's materials,
-- so `authenticated` is the correct grain — no per-student policy.

drop policy "portal_classes_read" on public.portal_classes;
create policy "portal_classes_read" on public.portal_classes
  for select to authenticated using (is_active);

drop policy "portal_documents_read" on public.portal_documents;
create policy "portal_documents_read" on public.portal_documents
  for select to authenticated using (is_published);

drop policy "portal_updates_read" on public.portal_updates;
create policy "portal_updates_read" on public.portal_updates
  for select to authenticated using (is_published);

drop policy "portal_events_read" on public.portal_events;
create policy "portal_events_read" on public.portal_events
  for select to authenticated using (is_published);

-- Was: to anon, authenticated USING (is_active). anon keeps a policy of its
-- own so the pre-login screens can name the programs — see the header.
drop policy "portal_programs_read" on public.portal_programs;
create policy "portal_programs_read" on public.portal_programs
  for select to authenticated using (is_active);
create policy "portal_programs_read_anon" on public.portal_programs
  for select to anon using (is_active);

-- The portal-documents bucket: signed URLs are minted against storage RLS, so
-- anon must lose SELECT here too or every file stays one createSignedUrl away.
drop policy "portal_docs_read" on storage.objects;
create policy "portal_docs_read" on storage.objects
  for select to authenticated using (bucket_id = 'portal-documents');

-- Calendar attachments shown on the portal calendar (scoped to portal
-- calendars by is_portal_calendar). Same reasoning as the bucket above.
drop policy "calendar_attachments_anon_read" on public.calendar_event_attachments;
create policy "calendar_attachments_portal_read" on public.calendar_event_attachments
  for select to authenticated using (is_portal_calendar(google_calendar_id));

drop policy "calendar_attachments_read" on storage.objects;
create policy "calendar_attachments_read" on storage.objects
  for select to authenticated using (bucket_id = 'calendar-attachments');
