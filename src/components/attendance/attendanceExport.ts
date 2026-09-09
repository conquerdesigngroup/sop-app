import { toCSV } from '../hours/hoursUtils';
import { shiftIsoDays, studioToday } from '../../lib/studioDate';
import { STATUS_LABELS } from '../../lib/attendanceColors';
import { RecordRow } from '../../lib/attendanceRecords';

/**
 * Attendance, as a file.
 *
 * WHY EVERY ROW CARRIES ITS OWN REASON
 *
 * The columns are Date, Class, Teacher, Dancer, Status, Counted, Reason — and
 * the last two are the ones that make the file worth anything. A spreadsheet
 * that says only "Absent" cannot be reconciled against a percentage: a parent
 * asking why their child is at 80% needs the same answer the app gives them,
 * and an office answering that question from a CSV needs to see that the ninth
 * of October was a studio closure and does not count against anyone.
 *
 * That is the same argument portal_attendance_detail exists for, carried
 * through to the printout instead of being dropped at the last step.
 *
 * NOT MARKED IS A VALUE, NOT A BLANK
 *
 * A dancer nobody marked is written "Not marked", never left empty. An empty
 * cell in a spreadsheet reads as "no data available" and is skimmed past; it is
 * in fact the most actionable row in the file.
 */

export type RangePreset = 'day' | 'week' | 'month';

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const prettyDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

/**
 * Turn a preset and an anchor date into actual bounds.
 *
 * The week runs Sunday to Saturday, matching portal_classes.day_of_week where
 * 0 is Sunday — the same convention as Date.getDay() and Postgres EXTRACT(DOW).
 * Picking a different week boundary here would put a Sunday class in a
 * different week from the one the schedule says it is in.
 *
 * Anchored on a YYYY-MM-DD string throughout, never a Date, so no timezone can
 * shift a boundary by a day.
 */
export const resolveRange = (preset: RangePreset, anchor: string = studioToday()): DateRange => {
  const [y, m, d] = anchor.split('-').map(Number);

  if (preset === 'day') {
    return { from: anchor, to: anchor, label: prettyDate(anchor) };
  }

  if (preset === 'week') {
    // getUTCDay on a UTC-anchored date: pure calendar arithmetic, no local zone.
    const dow = new Date(`${anchor}T00:00:00Z`).getUTCDay();
    const from = shiftIsoDays(anchor, -dow);
    const to = shiftIsoDays(from, 6);
    return { from, to, label: `${prettyDate(from)} – ${prettyDate(to)}` };
  }

  const pad = (n: number) => `${n}`.padStart(2, '0');
  const from = `${y}-${pad(m)}-01`;
  // Day 0 of the next month is the last day of this one, and it handles
  // February in a leap year without a table.
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${pad(m)}-${pad(last)}`;
  return { from, to, label: `${MONTHS[m - 1]} ${y}` };
};

export const statusLabel = (row: RecordRow): string =>
  row.status ? STATUS_LABELS[row.status] : 'Not marked';

/** Why a session does not count, in words rather than a slug. */
export const reasonLabel = (row: RecordRow): string => {
  switch (row.excludedReason) {
    case 'cancelled': return row.sessionNote || 'Class cancelled';
    case 'closed': return row.sessionNote || 'Studio closed';
    case 'before-enrollment': return 'Joined later';
    case 'after-drop': return 'Left the class';
    case 'upcoming': return 'Has not happened yet';
    case 'excused': return 'Excused — studio policy';
    default: return '';
  }
};

export const COLUMNS = ['Date', 'Class', 'Teacher', 'Dancer', 'Status', 'Counted', 'Reason'] as const;

export const toRow = (r: RecordRow): string[] => [
  r.sessionDate,
  r.className,
  r.teachers,
  `${r.lastName}, ${r.firstName}`,
  statusLabel(r),
  r.countsTowardTotal ? 'Yes' : 'No',
  reasonLabel(r),
];

export interface ExportMeta {
  range: DateRange;
  /** "Ada Nunez" or "Jr Ballet 2" — what the file is about, if it is narrowed. */
  subject?: string;
}

export interface CSVResult {
  csv: string;
  filename: string;
  rowCount: number;
}

/** Lowercase, hyphenated, safe in a filename on every OS. */
export const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'all';

export const buildAttendanceCSV = (rows: RecordRow[], meta: ExportMeta): CSVResult => {
  // toCSV quotes every cell and neutralises a leading =, +, - or @ so a dancer
  // named after a formula cannot execute on open in Excel.
  const csv = toCSV([[...COLUMNS], ...rows.map(toRow)]);
  const name = meta.subject ? `attendance_${slug(meta.subject)}` : 'attendance';

  return {
    csv,
    filename: `${name}_${meta.range.from}_to_${meta.range.to}.csv`,
    rowCount: rows.length,
  };
};

export interface Tally {
  present: number;
  absent: number;
  late: number;
  excused: number;
  sick: number;
  unmarked: number;
  counted: number;
  attended: number;
  /** Null, never 0, when nothing counts — a class that has not met has no rate. */
  percent: number | null;
}

/**
 * The totals a report is actually read for.
 *
 * `percent` is computed the same way portal_attendance_summary computes it —
 * present and late over everything that counts — so a printed report and the
 * app cannot disagree. If that formula ever changes, it changes in three places
 * and they are named in ATTENDANCE-NOTES.md.
 */
export const tally = (rows: RecordRow[]): Tally => {
  const t: Tally = {
    present: 0, absent: 0, late: 0, excused: 0, sick: 0,
    unmarked: 0, counted: 0, attended: 0, percent: null,
  };

  rows.forEach(r => {
    if (r.status === null) {
      // Only count an unmarked dancer where a mark was actually expected. A
      // future Tuesday is not a hole in the records.
      if (r.excludedReason === null || r.countsTowardTotal) t.unmarked += 1;
    } else {
      t[r.status] += 1;
    }
    if (r.countsTowardTotal) {
      t.counted += 1;
      if (r.status === 'present' || r.status === 'late') t.attended += 1;
    }
  });

  t.percent = t.counted === 0 ? null : Math.round((t.attended / t.counted) * 100);
  return t;
};
