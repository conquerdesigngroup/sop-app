-- =============================================================================
-- v24 — the last two places that still say "updates"
-- =============================================================================
--
-- STATUS: NOT YET APPLIED. Content only — no schema change, no functions.
--
-- The section is called Info now, everywhere a parent meets it. Two strings did
-- not come along, because they are not in the code: portal_programs.blurb is
-- read from the database on purpose, so that renaming a section does not need a
-- deploy. Which cuts both ways — a deploy does not rename it either.
--
--   All-Star Dancers       Competition team schedules, updates and documents
--   Academy / TNT Dancers  Class schedules, updates and documents
--
-- Both are the subtitle under the tile on the portal home screen, directly
-- above a nav tile now labelled Info.
--
-- Written as a targeted replace() rather than two literal UPDATEs so that a
-- blurb edited in the meantime keeps its edit and only loses the stale word.
-- =============================================================================

BEGIN;

UPDATE public.portal_programs
SET blurb = replace(replace(blurb, 'updates', 'info'), 'Updates', 'Info')
WHERE blurb LIKE '%pdates%';

COMMIT;

-- =============================================================================
-- VERIFY
-- =============================================================================
--
--   SELECT slug, blurb FROM public.portal_programs ORDER BY sort_order;
--
-- Expected:
--   allstars   Competition team schedules, info and documents
--   academy    Class schedules, info and documents
--
-- And nothing left anywhere:
--
--   SELECT slug, blurb FROM public.portal_programs WHERE blurb ILIKE '%update%';
--   -- 0 rows
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
--   UPDATE public.portal_programs
--   SET blurb = replace(blurb, 'info', 'updates')
--   WHERE blurb LIKE '%info%';
--
-- =============================================================================
