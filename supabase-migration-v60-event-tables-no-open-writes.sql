-- =============================================================================
-- v60 — CLOSE THE OPEN WRITES ON event_tags AND event_templates
--
-- v28 scoped these two tables' reads to is_active_staff(), because USING (true)
-- meant "staff" only while staff were the only people with logins. Their write
-- policies had the same flaw and were left as they were:
--
--   event_tags       INSERT with check (true), DELETE using (true)
--   event_templates  INSERT with check (true), UPDATE using (true) with check
--                    (true), DELETE using (true)
--
-- all to `authenticated`, which since the portal launch includes every family.
-- Measured 2026-09-19 as a client JWT, inside a transaction that rolled back:
-- the parent could insert into both tables, and an UPDATE or DELETE with no
-- filter reached every row, even though the parent could read none of them.
-- These five were the only write policies in public with a bare `true`.
--
-- Nothing writes to these tables. The app and the edge functions never name
-- them, no function or foreign key depends on them, and both hold 0 rows. So
-- the policies are dropped rather than rescoped: with RLS on and no policy for
-- a command, that command is refused for everyone but the service role. A
-- feature that needs to write here brings a policy scoped to is_active_staff()
-- with it.
--
-- Reads are unchanged (v28, is_active_staff()).
-- =============================================================================

drop policy "Allow authenticated insert event_tags" on public.event_tags;
drop policy "Allow authenticated delete event_tags" on public.event_tags;

drop policy "Allow authenticated insert event_templates" on public.event_templates;
drop policy "Allow authenticated update event_templates" on public.event_templates;
drop policy "Allow authenticated delete event_templates" on public.event_templates;
