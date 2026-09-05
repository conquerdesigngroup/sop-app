-- =============================================================================
-- v45 -- switch a teacher's editing off without forgetting they teach it
--
-- WHAT CHANGES
--
-- portal_class_instructors gains is_paused, and the two helper functions stop
-- counting a paused row. Nothing else moves: the write policies still ask
-- can_edit_portal_class(), so they inherit this for free.
--
-- WHY A FLAG AND NOT A DELETE
--
-- Deleting the row was already the way to take a class off a teacher, and it
-- has two problems.
--
-- The first is that it forgets. The row is the only record that this person
-- teaches this class; removing it to stop them editing for a term also throws
-- away the answer to "who has this class". Turning it back on later means
-- finding them again.
--
-- The second is worse, and it is why this is a migration rather than a button.
-- The bulk assign screen (v44's TeachersSection) treats "no grant row" as
-- "needs a grant", because that is exactly what it is built to fix. So a
-- deletion is not stable: the class still names the teacher on the schedule,
-- and the next person to press "Give these teachers their classes" silently
-- puts it back. The admin who removed it is not told, and nothing on screen
-- shows it ever happened.
--
-- A paused row is a row. The bulk screen sees it, counts it as handled, and
-- leaves it alone. "Off" therefore stays off until somebody turns it on.
--
-- WHY is_paused AND NOT is_active
--
-- Its siblings use is_active (portal_classes, profiles) and consistency would
-- argue for that name. It is not used here because the very query this column
-- is read in already joins profiles and already tests `p.is_active IS NOT
-- FALSE`. Two different is_active columns, one row apart, differing in which
-- polarity means "allowed", is a misreading waiting to happen. `pci.is_paused
-- IS NOT TRUE AND p.is_active IS NOT FALSE` cannot be misread.
--
-- DEFAULT false, so all 69 existing grants stay exactly as they are.
--
-- Verification and rollback statements are at the bottom of the file.
-- =============================================================================

BEGIN;

ALTER TABLE public.portal_class_instructors
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false,
  -- Who switched it off and when. Symmetric with granted_by, and the first
  -- question asked when a teacher says the buttons have gone.
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_by uuid REFERENCES auth.users(id);

-- -----------------------------------------------------------------------------
-- The two helpers. Both gain one condition and are otherwise unchanged --
-- SECURITY DEFINER, pinned search_path, same grants.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_edit_portal_class(target_class uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR (
        target_class IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.portal_class_instructors pci
          JOIN public.profiles p ON p.id = pci.profile_id
          WHERE pci.class_id = target_class
            AND pci.profile_id = auth.uid()
            AND pci.is_paused IS NOT TRUE
            AND p.is_active IS NOT FALSE
        )
      );
$$;

-- Paused everywhere means no portal entry at all. Without this a teacher whose
-- every class is switched off still gets the Portal link in the nav and lands
-- on a manager page where every save is refused -- which reads as the app
-- being broken rather than as access having been turned off.
CREATE OR REPLACE FUNCTION public.can_edit_portal()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.portal_class_instructors pci
        JOIN public.profiles p ON p.id = pci.profile_id
        WHERE pci.profile_id = auth.uid()
          AND pci.is_paused IS NOT TRUE
          AND p.is_active IS NOT FALSE
      );
$$;

REVOKE ALL ON FUNCTION public.can_edit_portal_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_portal_class(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.can_edit_portal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_portal() TO authenticated;

COMMIT;

-- =============================================================================
-- VERIFY
--
--   -- Every existing grant is still live:
--   SELECT count(*) FILTER (WHERE NOT is_paused) AS live,
--          count(*) FILTER (WHERE is_paused)     AS paused
--     FROM public.portal_class_instructors;         -- 69 live, 0 paused
--
--   -- Both functions now mention is_paused:
--   SELECT proname,
--          pg_get_functiondef(oid) LIKE '%is_paused%' AS honours_pause
--     FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('can_edit_portal', 'can_edit_portal_class')
--    ORDER BY 1;                                    -- both true
--
--   -- The write policies are untouched and still route through the helper:
--   SELECT tablename, count(*)
--     FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('portal_documents','portal_updates')
--      AND cmd IN ('INSERT','UPDATE','DELETE')
--      AND coalesce(qual, with_check) LIKE '%can_edit_portal_class%'
--    GROUP BY 1;                                    -- three each
--
--   -- End to end, without needing a session -- pause one row and read it back:
--   --   UPDATE public.portal_class_instructors SET is_paused = true
--   --    WHERE class_id = '<class>' AND profile_id = '<teacher>';
--   --   -- then, as that teacher, can_edit_portal_class('<class>') is false.
--
-- ROLLBACK -- restores the v9 function bodies verbatim and drops the columns
--
--   BEGIN;
--   CREATE OR REPLACE FUNCTION public.can_edit_portal_class(target_class uuid)
--   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
--   AS $$
--     SELECT public.is_admin()
--         OR (target_class IS NOT NULL AND EXISTS (
--               SELECT 1 FROM public.portal_class_instructors pci
--               JOIN public.profiles p ON p.id = pci.profile_id
--               WHERE pci.class_id = target_class AND pci.profile_id = auth.uid()
--                 AND p.is_active IS NOT FALSE));
--   $$;
--   CREATE OR REPLACE FUNCTION public.can_edit_portal()
--   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
--   AS $$
--     SELECT public.is_admin()
--         OR EXISTS (SELECT 1 FROM public.portal_class_instructors pci
--                    JOIN public.profiles p ON p.id = pci.profile_id
--                    WHERE pci.profile_id = auth.uid() AND p.is_active IS NOT FALSE);
--   $$;
--   ALTER TABLE public.portal_class_instructors
--     DROP COLUMN IF EXISTS is_paused,
--     DROP COLUMN IF EXISTS paused_at,
--     DROP COLUMN IF EXISTS paused_by;
--   COMMIT;
--
--   NOTE: dropping is_paused silently RE-ENABLES every paused teacher, because
--   the row that was switched off becomes an ordinary grant again. Read the
--   paused rows out first if that matters.
-- =============================================================================
