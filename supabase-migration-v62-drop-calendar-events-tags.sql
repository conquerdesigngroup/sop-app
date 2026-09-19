-- =============================================================================
-- v62 — DROP calendar_events.tags
--
-- The column was meant for ids from event_tags, which v61 dropped. Nothing fills it
-- now. The staff calendar is a Google subscription, and a Google event carries
-- no tags. Checked 2026-09-19 before dropping:
--
--   * all 72 rows hold the default '{}'; none is null and none has a value
--   * the only thing depending on the column is its own default; no index,
--     view, trigger, rule, policy, cron job or function body uses it
--   * the app reads the table with select=* and only copied the value into
--     CalendarEvent.tags, which nothing read; the field, the copy and the dev
--     fixture's value are removed with this
--   * the writers leave it out: staff-calendar-push builds its row from an
--     8-field allowlist plus fixed keys, and staff-calendar-sync writes
--     through staff_sync_google_events, whose insert lists its columns
--   * pg_stat_statements has one signed-in PostgREST insert that listed tags,
--     5 calls, first seen 2026-02-12. No commit contains the code that made it.
--     The API logs from 2026-08-20 show every write to this table came from
--     the push function, and none named tags
--
-- Dropping a column is a catalog change and does not rewrite the table. The
-- lock is brief, but staff-calendar-sync upserts every minute, so a lock
-- timeout stops the ALTER from queuing behind a slow query and blocking reads.
-- If it times out, run it again.
--
-- To undo (every row held '{}', so the data comes back exactly; the column
-- comes back at the end of the table, so select * orders it differently):
--
--   alter table public.calendar_events add column tags text[] default '{}'::text[];
-- =============================================================================

set local lock_timeout = '5s';

alter table public.calendar_events drop column tags;
