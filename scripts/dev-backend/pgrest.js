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
 * Resolve `select=profile_id, profiles(id, first_name)` against a row.
 *
 * Only the shape the app asks for: a flat column list plus at most a one-level
 * embed, joined on <table>_id or id. Anything unrecognised passes the row
 * through whole, because a select this does not understand should under-filter
 * rather than drop a column a page needs.
 */
const applySelect = (rows, select, tables) => {
  if (!select || select === '*' || !select.includes('(')) return rows;

  const embeds = [...select.matchAll(/([a-z_]+)\s*\(([^)]*)\)/g)].map((m) => ({
    table: m[1],
    columns: m[2].split(',').map((c) => c.trim()).filter(Boolean),
  }));
  if (!embeds.length) return rows;

  return rows.map((row) => {
    const out = { ...row };
    for (const embed of embeds) {
      const source = tables[embed.table] || [];
      // portal_class_instructors.profile_id -> profiles.id
      const fk = `${embed.table.replace(/s$/, '')}_id`;
      const key = row[fk] !== undefined ? row[fk] : row[`${embed.table}_id`];
      const hit = source.find((r) => r.id === key) || null;
      out[embed.table] = hit && embed.columns.length && !embed.columns.includes('*')
        ? Object.fromEntries(embed.columns.map((c) => [c, hit[c]]))
        : hit;
    }
    return out;
  });
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
