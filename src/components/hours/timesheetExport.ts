/**
 * The column model behind the Export dialog, and the flat CSV built from it.
 *
 * Three things export hours from Team Hours:
 *
 *   buildPayrollCSV (payrollExport)  — the accountant's report. Fixed shape:
 *     titled blocks, subtotals, a team total. Not configurable, because the
 *     shape IS the report.
 *   buildFlatCSV (here)              — a rectangle. One header row, one row
 *     per shift, only the columns asked for. This is the one that imports.
 *   buildTimesheetPDF (timesheetPdf) — the same chosen columns on paper.
 *
 * Who is exported is decided by the caller: it passes the rollups it wants.
 * WHAT is exported is decided here, by a list of ColumnKeys, so the CSV and
 * the PDF cannot drift into showing different things.
 *
 * Entries are priced with priceEntry from payrollExport rather than a second
 * copy of the rules. Approved pay comes from the frozen snapshot, pending is
 * an estimate at today's rate, rejected is not paid — and that has to mean
 * the same thing in every file this panel produces.
 */

import {
  DateRange,
  formatDateShort,
  formatHours,
  formatTime12,
  formatWeekday,
  toCSV,
} from './hoursUtils';
import { EmployeeRollup, PayrollLookups, PricedEntry, priceEntry } from './payrollExport';

export type ColumnKey =
  | 'employee' | 'email' | 'employeeId'
  | 'date' | 'weekday' | 'timeIn' | 'timeOut' | 'break' | 'hours'
  | 'category' | 'status' | 'rate' | 'amount' | 'basis' | 'notes';

export interface ColumnSpec {
  key: ColumnKey;
  /** Header text. A spreadsheet has room to say what it means. */
  label: string;
  /**
   * Header text on paper, where the column is only as wide as its values and
   * "HOURLY RATE" does not fit over "$30.00". Falls back to label.
   */
  shortLabel?: string;
  /** Right-aligned on paper, and a number rather than text in a spreadsheet. */
  numeric?: boolean;
  /** Points on a printed Letter page. The PDF shares out any slack. */
  width: number;
  /**
   * Named on the person's own row, so printing it in every line of their own
   * table is noise. The PDF drops these; the CSV keeps them, because a
   * spreadsheet row has to identify itself.
   */
  identifies?: boolean;
  /** Money, so a missing value must read as missing rather than as zero. */
  money?: boolean;
}

/**
 * Declaration order is the order of the columns in every export.
 *
 * The widths are points on a printed page, sized to the widest thing that
 * actually lands in the column — including the header, which is drawn in
 * small caps and is often wider than the values under it ("HOURLY RATE" is
 * wider than "$30.00"). Getting these wrong does not wrap, it overlaps.
 */
export const COLUMNS: ColumnSpec[] = [
  { key: 'employee',   label: 'Employee',      width: 96, identifies: true },
  { key: 'email',      label: 'Email',         width: 120, identifies: true },
  { key: 'employeeId', label: 'Employee ID',   width: 120, identifies: true },
  { key: 'date',       label: 'Date',          width: 70 },
  { key: 'weekday',    label: 'Weekday',       width: 34, shortLabel: 'Day' },
  { key: 'timeIn',     label: 'Time in',       width: 48, shortLabel: 'In' },
  { key: 'timeOut',    label: 'Time out',      width: 48, shortLabel: 'Out' },
  { key: 'break',      label: 'Break (min)',   width: 40, numeric: true, shortLabel: 'Break' },
  { key: 'hours',      label: 'Hours',         width: 38, numeric: true },
  { key: 'category',   label: 'Work category', width: 78, shortLabel: 'Category' },
  { key: 'status',     label: 'Status',        width: 48 },
  { key: 'rate',       label: 'Hourly rate',   width: 44, numeric: true, money: true, shortLabel: 'Rate' },
  { key: 'amount',     label: 'Amount',        width: 50, numeric: true, money: true },
  { key: 'basis',      label: 'Pay basis',     width: 128 },
  { key: 'notes',      label: 'Notes',         width: 104 },
];

const BY_KEY = new Map(COLUMNS.map(c => [c.key, c]));

/**
 * Everything except the internal id, which is only useful when reconciling
 * against the database and is noise on a payslip.
 */
export const DEFAULT_COLUMNS: ColumnKey[] = COLUMNS
  .filter(c => c.key !== 'employeeId')
  .map(c => c.key);

/**
 * The same, minus Pay basis.
 *
 * On paper it says "Approved - locked at the rate on the day" next to a
 * Status column already reading "Approved", and it is the widest column on
 * the page — wide enough that it truncates and still pushes everything else
 * tight. In a spreadsheet it earns its place, because that is where someone
 * questions a figure and needs the reasoning spelled out. It stays available
 * in the dialog; it just is not on by default.
 */
export const PDF_DEFAULT_COLUMNS: ColumnKey[] = DEFAULT_COLUMNS.filter(c => c !== 'basis');

/** What "just hours and category" means, offered as one click in the dialog. */
export const MINIMAL_COLUMNS: ColumnKey[] = ['employee', 'date', 'hours', 'category'];

/** Keeps the caller's column set in declaration order, and drops anything unknown. */
export const orderColumns = (keys: ColumnKey[]): ColumnSpec[] => {
  const wanted = new Set(keys);
  return COLUMNS.filter(c => wanted.has(c.key));
};

export interface TimesheetExportInput {
  rollups: EmployeeRollup[];
  range: DateRange;
  lookups: PayrollLookups;
  /** Defaults to DEFAULT_COLUMNS. An empty list would produce a blank file. */
  columns?: ColumnKey[];
  /** Injected so the header timestamp is pinnable in a test. */
  generatedAt?: Date;
  /** Admin running the export — who to ask if a figure looks wrong. */
  generatedBy?: string;
  /**
   * Set when exporting one person, so the file is named after them rather
   * than the whole team. Does not filter — pass the one rollup you want.
   */
  subject?: string;
}

export interface FlatCSVResult {
  csv: string;
  filename: string;
  /** Shifts in the file. Zero means there is nothing worth downloading. */
  rowCount: number;
  employeeCount: number;
}

const ALL_TIME_START = '0000-01-01';
const ALL_TIME_END = '9999-12-31';

export const isAllTime = (range: DateRange) =>
  range.start === ALL_TIME_START && range.end === ALL_TIME_END;

export const rangeSlug = (range: DateRange) =>
  isAllTime(range) ? 'all-time' : `${range.start}_to_${range.end}`;

/** "Alice O'Brien-Adams" -> "alice-o-brien-adams". Safe in a filename anywhere. */
export const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'employee';

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** Plain 2dp, no symbol and no separator — a spreadsheet needs a number. */
export const money = (n: number) => round2(n).toFixed(2);

/** With the symbol. For paper, which is read rather than summed. */
export const moneyPrint = (n: number) =>
  `$${round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Shifts read forwards.
 *
 * The panel sorts newest first because that is what an admin checks; a
 * timesheet is read from the start of the period to the end.
 */
export const pricedFor = (r: EmployeeRollup, lookups: PayrollLookups): PricedEntry[] =>
  [...r.entries]
    .sort((a, b) =>
      a.workDate < b.workDate ? -1
        : a.workDate > b.workDate ? 1
        : a.startTime.localeCompare(b.startTime))
    .map(e => priceEntry(e, r.employeeId, lookups));

/** People with something logged, in the order payroll is read: alphabetical. */
export const worked = (rollups: EmployeeRollup[]) =>
  rollups.filter(r => r.entries.length > 0).sort((a, b) => a.name.localeCompare(b.name));

/**
 * One cell.
 *
 * `forPrint` only changes presentation — a symbol on money, a dash where a
 * spreadsheet wants a blank, a compact date. It never changes which entries
 * are worth what.
 */
export interface CellOptions {
  /** Presentation for paper: symbols on money, a dash for a blank, compact dates. */
  forPrint?: boolean;
  /**
   * True when a Weekday column is also being drawn, so the date does not
   * repeat it. Only meaningful with forPrint.
   */
  weekdayShownSeparately?: boolean;
}

export const cellValue = (
  key: ColumnKey,
  r: EmployeeRollup,
  p: PricedEntry,
  { forPrint = false, weekdayShownSeparately = false }: CellOptions = {}
): string | number => {
  const e = p.entry;
  const blank = forPrint ? '—' : '';

  switch (key) {
    case 'employee':   return r.name;
    case 'email':      return r.email;
    case 'employeeId': return r.employeeId;
    // On paper the weekday rides along with the date, because a printed page
    // has no room for a column that carries three characters.
    case 'date':
      if (!forPrint) return e.workDate;
      return weekdayShownSeparately
        ? formatDateShort(e.workDate)
        : `${formatWeekday(e.workDate)} ${formatDateShort(e.workDate)}`;
    case 'weekday':    return formatWeekday(e.workDate);
    case 'timeIn':     return formatTime12(e.startTime);
    case 'timeOut':    return formatTime12(e.endTime);
    case 'break':      return e.breakMinutes || 0;
    case 'hours':      return formatHours(e.totalHours);
    case 'category':   return p.category;
    case 'status':     return forPrint ? e.status.charAt(0).toUpperCase() + e.status.slice(1) : e.status;
    case 'rate':       return p.rate === undefined ? blank : (forPrint ? moneyPrint(p.rate) : money(p.rate));
    case 'amount':     return p.amount === undefined ? blank : (forPrint ? moneyPrint(p.amount) : money(p.amount));
    case 'basis':      return p.basis;
    case 'notes':      return e.notes || '';
    default:           return '';
  }
};

// ------------------------------------------------------------------ flat CSV

/**
 * One row per shift and not one row more.
 *
 * Rejected shifts are included with a blank Amount rather than dropped. They
 * are real hours somebody logged, and an accountant reconciling against a
 * schedule needs to see why a day is missing — but a blank amount cannot be
 * summed into a payment by accident, which a 0.00 in an otherwise-paid column
 * eventually would be.
 */
export const buildFlatCSV = ({
  rollups,
  range,
  lookups,
  columns = DEFAULT_COLUMNS,
  subject,
}: TimesheetExportInput): FlatCSVResult => {
  const specs = orderColumns(columns);
  const people = worked(rollups);

  const rows: (string | number)[][] = [specs.map(c => c.label)];
  people.forEach(r => {
    pricedFor(r, lookups).forEach(p => {
      rows.push(specs.map(c => cellValue(c.key, r, p)));  // CSV: full dates, no symbols
    });
  });

  const name = subject ? `hours_${slug(subject)}` : 'hours';

  return {
    csv: toCSV(rows),
    filename: `${name}_${rangeSlug(range)}.csv`,
    rowCount: rows.length - 1,
    employeeCount: people.length,
  };
};
