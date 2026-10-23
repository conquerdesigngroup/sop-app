-- =============================================================================
-- v70 — class evaluations
-- =============================================================================
--
-- Teachers rate each dancer in their own classes (performance, attendance,
-- showmanship, 1 to 5), add a comment and a "move up" flag. A dancer's family
-- sees an evaluation only once the teacher has SUBMITTED it.
--
-- THIS FILE WAS READ OFF PRODUCTION, NOT REPLAYED FROM HISTORY.
--
-- It was applied to the live project (sgppeenmvskwztaszkgn) on 2026-10-22 as
-- five steps: portal_evaluations_v1, portal_evaluations_admin_export,
-- portal_evaluations_v2_audit_and_grants, portal_evaluations_v3_admin_settings
-- and portal_evaluations_v4_export_legal_names. This file is those five
-- collapsed into the state production is in now, so a fresh database ends up
-- identical. Everything is idempotent: running it on
-- production again changes nothing.
--
-- THE SHAPE
--
--   * One row per (dancer, class, season, round). A "round" is a named
--     checkpoint inside a season ("Fall midterm", "Final"). Every round uses the
--     same form; only the status differs.
--   * Status is 'draft' or 'submitted'. Drafts are visible to the class's
--     teachers and to admins. Submitted rows are also visible to the dancer's
--     family. Editing a submitted row keeps it submitted.
--   * There is no INSERT/UPDATE/DELETE policy and no write grant for any client
--     role. All writes go through staff_save_evaluation(), which is SECURITY
--     DEFINER and re-checks everything. Same posture as portal_attendance (v52).
--   * portal_settings.evaluations_enabled is the admin switch. Off means
--     teachers cannot save; admins always can; families can still read what was
--     already submitted. portal_settings is SELECT-only for client roles, so the
--     switch is written by admin_set_evaluation_settings().
--
-- AUDIT
--
-- Every admin write, and every write that leaves a row submitted, goes to
-- activity_logs, with the previous values for an edit. A family can read a
-- submitted evaluation, so a later change to one has to leave a trace — that
-- includes a teacher correcting their own. (The first version logged only
-- admins and first submissions; a teacher's edit to a submitted row left
-- nothing. Found by testing as a teacher on 2026-10-22.)
--
-- DECISION LEFT TO THE OWNER
--
-- portal_evaluations_select_family uses can_see_student(), which admits a
-- guardian AND a dancer's own login (portal_household_members.student_id). So a
-- dancer with their own login can read their own submitted evaluations,
-- including the comment and the move-up flag. If that is not wanted, change the
-- policy to require a guardian — see EVALUATIONS-BUILD.md, "Open decisions".
-- =============================================================================


-- ---------------------------------------------------------- 1. the admin switch

alter table public.portal_settings
  add column if not exists evaluations_enabled boolean not null default false,
  add column if not exists evaluation_round    text    not null default '';

comment on column public.portal_settings.evaluations_enabled is
  'Admin switch. Off: teachers cannot save evaluations. Admins always can; families still read what was submitted.';
comment on column public.portal_settings.evaluation_round is
  'Name of the round teachers are currently filling in, e.g. "Fall midterm". Empty means none is open.';


-- ------------------------------------------------------------------ 2. the table

create table if not exists public.portal_evaluations (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.portal_students(id) on delete cascade,
  class_id     uuid not null references public.portal_classes(id)  on delete cascade,
  season       text not null,
  round        text not null check (btrim(round) <> ''),
  performance  smallint check (performance between 1 and 5),
  attendance   smallint check (attendance  between 1 and 5),
  showmanship  smallint check (showmanship between 1 and 5),
  comment      text     not null default '' check (length(comment) <= 4000),
  -- Present on every evaluation; only the season's last round is meant to be
  -- read as the promotion recommendation. That is a screen convention, not a
  -- database rule.
  move_up      boolean  not null default false,
  status       text     not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id),
  created_by   uuid references public.profiles(id),
  updated_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (student_id, class_id, season, round),
  -- A submitted evaluation is a finished one.
  constraint portal_evaluations_submitted_complete check (
    status <> 'submitted'
    or (performance is not null and attendance is not null and showmanship is not null)
  )
);

-- The unique key above already serves (student_id, ...) lookups. These two serve
-- "everything for this class and round" (the teacher's list and the admin
-- export) and "what has this dancer's family been sent".
create index if not exists portal_evaluations_class_idx
  on public.portal_evaluations (class_id, season, round);
create index if not exists portal_evaluations_student_idx
  on public.portal_evaluations (student_id) where status = 'submitted';

drop trigger if exists portal_evaluations_updated_at on public.portal_evaluations;
create trigger portal_evaluations_updated_at
  before update on public.portal_evaluations
  for each row execute function public.update_updated_at_column();


-- ---------------------------------------------------------- 3. who can read it

alter table public.portal_evaluations enable row level security;

-- Supabase hands new tables full DML to client roles; RLS is the only thing
-- that would stand between a client and a write. Take it away, like
-- portal_attendance has it: SELECT only, and only for signed-in users.
revoke all on public.portal_evaluations from public, anon, authenticated;
grant select on public.portal_evaluations to authenticated;

-- (select ...) so Postgres evaluates the helper once per query, not per row.
drop policy if exists portal_evaluations_select_family on public.portal_evaluations;
create policy portal_evaluations_select_family on public.portal_evaluations
  for select to authenticated
  using (status = 'submitted' and (select public.can_see_student(student_id)));

-- Teachers of the class, and admins (can_edit_portal_class includes is_admin()).
drop policy if exists portal_evaluations_select_staff on public.portal_evaluations;
create policy portal_evaluations_select_staff on public.portal_evaluations
  for select to authenticated
  using ((select public.can_edit_portal_class(class_id)));


-- ------------------------------------------- 4. the one write path for teachers

create or replace function public.staff_save_evaluation(
  p_student_id uuid, p_class_id uuid,
  p_performance smallint, p_attendance smallint, p_showmanship smallint,
  p_comment text, p_move_up boolean,
  p_submit boolean default false, p_season text default null::text, p_round text default null::text
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
  v_id        uuid;
  v_status    text;
BEGIN
  IF NOT public.can_edit_portal_class(p_class_id) THEN
    RAISE EXCEPTION 'You do not teach this class';
  END IF;

  SELECT evaluations_enabled, evaluation_round
    INTO v_enabled, v_round_now
    FROM public.portal_settings WHERE id;

  -- Teachers need the switch on; admins and super admins can always edit.
  IF NOT v_enabled AND NOT v_admin THEN
    RAISE EXCEPTION 'Evaluations are closed right now';
  END IF;

  -- Season comes from the class unless an admin is editing an older one.
  SELECT season INTO v_season FROM public.portal_classes WHERE id = p_class_id;
  v_season := coalesce(nullif(btrim(p_season), ''), v_season);
  v_round  := coalesce(nullif(btrim(p_round), ''),  nullif(btrim(v_round_now), ''));

  IF v_season IS NULL THEN RAISE EXCEPTION 'This class has no season set'; END IF;
  IF v_round  IS NULL THEN RAISE EXCEPTION 'No evaluation round is open - an admin needs to set the round name'; END IF;

  -- Only a teacher on a non-admin path is pinned to the open round.
  IF NOT v_admin AND p_round IS NOT NULL AND btrim(p_round) <> btrim(v_round_now) THEN
    RAISE EXCEPTION 'That round is not open';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.portal_enrollments e
    WHERE e.student_id = p_student_id AND e.class_id = p_class_id AND e.status = 'active'
  ) AND NOT v_admin THEN
    RAISE EXCEPTION 'That dancer is not on this class roster';
  END IF;

  IF p_submit AND (p_performance IS NULL OR p_attendance IS NULL OR p_showmanship IS NULL) THEN
    RAISE EXCEPTION 'Fill in all three ratings before submitting';
  END IF;

  SELECT * INTO v_old FROM public.portal_evaluations
   WHERE student_id = p_student_id AND class_id = p_class_id
     AND season = v_season AND round = v_round;

  -- Editing an already-submitted evaluation keeps it submitted (stays visible to parents).
  v_status := CASE WHEN p_submit OR v_old.status = 'submitted' THEN 'submitted' ELSE 'draft' END;

  INSERT INTO public.portal_evaluations
    (student_id, class_id, season, round, performance, attendance, showmanship,
     comment, move_up, status, submitted_at, submitted_by, created_by, updated_by)
  VALUES
    (p_student_id, p_class_id, v_season, v_round, p_performance, p_attendance, p_showmanship,
     coalesce(p_comment, ''), coalesce(p_move_up, false), v_status,
     CASE WHEN v_status = 'submitted' THEN now() END,
     CASE WHEN v_status = 'submitted' THEN auth.uid() END,
     auth.uid(), auth.uid())
  ON CONFLICT (student_id, class_id, season, round) DO UPDATE SET
    performance  = excluded.performance,
    attendance   = excluded.attendance,
    showmanship  = excluded.showmanship,
    comment      = excluded.comment,
    move_up      = excluded.move_up,
    status       = excluded.status,
    submitted_at = CASE WHEN excluded.status = 'submitted'
                        THEN coalesce(public.portal_evaluations.submitted_at, now()) END,
    submitted_by = CASE WHEN excluded.status = 'submitted'
                        THEN coalesce(public.portal_evaluations.submitted_by, auth.uid()) END,
    updated_by   = auth.uid()
  RETURNING id INTO v_id;

  -- Audit trail: every admin write, and every write that leaves the row
  -- submitted. A parent can read a submitted evaluation, so a change to one
  -- (including a teacher's own correction) must leave a trace of what it was.
  IF v_admin OR v_status = 'submitted' THEN
    PERFORM public.log_activity(
      CASE WHEN v_old.id IS NULL AND v_status = 'submitted' THEN 'evaluation_submitted'
           WHEN v_old.id IS NULL THEN 'evaluation_created'
           WHEN v_old.status = 'submitted' THEN 'evaluation_edited'
           WHEN v_status = 'submitted' THEN 'evaluation_submitted'
           ELSE 'evaluation_edited' END,
      'portal_evaluation', v_id::text, NULL,
      jsonb_build_object(
        'student_id', p_student_id, 'class_id', p_class_id,
        'season', v_season, 'round', v_round, 'status', v_status, 'by_admin', v_admin,
        'before', CASE WHEN v_old.id IS NOT NULL THEN jsonb_build_object(
                    'status', v_old.status, 'performance', v_old.performance,
                    'attendance', v_old.attendance, 'showmanship', v_old.showmanship,
                    'move_up', v_old.move_up, 'comment', v_old.comment) END)
    );
  END IF;

  RETURN jsonb_build_object('id', v_id, 'status', v_status, 'season', v_season, 'round', v_round);
END
$function$;

revoke all on function public.staff_save_evaluation(uuid,uuid,smallint,smallint,smallint,text,boolean,boolean,text,text) from public, anon;
grant execute on function public.staff_save_evaluation(uuid,uuid,smallint,smallint,smallint,text,boolean,boolean,text,text) to authenticated;


-- ------------------------------------------------------- 5. the admin's switch

create or replace function public.admin_set_evaluation_settings(
  p_enabled boolean,
  p_round   text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
DECLARE
  v_old_enabled boolean;
  v_old_round   text;
  v_round       text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Say whether evaluations should be open or closed';
  END IF;

  SELECT evaluations_enabled, evaluation_round
    INTO v_old_enabled, v_old_round
    FROM public.portal_settings WHERE id;

  -- NULL keeps the current name, so the switch can be flipped without retyping it.
  v_round := CASE WHEN p_round IS NULL THEN v_old_round ELSE btrim(p_round) END;

  IF p_enabled AND v_round = '' THEN
    RAISE EXCEPTION 'Name the round before opening evaluations';
  END IF;
  IF length(v_round) > 80 THEN
    RAISE EXCEPTION 'That round name is too long';
  END IF;

  UPDATE public.portal_settings
     SET evaluations_enabled = p_enabled,
         evaluation_round    = v_round,
         updated_at          = now()
   WHERE id;

  PERFORM public.log_activity(
    'evaluation_settings_changed', 'portal_settings', 'evaluations', NULL,
    jsonb_build_object(
      'enabled', p_enabled, 'round', v_round,
      'before', jsonb_build_object('enabled', v_old_enabled, 'round', v_old_round))
  );

  RETURN jsonb_build_object('evaluations_enabled', p_enabled, 'evaluation_round', v_round);
END
$function$;

revoke all on function public.admin_set_evaluation_settings(boolean, text) from public, anon;
grant execute on function public.admin_set_evaluation_settings(boolean, text) to authenticated;


-- ---------------------------------------------- 6. lookup and export, admin only

-- One call returns both what the export contains and what the "N of M filled
-- out" notice needs, so the two can never disagree.
--
-- It starts from the ROSTERS, not from the evaluations table: a dancer nobody
-- has evaluated yet has no row, and that absence is exactly what the notice
-- must report. Filters: p_class_ids and/or p_student_ids (at least one is
-- required, so nobody exports the whole studio by accident), p_season (default:
-- each class's own season), p_round (default: the open round).
--
-- NAMES are first_name + last_name and never display_name: that column is the
-- household nickname ("Bug is not on the invoice", v33), and an export is a
-- document a family may receive. Same rule as attendanceStaff.ts.
--
-- Returns { summary, evaluations }:
--   summary     { round, total, submitted, draft, not_started,
--                 by_class: [{ class_id, class_name, total, submitted,
--                              missing: [{ student_id, name, state }] }] }
--   evaluations one object per dancer+class that is 'submitted', plus 'draft'
--               when p_include_drafts. Not-started rows carry no content and are
--               reported in summary only.
create or replace function public.admin_evaluation_export(
  p_class_ids      uuid[]  default null,
  p_student_ids    uuid[]  default null,
  p_season         text    default null,
  p_round          text    default null,
  p_include_drafts boolean default false
) returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
DECLARE
  v_round   text;
  v_rows    jsonb;
  v_summary jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  IF (p_class_ids IS NULL OR cardinality(p_class_ids) = 0)
     AND (p_student_ids IS NULL OR cardinality(p_student_ids) = 0) THEN
    RAISE EXCEPTION 'Pick at least one class or one student';
  END IF;

  v_round := coalesce(nullif(btrim(p_round), ''),
                      nullif(btrim((SELECT evaluation_round FROM public.portal_settings WHERE id)), ''));

  WITH scope AS (
    SELECT DISTINCT e.student_id, e.class_id, c.season AS class_season
    FROM public.portal_enrollments e
    JOIN public.portal_classes c ON c.id = e.class_id
    WHERE e.status = 'active'
      AND (p_class_ids   IS NULL OR cardinality(p_class_ids)   = 0 OR e.class_id   = ANY (p_class_ids))
      AND (p_student_ids IS NULL OR cardinality(p_student_ids) = 0 OR e.student_id = ANY (p_student_ids))
      AND (p_season IS NULL OR c.season = p_season)
  ),
  joined AS (
    SELECT
      s.student_id, s.class_id,
      coalesce(p_season, s.class_season) AS season,
      st.first_name, st.last_name,
      c.name AS class_name, c.category, c.instructor_name,
      ev.id AS evaluation_id, ev.round,
      ev.performance, ev.attendance, ev.showmanship,
      ev.comment, ev.move_up, ev.submitted_at,
      CASE
        WHEN ev.status = 'submitted' THEN 'submitted'
        WHEN ev.status = 'draft'     THEN 'draft'
        ELSE 'not_started'
      END AS state
    FROM scope s
    JOIN public.portal_students st ON st.id = s.student_id
    JOIN public.portal_classes  c  ON c.id  = s.class_id
    LEFT JOIN public.portal_evaluations ev
           ON ev.student_id = s.student_id
          AND ev.class_id   = s.class_id
          AND ev.season     = coalesce(p_season, s.class_season)
          AND ev.round      = v_round
  )
  SELECT
    coalesce(jsonb_agg(to_jsonb(j) ORDER BY j.class_name, j.last_name, j.first_name), '[]'::jsonb),
    jsonb_build_object(
      'round', v_round,
      'total', count(*),
      'submitted', count(*) FILTER (WHERE j.state = 'submitted'),
      'draft', count(*) FILTER (WHERE j.state = 'draft'),
      'not_started', count(*) FILTER (WHERE j.state = 'not_started'),
      'by_class', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'class_id', g.class_id, 'class_name', g.class_name,
                 'total', g.total, 'submitted', g.submitted,
                 'missing', g.missing
               ) ORDER BY g.class_name), '[]'::jsonb)
        FROM (
          SELECT j2.class_id, j2.class_name,
                 count(*) AS total,
                 count(*) FILTER (WHERE j2.state = 'submitted') AS submitted,
                 coalesce(jsonb_agg(jsonb_build_object(
                   'student_id', j2.student_id,
                   'name', j2.first_name || ' ' || j2.last_name,
                   'state', j2.state
                 ) ORDER BY j2.last_name, j2.first_name) FILTER (WHERE j2.state <> 'submitted'), '[]'::jsonb) AS missing
          FROM joined j2
          GROUP BY j2.class_id, j2.class_name
        ) g
      )
    )
  INTO v_rows, v_summary
  FROM joined j;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'evaluations', (
      SELECT coalesce(jsonb_agg(r), '[]'::jsonb)
      FROM jsonb_array_elements(v_rows) r
      WHERE r->>'state' = 'submitted'
         OR (p_include_drafts AND r->>'state' = 'draft')
    )
  );
END
$function$;

revoke all on function public.admin_evaluation_export(uuid[], uuid[], text, text, boolean) from public, anon;
grant execute on function public.admin_evaluation_export(uuid[], uuid[], text, text, boolean) to authenticated;
