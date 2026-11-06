/**
 * Recurring job tasks.
 *
 * HOW A RECURRING TASK WORKS
 *
 * A job_tasks row with is_recurring = true is a SERIES: the rule, not a piece
 * of work. Its scheduled_date is the day the series starts. It never appears
 * in anyone's task list; the Recurring tab on Job Tasks is where it lives.
 *
 * Each day the rule lands on gets its own ordinary job_tasks row, an
 * OCCURRENCE, with is_recurring = false and
 * recurrence_pattern = { seriesId, occurrenceDate }. That is what people see,
 * tick off and complete, exactly like a one-off task.
 *
 * Occurrences are created by a manager's device (job_tasks_insert is
 * admin-only under RLS) whenever task data loads, for the next
 * GENERATE_AHEAD_DAYS days. Each occurrence's id is derived from
 * (seriesId, date), so two managers generating at once collide on the
 * primary key instead of creating a duplicate. The series remembers how far
 * it has been generated (`generatedThrough`), so an occurrence someone
 * deleted on purpose is not put back.
 *
 * Before this, recurrence was saved and never acted on: a "daily" task was
 * one task, done once.
 */
import { RecurrencePattern } from '../types';
import { shiftIsoDays, daysBetweenIso, studioToday } from './studioDate';

/** Occurrences are created this many days ahead, today included. */
export const GENERATE_AHEAD_DAYS = 7;

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Day of the week of a YYYY-MM-DD, 0 = Sunday. Zone-free. */
export const weekdayOf = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();

const daysInMonth = (year: number, month1: number): number =>
  new Date(Date.UTC(year, month1, 0)).getUTCDate();

const interval = (p: RecurrencePattern): number =>
  Math.max(1, Math.floor(Number(p.interval) || 1));

/**
 * The day of the month a monthly series lands on. Older rows never stored one,
 * so they fall back to the start date's day.
 */
export const monthlyDay = (p: RecurrencePattern, startDate: string): number =>
  p.dayOfMonth && p.dayOfMonth >= 1 && p.dayOfMonth <= 31
    ? p.dayOfMonth
    : Number(startDate.slice(8, 10));

/**
 * Does the rule land on `date`? Ignores pause and end date — those are
 * series state, handled by occurrenceDates.
 */
export const landsOn = (p: RecurrencePattern, startDate: string, date: string): boolean => {
  if (date < startDate) return false;
  const n = interval(p);

  if (p.frequency === 'daily') {
    return daysBetweenIso(startDate, date) % n === 0;
  }

  if (p.frequency === 'weekly') {
    // A weekly rule with no days picked means "the start date's weekday".
    const days = p.daysOfWeek && p.daysOfWeek.length > 0 ? p.daysOfWeek : [weekdayOf(startDate)];
    if (!days.includes(weekdayOf(date))) return false;
    if (n === 1) return true;
    // Count weeks Sunday-to-Sunday from the start date's week, so "every 2
    // weeks on Mon and Thu" keeps both days in the same on-week.
    const startSunday = shiftIsoDays(startDate, -weekdayOf(startDate));
    const dateSunday = shiftIsoDays(date, -weekdayOf(date));
    return (daysBetweenIso(startSunday, dateSunday) / 7) % n === 0;
  }

  // monthly
  const [sy, sm] = startDate.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  const monthsApart = (y - sy) * 12 + (m - sm);
  if (monthsApart % n !== 0) return false;
  // The 31st in a 30-day month lands on the 30th: last day, not skipped.
  const target = Math.min(monthlyDay(p, startDate), daysInMonth(y, m));
  return d === target;
};

/** Every date in [from, to] the series should have an occurrence on. */
export const occurrenceDates = (
  p: RecurrencePattern,
  startDate: string,
  from: string,
  to: string,
): string[] => {
  if (p.paused) return [];
  const last = p.endDate && p.endDate < to ? p.endDate : to;
  const first = from < startDate ? startDate : from;
  const out: string[] = [];
  // Bounded walk: a year at most, so a bad date can never spin.
  for (let d = first, i = 0; d <= last && i < 400; d = shiftIsoDays(d, 1), i++) {
    if (landsOn(p, startDate, d)) out.push(d);
  }
  return out;
};

/** The next date on or after `today` the series lands on, or null if none within a year. */
export const nextOccurrence = (p: RecurrencePattern, startDate: string, today: string): string | null => {
  if (p.paused) return null;
  const dates = occurrenceDates(p, startDate, today, shiftIsoDays(today, 366));
  return dates[0] ?? null;
};

export type SeriesState = 'active' | 'paused' | 'ended' | 'upcoming';

/**
 * Where a series stands. A series row that was completed or archived before
 * recurrence actually worked is ended — it must not wake up and start
 * creating tasks again.
 */
export const seriesState = (
  p: RecurrencePattern | undefined,
  status: string,
  startDate: string,
  today: string,
): SeriesState => {
  if (!p || status === 'completed' || status === 'archived') return 'ended';
  if (p.endDate && p.endDate < today) return 'ended';
  if (p.paused) return 'paused';
  if (startDate > today) return 'upcoming';
  return 'active';
};

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export const formatShortDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAY_SHORT[weekdayOf(iso)]}, ${MONTH_SHORT[m - 1]} ${d}${
    y !== Number(studioToday().slice(0, 4)) ? `, ${y}` : ''
  }`;
};

const listDays = (days: number[]): string => {
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first
  const key = sorted.join(',');
  if (key === '1,2,3,4,5') return 'weekdays';
  if (key === '6,0') return 'weekends';
  if (sorted.length === 7) return 'every day';
  return sorted.map(d => WEEKDAY_SHORT[d]).join(', ');
};

/** "Every Mon, Wed", "Every 2 weeks on Tue", "Monthly on the 15th", … */
export const describeRecurrence = (p: RecurrencePattern | undefined, startDate: string): string => {
  if (!p) return 'Does not repeat';
  const n = interval(p);
  if (p.frequency === 'daily') return n === 1 ? 'Every day' : `Every ${n} days`;
  if (p.frequency === 'weekly') {
    const days = p.daysOfWeek && p.daysOfWeek.length > 0 ? p.daysOfWeek : [weekdayOf(startDate)];
    const which = listDays(days);
    if (n === 1) {
      if (which === 'every day') return 'Every day';
      if (which === 'weekdays') return 'Every weekday';
      if (which === 'weekends') return 'Every weekend';
      return `Every ${which}`;
    }
    return `Every ${n} weeks on ${which}`;
  }
  const day = ordinal(monthlyDay(p, startDate));
  return n === 1 ? `Monthly on the ${day}` : `Every ${n} months on the ${day}`;
};

/**
 * A stable UUID for (seriesId, date). Not cryptographic; it only has to be the
 * same on every device and well spread, so concurrent generators hit the same
 * primary key. Formatted as a version-5-style UUID so Postgres accepts it.
 */
export const occurrenceId = (seriesId: string, date: string): string => {
  const input = `${seriesId}|${date}`;
  const words: number[] = [];
  for (let seed = 0; seed < 4; seed++) {
    let h = (0x811c9dc5 ^ (seed * 0x9e3779b9)) >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    // Final avalanche so neighbouring dates do not share prefixes.
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0;
    h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0;
    h ^= h >>> 15;
    words.push(h >>> 0);
  }
  const hex = words.map(w => w.toString(16).padStart(8, '0')).join('');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
