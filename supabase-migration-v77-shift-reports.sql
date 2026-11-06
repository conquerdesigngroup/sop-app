-- =============================================================================
-- v77 -- shift reports: an opening or closing report per shift, with tags and
--        a chat thread, readable by every member of staff
--
-- WHAT THIS ADDS
--
-- 1. shift_reports          -- one report: who wrote it, opening or closing,
--                              which studio day, the text, and whether it has
--                              been archived.
-- 2. shift_report_tags      -- a member of staff tagged on a report, and when
--                              they opened it. An unseen tag is what puts the
--                              report on that person's dashboard.
-- 3. shift_report_comments  -- the chat under a report.
-- 4. set_shift_report_archived() and mark_shift_report_seen(), the two writes
--    that are not a plain insert by the author.
--
-- ---------------------------------------------------------------------------
-- WHO MAY DO WHAT
-- ---------------------------------------------------------------------------
--
--   read everything          any active staff member (is_active_staff()).
--                            Parents have accounts and are `authenticated`,
--                            so `authenticated` is not the test -- same
--                            reasoning as the task-files bucket in v76.
--   write a report           staff, as themselves only.
--   edit a report            its author, while it is not archived.
--   archive / restore        management (is_admin(): admin and super_admin),
--                            through set_shift_report_archived() only.
--   tag someone              the report's author or management, and only an
--                            active member of staff can be tagged.
--   untag                    the report's author or management.
--   mark a tag seen          the tagged person, through mark_shift_report_seen().
--   chat                     staff, as themselves; delete own, or management.
--
-- Nobody can delete a report from the app. Archive is the way out of the list,
-- so the general manager never loses one by a mis-tap.
--
-- WHY THE CHAT IS A TABLE AND NOT A jsonb COLUMN LIKE job_tasks.comments
--
-- job_tasks.comments is read, appended to in the browser, and written back
-- whole. Two people posting in the same minute each write back their own copy
-- and one message is lost. A row per message cannot lose one.
--
-- Depends on: public.is_active_staff (v28), public.is_admin (v13),
-- public.studio_today (v52), public.log_activity (v29),
-- public.update_updated_at_column (schema).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Reports
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shift_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id    uuid NOT NULL REFERENCES public.profiles(id),
  shift_type   text NOT NULL CHECK (shift_type IN ('opening', 'closing')),
  -- The studio's day, not the writer's: a closing report typed at 12:20am
  -- still belongs to the day that was closed only if the writer says so, so
  -- the app sends the date it shows and this is just the fallback.
  shift_date   date NOT NULL DEFAULT public.studio_today(),
  body         text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 20000),
  archived_at  timestamptz,
  archived_by  uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_reports_created_at ON public.shift_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_reports_author ON public.shift_reports (author_id);

COMMENT ON TABLE public.shift_reports IS
  'Opening and closing shift reports. Read by all staff; archived by management. See v77.';

DROP TRIGGER IF EXISTS update_shift_reports_updated_at ON public.shift_reports;
CREATE TRIGGER update_shift_reports_updated_at
  BEFORE UPDATE ON public.shift_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The author's update policy below lets them change their own row. This keeps
-- that to the report itself: who wrote it and when never change, and only
-- management moves it in or out of the archive.
CREATE OR REPLACE FUNCTION public.shift_reports_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'The author and time of a shift report cannot be changed';
  END IF;
  IF (NEW.archived_at IS DISTINCT FROM OLD.archived_at
      OR NEW.archived_by IS DISTINCT FROM OLD.archived_by)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can archive or restore a shift report';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shift_reports_guard ON public.shift_reports;
CREATE TRIGGER shift_reports_guard
  BEFORE UPDATE ON public.shift_reports
  FOR EACH ROW EXECUTE FUNCTION public.shift_reports_guard();

ALTER TABLE public.shift_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_reports_select ON public.shift_reports;
DROP POLICY IF EXISTS shift_reports_insert ON public.shift_reports;
DROP POLICY IF EXISTS shift_reports_update_own ON public.shift_reports;

CREATE POLICY shift_reports_select ON public.shift_reports
  FOR SELECT TO authenticated
  USING ((SELECT public.is_active_staff()));

CREATE POLICY shift_reports_insert ON public.shift_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_active_staff())
    AND author_id = (SELECT auth.uid())
    AND archived_at IS NULL
    AND archived_by IS NULL
  );

CREATE POLICY shift_reports_update_own ON public.shift_reports
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_active_staff())
    AND author_id = (SELECT auth.uid())
    AND archived_at IS NULL
  )
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND archived_at IS NULL
  );

-- No DELETE policy: archive instead.

REVOKE ALL ON public.shift_reports FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.shift_reports TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Tags
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shift_report_tags (
  report_id   uuid NOT NULL REFERENCES public.shift_reports(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id),
  tagged_by   uuid NOT NULL REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  seen_at     timestamptz,
  PRIMARY KEY (report_id, user_id)
);

-- The dashboard's question: "what am I tagged on that I have not opened?"
CREATE INDEX IF NOT EXISTS idx_shift_report_tags_unseen
  ON public.shift_report_tags (user_id) WHERE seen_at IS NULL;

ALTER TABLE public.shift_report_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_report_tags_select ON public.shift_report_tags;
DROP POLICY IF EXISTS shift_report_tags_insert ON public.shift_report_tags;
DROP POLICY IF EXISTS shift_report_tags_delete ON public.shift_report_tags;

CREATE POLICY shift_report_tags_select ON public.shift_report_tags
  FOR SELECT TO authenticated
  USING ((SELECT public.is_active_staff()));

CREATE POLICY shift_report_tags_insert ON public.shift_report_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_active_staff())
    AND tagged_by = (SELECT auth.uid())
    AND seen_at IS NULL
    AND (
      (SELECT public.is_admin())
      OR EXISTS (
        SELECT 1 FROM public.shift_reports r
        WHERE r.id = shift_report_tags.report_id AND r.author_id = (SELECT auth.uid())
      )
    )
    -- Only a member of staff can be tagged: never a parent account, never
    -- someone who has been switched off.
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = shift_report_tags.user_id
        AND p.is_active IS NOT FALSE
        AND p.role IN ('super_admin', 'admin', 'team')
    )
  );

CREATE POLICY shift_report_tags_delete ON public.shift_report_tags
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_active_staff())
    AND (
      (SELECT public.is_admin())
      OR EXISTS (
        SELECT 1 FROM public.shift_reports r
        WHERE r.id = shift_report_tags.report_id AND r.author_id = (SELECT auth.uid())
      )
    )
  );

-- No UPDATE policy: seen_at is set through mark_shift_report_seen().

REVOKE ALL ON public.shift_report_tags FROM anon;
GRANT SELECT, INSERT, DELETE ON public.shift_report_tags TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Chat
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shift_report_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES public.shift_reports(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.profiles(id),
  body        text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_report_comments_report
  ON public.shift_report_comments (report_id, created_at);

ALTER TABLE public.shift_report_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_report_comments_select ON public.shift_report_comments;
DROP POLICY IF EXISTS shift_report_comments_insert ON public.shift_report_comments;
DROP POLICY IF EXISTS shift_report_comments_delete ON public.shift_report_comments;

CREATE POLICY shift_report_comments_select ON public.shift_report_comments
  FOR SELECT TO authenticated
  USING ((SELECT public.is_active_staff()));

CREATE POLICY shift_report_comments_insert ON public.shift_report_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_active_staff())
    AND author_id = (SELECT auth.uid())
  );

CREATE POLICY shift_report_comments_delete ON public.shift_report_comments
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_active_staff())
    AND (author_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  );

REVOKE ALL ON public.shift_report_comments FROM anon;
GRANT SELECT, INSERT, DELETE ON public.shift_report_comments TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. The two writes that are not the author's own
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_shift_report_archived(p_report uuid, p_archived boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can archive or restore a shift report'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.shift_reports
     SET archived_at = CASE WHEN p_archived THEN now() ELSE NULL END,
         archived_by = CASE WHEN p_archived THEN auth.uid() ELSE NULL END
   WHERE id = p_report
  RETURNING initcap(shift_type) || ' report, ' || to_char(shift_date, 'Mon DD, YYYY')
    INTO v_title;

  IF v_title IS NULL THEN
    RAISE EXCEPTION 'No such shift report' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.log_activity(
    CASE WHEN p_archived THEN 'shift_report_archived' ELSE 'shift_report_restored' END,
    'shift_report', p_report::text, v_title);
END;
$$;

REVOKE ALL ON FUNCTION public.set_shift_report_archived(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shift_report_archived(uuid, boolean) TO authenticated;

-- Marks the caller's own tag on a report as opened. A no-op when they were
-- not tagged, so the app can call it on every open without asking first.
CREATE OR REPLACE FUNCTION public.mark_shift_report_seen(p_report uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shift_report_tags
     SET seen_at = now()
   WHERE report_id = p_report
     AND user_id = auth.uid()
     AND seen_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_shift_report_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_shift_report_seen(uuid) TO authenticated;

COMMIT;
