-- =============================================================================
-- Parent portal — SAMPLE CONTENT
--
-- STATUS: APPLIED to prod 2026-08-21 so the portal can be reviewed with
--         something in it. Every class, teacher, update and event below is
--         INVENTED. Replace it with the studio's real class list.
-- =============================================================================
--
-- TO WIPE ALL SAMPLE CONTENT (leaves the two programs and their access codes):
--
--   DELETE FROM public.portal_updates;
--   DELETE FROM public.portal_events;
--   DELETE FROM public.portal_documents;
--   DELETE FROM public.portal_class_instructors;
--   DELETE FROM public.portal_classes;
--
-- Documents are deliberately NOT seeded. A portal_documents row points at an
-- object in the private `portal-documents` bucket, and seeding a row without
-- uploading the file gives parents a download that fails. Real files arrive
-- with the upload UI in phase 3; until then Documents shows its empty state,
-- which is the honest result.
--
-- TWO THINGS THIS FILE DEMONSTRATES, WORTH COPYING WHEN ENTERING REAL DATA
--
-- 1. Class times are `time` columns with no timezone. '16:30' is 4:30pm at the
--    studio, full stop. Do not convert them.
--
-- 2. Event timestamps are timestamptz and the two kinds are built differently:
--
--    TIMED events are constructed at studio wall-clock and converted, so a
--    5pm rehearsal is 5pm in Moreno Valley rather than 5pm UTC:
--
--      (local_midnight + interval '17 hours') AT TIME ZONE 'America/Los_Angeles'
--
--    ALL-DAY events are stored at UTC midnight, the same convention iCal uses
--    for DATE values, because that is what the portal renderer reads them in:
--
--      date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
--
--    Getting this backwards shifts an all-day event to the previous day for
--    every parent in California. See formatEventDate in src/lib/portal.ts.
-- =============================================================================

-- Classes ---------------------------------------------------------------------
WITH prog AS (
  SELECT id, slug FROM public.portal_programs WHERE slug IN ('allstars','academy')
)
INSERT INTO public.portal_classes
  (program_id, name, day_of_week, start_time, end_time, level, location, instructor_name, description, sort_order)
SELECT p.id, v.name, v.dow, v.starts::time, v.ends::time, v.level, v.room, v.teacher, v.descr, v.ord
FROM prog p
JOIN (VALUES
  ('allstars', 'Senior Elite Jazz',           2, '16:30', '18:00', 'Senior',     'Studio A', 'Miss Sarah',
   'Competition jazz for the senior elite team. Jazz shoes and a water bottle every week.', 1),
  ('allstars', 'Senior Elite Contemporary',   2, '18:00', '19:30', 'Senior',     'Studio A', 'Miss Sarah',
   'Runs straight after jazz. Bring a change of shoes.', 2),
  ('allstars', 'Junior Elite Hip Hop',        4, '17:00', '18:00', 'Junior',     'Studio B', 'Mr. Devon',
   'Clean sneakers only — no outdoor shoes on the floor.', 3),
  ('allstars', 'Mini All-Stars',              6, '10:00', '11:00', 'Mini',       'Studio B', 'Miss Gina',
   'Our youngest competition group. Parents welcome to watch the last ten minutes.', 4),
  ('academy',  'TNT Jazz & Tap Combo',        1, '16:00', '17:00', 'Ages 6–8',   'Studio B', 'Miss Gina',
   'Half jazz, half tap. Both pairs of shoes needed.', 1),
  ('academy',  'Academy Ballet I',            3, '16:30', '17:30', 'Beginner',   'Studio A', 'Miss Leeora',
   'Hair in a bun, pink tights, black leotard.', 2),
  ('academy',  'Academy Hip Hop',             3, '17:30', '18:30', 'All levels', 'Studio B', 'Mr. Devon',
   '', 3),
  ('academy',  'Tiny Tots Creative Movement', 6, '09:00', '09:45', 'Ages 3–5',   'Studio B', 'Miss Samantha',
   'Forty-five minutes, and a grown-up stays in the building.', 4)
) AS v(slug, name, dow, starts, ends, level, room, teacher, descr, ord)
  ON v.slug = p.slug;

-- Events ----------------------------------------------------------------------
WITH prog AS (SELECT id, slug FROM public.portal_programs),
local_midnight AS (SELECT date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AS t),
utc_midnight   AS (SELECT date_trunc('day', now() AT TIME ZONE 'UTC') AS t)
INSERT INTO public.portal_events (program_id, title, description, starts_at, ends_at, is_all_day, location)
SELECT p.id, v.title, v.descr,
       CASE WHEN v.all_day
            THEN (u.t + (v.day_offset || ' days')::interval) AT TIME ZONE 'UTC'
            ELSE (l.t + (v.day_offset || ' days')::interval + (v.start_hour || ' hours')::interval) AT TIME ZONE 'America/Los_Angeles'
       END,
       CASE WHEN v.all_day OR v.end_hour IS NULL THEN NULL
            ELSE (l.t + (v.day_offset || ' days')::interval + (v.end_hour || ' hours')::interval) AT TIME ZONE 'America/Los_Angeles'
       END,
       v.all_day, v.place
FROM prog p
CROSS JOIN local_midnight l
CROSS JOIN utc_midnight u
JOIN (VALUES
  ('allstars', 'Costume fitting — all teams',  'Seniors first, then juniors and minis. Allow thirty minutes.',   4, 17, 19.5, false, 'Studio A'),
  ('allstars', 'Choreography camp',            'Full day. Pack lunch, snacks and two water bottles.',           11,  9, 16,   false, 'Studio A & B'),
  ('allstars', 'Winter Showcase',              'Doors 6:00pm. Dancers arrive 5:00pm in full hair and makeup.',  26, 18, NULL, false, 'Moreno Valley PAC'),
  ('allstars', 'Regional competition — day 1', 'Schedule and call times are in Documents once posted.',         47,  0, NULL, true,  'Ontario Convention Center'),
  ('academy',  'Picture day',                  'Full costume. Arrive fifteen minutes before your class time.',   6, 16, 20,   false, 'Studio A'),
  ('academy',  'Parent watch week',            'Grown-ups welcome in the studio for the whole class.',          18,  0, NULL, true,  NULL),
  ('academy',  'Winter Showcase',              'Academy and TNT dancers perform in the first half.',            26, 18, NULL, false, 'Moreno Valley PAC'),
  ('academy',  'Studio closed — Thanksgiving', '',                                                              40,  0, NULL, true,  NULL)
) AS v(slug, title, descr, day_offset, start_hour, end_hour, all_day, place)
  ON v.slug = p.slug;

-- Updates ---------------------------------------------------------------------
WITH prog AS (SELECT id, slug FROM public.portal_programs)
INSERT INTO public.portal_updates (program_id, class_id, title, body, is_pinned, is_published, published_at)
SELECT p.id, NULL::uuid, v.title, v.body, v.pinned, true, now() - (v.age_hours || ' hours')::interval
FROM prog p
JOIN (VALUES
  ('allstars', 'Competition season schedule is posted',
   E'The full season schedule is now under Documents.\n\nPlease check call times carefully — several moved after the draft went out. Costume fittings start the week of the 14th, and every dancer needs to be measured before then.',
   true, 50),
  ('allstars', 'Reminder: clean sneakers for hip hop',
   'Outdoor shoes mark the floor and it is getting expensive to refinish. Bring a second pair and change at the door.',
   false, 8),
  ('academy',  'Picture day is coming up',
   E'Picture day is in two weeks. Full costume, hair done, arrive fifteen minutes early.\n\nOrder forms go home this week and are due back before the day itself.',
   true, 30),
  ('academy',  'New Saturday Tiny Tots class',
   'We have added a 9:00am Creative Movement class for ages 3–5. Ask at the front desk to add it.',
   false, 20)
) AS v(slug, title, body, pinned, age_hours) ON v.slug = p.slug;

-- One class-scoped update, so the per-class feed on a class page is not empty.
INSERT INTO public.portal_updates (program_id, class_id, title, body, is_pinned, is_published, published_at)
SELECT c.program_id, c.id,
       'Bring black jazz shoes on Tuesday',
       'We are running the full number in performance shoes this week so we can check fit before the first competition.',
       false, true, now() - interval '5 hours'
FROM public.portal_classes c WHERE c.name = 'Senior Elite Jazz';
