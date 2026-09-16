import { ClassDay } from './attendanceStaff';

/**
 * What the dashboard's "Your classes today" card says about each class.
 *
 * Pure, and tested, for the same reason buildDay is: every pill is a claim
 * about a register. "Done" on a class with a dancer still unmarked, or an amber
 * warning on a class that has not started yet, is the kind of wrong a teacher
 * learns to scroll past — and then scrolls past on the day it is right.
 *
 * Times are compared as HH:MM strings on the studio's clock (studioClock),
 * never through Date. A class's start_time is a bare Postgres `time` with no
 * zone on it; 16:30 is 16:30 in the studio wherever the phone happens to be.
 */

/** 'HH:MM' or 'HH:MM:SS' as minutes past midnight. Null for anything else. */
export const minutesOf = (time: string | null): number | null => {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
};

/** A class with no usable end time is given an hour, the length of most. */
const ASSUMED_MINUTES = 60;

export type ClassPhase = 'upcoming' | 'on' | 'over' | 'unknown';

/**
 * Where a class on today's schedule is against the studio's clock.
 *
 * 'unknown' is a class with no start time. That is a data problem, and the
 * card must not guess at it in either direction — neither "on now" nor
 * "not started" is something it knows.
 */
export const classPhase = (startTime: string | null, endTime: string | null, clock: string): ClassPhase => {
  const start = minutesOf(startTime);
  const now = minutesOf(clock);
  if (start === null || now === null) return 'unknown';
  const endRaw = minutesOf(endTime);
  const end = endRaw !== null && endRaw > start ? endRaw : start + ASSUMED_MINUTES;
  if (now < start) return 'upcoming';
  if (now < end) return 'on';
  return 'over';
};

/**
 * muted — nothing to do (yet, or at all)
 * live  — the class is running and its register is open
 * due   — the class has finished, or has no time, and dancers are unmarked
 * done  — every dancer on the roster has a mark
 */
export type RegisterTone = 'muted' | 'live' | 'due' | 'done';

export interface RegisterState {
  tone: RegisterTone;
  /** What the pill says. Short enough to sit beside a class name on a phone. */
  label: string;
  /** What a screen reader says: "3 of 12" alone does not say of what. */
  description: string;
}

const dancers = (n: number) => `${n} ${n === 1 ? 'dancer' : 'dancers'}`;

/**
 * The pill for one class.
 *
 * Mirrors the Attendance page's own row — not held beats everything, and
 * "Done" means every dancer on the roster has a mark — with two differences
 * that only make sense on a dashboard read all day long. A class that has not
 * started says how many are coming instead of "0 of 12" in amber, which would
 * nag a teacher at nine in the morning about a class at five. And an empty
 * roster says so, rather than showing "0 of 0" as work still to do.
 */
export const registerState = (day: ClassDay, phase: ClassPhase): RegisterState => {
  const { session, expected, marked } = day;

  if (session.status !== 'held') {
    const label = session.status === 'cancelled' ? 'Cancelled' : 'Closed';
    return { tone: 'muted', label, description: `${label} today` };
  }
  if (expected === 0) {
    return { tone: 'muted', label: 'No dancers', description: 'Nobody is on the roster' };
  }
  if (marked >= expected) {
    return { tone: 'done', label: 'Done', description: `All ${dancers(expected)} marked` };
  }

  const progress = `${marked} of ${expected}`;
  const description = `${marked} of ${dancers(expected)} marked`;

  if (phase === 'upcoming') {
    // A mark taken early — an absence phoned in — still shows as progress.
    return marked > 0
      ? { tone: 'muted', label: progress, description }
      : { tone: 'muted', label: dancers(expected), description: `${dancers(expected)} on the roster` };
  }
  if (phase === 'on') return { tone: 'live', label: progress, description };
  return { tone: 'due', label: progress, description };
};
