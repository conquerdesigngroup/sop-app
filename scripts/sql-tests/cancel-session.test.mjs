/**
 * staff_cancel_session and staff_restore_session (v75), run against a real Postgres.
 *
 *   npm install --no-save @electric-sql/pglite
 *   npm run test:sql
 *
 * What is pinned here is what a mock cannot show: which dancers a cancellation
 * excuses (the roster ON THE DATE, not today's), that an earlier mark survives
 * in the history and comes back on undo, that undo leaves alone a mark a person
 * changed afterwards, and who is allowed to do either.
 *
 * STUBS. schema.sql's can_edit_portal_class() is admin-only, so the teacher
 * branch and portal_class_instructors are added below, in production's shape.
 *
 * Every dancer and address here is invented. The repo is public.
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
const V75 = read('supabase-migration-v75-cancel-class-excuses-roster.sql');

const ADMIN = '00000000-0000-4000-8000-00000000a001';
const TEACHER = '00000000-0000-4000-8000-00000000a002';
const OTHER_TEACHER = '00000000-0000-4000-8000-00000000a003';
const SUPER = '00000000-0000-4000-8000-00000000a004';

const STUBS = `
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
`;

const signIn = (db, id) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id ?? '']);

const studio = async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(STUBS);
  await db.exec(V75);
  await db.query(`select set_config('test.today', '2026-10-23', false)`);

  await db.query(
    `insert into profiles (id, email, role) values
       ($1, 'office@example.com', 'admin'), ($2, 'teacher@example.com', 'team'),
       ($3, 'other@example.com', 'team'), ($4, 'owner@example.com', 'super_admin')`,
    [ADMIN, TEACHER, OTHER_TEACHER, SUPER]);

  const cls = (await db.query(
    `insert into portal_classes (name, season) values ('Jr Ballet 2', '2026-2027') returning id`)).rows[0].id;
  await db.query(`insert into portal_class_instructors (class_id, profile_id) values ($1, $2)`, [cls, TEACHER]);

  const hh = (await db.query(
    `insert into portal_households (primary_email) values ('family@example.com') returning id`)).rows[0].id;
  const dancer = async (first, enrolled, dropped = null) => {
    const id = (await db.query(
      `insert into portal_students (household_id, first_name, last_name) values ($1, $2, 'Example') returning id`,
      [hh, first])).rows[0].id;
    await db.query(
      `insert into portal_enrollments (student_id, class_id, season, enrolled_on, dropped_on, status)
       values ($1, $2, '2026-2027', $3, $4, $5)`,
      [id, cls, enrolled, dropped, dropped ? 'dropped' : 'active']);
    return id;
  };

  const ada = await dancer('Ada', '2026-08-31');
  const bo = await dancer('Bo', '2026-08-31');
  const cleo = await dancer('Cleo', '2026-08-31');
  const late = await dancer('Late', '2026-10-15');             // joined after the date
  const gone = await dancer('Gone', '2026-08-31', '2026-10-01'); // left before the date

  const session = (await db.query(
    `insert into portal_class_sessions (class_id, session_date, status, source)
     values ($1, '2026-10-13', 'held', 'schedule') returning id`, [cls])).rows[0].id;

  return { db, cls, session, ada, bo, cleo, late, gone };
};

const mark = (db, session, cls, student, status) => db.query(
  `insert into portal_attendance (student_id, class_id, session_id, status, source)
   values ($1, $2, $3, $4, 'app')
   on conflict (student_id, session_id) do update set status = excluded.status`,
  [student, cls, session, status]);

const marks = async (db, session) => Object.fromEntries((await db.query(
  `select s.first_name, a.status from portal_attendance a join portal_students s on s.id = a.student_id
    where a.session_id = $1`, [session])).rows.map((r) => [r.first_name, r.status]));

const cancel = (db, session, note = null) =>
  db.query(`select public.staff_cancel_session($1, $2) as r`, [session, note]).then((x) => x.rows[0].r);
const restore = (db, session) =>
  db.query(`select public.staff_restore_session($1) as r`, [session]).then((x) => x.rows[0].r);

const refuses = async (promise, message) => {
  await assert.rejects(promise, (e) => {
    assert.match(e.message, message);
    return true;
  });
};

test('cancelling excuses everyone on the roster on that date, and nobody else', async () => {
  const { db, session } = await studio();
  await signIn(db, TEACHER);

  const r = await cancel(db, session, 'Power out');
  assert.deepEqual({ excused: r.excused, replaced: r.replaced, already: r.already }, { excused: 3, replaced: 0, already: 0 });
  // Late joined after the 13th and Gone left before it: neither was in that class that day.
  assert.deepEqual(await marks(db, session), { Ada: 'excused', Bo: 'excused', Cleo: 'excused' });

  const s = (await db.query(`select status, note from portal_class_sessions where id = $1`, [session])).rows[0];
  assert.deepEqual(s, { status: 'cancelled', note: 'Power out' });
});

test('an earlier mark is replaced, kept in the history, and counted as replaced', async () => {
  const { db, session, cls, ada, bo } = await studio();
  await mark(db, session, cls, ada, 'present');
  await mark(db, session, cls, bo, 'excused');
  await signIn(db, TEACHER);

  const r = await cancel(db, session);
  assert.deepEqual({ excused: r.excused, replaced: r.replaced, already: r.already }, { excused: 2, replaced: 1, already: 1 });

  const h = (await db.query(
    `select old_status, new_status, note, changed_by from portal_attendance_history where student_id = $1`, [ada])).rows;
  assert.deepEqual(h, [{ old_status: 'present', new_status: 'excused', note: 'class-cancelled', changed_by: TEACHER }]);
});

test('undo puts every mark back the way it was, including no mark at all', async () => {
  const { db, session, cls, ada, bo } = await studio();
  await mark(db, session, cls, ada, 'present');
  await mark(db, session, cls, bo, 'excused'); // excused before the cancellation: not the cancellation's to undo
  await signIn(db, TEACHER);
  await cancel(db, session, 'Snow day');

  const r = await restore(db, session);
  assert.equal(r.restored, 2); // Ada back to present, Cleo back to nothing
  assert.deepEqual(await marks(db, session), { Ada: 'present', Bo: 'excused' });

  const s = (await db.query(`select status, note from portal_class_sessions where id = $1`, [session])).rows[0];
  assert.deepEqual(s, { status: 'held', note: null });

  const removed = (await db.query(
    `select old_status, new_status, note from portal_attendance_history h join portal_students s on s.id = h.student_id
      where s.first_name = 'Cleo' order by changed_at`)).rows;
  assert.deepEqual(removed.at(-1), { old_status: 'excused', new_status: null, note: 'cancellation-undone' });
});

test('undo leaves alone a mark someone changed after the cancellation', async () => {
  const { db, session, cls, ada } = await studio();
  await signIn(db, TEACHER);
  await cancel(db, session);

  // An import (or the office) wrote Ada's mark after the cancellation.
  await mark(db, session, cls, ada, 'excused');
  await db.query(
    `insert into portal_attendance_history (student_id, class_id, session_id, old_status, new_status, source)
     values ($1, $2, $3, 'excused', 'excused', 'import')`, [ada, cls, session]);

  const r = await restore(db, session);
  assert.equal(r.kept, 1);
  assert.deepEqual(await marks(db, session), { Ada: 'excused' });
});

test('cancelling twice is harmless, and undo after it still restores', async () => {
  const { db, session, cls, ada } = await studio();
  await mark(db, session, cls, ada, 'late');
  await signIn(db, TEACHER);
  await cancel(db, session, 'First reason');

  const again = await cancel(db, session);
  assert.deepEqual({ excused: again.excused, already: again.already }, { excused: 0, already: 3 });
  // No reason given the second time keeps the first one.
  assert.equal((await db.query(`select note from portal_class_sessions where id = $1`, [session])).rows[0].note, 'First reason');

  await restore(db, session);
  assert.deepEqual(await marks(db, session), { Ada: 'late' });
});

test('a future date can be cancelled ahead of time', async () => {
  const { db, cls } = await studio();
  const next = (await db.query(
    `insert into portal_class_sessions (class_id, session_date, status, source)
     values ($1, '2026-11-24', 'held', 'schedule') returning id`, [cls])).rows[0].id;
  await signIn(db, TEACHER);
  const r = await cancel(db, next, 'Thanksgiving week');
  // Late enrolled 2026-10-15, so is on the roster by the 24th; Gone is not.
  assert.equal(r.excused, 4);
});

test('a teacher cannot cancel or restore someone else\'s class', async () => {
  const { db, session } = await studio();
  await signIn(db, OTHER_TEACHER);
  await refuses(cancel(db, session), /You do not teach this class/);

  await signIn(db, TEACHER);
  await cancel(db, session);
  await signIn(db, OTHER_TEACHER);
  await refuses(restore(db, session), /You do not teach this class/);
});

test('an admin may cancel any class', async () => {
  const { db, session } = await studio();
  await signIn(db, ADMIN);
  assert.equal((await cancel(db, session)).excused, 3);
});

test('signed out cannot cancel', async () => {
  const { db, session } = await studio();
  await signIn(db, null);
  await refuses(cancel(db, session), /You do not teach this class/);
});

test('restoring a class that was never cancelled is refused, not a silent no-op', async () => {
  const { db, session } = await studio();
  await signIn(db, TEACHER);
  await refuses(restore(db, session), /That class is not cancelled/);
});

test('with capture switched off only a super admin can cancel', async () => {
  const { db, session } = await studio();
  await db.query(`update portal_settings set attendance_capture_enabled = false`);
  await signIn(db, TEACHER);
  await refuses(cancel(db, session), /imported from Enrolio/);
  await signIn(db, SUPER);
  assert.equal((await cancel(db, session)).excused, 3);
});

test('an over-long reason is refused before anything changes', async () => {
  const { db, session } = await studio();
  await signIn(db, TEACHER);
  await refuses(cancel(db, session, 'x'.repeat(201)), /under 200 characters/);
  assert.equal((await db.query(`select status from portal_class_sessions where id = $1`, [session])).rows[0].status, 'held');
  assert.deepEqual(await marks(db, session), {});
});

const markRpc = (db, session, student, status) => db.query(
  `select public.staff_mark_attendance($1, $2::jsonb) as r`,
  [session, JSON.stringify([{ student_id: student, status }])]).then((x) => x.rows[0].r);

test('review: a cancelled date refuses new marks until it is undone, then takes them again', async () => {
  const { db, session, ada } = await studio();
  await signIn(db, TEACHER);
  await cancel(db, session);
  await refuses(markRpc(db, session, ada, 'present'), /marked cancelled/);

  await restore(db, session);
  assert.equal((await markRpc(db, session, ada, 'present')).written, 1);
  assert.deepEqual(await marks(db, session), { Ada: 'present' });
});

test('review: staff_mark_attendance reads the session FOR SHARE, and both new functions take the sync lock', async () => {
  const { db } = await studio();
  const def = async (sig) => (await db.query(`select pg_get_functiondef($1::regprocedure) as d`, [sig])).rows[0].d;
  assert.match(await def('public.staff_mark_attendance(uuid,jsonb)'), /FOR SHARE/);
  for (const sig of ['public.staff_cancel_session(uuid,text)', 'public.staff_restore_session(uuid)']) {
    assert.match(await def(sig), /pg_advisory_xact_lock_shared\(hashtext\('public\.admin_enrollment_import'\)\)/);
  }
});
