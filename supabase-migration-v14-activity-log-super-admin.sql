-- =============================================================================
-- v14 — the audit log becomes super-admin only
-- =============================================================================
--
-- STATUS: APPLIED to prod 2026-08-26 as migration `v14_activity_log_super_admin_only`
--         (project sgppeenmvskwztaszkgn). No client deploy needed — the
--         /activity-log route was already superAdminOnly as of 1.0.12, so this
--         closes the gap between what the UI offered and what the database
--         allowed, rather than changing anything a user can see.
--
-- VERIFIED BY IMPERSONATION AFTER APPLYING, in a rolled-back transaction.
-- 957 rows in the table:
--
--   reads
--     team (gina)            0      team (samantha)   0
--     plain admin (kerney)   0      plain admin (leeora)  0
--     super admin alyssa   957      suzi  957      tony  957
--
--   writes, the half this could have broken
--     team member inserting their own row     ACCEPTED
--     plain admin inserting their own row     ACCEPTED
--     plain admin forging a super admin's row REFUSED, 42501
--
-- One rehearsal check was junk before it was fixed: the forgery attempt was
-- wrapped in a savepoint whose rollback also erased the row recording the
-- outcome, so it reported REFUSED unconditionally and proved nothing. Re-run
-- letting the INSERT fail the batch outright, which is where the 42501 above
-- actually comes from.
--
-- WHY
--
-- activity_logs held one SELECT policy, from the original build:
--
--     "Allow authenticated read activity_logs"   FOR SELECT  TO authenticated
--     USING (true)
--
-- USING (true) means every signed-in account — team members included — could
-- read the entire audit trail. Not just their own actions: everyone's. That
-- includes every super-admin action, every pay approval, every login event, and
-- the `details` JSON hanging off each one.
--
-- The UI never offered it (the /activity-log route is superAdminOnly as of the
-- v13 client), but a route guard is decoration. The table was one PostgREST
-- request away from anybody holding a session, and RLS was answering "yes".
--
-- v13 already moved DELETE on this table to is_super_admin(). SELECT was the
-- half that never got looked at, because the audit finding predates v13 and
-- nothing in v13's scope touched reads.
--
-- WHAT CHANGES
--
-- Reads require is_super_admin(). Nothing else moves:
--
--   INSERT  unchanged — activity_logs_insert, WITH CHECK user_id = auth.uid().
--           Every account must keep writing its own rows or the audit trail
--           stops recording the very people it exists to record. Writes do not
--           need SELECT: both client call sites and the admin-users Edge
--           Function call .insert() with no .select() chained, so PostgREST
--           asks for no row back. Verified before writing this, not assumed —
--           an .insert().select() anywhere would have made this migration
--           silently break logging for everyone below super admin.
--
--   DELETE  unchanged — already is_super_admin() from v13 §6.
--
-- DELIBERATELY NO "OR user_id = auth.uid()" BRANCH
--
-- work_hours keeps such a branch so an employee can see their own hours. This
-- table does not get one. The ask was "only super admins can see that", and an
-- own-rows branch would let any team member enumerate their own audit trail —
-- which is the record of what they did, kept for someone else to read. Add the
-- branch later if a "your recent activity" feature ever wants it; it is one
-- policy edit and it is not needed now.
--
-- THE DROP IS NOT OPTIONAL
--
-- Permissive policies are OR'd together. Adding a strict policy while leaving
-- USING (true) in place changes precisely nothing — true OR anything is true.
-- The old policy must come out, and it comes out FIRST.
--
-- NOT CHANGED, AND WHY
--
-- anon still holds table-level grants on activity_logs (arwdDxtm, from the
-- original build). That is inert: RLS is enabled, and after this migration no
-- policy anon can satisfy exists for any command — the INSERT policy needs
-- auth.uid(), which is NULL for anon. Revoking it would be tidier and would
-- match v7 part 5, but it is not this migration's job and a no-op change is
-- still a change. Noted so the next person does not read the grant as a hole.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- §1  Remove the read-everything policy. FIRST — see "THE DROP IS NOT OPTIONAL".
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow authenticated read activity_logs" ON public.activity_logs;

-- -----------------------------------------------------------------------------
-- §2  Reads are super-admin only.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS activity_logs_select_super_admin ON public.activity_logs;

CREATE POLICY activity_logs_select_super_admin
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

COMMENT ON POLICY activity_logs_select_super_admin ON public.activity_logs IS
  'v14: the audit trail is readable by super admins only. Writes stay open to '
  'every account via activity_logs_insert (user_id = auth.uid()) so the log '
  'keeps recording everyone. No own-rows read branch, on purpose.';

-- =============================================================================
-- REHEARSAL — run this BEFORE applying, inside a transaction you roll back.
-- =============================================================================
--
-- BEGIN;
--   DROP POLICY IF EXISTS "Allow authenticated read activity_logs" ON public.activity_logs;
--   CREATE POLICY activity_logs_select_super_admin ON public.activity_logs
--     FOR SELECT TO authenticated USING (public.is_super_admin());
--   SET LOCAL ROLE authenticated;
--
--   -- team member: must be 0
--   SET LOCAL request.jwt.claims TO '{"sub":"<A TEAM UUID>","role":"authenticated"}';
--   SELECT count(*) AS team_should_be_0 FROM public.activity_logs;
--
--   -- plain admin: must be 0
--   SET LOCAL request.jwt.claims TO '{"sub":"<AN ADMIN UUID>","role":"authenticated"}';
--   SELECT count(*) AS admin_should_be_0 FROM public.activity_logs;
--
--   -- super admin: must be everything
--   SET LOCAL request.jwt.claims TO '{"sub":"<A SUPER ADMIN UUID>","role":"authenticated"}';
--   SELECT count(*) AS super_should_be_all FROM public.activity_logs;
--
--   -- and a team member must STILL be able to write. This is the check that
--   -- matters most: it is the one this migration could plausibly have broken.
--   SET LOCAL request.jwt.claims TO '{"sub":"<A TEAM UUID>","role":"authenticated"}';
--   INSERT INTO public.activity_logs (user_id, user_email, user_name, action, entity_type)
--   VALUES ('<A TEAM UUID>', 'x@y.z', 'Rehearsal', 'rehearsal', 'user');
-- ROLLBACK;
--
-- =============================================================================
-- ROLLBACK OF THIS MIGRATION
-- =============================================================================
--
--   DROP POLICY activity_logs_select_super_admin ON public.activity_logs;
--   CREATE POLICY "Allow authenticated read activity_logs"
--     ON public.activity_logs FOR SELECT TO authenticated USING (true);
--
-- That restores the hole exactly as it was. Only do it if something genuinely
-- depended on non-super-admins reading this table.
-- =============================================================================
