/**
 * Class evaluations (v70) and family_evaluations() (v71), run against a real Postgres.
 *
 *   npm install --no-save @electric-sql/pglite
 *   npm run test:sql
 *
 * Everything that matters here is SQL: who may write, into which round, what a
 * submitted row refuses, that an edit never un-submits, what gets logged, and
 * what a family — as opposed to a teacher or an admin — can read. A mock of
 * supabase.rpc proves none of it. PGlite runs the same planner and the same
 * constraints with no server, so each test gets a fresh database built from
 * schema.sql, the stubs below, v70 and v71.
 *
 * STUBS. schema.sql's can_edit_portal_class() is admin-only and it has no
 * portal_household_members, so this file adds the teacher branch, the
 * household table and the real can_see_student() before v70 runs — the same
 * shapes production has (read 2026-10-22).
 *
 * RLS is exercised by switching to a role that is subject to it: the tests
 * create an `app_user` role, grant it what v70 grants `authenticated`, and
 * SET ROLE to it with the JWT claim set. PGlite is a superuser session, so
 * without that step every policy would be bypassed and the family tests would
 * pass for the wrong reason.
 *
 * Every family, dancer and email here is invented. The repo is public.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  console.error('\n  These tests need PGlite, which is deliberately not a dependency:\n\n' +
    '    npm install --no-save @electric-sql/pglite\n');
  process.exit(1);
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(`${root}${path}`, 'utf8');
const SCHEMA = read('scripts/sql-tests/schema.sql');
const V70 = read('supabase-migration-v70-portal-evaluations.sql');
const V71 = read('supabase-migration-v71-family-evaluations.sql');
const V72 = read('supabase-migration-v72-evaluations-guardians-only.sql');
const V73 = read('supabase-migration-v73-clear-evaluation-draft.sql');

const ADMIN = '00000000-0000-4000-8000-00000000a001';
const TEACHER = '00000000-0000-4000-8000-00000000a002';
const OTHER_TEACHER = '00000000-0000-4000-8000-00000000a003';
const PARENT = '00000000-0000-4000-8000-00000000b001';
const OTHER_PARENT = '00000000-0000-4000-8000-00000000b002';
const DANCER_LOGIN = '00000000-0000-4000-8000-00000000b003';

// What production has and schema.sql does not: the teacher branch of
// can_edit_portal_class, households' members, can_see_student, the columns
// v70/v71 read, and a role that RLS applies to.
const STUBS = `
  alter table public.portal_classes add column if not exists instructor_name text;
  alter table public.portal_settings add column if not exists updated_at timestamptz not null default now();

  create table public.portal_class_instructors (
    class_id   uuid not null references public.portal_classes(id),
    profile_id uuid not null references public.profiles(id),
    is_paused  boolean not null default false
  );

  create or replace function public.can_edit_portal_class(target_class uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select public.is_admin()
        or (target_class is not null and exists (
          select 1 from public.portal_class_instructors pci
          join public.profiles p on p.id = pci.profile_id
          where pci.class_id = target_class and pci.profile_id = auth.uid()
            and pci.is_paused is not true and p.is_active is not false));
  $$;

  create table public.portal_household_members (
    id           uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.portal_households(id),
    profile_id   uuid not null references public.profiles(id),
    member_type  text not null check (member_type in ('guardian', 'student')),
    student_id   uuid references public.portal_students(id)
  );

  create or replace function public.can_see_student(p_student_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from public.portal_household_members m
      join public.portal_students s on s.id = p_student_id
      where m.profile_id = auth.uid() and m.household_id = s.household_id
        and (m.member_type = 'guardian' or m.student_id = p_student_id));
  $$;

  create or replace function public.update_updated_at_column() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

  -- The role RLS applies to. v70 grants to "authenticated"; the same grants are
  -- repeated for it after v70 below.
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'app_user') then create role app_user nologin; end if;
  end $$;
  grant app_user to current_user;
  grant usage on schema public to app_user;
  grant select on all tables in schema public to app_user;
`;

const AFTER = `
  revoke all on public.portal_evaluations from app_user;
  grant select on public.portal_evaluations to app_user;
  grant execute on function public.staff_save_evaluation(uuid,uuid,smallint,smallint,smallint,text,boolean,boolean,text,text) to app_user;
  grant execute on function public.admin_set_evaluation_settings(boolean, text) to app_user;
  grant execute on function public.admin_evaluation_export(uuid[], uuid[], text, text, boolean) to app_user;
  grant execute on function public.family_evaluations() to app_user;
  grant execute on function public.is_guardian_of(uuid) to app_user;
  grant execute on function public.staff_clear_evaluation(uuid, uuid, text, text) to app_user;
  -- v70's policies, as v72 narrows the family one, name "authenticated";
  -- mirror them for the test role.
  create policy test_family on public.portal_evaluations for select to app_user
    using (status = 'submitted' and (select public.is_guardian_of(student_id)));
  create policy test_staff on public.portal_evaluations for select to app_user
    using ((select public.can_edit_portal_class(class_id)));
`;

const signIn = (db, id) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id ?? '']);

/** Run `fn` as a role RLS applies to, as the given user, then come back. */
const asUser = async (db, id, fn) => {
  await signIn(db, id);
  await db.exec('set role app_user');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
};

const studio = async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(STUBS);
  await db.exec(V70);
  await db.exec(V71);
  await db.exec(V72);
  await db.exec(V73);
  await db.exec(AFTER);

  await db.query(
    `insert into profiles (id, email, role) values
       ($1, 'office@example.com', 'admin'), ($2, 'teacher@example.com', 'team'), ($3, 'other@example.com', 'team'),
       ($4, 'parent@example.com', 'client'), ($5, 'otherparent@example.com', 'client'), ($6, 'dancer@example.com', 'client')`,
    [ADMIN, TEACHER, OTHER_TEACHER, PARENT, OTHER_PARENT, DANCER_LOGIN]);

  const cls = (await db.query(
    `insert into portal_classes (name, season, instructor_name, day_of_week, start_time)
     values ('Jr Ballet 2', '2026-2027', 'Dana Example', 2, '17:00') returning id`)).rows[0].id;
  const otherCls = (await db.query(
    `insert into portal_classes (name, season) values ('Teen Hip Hop', '2026-2027') returning id`)).rows[0].id;
  await db.query(`insert into portal_class_instructors (class_id, profile_id) values ($1, $2), ($3, $4)`,
    [cls, TEACHER, otherCls, OTHER_TEACHER]);

  const hh = (await db.query(
    `insert into portal_households (primary_email, display_name) values ('parent@example.com', 'Alvarez') returning id`)).rows[0].id;
  const otherHh = (await db.query(
    `insert into portal_households (primary_email, display_name) values ('otherparent@example.com', 'Boateng') returning id`)).rows[0].id;
  const maya = (await db.query(
    `insert into portal_students (household_id, first_name, last_name, display_name) values ($1, 'Maya', 'Alvarez', 'Bug') returning id`, [hh])).rows[0].id;
  const eli = (await db.query(
    `insert into portal_students (household_id, first_name, last_name) values ($1, 'Eli', 'Boateng') returning id`, [otherHh])).rows[0].id;
  await db.query(`insert into portal_household_members (household_id, profile_id, member_type) values ($1, $2, 'guardian'), ($3, $4, 'guardian')`,
    [hh, PARENT, otherHh, OTHER_PARENT]);
  await db.query(`insert into portal_household_members (household_id, profile_id, member_type, student_id) values ($1, $2, 'student', $3)`,
    [hh, DANCER_LOGIN, maya]);
  for (const [student, klass] of [[maya, cls], [eli, cls], [eli, otherCls]]) {
    await db.query(`insert into portal_enrollments (student_id, class_id, season, enrolled_on) values ($1, $2, '2026-2027', '2026-08-31')`, [student, klass]);
  }

  return { db, cls, otherCls, maya, eli, hh };
};

const openRound = async (db, name = 'Fall midterm') => {
  await signIn(db, ADMIN);
  await db.query(`select public.admin_set_evaluation_settings(true, $1)`, [name]);
};

const save = (db, student, klass, { p = 4, a = 5, s = 3, comment = 'Lovely lines', moveUp = false, submit = false, season = null, round = null } = {}) =>
  db.query(
    `select public.staff_save_evaluation($1, $2, $3::smallint, $4::smallint, $5::smallint, $6, $7, $8, $9, $10) as r`,
    [student, klass, p, a, s, comment, moveUp, submit, season, round]).then((x) => x.rows[0].r);

const refuses = async (promise, message) => {
  await assert.rejects(promise, (e) => {
    assert.match(e.message, message);
    return true;
  });
};

const logs = async (db, action) =>
  (await db.query(`select details from activity_logs where action = $1 order by created_at`, [action])).rows.map((r) => r.details);

// -------------------------------------------------------------------- tests

test('v70 to v73 run twice without change', async () => {
  const { db } = await studio();
  await db.exec(V70);
  await db.exec(V71);
  await db.exec(V72);
  await db.exec(V73);
  const { rows } = await db.query(`select count(*)::int as n from pg_policies where tablename = 'portal_evaluations' and policyname like 'portal_%'`);
  assert.equal(rows[0].n, 2);
});

test('the switch: off by default, a teacher is locked out, an admin is not', async () => {
  const { db, cls, maya } = await studio();
  await signIn(db, ADMIN);
  await db.query(`select public.admin_set_evaluation_settings(false, 'Fall midterm')`);

  await signIn(db, TEACHER);
  await refuses(save(db, maya, cls), /closed right now/);

  await signIn(db, ADMIN);
  const r = await save(db, maya, cls);
  assert.equal(r.status, 'draft');
});

test('opening needs a round name, and the name is capped', async () => {
  const { db } = await studio();
  await signIn(db, ADMIN);
  await refuses(db.query(`select public.admin_set_evaluation_settings(true, '')`), /Name the round/);
  await refuses(db.query(`select public.admin_set_evaluation_settings(true, $1)`, ['x'.repeat(81)]), /too long/);
  const r = (await db.query(`select public.admin_set_evaluation_settings(true, '  Fall midterm ') as r`)).rows[0].r;
  assert.deepEqual(r, { evaluations_enabled: true, evaluation_round: 'Fall midterm' });
  // null keeps the name while the switch flips.
  const r2 = (await db.query(`select public.admin_set_evaluation_settings(false, null) as r`)).rows[0].r;
  assert.equal(r2.evaluation_round, 'Fall midterm');
  // Two saves; the two refusals raised before anything was logged.
  assert.equal((await logs(db, 'evaluation_settings_changed')).length, 2);
});

test('only an admin may touch the switch or the export', async () => {
  const { db, cls } = await studio();
  await signIn(db, TEACHER);
  await refuses(db.query(`select public.admin_set_evaluation_settings(true, 'x')`), /Admins only/);
  await refuses(db.query(`select public.admin_evaluation_export(array[$1]::uuid[])`, [cls]), /Admins only/);
});

test('a teacher writes their own class, the open round, an enrolled dancer — and nothing else', async () => {
  const { db, cls, otherCls, maya, eli } = await studio();
  await openRound(db);
  await signIn(db, TEACHER);

  const draft = await save(db, maya, cls, { s: null });
  assert.equal(draft.status, 'draft');
  assert.equal(draft.round, 'Fall midterm');
  assert.equal(draft.season, '2026-2027');

  await refuses(save(db, eli, otherCls), /do not teach/);
  await refuses(save(db, maya, cls, { round: 'Final' }), /not open/);
  await refuses(save(db, maya, cls, { submit: true, s: null }), /all three ratings/);
  await refuses(save(db, maya, cls, { p: 6 }), /check constraint|violates/);

  // Not on the roster of this class: Eli is in Jr Ballet 2, a stranger is not.
  const stranger = (await db.query(
    `insert into portal_students (household_id, first_name, last_name) values ((select id from portal_households limit 1), 'Zed', 'Nobody') returning id`)).rows[0].id;
  await refuses(save(db, stranger, cls), /not on this class roster/);
});

test('submit, then edit: stays submitted, keeps its first submitted_at, and logs the previous values', async () => {
  const { db, cls, maya } = await studio();
  await openRound(db);
  await signIn(db, TEACHER);

  await save(db, maya, cls);                                    // draft: nothing logged for a teacher
  assert.equal((await logs(db, 'evaluation_created')).length, 0);

  const sub = await save(db, maya, cls, { submit: true, moveUp: true });
  assert.equal(sub.status, 'submitted');
  const first = (await db.query(`select submitted_at, submitted_by from portal_evaluations`)).rows[0];
  assert.equal(first.submitted_by, TEACHER);

  // An edit with p_submit = false does not revert it, and is logged with the old values.
  const edit = await save(db, maya, cls, { p: 2, comment: 'Revised', submit: false });
  assert.equal(edit.status, 'submitted');
  const after = (await db.query(`select submitted_at, performance, comment, status from portal_evaluations`)).rows[0];
  assert.equal(after.status, 'submitted');
  assert.equal(after.performance, 2);
  assert.equal(String(after.submitted_at), String(first.submitted_at));

  const edited = await logs(db, 'evaluation_edited');
  assert.equal(edited.length, 1);
  assert.equal(edited[0].by_admin, false);
  assert.equal(edited[0].before.performance, 4);
  assert.equal(edited[0].before.comment, 'Lovely lines');
  assert.equal((await logs(db, 'evaluation_submitted')).length, 1);
});

test('an admin may write with the switch off, into any round and season, and every write is logged', async () => {
  const { db, cls, maya } = await studio();
  await signIn(db, ADMIN);
  await db.query(`select public.admin_set_evaluation_settings(false, 'Fall midterm')`);

  const r = await save(db, maya, cls, { round: 'Spring final', season: '2025-2026' });
  assert.equal(r.round, 'Spring final');
  assert.equal(r.season, '2025-2026');
  const created = await logs(db, 'evaluation_created');
  assert.equal(created.length, 1);
  assert.equal(created[0].by_admin, true);
});

test('no client role can write the table directly', async () => {
  const { db, cls, maya } = await studio();
  await refuses(asUser(db, TEACHER, () => db.query(
    `insert into portal_evaluations (student_id, class_id, season, round) values ($1, $2, '2026-2027', 'x')`, [maya, cls])),
    /permission denied/);
  await refuses(asUser(db, ADMIN, () => db.query(`delete from portal_evaluations`)), /permission denied/);
});

test('RLS: a family reads submitted rows for its own dancers, never drafts, never another family', async () => {
  const { db, cls, otherCls, maya, eli } = await studio();
  await openRound(db);
  await signIn(db, TEACHER);
  await save(db, maya, cls, { submit: true });   // Maya: submitted
  await save(db, eli, cls);                      // Eli in Jr Ballet 2: draft
  await signIn(db, OTHER_TEACHER);
  await save(db, eli, otherCls, { submit: true }); // Eli in Hip Hop: submitted

  const count = (id) => asUser(db, id, async () =>
    (await db.query(`select student_id, status from portal_evaluations`)).rows);

  const parent = await count(PARENT);
  assert.deepEqual(parent, [{ student_id: maya, status: 'submitted' }]);

  const other = await count(OTHER_PARENT);
  assert.deepEqual(other.map((r) => r.status), ['submitted']);
  assert.ok(other.every((r) => r.student_id === eli));

  // A dancer's own login reads NOTHING (v72): evaluations are for parents.
  // Decided 2026-10-22; was open decision 1 in EVALUATIONS-BUILD.md.
  const dancer = await count(DANCER_LOGIN);
  assert.deepEqual(dancer, []);

  // A teacher reads every row for their class, drafts included, and nothing for another's.
  const teacher = await count(TEACHER);
  assert.equal(teacher.length, 2);
  assert.ok(teacher.every((r) => r.status !== undefined));
  const otherTeacher = await count(OTHER_TEACHER);
  assert.equal(otherTeacher.length, 1);
});

test('family_evaluations() attaches the class name even when the family can no longer read the class', async () => {
  const { db, cls, maya } = await studio();
  await openRound(db);
  await signIn(db, TEACHER);
  await save(db, maya, cls, { submit: true, comment: 'Great season' });
  // The class is retired after the season. The record stays, and keeps its name.
  await db.query(`update portal_classes set is_active = false where id = $1`, [cls]);

  const rows = await asUser(db, PARENT, async () => (await db.query(`select * from public.family_evaluations()`)).rows);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].class_name, 'Jr Ballet 2');
  assert.equal(rows[0].instructor_name, 'Dana Example');
  assert.equal(rows[0].first_name, 'Maya');      // the legal name, not the nickname
  assert.equal(rows[0].comment, 'Great season');

  const stranger = await asUser(db, OTHER_PARENT, async () => (await db.query(`select * from public.family_evaluations()`)).rows);
  assert.equal(stranger.length, 0);
  // Nor through the function for the dancer's own login (v72).
  const self = await asUser(db, DANCER_LOGIN, async () => (await db.query(`select * from public.family_evaluations()`)).rows);
  assert.equal(self.length, 0);

  // A draft is not a family's to read, through the function either.
  await signIn(db, TEACHER);
  await db.query(`update portal_evaluations set status = 'draft', submitted_at = null, submitted_by = null`);
  const none = await asUser(db, PARENT, async () => (await db.query(`select * from public.family_evaluations()`)).rows);
  assert.equal(none.length, 0);
});

test('the export starts from the roster and names who is missing, legal names only', async () => {
  const { db, cls, otherCls, maya, eli } = await studio();
  await openRound(db);
  await signIn(db, TEACHER);
  await save(db, maya, cls, { submit: true });
  await save(db, eli, cls);

  await signIn(db, ADMIN);
  const r = (await db.query(`select public.admin_evaluation_export(array[$1]::uuid[]) as r`, [cls])).rows[0].r;
  assert.equal(r.summary.round, 'Fall midterm');
  assert.deepEqual([r.summary.total, r.summary.submitted, r.summary.draft, r.summary.not_started], [2, 1, 1, 0]);
  assert.equal(r.summary.by_class.length, 1);
  assert.deepEqual(r.summary.by_class[0].missing, [{ student_id: eli, name: 'Eli Boateng', state: 'draft' }]);
  assert.equal(r.evaluations.length, 1);
  assert.equal(r.evaluations[0].first_name, 'Maya');
  assert.equal(r.evaluations[0].instructor_name, 'Dana Example');
  assert.ok(!JSON.stringify(r).includes('Bug'), 'display_name must never appear in an export');

  // Drafts on request, and one dancer across every class they are in.
  const withDrafts = (await db.query(`select public.admin_evaluation_export(null, array[$1]::uuid[], null, null, true) as r`, [eli])).rows[0].r;
  assert.equal(withDrafts.summary.total, 2);           // Eli is in two classes
  assert.equal(withDrafts.evaluations.length, 1);      // one draft, one not started
  assert.equal(withDrafts.evaluations[0].state, 'draft');
  assert.ok(withDrafts.summary.by_class.some((c) => c.class_id === otherCls && c.missing[0].state === 'not_started'));

  await refuses(db.query(`select public.admin_evaluation_export(null, null)`), /Pick at least one/);
});

const clear = (db, student, klass, { season = null, round = null } = {}) =>
  db.query(`select public.staff_clear_evaluation($1, $2, $3, $4) as r`, [student, klass, season, round]).then((x) => x.rows[0].r);

test('clear (v73): a draft goes back to Not started and is logged; a submitted one is refused', async () => {
  const { db, cls, otherCls, maya, eli } = await studio();
  await openRound(db);
  await signIn(db, TEACHER);

  // Nothing saved yet: not an error, nothing happens.
  assert.deepEqual(await clear(db, maya, cls), { cleared: false });

  await save(db, maya, cls, { comment: 'half done', s: null });
  const r = await clear(db, maya, cls);
  assert.equal(r.cleared, true);
  assert.equal((await db.query(`select count(*)::int as n from portal_evaluations`)).rows[0].n, 0);
  const logged = await logs(db, 'evaluation_cleared');
  assert.equal(logged.length, 1);
  assert.equal(logged[0].before.comment, 'half done');
  assert.equal(logged[0].by_admin, false);

  // Submitted: refused, row untouched.
  await save(db, maya, cls, { submit: true });
  await refuses(clear(db, maya, cls), /cannot be cleared/);
  assert.equal((await db.query(`select status from portal_evaluations`)).rows[0].status, 'submitted');

  // Same gates as save: not my class, not the open round, switch off.
  await save(db, eli, cls);
  await signIn(db, OTHER_TEACHER);
  await refuses(clear(db, eli, cls), /do not teach/);
  await signIn(db, TEACHER);
  await refuses(clear(db, eli, cls, { round: 'Final' }), /not open/);
  await signIn(db, ADMIN);
  await db.query(`select public.admin_set_evaluation_settings(false, null)`);
  await signIn(db, TEACHER);
  await refuses(clear(db, eli, cls), /closed right now/);
  // An admin may clear with the switch off, and it is logged as by_admin.
  await signIn(db, ADMIN);
  assert.equal((await clear(db, eli, cls)).cleared, true);
  assert.equal((await logs(db, 'evaluation_cleared'))[1].by_admin, true);
  void otherCls;
});
