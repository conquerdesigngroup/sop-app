# Attendance / profile — open items

Working notes for this branch. Written 2026-08-31, while the work is parked
waiting on a real Enrolio export. Read this before picking it back up.

The three defects found in review are **fixed** and are not listed here. What
follows is what is still outstanding, in the order I would do it.

---

## Must happen at v33 (the attendance core migration)

### 1. Index the foreign keys

Postgres indexes primary keys and unique constraints automatically. It does
**not** index foreign key columns. `portal_attendance_summary` joins students →
enrollments → sessions → attendance, so without these it will sequential-scan
every table. It will look fine on the seed fixture and degrade the first real
season, which is the worst possible time to find out.

```sql
create index on portal_enrollments (student_id);
create index on portal_enrollments (class_id);
create index on portal_attendance   (class_id);
create index on portal_attendance   (session_id);
create index on portal_students     (household_id);
create index on portal_household_members (profile_id);
```

`portal_attendance (student_id, session_id)` and
`portal_class_sessions (class_id, session_date)` are already covered by their
unique constraints — do not add duplicates.

### 2. Wrap the RLS helpers in a subselect

```sql
-- calls the function once per ROW
using (can_see_student(student_id))

-- evaluates once as an InitPlan
using ((select can_see_student(student_id)))
```

Identical semantics, large difference on any scan wider than a handful of rows.
Apply it to every policy using `can_see_student()` / `is_household_member()`.

### 3. A contract test between the SQL view and `attendanceSummary.ts`

**This is the highest-value correctness work available and it is not optional.**

There are two implementations of the percentage:

- `portal_attendance_summary` (SQL, to be written in v33) — what §3.6 asked for
- `src/lib/attendanceSummary.ts` (TS) — drives the fixture, and computes the
  per-session exclusion markers the detail view needs, which a summary view
  cannot provide

They can silently disagree — rounding is the obvious one (`Math.round` vs SQL
truncation), excused handling is the dangerous one. The symptom is a percentage
that is *plausible and wrong*, which is exactly the failure this whole feature
was designed to prevent.

Seed `attendance_demo.sql` from the same constants as
`src/lib/attendanceFixture.ts`, run both implementations over it, assert
identical `attended` / `counted` / `percent` per enrollment.

### 4. Wire `excused_counts_against`

Modelled in `AttendanceSettings` and honoured throughout the arithmetic, but
nothing reads it from `portal_settings` yet — it is a constant today. §3.6 is
explicit that it is a studio policy question, not a code decision.

### 5. Decide what a makeup class is

§7 flags a possible fifth attendance status. Today an unrecognised status counts
as not-attended, silently. Decide before the importer ships whether a makeup
credits the original session, and widen `AttendanceStatus` if so.

---

## Performance

### 6. Collapse the profile reads into one RPC

Cold load of `/portal/profile` in live mode is currently ~6 requests. The
duplicated household fetch is fixed, and `portal_students` /
`portal_household_members` now run in parallel, so the waterfall is shallow —
but it is still several trips.

A `get_household_profile()` returning students, membership, summaries, updates
and documents as one JSON payload takes it to 1. Keep it `security invoker` so
RLS still governs it.

Worth doing once the schema is real. Not worth doing against a schema that may
still change.

### 7. Stop refetching on every range toggle

Each *This month / This season / All time* tap refires
`loadStudentProgress`. Fetching once and clipping with the existing shared
`clipToRange` would remove it. That is not the frontend inventing arithmetic —
it is the one definition being reused — but it does depend on item 3 above being
in place first, so the two implementations are known to agree.

---

## Polish — components that already exist and are not being used

- **`CardSkeleton`** (`src/components/Skeleton.tsx`) instead of the spinners.
  Cards resolve independently, so the page currently assembles raggedly.
- ~~**`PullToRefresh`**~~ Done, app-wide: pull-to-refresh is `PullToRefreshLayer`
  (mounted once in App.tsx) and every portal query registers with
  `RefreshContext`, so this page refreshes on pull, on the header button, and
  on coming back to the app. A new fetch here only needs `useRefreshable`.
- **Per-update read marking.** `UpdatesCard` uses one global localStorage
  watermark, so opening the profile marks every update seen — including ones
  never expanded. It is deliberately not a server-side read receipt; per-update
  local marking would be the right middle ground.
- **Offline read** via the existing `src/lib/indexedDB.ts` + service worker.
  Attendance is read-mostly and suits cache-then-network.

---

## Parent matching needs a fuzzy FALLBACK, not just exact

The v33 seed matched students to households on exact parent name plus the
contact's "All Students" list. That left 8 unresolved — and an adversarial audit
found the exclusion was wrong for three of them.

`Ketenbrink` (students export) vs `Kettenbrink` (contact record). One letter.
Three children in one family, all on real class rosters, all invisible.

The rule that works, and is safe (verified: zero disagreements against the 383
already-resolved students):

1. Exact parent name -> contact, and contact's "All Students" -> student.
   Accept when they agree on ONE household.
2. FALLBACK ONLY if that yields nothing: difflib near-match at cutoff 0.85 on
   BOTH the parent name AND the child name. Require both to land on the same
   household — two independent signals agreeing.
3. Never auto-accept a surname-only match. Two unrelated families share a
   surname constantly; that is what the child-name corroboration is for.

Whatever the importer ends up being, it needs step 2. Exact matching silently
drops real families and the counts still reconcile, so nothing looks wrong.

## If the studio's timezone ever gets stored

Calendar exports use floating local time (`DTSTART:20260901T163000`, no `Z`),
which is what "every Tuesday at 4:30" means and which follows the daylight-
saving change on its own. The strictly complete form is
`DTSTART;TZID=America/New_York` plus a `VTIMEZONE` block — worth upgrading to
if a timezone column ever lands on the studio or program record. Until then
floating is correct for everyone except a parent reading the schedule from
another timezone, and that corrects itself when they are home.

## Explicitly decided against

- **A materialized view for the summary.** At studio scale a plain view with the
  indexes above is fine, and a matview buys refresh scheduling for nothing.
- **Server-side read receipts** for the NEW badge. localStorage is the right
  cost for that feature.
- **Notification preference toggles** before there is any delivery mechanism.
  See the push analysis: iOS delivers web push only to a home-screen install,
  which is what `supabase-migration-v32-install-telemetry.sql` exists to measure.

---

## Testing gap worth naming

The live query path has no tests. It cannot meaningfully have any until the v33
tables exist — mocking it today would pin the shape of a schema that is still
waiting on the Enrolio export to be finalised. Item 3 is the test that matters,
and it becomes writable the moment v33 lands.

## Portal Viewer (v36) — what was deliberately left

- **Reads are gated at `is_admin()`, not `is_super_admin()`.** The Viewer page
  is super-admin only, but that is a route guard. v33 wrote every household
  policy as `<own rows> OR is_admin()`, so a plain admin could already select
  households, students, enrollments and attendance before this change and still
  can. Nothing new was opened; nothing was narrowed either. If the owner wants
  the tables themselves restricted, it is one `is_admin()` → `is_super_admin()`
  per policy in v33 — but check the import pipeline first, which will run as an
  admin.
- **Writes ARE enforced.** `portal_updates_insert/update/delete` require
  `is_super_admin()` for any row carrying a `household_id`. Verified against
  production with a real insert under both roles.
- **A note is one-way.** No reply, no thread, no read receipt. If the studio
  wants a conversation, that is a different table and a different screen; the
  compose form says so in words so nobody is misled into treating it as a
  message.
- **Nothing is emailed or pushed.** A parent sees a note the next time they open
  the portal. The install-telemetry migration (v32) that would tell us how many
  families have the PWA installed is still written-but-unapplied, and that
  number is the thing worth knowing before building notifications.
- **The Enrolio import is still the source of truth.** The Viewer cannot edit an
  enrollment, a roster or a child's details, and should not learn to: two places
  to change the same fact is how the Kettenbrink/Ketenbrink split survived.
