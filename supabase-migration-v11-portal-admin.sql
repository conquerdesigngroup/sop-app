-- =============================================================================
-- v11 — one read-only helper for the portal manager
--
-- STATUS: APPLIED to prod 2026-08-21 as v11_portal_program_has_code.
--
-- VERIFIED on apply, by impersonating each caller in Postgres:
--   an admin      allstars = true, academy = true, unknown slug = false
--   a team member refused, not answered
--   anon          denied outright — no EXECUTE grant
--
-- Both programs already have a code set, so neither is in the gated-but-
-- unreachable state this function exists to make visible.
--
-- Phase 3 (the staff authoring UI) is otherwise entirely client-side: v9
-- already carries every write policy it needs. This is the one thing the
-- browser cannot answer for itself.
--
-- THE PROBLEM
--
-- portal_access_codes has no RLS policy and no grants — deliberately, so the
-- bcrypt hash cannot be read by anyone through PostgREST. That is also why the
-- admin screen cannot tell "gated, code set" from "gated, no code set", and the
-- difference matters: verify_portal_code() fails closed, so a program with
-- requires_code = true and no code row is a section nobody can enter. Before
-- this function the manager could only warn about that in the abstract.
--
-- It returns a boolean about existence. No hash, no length, no timestamp —
-- nothing an attacker could work backwards from, and admin-only besides.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.portal_program_has_code(p_slug text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_id uuid;
BEGIN
  -- Enforced here rather than by a policy: the table this reads is unreachable
  -- by every role, which is the point of it.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may check portal access codes';
  END IF;

  SELECT id INTO v_program_id FROM public.portal_programs WHERE slug = p_slug;
  IF v_program_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.portal_access_codes WHERE program_id = v_program_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.portal_program_has_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_program_has_code(text) TO authenticated;

COMMIT;

-- =============================================================================
-- VERIFY
-- =============================================================================
--
-- As an admin, both programs answer honestly:
--
--   SELECT slug, public.portal_program_has_code(slug) FROM public.portal_programs;
--
-- As anon, the function is not callable at all:
--
--   BEGIN;
--   SET LOCAL ROLE anon;
--     SELECT public.portal_program_has_code('allstars');   -- permission denied
--   ROLLBACK;
--
-- As a non-admin employee, it raises rather than answering:
--
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SET LOCAL request.jwt.claims TO '{"sub":"<a team member uuid>"}';
--     SELECT public.portal_program_has_code('allstars');   -- ERROR
--   ROLLBACK;
--
-- The manager treats an error as "unknown" and keeps working, so applying this
-- late does not break the screen — it just cannot warn until you do.
-- =============================================================================
