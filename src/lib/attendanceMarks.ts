import { theme } from '../theme';
import { AttendanceRange, AttendanceSummary, SessionAttendance } from '../types/attendance';
import { STATUS_COLORS } from './attendanceColors';
import { clipToRange } from './attendanceSummary';

/**
 * What one session looks like, in one place.
 *
 * WHY THIS IS NOT STILL INSIDE AttendanceDetail
 *
 * It was, and it was the only reading of the domain in the app, so nothing
 * could disagree with it. Now the summary card draws the same sessions as a
 * strip, and two independent readings of "what does an excused absence look
 * like" is exactly how a modal ends up saying Excused in blue while the row
 * behind it shows a plain absence. One vocabulary, two renderers.
 */
export interface Mark {
  label: string;
  /** Null renders a hollow ring — used for absence, which needs no colour. */
  dot: string | null;
  muted: boolean;
  strike: boolean;
  /** Excluded from the denominator: cancelled, closed, before joining, after leaving. */
  excluded: boolean;
}

export const describeMark = (entry: SessionAttendance, accent: string): Mark => {
  if (entry.excludedReason === 'cancelled' || entry.excludedReason === 'closed') {
    return {
      label: entry.session.note || (entry.excludedReason === 'cancelled' ? 'Class cancelled' : 'Studio closed'),
      dot: null,
      muted: true,
      strike: true,
      excluded: true,
    };
  }
  if (entry.excludedReason === 'before-enrollment') {
    return { label: 'Before joining', dot: null, muted: true, strike: true, excluded: true };
  }
  if (entry.excludedReason === 'after-drop') {
    return { label: 'After leaving', dot: null, muted: true, strike: true, excluded: true };
  }
  if (entry.excludedReason === 'excused') {
    return { label: 'Excused', dot: theme.colors.status.info, muted: true, strike: false, excluded: true };
  }
  // Not yet. Muted but NOT struck through: a strike says "this did not happen",
  // and next Tuesday still might.
  if (entry.excludedReason === 'upcoming') {
    return { label: 'Not yet', dot: null, muted: true, strike: false, excluded: true };
  }

  switch (entry.status) {
    case 'present': return { label: 'Present', dot: accent, muted: false, strike: false, excluded: false };
    case 'late': return { label: 'Late', dot: theme.colors.status.warning, muted: false, strike: false, excluded: false };
    case 'absent': return { label: 'Absent', dot: null, muted: false, strike: false, excluded: false };
    // Counts against exactly as an absence does — `excluded: false` is not an
    // oversight. The whole point of carrying it as its own status is that a
    // parent expanding the row reads "Sick" instead of being left to assume
    // their child skipped.
    case 'sick': return { label: 'Sick', dot: STATUS_COLORS.sick, muted: false, strike: false, excluded: false };
    default: return { label: 'Not marked', dot: null, muted: true, strike: false, excluded: false };
  }
};

/**
 * The sessions a strip may draw beside a summary — or null, meaning draw none.
 *
 * THE AGREEMENT CHECK IS THE WHOLE POINT OF THIS FUNCTION
 *
 * The fraction on a row comes from the server: portal_my_enrollments is queried
 * with `range`, and the view does the clipping. The sessions come from
 * portal_attendance_detail, which has no range column at all, so the client has
 * to clip them itself — and the two can disagree. 'month' is the live case: the
 * view's month boundary is the database's, this one is the phone's, and at 11pm
 * on the 31st those are different months.
 *
 * A strip that disagrees with the number beside it is worse than no strip. It
 * is not a cosmetic mismatch — the whole argument for showing raw counts (§6.1,
 * AttendanceProgress) is that a parent can check them, and a strip of twelve
 * marks under the words "9 of 10 classes" hands them a contradiction instead.
 *
 * So this counts what it clipped and returns null unless that count is exactly
 * the denominator the server sent. The row then falls back to the bar, which is
 * always correct because it renders the server's own numbers and nothing else.
 */
export const stripSessions = (
  rows: SessionAttendance[] | undefined,
  summary: AttendanceSummary,
  range: AttendanceRange,
  seasonStart: string | null,
  seasonEnd: string | null,
  today: Date,
): SessionAttendance[] | null => {
  if (!rows || rows.length === 0) return null;

  const kept = clipToRange(rows.map(r => r.session), range, seasonStart, seasonEnd, today);
  const keptIds: Record<string, true> = {};
  kept.forEach(s => { keptIds[s.id] = true; });

  const clipped = rows.filter(r => keptIds[r.session.id]);
  const counted = clipped.filter(r => r.countsTowardTotal).length;

  return counted === summary.counted ? clipped : null;
};
