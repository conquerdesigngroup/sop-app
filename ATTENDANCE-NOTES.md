# Attendance / profile — open items

Working notes for this branch. Written 2026-08-31, while the work is parked
waiting on a real Enrolio export. Read this before picking it back up.

> **UPDATE 2026-09-08 — v52 landed and several items below are now stale.**
> See "What v52 changed" at the bottom before acting on anything in this file.
> In short: v33 is applied and populated, teachers can now take attendance in
> the app, and the "staff access is admin-only" gap is closed.

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


---

# What v52 changed (2026-09-08)

Attendance is now TAKEN in the app, not only imported. That makes several
items above stale, and adds three things worth knowing before touching this.

## Stale above

- **Item 3 (the contract test) is now more urgent, not less.** There are still
  two implementations of the percentage and they now have a THIRD consumer:
  `tally()` in `src/components/attendance/attendanceExport.ts`, which the CSV
  and the PDF both print. All three say "present + late over everything that
  counts". If that formula changes it changes in three files. Still no contract
  test — it remains the highest-value correctness work available.
- **Item 5 (what a makeup is) is still open.** v52 added `sick`, which is NOT
  an answer to it: a makeup has to decide which session it credits, and that is
  a join, not a status.
- **"Staff access is admin/super_admin only" (v33 header) is fixed.** It was
  written when `portal_classes.instructor_name` was the only link to a person.
  `portal_class_instructors` has been populated since (69 grants, 11 teachers),
  so `can_edit_portal_class()` scopes a teacher to their own classes and v52
  adds the four matching SELECT policies.
- **The seed is gone.** The v33 demo rows — 53 marks, 56 sessions, one dancer
  marked per session across four classes — were deleted on 2026-09-08. Three of
  those dates fell after `season_start`, so they would have shown live families
  absences that never happened.

## New, and load-bearing

### 1. The denominator now stops at today

`portal_attendance_summary` and `portal_attendance_detail` both gained
`session_date <= studio_today()`, and the detail view gained an `upcoming`
exclusion reason. `src/lib/attendanceSummary.ts` carries the identical change.

This was not a refinement. v52 generates every session for the season — 4,326
rows through 2027-06-19 — and the old views counted a `held` session with no
mark as an absence with no upper bound on the date. Without the change every
dancer would have read about 3%: measured, not estimated (max counted per
dancer went from a possible 42 to an actual 2).

**If you add a third reader of these rows, it inherits this rule or it lies.**

### 2. Writes go through RPCs, and the RLS story is unchanged

There is still no INSERT/UPDATE/DELETE policy on any attendance table, for any
role. `staff_mark_attendance` and `staff_set_session_status` are SECURITY
DEFINER and re-check `can_edit_portal_class()` themselves. Verified against
production under a real teacher's JWT, in a rolled-back transaction:

| | |
|---|---|
| their own class | written, stamped `source=app` with their `recorded_by` |
| the same mark twice | `unchanged`, no second history row |
| another teacher's class | refused, and RLS hides the session from them anyway |
| a class that has not happened | refused |
| a dancer not on that day's roster | refused |
| a status that does not exist | refused |
| `portal_households` | 0 rows — a teacher never sees a family record |

### 3. History is the reason unlimited editing is safe

The studio chose (2026-09-08) that a teacher may correct their own class with
no time limit. `portal_attendance_history` is what makes that a decision rather
than a hole: every change keeps its previous value, author and timestamp. It is
append-only and admin-read — a teacher cannot read back their own trail, which
is deliberate.

It is also where the Enrolio cutover lands. The studio chose "import wins, the
app's mark is kept in history". **The importer does not exist yet**, and when it
is written it MUST write a history row for every mark it overwrites, with
`source='import'` and its `import_batch_id`. Without that, `portal_attendance`'s
unique key means the import silently destroys what a teacher recorded in the
room.

### 4. Sick counts against

Studio decision, 2026-09-08. It needs no arithmetic of its own — it is simply
not `excused` (so it stays in the denominator) and not in `('present','late')`
(so it is not attendance). The work is in never letting it render as a bare
absence: the reason survives into `portal_attendance_detail`, onto the teacher's
screen, into both exports, and onto the parent's own card.

## Still to do

- **`REACT_APP_ATTENDANCE_LIVE` is still false.** Flipping it is what makes any
  of this visible to a parent. **Do not flip it until the backfill is done** —
  143 sessions from the season's first week have no marks, so every dancer
  currently reads 0%.
- **The Enrolio importer** (see 3 above).
- **38 of 103 classes have no instructor grant.** Those teachers cannot see
  their class at all. Fixed in Portal Manager, not in code.
- **`excused_counts_against` is still unread from `portal_settings`** — item 4
  above, unchanged.
- **The roster screen has no URL.** It is a state inside `/attendance`, so
  `npm run audit:mobile` measures the day list and never the screen a teacher
  actually spends the class on. Check that one by hand on a phone.
