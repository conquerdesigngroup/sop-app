# Class evaluations — build handoff

For Claude Code, working in this repo (`conquerdesigngroup/sop-app`, Supabase project `sgppeenmvskwztaszkgn`).
Written 2026-10-22 after reading the repo and testing the database. **Read `CLAUDE.md` first**, then `ATTENDANCE-NOTES.md`: evaluations deliberately copy the attendance feature's shape.

## 1. Where things stand

| | |
|---|---|
| **Database** | Done and live in production. Table, security, three functions, admin switch. |
| **Migration file** | `supabase-migration-v70-portal-evaluations.sql` (delivered next to this file). It is production's current state, so add it to the repo root and commit it. It is idempotent: re-running on production changes nothing. |
| **Teacher screen, admin screens, family screen** | Built 2026-10-22: `/evaluations` (`src/pages/EvaluationsPage.tsx`, `src/components/evaluations/`), the family `Evaluations` card in `PROFILE_CARDS`, reading through `family_evaluations()` (**v71**, applied to production the same day). |
| **Public "email me my evaluations" page + edge function** | Built and deployed 2026-10-22: `/portal/evaluations` + `supabase/functions/evaluation-email` (`verify_jwt: true`, like portal-signup). **Sends nothing until `RESEND_API_KEY` is set as a function secret** — until then every matched request logs `evaluation_email_requested` / `no_resend_key`. Optional `EVALUATION_EMAIL_FROM` overrides the sender (default `evaluations@didc.app`). |
| **Tests** | `src/lib/evaluations.test.ts` (pure helpers), `scripts/sql-tests/evaluations.test.mjs` (v70 + v71 on PGlite, RLS exercised under a non-superuser role: §4 items 1–2 are covered there), `npm run audit:mobile` clean on both routes. |

Nothing in `src/` mentions evaluations. The only repo hit for the word is an unrelated staff-review SOP in `SOPContext.tsx`.

## 2. What the owner asked for

- Teachers evaluate every dancer in **their own classes**. Three ratings, **1–5**: performance, attendance, showmanship. Plus a free-text comment and a **"move up to next class"** toggle. The form is identical in every round.
- Evaluations happen a couple of times per season, as named **rounds** ("Fall midterm"). One evaluation per dancer + class + season + round. Every enrolled dancer in every class has a blank form until a teacher fills it in.
- **Draft vs submitted.** A family sees nothing until the teacher submits. Once submitted it **stays visible** even if edited afterwards.
- **Admin switch.** One on/off control (plus the open round's name). Off: teachers are locked out of saving. Families can still read what was already submitted. Admins and super admins can always create and edit, any class, any dancer, drafts included, and those edits are logged.
- **Two tabs:** a teacher "Evaluations" tab (their classes → dancers → form) and a family "Evaluations" tab (submitted evaluations for their own dancers only).
- **Admin lookup and export:** find any class or dancer; open a **snapshot card** and export it as a **PDF**; **bulk export** as a **ZIP with folders** (a whole class, the whole roster, or one dancer across every class they're in, with whatever filters are needed). **Before any export runs, warn how many are not filled out and which dancers**, and let the admin export anyway.
- **Email delivery for families without an app account:** a public page where a parent types the email on file. If it matches, send **all submitted** evaluations for **every dancer in that family** as an **HTML email and a PDF attachment**. Drafts and unsubmitted evaluations are never sent. The page must answer identically whether or not the email matched, and be rate-limited.

## 3. The database, as built

### Table `portal_evaluations`
`id`, `student_id`→`portal_students`, `class_id`→`portal_classes` (both cascade on delete), `season text`, `round text` (non-blank), `performance|attendance|showmanship smallint` (1–5, nullable while a draft), `comment text` (≤4000, default ''), `move_up boolean` (default false), `status` (`draft`|`submitted`), `submitted_at/by`, `created_by`, `updated_by`, `created_at`, `updated_at` (trigger). **Unique on (student_id, class_id, season, round).** A submitted row must have all three ratings (check constraint).

### `portal_settings` (single row, `id = true`)
New columns `evaluations_enabled boolean` (default **false**) and `evaluation_round text` (default `''`). Client roles can only SELECT this table.

### Who can read what (row-level security)
| Caller | Sees |
|---|---|
| Family (guardian, or a dancer's own login, see §5) | `status = 'submitted'` rows for their own dancers |
| Teacher on the class (`can_edit_portal_class`) | every row, drafts included, for classes they hold |
| Admin / super admin | everything (`can_edit_portal_class` includes `is_admin()`) |
| `anon` | nothing: no grant at all |

**No client role can INSERT/UPDATE/DELETE.** Grants are SELECT-only, matching `portal_attendance`. Every write goes through the functions below.

### Functions (all `SECURITY DEFINER`, `EXECUTE` for `authenticated` only)

**`staff_save_evaluation(p_student_id, p_class_id, p_performance smallint, p_attendance smallint, p_showmanship smallint, p_comment, p_move_up, p_submit boolean = false, p_season text = null, p_round text = null) → jsonb {id, status, season, round}`**
The only write path for teachers and admins. Upserts on the unique key.
- Needs `can_edit_portal_class(class)`. Teachers need the switch ON. A teacher can only write the **open round**; admins may pass any `p_round` / `p_season`.
- Season defaults to the class's season; round defaults to `portal_settings.evaluation_round`.
- A non-admin's dancer must have an `active` enrollment in the class.
- `p_submit = true` requires all three ratings.
- Status becomes `submitted` if `p_submit` **or it already was**: an edit never reverts a submitted row to draft. `submitted_at/by` are set once.
- Audit: logs to `activity_logs` for every admin write and every write that leaves the row submitted, with the **previous values** for an edit. Actions: `evaluation_created`, `evaluation_submitted`, `evaluation_edited`.
- Pass numbers as JSON numbers from `supabase.rpc`; PostgREST casts to smallint. (Raw SQL needs `::smallint`.)

**`admin_set_evaluation_settings(p_enabled boolean, p_round text = null) → jsonb`**
The only way to flip the switch or name the round. Admin only. `null` round keeps the current name. Refuses to open with an empty round name. Logged as `evaluation_settings_changed`. *There was no write path for this before; the settings table is read-only to clients and nothing in `src/` touches it.*

**`admin_evaluation_export(p_class_ids uuid[], p_student_ids uuid[], p_season, p_round, p_include_drafts boolean = false) → jsonb`**
Admin only; needs at least one class or dancer. Starts from the **rosters**, not from evaluations, so dancers with no row yet are counted. Returns:
```
{ summary: { round, total, submitted, draft, not_started,
             by_class: [{ class_id, class_name, total, submitted,
                          missing: [{ student_id, name, state }] }] },
  evaluations: [ { student_id, class_id, season, first_name, last_name, class_name,
                   category, instructor_name, evaluation_id, round, performance,
                   attendance, showmanship, comment, move_up, submitted_at, state } ] }
```
`summary` powers the "12 of 15 filled out, missing: …" notice; `evaluations` is the export content (submitted only unless `p_include_drafts`). One call, so the notice and the export cannot disagree. `missing[].state` is `draft` or `not_started`. Names are `first_name + last_name`, never `display_name`.

### Messages the functions raise (written to be shown as-is)
`You do not teach this class` · `Evaluations are closed right now` · `This class has no season set` · `No evaluation round is open - an admin needs to set the round name` · `That round is not open` · `That dancer is not on this class roster` · `Fill in all three ratings before submitting` · `Admins only` · `Pick at least one class or one student` · `Name the round before opening evaluations` · `That round name is too long` · `Say whether evaluations should be open or closed`.
Check the switch on the client first so a teacher gets a locked screen, not an error after typing.

## 4. What was tested, and what was not

**Tested against production on 2026-10-22** (as a real super admin and a real teacher, inside a transaction that was rolled back; nothing was left behind: switch off, 0 rows):
switch off blocks a teacher · draft saves · submit needs all three ratings · a teacher on a class they don't hold is refused · a teacher can't target another round · a rating of 6 is rejected · direct INSERT is blocked · a teacher can't call the export · export on a 15-dancer class reported 15 / 1 submitted / 14 missing · `anon` has no access.

**Tested on a blank Postgres** (PGlite, with stubs): `v70` runs twice cleanly; constraint/index/policy counts match production; the settings function, the export (legal names in the missing list), and an edit-after-submit being logged.

**NOT tested. Do these before shipping:**
1. **A real family can read a submitted evaluation, cannot read a draft, and another family sees nothing.** The first test class had no linked family login, and the retest was cancelled. Technique: in one `DO` block, `set_config('request.jwt.claims', …)` and `request.jwt.claim.sub` to the user, `SET LOCAL ROLE authenticated`, run the queries, then `RAISE EXCEPTION` at the end so everything rolls back.
2. **A teacher's edit to a submitted evaluation now writes an `evaluation_edited` row with the old values**, under a real teacher JWT. (Before `v2` it wrote nothing. The logic is proven on PGlite; production was only checked by reading the installed function.)
3. The whole teacher → family path through the real UI once it exists.

## 5. Decisions the owner still has to make

1. ~~**Can a dancer with their own login read their own evaluations?**~~ **Decided 2026-10-22: no — guardians only.** `v72` replaces the family policy and `family_evaluations()` with `is_guardian_of()`, and the dashboard card hides for a student login. The paragraph below describes the v70 state. Today yes: `can_see_student()` admits a guardian *or* the dancer's own login (14 such members exist). That includes the comment and the move-up flag. To restrict to guardians, change the family policy to also require a `portal_household_members` row with `member_type = 'guardian'`.
2. **Show "move up" to families before the final round?** It exists on every evaluation, but a parent may read it as a promise. Pure UI choice; the data is there either way.
3. **Email: current season only, or past seasons too?** Assumed current season only.
4. **Email coverage gap.** Matching the typed email to `portal_households.primary_email` covers **340 of 346** distinct guardian roster emails. The other 6 (typically a second parent) won't match unless you also resolve roster emails through `claimed_by → portal_household_members`. Decide whether the gap matters.
5. **Renaming the open round mid-round** starts a new bucket: existing drafts stay under the old name. The admin UI should say so.

## 6. Build plan, mapped to this repo

Do these in order. Each follows an existing pattern; copy it rather than inventing one.

### A. Data layer: `src/lib/evaluations.ts` (+ `evaluations.test.ts`)
Mirror `src/lib/attendanceStaff.ts`: typed wrappers returning `{ result, error }` and **never throwing**; the RPC's message goes straight to the person; a `LoadError` string distinguishes "failed to load" from "empty". Staff-facing names are `first_name` + `last_name` **only**, never `display_name` (the household nickname). Pure helpers (rating labels, "12 of 15" text, grouping) go in here and get tests. Register every fetch with `useRefreshable` (`src/contexts/RefreshContext.tsx`, silent loader that throws on failure).

### B. Admin switch
Read `supabase.from('portal_settings').select('evaluations_enabled, evaluation_round').single()`; write only through `admin_set_evaluation_settings`. Admin-only control, inside the new evaluations page (§C). Say plainly what each state means to teachers and to families.

### C. Teacher + admin page: new route `/evaluations`
- `App.tsx`: copy the `/attendance` route (around line 386): `<ProtectedRoute>`, **not** `adminOnly`, lazy-imported. RLS decides what a teacher sees, not the route.
- Nav links gated by `canEditPortal`: `src/components/Navigation.tsx` (~351 and ~410), `src/components/BottomNavigation.tsx` (~138), optionally `src/components/dashboard/Shortcuts.tsx` (~154).
- Teacher flow: their classes (reuse `loadMyClassIds` from `attendanceStaff.ts`; an admin who also teaches gets the `'mine'` / `'all'` scope toggle that screen already has) → dancers → form (three 1–5 controls, comment, move-up, **Save draft** / **Submit**). Confirm Submit with `useConfirm`; errors via `useToast`; never `alert`/`confirm`.
- **Roster rule:** the save function uses `portal_enrollments.status = 'active'`. Use the same in the UI, or a teacher will see dancers the function then refuses. (Production data is consistent: `status='active'` ⇔ `dropped_on is null`, 1111 / 59.)
- Locked state when the switch is off or no round is named. Show it before the form.
- Admin-only tabs on this same page, following how `AttendancePage.tsx` gates its Records tab on `isAdmin` (~164–210): **Lookup & export** (§D). Admins can open any class/dancer and edit via `staff_save_evaluation` with `p_season`/`p_round` overrides.

### D. Admin lookup, snapshot PDF, bulk ZIP
- Data: `admin_evaluation_export`. Call it once per export and use `summary` for the pre-export notice (per class: "N of M submitted", list `missing[]` with state; let the admin continue anyway) and `evaluations` for the content. Offer an "include drafts" checkbox, default off.
- **PDF:** follow `src/components/attendance/attendancePdf.ts`: `jspdf` behind a **dynamic import**, hand-drawn layout, letter portrait constants. `jspdf` is already a dependency. Snapshot card contents: dancer name, class, season, round, teacher (`instructor_name`), the three ratings, comment, move-up, submitted date. No `display_name`.
- **ZIP:** **no zip library is installed.** Add one (`fflate` or `jszip`), also dynamically imported so it stays out of the parent bundle. Suggested layout: `Season/Class name/Last, First: Round.pdf`; one dancer across classes → `Last, First/Class: Round.pdf`. Sanitize names with `slug` from `attendanceExport.ts`.
- **A big export is a slow tap**, so apply the `CLAUDE.md` "SLOW TAPS" rules exactly: disable + busy ref, determinate progress, words not a bare spinner, Cancel, a clear end state. Generate PDFs sequentially, not all at once.

### E. Family tab
Either a new card in `PROFILE_CARDS` (`src/lib/profileCards.ts`) or a route under `PortalLayout` (`src/pages/portal/`, see `Profile.tsx`, `ProgramHome.tsx`). Query `portal_evaluations` directly: RLS already returns only submitted rows for the caller's dancers. Group by dancer → season → round. Plain-text render of `comment`; no HTML.

**Class names are not guaranteed.** Families read `portal_classes` only where `is_active` is true, and `category = 'allstars'` classes only for families `can_see_allstars()` admits. So a submitted evaluation can stay readable while its class **no longer joins** (a class made inactive after the season, or an all-stars class). If you embed the class in the query, handle a null class gracefully. The more robust alternative is a small `SECURITY DEFINER` function, e.g. `family_evaluations()`, that returns the caller's submitted evaluations with the class name attached, so the screen doesn't depend on the class policy at all. If you add it, put it in a `v71` migration.

### F. Public email page + edge function
- **Copy the design of `supabase/functions/portal-signup/index.ts`: read its header comment in full.** Its rule is the one this needs: the response is `{ ok: true }` for every well-formed request, written **before** any lookup happens; the real work runs afterwards in `EdgeRuntime.waitUntil`, after a fixed `FLOOR_MS`. Copy the `escapeLike` use for emails.
- **Rate limit** with the existing `portal_signup_attempts` ledger (`kind` is free text: use `'evaluation_lookup'`, by email and by IP; it is pruned to 24h, which is right for a limiter). No new table.
- **Matching:** lower/trim the typed email → `portal_households.primary_email` (all 358 households have one; none shared). Optionally also roster guardian emails via `claimed_by`. **Never** use `portal_roster` rows with `member_type = 'student'` (14 exist): a child's address must not trigger delivery of the whole household's evaluations.
- Fetch with the service role: every **submitted** evaluation for every dancer in the household, current season by default (§5.3).
- **Send with Resend**, from an address on **`didc.app`** (verified for sending in Resend; `mediamaple.com` is also verified). Needs a `RESEND_API_KEY` edge-function secret: **set it as a Supabase secret, never commit it.** The repo sends no mail today except Supabase Auth's own SMTP, so this is new.
- HTML body and a PDF attachment. Producing the PDF inside the Deno function is new ground (the app's PDFs are made in the browser). Prototype whether `npm:jspdf` runs there before committing to it.
- Public route e.g. `/portal/evaluations`, outside `ProtectedRoute`, inside the existing portal layout. `portal-signup` is public, so look at how its `verify_jwt` is set at deploy time and mirror that.
- Add the new public route to `PUBLIC_ROUTES` in `scripts/audit-mobile-ui.js` (~113) and the new signed-in route to `AUTH_ROUTES` (~206), or the mobile audit silently skips it and still says CLEAN.

### G. Tests and checks
- SQL: extend `scripts/sql-tests/` (`npm install --no-save @electric-sql/pglite && npm run test:sql`). Its `schema.sql` is a slice of production; `supabase-migration-v70-…sql` runs against it with a few more stubs (`can_edit_portal_class`, `can_see_student`, `is_admin`, `log_activity`).
- Unit tests for `src/lib/evaluations.ts`.
- `npm run audit:mobile` (with `npm run dev:backend` if no staff login: see `CLAUDE.md`). **The fixture backend cannot prove RLS**, so §4 items 1–2 stay manual.

## 7. Repo rules that will bite

From `CLAUDE.md`; short list, read the real thing:
- UI from `src/components/ui` only (`Button`, `Card`, `Modal`, `Badge`, `Input`, `Textarea`, `Select`, `PageHeader`…). Theme tokens only; **no hardcoded colors**; never append alpha to a token; SVG colors via `style`, not attributes.
- `100dvh`, never `100vh`. Pages outside `Navigation`/`PortalLayout` add their own safe-area padding. A centered flex row that can hold a variable number of items needs `flexWrap: 'wrap'`.
- Any new fetch registers with `useRefreshable`.
- Anything a tap starts that takes over a second follows the slow-tap rules.
- `useConfirm` / `useToast`, never `window.confirm` / `alert`.
- Most users are on a phone. Check the actual phone layout of the form and the export screen.

## 8. Useful facts

- One season exists: `2026-2027` (classes and enrollments agree). 103 classes, 1,170 enrollments, 404 students, 358 households.
- `studio_today()` is the Pacific date; use it, not the browser clock, for anything dated.
- `can_see_student(id)`: caller is a household member with `member_type = 'guardian'`, or the member row's `student_id` is that dancer.
- `can_edit_portal_class(class)`: `is_admin()` or an active, non-paused row in `portal_class_instructors`. As of 2026-10-22 all 103 classes have an active instructor grant (`ATTENDANCE-NOTES.md` still says 38 had none; that is out of date). A teacher with no grant on a class simply sees nothing for it.
- Migration files in this repo do **not** fully equal production (`v34` has no file; `scripts/sql-tests/schema.sql` was read off the live project for that reason). When in doubt, trust the live database.
- Attendance's `REACT_APP_ATTENDANCE_LIVE` flag gates its family view. Evaluations don't need one: the `submitted` status and the admin switch already control visibility.

## 9. To re-verify the database later

```sql
select proname from pg_proc where pronamespace='public'::regnamespace
  and proname in ('staff_save_evaluation','admin_evaluation_export','admin_set_evaluation_settings');   -- 3 rows
select grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants
  where table_name='portal_evaluations' and grantee in ('anon','authenticated') group by 1;            -- authenticated: SELECT only
select policyname from pg_policies where tablename='portal_evaluations';                                -- 2 rows
select evaluations_enabled, evaluation_round from portal_settings;                                      -- false / '' until an admin opens a round
```
