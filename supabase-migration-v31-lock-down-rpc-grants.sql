-- =============================================================================
-- Migration v31 — take internal functions off the API's RPC menu
-- =============================================================================
--
-- The Supabase security advisor flagged internal functions as executable by
-- anon/authenticated — the roles every request through the public API runs
-- as. Five trigger functions (handle_new_user, prevent_privilege_escalation,
-- prevent_privileged_insert, update_updated_at_column,
-- update_work_hours_updated_at) and one SECURITY DEFINER helper
-- (staff_sync_google_events) carried EXECUTE grants they were never meant to
-- have.
--
-- WHERE THE GRANTS CAME FROM
--
-- Nobody wrote them. Supabase sets default privileges on the public schema so
-- every newly created function is BORN with EXECUTE granted to PUBLIC, anon,
-- authenticated and service_role. A migration that creates a function and
-- does not immediately revoke has therefore published it; v28 and v29 did the
-- revoke, the earlier migrations did not know to. That is also exactly how
-- staff_sync_google_events regressed: v15 revoked PUBLIC and anon on the
-- four-argument version, then v20 changed the signature — which creates a NEW
-- function with fresh default grants — and the revoke did not travel with it.
--
-- Rule for every migration after this one: CREATE FUNCTION, then REVOKE, in
-- the same file — and again after any signature change, because a new
-- signature is a new function. (Fixing the schema default with ALTER DEFAULT
-- PRIVILEGES was considered and declined: it silently changes what every
-- future migration and every Supabase snippet assumes, and this project's
-- migrations now handle grants explicitly anyway.)
--
-- HOW MUCH WAS ACTUALLY EXPOSED — honestly, less than it sounds
--
--   * Trigger functions: Postgres refuses to run them outside a trigger
--     ("trigger functions can only be called as triggers"), and PostgREST
--     leaves trigger-returning functions out of /rest/v1/rpc/ entirely. The
--     grants were wrong, not exploitable. They go so that nothing ever comes
--     to depend on those two refusals.
--   * staff_sync_google_events: reachable by anon in principle, but its first
--     statement rejects every caller except service_role and super-admins.
--     Defence in depth, not an open door.
--
-- WHY REVOKING BREAKS NOTHING
--
--   * Trigger firing does not check EXECUTE at run time. The privilege is
--     checked once, when CREATE TRIGGER runs, and postgres — who owns these
--     functions and created these triggers — keeps EXECUTE through ownership.
--     Signups still fire handle_new_user; updated_at columns still tick.
--   * Every revoke below includes PUBLIC. Several functions were exposed
--     through the PUBLIC pseudo-role rather than a direct anon grant, and
--     revoking anon alone would have left that route open.
--   * service_role grants are left alone. They are as inert as the rest on
--     trigger functions, and this migration only narrows.
--
-- THE ANON-EXPOSED SECURITY DEFINER HELPERS, REVIEWED ONE BY ONE
--
--   * staff_sync_google_events — anon and PUBLIC go, restoring v15's intent.
--     authenticated stays (staff app calls it as a signed-in super-admin);
--     the internal auth.role()/is_super_admin() gate remains the real lock.
--   * is_admin, is_portal_calendar — carried PUBLIC grants nothing uses.
--     PUBLIC goes; their explicit grants stay.
--   * is_portal_calendar keeps `anon` FOR NOW. The live access-code portal's
--     calendar_attachments_anon_read policy calls it, and a role needs
--     EXECUTE on a function named in a policy even when the function is
--     SECURITY DEFINER. Revoking today would return "permission denied" on
--     every anon read of calendar_event_attachments — the portal calendar's
--     attachments would vanish for every visitor. The revoke rides in v30,
--     beside the drop of the one policy that needs it.
--   * verify_portal_code keeps `anon` DELIBERATELY. An anon call proving a
--     code is the entire mechanism of the no-login portal. It retires with
--     the access-code path after the v30 flip, as v30's header records.

-- ------------------------------------------------------ 1. trigger functions
--
-- The five the advisor flagged, plus the two work_hours trigger functions
-- that carried an `authenticated` grant the advisor had no reason to mention
-- (no anon route) but which is equally unused. Revoking a grant a function
-- does not hold is a no-op, so each line lists all three roles.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.prevent_privilege_escalation() from public, anon, authenticated;
revoke execute on function public.prevent_privileged_insert() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;
revoke execute on function public.update_work_hours_updated_at() from public, anon, authenticated;
revoke execute on function public.work_hours_compute_total() from public, anon, authenticated;
revoke execute on function public.work_hours_freeze_pay() from public, anon, authenticated;

-- ------------------------------------------------ 2. security definer helpers

-- Staff-only calendar sync write path. Signature is the five-argument v20
-- form — revoking the four-argument one v15 locked would hit a function that
-- no longer exists.
revoke execute on function public.staff_sync_google_events(text, date, date, jsonb, timestamptz)
  from public, anon;

-- Only the unused PUBLIC route closes on these two; the explicit grants
-- (authenticated on both, anon on is_portal_calendar until v30) survive.
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_portal_calendar(text) from public;

-- verify_portal_code(text, text): untouched, deliberately — see the header.
