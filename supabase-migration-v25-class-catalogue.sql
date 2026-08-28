-- =============================================================================
-- v25 -- the class catalogue
--
-- Two things, in this order:
--
--   1. Widen portal_classes enough to hold a studio schedule rather than a
--      list of names. Everything added here comes from a column in the
--      Enrollio export; nothing is invented except style, age_group and
--      level, which are derived from the class title because that is where
--      the studio actually keeps them and they are the three things a parent
--      wants to filter on.
--
--   2. Import the 2026-2027 season: 102 classes, 55 Academy, 17 TNT,
--      30 All-Stars.
--
-- WHY category EXISTS WHEN program_id ALREADY DOES
--
-- They answer different questions. program_id is where a class is FILED --
-- which half of the admin manages it, and which program owns its updates,
-- files and events. category is where a class is SHOWN:
--
--     /portal/allstars/classes   allstars + academy + tnt   (all three)
--     /portal/academy/classes    academy + tnt
--
-- An All-Star dancer takes Academy technique classes too, so the All-Star
-- schedule has to show the whole studio. The Academy/TNT side must not show
-- company routines. One column cannot express both facts, so there are two.
--
-- THE IMPORT IS "ON CONFLICT DO NOTHING", DELIBERATELY
--
-- source_title is the class title as it appears in Enrollio, kept because it
-- is the only stable join key back to the export -- the parent-facing name
-- drops Enrollio's "(Morgan/M-4PM)" suffix, and admins are expected to edit
-- names by hand. DO NOTHING rather than DO UPDATE so that re-running this
-- file, or a later re-import, can never overwrite an edit somebody made in
-- the app.
--
-- Verification and rollback statements are at the bottom of the file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.portal_classes
  ADD COLUMN IF NOT EXISTS category           text NOT NULL DEFAULT 'academy',
  ADD COLUMN IF NOT EXISTS source_title       text,
  ADD COLUMN IF NOT EXISTS style              text,
  ADD COLUMN IF NOT EXISTS age_group          text,
  ADD COLUMN IF NOT EXISTS age_min_years      smallint,
  ADD COLUMN IF NOT EXISTS age_max_years      smallint,
  ADD COLUMN IF NOT EXISTS capacity           smallint,
  ADD COLUMN IF NOT EXISTS tuition_fee        numeric(10,2),
  ADD COLUMN IF NOT EXISTS registration_fee   numeric(10,2),
  ADD COLUMN IF NOT EXISTS costume_fee        numeric(10,2),
  ADD COLUMN IF NOT EXISTS billing_cycle      text,
  ADD COLUMN IF NOT EXISTS billing_day        smallint,
  ADD COLUMN IF NOT EXISTS season             text,
  ADD COLUMN IF NOT EXISTS season_start       date,
  ADD COLUMN IF NOT EXISTS season_end         date,
  ADD COLUMN IF NOT EXISTS registration_opens date;

DO $$
BEGIN
  -- The portal routes are typed against these three, and a fourth would render
  -- nowhere. The database says so rather than letting it fail silently.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_classes_category_check') THEN
    ALTER TABLE public.portal_classes
      ADD CONSTRAINT portal_classes_category_check
      CHECK (category IN ('allstars', 'academy', 'tnt'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_classes_age_order') THEN
    ALTER TABLE public.portal_classes
      ADD CONSTRAINT portal_classes_age_order
      CHECK (age_min_years IS NULL OR age_max_years IS NULL
             OR age_max_years >= age_min_years);
  END IF;

  -- A season ending before it starts would make the month view render an empty
  -- year with no error anywhere.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_classes_season_order') THEN
    ALTER TABLE public.portal_classes
      ADD CONSTRAINT portal_classes_season_order
      CHECK (season_start IS NULL OR season_end IS NULL OR season_end >= season_start);
  END IF;
END $$;

-- The parent-facing query filters on category and is_active and orders by the
-- schedule, which is exactly this index.
CREATE INDEX IF NOT EXISTS idx_portal_classes_category
  ON public.portal_classes (category, day_of_week, start_time)
  WHERE is_active;

-- Partial, because every hand-added class has a NULL source_title and several
-- of those must be allowed to coexist.
CREATE UNIQUE INDEX IF NOT EXISTS portal_classes_source_title_uniq
  ON public.portal_classes (source_title)
  WHERE source_title IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. The 2026-2027 season
--
--    program_id comes from the category rather than being typed in: All-Star
--    routines are filed under the All-Star program, Academy and TNT classes
--    under the Academy/TNT program.
--
--    Eight columns are identical on all 102 rows -- the season, its dates and
--    the billing terms -- so they are written once in the SELECT rather than
--    102 times in the VALUES. The 16 distinct descriptions are keyed the same
--    way: every Ballet class shares one paragraph, and repeating it eight
--    times would make a later wording change eight edits.
-- -----------------------------------------------------------------------------
WITH blurbs (key, body) AS (
VALUES
  ('b1', 'Hip hop at DIDC is grooves, choreography, musicality, and confidence — age-appropriate, always positive, and seriously fun. It''s the class where kids who ''don''t dance'' discover they absolutely do.'),
  ('b2', 'Ballet is the backbone of nearly every dance style, and at DIDC it anchors training from the first class. Dancers learn alignment, turnout, musicality, and discipline that carries into every style.'),
  ('b3', '30-minute classes focused on rhythm patterns and hand–eye coordination.'),
  ('b4', 'Competition and performance company.'),
  ('b5', 'Hip Hop Tech breaks the style down to its foundations — isolations, grooves, control, and the mechanics behind every move. Dancers slow it down to learn how hip hop works, then speed it up cleaner.'),
  ('b6', '45 minutes of ballet, jazz, and rhythm foundations.'),
  ('b7', 'A full hour of Ballet, Jazz, and Tap in one class.'),
  ('b8', 'Jazz is where technique meets performance — sharp lines, big leaps, fast turns, and the stage presence to sell it. It''s one of the most popular classes at DIDC and a core style for every dancer here.'),
  ('b9', 'Acro blends dance technique with acrobatic skills — cartwheels, walkovers, aerials, balance, and the strength behind them. Taught progressively and safely, it''s one of our most requested classes.'),
  ('b10', 'Tech is where dancers sharpen the fundamentals that power every style — placement, control, flexibility, and clean execution. It''s the training that makes jazz, contemporary, and more look effortless.'),
  ('b11', 'Our Junior and Teen Combo classes teach dancers to read movement as choreography — how steps connect, phrase, and carry meaning across styles. It builds versatility, musicality, and quick pickup.'),
  ('b12', 'Turns & Jumps masters the skills that make audiences gasp — clean pirouettes, powerful leaps, and the strength and spotting behind them. It carries into jazz, contemporary, ballet, and every style.'),
  ('b13', 'Pilates at DIDC builds the core strength, control, and body awareness every dancer relies on — all mat-based, no machines required. It builds stability and alignment that carries into every class.'),
  ('b14', 'Contemporary blends ballet''s control with modern movement, floor work, and improvisation — the style where dancers find their voice. Expect technique, and expect to be asked what a movement means.'),
  ('b15', 'Dancing en pointe is a milestone every ballet student dreams about, and reaching it safely takes structure and strength. At DIDC the path runs through Academy ballet: Ballet, Pre-Pointe, Pointe.'),
  ('b16', 'Lyrical is storytelling in motion — sustained movement that interprets a song''s emotion and lyrics. It asks dancers to be technicians and actors at once, and it''s where many surprise themselves.')
), incoming (
  source_title, name, category, day_of_week, start_time, end_time, location, instructor_name, blurb, style, level, age_group, age_min_years, age_max_years, capacity, tuition_fee, sort_order
) AS (
VALUES
  ('Junior Hip Hop 1 (KyRee/M-4PM)', 'Junior Hip Hop 1', 'academy', 1, '16:00:00', '17:00:00', 'Studio 4', 'Ky''Ree Nevels', 'b1', 'Hip Hop', '1', 'Junior', 7, 18, 20, 77.5, 1),
  ('Pre Ballet 1A (Morgan/M-4PM)', 'Pre Ballet 1A', 'academy', 1, '16:00:00', '17:00:00', 'Studio 1', 'Morgan Davidson', 'b2', 'Ballet', '1A', 'Pre-Level', 7, 18, 20, 77.5, 2),
  ('Tiny Tots (Kansas/M-4PM)', 'Tiny Tots', 'tnt', 1, '16:00:00', '16:30:00', 'Studio 3', 'Kansas O''Dwyer', 'b3', 'Tiny Tots', NULL, 'Tiny Tots', 2, 2, 6, 65.0, 3),
  ('Jr/Teen Hip Hop 2 (Chill/M-4:15PM)', 'Jr/Teen Hip Hop 2', 'academy', 1, '16:15:00', '17:15:00', 'Studio 2', 'Chill Kerney', 'b1', 'Hip Hop', '2', 'Junior / Teen', 7, 18, 20, 77.5, 4),
  ('TnT Hip Hop (Sierra/M-4:45PM)', 'TnT Hip Hop', 'tnt', 1, '16:45:00', '17:45:00', 'Studio 3', 'Sierra Faith', 'b1', 'Hip Hop', NULL, 'Ages 5-6', 5, 6, 12, 69.0, 5),
  ('All-Star D (KyRee/M-5PM)', 'All-Star D', 'allstars', 1, '17:00:00', '17:30:00', 'Studio 4', 'Ky''Ree Nevels', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 6),
  ('Ballet 1B (Morgan/M-5PM)', 'Ballet 1B', 'academy', 1, '17:00:00', '18:00:00', 'Studio 1', 'Morgan Davidson', 'b2', 'Ballet', '1B', 'All ages', 7, 18, 20, 77.5, 7),
  ('Jr/Teen Hip Hop Tech 2-3 (Chill/M-5:15PM)', 'Jr/Teen Hip Hop Tech 2-3', 'academy', 1, '17:15:00', '18:15:00', 'Studio 2', 'Chill Kerney', 'b5', 'Hip Hop', '2-3', 'Junior / Teen', 7, 18, 20, 77.5, 8),
  ('All-Star G (KyRee/M-5:30PM)', 'All-Star G', 'allstars', 1, '17:30:00', '18:00:00', 'Studio 4', 'Ky''Ree Nevels', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 9),
  ('Creative Movement (Tara/M-5:30PM)', 'Creative Movement', 'tnt', 1, '17:30:00', '18:15:00', 'Studio 3', 'Tara Triche', 'b6', 'Creative Movement', NULL, 'Creative Movement', 3, 4, 12, 69.0, 10),
  ('All-Star BB (Chill/M-6PM)', 'All-Star BB', 'allstars', 1, '18:00:00', '18:45:00', 'Studio 2', 'Chill Kerney/Ky''Ree Nevels', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 11),
  ('Ballet 1A (Morgan/M-6PM)', 'Ballet 1A', 'academy', 1, '18:00:00', '19:00:00', 'Studio 1', 'Morgan Davidson', 'b2', 'Ballet', '1A', 'All ages', 7, 18, 20, 77.5, 12),
  ('Mini Hip Hop 2 (KyRee/M-6PM)', 'Mini Hip Hop 2', 'academy', 1, '18:00:00', '19:00:00', 'Studio 4', 'Ky''Ree Nevels', 'b1', 'Hip Hop', '2', 'Mini', 7, 18, 15, 77.5, 13),
  ('Combo (Tara/M-6:15PM)', 'Combo', 'tnt', 1, '18:15:00', '19:15:00', 'Studio 3', 'Tara Triche', 'b7', 'Combo', NULL, 'Ages 5-6', 5, 6, 12, 69.0, 14),
  ('Teen Hip Hop 3 (Chill/M-6:45PM)', 'Teen Hip Hop 3', 'academy', 1, '18:45:00', '19:45:00', 'Studio 2', 'Chill Kerney', 'b1', 'Hip Hop', '3', 'Teen', 7, 18, 20, 77.5, 15),
  ('Mini/Jr Hip Hop 1-2 (KyRee/M-7PM)', 'Mini/Jr Hip Hop 1-2', 'academy', 1, '19:00:00', '20:00:00', 'Studio 4', 'Ky''Ree Nevels', 'b1', 'Hip Hop', '1-2', 'Mini / Junior', 7, 18, 15, 77.5, 16),
  ('Ballet 2B / Pre Pointe (Morgan/M-7:15PM)', 'Ballet 2B / Pre Pointe', 'academy', 1, '19:15:00', '20:30:00', 'Studio 1', 'Morgan Davidson', 'b2', 'Ballet', '2B', 'All ages', 7, 18, 20, 77.5, 17),
  ('Jazz 1 (Tara/M-7:15PM)', 'Jazz 1', 'academy', 1, '19:15:00', '20:15:00', 'Studio 3', 'Tara Triche', 'b8', 'Jazz', '1', 'All ages', 7, 18, 20, 77.5, 18),
  ('All-Star CC (Chill/M-7:45PM)', 'All-Star CC', 'allstars', 1, '19:45:00', '20:30:00', 'Studio 2', 'Chill Kerney', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 19),
  ('All-Star J (KyRee/M-8PM)', 'All-Star J', 'allstars', 1, '20:00:00', '20:30:00', 'Studio 4', 'Ky''Ree Nevels', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 20),
  ('Ballet 1B (Danielle/T-4PM)', 'Ballet 1B', 'academy', 2, '16:00:00', '17:00:00', 'Studio 4', 'Danielle Fiorillo', 'b2', 'Ballet', '1B', 'All ages', 7, 18, 20, 77.5, 21),
  ('Mini Acro 1 (Gracie/T-4PM)', 'Mini Acro 1', 'academy', 2, '16:00:00', '17:00:00', 'Studio 2', 'Gracie Kunkie', 'b9', 'Acro', '1', 'Mini', 7, 18, 15, 77.5, 22),
  ('Jr/Teen Tech 2 (Alyssa/T-4:15PM)', 'Jr/Teen Tech 2', 'academy', 2, '16:15:00', '17:15:00', 'Studio 1', 'Alyssa Zuppardo', 'b10', 'Technique', '2', 'Junior / Teen', 7, 18, 20, 77.5, 23),
  ('Creative Movement (Kansas/T-4:30PM)', 'Creative Movement', 'tnt', 2, '16:30:00', '17:15:00', 'Studio 3', 'Kansas O''Dwyer', 'b6', 'Creative Movement', NULL, 'Creative Movement', 3, 4, 12, 69.0, 24),
  ('Junior Acro 1 (Gracie/T-5PM)', 'Junior Acro 1', 'academy', 2, '17:00:00', '18:00:00', 'Studio 2', 'Gracie Kunkie', 'b9', 'Acro', '1', 'Junior', 7, 18, 20, 77.5, 25),
  ('Pre Ballet 1B (Danielle/T-5PM)', 'Pre Ballet 1B', 'academy', 2, '17:00:00', '18:00:00', 'Studio 4', 'Danielle Fiorillo', 'b2', 'Ballet', '1B', 'Pre-Level', 7, 18, 20, 77.5, 26),
  ('Jr/Teen Combo 1-2 (Alyssa/T-5:15PM)', 'Jr/Teen Combo 1-2', 'academy', 2, '17:15:00', '18:15:00', 'Studio 1', 'Alyssa Zuppardo', 'b11', 'Combo', '1-2', 'Junior / Teen', 7, 18, 20, 77.5, 27),
  ('Creative Movement (Tara/T-5:30PM)', 'Creative Movement', 'tnt', 2, '17:30:00', '18:15:00', 'Studio 3', 'Tara Triche', 'b6', 'Creative Movement', NULL, 'Creative Movement', 3, 4, 12, 69.0, 28),
  ('All-Star V (Alyssa/T-6PM)', 'All-Star V', 'allstars', 2, '18:00:00', '18:30:00', 'Studio 1', 'Alyssa Zuppardo', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 29),
  ('Jr/Teen Acro 3 (Gracie/T-6PM)', 'Jr/Teen Acro 3', 'academy', 2, '18:00:00', '19:00:00', 'Studio 2', 'Gracie Kunkie', 'b9', 'Acro', '3', 'Junior / Teen', 7, 18, 20, 77.5, 30),
  ('Junior Tech 1 (Danielle/T-6PM)', 'Junior Tech 1', 'academy', 2, '18:00:00', '19:00:00', 'Studio 4', 'Danielle Fiorillo', 'b10', 'Technique', '1', 'Junior', 7, 18, 20, 77.5, 31),
  ('Combo (Tara/T-6:15PM)', 'Combo', 'tnt', 2, '18:15:00', '19:15:00', 'Studio 3', 'Tara Triche', 'b7', 'Combo', NULL, 'Ages 5-6', 5, 6, 12, 69.0, 32),
  ('Teen Tech 1-2 (Alyssa/T-6:30PM)', 'Teen Tech 1-2', 'academy', 2, '18:30:00', '19:30:00', 'Studio 1', 'Alyssa Zuppardo', 'b10', 'Technique', '1-2', 'Teen', 7, 18, 20, 77.5, 33),
  ('Junior Acro 2 (Gracie/T-7PM)', 'Junior Acro 2', 'academy', 2, '19:00:00', '20:00:00', 'Studio 2', 'Gracie Kunkie', 'b9', 'Acro', '2', 'Junior', 7, 18, 20, 77.5, 34),
  ('Junior Combo 1-2 (Danielle/T-7PM)', 'Junior Combo 1-2', 'academy', 2, '19:00:00', '20:00:00', 'Studio 4', 'Danielle Fiorillo', 'b11', 'Combo', '1-2', 'Junior', 7, 18, 20, 77.5, 35),
  ('TnT Acro (Tara/T-7:15PM)', 'TnT Acro', 'tnt', 2, '19:15:00', '20:15:00', 'Studio 3', 'Tara Triche', 'b9', 'Acro', NULL, 'Ages 5-6', 5, 6, 12, 69.0, 36),
  ('Teen Combo 2-3 (Alyssa/T-7:30PM)', 'Teen Combo 2-3', 'academy', 2, '19:30:00', '20:30:00', 'Studio 1', 'Alyssa Zuppardo', 'b11', 'Combo', '2-3', 'Teen', 7, 18, 20, 77.5, 37),
  ('All-Star Q (Sierra/T-7:45PM)', 'All-Star Q', 'allstars', 2, '19:45:00', '20:15:00', 'Studio 4', 'Sierra Faith', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 38),
  ('Jr/Teen Acro 2 (Gracie/T-8PM)', 'Jr/Teen Acro 2', 'academy', 2, '20:00:00', '21:00:00', 'Studio 2', 'Gracie Kunkie', 'b9', 'Acro', '2', 'Junior / Teen', 7, 18, 20, 77.5, 39),
  ('Teen Tech 3 (Alyssa/T-8:15PM)', 'Teen Tech 3', 'academy', 2, '20:15:00', '21:15:00', 'Studio 1', 'Alyssa Zuppardo', 'b10', 'Technique', '3', 'Teen', 7, 18, 20, 77.5, 40),
  ('All-Star F (Carlos/W-3:45PM)', 'All-Star F', 'allstars', 3, '15:45:00', '16:15:00', 'Studio 1', 'Carlos Renteria', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 41),
  ('Creative Movement (Kansas/W-4PM)', 'Creative Movement', 'tnt', 3, '16:00:00', '16:45:00', 'Studio 3', 'Kansas O''Dwyer', 'b6', 'Creative Movement', NULL, 'Creative Movement', 3, 4, 12, 69.0, 42),
  ('Mini Hip Hop 1 (KyRee/W-4PM)', 'Mini Hip Hop 1', 'academy', 3, '16:00:00', '17:00:00', 'Studio 2', 'Ky''Ree Nevels', 'b1', 'Hip Hop', '1', 'Mini', 7, 18, 15, 77.5, 43),
  ('Petite Tech 1 (Alyssa/W-4PM)', 'Petite Tech 1', 'academy', 3, '16:00:00', '17:00:00', 'Studio 4', 'Alyssa Zuppardo', 'b10', 'Technique', '1', 'Petite', 7, 18, 20, 77.5, 44),
  ('Jr/Teen Turns & Jumps 2 (Carlos/W-4:15PM)', 'Jr/Teen Turns & Jumps 2', 'academy', 3, '16:15:00', '17:15:00', 'Studio 1', 'Carlos Renteria', 'b12', 'Turns & Jumps', '2', 'Junior / Teen', 7, 18, 20, 77.5, 45),
  ('Mini Tech 1 (Alyssa/W-4:45PM)', 'Mini Tech 1', 'academy', 3, '16:45:00', '17:45:00', 'Studio 4', 'Alyssa Zuppardo', 'b10', 'Technique', '1', 'Mini', 7, 18, 15, 77.5, 46),
  ('Combo (Kansas/W-5PM)', 'Combo', 'tnt', 3, '17:00:00', '18:00:00', 'Studio 3', 'Kansas O''Dwyer', 'b7', 'Combo', NULL, 'Ages 5-6', 5, 6, 12, 69.0, 47),
  ('Junior Hip Hop 2-3 (KyRee/W-5PM)', 'Junior Hip Hop 2-3', 'academy', 3, '17:00:00', '18:00:00', 'Studio 2', 'Ky''Ree Nevels', 'b1', 'Hip Hop', '2-3', 'Junior', 7, 18, 20, 77.5, 48),
  ('Jr/Teen Combo 2 (Carlos/W-5:15PM)', 'Jr/Teen Combo 2', 'academy', 3, '17:15:00', '18:15:00', 'Studio 1', 'Carlos Renteria', 'b11', 'Combo', '2', 'Junior / Teen', 7, 18, 20, 77.5, 49),
  ('Mini Jazz 1 (Alyssa/W-5:45PM)', 'Mini Jazz 1', 'academy', 3, '17:45:00', '18:45:00', 'Studio 4', 'Alyssa Zuppardo', 'b8', 'Jazz', '1', 'Mini', 7, 18, 15, 77.5, 50),
  ('All-Star P (KyRee/W-6PM)', 'All-Star P', 'allstars', 3, '18:00:00', '18:30:00', 'Studio 2', 'Ky''Ree Nevels', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 51),
  ('All-Star T (Carlos/W-6PM)', 'All-Star T', 'allstars', 3, '18:00:00', '18:30:00', 'Studio 1', 'Carlos Renteria', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 52),
  ('Combo (Kansas/W-6PM)', 'Combo', 'tnt', 3, '18:00:00', '19:00:00', 'Studio 3', 'Kansas O''Dwyer', 'b7', 'Combo', NULL, 'Ages 5-6', 5, 6, 12, 69.0, 53),
  ('All-Star E (Alyssa/W-6:30PM)', 'All-Star E', 'allstars', 3, '18:30:00', '19:00:00', 'Studio 4', 'Alyssa Zuppardo', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 54),
  ('All-Star U (KyRee/W-6:30PM)', 'All-Star U', 'allstars', 3, '18:30:00', '19:00:00', 'Studio 2', 'Ky''Ree Nevels', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 55),
  ('Teen Turns & Jumps 1-2 (Carlos/W-6:30PM)', 'Teen Turns & Jumps 1-2', 'academy', 3, '18:30:00', '19:30:00', 'Studio 1', 'Carlos Renteria', 'b12', 'Turns & Jumps', '1-2', 'Teen', 7, 18, 20, 77.5, 56),
  ('All-Star H (Alyssa/W-7PM)', 'All-Star H', 'allstars', 3, '19:00:00', '19:30:00', 'Studio 4', 'Alyssa Zuppardo', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 57),
  ('Junior Hip Hop 1 (KyRee/W-7PM)', 'Junior Hip Hop 1', 'academy', 3, '19:00:00', '20:00:00', 'Studio 2', 'Ky''Ree Nevels', 'b1', 'Hip Hop', '1', 'Junior', 7, 18, 20, 77.5, 58),
  ('Pre Jazz (Kansas/W-7PM)', 'Pre Jazz', 'academy', 3, '19:00:00', '20:00:00', 'Studio 3', 'Kansas O''Dwyer', 'b8', 'Jazz', NULL, 'Pre-Level', 7, 18, 20, 77.5, 59),
  ('Teen Pilates 2-3 (Carlos/W-7:30PM)', 'Teen Pilates 2-3', 'academy', 3, '19:30:00', '20:30:00', 'Studio 1', 'Carlos Renteria', 'b13', 'Pilates', '2-3', 'Teen', 7, 18, 20, 77.5, 60),
  ('Teen Hip Hop 1-2 (KyRee/W-8PM)', 'Teen Hip Hop 1-2', 'academy', 3, '20:00:00', '21:00:00', 'Studio 2', 'Ky''Ree Nevels', 'b1', 'Hip Hop', '1-2', 'Teen', 7, 18, 20, 77.5, 61),
  ('Teen Turns/Jumps 3 (Carlos/W-8:15PM)', 'Teen Turns/Jumps 3', 'academy', 3, '20:15:00', '21:15:00', 'Studio 1', 'Carlos Renteria', 'b12', 'Turns & Jumps', '3', 'Teen', 7, 18, 20, 77.5, 62),
  ('Petite Turns & Jumps (Carlos/Th-3:45PM)', 'Petite Turns & Jumps', 'academy', 4, '15:45:00', '16:45:00', 'Studio 1', 'Carlos Renteria', 'b12', 'Turns & Jumps', NULL, 'Petite', 7, 18, 20, 77.5, 63),
  ('Junior Jazz 1 (Sierra/Th-4PM)', 'Junior Jazz 1', 'academy', 4, '16:00:00', '17:00:00', 'Studio 2', 'Sierra Faith', 'b8', 'Jazz', '1', 'Junior', 7, 18, 20, 77.5, 64),
  ('All-Star A (Tara/Th-4:30PM)', 'All-Star A', 'allstars', 4, '16:30:00', '17:00:00', 'Studio 3', 'Tara Triche', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 65),
  ('Mini Contemp 1 (Carlos/Th-4:30PM)', 'Mini Contemp 1', 'academy', 4, '16:30:00', '17:30:00', 'Studio 1', 'Carlos Renteria', 'b14', 'Contemporary', '1', 'Mini', 7, 18, 15, 77.5, 66),
  ('All-Star N (Alyssa/Th-5PM)', 'All-Star N', 'allstars', 4, '17:00:00', '17:30:00', 'Studio 2', 'Alyssa Zuppardo', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 67),
  ('Ballet 3B (Chrisilla/Th-5PM)', 'Ballet 3B', 'academy', 4, '17:00:00', '18:00:00', 'Studio 4', 'Chrisilla Adrien', 'b2', 'Ballet', '3B', 'All ages', 7, 18, 20, 77.5, 68),
  ('Combo (Tara/Th-5PM)', 'Combo', 'tnt', 4, '17:00:00', '18:00:00', 'Studio 3', 'Tara Triche', 'b7', 'Combo', NULL, 'Ages 5-6', 5, 6, 12, 69.0, 69),
  ('All-Star K (Alyssa/Th-5:30PM)', 'All-Star K', 'allstars', 4, '17:30:00', '18:00:00', 'Studio 2', 'Alyssa Zuppardo', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 70),
  ('Mini Turns & Jumps 1 (Carlos/Th-5:30PM)', 'Mini Turns & Jumps 1', 'academy', 4, '17:30:00', '18:30:00', 'Studio 1', 'Carlos Renteria', 'b12', 'Turns & Jumps', '1', 'Mini', 7, 18, 15, 77.5, 71),
  ('All-Star R (Joanna/Th-6PM)', 'All-Star R', 'allstars', 4, '18:00:00', '18:30:00', 'Studio 2', 'Joanna Ramirez', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 72),
  ('Creative Movement (Tara/Th-6PM)', 'Creative Movement', 'tnt', 4, '18:00:00', '18:45:00', 'Studio 3', 'Tara Triche', 'b6', 'Creative Movement', NULL, 'Creative Movement', 3, 4, 12, 69.0, 73),
  ('Pointe 1-2 (Chrisilla/Th-6:15PM)', 'Pointe 1-2', 'academy', 4, '18:15:00', '19:15:00', 'Studio 4', 'Chrisilla Adrien', 'b15', 'Pointe', '1-2', 'All ages', 7, 18, 20, 77.5, 74),
  ('Jr/Teen Contemp 1-2 (Joanna/Th-6:30PM)', 'Jr/Teen Contemp 1-2', 'academy', 4, '18:30:00', '19:30:00', 'Studio 2', 'Joanna Ramirez', 'b14', 'Contemporary', '1-2', 'Junior / Teen', 7, 18, 20, 77.5, 75),
  ('Junior Pilates 1-2 (Carlos/Th-6:30PM)', 'Junior Pilates 1-2', 'academy', 4, '18:30:00', '19:30:00', 'Studio 1', 'Carlos Renteria', 'b13', 'Pilates', '1-2', 'Junior', 7, 18, 20, 77.5, 76),
  ('Pre Jazz (Tara/Th-6:45PM)', 'Pre Jazz', 'academy', 4, '18:45:00', '19:45:00', 'Studio 3', 'Tara Triche', 'b8', 'Jazz', NULL, 'Pre-Level', 7, 18, 20, 77.5, 77),
  ('Ballet 3A (Chrisilla/Th-7PM)', 'Ballet 3A', 'academy', 4, '19:00:00', '20:00:00', 'Studio 4', 'Chrisilla Adrien', 'b2', 'Ballet', '3A', 'All ages', 7, 18, 20, 77.5, 78),
  ('Junior Turns & Jumps 1 (Carlos/Th-7:15PM)', 'Junior Turns & Jumps 1', 'academy', 4, '19:15:00', '20:15:00', 'Studio 1', 'Carlos Renteria', 'b12', 'Turns & Jumps', '1', 'Junior', 7, 18, 20, 77.5, 79),
  ('Teen Jazz 1 (Joanna/Th-7:30PM)', 'Teen Jazz 1', 'academy', 4, '19:30:00', '20:30:00', 'Studio 2', 'Joanna Ramirez', 'b8', 'Jazz', '1', 'Teen', 7, 18, 20, 77.5, 80),
  ('All-Star O (Carlos/Th-8:15PM)', 'All-Star O', 'allstars', 4, '20:15:00', '20:45:00', 'Studio 1', 'Carlos Renteria', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 81),
  ('Pointe 2 (Chrisilla/Th-8:15PM)', 'Pointe 2', 'academy', 4, '20:15:00', '21:15:00', 'Studio 4', 'Chrisilla Adrien', 'b15', 'Pointe', '2', 'All ages', 7, 18, 20, 77.5, 82),
  ('All-Star EE (Joanna/Th-8:30PM)', 'All-Star EE', 'allstars', 4, '20:30:00', '21:00:00', 'Studio 2', 'Joanna Ramirez', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 83),
  ('All-Star S (Guest/F-4:30PM)', 'All-Star S', 'allstars', 5, '16:30:00', '17:15:00', 'Studio 1', 'Guest Choreographer', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 84),
  ('All-Star W (Carlos/F-4:30PM)', 'All-Star W', 'allstars', 5, '16:30:00', '17:00:00', 'Studio 2', 'Carlos Renteria', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 85),
  ('Tiny Tots (Kansas/F-4:30PM)', 'Tiny Tots', 'tnt', 5, '16:30:00', '17:00:00', 'Studio 3', 'Kansas O''Dwyer', 'b3', 'Tiny Tots', NULL, 'Tiny Tots', 2, 2, 6, 65.0, 86),
  ('Combo (Kansas/F-5PM)', 'Combo', 'tnt', 5, '17:00:00', '18:00:00', 'Studio 3', 'Kansas O''Dwyer', 'b7', 'Combo', NULL, 'Ages 5-6', 5, 6, 12, 69.0, 87),
  ('Junior Hip Hop 1 (KyRee/F-5PM)', 'Junior Hip Hop 1', 'academy', 5, '17:00:00', '18:00:00', 'Studio 4', 'Ky''Ree Nevels', 'b1', 'Hip Hop', '1', 'Junior', 7, 18, 20, 77.5, 88),
  ('All-Star X (Alyssa/F-5:15PM)', 'All-Star X', 'allstars', 5, '17:15:00', '18:00:00', 'Studio 1', 'Alyssa Zuppardo', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 89),
  ('Pre Jazz (Tara/F-5:15PM)', 'Pre Jazz', 'academy', 5, '17:15:00', '18:15:00', 'Studio 2', 'Tara Triche', 'b8', 'Jazz', NULL, 'Pre-Level', 7, 18, 20, 77.5, 90),
  ('All-Star Z (Alyssa/F-6PM)', 'All-Star Z', 'allstars', 5, '18:00:00', '18:45:00', 'Studio 1', 'Alyssa Zuppardo', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 91),
  ('Creative Movement (Kansas/F-6PM)', 'Creative Movement', 'tnt', 5, '18:00:00', '18:45:00', 'Studio 3', 'Kansas O''Dwyer', 'b6', 'Creative Movement', NULL, 'Creative Movement', 3, 4, 12, 69.0, 92),
  ('TnT Hip Hop 1 (KyRee/F-6PM)', 'TnT Hip Hop 1', 'tnt', 5, '18:00:00', '19:00:00', 'Studio 4', 'Ky''Ree Nevels', 'b1', 'Hip Hop', '1', 'Ages 5-6', 5, 6, 12, 69.0, 93),
  ('Petite Lyrical (Tara/F-6:15PM)', 'Petite Lyrical', 'academy', 5, '18:15:00', '19:15:00', 'Studio 2', 'Tara Triche', 'b16', 'Lyrical', NULL, 'Petite', 7, 18, 20, 77.5, 94),
  ('All-Star Y (Alyssa/F-6:45PM)', 'All-Star Y', 'allstars', 5, '18:45:00', '19:30:00', 'Studio 1', 'Alyssa Zuppardo', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 95),
  ('All-Star B (Tara/F-7PM)', 'All-Star B', 'allstars', 5, '19:00:00', '19:30:00', 'Studio 2', 'Tara Triche', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 96),
  ('Jazz 1 (Kansas/F-7PM)', 'Jazz 1', 'academy', 5, '19:00:00', '20:00:00', 'Studio 4', 'Kansas O''Dwyer', 'b8', 'Jazz', '1', 'All ages', 7, 18, 20, 77.5, 97),
  ('All-Star AA (Guest/F-7:30PM)', 'All-Star AA', 'allstars', 5, '19:30:00', '20:15:00', 'Studio 1', 'Guest Choreographer', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 98),
  ('All-Star C (Tara/F-7:30PM)', 'All-Star C', 'allstars', 5, '19:30:00', '20:00:00', 'Studio 2', 'Tara Triche', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 99),
  ('All-Star L (Carlos/Sa-9:30AM)', 'All-Star L', 'allstars', 6, '09:30:00', '10:00:00', 'Studio 2', 'Carlos Renteria', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 100),
  ('All-Star I (Carlos/Sa-10AM)', 'All-Star I', 'allstars', 6, '10:00:00', '10:30:00', 'Studio 2', 'Carlos Renteria', 'b4', 'Company Routine', NULL, 'Company', 4, 18, 20, 15.0, 101),
  ('Production (Production/Sa-10AM)', 'Production', 'allstars', 6, '10:00:00', '13:00:00', 'Studio 1', 'Alyssa Zuppardo/Carlos Renteria/Ky''Ree Nevels/Chill Kerney', 'b4', 'Production', NULL, 'Company', 5, 18, 75, 15.0, 102)
)
INSERT INTO public.portal_classes (
  program_id, source_title, name, category, day_of_week, start_time, end_time,
  location, instructor_name, description, style, level, age_group,
  age_min_years, age_max_years, capacity, tuition_fee, registration_fee,
  costume_fee, billing_cycle, billing_day, season, season_start, season_end,
  registration_opens, sort_order, is_active
)
SELECT
  p.id, i.source_title, i.name, i.category, i.day_of_week,
  i.start_time::time, i.end_time::time, i.location, i.instructor_name,
  b.body, i.style, i.level, i.age_group, i.age_min_years, i.age_max_years,
  i.capacity, i.tuition_fee,
  0, 0, 'Monthly', 15,
  '2026-2027', DATE '2026-08-31', DATE '2027-06-20', DATE '2026-08-29',
  i.sort_order, true
FROM incoming i
JOIN blurbs b ON b.key = i.blurb
JOIN public.portal_programs p
  ON p.slug = CASE WHEN i.category = 'allstars' THEN 'allstars' ELSE 'academy' END
ON CONFLICT (source_title) WHERE source_title IS NOT NULL DO NOTHING;

-- =============================================================================
-- VERIFY
--
--   SELECT pr.slug, c.category, count(*)
--     FROM public.portal_classes c
--     JOIN public.portal_programs pr ON pr.id = c.program_id
--    GROUP BY 1, 2 ORDER BY 1, 2;
--   -- academy  | academy   55
--   -- academy  | tnt       17
--   -- allstars | allstars  30
--
--   -- What each portal page will show:
--   SELECT count(*) FROM public.portal_classes
--    WHERE is_active AND category IN ('allstars','academy','tnt');   -- 102
--   SELECT count(*) FROM public.portal_classes
--    WHERE is_active AND category IN ('academy','tnt');              --  72
--
--   SELECT style, count(*) FROM public.portal_classes GROUP BY 1 ORDER BY 2 DESC;
--
-- ROLLBACK
--
--   DELETE FROM public.portal_classes WHERE season = '2026-2027';
--   DROP INDEX IF EXISTS public.portal_classes_source_title_uniq;
--   DROP INDEX IF EXISTS public.idx_portal_classes_category;
--   ALTER TABLE public.portal_classes
--     DROP CONSTRAINT IF EXISTS portal_classes_category_check,
--     DROP CONSTRAINT IF EXISTS portal_classes_age_order,
--     DROP CONSTRAINT IF EXISTS portal_classes_season_order,
--     DROP COLUMN IF EXISTS category,         DROP COLUMN IF EXISTS source_title,
--     DROP COLUMN IF EXISTS style,            DROP COLUMN IF EXISTS age_group,
--     DROP COLUMN IF EXISTS age_min_years,    DROP COLUMN IF EXISTS age_max_years,
--     DROP COLUMN IF EXISTS capacity,         DROP COLUMN IF EXISTS tuition_fee,
--     DROP COLUMN IF EXISTS registration_fee, DROP COLUMN IF EXISTS costume_fee,
--     DROP COLUMN IF EXISTS billing_cycle,    DROP COLUMN IF EXISTS billing_day,
--     DROP COLUMN IF EXISTS season,           DROP COLUMN IF EXISTS season_start,
--     DROP COLUMN IF EXISTS season_end,       DROP COLUMN IF EXISTS registration_opens;
-- =============================================================================
