/**
 * CSV parsing shared by the admin importers.
 *
 * This lived inside ClientAccountsPage with a note saying to promote it here if
 * a second CSV ever appeared. The class import is that second one.
 */

/** Quoted fields, embedded commas and quotes, CRLF. Blank lines are dropped. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
};

/**
 * Rows as objects keyed by a canonical name, using `map` to translate the
 * header row. Columns whose header is not in the map are dropped — every
 * importer here wants that, because the exports carry far more than we store.
 *
 * A BOM on the first header is stripped: Excel writes one and it would
 * otherwise make the first column unrecognisable.
 */
export const parseCsvToObjects = (
  text: string,
  map: Record<string, string>,
): { rows: Record<string, string>[]; headers: (string | null)[] } => {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], headers: [] };

  const headers = table[0].map((h, i) => {
    const clean = (i === 0 ? h.replace(/^﻿/, '') : h).trim().toLowerCase();
    return map[clean] ?? null;
  });

  const rows = table.slice(1).map(cells => {
    const obj: Record<string, string> = {};
    headers.forEach((key, i) => {
      if (key && cells[i] !== undefined) obj[key] = cells[i].trim();
    });
    return obj;
  });
  return { rows, headers };
};
