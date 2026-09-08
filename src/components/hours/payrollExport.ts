/**
 * The payroll CSV behind "Export CSV" on the Team Hours panel.
 *
 * Split out of TeamHoursPanel because this is the one thing on that page
 * where a mistake is expensive: the file goes to the accountant and people
 * are paid from it. A pure function can be pinned by a test against a
 * fixture; a closure inside a 700-line component cannot.
 *
 * The file is three blocks, not one flat list:
 *
 *   1. PAYROLL SUMMARY — one row per person. This is the block the
 *      accountant actually keys off: hours and pay for one human being on
 *      one line, with a team total underneath rather than instead of it.
 *   2. PAY BREAKDOWN BY RATE — one row per person per rate. Rates are set
 *      per employee AND per work category, so anyone working two categories
 *      is paid at two rates and a single blended figure hides it.
 *   3. ENTRY DETAIL — every shift, grouped under its person with that
 *      person's subtotal, so any number above can be traced to the shifts
 *      that produced it.
 *
 * Numbers stay numeric. The previous version wrote "142.50 (est.)" into the
 * amount column, which makes the whole column text in Excel and quietly
 * breaks the accountant's own SUM. Qualifiers live in their own "Pay basis"
 * column instead.
 */

import { WorkHoursEntry, WorkHoursPay } from '../../types';
import {
  DateRange,
  formatHours,
  formatTime12,
  formatWeekday,
  toCSV,
} from './hoursUtils';

/** One person's slice of the period. Built by TeamHoursPanel. */
export interface EmployeeRollup {
  employeeId: string;
  name: string;
  email: string;
  entries: WorkHoursEntry[];
  /** Approved + pending. Excludes rejected — see sumPayableHours. */
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  days: number;
  /** Frozen pay for approved entries. Authoritative — this is what is owed. */
  approvedPay: number;
  /** Pending hours priced at today's rates. An estimate, not a commitment. */
  estimatedPendingPay: number;
  /** Approved entries that had no rate configured, so were frozen at $0.00. */
  missingRateCount: number;
}

export interface PayrollLookups {
  getCategoryName: (categoryId?: string | null) => string | undefined;
  getFrozenPay: (workHoursId: string) => WorkHoursPay | undefined;
  getRate: (employeeId: string, categoryId?: string | null) => number | undefined;
}

export interface PayrollExportInput {
  rollups: EmployeeRollup[];
  range: DateRange;
  lookups: PayrollLookups;
  /** Injected so the header timestamp is pinnable in a test. */
  generatedAt?: Date;
  /** Admin running the export — the accountant's contact if a figure looks wrong. */
  generatedBy?: string;
}

export interface PayrollExportResult {
  csv: string;
  filename: string;
  /** Shifts in the file. Zero means there is nothing worth downloading. */
  entryCount: number;
  /** People with at least one shift. */
  employeeCount: number;
}

/** Widest block wins; every row is padded to it so the file opens square. */
const WIDTH = 13;

const row = (...cells: (string | number)[]): (string | number)[] => {
  const r = cells.slice(0, WIDTH);
  while (r.length < WIDTH) r.push('');
  return r;
};

const blank = () => row();

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** Plain 2dp, no currency symbol and no thousands separator — Excel needs a number. */
const money = (n: number) => round2(n).toFixed(2);

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const ALL_TIME_START = '0000-01-01';
const ALL_TIME_END = '9999-12-31';

/** One entry priced the way it will be paid, with the reasoning spelled out. */
interface PricedEntry {
  entry: WorkHoursEntry;
  category: string;
  /** Undefined when no rate applies or none is configured. Never a misleading 0. */
  rate?: number;
  /** Undefined when nothing is payable. Defined-and-zero is a real zero. */
  amount?: number;
  basis: string;
  /** A rate was needed to price this and there was not one. */
  rateMissing: boolean;
}

/**
 * Approved entries are priced from the frozen snapshot, never today's rate —
 * that is the entire point of freezing. Everything else is an estimate and
 * is labelled as one.
 */
const priceEntry = (
  entry: WorkHoursEntry,
  employeeId: string,
  lookups: PayrollLookups
): PricedEntry => {
  const category = lookups.getCategoryName(entry.categoryId) || '';

  if (entry.status === 'approved') {
    const frozen = lookups.getFrozenPay(entry.id);
    if (!frozen) {
      return {
        entry, category, rateMissing: true,
        basis: 'Approved - pay not frozen, check before paying',
      };
    }
    if (frozen.rateMissing) {
      return {
        entry, category, amount: frozen.payAmount, rateMissing: true,
        basis: 'Approved - NO RATE SET, locked at 0.00',
      };
    }
    return {
      entry, category, rate: frozen.rateSnapshot, amount: frozen.payAmount, rateMissing: false,
      basis: 'Approved - locked at the rate on the day',
    };
  }

  if (entry.status === 'pending') {
    const rate = lookups.getRate(employeeId, entry.categoryId);
    if (rate === undefined) {
      return {
        entry, category, rateMissing: true,
        basis: 'Pending - NO RATE SET',
      };
    }
    return {
      entry, category, rate, amount: (entry.totalHours || 0) * rate, rateMissing: false,
      basis: 'Pending - estimate at current rate, not yet approved',
    };
  }

  return {
    entry, category, rateMissing: false,
    basis: 'Rejected - not paid',
  };
};

/** One line of the rate breakdown: this person, this category, this rate. */
interface RateLine {
  category: string;
  rate?: number;
  approvedHours: number;
  approvedPay: number;
  pendingHours: number;
  pendingPay: number;
  rateMissing: boolean;
}

/**
 * Group by category AND rate, not category alone.
 *
 * An approved entry carries the rate frozen on the day it was approved. If
 * someone's rate changed mid-period, the same category holds two different
 * rates, and collapsing them into one line produces an average nobody
 * agreed to. Rejected entries are left out entirely — this block is money.
 */
const rateLines = (priced: PricedEntry[]): RateLine[] => {
  const byKey = new Map<string, RateLine>();

  priced.forEach(p => {
    if (p.entry.status === 'rejected') return;
    const key = `${p.category} ${p.rate === undefined ? 'none' : p.rate.toFixed(4)}`;
    const line = byKey.get(key) || {
      category: p.category,
      rate: p.rate,
      approvedHours: 0,
      approvedPay: 0,
      pendingHours: 0,
      pendingPay: 0,
      rateMissing: false,
    };
    const hours = p.entry.totalHours || 0;
    if (p.entry.status === 'approved') {
      line.approvedHours = round2(line.approvedHours + hours);
      line.approvedPay += p.amount ?? 0;
    } else {
      line.pendingHours = round2(line.pendingHours + hours);
      line.pendingPay += p.amount ?? 0;
    }
    line.rateMissing = line.rateMissing || p.rateMissing;
    byKey.set(key, line);
  });

  return Array.from(byKey.values()).sort(
    (a, b) => a.category.localeCompare(b.category) || (a.rate ?? -1) - (b.rate ?? -1)
  );
};

/** What the accountant needs flagged on this person's summary line. */
const summaryNote = (r: EmployeeRollup, priced: PricedEntry[]): string => {
  if (r.entries.length === 0) return 'No hours logged in this period';

  const notes: string[] = [];
  if (r.missingRateCount > 0) {
    notes.push(
      `${r.missingRateCount} approved ${plural(r.missingRateCount, 'entry', 'entries')} locked at 0.00 - no rate was set`
    );
  }
  const pendingNoRate = priced.filter(p => p.entry.status === 'pending' && p.rateMissing).length;
  if (pendingNoRate > 0) {
    notes.push(
      `${pendingNoRate} pending ${plural(pendingNoRate, 'entry has', 'entries have')} no rate set`
    );
  }
  if (r.rejected > 0) {
    notes.push(`${formatHours(r.rejected)} rejected hrs excluded from pay`);
  }
  return notes.join('; ');
};

/**
 * Build the whole file.
 *
 * Returns entryCount 0 rather than an empty file when the period holds no
 * shifts — the caller decides whether to warn.
 */
export const buildPayrollCSV = ({
  rollups,
  range,
  lookups,
  generatedAt = new Date(),
  generatedBy,
}: PayrollExportInput): PayrollExportResult => {
  const allTime = range.start === ALL_TIME_START && range.end === ALL_TIME_END;

  // Payroll is read alphabetically. The panel sorts by hours descending,
  // which is the right order for spotting an outlier and the wrong order
  // for ticking names off against a payroll run.
  const people = [...rollups].sort((a, b) => a.name.localeCompare(b.name));

  const priceds = new Map<string, PricedEntry[]>();
  people.forEach(r => {
    priceds.set(
      r.employeeId,
      // Ascending — a timesheet reads forwards. The panel shows newest first
      // because that is what an admin checks; a payroll run is read start to end.
      [...r.entries]
        .sort((a, b) =>
          a.workDate < b.workDate ? -1
            : a.workDate > b.workDate ? 1
            : a.startTime.localeCompare(b.startTime))
        .map(e => priceEntry(e, r.employeeId, lookups))
    );
  });

  const worked = people.filter(r => r.entries.length > 0);
  const entryCount = worked.reduce((s, r) => s + r.entries.length, 0);

  const rows: (string | number)[][] = [];

  // ------------------------------------------------------------ header
  rows.push(row('PAYROLL - HOURS AND PAY BY TEAM MEMBER'));
  rows.push(row('Period', range.label));
  rows.push(row('Dates', allTime ? 'All time' : `${range.start} to ${range.end}`));
  rows.push(row('Generated', generatedAt.toLocaleString('en-US')));
  if (generatedBy) rows.push(row('Generated by', generatedBy));
  rows.push(row('Team members with hours', worked.length));
  rows.push(row('Entries', entryCount));
  rows.push(row(
    'Note',
    'Approved pay is locked at the rate in force when it was approved. '
    + 'Pending pay is an estimate at today’s rate and is not owed until approved. '
    + 'Rejected hours are excluded from every pay figure.'
  ));

  // ------------------------------------------------ 1. payroll summary
  rows.push(blank());
  rows.push(row('1. PAYROLL SUMMARY - ONE ROW PER TEAM MEMBER'));
  rows.push(row(
    'Employee', 'Email', 'Days worked', 'Entries',
    'Approved hrs', 'Pending hrs', 'Total hrs to pay', 'Rejected hrs (unpaid)',
    'Approved pay (owed)', 'Est. pending pay', 'Total pay (approved + est.)', 'Notes'
  ));

  people.forEach(r => {
    rows.push(row(
      r.name,
      r.email,
      r.days,
      r.entries.length,
      formatHours(r.approved),
      formatHours(r.pending),
      formatHours(r.total),
      formatHours(r.rejected),
      money(r.approvedPay),
      money(r.estimatedPendingPay),
      money(r.approvedPay + r.estimatedPendingPay),
      summaryNote(r, priceds.get(r.employeeId) || [])
    ));
  });

  const sum = (pick: (r: EmployeeRollup) => number) =>
    round2(people.reduce((s, r) => s + pick(r), 0));
  const teamApprovedPay = sum(r => r.approvedPay);
  const teamPendingPay = sum(r => r.estimatedPendingPay);

  rows.push(row(
    'TEAM TOTAL',
    '',
    sum(r => r.days),
    entryCount,
    formatHours(sum(r => r.approved)),
    formatHours(sum(r => r.pending)),
    formatHours(sum(r => r.total)),
    formatHours(sum(r => r.rejected)),
    money(teamApprovedPay),
    money(teamPendingPay),
    money(teamApprovedPay + teamPendingPay),
    `${worked.length} of ${people.length} ${plural(people.length, 'person', 'people')} logged hours`
  ));

  // --------------------------------------------- 2. breakdown by rate
  rows.push(blank());
  rows.push(row('2. PAY BREAKDOWN BY RATE - ONE ROW PER PERSON PER RATE'));
  rows.push(row(
    'Employee', 'Work category', 'Hourly rate',
    'Approved hrs', 'Approved pay', 'Pending hrs', 'Est. pending pay',
    'Total hrs', 'Total pay', 'Notes'
  ));

  worked.forEach(r => {
    const lines = rateLines(priceds.get(r.employeeId) || []);
    if (lines.length === 0) return;

    lines.forEach(l => {
      rows.push(row(
        r.name,
        l.category || '(no category)',
        l.rate === undefined ? '' : money(l.rate),
        formatHours(l.approvedHours),
        money(l.approvedPay),
        formatHours(l.pendingHours),
        money(l.pendingPay),
        formatHours(l.approvedHours + l.pendingHours),
        money(l.approvedPay + l.pendingPay),
        l.rateMissing ? 'NO RATE SET - pay is understated on this line' : ''
      ));
    });

    rows.push(row(
      `TOTAL - ${r.name}`,
      '', '',
      formatHours(r.approved),
      money(r.approvedPay),
      formatHours(r.pending),
      money(r.estimatedPendingPay),
      formatHours(r.total),
      money(r.approvedPay + r.estimatedPendingPay),
      ''
    ));
  });

  // ---------------------------------------------------- 3. entry detail
  rows.push(blank());
  rows.push(row('3. ENTRY DETAIL - EVERY SHIFT, GROUPED BY TEAM MEMBER'));

  worked.forEach(r => {
    const priced = priceds.get(r.employeeId) || [];

    rows.push(blank());
    rows.push(row(`${r.name.toUpperCase()} - ${r.email}`));
    rows.push(row(
      'Employee', 'Date', 'Day', 'Time in', 'Time out', 'Break (min)', 'Hours',
      'Work category', 'Status', 'Hourly rate', 'Amount', 'Pay basis', 'Note'
    ));

    priced.forEach(p => {
      const e = p.entry;
      rows.push(row(
        r.name,
        e.workDate,
        formatWeekday(e.workDate),
        formatTime12(e.startTime),
        formatTime12(e.endTime),
        e.breakMinutes || 0,
        formatHours(e.totalHours),
        p.category,
        e.status,
        p.rate === undefined ? '' : money(p.rate),
        p.amount === undefined ? '' : money(p.amount),
        p.basis,
        e.notes || ''
      ));
    });

    rows.push(row(
      `TOTAL - ${r.name}`,
      '', '', '', '',
      '',
      formatHours(r.total),
      '', '', '',
      money(r.approvedPay + r.estimatedPendingPay),
      'Payable hours and pay, rejected excluded',
      `${r.entries.length} ${plural(r.entries.length, 'entry', 'entries')}, ${r.days} ${plural(r.days, 'day', 'days')}`
    ));

    if (r.rejected > 0) {
      rows.push(row(
        `REJECTED - ${r.name}`,
        '', '', '', '',
        '',
        formatHours(r.rejected),
        '', '', '', '',
        'Not included in the total above',
        ''
      ));
    }
  });

  const rangeSlug = allTime ? 'all-time' : `${range.start}_to_${range.end}`;

  return {
    csv: toCSV(rows),
    filename: `payroll-hours_${rangeSlug}.csv`,
    entryCount,
    employeeCount: worked.length,
  };
};
