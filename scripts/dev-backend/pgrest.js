/**
 * The slice of PostgREST the app actually speaks.
 *
 * Not a PostgREST clone and not trying to be. Every query this has to answer is
 * in src/, and `grep -o "\.from('\K[a-z_]+" src` is the whole list: reads with
 * eq/in/is/gte/lte/like filters, an order, sometimes a limit, two one-level
 * embeds of `profiles`, and `.single()`. Writes are accepted and stored in
 * memory so a form's optimistic update does not snap back, and are gone on
 * restart — this is a fixture, not a database.
 *
 * WHAT IT DOES WHEN IT DOES NOT KNOW
 *
 * Returns []. Not an error, not invented rows. A table with no seed renders the
 * page's empty state, which is a true statement about a fixture and a layout
 * worth auditing in its own right. The failure this avoids is the one that
 * matters: a fake backend that answers plausibly for something it has no data
 * for teaches you the screen works when it has never been exercised.
 */

/** `col.asc.nullslast` → comparator. */
const comparator = (spec) => {
  const [col, ...mods] = spec.split('.');
  const desc = mods.includes('desc');
  const nullsFirst = mods.includes('nullsfirst');

  return (a, b) => {
    const x = a[col];
    const y = b[col];
    if (x === y) return 0;
    // Postgres sorts NULLs last on ASC by default, first on DESC.
    if (x === null || x === undefined) return (nullsFirst ? -1 : 1);
    if (y === null || y === undefined) return (nullsFirst ? 1 : -1);
    const order = x < y ? -1 : 1;
    return desc ? -order : order;
  };
};

/** PostgREST spells a list `in.("a","b")`, with optional quoting. */
const parseList = (raw) =>
  raw.replace(/^\(|\)$/g, '')
    .split(',')
    .map((v) => v.trim().replace(/^"(.*)"$/, '$1'))
    .filter((v) => v.length > 0);

const cast = (raw) => {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
};

const like = (value, pattern, insensitive) => {
  const re = new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*')}$`,
    insensitive ? 'i' : ''
  );
  return re.test(String(value ?? ''));
};

/** One `col=op.value` term. */
const matchesTerm = (row, col, raw) => {
  const dot = raw.indexOf('.');
  const op = dot === -1 ? 'eq' : raw.slice(0, dot);
  const arg = dot === -1 ? raw : raw.slice(dot + 1);
  const value = row[col];

  switch (op) {
    case 'eq': return value === cast(arg);
    case 'neq': return value !== cast(arg);
    case 'gt': return value > cast(arg);
    case 'gte': return value >= cast(arg);
    case 'lt': return value < cast(arg);
    case 'lte': return value <= cast(arg);
    case 'like': return like(value, arg, false);
    case 'ilike': return like(value, arg, true);
    case 'in': return parseList(arg).map(cast).includes(value);
    case 'is': return arg === 'null' ? (value === null || value === undefined) : value === cast(arg);
    case 'not': return !matchesTerm(row, col, arg);
    default:
      // Loud rather than silently true: an unsupported operator that filters
      // nothing looks exactly like a page with too much data on it.
      throw new Error(`dev-backend: unsupported filter operator "${op}" on ${col}`);
  }
};

/** `or=(a.eq.1,b.is.null)` — one level, which is all the app uses. */
const matchesOr = (row, group) =>
  group.replace(/^\(|\)$/g, '').split(',').some((term) => {
    const [col, ...rest] = term.split('.');
    return matchesTerm(row, col, rest.join('.'));
  });

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

/**
 * Split a select list on commas that are NOT inside an embed's parentheses.
 *
 * `id, status, portal_classes(id, name)` is three fields, not four — and a
 * regex cannot say that, which is why the first version of this file read
 * "inner" as a table name and served every embed as null.
 */
const splitFields = (select) => {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of select) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(current); current = ''; continue; }
    current += ch;
  }
  out.push(current);
  return out.map((f) => f.trim()).filter(Boolean);
};

/**
 * The column on the parent row that points at an embedded table.
 *
 * PostgREST knows the foreign keys; this has to guess from the table name, and
 * the app's tables are named in three different shapes:
 *
 *   profiles          -> profile_id
 *   portal_students   -> student_id
 *   portal_classes    -> class_id     (an -es plural, and a portal_ prefix)
 *
 * Every candidate is tried against the row and the first one the row actually
 * carries wins, so a wrong guess costs nothing.
 */
const foreignKeyOf = (table, row) => {
  const names = [table, table.replace(/^portal_/, '')];
  const stems = [];
  for (const n of names) {
    stems.push(n, n.replace(/ies$/, 'y'), n.replace(/es$/, ''), n.replace(/s$/, ''));
  }
  for (const stem of stems) {
    if (row[`${stem}_id`] !== undefined) return `${stem}_id`;
  }
  return null;
};

/**
 * Resolve `select=profile_id, profiles(id, first_name)` against a row.
 *
 * Handles the shapes the app asks for: a flat column list, an embed with an
 * `!inner` / `!left` hint, and an embed inside an embed (the class roster asks
 * for enrollments -> students -> households in one request). Anything it does
 * not understand passes the row through whole, because a select this cannot
 * parse should under-filter rather than drop a column a page needs.
 */
const selectRow = (row, select, tables) => {
  const fields = splitFields(select);
  if (!fields.some((f) => f.includes('('))) return row;

  const out = { ...row };
  for (const field of fields) {
    const open = field.indexOf('(');
    if (open === -1) continue;
    // `portal_classes!inner(...)` — the hint after ! is about the JOIN, not
    // part of the table name.
    const table = field.slice(0, open).split('!')[0].trim();
    const inner = field.slice(open + 1, field.lastIndexOf(')'));
    const source = tables[table] || [];
    const fk = foreignKeyOf(table, row);
    const hit = fk ? source.find((r) => r.id === row[fk]) || null : null;
    if (!hit) { out[table] = null; continue; }

    const columns = splitFields(inner);
    const wantsEverything = !columns.length || columns.includes('*');
    // A COPY, always. The embedded row is the seed's own object, and writing a
    // nested embed onto it would edit the fixture for every later request.
    const projected = wantsEverything
      ? { ...hit }
      : Object.fromEntries(
        columns.filter((c) => !c.includes('(')).map((c) => [c, hit[c]]),
      );

    for (const column of columns) {
      if (!column.includes('(')) continue;
      const nestedTable = column.slice(0, column.indexOf('(')).split('!')[0].trim();
      // Resolved against the WHOLE embedded row, not the projection above: the
      // foreign key it needs is usually a column the caller did not ask for.
      projected[nestedTable] = selectRow(hit, column, tables)[nestedTable] ?? null;
    }

    out[table] = projected;
  }
  return out;
};

const applySelect = (rows, select, tables) => {
  if (!select || select === '*' || !select.includes('(')) return rows;
  return rows.map((row) => selectRow(row, select, tables));
};

/** Run a parsed request against the in-memory tables. */
const query = (tables, table, params) => {
  let rows = [...(tables[table] || [])];

  for (const [key, raw] of params) {
    if (RESERVED.has(key)) continue;
    if (key === 'or') {
      rows = rows.filter((row) => matchesOr(row, raw));
      continue;
    }
    rows = rows.filter((row) => matchesTerm(row, key, raw));
  }

  const order = params.find(([k]) => k === 'order');
  if (order) {
    // PostgREST allows several keys, comma separated; first difference wins.
    const specs = order[1].split(',').map(comparator);
    rows.sort((a, b) => specs.reduce((acc, cmp) => acc || cmp(a, b), 0));
  }

  const offset = params.find(([k]) => k === 'offset');
  if (offset) rows = rows.slice(Number(offset[1]) || 0);

  const limit = params.find(([k]) => k === 'limit');
  if (limit) rows = rows.slice(0, Number(limit[1]) || 0);

  const select = params.find(([k]) => k === 'select');
  return applySelect(rows, select && select[1], tables);
};

module.exports = { query, matchesTerm };
