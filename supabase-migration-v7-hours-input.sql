-- =============================================================
-- Migration v7 — Hours Input (payroll-oriented time entry)
--
-- STATUS: APPLIED to prod 2026-08-21 (project sgppeenmvskwztaszkgn), split
--         into v7_part1_work_categories_and_columns,
--         v7_part2_server_computed_total_hours,
--         v7_part3_rls_and_schedule_templates,
--         v7_part4_pay_rates_and_frozen_pay.
--
-- This file was committed in 836f227 but never run. Until today total_hours
-- was still whatever the browser sent: an employee could PATCH their own
-- pending row with {"total_hours": 999.99} and it stored verbatim, passing
-- both RLS clauses because those constrain only employee_id and status.
-- Verified by probe before applying (stored 999.99) and after (held at 12.50,
-- recomputed from the row's own clock times).
--
-- Nobody had exploited it. All 252 rows' stored totals matched the formula
-- exactly — 818.00 hours, zero drift — and this migration leaves them
-- unchanged.
--
-- Live data was clean (no negative breaks, no unparseable times, no
-- end <= start), so §6c added all three CHECK constraints rather than
-- skipping any.
--
-- The console 404s on /rest/v1/work_categories from parent-portal pages are
-- now 401s instead: §8b revokes anon's grant outright. Same root cause
-- either way — the staff contexts fetch on a signed-out device because
-- DataProvider sits above the Router. See the note in PortalContext.
--
-- Adds:
--   1. work_categories        admin-managed list backing the
--                             "What did you work on?" dropdown
--   2. work_hours.category_id link from an entry to a category
--   3. work_hours.rejection_reason
--   4. server-side total_hours          (was client-supplied = forgeable)
--   5. server-side created_by default   (was client-supplied)
--   6. sanity CHECK constraints on times and break minutes
--   7. fixes the rejected-entry lockout (see §7)
--   8. closes the work_schedule_templates policy hole left by v6
--
-- Safe to re-run. Run in the Supabase SQL Editor.
-- Depends on v6 (public.is_admin() must already exist).
-- =============================================================

-- Fail fast rather than silently creating half of this against a
-- database that never had v6 applied.
DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'v6 has not been applied: public.is_admin() is missing. Apply supabase-migration-v6-security.sql first.';
  END IF;
END $$;


-- -------------------------------------------------------------
-- 1. work_categories
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT    NOT NULL CHECK (btrim(name) <> ''),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness among *active* categories only, so a
-- retired name can be reused later without colliding with its own
-- archived row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_categories_name_active
  ON public.work_categories (lower(btrim(name)))
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_work_categories_sort
  ON public.work_categories (sort_order, name)
  WHERE is_active;

ALTER TABLE public.work_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_categories_select" ON public.work_categories;
DROP POLICY IF EXISTS "work_categories_write"  ON public.work_categories;

-- Everyone signed in can read the list (they have to pick from it).
CREATE POLICY "work_categories_select" ON public.work_categories
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admins can add, rename, reorder, or retire a category.
CREATE POLICY "work_categories_write" ON public.work_categories
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS work_categories_updated_at ON public.work_categories;
CREATE TRIGGER work_categories_updated_at
  BEFORE UPDATE ON public.work_categories
  FOR EACH ROW EXECUTE FUNCTION update_work_hours_updated_at();


-- -------------------------------------------------------------
-- 2. Link work_hours to a category
--
-- ON DELETE SET NULL, not CASCADE: deleting a category must never
-- delete somebody's logged hours. In practice the app retires
-- categories (is_active = false) rather than deleting them, which
-- keeps historical entries readable.
-- -------------------------------------------------------------
ALTER TABLE public.work_hours
  ADD COLUMN IF NOT EXISTS category_id UUID
  REFERENCES public.work_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_hours_category
  ON public.work_hours(category_id);


-- -------------------------------------------------------------
-- 3. Rejection reason
--
-- v6 reuses approved_by / approved_at for rejections, so a rejection
-- overwrites the approval trail and carries no explanation. The
-- reason lets an admin say what to fix; the employee edits and the
-- entry returns to 'pending' (see §7).
-- -------------------------------------------------------------
ALTER TABLE public.work_hours
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;


-- -------------------------------------------------------------
-- 4. total_hours is computed by the server, not the client
--
-- Until now total_hours was whatever the browser POSTed. Anyone with
-- the anon key could log a 30-minute shift as 12 hours. This trigger
-- overwrites it on every insert and update.
--
-- The formula deliberately mirrors calculateTotalHours() in
-- src/contexts/WorkHoursContext.tsx so the number the employee sees
-- while filling the form is the number that gets stored.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_hours_compute_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  net_minutes INTEGER;
BEGIN
  -- Guard the casts. v4 typed start_time/end_time as bare TEXT with no
  -- format CHECK, so legacy rows may hold anything. A blind ::int here
  -- would raise 22P02 and abort whatever statement touched the row —
  -- including an admin simply approving it, or this migration's own
  -- repair pass in §6a.
  IF NEW.start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     AND NEW.end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN

    net_minutes :=
        (split_part(NEW.end_time,   ':', 1)::int * 60 + split_part(NEW.end_time,   ':', 2)::int)
      - (split_part(NEW.start_time, ':', 1)::int * 60 + split_part(NEW.start_time, ':', 2)::int)
      - COALESCE(NEW.break_minutes, 0);

    -- Clamped at zero, matching calculateTotalHours() on the client.
    NEW.total_hours := ROUND(GREATEST(0, net_minutes)::numeric / 60, 2);

  ELSIF TG_OP = 'INSERT' THEN
    -- Never admit a new row whose total cannot be verified.
    RAISE EXCEPTION
      'start_time and end_time must be HH:MM in 24-hour form (got start=%, end=%)',
      NEW.start_time, NEW.end_time;

  ELSE
    -- Pre-existing malformed row being updated for some unrelated reason.
    -- Pin the total to what is already stored so the update succeeds
    -- without letting the caller substitute a number of their own.
    NEW.total_hours := OLD.total_hours;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_hours_compute_total ON public.work_hours;

-- Deliberately NOT `UPDATE OF start_time, end_time, break_minutes`.
--
-- A column-scoped UPDATE trigger fires only when one of the listed columns
-- appears in the statement's SET list, and PostgREST builds that SET list
-- from exactly the keys in the request body. So
--   PATCH /work_hours?id=eq.<own row>   {"total_hours": 12}
-- would name no listed column, skip the trigger entirely, and store 12
-- verbatim — passing both RLS clauses, which constrain only employee_id
-- and status. That is the whole forgery this section exists to prevent.
-- Firing on every UPDATE costs one cheap recomputation and closes it.
CREATE TRIGGER work_hours_compute_total
  BEFORE INSERT OR UPDATE ON public.work_hours
  FOR EACH ROW EXECUTE FUNCTION public.work_hours_compute_total();


-- -------------------------------------------------------------
-- 5. created_by defaults to the caller
-- -------------------------------------------------------------
ALTER TABLE public.work_hours
  ALTER COLUMN created_by SET DEFAULT auth.uid()::text;


-- -------------------------------------------------------------
-- 6. Sanity constraints
--
-- IMPORTANT: NOT VALID is not a free pass. It skips checking rows that
-- already exist *at creation time*, but the constraint is still enforced
-- on every later INSERT and UPDATE — including an UPDATE to an old row.
-- So a legacy row holding '9:00' instead of '09:00' would pass the
-- migration and then fail the first time an admin tried to approve it.
--
-- Hence: normalise first, then only add a constraint the live data can
-- actually satisfy.
-- -------------------------------------------------------------

-- 6a. Zero-pad any 'H:MM' that predates the padded writer.
--
-- These UPDATEs run *after* §4 created the compute trigger, so each
-- repaired row passes through it. That is safe only because the trigger
-- guards its casts: a row whose start_time merely needs padding but whose
-- end_time is genuinely unparseable takes the trigger's ELSE branch and
-- keeps its stored total, instead of raising 22P02 and rolling back this
-- entire migration. Rows where both times end up well-formed get their
-- total recomputed as a bonus.
UPDATE public.work_hours
SET start_time = lpad(split_part(start_time, ':', 1), 2, '0') || ':' ||
                 lpad(split_part(start_time, ':', 2), 2, '0')
WHERE start_time ~ '^[0-9]{1,2}:[0-9]{1,2}$'
  AND start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';

UPDATE public.work_hours
SET end_time = lpad(split_part(end_time, ':', 1), 2, '0') || ':' ||
               lpad(split_part(end_time, ':', 2), 2, '0')
WHERE end_time ~ '^[0-9]{1,2}:[0-9]{1,2}$'
  AND end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';

-- 6b. Clamp any negative break to zero.
UPDATE public.work_hours SET break_minutes = 0 WHERE break_minutes < 0;

-- 6c. Add each constraint only if nothing currently violates it. If data
--     is still dirty, skip that constraint and say so rather than leaving
--     a landmine that detonates on the next approval.
DO $$
DECLARE bad_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_hours_break_nonneg') THEN
    ALTER TABLE public.work_hours
      ADD CONSTRAINT work_hours_break_nonneg CHECK (break_minutes >= 0);
    RAISE NOTICE 'Added work_hours_break_nonneg.';
  END IF;

  SELECT count(*) INTO bad_count FROM public.work_hours
   WHERE start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR end_time   !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';

  IF bad_count > 0 THEN
    RAISE WARNING 'SKIPPED work_hours_time_format: % row(s) still have an unparseable time. Fix them, then re-run this migration.', bad_count;
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_hours_time_format') THEN
    ALTER TABLE public.work_hours
      ADD CONSTRAINT work_hours_time_format CHECK (
        start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
        end_time   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      );
    RAISE NOTICE 'Added work_hours_time_format.';
  END IF;

  -- Overnight shifts are not representable in this model (one work_date
  -- plus two HH:MM strings), so the app logs them as two entries. If the
  -- live data already contains some, leave the constraint off rather than
  -- making those rows permanently un-editable.
  SELECT count(*) INTO bad_count FROM public.work_hours WHERE end_time <= start_time;

  IF bad_count > 0 THEN
    RAISE WARNING 'SKIPPED work_hours_end_after_start: % row(s) end at or before they start (likely overnight shifts). Split them into two entries, then re-run this migration.', bad_count;
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_hours_end_after_start') THEN
    ALTER TABLE public.work_hours
      ADD CONSTRAINT work_hours_end_after_start CHECK (end_time > start_time);
    RAISE NOTICE 'Added work_hours_end_after_start.';
  END IF;
END $$;


-- -------------------------------------------------------------
-- 7. Fix the rejected-entry lockout
--
-- v6 lets an employee touch their row only while status = 'pending'.
-- The moment an admin rejects it, the employee can neither fix nor
-- delete it — the entry is stuck and only an admin can clear it.
--
-- New rule: an employee may edit a 'pending' OR 'rejected' row, and
-- whatever they save comes back as 'pending' for re-review. Approved
-- rows stay locked, which is the behaviour we actually want.
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "work_hours_update" ON public.work_hours;
CREATE POLICY "work_hours_update" ON public.work_hours
  FOR UPDATE USING (
    public.is_admin() OR (
      employee_id = auth.uid()::text
      AND status IN ('pending', 'rejected')
    )
  ) WITH CHECK (
    public.is_admin() OR (
      employee_id = auth.uid()::text
      AND status = 'pending'
    )
  );

DROP POLICY IF EXISTS "work_hours_delete" ON public.work_hours;
CREATE POLICY "work_hours_delete" ON public.work_hours
  FOR DELETE USING (
    public.is_admin() OR (
      employee_id = auth.uid()::text
      AND status IN ('pending', 'rejected')
    )
  );


-- -------------------------------------------------------------
-- 8. work_schedule_templates — close the v6 gap
--
-- v6's drop-all block covered job_tasks, jobs, task_templates,
-- work_hours and work_days, but not work_schedule_templates, which
-- still carries v4's blanket "any authenticated user, any row, all
-- four verbs" policies. Nothing in src/ reads or writes this table,
-- so scoping it to owner-or-admin breaks nothing today and closes
-- the hole if it is ever wired up.
-- -------------------------------------------------------------
-- Guarded on the table existing so a database that never ran v4 does not
-- fail the whole migration on its last section.
DO $$
DECLARE pol RECORD;
BEGIN
  IF to_regclass('public.work_schedule_templates') IS NULL THEN
    RAISE NOTICE 'work_schedule_templates does not exist; nothing to lock down.';
    RETURN;
  END IF;

  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_schedule_templates'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.work_schedule_templates', pol.policyname);
  END LOOP;

  EXECUTE $p$
    CREATE POLICY "work_schedule_templates_select" ON public.work_schedule_templates
      FOR SELECT USING (
        public.is_admin() OR employee_id = auth.uid()::text
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY "work_schedule_templates_write" ON public.work_schedule_templates
      FOR ALL USING (
        public.is_admin() OR employee_id = auth.uid()::text
      ) WITH CHECK (
        public.is_admin() OR employee_id = auth.uid()::text
      )
  $p$;

  RAISE NOTICE 'work_schedule_templates policies scoped to owner-or-admin.';
END $$;


-- -------------------------------------------------------------
-- 9. Realtime
-- -------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'work_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.work_categories;
  END IF;
END $$;


-- -------------------------------------------------------------
-- 10. Seed a starter category list
--
-- Only seeds an empty table, so re-running never duplicates and never
-- resurrects a category an admin has deleted. Rename or retire these
-- from Hours Input → Team Hours → Manage categories.
-- -------------------------------------------------------------
INSERT INTO public.work_categories (name, sort_order)
SELECT * FROM (VALUES
  ('Teach',      10),
  ('Assist',     20),
  ('Admin desk', 30),
  ('Privates',   40)
) AS seed(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.work_categories);


-- -------------------------------------------------------------
-- 11. Per-employee, per-category pay rates — ADMIN ONLY
--
-- One rate per (employee, category): a teacher might be on one rate
-- for Teach, another for Admin desk. Admins set them; employees can
-- neither read nor write this table.
--
-- Note the RLS asymmetry against every other table here: SELECT is
-- is_admin() too, not merely "signed in". Rates are the one thing in
-- this schema that no employee may read, including their own.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_pay_rates (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id  TEXT NOT NULL,
  category_id  UUID NOT NULL REFERENCES public.work_categories(id) ON DELETE CASCADE,
  hourly_rate  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_pay_rates_employee
  ON public.employee_pay_rates(employee_id);

ALTER TABLE public.employee_pay_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_pay_rates_admin_only" ON public.employee_pay_rates;
CREATE POLICY "employee_pay_rates_admin_only" ON public.employee_pay_rates
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS employee_pay_rates_updated_at ON public.employee_pay_rates;
CREATE TRIGGER employee_pay_rates_updated_at
  BEFORE UPDATE ON public.employee_pay_rates
  FOR EACH ROW EXECUTE FUNCTION update_work_hours_updated_at();


-- -------------------------------------------------------------
-- 12. Frozen pay per approved entry — ADMIN ONLY
--
-- A SEPARATE TABLE, not columns on work_hours, and that is the whole
-- point. RLS is row-level: "work_hours_select" (v6 L177) lets an
-- employee read their own rows, and it grants them every COLUMN of
-- those rows. Postgres column privileges cannot help either, because
-- admins and employees are both the `authenticated` role. So a
-- pay_amount column on work_hours would be readable by the employee
-- through the REST API no matter what the UI showed. Putting it here,
-- behind is_admin(), is the only way to keep it out of their reach.
--
-- The rate is FROZEN on approval. Without that, editing a rate would
-- silently re-price hours that were already checked and paid; payroll
-- run in March must still read the same in June.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_hours_pay (
  work_hours_id UUID PRIMARY KEY REFERENCES public.work_hours(id) ON DELETE CASCADE,
  rate_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0,
  pay_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- true when the employee had no rate configured for that category at
  -- approval time. The amount is still 0, but this makes a forgotten
  -- rate visible instead of silently paying nothing.
  rate_missing  BOOLEAN NOT NULL DEFAULT false,
  frozen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.work_hours_pay ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_hours_pay_admin_only" ON public.work_hours_pay;
CREATE POLICY "work_hours_pay_admin_only" ON public.work_hours_pay
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

/**
 * Freeze (or release) an entry's pay as its status changes.
 *
 * AFTER, not BEFORE: it writes to another table keyed on work_hours.id,
 * which does not exist yet during a BEFORE INSERT. Running AFTER also
 * guarantees work_hours_compute_total has already settled total_hours,
 * so there is no trigger-ordering subtlety to get wrong.
 *
 * SECURITY DEFINER so the lookup can read employee_pay_rates. The
 * caller is an admin in practice — only is_admin() can set 'approved' —
 * but relying on that would couple this to the RLS policy's wording.
 */
CREATE OR REPLACE FUNCTION public.work_hours_freeze_pay()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_rate NUMERIC(10,2);
BEGIN
  IF NEW.status = 'approved' THEN
    IF NOT EXISTS (SELECT 1 FROM public.work_hours_pay WHERE work_hours_id = NEW.id) THEN
      -- First approval: look the rate up once and freeze it.
      SELECT r.hourly_rate INTO found_rate
      FROM public.employee_pay_rates r
      WHERE r.employee_id = NEW.employee_id
        AND r.category_id = NEW.category_id;

      INSERT INTO public.work_hours_pay (work_hours_id, rate_snapshot, pay_amount, rate_missing)
      VALUES (
        NEW.id,
        COALESCE(found_rate, 0),
        ROUND(NEW.total_hours * COALESCE(found_rate, 0), 2),
        found_rate IS NULL
      );
    ELSE
      -- Already frozen. If an admin corrected the hours, re-multiply
      -- against the SAME frozen rate — never re-look-up, or a rate
      -- edited since approval would leak into settled history.
      UPDATE public.work_hours_pay
      SET pay_amount = ROUND(NEW.total_hours * rate_snapshot, 2)
      WHERE work_hours_id = NEW.id;
    END IF;
  ELSE
    -- Sent back or reverted to pending: drop the freeze so the next
    -- approval re-prices at whatever the rate is then.
    DELETE FROM public.work_hours_pay WHERE work_hours_id = NEW.id;
  END IF;

  RETURN NULL; -- AFTER trigger; return value is ignored
END;
$$;

REVOKE ALL ON FUNCTION public.work_hours_freeze_pay() FROM anon;

DROP TRIGGER IF EXISTS work_hours_freeze_pay ON public.work_hours;
CREATE TRIGGER work_hours_freeze_pay
  AFTER INSERT OR UPDATE ON public.work_hours
  FOR EACH ROW EXECUTE FUNCTION public.work_hours_freeze_pay();


-- -------------------------------------------------------------
-- 13. Revoke the default anon grants on this migration's new tables
--
-- Supabase grants SELECT/INSERT/UPDATE/DELETE to `anon` automatically on
-- every new table in `public`. All three tables here are staff-only and
-- their RLS policies already deny anon, but v9 set the house rule for
-- this database: "two independent things have to be wrong before anon
-- can write, instead of one". employee_pay_rates holds salaries, so it
-- is the last table that should rely on a single layer.
--
-- Note this is not hypothetical reach: PortalContext documents that the
-- staff contexts fetch on a parent's device too, so anon really does
-- issue requests against work_categories.
-- -------------------------------------------------------------
REVOKE ALL ON public.work_categories    FROM anon;
REVOKE ALL ON public.employee_pay_rates FROM anon;
REVOKE ALL ON public.work_hours_pay     FROM anon;

-- Pay is admin-only, enforced by RLS. Keep the table grant for
-- `authenticated` (admins are authenticated and RLS filters the rows),
-- but anon has no business holding any grant at all.



-- =============================================================
-- POST-MIGRATION AUDIT — run these, they are not optional
-- =============================================================
--
-- (a) Accounts whose profile id does not match their auth id. For
--     these users EVERY hours insert is rejected by RLS, because
--     employee_id is written from profiles.id but the policy compares
--     against auth.uid(). Expect zero rows. Any row here is a person
--     who cannot log hours at all.
--
--       SELECT p.id AS profile_id, u.id AS auth_id, p.email, p.role
--       FROM public.profiles p
--       FULL OUTER JOIN auth.users u ON u.email = p.email
--       WHERE p.id IS DISTINCT FROM u.id;
--
-- (b) Hours rows owned by nobody — employee_id is not a valid UUID,
--     so it matches no auth user. These are invisible to their owner
--     and readable only by admins. Usually left over from
--     localStorage-mode logins (ids like 'user_1712...').
--
--       SELECT id, employee_id, work_date, total_hours
--       FROM public.work_hours
--       WHERE employee_id !~ '^[0-9a-fA-F-]{36}$';
--
-- (c) Confirm the trigger agrees with what is already stored. Rows
--     listed here had a client-supplied total that does not match
--     their own start/end/break.
--
--       SELECT id, employee_id, work_date, start_time, end_time,
--              break_minutes, total_hours AS stored,
--              ROUND(GREATEST(0,
--                (split_part(end_time,   ':',1)::int * 60 + split_part(end_time,   ':',2)::int)
--              - (split_part(start_time, ':',1)::int * 60 + split_part(start_time, ':',2)::int)
--              - COALESCE(break_minutes,0))::numeric / 60, 2) AS computed
--       FROM public.work_hours
--       WHERE start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
--         AND end_time   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
--         AND total_hours IS DISTINCT FROM ROUND(GREATEST(0,
--                (split_part(end_time,   ':',1)::int * 60 + split_part(end_time,   ':',2)::int)
--              - (split_part(start_time, ':',1)::int * 60 + split_part(start_time, ':',2)::int)
--              - COALESCE(break_minutes,0))::numeric / 60, 2);
--
-- =============================================================
-- KNOWN GAP NOT ADDRESSED HERE
--
--   work_days is still world-readable: "work_days_select" is
--   USING (auth.uid() IS NOT NULL), so every signed-in user receives
--   every employee's scheduled days over the wire. WorkHoursPage.tsx
--   re-filters client-side, which hides it but does not protect it.
--   Left alone deliberately — the existing calendar may be relying on
--   org-wide schedule visibility, and tightening it is a separate
--   decision from this migration. work_hours (the payroll data) is
--   correctly private.
-- =============================================================
