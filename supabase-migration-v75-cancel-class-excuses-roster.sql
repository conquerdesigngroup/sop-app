-- =============================================================================
-- Migration v75 — a teacher cancels a class, and the whole roster is excused
-- =============================================================================
--
-- v52 gave staff_set_session_status() to teachers and admins: a cancelled date
-- stops counting toward every dancer's percentage. Nothing in the app called it,
-- and it wrote no marks — so the register for a cancelled Tuesday read as a
-- column of "Not marked", and a printed report said the same.
--
-- The studio asked (2026-10-23) for one action: the teacher marks the class
-- cancelled, and every dancer on that day's roster is marked Excused.
--
-- WHAT CHANGES
--
--   staff_cancel_session(session, note)
--     Sets the date to 'cancelled' with the reason given, and marks every dancer
--     on the roster AS IT WAS ON THAT DATE (the same window staff_mark_attendance
--     and portal_attendance_gaps use) 'excused', in one transaction.
--     Same gate as marking: can_edit_portal_class (own class, or an admin) and
--     attendance_capture_enabled unless super admin.
--
--     A dancer already marked something else is overwritten — a cancelled class
--     is excused for everyone, and a register half "Present" and half "Excused"
--     for a class that did not run is the confusion this exists to remove. The
--     earlier mark is not lost: it is the old_status of the history row written
--     here, and undo puts it back.
--
--     Future dates are allowed. Knowing next Tuesday is a holiday is exactly
--     when a teacher wants to say so; marking a future class EXCUSED cannot
--     invent an attendance, which is what staff_mark_attendance's future-date
--     guard protects against.
--
--   staff_restore_session(session)
--     The undo. Sets the date back to 'held', clears the reason, and for each
--     dancer whose mark was last written BY THE CANCELLATION, restores what they
--     had before it — including no mark at all. A mark someone changed after the
--     cancellation is left exactly as it is: that was a person's decision.
--
--   portal_attendance_history.new_status becomes nullable.
--     Undo can return a dancer to "no mark", and the trail has to be able to say
--     so. NULL in new_status means the mark was removed, the mirror of NULL in
--     old_status meaning there was none before. Nothing in the app reads this
--     table yet (checked 2026-10-23); v67/v68 only insert into it.
--
-- HOW UNDO KNOWS WHICH MARKS ARE ITS OWN
--
-- History rows written by a cancellation carry note = 'class-cancelled', and by
-- an undo note = 'cancellation-undone'. A dancer is restored only when their
-- most recent history row for that session is a 'class-cancelled' one. One
-- cancellation writes one row per dancer, so there is never a tie inside it.
--
-- LOCKING (from the review, 2026-10-23)
--
--   * Both new functions take the SHARED advisory lock staff_mark_attendance
--     has taken since v68. admin_enrollment_import holds it exclusively while it
--     applies and fingerprints attendance, sessions and history before and after;
--     a cancel landing mid-sync would abort the sync, and would read a roster a
--     drop was halfway through changing.
--   * staff_mark_attendance is restated here, character for character as
--     production has it (read 2026-10-23), with ONE change: it reads the session
--     FOR SHARE. Cancel and undo lock it FOR UPDATE. Without that, a mark that
--     read 'held' just before a cancel committed was written just after it — a
--     cancelled date with a Present on it, and a cancellation history row whose
--     old_status was already stale. With it, a mark in flight finishes first (and
--     the cancel then sees and records it), and a mark that arrives during the
--     cancel waits, then reads 'cancelled' and is refused.
--
-- WHAT DOES NOT CHANGE
--
-- staff_set_session_status stays as v52 wrote it. The views need nothing: a
-- cancelled session was already excluded from every denominator, and
-- portal_attendance_detail already reports its reason as 'cancelled' ahead of
-- 'excused', so a parent reads "Class cancelled", not a bare "Excused".
-- =============================================================================

BEGIN;

ALTER TABLE public.portal_attendance_history ALTER COLUMN new_status DROP NOT NULL;

COMMENT ON COLUMN public.portal_attendance_history.new_status IS
  'The mark after the change. NULL means the mark was removed (v75: undoing a '
  'cancellation for a dancer who had no mark before it).';

CREATE OR REPLACE FUNCTION public.staff_cancel_session(
  p_session_id uuid,
  p_note       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_class_id uuid;
  v_date     date;
  v_enabled  boolean;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  r          record;
  v_excused  int := 0;
  v_replaced int := 0;
  v_already  int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtext('public.admin_enrollment_import'));

  SELECT class_id, session_date
    INTO v_class_id, v_date
    FROM public.portal_class_sessions
   WHERE id = p_session_id
     FOR UPDATE;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'No such class session';
  END IF;

  IF NOT public.can_edit_portal_class(v_class_id) THEN
    RAISE EXCEPTION 'You do not teach this class';
  END IF;

  SELECT attendance_capture_enabled INTO v_enabled FROM public.portal_settings WHERE id;
  IF NOT v_enabled AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Attendance is now imported from Enrolio and can no longer be taken in the app';
  END IF;

  IF length(v_note) > 200 THEN
    RAISE EXCEPTION 'Keep the reason under 200 characters';
  END IF;

  UPDATE public.portal_class_sessions
     SET status = 'cancelled',
         note   = coalesce(v_note, note)
   WHERE id = p_session_id;

  FOR r IN
    SELECT DISTINCT e.student_id, a.status AS old_status
      FROM public.portal_enrollments e
      LEFT JOIN public.portal_attendance a
        ON a.session_id = p_session_id AND a.student_id = e.student_id
     WHERE e.class_id = v_class_id
       AND e.enrolled_on <= v_date
       AND (e.dropped_on IS NULL OR e.dropped_on >= v_date)
  LOOP
    IF r.old_status = 'excused' THEN
      v_already := v_already + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.portal_attendance
      (student_id, class_id, session_id, status, source, recorded_by, recorded_at)
    VALUES
      (r.student_id, v_class_id, p_session_id, 'excused', 'app', auth.uid(), now())
    ON CONFLICT (student_id, session_id) DO UPDATE
      SET status      = 'excused',
          source      = 'app',
          recorded_by = auth.uid(),
          recorded_at = now();

    INSERT INTO public.portal_attendance_history
      (student_id, class_id, session_id, old_status, new_status, changed_by, source, note)
    VALUES
      (r.student_id, v_class_id, p_session_id, r.old_status, 'excused', auth.uid(), 'app', 'class-cancelled');

    v_excused := v_excused + 1;
    IF r.old_status IS NOT NULL THEN
      v_replaced := v_replaced + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'session_date', v_date,
    'excused',      v_excused,
    'replaced',     v_replaced,
    'already',      v_already
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.staff_cancel_session(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_cancel_session(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_restore_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_class_id uuid;
  v_status   text;
  v_date     date;
  v_enabled  boolean;
  r          record;
  v_restored int := 0;
  v_kept     int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtext('public.admin_enrollment_import'));

  SELECT class_id, status, session_date
    INTO v_class_id, v_status, v_date
    FROM public.portal_class_sessions
   WHERE id = p_session_id
     FOR UPDATE;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'No such class session';
  END IF;

  IF NOT public.can_edit_portal_class(v_class_id) THEN
    RAISE EXCEPTION 'You do not teach this class';
  END IF;

  SELECT attendance_capture_enabled INTO v_enabled FROM public.portal_settings WHERE id;
  IF NOT v_enabled AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Attendance is now imported from Enrolio and can no longer be taken in the app';
  END IF;

  IF v_status = 'held' THEN
    RAISE EXCEPTION 'That class is not cancelled';
  END IF;

  UPDATE public.portal_class_sessions
     SET status = 'held',
         note   = NULL
   WHERE id = p_session_id;

  FOR r IN
    SELECT a.student_id, h.old_status, h.note
      FROM public.portal_attendance a
      LEFT JOIN LATERAL (
        SELECT hh.old_status, hh.note
          FROM public.portal_attendance_history hh
         WHERE hh.session_id = p_session_id
           AND hh.student_id = a.student_id
         ORDER BY hh.changed_at DESC
         LIMIT 1
      ) h ON true
     WHERE a.session_id = p_session_id
       AND a.status = 'excused'
  LOOP
    IF r.note IS DISTINCT FROM 'class-cancelled' THEN
      v_kept := v_kept + 1;
      CONTINUE;
    END IF;

    IF r.old_status IS NULL THEN
      DELETE FROM public.portal_attendance
       WHERE session_id = p_session_id AND student_id = r.student_id;
    ELSE
      UPDATE public.portal_attendance
         SET status      = r.old_status,
             source      = 'app',
             recorded_by = auth.uid(),
             recorded_at = now()
       WHERE session_id = p_session_id AND student_id = r.student_id;
    END IF;

    INSERT INTO public.portal_attendance_history
      (student_id, class_id, session_id, old_status, new_status, changed_by, source, note)
    VALUES
      (r.student_id, v_class_id, p_session_id, 'excused', r.old_status, auth.uid(), 'app', 'cancellation-undone');

    v_restored := v_restored + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'session_date', v_date,
    'restored',     v_restored,
    'kept',         v_kept
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.staff_restore_session(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_restore_session(uuid) TO authenticated;

-- staff_mark_attendance as production has it (v52, with v68's lock), plus
-- FOR SHARE on the session read. See LOCKING above. Nothing else differs.
CREATE OR REPLACE FUNCTION public.staff_mark_attendance(p_session_id uuid, p_marks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- v68: admin_enrollment_import holds this key EXCLUSIVELY while it applies.
  -- Shared here, so marks never wait for each other, only for a sync — and the
  -- roster check below then reads the rosters that sync committed.
  PERFORM pg_advisory_xact_lock_shared(hashtext('public.admin_enrollment_import'));

  -- v75: FOR SHARE, so a cancel or undo of this date (FOR UPDATE) and a mark
  -- run one after the other, never interleaved.
  SELECT class_id, status, session_date
    INTO v_class_id, v_session_status, v_session_date
    FROM public.portal_class_sessions
   WHERE id = p_session_id
     FOR SHARE;

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
$function$;

COMMIT;


-- =============================================================================
-- VERIFY
--
--   SELECT is_nullable FROM information_schema.columns
--    WHERE table_name = 'portal_attendance_history' AND column_name = 'new_status';  -- YES
--   SELECT proname, prosecdef FROM pg_proc
--    WHERE proname IN ('staff_cancel_session', 'staff_restore_session');            -- two rows, t
--   SELECT position('FOR SHARE' in pg_get_functiondef(
--     'public.staff_mark_attendance(uuid,jsonb)'::regprocedure)) > 0;               -- t
--
-- ROLLBACK
--
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.staff_cancel_session(uuid, text);
--   DROP FUNCTION IF EXISTS public.staff_restore_session(uuid);
--   -- staff_mark_attendance: re-run its definition without "FOR SHARE" (v68's).
--   -- Only once no history row has a NULL new_status:
--   ALTER TABLE public.portal_attendance_history ALTER COLUMN new_status SET NOT NULL;
--   COMMIT;
-- =============================================================================
