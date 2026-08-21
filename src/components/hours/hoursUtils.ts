/**
 * Shared helpers for the Hours Input page.
 *
 * Dates here are always handled in the user's LOCAL timezone. The older
 * WorkHoursPage uses `new Date().toISOString().split('T')[0]` to mean
 * "today", which is wrong west of UTC: after ~5pm Pacific / 7pm Central
 * the UTC date has already rolled over, so an evening shift gets filed
 * against tomorrow. Everything below goes through toISODate().
 */

import { WorkHoursEntry } from '../../types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayISO = (): string => toISODate(new Date());

export const shiftDays = (iso: string, days: number): string => {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

/** Parse YYYY-MM-DD as local midnight, never as UTC. */
export const parseISODate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

// ---------------------------------------------------------------- time

/** "15:30" -> "3:30 PM" */
export const formatTime12 = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${period}`;
};

export interface TimeOption {
  value: string;
  label: string;
}

/**
 * Every 5 minutes across the full 24 hours — 288 options.
 *
 * A long native <select> is deliberate: on a phone the OS renders it as a
 * full-screen scrollable list with large tap targets, which beats a time
 * spinner and makes an invalid time impossible to enter.
 */
export const TIME_OPTIONS: TimeOption[] = Array.from({ length: 24 * 12 }, (_, i) => {
  const value = `${pad(Math.floor(i / 12))}:${pad((i % 12) * 5)}`;
  return { value, label: formatTime12(value) };
});

// ---------------------------------------------------------------- dates

/** "2026-08-11" -> "08/11/26" */
export const formatDateShort = (iso: string): string => {
  const d = parseISODate(iso);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${String(d.getFullYear()).slice(-2)}`;
};

/** "2026-08-11" -> "Tue, Aug 11" */
export const formatDateLong = (iso: string): string =>
  parseISODate(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

// ---------------------------------------------------------------- hours

/** Decimal hours, always 2dp — 3.67, not 3:40. Matches payroll convention. */
export const formatHours = (n: number): string => (Number.isFinite(n) ? n : 0).toFixed(2);

/**
 * Sum a list of entries.
 *
 * Sums raw values and rounds once at the end. Rounding each entry first and
 * then adding lets 2dp error accumulate across a long period.
 */
export const sumHours = (entries: WorkHoursEntry[]): number =>
  Math.round(entries.reduce((sum, e) => sum + (e.totalHours || 0), 0) * 100) / 100;

/**
 * Hours that should actually be paid: approved plus still-pending.
 *
 * Rejected entries are excluded on purpose. A rejection means an admin
 * looked at the entry and said it was wrong, so rolling it into a payroll
 * total is a route to overpaying. Rejected hours are never hidden — they
 * are reported on their own line — but they do not count until the
 * employee corrects the entry, which returns it to 'pending'.
 */
export const sumPayableHours = (entries: WorkHoursEntry[]): number =>
  sumHours(entries.filter(e => e.status !== 'rejected'));

export const countDays = (entries: WorkHoursEntry[]): number =>
  new Set(entries.map(e => e.workDate)).size;

// ---------------------------------------------------------------- periods

export type PeriodPreset = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'all';

export interface DateRange {
  start: string;
  end: string;
  label: string;
}

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  'this-week': 'This week',
  'last-week': 'Last week',
  'this-month': 'This month',
  'last-month': 'Last month',
  all: 'All time',
};

/**
 * Weeks run Sunday -> Saturday, the usual US payroll convention.
 *
 * Note this differs from the `work_hours_summary` SQL view, which uses
 * DATE_TRUNC('week') and therefore ISO Monday-start weeks. That view is
 * unused by the app; if it is ever wired up, reconcile the two first.
 */
export const resolvePeriod = (preset: PeriodPreset, today = todayISO()): DateRange => {
  const now = parseISODate(today);

  const startOfWeek = (d: Date): Date => {
    const s = new Date(d);
    s.setDate(s.getDate() - s.getDay()); // getDay(): 0 = Sunday
    return s;
  };

  switch (preset) {
    case 'this-week': {
      const s = startOfWeek(now);
      return { start: toISODate(s), end: toISODate(new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6)), label: PERIOD_LABELS[preset] };
    }
    case 'last-week': {
      const s = startOfWeek(now);
      s.setDate(s.getDate() - 7);
      return { start: toISODate(s), end: toISODate(new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6)), label: PERIOD_LABELS[preset] };
    }
    case 'this-month':
      return {
        start: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
        label: PERIOD_LABELS[preset],
      };
    case 'last-month':
      return {
        start: toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: toISODate(new Date(now.getFullYear(), now.getMonth(), 0)),
        label: PERIOD_LABELS[preset],
      };
    case 'all':
    default:
      return { start: '0000-01-01', end: '9999-12-31', label: PERIOD_LABELS.all };
  }
};

export const inRange = (entry: WorkHoursEntry, range: DateRange): boolean =>
  entry.workDate >= range.start && entry.workDate <= range.end;

// ---------------------------------------------------------------- export

/**
 * RFC-4180 field: quote always, double any embedded quote.
 *
 * The leading apostrophe is a separate concern from delimiter escaping.
 * Excel and LibreOffice strip the surrounding quotes on import and then
 * evaluate any cell whose text starts with =, +, -, @, tab or CR as a
 * formula. Notes and employee names are free text, so a note reading
 * `=1+1` would execute on open. Prefixing forces it to stay text.
 */
const csvCell = (v: unknown): string => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export const toCSV = (rows: (string | number)[][]): string =>
  rows.map(r => r.map(csvCell).join(',')).join('\r\n');

/**
 * Hand the browser a file to save.
 *
 * The BOM makes Excel read the file as UTF-8 instead of the local ANSI
 * codepage, which otherwise mangles any accented name.
 */
export const downloadCSV = (filename: string, csv: string): void => {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
