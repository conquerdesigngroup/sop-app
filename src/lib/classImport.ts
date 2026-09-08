/**
 * Turning the Enrolio classes export into rows admin_class_import understands.
 *
 * The messy formats — "04:00 PM", "7y", "Aug 29, 2026" — are normalised here
 * rather than in SQL, because they are presentation formats and this is where
 * they can be unit tested. The RPC still validates everything it is handed; it
 * does not trust this file.
 *
 * THE TITLE IS NOT THE SCHEDULE. Enrolio bakes a schedule into the class title
 * when it is created and never refreshes it — "All-Star Bb (chill/m-6pm)" meets
 * Saturday at 09:00. Nothing here parses the title for day or time; those come
 * from the Days and Start Time columns, and the title is only an identifier.
 */

import { parseCsvToObjects } from './csv';

/** Header names as the Enrolio classes export writes them. */
export const CLASS_HEADER_MAP: Record<string, string> = {
  title: 'title',
  days: 'days',
  'start time': 'start_time',
  'end time': 'end_time',
  room: 'room',
  instructor: 'instructor',
  description: 'description',
  group: 'group',
  'tuition fee': 'tuition_fee',
  'registration fee amount': 'registration_fee',
  'max size': 'capacity',
  'tuition billing cycle': 'billing_cycle',
  'start age': 'age_min_years',
  'end age': 'age_max_years',
  'start date': 'season_start',
  'end date': 'season_end',
  'registration start date': 'registration_opens',
};

/** Sunday = 0, matching DAY_OPTIONS and portal_classes.day_of_week. */
const DAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

export const parseDay = (raw: string): number | null => {
  const v = (raw || '').trim().toLowerCase().replace(/\.$/, '');
  if (!v) return null;
  // portal_classes holds ONE day. A class listed on several is not representable,
  // so it is rejected rather than silently filed under the first one.
  if (/[,/&]| and /.test(v)) return null;
  return DAYS[v] ?? null;
};

/** "04:00 PM" / "4:00PM" / "16:00" -> "16:00". */
export const parseTime = (raw: string): string | null => {
  const v = (raw || '').trim().toUpperCase().replace(/\./g, '');
  if (!v) return null;
  const m = v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === 'PM' && h !== 12) h += 12;
    if (m[3] === 'AM' && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

/** "7y" -> 7. Also accepts a bare number. */
export const parseAge = (raw: string): string => {
  const m = (raw || '').trim().match(/^(\d{1,2})\s*y?$/i);
  return m ? m[1] : '';
};

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * "Aug 29, 2026" -> "2026-08-29". Parsed by hand rather than with Date(), which
 * would apply the viewer's timezone and can shift a date by a day.
 */
export const parseExportDate = (raw: string): string => {
  const v = (raw || '').trim();
  if (!v) return '';
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return v;
  const m = v.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return '';
  const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!mon) return '';
  return `${m[3]}-${mon}-${String(Number(m[2])).padStart(2, '0')}`;
};

/** Strips currency symbols and thousands separators; keeps the number. */
export const parseMoney = (raw: string): string => {
  const v = (raw || '').replace(/[^0-9.]/g, '');
  return v === '' || Number.isNaN(Number(v)) ? '' : v;
};

const parseInt0 = (raw: string): string => {
  const m = (raw || '').trim().match(/^\d+$/);
  return m ? m[0] : '';
};

export interface ClassImportRow {
  title: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room: string;
  instructor: string;
  description: string;
  group: string;
  capacity: string;
  tuition_fee: string;
  registration_fee: string;
  billing_cycle: string;
  age_min_years: string;
  age_max_years: string;
  season_start: string;
  season_end: string;
  registration_opens: string;
}

export interface ClassCsvParse {
  rows: ClassImportRow[];
  /** Rows dropped before the server saw them, with the reason, 1-based on the file. */
  skipped: { row: number; title: string; reason: string }[];
  error?: string;
}

export const classesCsvToRows = (text: string): ClassCsvParse => {
  const { rows: raw, headers } = parseCsvToObjects(text, CLASS_HEADER_MAP);
  if (raw.length === 0) {
    return { rows: [], skipped: [], error: 'Need a header row and at least one class.' };
  }
  if (!headers.includes('title') || !headers.includes('days') || !headers.includes('start_time')) {
    return {
      rows: [],
      skipped: [],
      error: 'The header row must include "Title", "Days" and "Start Time" — this looks like a different export.',
    };
  }

  const rows: ClassImportRow[] = [];
  const skipped: ClassCsvParse['skipped'] = [];

  raw.forEach((r, i) => {
    const title = (r.title || '').trim();
    const day = parseDay(r.days || '');
    const start = parseTime(r.start_time || '');

    if (!title) { skipped.push({ row: i + 2, title: '', reason: 'no title' }); return; }
    if (day === null) {
      skipped.push({ row: i + 2, title, reason: `day "${r.days || ''}" is not a single weekday` });
      return;
    }
    if (!start) {
      skipped.push({ row: i + 2, title, reason: `start time "${r.start_time || ''}" is not a time` });
      return;
    }

    rows.push({
      title,
      day_of_week: String(day),
      start_time: start,
      end_time: parseTime(r.end_time || '') ?? '',
      room: (r.room || '').trim(),
      instructor: (r.instructor || '').trim(),
      description: (r.description || '').trim(),
      group: (r.group || '').trim(),
      capacity: parseInt0(r.capacity || ''),
      tuition_fee: parseMoney(r.tuition_fee || ''),
      registration_fee: parseMoney(r.registration_fee || ''),
      billing_cycle: (r.billing_cycle || '').trim(),
      age_min_years: parseAge(r.age_min_years || ''),
      age_max_years: parseAge(r.age_max_years || ''),
      season_start: parseExportDate(r.season_start || ''),
      season_end: parseExportDate(r.season_end || ''),
      registration_opens: parseExportDate(r.registration_opens || ''),
    });
  });

  return { rows, skipped };
};
