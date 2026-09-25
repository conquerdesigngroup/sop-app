/**
 * admin_enrollment_import (v67, corrected by v68 and v69), run against a real Postgres.
 *
 *   npm install --no-save @electric-sql/pglite
 *   npm run test:sql
 *
 * WHY A REAL DATABASE
 *
 * Everything that matters about this function is SQL: which enrolment a tag
 * lands on, which one it drops, what the unique key refuses, and above all that
 * attendance and past rosters do not move. A mock of supabase.rpc proves none
 * of it. PGlite is Postgres compiled to WebAssembly — the same planner, the
 * same constraints, no server, no network — so each test gets a fresh database
 * in a few hundred milliseconds, built from the production-shaped schema in
 * schema.sql plus v67, v68 and v69 in the order production applies them.
 *
 * The tests marked "review:" are the independent review's findings, each kept
 * as the regression test that failed before v68; "second review:" and "third
 * review:" are the later reviews', each failing before the fix beside it.
 * "pinned:" tests hold a boundary those fixes rely on, true before them too;
 * "known limit:" tests hold a limit chosen on purpose, said in the headers.
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
const V67 = read('supabase-migration-v67-enrollment-import.sql');
const V68 = read('supabase-migration-v68-enrollment-import-review-fixes.sql');
const V69 = read('supabase-migration-v69-enrollment-import-second-review.sql');
const ROSTER_IMPORT = read('scripts/sql-tests/live-admin-roster-import.sql');

const ADMIN = '00000000-0000-4000-8000-00000000a001';
const TEACHER = '00000000-0000-4000-8000-00000000a002';

// ------------------------------------------------------------------ fixtures

/** The class titles the export tags families with. */
const MINI_JAZZ = 'Mini Jazz 1 (dana/m-4pm)';        // ages 5–7
const JUNIOR_BALLET = 'Junior Ballet 2 (lee/t-5pm)';  // ages 8–11
const TEEN_HIPHOP = 'Teen Hip Hop (sam/w-6pm)';       // ages 12–17
const TURNS = 'Petite Turns & Jumps (kai/th-3:45pm)'; // ages 6–9
const OPEN_TAP = 'Open Tap (lee/f-7pm)';              // no age range

const tag = (title) => title.toLowerCase();

const studio = async (today = '2026-10-01') => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(V67);
  await db.exec(V68);
  await db.exec(V69);
  await db.exec(ROSTER_IMPORT);
  await db.query(
    `insert into profiles (id, email, role) values ($1, 'office@example.com', 'admin'), ($2, 'teacher@example.com', 'team')`,
    [ADMIN, TEACHER]);
  await signIn(db, ADMIN);
  await setToday(db, today);

  const ids = {};
  for (const [title, min, max] of [
    [MINI_JAZZ, 5, 7], [JUNIOR_BALLET, 8, 11], [TEEN_HIPHOP, 12, 17], [TURNS, 6, 9], [OPEN_TAP, null, null],
  ]) {
    const { rows } = await db.query(
      `insert into portal_classes (name, external_class_id, age_min_years, age_max_years, season, season_start, season_end, day_of_week, start_time)
       values ($1, lower($2), $3, $4, '2026-2027', '2026-08-31', '2027-06-20', 1, '16:00') returning id`,
      [title.replace(/\s*\([^()]*\)\s*$/, ''), title, min, max]);
    ids[title] = rows[0].id;
  }
  return { db, cls: ids };
};

const signIn = (db, id) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id ?? '']);
const setToday = (db, day) => db.query(`select set_config('test.today', $1, false)`, [day]);

const household = async (db, ext, email, name) =>
  (await db.query(
    `insert into portal_households (external_account_id, primary_email, display_name) values ($1, $2, $3) returning id`,
    [ext, email, name])).rows[0].id;

const dancer = async (db, hh, first, last, dob) =>
  (await db.query(
    `insert into portal_students (household_id, first_name, last_name, date_of_birth) values ($1, $2, $3, $4) returning id`,
    [hh, first, last, dob])).rows[0].id;

const enrol = async (db, student, classId, { on = '2026-08-31', status = 'active', dropped = null, season = '2026-2027' } = {}) =>
  (await db.query(
    `insert into portal_enrollments (student_id, class_id, season, status, enrolled_on, dropped_on)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [student, classId, season, status, on, dropped])).rows[0].id;

const session = async (db, classId, date) =>
  (await db.query(
    `insert into portal_class_sessions (class_id, session_date, source) values ($1, $2, 'schedule') returning id`,
    [classId, date])).rows[0].id;

const mark = async (db, student, classId, sessionId, status = 'present') => {
  await db.query(
    `insert into portal_attendance (student_id, class_id, session_id, status, recorded_by) values ($1, $2, $3, $4, $5)`,
    [student, classId, sessionId, status, TEACHER]);
  await db.query(
    `insert into portal_attendance_history (student_id, class_id, session_id, old_status, new_status, changed_by, source)
     values ($1, $2, $3, null, $4, $5, 'app')`,
    [student, classId, sessionId, status, TEACHER]);
};

/** One export row, the shape src/lib/enrollmentImport.ts sends. */
const contact = ({ id, email, tags = [], students = [], first = 'Pat', last = '', row = 2 }) => ({
  row, contact_id: id, email, first_name: first, last_name: last, tags, students,
});

const sync = async (db, contacts, mode = 'preview', expect = null, confirm = false) =>
  (await db.query(
    `select public.admin_enrollment_import($1::jsonb, $2, $3, 'contacts.csv', $4) as r`,
    [JSON.stringify(contacts), mode, expect, confirm])).rows[0].r;

const preview = (db, contacts) => sync(db, contacts);
const apply = async (db, contacts, confirm = false) =>
  sync(db, contacts, 'apply', (await preview(db, contacts)).plan_hash, confirm);
const recordStart = async (db, contacts) => sync(db, contacts, 'baseline', (await preview(db, contacts)).baseline_hash);

const enrolments = async (db) =>
  (await db.query(
    `select s.first_name as dancer, k.external_class_id as class, e.status,
            e.enrolled_on::text as enrolled_on, e.dropped_on::text as dropped_on, e.season
       from portal_enrollments e
       join portal_students s on s.id = e.student_id
       join portal_classes k on k.id = e.class_id
      order by 1, 2, 4`)).rows;

const remembered = async (db) =>
  (await db.query(
    `select h.primary_email as family, k.external_class_id as class
       from portal_enrollment_import_tags t
       join portal_households h on h.id = t.household_id
       join portal_classes k on k.id = t.class_id
      order by 1, 2`)).rows;

const names = (list, key = 'student_name') => list.map((x) => `${x[key]} → ${x.class_name}`).sort();

/**
 * One dancer, the Alvarez family, in Mini Jazz. A second family carries a tag
 * so a starting point is never empty.
 */
const oneDancerFamily = async () => {
  const s = await studio();
  const hh = await household(s.db, 'c-100', 'alvarez@example.com', 'Alvarez');
  const maya = await dancer(s.db, hh, 'Maya', 'Alvarez', '2019-03-02'); // 7 on 2026-10-01
  await enrol(s.db, maya, s.cls[MINI_JAZZ]);
  return { ...s, hh, maya };
};

const ALVAREZ = (tags, extra = {}) => contact({ id: 'c-100', email: 'alvarez@example.com', tags, ...extra });

// ------------------------------------------------------------ who may run it

test('only an admin may run it', async () => {
  const { db } = await studio();
  const file = [contact({ id: 'c-1', email: 'a@example.com', tags: [tag(MINI_JAZZ)] })];

  await signIn(db, TEACHER);
  await assert.rejects(() => preview(db, file), /Not authorised/);
  await signIn(db, null);
  await assert.rejects(() => preview(db, file), /Not authorised/);
});

test('it refuses what it cannot read, and an apply with no preview behind it', async () => {
  const { db } = await studio();
  await assert.rejects(() => db.query(`select public.admin_enrollment_import('{}'::jsonb)`), /JSON array/);
  await assert.rejects(() => db.query(`select public.admin_enrollment_import('[]'::jsonb)`), /no contacts/);
  await assert.rejects(() => sync(db, [contact({ id: 'c', email: 'a@example.com' })], 'merge'), /mode must be/);
  await assert.rejects(() => sync(db, [contact({ id: 'c', email: 'a@example.com' })], 'apply', null), /Preview the file/);
});

test('v68 leaves one importer: the old four-argument signature is gone', async () => {
  const { db } = await studio();
  const { rows } = await db.query(
    `select pg_get_function_identity_arguments(oid) as args from pg_proc where proname = 'admin_enrollment_import'`);
  assert.deepEqual(rows.map((r) => r.args), ['p_contacts jsonb, p_mode text, p_expect text, p_filename text, p_confirm boolean']);
});

test('malformed rows are read defensively and reported, not half-applied', async () => {
  const { db } = await studio();
  const hh = await household(db, 'c-100', 'alvarez@example.com', 'Alvarez');
  await dancer(db, hh, 'Maya', 'Alvarez', '2019-03-02');
  await recordStart(db, [ALVAREZ([tag(OPEN_TAP)])]);

  const file = [
    { ...ALVAREZ([]), tags: [tag(OPEN_TAP), null, 42, tag(MINI_JAZZ)] },
    { row: 'x', contact_id: 'c-900', email: 'new@example.com', tags: [tag(MINI_JAZZ)], students: [null, '  '] },
    'not a contact at all',
  ];
  const p = await preview(db, file);
  assert.deepEqual(names(p.adds), ['Maya Alvarez → Mini Jazz 1']);
  assert.deepEqual(p.not_imported.map((n) => [n.row, n.reason]), [[null, 'no_dancer_name'], [null, 'invalid_email']]);

  const done = await sync(db, file, 'apply', p.plan_hash);
  assert.equal(done.counts.adds, 1);
  assert.equal((await db.query(`select count(*)::int as n from portal_households`)).rows[0].n, 1);
});

// ------------------------------------------------------------- the first run

test('the first run only records a starting point, and cannot be used again to skip a sync', async () => {
  const { db } = await oneDancerFamily();
  const file = [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])];

  const first = await preview(db, file);
  assert.equal(first.first_import, true);
  assert.equal(first.last_sync_on, null);
  assert.deepEqual(first.baseline_counts, { families: 1, tags: 2 });
  // Every tag looks new with nothing remembered, so apply is refused outright.
  await assert.rejects(() => sync(db, file, 'apply', first.plan_hash), /No starting point/);

  const recorded = await sync(db, file, 'baseline', first.baseline_hash);
  assert.equal(recorded.recorded, true);
  assert.equal(recorded.tags_recorded, 2);
  assert.deepEqual(await remembered(db), [
    { family: 'alvarez@example.com', class: tag(MINI_JAZZ) },
    { family: 'alvarez@example.com', class: tag(TURNS) },
  ]);
  // Nothing on the rosters moved: TURNS was only remembered, not enrolled.
  assert.deepEqual((await enrolments(db)).map((e) => e.class), [tag(MINI_JAZZ)]);
  const runs = (await db.query(`select mode, as_of::text from portal_enrollment_import_runs`)).rows;
  assert.deepEqual(runs, [{ mode: 'baseline', as_of: '2026-10-01' }]);
  assert.equal((await db.query(`select count(*)::int as n from portal_enrollment_import_seen`)).rows[0].n, 1);

  const again = await preview(db, file);
  assert.equal(again.first_import, false);
  assert.equal(again.last_sync_on, '2026-10-01');
  assert.equal(again.counts.adds + again.counts.drops, 0);
  await assert.rejects(() => sync(db, file, 'baseline', again.baseline_hash), /already recorded/);
});

test('review: a first run offers nothing to add, drop or decide — it only records', async () => {
  const { db } = await oneDancerFamily();
  const file = [
    ALVAREZ([tag(MINI_JAZZ), tag(TURNS), tag(OPEN_TAP)], { students: ['Maya Alvarez', 'Tomas Alvarez'] }),
    contact({ id: 'c-600', email: 'haddad@example.com', students: ['Omar Haddad'], tags: [tag(OPEN_TAP)], row: 3 }),
  ];
  const p = await preview(db, file);
  assert.equal(p.first_import, true);
  assert.deepEqual([p.adds, p.drops, p.unassigned, p.conflicts, p.blocked], [[], [], [], [], []]);
  assert.deepEqual(p.baseline_counts, { families: 1, tags: 3 });
  // A new contact is listed, and created by the first applied sync — not now.
  assert.equal(p.new_families.length, 1);
  await sync(db, file, 'baseline', p.baseline_hash);
  assert.equal((await db.query(`select count(*)::int as n from portal_households`)).rows[0].n, 1);
});

test('second review: running v68 again after the starting point keeps the memory', async () => {
  const { db } = await oneDancerFamily();
  // TURNS and OPEN_TAP are sticky: on the family, taken by nobody.
  const file = [ALVAREZ([tag(MINI_JAZZ), tag(TURNS), tag(OPEN_TAP)])];
  await recordStart(db, file);

  await db.exec(V68);
  await db.exec(V69);
  const p = await preview(db, file);
  assert.equal(p.first_import, false);
  assert.deepEqual([p.adds, p.drops, p.unassigned], [[], [], []]);
  assert.equal(p.counts.memory_changes, 0);
  assert.equal((await remembered(db)).length, 3);
});

test('review: a starting point is refused from a file with no class tag at all', async () => {
  const { db } = await oneDancerFamily();
  const file = [ALVAREZ(['current family', 'mini jazz 1 (old/m-9am)'])];
  const p = await preview(db, file);
  assert.deepEqual(p.blocked.map((b) => b.reason), ['no_class_tags']);
  await assert.rejects(() => sync(db, file, 'baseline', p.baseline_hash), /no class tags at all/);
  assert.equal((await preview(db, file)).first_import, true);
});

// ------------------------------------------------------- rules 2, 3 and 4

test('a tag that has sat on the family since the starting point is never acted on', async () => {
  const { db } = await oneDancerFamily();
  // TURNS is on the family and nobody takes it: the "sticky" tag.
  const file = [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])];
  await recordStart(db, file);

  const p = await preview(db, file);
  assert.deepEqual(p.adds, []);
  assert.deepEqual(p.unassigned, []);
  assert.deepEqual(p.tagged_unheld.map((t) => t.class_name), ['Petite Turns & Jumps']);
});

test('a new tag in a one-dancer family is theirs, from the import date, in the class season', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);

  const file = [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])];
  const p = await preview(db, file);
  assert.deepEqual(names(p.adds), ['Maya Alvarez → Petite Turns & Jumps']);
  assert.equal(p.adds[0].reason, 'only_dancer');

  const done = await apply(db, file);
  assert.equal(done.applied, true);
  assert.deepEqual(await enrolments(db), [
    { dancer: 'Maya', class: tag(MINI_JAZZ), status: 'active', enrolled_on: '2026-08-31', dropped_on: null, season: '2026-2027' },
    { dancer: 'Maya', class: tag(TURNS), status: 'active', enrolled_on: '2026-10-01', dropped_on: null, season: '2026-2027' },
  ]);

  // Remembered now, so the same file again changes nothing.
  const again = await preview(db, file);
  assert.equal(again.counts.adds + again.counts.drops + again.counts.memory_changes, 0);
});

test('a class tag counts without the "enrolled" tag, and every other tag is ignored', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);

  const p = await preview(db, [ALVAREZ(['current family', 'missed-call', tag(MINI_JAZZ), tag(TURNS), 'mini jazz 1 (dana/m-5pm)'])]);
  assert.deepEqual(names(p.adds), ['Maya Alvarez → Petite Turns & Jumps']);
  const unmatched = Object.fromEntries(p.unmatched_tags.map((t) => [t.tag, t.looks_like_class]));
  // A title from an older schedule looks like a class and matches none.
  assert.deepEqual(unmatched, { 'current family': false, 'missed-call': false, 'mini jazz 1 (dana/m-5pm)': true });
  assert.equal(p.counts.unmatched_class_tags, 1);
});

test('the export HTML-escapes "&", and case and spacing never decide a match', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);

  const p = await preview(db, [ALVAREZ(['MINI  JAZZ 1 (DANA/M-4PM) ', 'Petite Turns &amp; Jumps (kai/th-3:45pm)'])]);
  assert.deepEqual(names(p.adds), ['Maya Alvarez → Petite Turns & Jumps']);
  assert.deepEqual(p.drops, []);
});

test('a tag that is gone drops the dancer as of the day before, and deletes nothing', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  await enrol(db, maya, cls[TURNS]);
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])]);

  const file = [ALVAREZ([tag(MINI_JAZZ)])];
  const p = await preview(db, file);
  assert.deepEqual(names(p.drops), ['Maya Alvarez → Petite Turns & Jumps']);
  assert.equal(p.drops[0].last_day, '2026-09-30');

  await apply(db, file);
  assert.deepEqual(await enrolments(db), [
    { dancer: 'Maya', class: tag(MINI_JAZZ), status: 'active', enrolled_on: '2026-08-31', dropped_on: null, season: '2026-2027' },
    { dancer: 'Maya', class: tag(TURNS), status: 'dropped', enrolled_on: '2026-08-31', dropped_on: '2026-09-30', season: '2026-2027' },
  ]);
  assert.deepEqual(await remembered(db), [{ family: 'alvarez@example.com', class: tag(MINI_JAZZ) }]);
  assert.equal((await preview(db, file)).counts.drops, 0);
});

test('a class held without ever being tagged is never dropped, and is listed', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  await enrol(db, maya, cls[OPEN_TAP]);
  const file = [ALVAREZ([tag(MINI_JAZZ)])];
  await recordStart(db, file);

  const p = await preview(db, file);
  assert.deepEqual(p.drops, []);
  assert.deepEqual(p.held_untagged.map((h) => [h.student_name, h.class_name]), [['Maya Alvarez', 'Open Tap']]);
});

test('review: a place already carrying an earlier end keeps it — no past roster moves', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  // Active, but ended on the 20th by hand: inconsistent, and on no roster since.
  await enrol(db, maya, cls[TURNS], { dropped: '2026-09-20' });
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])]);
  await session(db, cls[TURNS], '2026-09-24');

  const file = [ALVAREZ([tag(MINI_JAZZ)])];
  const p = await preview(db, file);
  assert.deepEqual(p.drops.map((d) => d.last_day), ['2026-09-20']);
  assert.deepEqual(p.blocked, []);
  const done = await apply(db, file);
  assert.deepEqual(done.fingerprint.after, done.fingerprint.before);
  assert.deepEqual((await enrolments(db)).find((e) => e.class === tag(TURNS)),
    { dancer: 'Maya', class: tag(TURNS), status: 'dropped', enrolled_on: '2026-08-31', dropped_on: '2026-09-20', season: '2026-2027' });
});

// ----------------------------------------------------------- rule 2, siblings

const siblings = async () => {
  const s = await studio();
  const hh = await household(s.db, 'c-200', 'boateng@example.com', 'Boateng');
  const eli = await dancer(s.db, hh, 'Eli', 'Boateng', '2020-05-01');  // 6
  const noor = await dancer(s.db, hh, 'Noor', 'Boateng', '2016-02-01'); // 10
  // Someone else carries a tag, so recording a starting point is not empty.
  const other = await household(s.db, 'c-900', 'chen@example.com', 'Chen');
  await dancer(s.db, other, 'Otis', 'Chen', '2012-01-01');
  await recordStart(s.db, [
    contact({ id: 'c-200', email: 'boateng@example.com', students: ['Eli Boateng', 'Noor Boateng'] }),
    contact({ id: 'c-900', email: 'chen@example.com', tags: [tag(TEEN_HIPHOP)] }),
  ]);
  return { ...s, hh, eli, noor };
};

const BOATENG = (tags, students = ['Eli Boateng', 'Noor Boateng']) =>
  contact({ id: 'c-200', email: 'boateng@example.com', tags, students });

test('with siblings, a new tag goes to one only when its age range admits exactly one', async () => {
  const { db } = await siblings();
  const p = await preview(db, [BOATENG([tag(MINI_JAZZ), tag(JUNIOR_BALLET), tag(TURNS), tag(OPEN_TAP), tag(TEEN_HIPHOP)])]);

  assert.deepEqual(names(p.adds), [
    'Eli Boateng → Mini Jazz 1',             // 5–7 admits Eli (6) only
    'Eli Boateng → Petite Turns & Jumps',    // 6–9 admits Eli, not Noor (10)
    'Noor Boateng → Junior Ballet 2',        // 8–11 admits Noor only
  ]);
  assert.ok(p.adds.every((a) => a.reason === 'only_sibling_in_age_range'));

  const why = Object.fromEntries(p.unassigned.map((u) => [u.class_name, u.reason]));
  assert.deepEqual(why, {
    'Open Tap': 'several_siblings_in_age_range', // no range: both fit
    'Teen Hip Hop': 'no_sibling_in_age_range',   // 12–17: neither
  });
  const tap = p.unassigned.find((u) => u.class_name === 'Open Tap');
  assert.deepEqual(tap.dancers, [{ name: 'Eli Boateng', age: 6 }, { name: 'Noor Boateng', age: 10 }]);
});

test('age is taken on the import date, and both ends of the range count', async () => {
  const s = await studio('2026-10-01');
  const hh = await household(s.db, 'c-210', 'duval@example.com', 'Duval');
  await dancer(s.db, hh, 'Jonah', 'Duval', '2018-10-01'); // turns 8 on the import date
  await dancer(s.db, hh, 'Anika', 'Duval', '2015-06-15'); // 11
  await recordStart(s.db, [contact({ id: 'c-210', email: 'duval@example.com', tags: [tag(OPEN_TAP)] })]);

  const file = [contact({ id: 'c-210', email: 'duval@example.com', tags: [tag(OPEN_TAP), tag(MINI_JAZZ)] })];
  // 5–7: on the import date Jonah is 8 and Anika 11, so nobody fits.
  assert.equal((await preview(s.db, file)).unassigned[0].reason, 'no_sibling_in_age_range');

  // The day before, Jonah was still 7 — the only one inside 5–7.
  await setToday(s.db, '2026-09-30');
  assert.deepEqual(names((await preview(s.db, file)).adds), ['Jonah Duval → Mini Jazz 1']);
});

test('a sibling with no birthday means no guess', async () => {
  const { db, hh } = await siblings();
  await dancer(db, hh, 'Lucia', 'Boateng', null);
  const p = await preview(db, [BOATENG([tag(JUNIOR_BALLET)], [])]);
  assert.deepEqual(p.adds, []);
  assert.equal(p.unassigned[0].reason, 'missing_birthday');
});

test('All Students naming more dancers than the app has stops the one-dancer rule', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);

  // An incomplete list is normal and changes nothing...
  const quiet = await preview(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)], { students: [] })]);
  assert.deepEqual(names(quiet.adds), ['Maya Alvarez → Petite Turns & Jumps']);

  // ...but a name the app has not met means a sibling the app does not have yet.
  const p = await preview(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)], { students: ['Maya Alvarez', 'Tomas Alvarez'] })]);
  assert.deepEqual(p.adds, []);
  assert.equal(p.unassigned[0].reason, 'export_names_unknown_dancer');
  assert.deepEqual(p.unassigned[0].unknown_names, [{ name: 'Tomas Alvarez', likely: null }]);
});

test('review: All Students naming ONLY a dancer the app has not met stops the one-dancer rule', async () => {
  const s = await studio();
  const hh = await household(s.db, 'c-100', 'alvarez@example.com', 'Alvarez');
  await dancer(s.db, hh, 'Maya', 'Alvarez', '2012-03-02'); // 14
  await recordStart(s.db, [ALVAREZ([tag(TEEN_HIPHOP)])]);

  // One name, one dancer — but not the same child. The new Mini Jazz tag is
  // the little sibling's, and the 14-year-old must not be enrolled.
  const p = await preview(s.db, [ALVAREZ([tag(TEEN_HIPHOP), tag(MINI_JAZZ)], { students: ['Tomas Alvarez'] })]);
  assert.deepEqual(p.adds, []);
  assert.deepEqual(p.unassigned.map((u) => [u.reason, u.unknown_names]),
    [['export_names_unknown_dancer', [{ name: 'Tomas Alvarez', likely: null }]]]);
});

test('review: siblings — one known name and one unknown is not "two names, two dancers"', async () => {
  const { db } = await siblings();
  const p = await preview(db, [BOATENG([tag(MINI_JAZZ)], ['Eli Boateng', 'Zara Boateng'])]);
  assert.deepEqual(p.adds, []);
  assert.equal(p.unassigned[0].reason, 'export_names_unknown_dancer');
});

test('names are compared ignoring case, spacing, punctuation and Enrolio\'s asterisk', async () => {
  const s = await studio();
  const hh = await household(s.db, 'c-100', 'alvarez@example.com', 'Alvarez');
  await dancer(s.db, hh, 'Mia', 'Vesper- Lund', '2019-03-02');
  await recordStart(s.db, [ALVAREZ([tag(OPEN_TAP)])]);
  const p = await preview(s.db, [ALVAREZ([tag(OPEN_TAP), tag(MINI_JAZZ)], { students: ['MIA VESPER-LUND*'] })]);
  assert.deepEqual(names(p.adds), ['Mia Vesper- Lund → Mini Jazz 1']);
});

test('a tag nobody could take is not remembered, so it is listed again next time', async () => {
  const { db } = await siblings();
  const file = [BOATENG([tag(OPEN_TAP), tag(JUNIOR_BALLET)])];
  await apply(db, file);

  assert.deepEqual(await remembered(db), [
    { family: 'boateng@example.com', class: tag(JUNIOR_BALLET) },
    { family: 'chen@example.com', class: tag(TEEN_HIPHOP) },
  ]);
  const again = await preview(db, file);
  assert.deepEqual(again.unassigned.map((u) => u.class_name), ['Open Tap']);
  assert.equal(again.counts.adds, 0);
});

test('a dancer dropped from a class who is tagged for it again is listed, not re-enrolled', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  await enrol(db, maya, cls[TURNS], { status: 'dropped', dropped: '2026-09-15' });
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);

  const file = [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])];
  const p = await preview(db, file);
  assert.deepEqual(p.adds, []);
  assert.deepEqual(p.conflicts.map((c) => [c.student_name, c.conflict, c.on]),
    [['Maya Alvarez', 'already_dropped', '2026-09-15']]);

  await apply(db, file);
  assert.equal((await enrolments(db)).length, 2);
  // Not remembered: it comes back until a person reopens the place.
  assert.equal((await preview(db, file)).conflicts.length, 1);
});

test('review: a place in an earlier season is not in the way of this season\'s', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  await enrol(db, maya, cls[TURNS], { season: '2025-2026', on: '2025-09-01', status: 'completed', dropped: '2026-06-01' });
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  const p = await preview(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])]);
  assert.deepEqual(names(p.adds), ['Maya Alvarez → Petite Turns & Jumps']);
  assert.deepEqual(p.conflicts, []);
});

test('review: a mark before a new place\'s start holds back that place only', async () => {
  const s = await studio();
  const a = await household(s.db, 'c-100', 'alvarez@example.com', 'Alvarez');
  const maya = await dancer(s.db, a, 'Maya', 'Alvarez', '2019-03-02');
  const g = await household(s.db, 'c-500', 'gupta@example.com', 'Gupta');
  const eli = await dancer(s.db, g, 'Eli', 'Gupta', '2016-01-01');
  await enrol(s.db, eli, s.cls[JUNIOR_BALLET]);
  await recordStart(s.db, [
    ALVAREZ([tag(OPEN_TAP)]),
    contact({ id: 'c-500', email: 'gupta@example.com', tags: [tag(JUNIOR_BALLET)] }),
  ]);
  // A mark with no place behind it — only possible by hand.
  await mark(s.db, maya, s.cls[TURNS], await session(s.db, s.cls[TURNS], '2026-09-24'));

  const file = [ALVAREZ([tag(OPEN_TAP), tag(TURNS)]), contact({ id: 'c-500', email: 'gupta@example.com', tags: [] })];
  const p = await preview(s.db, file);
  assert.deepEqual(p.blocked, []);
  assert.deepEqual(p.conflicts.map((c) => [c.student_name, c.conflict, c.on]), [['Maya Alvarez', 'marked_before_start', '2026-09-24']]);
  // The unrelated drop still goes through.
  const done = await apply(s.db, file);
  assert.equal(done.counts.drops, 1);
  assert.equal(done.counts.adds, 0);
});

// ------------------------------------------------------------------- rule 1

test('a household is matched by contact id, then by email', async () => {
  const { db } = await oneDancerFamily();
  const hh = await household(db, 'c-300', 'eriksen@example.com', 'Eriksen');
  await dancer(db, hh, 'Ingrid', 'Eriksen', '2012-04-04');
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)]), contact({ id: 'c-300', email: 'eriksen@example.com' })]);

  const p = await preview(db, [
    // The id wins even though the email on the contact changed.
    contact({ id: 'c-100', email: 'new-address@example.com', tags: [tag(MINI_JAZZ)] }),
    // A contact id the app has never seen, on a family it has.
    contact({ id: 'c-301', email: 'ERIKSEN@example.com', tags: [tag(TEEN_HIPHOP)] }),
  ]);
  assert.equal(p.counts.families, 2);
  assert.deepEqual(p.new_families, []);
  assert.deepEqual(names(p.adds), ['Ingrid Eriksen → Teen Hip Hop']);
  assert.deepEqual(p.missing_families, []);
});

test('two contacts on one family are one family: their tags are combined', async () => {
  const s = await studio();
  const hh = await household(s.db, 'c-400', 'fontaine@example.com', 'Fontaine');
  const rafa = await dancer(s.db, hh, 'Rafa', 'Fontaine', '2016-01-01');
  await enrol(s.db, rafa, s.cls[JUNIOR_BALLET]);
  await enrol(s.db, rafa, s.cls[OPEN_TAP]);
  const both = [
    // One parent's record carries every class tag, the other's none.
    contact({ id: 'c-400', email: 'fontaine@example.com', tags: [tag(JUNIOR_BALLET), tag(OPEN_TAP)], row: 2 }),
    contact({ id: 'c-401', email: 'fontaine@example.com', tags: ['current family'], students: ['Rafa Fontaine'], row: 3 }),
  ];
  await recordStart(s.db, both);

  const p = await preview(s.db, both);
  assert.equal(p.counts.drops, 0);
  assert.deepEqual(p.merged_contacts.map((m) => [m.email, m.contacts]), [['fontaine@example.com', 2]]);
});

test('review: a second contact on an address the app does not know joins the family its partner matched', async () => {
  const s = await studio();
  // The app knows the family under its old address.
  const hh = await household(s.db, 'c-300', 'old-address@example.com', 'Eriksen');
  const ingrid = await dancer(s.db, hh, 'Ingrid', 'Eriksen', '2016-04-04');
  await enrol(s.db, ingrid, s.cls[JUNIOR_BALLET]);
  await recordStart(s.db, [contact({ id: 'c-300', email: 'new-address@example.com', tags: [tag(JUNIOR_BALLET)] })]);

  const file = [
    // Parent 1: matched by contact id, address changed in Enrolio.
    contact({ id: 'c-300', email: 'new-address@example.com', tags: [tag(JUNIOR_BALLET), tag(OPEN_TAP)], row: 2 }),
    // Parent 2: same new address, a contact id the app has never seen.
    contact({ id: 'c-301', email: 'new-address@example.com', tags: [tag(OPEN_TAP)], students: ['Ingrid Eriksen'], row: 3 }),
  ];
  const p = await preview(s.db, file);
  assert.deepEqual(p.new_families, []);
  assert.deepEqual(names(p.adds), ['Ingrid Eriksen → Open Tap']);
  assert.deepEqual(p.merged_contacts.map((m) => m.contacts), [2]);

  await apply(s.db, file);
  const { rows } = await s.db.query(`select count(*)::int as n from portal_students where first_name = 'Ingrid'`);
  assert.equal(rows[0].n, 1);
});

test('review: an email on contacts of two different families is reported, and a third contact on it is not imported', async () => {
  const s = await studio();
  const a = await household(s.db, 'c-100', 'alvarez@example.com', 'Alvarez');
  await dancer(s.db, a, 'Maya', 'Alvarez', '2019-03-02');
  const b = await household(s.db, 'c-200', 'boateng@example.com', 'Boateng');
  await dancer(s.db, b, 'Eli', 'Boateng', '2020-05-01');
  await recordStart(s.db, [ALVAREZ([tag(MINI_JAZZ)]), contact({ id: 'c-200', email: 'boateng@example.com' })]);

  const p = await preview(s.db, [
    contact({ id: 'c-100', email: 'shared@example.com', tags: [tag(MINI_JAZZ)] }),
    contact({ id: 'c-200', email: 'shared@example.com', tags: [], row: 3 }),
    contact({ id: 'c-999', email: 'shared@example.com', tags: [tag(TURNS)], students: ['Ana Ruiz'], row: 4 }),
  ]);
  assert.deepEqual(p.email_conflicts.map((x) => [x.email, x.families]), [['shared@example.com', ['Alvarez', 'Boateng']]]);
  assert.deepEqual(p.not_imported.map((n) => [n.row, n.reason]), [[4, 'email_on_two_families']]);
  assert.deepEqual(p.new_families, []);
});

// ------------------------------------------------------------------- rule 6

test('a family missing from the export is reported and keeps its classes', async () => {
  const { db, maya } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  const other = await household(db, 'c-500', 'gupta@example.com', 'Gupta');
  await dancer(db, other, 'Eli', 'Gupta', '2015-01-01');

  const file = [contact({ id: 'c-500', email: 'gupta@example.com', tags: [tag(OPEN_TAP)] })];
  const p = await preview(db, file);
  assert.deepEqual(p.drops, []);
  assert.deepEqual(p.missing_families.map((m) => [m.email, m.active_enrollments]), [['alvarez@example.com', 1]]);

  await apply(db, file);
  assert.equal((await enrolments(db))[0].status, 'active');
  // What it had is still remembered, so a later export can still drop it.
  assert.deepEqual((await remembered(db)).find((r) => r.family === 'alvarez@example.com'),
    { family: 'alvarez@example.com', class: tag(MINI_JAZZ) });
  assert.ok(maya);
});

test('review: a family the sync has never seen, which existed at the starting point, is recorded — not acted on', async () => {
  const s = await studio();
  const a = await household(s.db, 'c-100', 'alvarez@example.com', 'Alvarez');
  await dancer(s.db, a, 'Maya', 'Alvarez', '2019-03-02');
  const g = await household(s.db, 'c-500', 'gupta@example.com', 'Gupta');
  const eli = await dancer(s.db, g, 'Eli', 'Gupta', '2016-01-01'); // 10
  await enrol(s.db, eli, s.cls[JUNIOR_BALLET]);
  // Gupta was not in the file the starting point was recorded from.
  await recordStart(s.db, [ALVAREZ([tag(MINI_JAZZ)])]);

  // Gupta reappears carrying tags of unknown age — maybe classes Eli left long ago.
  const file = [ALVAREZ([tag(MINI_JAZZ)]),
    contact({ id: 'c-500', email: 'gupta@example.com', tags: [tag(JUNIOR_BALLET), tag(TURNS), tag(OPEN_TAP)] })];
  const p = await preview(s.db, file);
  assert.deepEqual(p.adds, []);
  assert.deepEqual(p.first_seen_families.map((f) => [f.email, f.tags]), [['gupta@example.com', 3]]);
  assert.deepEqual(p.memory_changes, { added: 3, removed: 0, families_seen: 1 });
  assert.equal(p.counts.memory_changes, 4);

  await apply(s.db, file);
  // Recorded: from now on this family is diffed like any other.
  const q = await preview(s.db, [ALVAREZ([tag(MINI_JAZZ)]),
    contact({ id: 'c-500', email: 'gupta@example.com', tags: [tag(JUNIOR_BALLET), tag(OPEN_TAP)] })]);
  assert.deepEqual(q.first_seen_families, []);
  assert.deepEqual(q.drops, []);
  assert.equal(q.counts.memory_changes, 1);
});

test('a family created after the starting point is new, so its tags are new', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  // Added since, e.g. by the roster import, with a birthday.
  const hh = await household(db, 'c-700', 'ito@example.com', 'Ito');
  await dancer(db, hh, 'Mei', 'Ito', '2020-01-01');

  const p = await preview(db, [ALVAREZ([tag(MINI_JAZZ)]), contact({ id: 'c-700', email: 'ito@example.com', tags: [tag(MINI_JAZZ)] })]);
  assert.deepEqual(names(p.adds), ['Mei Ito → Mini Jazz 1']);
  assert.deepEqual(p.first_seen_families, []);
});

// ------------------------------------------------------------------- rule 7

test('a new family is created without a birthday, and the roster import later fills it in without a duplicate', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);

  const file = [ALVAREZ([tag(MINI_JAZZ)]), contact({
    id: 'c-600', email: 'Haddad@Example.com ', first: 'Sam', last: 'Haddad',
    students: ['Laura Isabel Haddad*'], tags: ['enrolled', tag(MINI_JAZZ)], row: 3,
  })];
  const p = await preview(db, file);
  assert.deepEqual(p.new_families.map((f) => [f.email, f.family, f.dancers]),
    [['haddad@example.com', 'Haddad', ['Laura Isabel Haddad']]]);
  assert.deepEqual(names(p.adds), ['Laura Isabel Haddad → Mini Jazz 1']);
  assert.equal(p.adds[0].new_dancer, true);

  await apply(db, file);
  const kid = async () => (await db.query(
    `select s.id, h.external_account_id, h.primary_email, s.first_name, s.last_name, s.date_of_birth::text as dob
       from portal_students s join portal_households h on h.id = s.household_id
      where h.external_account_id = 'c-600'`)).rows;
  const [created] = await kid();
  assert.deepEqual({ ...created, id: undefined }, {
    id: undefined, external_account_id: 'c-600', primary_email: 'haddad@example.com',
    first_name: 'Laura Isabel', last_name: 'Haddad', dob: null,
  });

  // The live admin_roster_import, given the name in one column as the Enrolio
  // students export has it: it finds this dancer and sets the birthday.
  const r = (await db.query(`select public.admin_roster_import($1::jsonb) as r`, [JSON.stringify([
    { email: 'haddad@example.com', student_name: 'Laura Isabel Haddad', date_of_birth: '2020-02-02' },
  ])])).rows[0].r;
  assert.equal(r.students_created, 0);
  assert.equal(r.students_updated, 1);
  const after = await kid();
  assert.equal(after.length, 1);
  assert.equal(after[0].id, created.id);
  assert.equal(after[0].dob, '2020-02-02');
  assert.deepEqual((await remembered(db)).map((x) => x.family), ['alvarez@example.com', 'haddad@example.com']);
});

test('known limit, pinned: the roster import given separate columns that split a surname differently makes a second dancer', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  await apply(db, [ALVAREZ([tag(MINI_JAZZ)]), contact({
    id: 'c-610', email: 'cruz@example.com', students: ['Maria De La Cruz'], tags: [tag(MINI_JAZZ)], row: 3,
  })]);
  const r = (await db.query(`select public.admin_roster_import($1::jsonb) as r`, [JSON.stringify([
    { email: 'cruz@example.com', student_first_name: 'Maria', student_last_name: 'De La Cruz', date_of_birth: '2020-02-02' },
  ])])).rows[0].r;
  // Documented in v68's header: the sync split "Maria De La" / "Cruz".
  assert.equal(r.students_created, 1);
});

test('a new family with several dancers is created, and its tags wait for birthdays', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);

  const file = [ALVAREZ([tag(MINI_JAZZ)]),
    contact({ id: 'c-700', email: 'ito@example.com', last: 'Ito', students: ['Mei Ito', 'Ken Ito'], tags: [tag(MINI_JAZZ)], row: 3 })];
  const p = await preview(db, file);
  assert.equal(p.counts.new_dancers, 2);
  assert.deepEqual(p.adds, []);
  assert.equal(p.unassigned[0].reason, 'missing_birthday');

  await apply(db, file);
  const again = await preview(db, file);
  assert.equal(again.counts.new_families, 0);
  assert.equal(again.unassigned[0].reason, 'missing_birthday');
});

test('contacts that cannot be imported safely are reported, never guessed at', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);

  const p = await preview(db, [
    ALVAREZ([tag(MINI_JAZZ)], { row: 1 }),
    contact({ id: 'c-801', email: 'kim@example.com', students: ['Jo Kim'], tags: [tag(MINI_JAZZ)], row: 2 }),
    contact({ id: 'c-802', email: 'kim@example.com', students: ['Jo Kim'], tags: [tag(MINI_JAZZ)], row: 3 }),
    contact({ id: 'c-803', email: 'lopez@example.com', students: [], row: 4 }),
    contact({ id: 'c-804', email: 'moss@example.com', students: ['Cher'], row: 5 }),
    contact({ id: 'c-805', email: 'not-an-email', students: ['Ana Ruiz'], row: 6 }),
  ]);
  assert.deepEqual(p.not_imported.map((n) => [n.row, n.reason]), [
    [2, 'duplicate_contact'], [3, 'duplicate_contact'], [4, 'no_dancer_name'],
    [5, 'dancer_name_needs_surname'], [6, 'invalid_email'],
  ]);
  assert.deepEqual(p.new_families, []);
  assert.equal(p.counts.new_dancers, 0);
});

// ----------------------------------------------------------------- classes

test('two ACTIVE classes sharing a title block a file that uses it', async () => {
  const { db } = await oneDancerFamily();
  await db.query(`insert into portal_classes (name, external_class_id, season) values ('Mini Jazz 1', lower($1), '2026-2027')`, [MINI_JAZZ]);
  const p = await preview(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  assert.deepEqual(p.blocked.map((b) => [b.reason, b.detail]), [['duplicate_class_title', tag(MINI_JAZZ)]]);
});

test('review: last season\'s copy switched off is not a second class, and an unused duplicate blocks nothing', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  await db.query(`insert into portal_classes (name, external_class_id, season, is_active) values ('Mini Jazz 1', lower($1), '2025-2026', false)`, [MINI_JAZZ]);
  await db.query(`insert into portal_classes (name, external_class_id, season, is_active) values ('Open Tap', lower($1), '2026-2027', true)`, [OPEN_TAP]);
  // Open Tap is now ambiguous, but nobody in this file carries it.
  const p = await preview(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])]);
  assert.deepEqual(p.blocked, []);
  assert.deepEqual(names(p.adds), ['Maya Alvarez → Petite Turns & Jumps']);
});

test('review: a tag for a class switched off in the app never enrols', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  await db.query(`insert into portal_classes (name, external_class_id, season, is_active) values ('Old Jazz', 'old jazz (x/m-5pm)', '2026-2027', false)`);
  const p = await preview(db, [ALVAREZ([tag(MINI_JAZZ), 'old jazz (x/m-5pm)'])]);
  assert.deepEqual(p.adds, []);
  assert.deepEqual(p.conflicts.map((c) => c.conflict), ['class_off_schedule']);
});

test('a whole class emptying at once is called out — it is usually a renamed class', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  const hh = await household(db, 'c-500', 'gupta@example.com', 'Gupta');
  const eli = await dancer(db, hh, 'Eli', 'Gupta', '2018-01-01');
  await enrol(db, maya, cls[TURNS]);
  await enrol(db, eli, cls[TURNS]);
  const gupta = (tags) => contact({ id: 'c-500', email: 'gupta@example.com', tags });
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)]), gupta([tag(TURNS)])]);

  const renamed = 'petite turns & jumps (kai/th-4pm)';
  const p = await preview(db, [ALVAREZ([tag(MINI_JAZZ), renamed]), gupta([renamed])]);
  assert.deepEqual(p.whole_class_drops.map((w) => [w.class_name, w.dropping, w.families]), [['Petite Turns & Jumps', 2, 2]]);
});

test('known limit: a class only one family in the file is tagged for is never called out — a rename looks like a leaver', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  await enrol(db, maya, cls[TURNS]);
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])]);
  const p = await preview(db, [ALVAREZ([tag(MINI_JAZZ), 'petite turns & jumps (kai/th-4pm)'])]);
  assert.equal(p.counts.drops, 1);
  assert.deepEqual(p.whole_class_drops, []);
});

test('review: the whole-class warning counts only families in the file', async () => {
  const s = await studio();
  const a = await household(s.db, 'c-100', 'alvarez@example.com', 'Alvarez');
  const maya = await dancer(s.db, a, 'Maya', 'Alvarez', '2019-03-02');
  const b = await household(s.db, 'c-500', 'gupta@example.com', 'Gupta');
  const eli = await dancer(s.db, b, 'Eli', 'Gupta', '2018-01-01');
  const c = await household(s.db, 'c-600', 'haddad@example.com', 'Haddad');
  const omar = await dancer(s.db, c, 'Omar', 'Haddad', '2018-05-01');
  await enrol(s.db, maya, s.cls[TURNS]);
  await enrol(s.db, eli, s.cls[TURNS]);
  await enrol(s.db, omar, s.cls[TURNS]);
  const haddad = (tags) => contact({ id: 'c-600', email: 'haddad@example.com', tags });
  await recordStart(s.db, [ALVAREZ([tag(TURNS)]), contact({ id: 'c-500', email: 'gupta@example.com', tags: [tag(TURNS)] }),
    haddad([tag(TURNS)])]);
  // Renamed in Enrolio; Gupta happens to be missing from this export.
  const renamed = 'petite turns & jumps (kai/th-4pm)';
  const p = await preview(s.db, [ALVAREZ([renamed]), haddad([renamed])]);
  assert.deepEqual(p.whole_class_drops.map((w) => [w.dropping, w.families]), [[2, 2]]);
});

// ------------------------------------------------------------------- guards

test('a dancer marked in today\'s class is not dropped as of yesterday — that place is held', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  await mark(db, maya, cls[MINI_JAZZ], await session(db, cls[MINI_JAZZ], '2026-10-01'), 'absent');

  const file = [ALVAREZ([tag(TURNS)])];
  const p = await preview(db, file);
  assert.deepEqual(p.blocked, []);
  assert.deepEqual(p.drops, []);
  assert.deepEqual(p.held_drops.map((h) => [h.reason, h.student_name, h.on]),
    [['marked_after_drop_day', 'Maya Alvarez', '2026-10-01']]);
  // The rest of the file goes through; the held place stays, and stays remembered.
  const done = await sync(db, file, 'apply', p.plan_hash);
  assert.deepEqual([done.counts.adds, done.counts.drops], [1, 0]);
  assert.equal((await enrolments(db)).find((e) => e.class === tag(MINI_JAZZ)).status, 'active');

  // Tomorrow the drop day is today, and the mark sits inside the window.
  await setToday(db, '2026-10-02');
  const next = await apply(db, file);
  assert.deepEqual([next.counts.adds, next.counts.drops, next.counts.held_drops], [0, 1, 0]);
  assert.equal((await enrolments(db)).find((e) => e.class === tag(MINI_JAZZ)).dropped_on, '2026-10-01');
});

test('a drop that would match two active places is held, not guessed — and the rest goes through', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  await enrol(db, maya, cls[MINI_JAZZ], { season: '2025-2026', on: '2025-09-01' });
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);

  const file = [ALVAREZ([tag(TURNS)])];
  const p = await preview(db, file);
  assert.deepEqual(p.blocked, []);
  assert.deepEqual(p.drops, []);
  assert.deepEqual(p.held_drops.map((h) => [h.reason, h.student_name]), [['several_active_places', 'Maya Alvarez']]);
  assert.deepEqual(names(p.adds), ['Maya Alvarez → Petite Turns & Jumps']);
  await sync(db, file, 'apply', p.plan_hash);
  assert.deepEqual((await enrolments(db)).filter((e) => e.class === tag(MINI_JAZZ)).map((e) => e.status), ['active', 'active']);

  // Once the extra place is ended by hand, the next sync drops the other.
  await db.query(`update portal_enrollments set status = 'dropped', dropped_on = '2026-06-01' where season = '2025-2026'`);
  await setToday(db, '2026-10-02');
  assert.deepEqual(names((await preview(db, file)).drops), ['Maya Alvarez → Mini Jazz 1']);
});

test('a place added today is not dropped as of yesterday — it is held', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  await apply(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])]);

  const p = await preview(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  assert.deepEqual(p.blocked, []);
  assert.deepEqual(p.held_drops.map((h) => [h.reason, h.on]), [['starts_after_drop_day', '2026-10-01']]);
});

test('review: an export whose Tags came out empty is refused, not a mass drop', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  await enrol(db, maya, cls[TURNS]);
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])]);
  const file = [ALVAREZ([])];
  const p = await preview(db, file);
  assert.deepEqual(p.blocked.map((b) => b.reason), ['no_class_tags']);
  await assert.rejects(() => sync(db, file, 'apply', p.plan_hash), /no class tags at all/);
});

test('review: a large drop must be confirmed', async () => {
  const s = await studio();
  const file = [];
  for (let i = 0; i < 21; i++) {
    const hh = await household(s.db, `c-${i}`, `f${i}@example.com`, `Family${i}`);
    const kid = await dancer(s.db, hh, `Kid${i}`, `Family${i}`, '2019-01-01');
    await enrol(s.db, kid, s.cls[MINI_JAZZ]);
    file.push(contact({ id: `c-${i}`, email: `f${i}@example.com`, tags: [tag(MINI_JAZZ)], row: i + 2 }));
  }
  await recordStart(s.db, file);
  // Everyone leaves Mini Jazz at once, and tags Open Tap instead.
  const leaving = file.map((c) => ({ ...c, tags: [tag(OPEN_TAP)] }));
  const p = await preview(s.db, leaving);
  assert.equal(p.counts.drops, 21);
  assert.equal(p.confirm_drops, true);
  await assert.rejects(() => sync(s.db, leaving, 'apply', p.plan_hash), /drops 21 places/);
  const done = await sync(s.db, leaving, 'apply', p.plan_hash, true);
  assert.equal(done.applied, true);
});

// ------------------------------------------------------------------ staleness

test('apply refuses a preview that the rosters or the calendar have moved past', async () => {
  const { db, cls } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  const file = [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])];

  const p = await preview(db, file);
  // Someone else's sync, or a hand edit, lands in between.
  const { rows: [other] } = await db.query(`select id from portal_students where first_name = 'Maya'`);
  await enrol(db, other.id, cls[TURNS], { on: '2026-10-01' });
  await assert.rejects(() => sync(db, file, 'apply', p.plan_hash), /changed since this preview/);

  const q = await preview(db, [ALVAREZ([tag(MINI_JAZZ), tag(OPEN_TAP)])]);
  await setToday(db, '2026-10-02');
  await assert.rejects(() => sync(db, [ALVAREZ([tag(MINI_JAZZ), tag(OPEN_TAP)])], 'apply', q.plan_hash),
    /changed since this preview/);
});

test('review: a class season changed between preview and apply is refused', async () => {
  const { db, cls } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  const file = [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])];
  const p = await preview(db, file);
  await db.query(`update portal_classes set season = '2027-2028' where id = $1`, [cls[TURNS]]);
  await assert.rejects(() => sync(db, file, 'apply', p.plan_hash), /changed since this preview/);
});

test('review: a week with no roster change still saves what changed in the tags', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  // The office enrols Maya in Turns by hand; Enrolio adds the tag.
  await enrol(db, maya, cls[TURNS], { on: '2026-10-01' });
  await setToday(db, '2026-10-05');
  const week1 = [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])];
  const p1 = await preview(db, week1);
  assert.equal(p1.counts.adds + p1.counts.drops + p1.counts.new_families, 0);
  assert.deepEqual(p1.memory_changes, { added: 1, removed: 0, families_seen: 0 });
  await sync(db, week1, 'apply', p1.plan_hash);

  // Maya leaves Turns; Enrolio removes the tag — now a drop, not a miss.
  await setToday(db, '2026-10-12');
  const p2 = await preview(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  assert.deepEqual(names(p2.drops), ['Maya Alvarez → Petite Turns & Jumps']);
});

test('review: a sticky tag removed in a quiet week is forgotten, so a real re-join later shows', async () => {
  const { db } = await oneDancerFamily();
  // The starting point carries a Turns tag nobody takes.
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])]);
  await setToday(db, '2026-10-05');
  // Enrolio finally removes it: nothing to add or drop, one tag to forget.
  const quiet = [ALVAREZ([tag(MINI_JAZZ)])];
  const p1 = await preview(db, quiet);
  assert.equal(p1.counts.adds + p1.counts.drops, 0);
  assert.deepEqual(p1.memory_changes, { added: 0, removed: 1, families_seen: 0 });
  await sync(db, quiet, 'apply', p1.plan_hash);

  // Weeks later Maya really joins Turns, and Enrolio tags the family again.
  await setToday(db, '2026-10-12');
  const p2 = await preview(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])]);
  assert.deepEqual(names(p2.adds), ['Maya Alvarez → Petite Turns & Jumps']);
});

test('review: the run log, not the activity log, says when the last sync was', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  // Any signed-in user can write activity rows.
  await signIn(db, TEACHER);
  await db.query(`select public.log_activity('enrollments_imported', 'enrollment', null, 'x', '{"as_of":"2099-12-31"}'::jsonb, 'success')`);
  await signIn(db, ADMIN);
  assert.equal((await preview(db, [ALVAREZ([tag(MINI_JAZZ)])])).last_sync_on, '2026-10-01');
});

// ---------------------------------------------------- the second review (v69)

test('second review: a large addition must be confirmed, like a large drop', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  // The wrong export: past families the app never had, each with an old tag.
  const all = [ALVAREZ([tag(MINI_JAZZ)])].concat(Array.from({ length: 12 }, (_, i) => contact({
    id: `old-${i}`, email: `past${i}@example.com`, students: [`Kid${i} Past${i}`], tags: [tag(OPEN_TAP)], row: i + 3,
  })));
  const p = await preview(db, all);
  assert.deepEqual([p.counts.new_families, p.counts.adds, p.confirm_adds, p.confirm_drops], [12, 12, true, false]);
  await assert.rejects(() => sync(db, all, 'apply', p.plan_hash), /This sync adds 12 places and creates 12 new families\. Tick the confirmation/);
  assert.equal((await db.query(`select count(*)::int as n from portal_households`)).rows[0].n, 1);

  const done = await sync(db, all, 'apply', p.plan_hash, true);
  assert.equal(done.counts.new_families, 12);
});

test('pinned: a tenth of the places needs at least five drops before it asks', async () => {
  const s = await studio();
  const file = [];
  for (let i = 0; i < 5; i++) {
    const hh = await household(s.db, `c-${i}`, `f${i}@example.com`, `F${i}`);
    const kid = await dancer(s.db, hh, `Kid${i}`, `F${i}`, '2019-01-01');
    await enrol(s.db, kid, s.cls[MINI_JAZZ]);
    await enrol(s.db, kid, s.cls[OPEN_TAP]);
    file.push(contact({ id: `c-${i}`, email: `f${i}@example.com`, tags: [tag(MINI_JAZZ), tag(OPEN_TAP)], row: i + 2 }));
  }
  await recordStart(s.db, file);
  const leaving = (n) => file.map((c, i) => (i < n ? { ...c, tags: [tag(OPEN_TAP)] } : c));
  assert.equal((await preview(s.db, leaving(4))).confirm_drops, false); // 4 of 10 places
  assert.equal((await preview(s.db, leaving(5))).confirm_drops, true);  // 5 of 10
});

test('second review: the name rule — same first name, surname a middle name, a part or a letter or two away', async () => {
  const { db } = await studio();
  const close = async (name, first, last) =>
    (await db.query(`select public.portal_enrollment_name_close($1, $2, $3) as ok`, [name, first, last])).rows[0].ok;
  assert.equal(await close('Ana Maria Lopez', 'Ana', 'Lopez'), true);        // a middle name
  assert.equal(await close('Ana Lopez Garcia', 'Ana', 'Lopez'), true);       // a second surname
  assert.equal(await close('Ana Lopez-Garcia', 'Ana', 'Lopez'), true);       // ...hyphenated
  assert.equal(await close('Ana Lopez', 'Ana', 'Lopez-Garcia'), true);       // one of two surnames
  assert.equal(await close('Ana Lopez-Garcia', 'Ana', 'Lopez Garcia'), true);
  assert.equal(await close('Ana Lopes', 'Ana', 'Lopez'), true);              // a letter
  assert.equal(await close('Ana Lpez', 'Ana', 'Lopez'), true);
  assert.equal(await close('Ana Lu', 'Ana', 'Li'), true);                    // a short surname: one letter
  assert.equal(await close('Ana Wu', 'Ana', 'Li'), false);                   // ...two is another name
  assert.equal(await close('Ana Ruiz', 'Ana', 'Lopez'), false);              // another surname
  assert.equal(await close('Eva Lopez', 'Ana', 'Lopez'), false);             // another first name
  assert.equal(await close('Ana', 'Ana', 'Lopez'), false);                   // nothing to compare
  const distance = async (a, b) =>
    (await db.query(`select public.portal_enrollment_edit_distance($1, $2) as d`, [a, b])).rows[0].d;
  assert.deepEqual([await distance('kitten', 'sitting'), await distance('', 'abc'), await distance('same', 'same')], [3, 3, 0]);
});

test('second review: a dancer spelled a little differently in Enrolio is still that dancer, and it is listed', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(OPEN_TAP)])]);
  for (const spelled of ['Maya Lucia Alvarez', 'Maya Alvares', 'Maya Alvarez Ruiz', 'Maya Alvarez-Ruiz']) {
    const p = await preview(db, [ALVAREZ([tag(OPEN_TAP), tag(TURNS)], { students: [spelled] })]);
    assert.deepEqual(names(p.adds), ['Maya Alvarez → Petite Turns & Jumps'], spelled);
    assert.deepEqual(p.spelling_matches.map((m) => [m.export_name, m.dancer]), [[spelled, 'Maya Alvarez']], spelled);
  }
});

test('second review: a first name spelled differently still waits for a person, shown with its likely dancer', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(OPEN_TAP)])]);
  const p = await preview(db, [ALVAREZ([tag(OPEN_TAP), tag(TURNS)], { students: ['Mya Alvarez'] })]);
  assert.deepEqual(p.adds, []);
  assert.deepEqual(p.unassigned.map((u) => [u.reason, u.unknown_names]),
    [['export_names_unknown_dancer', [{ name: 'Mya Alvarez', likely: 'Maya Alvarez' }]]]);
  assert.deepEqual(p.spelling_matches, []);
});

test('third review: a dancer marked inactive, named in All Students, holds the family\'s new classes — not given to a sibling', async () => {
  const { db, hh } = await oneDancerFamily(); // Maya, 7
  const tomas = await dancer(db, hh, 'Tomas', 'Alvarez', '2016-03-02'); // 10, stopped last year
  await db.query(`update portal_students set status = 'inactive' where id = $1`, [tomas]);
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);

  // Junior Ballet (8–11) is surely Tomas's, back again — not Maya's, a year under.
  for (const students of [['Maya Alvarez', 'Tomas Alvarez'], ['Tomas Alvarez']]) {
    const p = await preview(db, [ALVAREZ([tag(MINI_JAZZ), tag(JUNIOR_BALLET)], { students })]);
    assert.deepEqual(p.adds, [], students.join());
    assert.deepEqual(p.unassigned.map((u) => [u.reason, u.inactive_names, u.unknown_names]),
      [['export_names_inactive_dancer', [{ name: 'Tomas Alvarez', dancer: 'Tomas Alvarez' }], []]], students.join());
  }
});

test('second review: a one-dancer family\'s new class 3 or more years outside the dancer\'s age waits for a person', async () => {
  const s = await studio();
  const hh = await household(s.db, 'c-300', 'eriksen@example.com', 'Eriksen');
  await dancer(s.db, hh, 'Ingrid', 'Eriksen', '2013-04-04'); // 13
  await recordStart(s.db, [contact({ id: 'c-300', email: 'eriksen@example.com', tags: [tag(TEEN_HIPHOP)] })]);

  const p = await preview(s.db, [contact({ id: 'c-300', email: 'eriksen@example.com',
    tags: [tag(TEEN_HIPHOP), tag(JUNIOR_BALLET), tag(TURNS), tag(MINI_JAZZ), tag(OPEN_TAP)] })]);
  // Junior Ballet (8–11) is 2 years off and Open Tap has no range: hers, as the
  // office would place her. Turns (6–9, 4 off) and Mini Jazz (5–7, 6 off) are
  // more likely a child the app does not have yet.
  assert.deepEqual(names(p.adds), ['Ingrid Eriksen → Junior Ballet 2', 'Ingrid Eriksen → Open Tap']);
  assert.deepEqual(p.unassigned.map((u) => [u.class_name, u.reason, u.dancers]), [
    ['Mini Jazz 1', 'only_dancer_outside_age_range', [{ name: 'Ingrid Eriksen', age: 13 }]],
    ['Petite Turns & Jumps', 'only_dancer_outside_age_range', [{ name: 'Ingrid Eriksen', age: 13 }]],
  ]);
});

test('pinned: with no birthday on file, the one dancer still takes a new class', async () => {
  const s = await studio();
  const hh = await household(s.db, 'c-300', 'eriksen@example.com', 'Eriksen');
  await dancer(s.db, hh, 'Ingrid', 'Eriksen', null);
  await recordStart(s.db, [contact({ id: 'c-300', email: 'eriksen@example.com', tags: [tag(TEEN_HIPHOP)] })]);
  const p = await preview(s.db, [contact({ id: 'c-300', email: 'eriksen@example.com', tags: [tag(TEEN_HIPHOP), tag(MINI_JAZZ)] })]);
  assert.deepEqual(names(p.adds), ['Ingrid Eriksen → Mini Jazz 1']);
});

test('second review: a family first seen with no class tag is saved as seen, so its next real class is placed', async () => {
  const s = await studio();
  const a = await household(s.db, 'c-100', 'alvarez@example.com', 'Alvarez');
  await dancer(s.db, a, 'Maya', 'Alvarez', '2019-03-02');
  const g = await household(s.db, 'c-500', 'gupta@example.com', 'Gupta');
  await dancer(s.db, g, 'Eli', 'Gupta', '2016-01-01'); // 10
  // Gupta was on a break, and absent from the starting-point file.
  await recordStart(s.db, [ALVAREZ([tag(MINI_JAZZ)])]);

  // Back in the export with no class tag yet: nothing to place, one family to see.
  await setToday(s.db, '2026-10-05');
  const week1 = [ALVAREZ([tag(MINI_JAZZ)]), contact({ id: 'c-500', email: 'gupta@example.com', tags: ['current family'] })];
  const p1 = await preview(s.db, week1);
  assert.equal(p1.counts.adds + p1.counts.drops + p1.counts.new_families, 0);
  assert.deepEqual(p1.memory_changes, { added: 0, removed: 0, families_seen: 1 });
  assert.equal(p1.counts.memory_changes, 1);
  await sync(s.db, week1, 'apply', p1.plan_hash);

  // Eli really joins Junior Ballet.
  await setToday(s.db, '2026-10-12');
  const p2 = await preview(s.db, [ALVAREZ([tag(MINI_JAZZ)]),
    contact({ id: 'c-500', email: 'gupta@example.com', tags: [tag(JUNIOR_BALLET)] })]);
  assert.deepEqual(p2.first_seen_families, []);
  assert.deepEqual(names(p2.adds), ['Eli Gupta → Junior Ballet 2']);
});

test('second review: a dancer back in a class a season later is placed — last season\'s place covers its marks', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  // Last season Maya took Turns (the same class row: v50 updates a class in
  // place), completed it, and was marked while she held it.
  await enrol(db, maya, cls[TURNS], { season: '2025-2026', on: '2025-09-01', status: 'completed', dropped: '2026-06-01' });
  await mark(db, maya, cls[TURNS], await session(db, cls[TURNS], '2025-10-06'));
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);

  const p = await preview(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])]);
  assert.deepEqual(p.conflicts, []);
  assert.deepEqual(names(p.adds), ['Maya Alvarez → Petite Turns & Jumps']);
});

test('second review: a place not started yet whose tag is gone is held — another family\'s place still goes through', async () => {
  const s = await studio();
  const a = await household(s.db, 'c-100', 'alvarez@example.com', 'Alvarez');
  const maya = await dancer(s.db, a, 'Maya', 'Alvarez', '2019-03-02');
  await enrol(s.db, maya, s.cls[TURNS], { on: '2026-11-02' }); // registered ahead
  const g = await household(s.db, 'c-500', 'gupta@example.com', 'Gupta');
  await dancer(s.db, g, 'Eli', 'Gupta', '2016-01-01'); // 10
  await recordStart(s.db, [ALVAREZ([tag(TURNS)]), contact({ id: 'c-500', email: 'gupta@example.com', tags: [tag(OPEN_TAP)] })]);

  const file = [ALVAREZ([]), contact({ id: 'c-500', email: 'gupta@example.com', tags: [tag(OPEN_TAP), tag(JUNIOR_BALLET)] })];
  await setToday(s.db, '2026-10-15');
  const p = await preview(s.db, file);
  assert.deepEqual(p.blocked, []);
  assert.deepEqual(p.held_drops.map((h) => [h.reason, h.on]), [['starts_after_drop_day', '2026-11-02']]);
  assert.deepEqual(names(p.adds), ['Eli Gupta → Junior Ballet 2']);
  await sync(s.db, file, 'apply', p.plan_hash);

  // Still remembered: once the place has begun, a sync drops it.
  await setToday(s.db, '2026-11-09');
  assert.deepEqual(names((await preview(s.db, file)).drops), ['Maya Alvarez → Petite Turns & Jumps']);
});

test('second review: a mark made after the preview holds its drop, and the preview is refused as stale', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  const file = [ALVAREZ([tag(OPEN_TAP)])];
  const p = await preview(db, file);
  assert.equal(p.counts.drops, 1);
  await mark(db, maya, cls[MINI_JAZZ], await session(db, cls[MINI_JAZZ], '2026-10-01'));
  await assert.rejects(() => sync(db, file, 'apply', p.plan_hash), /changed since this preview/);
  assert.equal((await enrolments(db)).find((e) => e.class === tag(MINI_JAZZ)).status, 'active');
});

test('second review: a place added by hand without a tag does not silence the whole-class warning', async () => {
  const s = await studio();
  const a = await household(s.db, 'c-100', 'alvarez@example.com', 'Alvarez');
  const maya = await dancer(s.db, a, 'Maya', 'Alvarez', '2019-03-02');
  const g = await household(s.db, 'c-500', 'gupta@example.com', 'Gupta');
  const eli = await dancer(s.db, g, 'Eli', 'Gupta', '2018-01-01');
  const h = await household(s.db, 'c-600', 'haddad@example.com', 'Haddad');
  const omar = await dancer(s.db, h, 'Omar', 'Haddad', '2018-05-01');
  for (const kid of [maya, eli, omar]) await enrol(s.db, kid, s.cls[TURNS]);
  // Haddad was placed by hand and never tagged for Turns.
  const haddad = contact({ id: 'c-600', email: 'haddad@example.com', tags: [tag(OPEN_TAP)] });
  await recordStart(s.db, [ALVAREZ([tag(TURNS)]), contact({ id: 'c-500', email: 'gupta@example.com', tags: [tag(TURNS)] }), haddad]);

  // Renamed in Enrolio: every tagged family loses the old title at once.
  const renamed = 'petite turns & jumps (kai/th-4pm)';
  const p = await preview(s.db, [ALVAREZ([renamed]), contact({ id: 'c-500', email: 'gupta@example.com', tags: [renamed] }), haddad]);
  assert.equal(p.counts.drops, 2);
  assert.deepEqual(p.whole_class_drops.map((w) => [w.class_name, w.dropping]), [['Petite Turns & Jumps', 2]]);
});

test('second review: a title shared by switched-off classes only is refused in words that fit', async () => {
  const { db } = await oneDancerFamily();
  await db.query(`insert into portal_classes (name, external_class_id, season, is_active)
                  values ('Old Jazz', 'old jazz (x/m-5pm)', '2025-2026', false), ('Old Jazz', 'old jazz (x/m-5pm)', '2024-2025', false)`);
  const file = [ALVAREZ([tag(MINI_JAZZ), 'old jazz (x/m-5pm)'])];
  const p = await preview(db, file);
  assert.deepEqual(p.blocked.map((b) => [b.reason, b.detail]), [['duplicate_class_title', 'old jazz (x/m-5pm)']]);
  await assert.rejects(() => sync(db, file, 'baseline', p.baseline_hash),
    (e) => !/two active|none is/i.test(e.message) && /keep exactly one of them switched on/.test(e.message));
});

test('third review: the name rule wants the whole first name, and no initial or particle as a surname', async () => {
  const { db } = await studio();
  const close = async (name, first, last) =>
    (await db.query(`select public.portal_enrollment_name_close($1, $2, $3) as ok`, [name, first, last])).rows[0].ok;
  assert.equal(await close('Mary Kate Smith', 'Mary-Kate', 'Smith'), true);   // the whole first name, spaced
  assert.equal(await close('Mary-Kate Smyth', 'Mary-Kate', 'Smith'), true);
  assert.equal(await close('Mary Smith', 'Mary-Kate', 'Smith'), false);       // a first word is not a first name
  assert.equal(await close('Mary Anne Smith', 'Mary Kate', 'Smith'), false);  // ...nor a sibling's
  assert.equal(await close('Ana L Garcia', 'Ana', 'Li'), false);              // an initial is not a surname
  assert.equal(await close('Ana J Smith', 'Ana', 'L'), false);
  assert.equal(await close('Ana De Leon', 'Ana', 'De La Cruz'), false);       // nor is a particle
  assert.equal(await close('Ana Cruz', 'Ana', 'De La Cruz'), true);           // the surname's own part is
  assert.equal(await close('Ana Delacruz', 'Ana', 'De La Cruz'), true);
  const key = async (v) => (await db.query(`select public.portal_enrollment_name_key($1) as k`, [v])).rows[0].k;
  assert.deepEqual([await key('Zoë  Núñez'), await key('ÉLODIE O&rsquo;Brien'), await key("Liam O'Brien*")],
    ['zoenunez', 'elodieobrien', 'liamobrien']);
});

test('third review: a sister listed beside her sibling is not that sibling with a middle name', async () => {
  const s = await studio();
  const hh = await household(s.db, 'c-100', 'smith@example.com', 'Smith');
  await dancer(s.db, hh, 'Mary', 'Smith', '2018-01-01'); // 8
  const family = (students, tags) => contact({ id: 'c-100', email: 'smith@example.com', students, tags });
  await recordStart(s.db, [family([], [tag(OPEN_TAP)])]);

  const p = await preview(s.db, [family(['Mary Smith', 'Mary Kate Smith'], [tag(OPEN_TAP), tag(TURNS)])]);
  assert.deepEqual(p.adds, []);
  assert.deepEqual(p.spelling_matches, []);
  assert.deepEqual(p.unassigned.map((u) => [u.reason, u.unknown_names]),
    [['export_names_unknown_dancer', [{ name: 'Mary Kate Smith', likely: null }]]]);
  // Alone, the same spelling is still Mary with a middle name.
  const q = await preview(s.db, [family(['Mary Kate Smith'], [tag(OPEN_TAP), tag(TURNS)])]);
  assert.deepEqual(names(q.adds), ['Mary Smith → Petite Turns & Jumps']);
});

test('third review: more particles are not surnames, and more letters are folded', async () => {
  const { db } = await studio();
  const close = async (name, first, last) =>
    (await db.query(`select public.portal_enrollment_name_close($1, $2, $3) as ok`, [name, first, last])).rows[0].ok;
  assert.equal(await close('Ana San Juan', 'Ana', 'San Martin'), false);
  assert.equal(await close('Ana Della Rosa', 'Ana', 'Della Vecchia'), false);
  const key = async (v) => (await db.query(`select public.portal_enrollment_name_key($1) as k`, [v])).rows[0].k;
  assert.deepEqual([await key('Čeněk Novák'), await key('Łukasz Śmigły'), await key('Æsa Strauß'), await key('İlkay Ğüneş')],
    ['ceneknovak', 'lukaszsmigly', 'aesastrauss', 'ilkaygunes']);
});

test('third review: an accent in one spelling and not the other is the same dancer', async () => {
  const s = await studio();
  const hh = await household(s.db, 'c-100', 'alvarez@example.com', 'Alvarez');
  await dancer(s.db, hh, 'Zoë', 'Alvarez', '2019-03-02');
  await recordStart(s.db, [ALVAREZ([tag(OPEN_TAP)])]);
  const p = await preview(s.db, [ALVAREZ([tag(OPEN_TAP), tag(MINI_JAZZ)], { students: ['Zoe Alvarez'] })]);
  assert.deepEqual(names(p.adds), ['Zoë Alvarez → Mini Jazz 1']);
});

test('third review: a likely match is never a dancer another name in the file already is', async () => {
  const { db } = await oneDancerFamily(); // Maya Alvarez
  await recordStart(db, [ALVAREZ([tag(OPEN_TAP)])]);
  // Maya is listed rightly; Mya is a new sister, not a misspelling of her.
  const p = await preview(db, [ALVAREZ([tag(OPEN_TAP), tag(TURNS)], { students: ['Maya Alvarez', 'Mya Alvarez'] })]);
  assert.deepEqual(p.adds, []);
  assert.deepEqual(p.unassigned.map((u) => u.unknown_names), [[{ name: 'Mya Alvarez', likely: null }]]);
});

test('third review: a mark before the start names the earliest one the place would have to cover', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  await mark(db, maya, cls[TURNS], await session(db, cls[TURNS], '2026-09-10'));
  await mark(db, maya, cls[TURNS], await session(db, cls[TURNS], '2026-09-24'));
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  const p = await preview(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])]);
  assert.deepEqual(p.conflicts.map((c) => [c.conflict, c.on]), [['marked_before_start', '2026-09-10']]);
});

test('third review: the whole-class warning is not raised for one ordinary leaver', async () => {
  const s = await studio();
  const a = await household(s.db, 'c-100', 'alvarez@example.com', 'Alvarez');
  const maya = await dancer(s.db, a, 'Maya', 'Alvarez', '2019-03-02');
  const h = await household(s.db, 'c-600', 'haddad@example.com', 'Haddad');
  const omar = await dancer(s.db, h, 'Omar', 'Haddad', '2018-05-01');
  await enrol(s.db, maya, s.cls[TURNS]);
  await enrol(s.db, omar, s.cls[TURNS]); // placed by hand, never tagged
  const haddad = contact({ id: 'c-600', email: 'haddad@example.com', tags: [tag(OPEN_TAP)] });
  await recordStart(s.db, [ALVAREZ([tag(TURNS)]), haddad]);

  const p = await preview(s.db, [ALVAREZ([tag(OPEN_TAP)]), haddad]);
  assert.equal(p.counts.drops, 1);
  assert.deepEqual(p.whole_class_drops, []);
});

test('third review: the whole-class warning counts dancers, with held places apart', async () => {
  const s = await studio();
  const a = await household(s.db, 'c-100', 'alvarez@example.com', 'Alvarez');
  const maya = await dancer(s.db, a, 'Maya', 'Alvarez', '2019-03-02');
  const g = await household(s.db, 'c-500', 'gupta@example.com', 'Gupta');
  const eli = await dancer(s.db, g, 'Eli', 'Gupta', '2018-01-01');
  await enrol(s.db, maya, s.cls[TURNS]);
  await enrol(s.db, maya, s.cls[TURNS], { season: '2025-2026', on: '2025-09-01' }); // two places: held
  await enrol(s.db, eli, s.cls[TURNS]);
  const gupta = (tags) => contact({ id: 'c-500', email: 'gupta@example.com', tags });
  await recordStart(s.db, [ALVAREZ([tag(TURNS)]), gupta([tag(TURNS)])]);

  const renamed = 'petite turns & jumps (kai/th-4pm)';
  const p = await preview(s.db, [ALVAREZ([renamed]), gupta([renamed])]);
  assert.deepEqual(p.whole_class_drops.map((w) => [w.class_name, w.dropping, w.held, w.families]),
    [['Petite Turns & Jumps', 1, 1, 2]]);
});

test('second review: running v69 again changes nothing', async () => {
  const { db } = await oneDancerFamily();
  const file = [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])];
  await recordStart(db, file);
  const before = await preview(db, file);
  await db.exec(V69);
  const after = await preview(db, file);
  assert.equal(after.plan_hash, before.plan_hash);
  assert.equal((await remembered(db)).length, 2);
});

// ------------------------------------------------ what must never move

test('apply leaves attendance, sessions, history and every past roster exactly as they were', async () => {
  const { db, cls, maya } = await oneDancerFamily();
  const hh = await household(db, 'c-200', 'boateng@example.com', 'Boateng');
  const eli = await dancer(db, hh, 'Eli', 'Boateng', '2020-05-01');
  const noor = await dancer(db, hh, 'Noor', 'Boateng', '2016-02-01');
  await enrol(db, maya, cls[TURNS]);
  await enrol(db, noor, cls[JUNIOR_BALLET]);
  await enrol(db, eli, cls[MINI_JAZZ]);

  // Four weeks of classes with marks and their history, and today's sessions
  // with nobody marked yet.
  for (const date of ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']) {
    for (const [title, kids] of [[MINI_JAZZ, [maya, eli]], [TURNS, [maya]], [JUNIOR_BALLET, [noor]]]) {
      const sid = await session(db, cls[title], date);
      for (const kid of kids) await mark(db, kid, cls[title], sid, date === '2026-09-14' ? 'absent' : 'present');
    }
  }
  for (const title of [MINI_JAZZ, TURNS, JUNIOR_BALLET, OPEN_TAP]) await session(db, cls[title], '2026-10-01');

  await recordStart(db, [
    ALVAREZ([tag(MINI_JAZZ), tag(TURNS)]),
    BOATENG([tag(MINI_JAZZ), tag(JUNIOR_BALLET)]),
  ]);

  const snapshot = async () => ({
    attendance: (await db.query(`select * from portal_attendance order by id`)).rows,
    sessions: (await db.query(`select * from portal_class_sessions order by id`)).rows,
    history: (await db.query(`select * from portal_attendance_history order by id`)).rows,
    pastRosters: (await db.query(
      `select s.id as session_id, e.student_id
         from portal_class_sessions s
         join portal_enrollments e on e.class_id = s.class_id
          and e.enrolled_on <= s.session_date and (e.dropped_on is null or e.dropped_on >= s.session_date)
        where s.session_date < '2026-10-01'
        order by 1, 2`)).rows,
    fingerprint: (await db.query(`select public.portal_attendance_fingerprint('2026-10-01') as f`)).rows[0].f,
  });
  const todaysRoster = async (title) => (await db.query(
    `select st.first_name from portal_enrollments e join portal_students st on st.id = e.student_id
      where e.class_id = $1 and e.enrolled_on <= '2026-10-01' and (e.dropped_on is null or e.dropped_on >= '2026-10-01')
      order by 1`, [cls[title]])).rows.map((r) => r.first_name);

  const before = await snapshot();
  assert.equal(before.attendance.length, 16);
  assert.equal(before.pastRosters.length, 16);

  const done = await apply(db, [
    // Maya leaves Turns & Jumps and takes up Open Tap.
    ALVAREZ([tag(MINI_JAZZ), tag(OPEN_TAP)]),
    // Noor leaves ballet; a Teen class admits neither sibling and waits.
    BOATENG([tag(MINI_JAZZ), tag(TEEN_HIPHOP)]),
    // A new family arrives with one dancer.
    contact({ id: 'c-600', email: 'haddad@example.com', students: ['Omar Haddad'], tags: [tag(TURNS)], row: 4 }),
  ]);
  assert.equal(done.applied, true);
  assert.equal(done.counts.adds, 2);
  assert.equal(done.counts.drops, 2);
  assert.equal(done.counts.unassigned, 1);

  const after = await snapshot();
  assert.deepEqual(after.attendance, before.attendance);
  assert.deepEqual(after.sessions, before.sessions);
  assert.deepEqual(after.history, before.history);
  assert.deepEqual(after.pastRosters, before.pastRosters);
  assert.deepEqual(after.fingerprint, before.fingerprint);
  assert.deepEqual(done.fingerprint.after, done.fingerprint.before);
  assert.equal(done.fingerprint.after.attendance.rows, 16);

  // Today's rosters are where the change shows.
  assert.deepEqual(await todaysRoster(TURNS), ['Omar']);
  assert.deepEqual(await todaysRoster(OPEN_TAP), ['Maya']);
  assert.deepEqual(await todaysRoster(JUNIOR_BALLET), []);
  assert.deepEqual(await todaysRoster(MINI_JAZZ), ['Eli', 'Maya']);
});

test('review: the fingerprint guard really stops an apply whose writes move attendance', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  await enrol(db, maya, cls[TURNS]);
  await mark(db, maya, cls[TURNS], await session(db, cls[TURNS], '2026-09-21'));
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])]);
  // Stand-in for any side effect nobody meant: a trigger that touches marks.
  await db.exec(`
    create function test_touch_marks() returns trigger language plpgsql as $$
    begin update public.portal_attendance set status = 'excused' where student_id = new.student_id; return new; end $$;
    create trigger test_touch_marks after update on public.portal_enrollments
      for each row execute function test_touch_marks();`);
  const file = [ALVAREZ([tag(MINI_JAZZ)])];
  const p = await preview(db, file);
  await assert.rejects(() => sync(db, file, 'apply', p.plan_hash), /Stopped: attendance or a past roster/);
  assert.equal((await db.query(`select status from portal_attendance`)).rows[0].status, 'present');
  assert.equal((await enrolments(db)).find((e) => e.class === tag(TURNS)).status, 'active');
});

test('review: a teacher\'s mark and a sync take the same lock, shared and exclusive', async () => {
  const { db, maya, cls } = await oneDancerFamily();
  const sid = await session(db, cls[MINI_JAZZ], '2026-10-01');
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  const key = (await db.query(`select hashtext('public.admin_enrollment_import')::bigint as k`)).rows[0].k;
  // PGlite is one connection, so the wait itself cannot be staged here; what
  // can be checked is that both sides take the same key in the right modes.
  const held = async (sql, params) => {
    await db.query('begin');
    await db.query(sql, params);
    const { rows } = await db.query(
      `select mode from pg_locks where locktype = 'advisory' and objid = ($1::bigint & 4294967295)::oid and pid = pg_backend_pid()`,
      [key]);
    await db.query('rollback');
    return rows.map((r) => r.mode);
  };
  assert.deepEqual(await held(`select public.staff_mark_attendance($1, $2::jsonb)`,
    [sid, JSON.stringify([{ student_id: maya, status: 'present' }])]), ['ShareLock']);
  const file = [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])];
  const p = await preview(db, file);
  assert.deepEqual(await held(`select public.admin_enrollment_import($1::jsonb, 'apply', $2, 'x')`,
    [JSON.stringify(file), p.plan_hash]), ['ExclusiveLock']);
});

test('apply is logged once, in its own transaction; a preview is not logged', async () => {
  const { db } = await oneDancerFamily();
  await recordStart(db, [ALVAREZ([tag(MINI_JAZZ)])]);
  const file = [ALVAREZ([tag(MINI_JAZZ), tag(TURNS)])];

  await preview(db, file);
  await apply(db, file);
  const { rows } = await db.query(`select user_id, action, entity_title, details from activity_logs order by created_at`);
  assert.deepEqual(rows.map((r) => r.action), ['enrollment_import_baseline', 'enrollments_imported']);
  assert.equal(rows[1].user_id, ADMIN);
  assert.equal(rows[1].entity_title, 'contacts.csv');
  assert.equal(rows[1].details.added, 1);
  assert.equal(rows[1].details.dropped, 0);
  const runs = (await db.query(`select mode, run_by from portal_enrollment_import_runs order by run_at`)).rows;
  assert.deepEqual(runs, [{ mode: 'baseline', run_by: ADMIN }, { mode: 'apply', run_by: ADMIN }]);
});
