/**
 * Work hours on a Team Schedule day: the start and end time someone is
 * rostered for (migration v77, `work_days.start_time` / `end_time`).
 *
 * These are the PLANNED hours, not hours worked. Submitted hours still live
 * in Hours Input (`work_hours`) and must not be mixed in here.
 *
 * Both columns are nullable. A day with no times is still a scheduled day,
 * it just has no set hours; every helper below treats "one of the two is
 * missing" the same as "no set hours" so a half-filled row never renders
 * as "9:00 AM – ".
 */

import { formatTime12 } from './hoursUtils';

export interface ShiftTimes {
  startTime?: string; // "HH:MM", 24-hour
  endTime?: string;
}

/**
 * Postgres `time` comes back as "09:00:00"; the selects use "09:00".
 * Anything that is not a recognisable time becomes undefined.
 */
export const normalizeTime = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const hasShiftTimes = (t: ShiftTimes | undefined | null): boolean =>
  !!(t && t.startTime && t.endTime);

/** "9:00 AM – 5:00 PM", or undefined when the day has no set hours. */
export const formatShiftRange = (t: ShiftTimes | undefined | null): string | undefined => {
  if (!t || !t.startTime || !t.endTime) return undefined;
  return `${formatTime12(t.startTime)} – ${formatTime12(t.endTime)}`;
};

/** "9:00" -> "9", "9:30" -> "9:30", with a/p: compact enough for a calendar chip. */
const shortTime = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h >= 12 ? 'p' : 'a';
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, '0')}${suffix}`;
};

/** "9a–5p", "9:30a–1p", or undefined when the day has no set hours. */
export const formatShiftShort = (t: ShiftTimes | undefined | null): string | undefined => {
  if (!t || !t.startTime || !t.endTime) return undefined;
  return `${shortTime(t.startTime)}–${shortTime(t.endTime)}`;
};

/** Length of the shift in hours, e.g. 7.5. Undefined without both times. */
export const shiftLengthHours = (t: ShiftTimes | undefined | null): number | undefined => {
  if (!t || !t.startTime || !t.endTime) return undefined;
  const diff = toMinutes(t.endTime) - toMinutes(t.startTime);
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : undefined;
};

/** "8 hrs", "7.5 hrs", "1 hr". */
export const formatShiftLength = (t: ShiftTimes | undefined | null): string | undefined => {
  const h = shiftLengthHours(t);
  if (h === undefined) return undefined;
  return `${h} ${h === 1 ? 'hr' : 'hrs'}`;
};

/**
 * Null when the pair is fine to save: both blank (no set hours) or both set
 * with the end after the start. Otherwise a sentence to show the person.
 */
export const validateShift = (t: ShiftTimes): string | null => {
  const { startTime, endTime } = t;
  if (!startTime && !endTime) return null;
  if (!startTime) return 'Add a start time, or clear the end time.';
  if (!endTime) return 'Add an end time, or clear the start time.';
  if (toMinutes(endTime) <= toMinutes(startTime)) return 'The end time has to be after the start time.';
  return null;
};
