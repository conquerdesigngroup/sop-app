import { studioDate } from './studioDate';
import {
  AttendanceRange,
  AttendanceRecord,
  AttendanceSettings,
  AttendanceSummary,
  ClassSession,
  DEFAULT_ATTENDANCE_SETTINGS,
  Enrollment,
  SessionAttendance,
} from '../types/attendance';

/**
 * The percentage definition from §3.6, in one place.
 *
 * WHY THIS EXISTS IN TYPESCRIPT AT ALL
 *
 * The spec says the frontend reads `portal_attendance_summary` and never
 * invents its own arithmetic, and that stays true — `attendanceQueries` reads
 * the view in live mode. This module is the *same* definition expressed once
 * more for two jobs the view cannot do: driving the seed fixture before the
 * tables exist, and computing the session-by-session exclusion markers the
 * detail view needs. Keeping it in one file means there are two
 * implementations total, not one per component, and they can be diffed.
 *
 * THE DENOMINATOR IS THE WHOLE PROBLEM
 *
 * A progress bar is a fraction and every way this feature can be unfair lives
 * in `counted`:
 *
 *   - a session the studio cancelled must not count against anyone;
 *   - a child who enrolled in week 6 is not absent for weeks 1–5;
 *   - a child who dropped in week 9 is not absent for weeks 10–12;
 *   - an excused absence does not count by default, because the studio said so
 *     — and that is a settings row, not a constant, because it is a policy
 *     question they may revisit.
 *
 * Every one of those is a subtraction from the denominator, so each is applied
 * in `sessionBreakdown` and nowhere else. `summarise` just counts what that
 * returns.
 */

/**
 * A Date as the 'YYYY-MM-DD' a session_date is stored as, in the STUDIO's zone.
 *
 * Not the device's, and not toISOString() (UTC, which rolls over during a
 * 5:20pm Pacific class — the exact hour this matters most). A session_date is a
 * bare date chosen in the studio's calendar, so the "today" it is compared
 * against has to resolve there too. studioDate() is the same rule the job-task
 * badges and the push digest already use, and it is the exact twin of v52's
 * SQL studio_today().
 *
 * Getting this wrong is not cosmetic: staff_mark_attendance refuses a session
 * dated after studio_today(), so a client an hour ahead of the server would
 * tell a teacher "that class has not happened yet" while they are standing in
 * it.
 */
export const isoDay = (d: Date): string => studioDate(d);

const inRange = (date: string, from: string | null, to: string | null): boolean => {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
};

/**
 * Join a class's sessions to one student's marks, deciding for each whether it
 * counts and, when it does not, why.
 *
 * Order matters: a session that was cancelled is excluded for everyone before
 * anyone's enrollment dates are consulted, because the class did not happen.
 */
export const sessionBreakdown = (
  sessions: ClassSession[],
  attendance: AttendanceRecord[],
  enrollment: Enrollment,
  settings: AttendanceSettings = DEFAULT_ATTENDANCE_SETTINGS,
  today: Date = new Date(),
): SessionAttendance[] => {
  const todayIso = isoDay(today);

  const bySession = new Map(attendance.map(a => [a.sessionId, a]));

  return sessions
    .slice()
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
    .map(session => {
      const record = bySession.get(session.id) ?? null;
      const status = record?.status ?? null;

      // The class did not happen. Nobody is measured against it.
      if (session.status !== 'held') {
        return {
          session,
          status,
          countsTowardTotal: false,
          excludedReason: session.status === 'cancelled' ? 'cancelled' as const : 'closed' as const,
        };
      }

      // Outside this enrollment's window — they were not in the room yet, or
      // had already left.
      if (session.sessionDate < enrollment.enrolledOn) {
        return { session, status, countsTowardTotal: false, excludedReason: 'before-enrollment' as const };
      }
      if (enrollment.droppedOn && session.sessionDate > enrollment.droppedOn) {
        return { session, status, countsTowardTotal: false, excludedReason: 'after-drop' as const };
      }

      // Has not happened yet. Ordered AFTER the enrollment window to match
      // portal_attendance_detail: for a dancer who has left, every remaining
      // date is 'after-drop', which says more than 'upcoming' does.
      if (session.sessionDate > todayIso) {
        return { session, status, countsTowardTotal: false, excludedReason: 'upcoming' as const };
      }

      // Studio policy, not arithmetic. Note 'sick' is deliberately absent from
      // this branch: it counts against, and only its label differs from a
      // plain absence.
      if (status === 'excused' && !settings.excusedCountsAgainst) {
        return { session, status, countsTowardTotal: false, excludedReason: 'excused' as const };
      }

      return { session, status, countsTowardTotal: true, excludedReason: null };
    });
};

/** 'present' and 'late' are both attendance. A child who arrived late was there. */
const isAttended = (status: string | null): boolean => status === 'present' || status === 'late';

/**
 * Reduce a breakdown to the numbers the card renders.
 *
 * `percent` is null rather than 0 when nothing counts — see the type comment.
 */
export const summarise = (breakdown: SessionAttendance[]): { attended: number; counted: number; percent: number | null } => {
  const counted = breakdown.filter(s => s.countsTowardTotal).length;
  const attended = breakdown.filter(s => s.countsTowardTotal && isAttended(s.status)).length;

  return {
    attended,
    counted,
    percent: counted === 0 ? null : Math.round((attended / counted) * 100),
  };
};

/**
 * Clip a session list to the window the user picked.
 *
 * 'season' uses the class's own season_start/season_end when it has them —
 * a studio's season is not a calendar year and guessing would be worse than
 * showing everything.
 */
export const clipToRange = (
  sessions: ClassSession[],
  range: AttendanceRange,
  seasonStart: string | null,
  seasonEnd: string | null,
  today: Date,
): ClassSession[] => {
  if (range === 'all') return sessions;

  if (range === 'month') {
    const y = today.getFullYear();
    const m = `${today.getMonth() + 1}`.padStart(2, '0');
    const prefix = `${y}-${m}`;
    return sessions.filter(s => s.sessionDate.startsWith(prefix));
  }

  return sessions.filter(s => inRange(s.sessionDate, seasonStart, seasonEnd));
};

/** Convenience wrapper: everything above, for one enrollment. */
export const summariseEnrollment = (
  enrollment: Enrollment,
  sessions: ClassSession[],
  attendance: AttendanceRecord[],
  settings: AttendanceSettings = DEFAULT_ATTENDANCE_SETTINGS,
  today: Date = new Date(),
): AttendanceSummary => {
  const breakdown = sessionBreakdown(sessions, attendance, enrollment, settings, today);
  const { attended, counted, percent } = summarise(breakdown);

  return {
    studentId: enrollment.studentId,
    classId: enrollment.classId,
    enrollmentId: enrollment.id,
    attended,
    counted,
    percent,
  };
};
