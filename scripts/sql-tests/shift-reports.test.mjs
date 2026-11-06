/**
 * Shift reports (v77), run against a real Postgres.
 *
 *   npm install --no-save @electric-sql/pglite
 *   npm run test:sql
 *
 * Who may read, write, edit, tag, chat and archive is decided entirely by
 * v77's policies, trigger and two functions, so this runs them for real.
 * Each test SETs ROLE to `authenticated` with a JWT subject, because PGlite's
 * own session is a superuser and would skip every policy.
 *
 * Every name and email here is invented. The repo is public.
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
const V77 = read('supabase-migration-v77-shift-reports.sql');

const GM = '00000000-0000-4000-8000-00000000c001';      // admin
const OPENER = '00000000-0000-4000-8000-00000000c002';  // team
const CLOSER = '00000000-0000-4000-8000-00000000c003';  // team
const GONE = '00000000-0000-4000-8000-00000000c004';    // team, switched off
const PARENT = '00000000-0000-4000-8000-00000000c005';  // client

// What production has and schema.sql does not.
const STUBS = `
  create or replace function public.is_active_staff() returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.profiles where id = auth.uid()
      and is_active is not false and role in ('super_admin','admin','team'));
  $$;
  create or replace function public.update_updated_at_column() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  end $$;
  grant authenticated to current_user;
  grant usage on schema public to authenticated;
  grant select on public.profiles to authenticated;
`;

const as = async (db, id, fn) => {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id ?? '']);
  await db.exec('set role authenticated');
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
  await db.exec(V77);
  await db.query(
    `insert into profiles (id, email, role, is_active) values
       ($1, 'gm@example.com', 'admin', true), ($2, 'opener@example.com', 'team', true),
       ($3, 'closer@example.com', 'team', true), ($4, 'gone@example.com', 'team', false),
       ($5, 'parent@example.com', 'client', true)`,
    [GM, OPENER, CLOSER, GONE, PARENT]);
  return db;
};

const write = (db, author, body = 'Mopped studio B. Front door lock sticks.', type = 'closing') =>
  as(db, author, () => db.query(
    `insert into shift_reports (author_id, shift_type, body) values ($1, $2, $3) returning id`,
    [author, type, body])).then((r) => r.rows[0].id);

const refuses = (promise, message = /./) =>
  assert.rejects(promise, (e) => { assert.match(e.message, message); return true; });

test('v77 runs twice without change', async () => {
  const db = await studio();
  await db.exec(V77);
  const { rows } = await db.query(
    `select count(*)::int as n from pg_policies where tablename like 'shift_report%'`);
  assert.equal(rows[0].n, 9);
});

test('staff write as themselves; everyone on staff reads; a parent reads nothing', async () => {
  const db = await studio();
  const id = await write(db, CLOSER);
  await refuses(as(db, OPENER, () => db.query(
    `insert into shift_reports (author_id, shift_type, body) values ($1, 'opening', 'x')`, [CLOSER])),
  /row-level security/);
  await refuses(as(db, PARENT, () => db.query(
    `insert into shift_reports (author_id, shift_type, body) values ($1, 'opening', 'x')`, [PARENT])),
  /row-level security/);

  for (const who of [GM, OPENER, CLOSER]) {
    const { rows } = await as(db, who, () => db.query(`select id from shift_reports`));
    assert.deepEqual(rows.map((r) => r.id), [id]);
  }
  for (const who of [PARENT, GONE]) {
    const { rows } = await as(db, who, () => db.query(`select id from shift_reports`));
    assert.equal(rows.length, 0);
  }
});

test('the type is opening or closing, and an empty report is refused', async () => {
  const db = await studio();
  await refuses(write(db, OPENER, 'x', 'midday'), /check constraint/);
  await refuses(write(db, OPENER, '   '), /check constraint/);
});

test('the author edits their own report; nobody else can, and the author cannot archive it', async () => {
  const db = await studio();
  const id = await write(db, CLOSER);
  await as(db, CLOSER, () => db.query(`update shift_reports set body = 'Fixed typo' where id = $1`, [id]));
  const r = await as(db, OPENER, () => db.query(`update shift_reports set body = 'Hijack' where id = $1`, [id]));
  assert.equal(r.affectedRows, 0);
  await refuses(as(db, CLOSER, () => db.query(
    `update shift_reports set archived_at = now() where id = $1`, [id])), /Only an admin/);
  await refuses(as(db, CLOSER, () => db.query(
    `update shift_reports set author_id = $2 where id = $1`, [id, OPENER])), /./);
  const { rows } = await db.query(`select body, archived_at from shift_reports where id = $1`, [id]);
  assert.equal(rows[0].body, 'Fixed typo');
  assert.equal(rows[0].archived_at, null);
});

test('only management archives and restores, and it is logged', async () => {
  const db = await studio();
  const id = await write(db, CLOSER);
  await refuses(as(db, CLOSER, () => db.query(`select set_shift_report_archived($1, true)`, [id])), /Only an admin/);

  await as(db, GM, () => db.query(`select set_shift_report_archived($1, true)`, [id]));
  let { rows } = await db.query(`select archived_at, archived_by from shift_reports where id = $1`, [id]);
  assert.ok(rows[0].archived_at);
  assert.equal(rows[0].archived_by, GM);

  // An archived report is frozen for its author.
  const r = await as(db, CLOSER, () => db.query(`update shift_reports set body = 'late edit' where id = $1`, [id]));
  assert.equal(r.affectedRows, 0);

  await as(db, GM, () => db.query(`select set_shift_report_archived($1, false)`, [id]));
  ({ rows } = await db.query(`select archived_at from shift_reports where id = $1`, [id]));
  assert.equal(rows[0].archived_at, null);

  const logs = (await db.query(`select action from activity_logs order by created_at`)).rows.map((x) => x.action);
  assert.deepEqual(logs, ['shift_report_archived', 'shift_report_restored']);
});

test('the author tags staff; a stranger cannot tag; parents and switched-off staff cannot be tagged', async () => {
  const db = await studio();
  const id = await write(db, CLOSER);
  const tag = (by, who) => as(db, by, () => db.query(
    `insert into shift_report_tags (report_id, user_id, tagged_by) values ($1, $2, $3)`, [id, who, by]));

  await tag(CLOSER, GM);
  await refuses(tag(OPENER, CLOSER), /row-level security/);
  await refuses(tag(CLOSER, PARENT), /row-level security/);
  await refuses(tag(CLOSER, GONE), /row-level security/);
  await tag(GM, OPENER); // management may tag on anyone's report
});

test('a tag is unseen until the tagged person opens it, and only they can clear it', async () => {
  const db = await studio();
  const id = await write(db, CLOSER);
  await as(db, CLOSER, () => db.query(
    `insert into shift_report_tags (report_id, user_id, tagged_by) values ($1, $2, $3)`, [id, OPENER, CLOSER]));

  // Someone else opening it does not clear OPENER's alert.
  await as(db, GM, () => db.query(`select mark_shift_report_seen($1)`, [id]));
  let { rows } = await db.query(`select seen_at from shift_report_tags where user_id = $1`, [OPENER]);
  assert.equal(rows[0].seen_at, null);

  // No direct update path.
  const r = await as(db, OPENER, () => db.query(`update shift_report_tags set seen_at = now() where report_id = $1`, [id]))
    .catch((e) => e);
  assert.ok(r instanceof Error || r.affectedRows === 0);

  await as(db, OPENER, () => db.query(`select mark_shift_report_seen($1)`, [id]));
  ({ rows } = await db.query(`select seen_at from shift_report_tags where user_id = $1`, [OPENER]));
  assert.ok(rows[0].seen_at);
});

test('chat: staff post as themselves, delete their own; management deletes any', async () => {
  const db = await studio();
  const id = await write(db, CLOSER);
  const post = (who, as_ = who) => as(db, who, () => db.query(
    `insert into shift_report_comments (report_id, author_id, body) values ($1, $2, 'Thanks!') returning id`,
    [id, as_])).then((r) => r.rows[0].id);

  const mine = await post(OPENER);
  await refuses(post(OPENER, CLOSER), /row-level security/);
  await refuses(post(PARENT), /row-level security/);

  const notMine = await as(db, CLOSER, () => db.query(`delete from shift_report_comments where id = $1`, [mine]));
  assert.equal(notMine.affectedRows, 0);
  const gm = await as(db, GM, () => db.query(`delete from shift_report_comments where id = $1`, [mine]));
  assert.equal(gm.affectedRows, 1);
});

test('nobody deletes a report from the app', async () => {
  const db = await studio();
  const id = await write(db, CLOSER);
  for (const who of [CLOSER, GM]) {
    const r = await as(db, who, () => db.query(`delete from shift_reports where id = $1`, [id])).catch((e) => e);
    assert.ok(r instanceof Error || r.affectedRows === 0);
  }
  const { rows } = await db.query(`select count(*)::int as n from shift_reports`);
  assert.equal(rows[0].n, 1);
});
