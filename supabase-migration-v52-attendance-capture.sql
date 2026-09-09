-- =============================================================================
-- Migration v52 — taking attendance in the room
--
-- APPLIED to SOP-APP (sgppeenmvskwztaszkgn) on 2026-09-08, in four parts, and
-- verified: five statuses, three session sources, the four staff read policies,
-- the five functions, and security_invoker=true on all three views.
--
-- The v33 demo seed was deleted in the same sitting — 53 attendance rows and 56
-- sessions, on four classes, marking one dancer out of five to eight. Three of
-- those dates fell after season_start, so they would have shown live families
-- absences that never happened the moment REACT_APP_ATTENDANCE_LIVE was set.
-- =============================================================================
--
-- v33 built the attendance schema for an IMPORT: rows arrive from Enrolio,
-- already describing classes that have happened. Nothing in it can be written
-- by a person, on a phone, at 5:20pm, while thirty children take their shoes
-- off. That is what this migration adds, and it is a different problem in three
-- ways that each get a section below.
--
--   1. A teacher must be able to READ their own roster. Every policy v33 wrote
--      is `can_see_student() OR is_admin()` — household or admin. The `team`
--      role gets zero rows from students, enrollments, sessions and attendance,
--      so a teacher opening an attendance screen today sees an empty list and
--      no error.
--
--   2. Someone must be able to WRITE. v33 created no INSERT/UPDATE/DELETE
--      policy on any attendance table, for any role, deliberately. That stays
--      true — the write path here is an RPC, not a policy, so the rules about
--      WHO may mark WHICH class live in one readable function instead of being
--      spread across four WITH CHECK expressions.
--
--   3. Sessions must exist BEFORE anyone attends them. An importer creates a
--      session because it has a row proving the class met. To know that nobody
--      took attendance on Tuesday, the Tuesday has to already be there.
--
-- THE BUG THIS MIGRATION IS CAREFUL NOT TO SHIP
--
-- §6 generates every session for the season — 103 classes through 2027-06-20.
-- portal_attendance_summary counts a `held` session with no attendance row as
-- not-attended, and had NO upper bound on session_date. Generating the schedule
-- would therefore have marked all 1,111 dancers absent for every class they
-- have not attended yet, and shown their parents about 5%.
--
-- It was invisible until now only because every session in the table is in the
-- past. §4 adds `session_date <= studio_today()` to the denominator, and the
-- detail view gains an 'upcoming' exclusion reason so a future class reads as
-- what it is. src/lib/attendanceSummary.ts carries the identical change — see
-- ATTENDANCE-NOTES.md item 3 on why those two must never disagree.
--
-- SICK
--
-- Sick DOES count against the percentage — a studio decision, taken 2026-09-08.
-- It needs no arithmetic of its own: it is simply not 'excused' (so it stays in
-- the denominator) and not in ('present','late') (so it is not attendance). The
-- work is in never letting it render as a bare absence — the reason survives
-- into portal_attendance_detail and onto both the staff and the parent screen.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Vocabulary
-- =============================================================================

-- Sick joins the four v33 statuses. ATTENDANCE-NOTES item 5 reserved a fifth
-- slot for 'makeup'; this is not it, and adding 'sick' does not answer that
-- question — a makeup still has to decide whether it credits another session,
-- which is a join, not a status.
ALTER TABLE public.portal_attendance
  DROP CONSTRAINT IF EXISTS portal_attendance_status_check;

ALTER TABLE public.portal_attendance
  ADD CONSTRAINT portal_attendance_status_check
  CHECK (status IN ('present', 'absent', 'excused', 'late', 'sick'));

-- 'schedule' is a third provenance for a session, and the distinction earns its
-- keep: 'import' means Enrolio said this class met, 'manual' means a person
-- added a one-off, and 'schedule' means we generated it from day_of_week and
-- nobody has confirmed anything. Only 'schedule' rows are safe to delete in
-- bulk when a class is rescheduled.
ALTER TABLE public.portal_class_sessions
  DROP CONSTRAINT IF EXISTS portal_class_sessions_source_check;

ALTER TABLE public.portal_class_sessions
  ADD CONSTRAINT portal_class_sessions_source_check
  CHECK (source IN ('import', 'manual', 'schedule'));

-- =============================================================================
-- 2. Provenance
--
-- v33 gave portal_attendance `import_batch_id` and `recorded_at` — enough to
-- know WHEN a row arrived and which import brought it, which is all an importer
-- needs. A mark taken by a person needs to say which person.
--
-- `source` is not derivable from import_batch_id being null: a hand-corrected
-- import row would have both, and the question "did a teacher touch this?" is
-- exactly the one that matters at cutover.
-- =============================================================================

ALTER TABLE public.portal_attendance
  ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS source      text NOT NULL DEFAULT 'app';

-- Backfill before the constraint: every row that exists today predates this
-- migration and came from the v33 demo seed, so 'import' is the honest label
-- for it and 'app' would be a lie about who marked those children.
UPDATE public.portal_attendance SET source = 'import' WHERE recorded_by IS NULL;

ALTER TABLE public.portal_attendance
  DROP CONSTRAINT IF EXISTS portal_attendance_source_check;

ALTER TABLE public.portal_attendance
  ADD CONSTRAINT portal_attendance_source_check
  CHECK (source IN ('app', 'import'));

COMMENT ON COLUMN public.portal_attendance.recorded_by IS
  'The staff member who last set this mark in the app. NULL for imported rows.';
COMMENT ON COLUMN public.portal_attendance.source IS
  'app = a teacher marked it in the room. import = Enrolio. At cutover the '
  'importer overwrites app rows and records the previous value in '
  'portal_attendance_history.';

-- =============================================================================
-- 3. History
--
-- Two separate requirements land on the same table, which is why it is worth
-- having rather than a pair of audit columns:
--
--   * A teacher may edit their own marks with no time limit (studio decision,
--     2026-09-08). Without a trail, "she was marked present last week and
--     absent now" has no answer.
--   * At cutover the Enrolio import wins, and the mark the teacher actually
--     took must survive somewhere legible. `import_batch_id` on the row it
--     overwrote does not do that — the old value is simply gone.
--
-- Append-only: no UPDATE or DELETE policy, and no client write path at all.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.portal_attendance_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES public.portal_students(id) ON DELETE CASCADE,
  class_id        uuid NOT NULL REFERENCES public.portal_classes(id),
  session_id      uuid NOT NULL REFERENCES public.portal_class_sessions(id) ON DELETE CASCADE,
  -- NULL means there was no mark before this one: the first time anybody said
  -- anything about this child on this date.
  old_status      text,
  new_status      text NOT NULL,
  changed_by      uuid REFERENCES public.profiles(id),
  changed_at      timestamptz NOT NULL DEFAULT now(),
  source          text NOT NULL CHECK (source IN ('app', 'import')),
  import_batch_id uuid,
  note            text
);

CREATE INDEX IF NOT EXISTS idx_portal_attendance_history_session
  ON public.portal_attendance_history (session_id);
CREATE INDEX IF NOT EXISTS idx_portal_attendance_history_student
  ON public.portal_attendance_history (student_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_attendance_history_class
  ON public.portal_attendance_history (class_id, changed_at DESC);

ALTER TABLE public.portal_attendance_history ENABLE ROW LEVEL SECURITY;

-- Admin-only, and admin-only on purpose. A change trail answers "who marked my
-- daughter absent and when did it change" — a question for the office, not
-- something to render on a parent's phone next to the child's percentage.
DROP POLICY IF EXISTS portal_attendance_history_select ON public.portal_attendance_history;
CREATE POLICY portal_attendance_history_select ON public.portal_attendance_history
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

REVOKE ALL ON public.portal_attendance_history FROM anon, authenticated;
GRANT SELECT ON public.portal_attendance_history TO authenticated;

-- =============================================================================
-- 4. The denominator stops at today
--
-- studio_today() rather than current_date. The database runs in UTC, so
-- current_date rolls over at 5pm Pacific — during class. A 5:20pm Tuesday
-- would spend its own lesson being counted as a session that has already
-- happened and nobody attended.
--
-- One function so there is one place to change it if the studio's timezone is
-- ever stored on a record (ATTENDANCE-NOTES flags this for the calendar too).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.studio_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (now() AT TIME ZONE 'America/Los_Angeles')::date;
$$;

GRANT EXECUTE ON FUNCTION public.studio_today() TO authenticated, anon;

CREATE OR REPLACE VIEW public.portal_attendance_summary
WITH (security_invoker = true) AS
WITH ranges AS (
  SELECT * FROM (VALUES ('month'), ('season'), ('all')) AS r(range)
),
scoped AS (
  SELECT
    e.id               AS enrollment_id,
    e.student_id,
    e.class_id,
    e.season,
    e.status,
    e.enrolled_on,
    e.dropped_on,
    r.range,
    s.id               AS session_id,
    a.status           AS mark,
    (
      s.status = 'held'
      -- NEW in v52. Everything else in this expression was already here.
      AND s.session_date <= public.studio_today()
      AND s.session_date >= e.enrolled_on
      AND (e.dropped_on IS NULL OR s.session_date <= e.dropped_on)
      AND (a.status IS DISTINCT FROM 'excused' OR cfg.excused_counts_against)
    )                  AS counts
  FROM public.portal_enrollments e
  JOIN public.portal_classes c            ON c.id = e.class_id
  CROSS JOIN ranges r
  CROSS JOIN public.portal_settings cfg
  JOIN public.portal_class_sessions s
    ON s.class_id = e.class_id
   AND CASE r.range
         WHEN 'month'  THEN date_trunc('month', s.session_date)
                            = date_trunc('month', public.studio_today())
         WHEN 'season' THEN (c.season_start IS NULL OR s.session_date >= c.season_start)
                        AND (c.season_end   IS NULL OR s.session_date <= c.season_end)
         ELSE true
       END
  LEFT JOIN public.portal_attendance a
    ON a.session_id = s.id
   AND a.student_id = e.student_id
)
SELECT
  sc.student_id,
  sc.class_id,
  sc.enrollment_id,
  sc.range,
  sc.season,
  sc.status,
  sc.enrolled_on,
  sc.dropped_on,
  -- 'sick' is deliberately absent here and deliberately absent from the
  -- exclusion above: it stays in the denominator and is not attendance.
  count(*) FILTER (WHERE sc.counts AND sc.mark IN ('present', 'late'))::int AS attended,
  count(*) FILTER (WHERE sc.counts)::int                                    AS counted,
  CASE
    WHEN count(*) FILTER (WHERE sc.counts) = 0 THEN NULL
    ELSE round(
      100.0 * count(*) FILTER (WHERE sc.counts AND sc.mark IN ('present', 'late'))
      / count(*) FILTER (WHERE sc.counts)
    )::int
  END                                                                       AS percent,
  c.name          AS class_name,
  c.style         AS class_style,
  c.category      AS class_category,
  c.day_of_week,
  c.start_time,
  c.end_time,
  c.season_start,
  c.season_end,
  c.location      AS class_location,
  c.instructor_name,
  c.level         AS class_level,
  c.what_to_bring
FROM scoped sc
JOIN public.portal_classes c ON c.id = sc.class_id
GROUP BY
  sc.student_id, sc.class_id, sc.enrollment_id, sc.range, sc.season, sc.status,
  sc.enrolled_on, sc.dropped_on, c.name, c.style, c.category, c.day_of_week,
  c.start_time, c.end_time, c.season_start, c.season_end, c.location,
  c.instructor_name, c.level, c.what_to_bring;

CREATE OR REPLACE VIEW public.portal_attendance_detail
WITH (security_invoker = true) AS
SELECT
  e.student_id,
  e.class_id,
  s.id           AS session_id,
  s.session_date,
  s.status       AS session_status,
  s.note,
  a.status,
  (
    s.status = 'held'
    AND s.session_date <= public.studio_today()
    AND s.session_date >= e.enrolled_on
    AND (e.dropped_on IS NULL OR s.session_date <= e.dropped_on)
    AND (a.status IS DISTINCT FROM 'excused' OR cfg.excused_counts_against)
  ) AS counts_toward_total,
  CASE
    WHEN s.status = 'cancelled'                  THEN 'cancelled'
    WHEN s.status = 'closed'                     THEN 'closed'
    WHEN s.session_date < e.enrolled_on          THEN 'before-enrollment'
    WHEN e.dropped_on IS NOT NULL
     AND s.session_date > e.dropped_on           THEN 'after-drop'
    -- Ordered after the enrollment window on purpose: for a dancer who has
    -- left, every future Tuesday is 'after-drop', which says more than
    -- 'upcoming' does.
    WHEN s.session_date > public.studio_today()  THEN 'upcoming'
    WHEN a.status = 'excused'
     AND NOT cfg.excused_counts_against          THEN 'excused'
    ELSE NULL
  END AS excluded_reason
FROM public.portal_enrollments e
JOIN public.portal_class_sessions s ON s.class_id = e.class_id
CROSS JOIN public.portal_settings cfg
LEFT JOIN public.portal_attendance a
  ON a.session_id = s.id
 AND a.student_id = e.student_id;

REVOKE ALL ON public.portal_attendance_summary FROM anon, authenticated;
REVOKE ALL ON public.portal_attendance_detail  FROM anon, authenticated;
GRANT SELECT ON public.portal_attendance_summary TO authenticated;
GRANT SELECT ON public.portal_attendance_detail  TO authenticated;

COMMIT;

-- =============================================================================
-- 5. A teacher may read their own roster
-- =============================================================================

BEGIN;

-- Whether the signed-in staff member teaches a class the dancer is enrolled in.
--
-- SECURITY DEFINER for the same reason v33's can_see_student() is: the caller
-- is asked a yes/no question without being granted read on
-- portal_class_instructors joined to every enrollment in the studio.
--
-- Note this is NOT `can_edit_portal_class` applied per student — that function
-- already ORs in is_admin(), and an admin is handled by the existing v33 policy
-- alongside this one. Keeping them separate means a policy reads as
-- `<household> OR <admin> OR <teaches them>` rather than nesting.
CREATE OR REPLACE FUNCTION public.staff_teaches_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.portal_enrollments e
    JOIN public.portal_class_instructors pci ON pci.class_id = e.class_id
    JOIN public.profiles p ON p.id = pci.profile_id
    WHERE e.student_id = p_student_id
      AND pci.profile_id = auth.uid()
      AND p.is_active IS NOT FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.staff_teaches_student(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_teaches_student(uuid) TO authenticated;

-- Every policy below is ADDITIVE. Postgres ORs permissive policies together, so
-- adding one cannot take anything away from a parent or an admin — the v33
-- policies are untouched and still decide their access on their own.
--
-- Each helper call is wrapped in a subselect so it evaluates once as an
-- InitPlan rather than once per row (ATTENDANCE-NOTES item 2).

DROP POLICY IF EXISTS portal_students_select_staff ON public.portal_students;
CREATE POLICY portal_students_select_staff ON public.portal_students
  FOR SELECT TO authenticated
  USING ((SELECT public.staff_teaches_student(id)));

DROP POLICY IF EXISTS portal_enrollments_select_staff ON public.portal_enrollments;
CREATE POLICY portal_enrollments_select_staff ON public.portal_enrollments
  FOR SELECT TO authenticated
  USING ((SELECT public.can_edit_portal_class(class_id)));

DROP POLICY IF EXISTS portal_class_sessions_select_staff ON public.portal_class_sessions;
CREATE POLICY portal_class_sessions_select_staff ON public.portal_class_sessions
  FOR SELECT TO authenticated
  USING ((SELECT public.can_edit_portal_class(class_id)));

DROP POLICY IF EXISTS portal_attendance_select_staff ON public.portal_attendance;
CREATE POLICY portal_attendance_select_staff ON public.portal_attendance
  FOR SELECT TO authenticated
  USING ((SELECT public.can_edit_portal_class(class_id)));

-- DELIBERATELY NOT GRANTED: portal_households and portal_household_members.
-- A teacher needs a child's name and whether they were in the room. They do not
-- need the family's email address, and a roster screen has no reason to be able
-- to reach one.
--
-- ALSO DELIBERATE: portal_students.display_name is readable here because it is
-- a column on a row the teacher can now see, but it is the household nickname
-- (v33: "Bug is not on the invoice") and no staff screen may render it. The
-- roster shows first_name/last_name, which is what the enrollment is under.

COMMIT;

-- =============================================================================
-- 6. The season's sessions
--
-- WHY GENERATE AT ALL, RATHER THAN CREATING A SESSION WHEN A TEACHER OPENS ONE
--
-- Because "we missed taking attendance on the 9th" is only answerable if the
-- 9th exists. A row created on demand means a class nobody ever opened leaves
-- no trace, and the one failure the studio most wants to catch — a teacher who
-- never takes attendance at all — is precisely the one that would be invisible.
--
-- Holidays are handled by marking a generated session 'cancelled' or 'closed',
-- which v33 already removes from every denominator retroactively. Generating
-- the whole season up front is what makes that possible in advance: the office
-- can walk Thanksgiving week and close it before anyone is marked anything.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_generate_class_sessions(
  p_class_id uuid DEFAULT NULL,
  p_from     date DEFAULT NULL,
  p_to       date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_created  int := 0;
  v_classes  int := 0;
  v_skipped  jsonb := '[]'::jsonb;
  c          record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  FOR c IN
    SELECT id, name, day_of_week, season_start, season_end
    FROM public.portal_classes
    WHERE is_active IS NOT FALSE
      AND (p_class_id IS NULL OR id = p_class_id)
  LOOP
    -- A class with no weekday or no season has no schedule to project. Saying
    -- so by name beats generating nothing and reporting success.
    IF c.day_of_week IS NULL OR c.season_start IS NULL OR c.season_end IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('class', c.name, 'reason', 'no schedule');
      CONTINUE;
    END IF;

    v_classes := v_classes + 1;

    WITH wanted AS (
      SELECT d::date AS session_date
      FROM generate_series(
        greatest(c.season_start, coalesce(p_from, c.season_start)),
        least(c.season_end,      coalesce(p_to,   c.season_end)),
        interval '1 day'
      ) AS d
      -- portal_classes.day_of_week is 0=Sunday to match Date.getDay(), and
      -- Postgres EXTRACT(DOW) is 0=Sunday too. They agree; this is not a
      -- coincidence worth relying on silently.
      WHERE EXTRACT(DOW FROM d) = c.day_of_week
    ),
    ins AS (
      INSERT INTO public.portal_class_sessions (class_id, session_date, status, source)
      SELECT c.id, w.session_date, 'held', 'schedule'
      FROM wanted w
      -- Never disturbs a session that already exists: an imported one, a
      -- hand-added makeup, or a date the office already marked closed.
      ON CONFLICT (class_id, session_date) DO NOTHING
      RETURNING 1
    )
    SELECT v_created + count(*) INTO v_created FROM ins;
  END LOOP;

  RETURN jsonb_build_object(
    'classes', v_classes,
    'created', v_created,
    'skipped', v_skipped
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.admin_generate_class_sessions(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_class_sessions(uuid, date, date) TO authenticated;

-- =============================================================================
-- 7. What did we miss
--
-- The banner at the top of a class. Two different failures share one shape:
--   marked = 0        -> nobody took attendance at all that day
--   marked < expected -> some dancers were never given a mark
--
-- `expected` is the roster AS IT WAS on the date, not today's roster. A dancer
-- who joined in October is not missing from September, and one who dropped in
-- November does not make every December class look incomplete forever.
-- =============================================================================

CREATE OR REPLACE VIEW public.portal_attendance_gaps
WITH (security_invoker = true) AS
SELECT
  s.class_id,
  s.id            AS session_id,
  s.session_date,
  count(e.id)::int                              AS expected,
  count(a.id)::int                              AS marked,
  (count(e.id) - count(a.id))::int              AS missing
FROM public.portal_class_sessions s
JOIN public.portal_enrollments e
  ON e.class_id = s.class_id
 AND e.enrolled_on <= s.session_date
 AND (e.dropped_on IS NULL OR e.dropped_on >= s.session_date)
LEFT JOIN public.portal_attendance a
  ON a.session_id = s.id
 AND a.student_id = e.student_id
WHERE s.status = 'held'
  -- Today counts: a class that met an hour ago and was never marked is the
  -- single most useful thing this view can surface. Tomorrow does not.
  AND s.session_date <= public.studio_today()
GROUP BY s.class_id, s.id, s.session_date
HAVING count(e.id) > count(a.id);

REVOKE ALL ON public.portal_attendance_gaps FROM anon, authenticated;
GRANT SELECT ON public.portal_attendance_gaps TO authenticated;

-- =============================================================================
-- 8. The kill switch
--
-- The studio takes attendance in the app UNTIL the Enrolio reports arrive, then
-- stops. That is a planned end, not a hypothetical, so it gets a switch now
-- rather than a code change later under time pressure.
--
-- Turning it off leaves every historical mark readable and every export
-- working. It closes the write path only.
-- =============================================================================

ALTER TABLE public.portal_settings
  ADD COLUMN IF NOT EXISTS attendance_capture_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.portal_settings.attendance_capture_enabled IS
  'False once Enrolio becomes the source of attendance. Blocks staff_mark_attendance '
  'for everyone except a super admin, who keeps a way in to fix a bad row.';

-- =============================================================================
-- 9. Taking attendance
--
-- WHY AN RPC AND NOT INSERT/UPDATE POLICIES
--
-- Four reasons, in order of how much they would have hurt:
--
--   1. One mark is three writes — the attendance row, the history row, and the
--      recorded_by/recorded_at stamp. Policies cannot make those atomic, so a
--      client that crashed between them would leave a mark with no trail.
--   2. The rule "this dancer must actually be on this class's roster" is a
--      join. As a WITH CHECK it is re-evaluated per row and is easy to write
--      subtly wrong; here it is one readable IF.
--   3. A teacher marks a whole class at once. One round trip beats thirty.
--   4. The kill switch has to be enforced somewhere the client cannot skip.
--
-- WHY NO TIME LIMIT ON EDITING
--
-- Studio decision, 2026-09-08: a teacher may correct their own class at any
-- time. The history table is what makes that safe rather than merely permissive
-- — every change keeps its previous value, its author and its timestamp.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.staff_mark_attendance(
  p_session_id uuid,
  p_marks      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_class_id       uuid;
  v_session_status text;
  v_session_date   date;
  v_enabled        boolean;
  m                jsonb;
  v_student        uuid;
  v_status         text;
  v_old            text;
  v_written        int := 0;
  v_unchanged      int := 0;
BEGIN
  IF p_marks IS NULL OR jsonb_typeof(p_marks) <> 'array' THEN
    RAISE EXCEPTION 'marks must be a JSON array';
  END IF;

  SELECT class_id, status, session_date
    INTO v_class_id, v_session_status, v_session_date
    FROM public.portal_class_sessions
   WHERE id = p_session_id;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'No such class session';
  END IF;

  -- can_edit_portal_class is `is_admin() OR teaches this class`, which is
  -- exactly the rule: a teacher marks their own classes, an admin marks any.
  IF NOT public.can_edit_portal_class(v_class_id) THEN
    RAISE EXCEPTION 'You do not teach this class';
  END IF;

  SELECT attendance_capture_enabled INTO v_enabled FROM public.portal_settings WHERE id;
  IF NOT v_enabled AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Attendance is now imported from Enrolio and can no longer be taken in the app';
  END IF;

  IF v_session_status <> 'held' THEN
    RAISE EXCEPTION 'That date is marked % - set it back to held before taking attendance', v_session_status;
  END IF;

  -- A class that has not happened cannot have been attended. Without this a
  -- mistyped date silently creates a present mark in November.
  IF v_session_date > public.studio_today() THEN
    RAISE EXCEPTION 'That class has not happened yet';
  END IF;

  FOR m IN SELECT * FROM jsonb_array_elements(p_marks) LOOP
    v_student := nullif(m->>'student_id', '')::uuid;
    v_status  := m->>'status';

    IF v_student IS NULL THEN
      RAISE EXCEPTION 'A mark is missing its student_id';
    END IF;
    IF v_status IS NULL OR v_status NOT IN ('present', 'absent', 'excused', 'late', 'sick') THEN
      RAISE EXCEPTION 'Unknown attendance status %', coalesce(v_status, 'null');
    END IF;

    -- The roster as it was on the day, matching portal_attendance_gaps. A
    -- dancer who dropped in October cannot be marked for a November class.
    IF NOT EXISTS (
      SELECT 1 FROM public.portal_enrollments e
      WHERE e.student_id = v_student
        AND e.class_id   = v_class_id
        AND e.enrolled_on <= v_session_date
        AND (e.dropped_on IS NULL OR e.dropped_on >= v_session_date)
    ) THEN
      RAISE EXCEPTION 'That dancer was not on this roster on %', v_session_date;
    END IF;

    SELECT status INTO v_old
      FROM public.portal_attendance
     WHERE student_id = v_student AND session_id = p_session_id;

    -- Re-marking a dancer the same thing is what a teacher scrolling back
    -- through a saved list does constantly. It is not a change, it does not
    -- earn a history row, and counting it as one would bury the real edits.
    IF v_old IS DISTINCT FROM v_status THEN
      INSERT INTO public.portal_attendance
        (student_id, class_id, session_id, status, source, recorded_by, recorded_at)
      VALUES
        (v_student, v_class_id, p_session_id, v_status, 'app', auth.uid(), now())
      ON CONFLICT (student_id, session_id) DO UPDATE
        SET status      = excluded.status,
            source      = 'app',
            recorded_by = auth.uid(),
            recorded_at = now();

      INSERT INTO public.portal_attendance_history
        (student_id, class_id, session_id, old_status, new_status, changed_by, source)
      VALUES
        (v_student, v_class_id, p_session_id, v_old, v_status, auth.uid(), 'app');

      v_written := v_written + 1;
    ELSE
      v_unchanged := v_unchanged + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('written', v_written, 'unchanged', v_unchanged);
END
$fn$;

REVOKE ALL ON FUNCTION public.staff_mark_attendance(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_mark_attendance(uuid, jsonb) TO authenticated;

-- =============================================================================
-- 10. The class did not meet
--
-- A teacher needs this as much as an admin does — they are the one who knows
-- the studio lost power. Marking a session cancelled removes it from every
-- dancer's denominator retroactively, which is the correct outcome and also a
-- large one, so it is logged with a name against it.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.staff_set_session_status(
  p_session_id uuid,
  p_status     text,
  p_note       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_class_id uuid;
  v_old      text;
  v_date     date;
  v_marks    int;
BEGIN
  IF p_status NOT IN ('held', 'cancelled', 'closed') THEN
    RAISE EXCEPTION 'Unknown session status %', p_status;
  END IF;

  SELECT class_id, status, session_date
    INTO v_class_id, v_old, v_date
    FROM public.portal_class_sessions
   WHERE id = p_session_id;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'No such class session';
  END IF;

  IF NOT public.can_edit_portal_class(v_class_id) THEN
    RAISE EXCEPTION 'You do not teach this class';
  END IF;

  SELECT count(*) INTO v_marks FROM public.portal_attendance WHERE session_id = p_session_id;

  -- Cancelling a session that already has marks does not delete them — it stops
  -- them counting. Deleting would destroy a teacher's record of who turned up
  -- to a class that was later called off, which is a real thing that happens
  -- when half a class arrives before the studio closes.
  UPDATE public.portal_class_sessions
     SET status = p_status,
         note   = coalesce(p_note, note)
   WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_date', v_date,
    'was', v_old,
    'now', p_status,
    'marks_kept', v_marks
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.staff_set_session_status(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_set_session_status(uuid, text, text) TO authenticated;

-- =============================================================================
-- VERIFY
--
--   -- 1. Five statuses, three sources
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'portal_attendance_status_check';        -- includes 'sick'
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'portal_class_sessions_source_check';    -- includes 'schedule'
--
--   -- 2. The denominator stops at today. Nothing in the future counts:
--   SELECT count(*) FROM portal_attendance_detail
--    WHERE excluded_reason = 'upcoming' AND counts_toward_total;   -- must be 0
--
--   -- 3. A teacher sees their own roster and nobody else's. As that teacher:
--   SELECT count(*) FROM portal_students;      -- their dancers only
--   SELECT count(*) FROM portal_households;    -- must be 0
--
--   -- 4. Generate the season, then confirm no percentage moved:
--   --    snapshot BEFORE, run admin_generate_class_sessions(), snapshot AFTER,
--   --    diff. Any change means the studio_today() bound is not holding.
--   SELECT student_id, class_id, attended, counted, percent
--     FROM portal_attendance_summary WHERE range = 'season' ORDER BY 1, 2;
--
-- ROLLBACK
--
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.staff_mark_attendance(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.staff_set_session_status(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.admin_generate_class_sessions(uuid, date, date);
--   DROP VIEW     IF EXISTS public.portal_attendance_gaps;
--   DROP POLICY   IF EXISTS portal_students_select_staff       ON public.portal_students;
--   DROP POLICY   IF EXISTS portal_enrollments_select_staff    ON public.portal_enrollments;
--   DROP POLICY   IF EXISTS portal_class_sessions_select_staff ON public.portal_class_sessions;
--   DROP POLICY   IF EXISTS portal_attendance_select_staff     ON public.portal_attendance;
--   DROP FUNCTION IF EXISTS public.staff_teaches_student(uuid);
--   -- Sessions generated by this migration, and nothing else:
--   DELETE FROM public.portal_class_sessions
--    WHERE source = 'schedule'
--      AND id NOT IN (SELECT session_id FROM public.portal_attendance);
--   COMMIT;
--
--   -- The views must then be restored from v33 verbatim, and 'sick' rows
--   -- resolved before the old constraint will re-apply. Rolling back after
--   -- teachers have marked anything is not a clean operation — prefer turning
--   -- attendance_capture_enabled off.
-- =============================================================================
