-- =============================================================================
-- v73 — staff_clear_evaluation(): start a dancer's evaluation over
-- =============================================================================
--
-- A teacher who has saved a draft and wants to begin again had no way to get
-- back to "Not started": no client role may DELETE from portal_evaluations
-- (v70), and a draft with every rating set back to null is not the same thing
-- as no draft. This is the one write path that removes a row.
--
-- DRAFTS ONLY. A submitted evaluation is visible to the family; taking it away
-- would be a different feature with a different conversation behind it
-- (what does the parent see — a gap?). The function refuses, in words, and the
-- form does not offer Clear for a submitted dancer at all. Editing is the way.
--
-- Same gates as staff_save_evaluation: can_edit_portal_class(), the switch for
-- teachers, the open round for teachers, any round for admins. Logged as
-- evaluation_cleared with the values that were removed, for every caller — a
-- teacher clearing a colleague's draft on a shared class is worth a trace.
-- =============================================================================

create or replace function public.staff_clear_evaluation(
  p_student_id uuid, p_class_id uuid,
  p_season text default null::text, p_round text default null::text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
DECLARE
  v_enabled   boolean;
  v_round_now text;
  v_season    text;
  v_round     text;
  v_admin     boolean := public.is_admin();
  v_old       public.portal_evaluations%ROWTYPE;
BEGIN
  IF NOT public.can_edit_portal_class(p_class_id) THEN
    RAISE EXCEPTION 'You do not teach this class';
  END IF;

  SELECT evaluations_enabled, evaluation_round
    INTO v_enabled, v_round_now
    FROM public.portal_settings WHERE id;

  IF NOT v_enabled AND NOT v_admin THEN
    RAISE EXCEPTION 'Evaluations are closed right now';
  END IF;

  SELECT season INTO v_season FROM public.portal_classes WHERE id = p_class_id;
  v_season := coalesce(nullif(btrim(p_season), ''), v_season);
  v_round  := coalesce(nullif(btrim(p_round), ''),  nullif(btrim(v_round_now), ''));

  IF v_season IS NULL THEN RAISE EXCEPTION 'This class has no season set'; END IF;
  IF v_round  IS NULL THEN RAISE EXCEPTION 'No evaluation round is open - an admin needs to set the round name'; END IF;

  IF NOT v_admin AND p_round IS NOT NULL AND btrim(p_round) <> btrim(v_round_now) THEN
    RAISE EXCEPTION 'That round is not open';
  END IF;

  SELECT * INTO v_old FROM public.portal_evaluations
   WHERE student_id = p_student_id AND class_id = p_class_id
     AND season = v_season AND round = v_round;

  -- Nothing saved: nothing to do, and not an error — the form clears itself.
  IF v_old.id IS NULL THEN
    RETURN jsonb_build_object('cleared', false);
  END IF;

  IF v_old.status = 'submitted' THEN
    RAISE EXCEPTION 'A submitted evaluation cannot be cleared - edit it instead';
  END IF;

  DELETE FROM public.portal_evaluations WHERE id = v_old.id;

  PERFORM public.log_activity(
    'evaluation_cleared', 'portal_evaluation', v_old.id::text, NULL,
    jsonb_build_object(
      'student_id', p_student_id, 'class_id', p_class_id,
      'season', v_season, 'round', v_round, 'by_admin', v_admin,
      'before', jsonb_build_object(
        'status', v_old.status, 'performance', v_old.performance,
        'attendance', v_old.attendance, 'showmanship', v_old.showmanship,
        'move_up', v_old.move_up, 'comment', v_old.comment))
  );

  RETURN jsonb_build_object('cleared', true, 'season', v_season, 'round', v_round);
END
$function$;

revoke all on function public.staff_clear_evaluation(uuid, uuid, text, text) from public, anon;
grant execute on function public.staff_clear_evaluation(uuid, uuid, text, text) to authenticated;

comment on function public.staff_clear_evaluation(uuid, uuid, text, text) is
  'Removes a DRAFT evaluation so the dancer is Not started again. Refuses a submitted one. Same gates as staff_save_evaluation. v73.';
