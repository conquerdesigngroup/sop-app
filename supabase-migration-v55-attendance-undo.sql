-- =============================================================================
-- Migration v55 — taking a mark back
--
-- NOT YET APPLIED. Run against SOP-APP (sgppeenmvskwztaszkgn) before the app
-- change that depends on it ships; until then the Undo and Clear controls will
-- fail with "Unknown attendance status null" and nothing will be written.
-- =============================================================================
--
-- v52 gave a teacher five statuses and no sixth door. Every write path — the
-- RPC, the table, the history row — assumes a mark is being SET, so a mark can
-- be changed from present to absent forever but can never go back to not having
-- been made. That is the one thing an undo has to be able to do.
--
-- WHY "NOT MARKED" IS NOT JUST ANOTHER STATUS
--
-- It is the absence of a claim, and the app already leans on that difference in
-- three places: portal_attendance_gaps counts unmarked dancers as work still to
-- do, the roster draws them with a dashed "Not marked" chip precisely so a
-- teacher can find them, and portal_attendance_summary leaves them out of the
-- denominator rather than counting them against the child. A sixth status
-- called 'unmarked' would have to be special-cased out of all three, and any
-- place that forgot would start telling a family something false about their
-- child. Deleting the row is what "nobody has said anything" already means.
--
-- THE MISTAKE THIS EXISTS TO FIX
--
-- "Mark the remaining 25 present" is one tap and twenty-five rows. A teacher
-- who hits it on the wrong class — easy at 5:20pm, the classes are a list and
-- they all look alike — has no way back: the dancers were unmarked, and no
-- sequence of taps in the app can return them to unmarked. Those 25 wrong
-- presents then sit in the denominator of 25 families' attendance percentages,
-- and nothing on any screen suggests anything is wrong.
--
-- WHAT IS DELIBERATELY NOT LOST
--
-- Clearing a mark deletes the portal_attendance row and writes a history row
-- that records what was there. The trail is the whole reason v52 allows editing
-- with no time limit, and an undo that erased its own evidence would quietly
-- remove the answer to "she was marked present on Tuesday and now she is not".
-- =============================================================================

-- =============================================================================
-- 1. History can record a removal
--
-- old_status was already nullable, for the first mark anybody makes about a
-- dancer on a date. new_status is the mirror of it: NULL means the mark was
-- taken away. Both null would be a row that records nothing happening, so the
-- CHECK rules it out rather than leaving it to the caller.
-- =============================================================================

ALTER TABLE public.portal_attendance_history
  ALTER COLUMN new_status DROP NOT NULL;

COMMENT ON COLUMN public.portal_attendance_history.new_status IS
  'The mark after this change. NULL means the mark was REMOVED — the dancer '
  'went back to not marked. Mirrors old_status, where NULL means there was no '
  'mark before.';

ALTER TABLE public.portal_attendance_history
  DROP CONSTRAINT IF EXISTS portal_attendance_history_says_something;

ALTER TABLE public.portal_attendance_history
  ADD CONSTRAINT portal_attendance_history_says_something
  CHECK (old_status IS NOT NULL OR new_status IS NOT NULL);

-- =============================================================================
-- 2. A mark with no status clears it
--
-- WHY THIS EXTENDS staff_mark_attendance RATHER THAN ADDING staff_clear_*
--
-- Undo is a BATCH and has to be all-or-nothing. Undoing "mark the remaining 25
-- present" clears 25 rows; undoing a single tap on a dancer who was already
-- marked absent puts 'absent' back. A general undo is therefore a mix of
-- clears and sets, and across two RPCs that is two transactions — so a dropped
-- connection between them leaves the roster in a state the teacher never chose
-- and did not ask for. One function, one transaction, one answer.
--
-- The permission, kill-switch, session-status, future-date and roster checks
-- are unchanged and apply to a clear exactly as they do to a mark: taking a
-- mark back is an edit to the register, not an escape from the rules about who
-- may edit it.
--
-- PRESENT-AND-NULL, NOT MISSING
--
-- `m ? 'status'` tests that the key is THERE. A mark that omits status entirely
-- is a caller bug and still raises, the way it did before this migration — only
-- an explicit {"student_id": …, "status": null} clears. Without that
-- distinction any future serialisation slip that dropped the field would
-- silently delete a register instead of failing loudly.
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
  v_clearing       boolean;
  v_old            text;
  v_written        int := 0;
  v_unchanged      int := 0;
  v_cleared        int := 0;
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
    v_student  := nullif(m->>'student_id', '')::uuid;
    v_status   := m->>'status';
    v_clearing := (m ? 'status') AND v_status IS NULL;

    IF v_student IS NULL THEN
      RAISE EXCEPTION 'A mark is missing its student_id';
    END IF;
    IF NOT v_clearing
       AND (v_status IS NULL OR v_status NOT IN ('present', 'absent', 'excused', 'late', 'sick')) THEN
      RAISE EXCEPTION 'Unknown attendance status %', coalesce(v_status, 'null');
    END IF;

    -- The roster as it was on the day, matching portal_attendance_gaps. A
    -- dancer who dropped in October cannot be marked for a November class.
    --
    -- Checked when clearing too. A dancer who is no longer on the roster cannot
    -- be marked, so a mark against them is exactly the bad row someone would
    -- want to remove — but removing it is the office's job through a path that
    -- records why, not a teacher's through a roster that will not show them.
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
    -- Clearing a dancer who is already unmarked is the same non-event: undo
    -- sends the whole batch back, including rows a later tap already returned
    -- to where undo was about to put them.
    IF v_old IS DISTINCT FROM v_status THEN
      IF v_clearing THEN
        DELETE FROM public.portal_attendance
         WHERE student_id = v_student AND session_id = p_session_id;

        v_cleared := v_cleared + 1;
      ELSE
        INSERT INTO public.portal_attendance
          (student_id, class_id, session_id, status, source, recorded_by, recorded_at)
        VALUES
          (v_student, v_class_id, p_session_id, v_status, 'app', auth.uid(), now())
        ON CONFLICT (student_id, session_id) DO UPDATE
          SET status      = excluded.status,
              source      = 'app',
              recorded_by = auth.uid(),
              recorded_at = now();

        v_written := v_written + 1;
      END IF;

      -- Written for a clear as well as a set: v_status is NULL there, which is
      -- precisely what the widened column now means.
      INSERT INTO public.portal_attendance_history
        (student_id, class_id, session_id, old_status, new_status, changed_by, source)
      VALUES
        (v_student, v_class_id, p_session_id, v_old, v_status, auth.uid(), 'app');
    ELSE
      v_unchanged := v_unchanged + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'written',   v_written,
    'unchanged', v_unchanged,
    'cleared',   v_cleared
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.staff_mark_attendance(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_mark_attendance(uuid, jsonb) TO authenticated;

-- =============================================================================
-- 3. Check it
--
-- Run as a teacher who holds the class, against a held session in the past.
-- Replace the two ids. Expect: cleared 1, then the dancer absent from
-- portal_attendance, and two history rows — the set and the removal.
-- =============================================================================

-- SELECT public.staff_mark_attendance(
--   '<session-uuid>'::uuid,
--   '[{"student_id": "<student-uuid>", "status": "present"}]'::jsonb
-- );
-- SELECT public.staff_mark_attendance(
--   '<session-uuid>'::uuid,
--   '[{"student_id": "<student-uuid>", "status": null}]'::jsonb
-- );
-- SELECT status FROM public.portal_attendance
--  WHERE session_id = '<session-uuid>' AND student_id = '<student-uuid>';   -- 0 rows
-- SELECT old_status, new_status FROM public.portal_attendance_history
--  WHERE session_id = '<session-uuid>' AND student_id = '<student-uuid>'
--  ORDER BY changed_at;                                  -- (null, present), (present, null)

-- A mark that OMITS status is still an error, not a clear:
-- SELECT public.staff_mark_attendance(
--   '<session-uuid>'::uuid,
--   '[{"student_id": "<student-uuid>"}]'::jsonb
-- );                                       -- ERROR: Unknown attendance status null
