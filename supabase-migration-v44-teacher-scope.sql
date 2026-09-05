-- =============================================================================
-- v44 -- a teacher's class, but not the studio calendar
--
-- WHAT CHANGES
--
-- One thing: writing portal_events becomes admin-only. Info posts and files
-- stay exactly as v9 built them.
--
-- WHY
--
-- v9 gave a class grant all three kinds of content at once -- updates, files
-- and events -- because they hang off a class the same way and there was no
-- reason yet to separate them. Turning the grants on for real (103 classes,
-- ~13 teachers) is that reason. Files and info posts are a teacher telling
-- their own families something: a rehearsal note, a music track, a costume
-- sheet. A calendar event is different in kind. It lands in the portal
-- calendar, it syncs to Google, and families subscribe to it -- so a mistake
-- there reaches phones that are not in that class and is not undone by
-- deleting the row.
--
-- The studio owner asked for Info and Files. This is that line, drawn where
-- Postgres can hold it.
--
-- WHY NOT A COLUMN, OR A SECOND GRANT TABLE
--
-- Because nobody has asked for a teacher who may post events and not files, or
-- the reverse. A `can_post_events` flag on portal_class_instructors would be a
-- column that is false on every row, plus a checkbox nobody ticks, plus a
-- fourth thing to get wrong in the UI. If that need ever turns up, the change
-- is to add the column then -- widening a policy later is easy, and a
-- permission column that exists but is never set is the kind of thing that
-- gets defaulted to true by accident.
--
-- WHAT THIS DOES NOT TOUCH
--
--   * portal_events_read_staff. A teacher keeps READING their class's events,
--     including unpublished ones. Taking that away would blank the class page
--     for the person who teaches it, and reading was never the problem.
--   * The storage policies. They ask can_edit_portal(), which is "does this
--     person hold any class at all" -- still true for a teacher, and still
--     what uploading a file to their own class requires.
--   * can_edit_portal_class(). It is still exactly right for updates and
--     documents, which is where it is still used.
--
-- NOTE ON is_admin(): can_edit_portal_class() begins with `SELECT
-- public.is_admin() OR ...`, so replacing the whole expression with
-- public.is_admin() is a strict narrowing. No admin loses anything.
--
-- Verification and rollback statements are at the bottom of the file.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS portal_events_insert ON public.portal_events;
DROP POLICY IF EXISTS portal_events_update ON public.portal_events;
DROP POLICY IF EXISTS portal_events_delete ON public.portal_events;

CREATE POLICY portal_events_insert ON public.portal_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY portal_events_update ON public.portal_events
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY portal_events_delete ON public.portal_events
  FOR DELETE TO authenticated
  USING (public.is_admin());

COMMIT;

-- =============================================================================
-- VERIFY
--
--   SELECT policyname, cmd, qual, with_check
--     FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'portal_events'
--    ORDER BY policyname;
--   -- portal_events_delete       DELETE  is_admin()            --
--   -- portal_events_insert       INSERT  --                    is_admin()
--   -- portal_events_read         SELECT  is_published          --
--   -- portal_events_read_staff   SELECT  (is_admin() OR can_edit_portal_class(class_id))
--   -- portal_events_update       UPDATE  is_admin()            is_admin()
--
--   -- Files and info posts must be UNCHANGED -- both still name the grant:
--   SELECT tablename, policyname
--     FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('portal_documents','portal_updates')
--      AND cmd IN ('INSERT','UPDATE','DELETE')
--      AND coalesce(qual, with_check) LIKE '%can_edit_portal_class%'
--    ORDER BY 1, 2;                                  -- six rows, three each
--
-- ROLLBACK -- restores the v9 policies verbatim
--
--   BEGIN;
--   DROP POLICY IF EXISTS portal_events_insert ON public.portal_events;
--   DROP POLICY IF EXISTS portal_events_update ON public.portal_events;
--   DROP POLICY IF EXISTS portal_events_delete ON public.portal_events;
--
--   CREATE POLICY portal_events_insert ON public.portal_events
--     FOR INSERT TO authenticated
--     WITH CHECK (public.is_admin() OR public.can_edit_portal_class(class_id));
--   CREATE POLICY portal_events_update ON public.portal_events
--     FOR UPDATE TO authenticated
--     USING (public.is_admin() OR public.can_edit_portal_class(class_id))
--     WITH CHECK (public.is_admin() OR public.can_edit_portal_class(class_id));
--   CREATE POLICY portal_events_delete ON public.portal_events
--     FOR DELETE TO authenticated
--     USING (public.is_admin() OR public.can_edit_portal_class(class_id));
--   COMMIT;
-- =============================================================================
