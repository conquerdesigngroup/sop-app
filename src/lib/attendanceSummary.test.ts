import { sessionBreakdown, summarise, summariseEnrollment } from './attendanceSummary';
import {
  AttendanceRecord,
  ClassSession,
  Enrollment,
} from '../types/attendance';

/**
 * The denominator rules from §3.6, as tests.
 *
 * These are the acceptance items that are pure arithmetic (W1.3–W1.5, W4.2–W4.4).
 * They are worth pinning in a unit test rather than only checking on screen,
 * because every one of them fails *silently*: a wrong denominator still renders
 * as a perfectly plausible percentage, and the only person who would notice is
 * a parent counting Tuesdays on their calendar.
 */

const SEASON: string[] = [
  '2026-06-16', '2026-06-23', '2026-06-30', '2026-07-07', '2026-07-14', '2026-07-21',
  '2026-07-28', '2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25', '2026-09-01',
];

const session = (date: string, status: ClassSession['status'] = 'held'): ClassSession => ({
  id: `ses-${date}`,
  classId: 'cls',
  sessionDate: date,
  status,
  source: 'import',
  note: null,
});

const mark = (date: string, status: AttendanceRecord['status']): AttendanceRecord => ({
  id: `att-${date}`,
  studentId: 'stu',
  classId: 'cls',
  sessionId: `ses-${date}`,
  status,
  importBatchId: 'batch',
});

const enrollment = (over: Partial<Enrollment> = {}): Enrollment => ({
  id: 'enr',
  studentId: 'stu',
  classId: 'cls',
  season: 'Summer 2026',
  status: 'active',
  enrolledOn: '2026-06-15',
  droppedOn: null,
  ...over,
});

describe('attendance denominator', () => {
  it('counts every held session a fully-enrolled student attended', () => {
    const sessions = SEASON.map(d => session(d));
    const attendance = SEASON.map(d => mark(d, 'present'));

    const result = summariseEnrollment(enrollment(), sessions, attendance);
    expect(result).toMatchObject({ attended: 12, counted: 12, percent: 100 });
  });

  // W1.4 / W4.2 — a cancelled session leaves every denominator and lowers
  // nobody's percentage.
  it('removes a cancelled session from the denominator without lowering the percentage', () => {
    const attended = SEASON.filter(d => d !== '2026-08-04').map(d => mark(d, 'present'));

    const before = summariseEnrollment(
      enrollment(),
      SEASON.filter(d => d !== '2026-08-04').map(d => session(d)),
      attended,
    );
    const after = summariseEnrollment(
      enrollment(),
      SEASON.map(d => (d === '2026-08-04' ? session(d, 'cancelled') : session(d))),
      attended,
    );

    expect(after.counted).toBe(before.counted);
    expect(after.percent).toBe(before.percent);
    expect(after.counted).toBe(11);
  });

  // W1.3 / W4.3 — a student who joined at week 6 of a 12-week season has a
  // denominator of 7, not 12.
  it('scopes the denominator to the enrollment start date', () => {
    const sessions = SEASON.map(d => session(d));
    const attendance = SEASON.filter(d => d >= '2026-07-21').map(d => mark(d, 'present'));

    const result = summariseEnrollment(enrollment({ enrolledOn: '2026-07-21' }), sessions, attendance);
    expect(result.counted).toBe(7);
    expect(result.percent).toBe(100);
  });

  it('stops counting after a drop date', () => {
    const sessions = SEASON.map(d => session(d));
    const attendance = SEASON.filter(d => d <= '2026-07-14').map(d => mark(d, 'present'));

    const result = summariseEnrollment(
      enrollment({ status: 'dropped', droppedOn: '2026-07-14' }),
      sessions,
      attendance,
    );
    expect(result.counted).toBe(5);
    expect(result.percent).toBe(100);
  });

  // W1.5 — excused is policy, and the policy is a settings row.
  it('excludes an excused absence by default and counts it when policy says so', () => {
    const sessions = SEASON.map(d => session(d));
    const attendance = SEASON.map(d => mark(d, d === '2026-08-11' ? 'excused' : 'present'));

    const lenient = summariseEnrollment(enrollment(), sessions, attendance);
    expect(lenient).toMatchObject({ attended: 11, counted: 11, percent: 100 });

    const strict = summariseEnrollment(enrollment(), sessions, attendance, {
      excusedCountsAgainst: true,
    });
    expect(strict).toMatchObject({ attended: 11, counted: 12, percent: 92 });
  });

  it('treats a late arrival as attendance', () => {
    const sessions = SEASON.map(d => session(d));
    const attendance = SEASON.map(d => mark(d, d === '2026-07-07' ? 'late' : 'present'));

    expect(summariseEnrollment(enrollment(), sessions, attendance).percent).toBe(100);
  });

  // W4.4 — the one that must never render as 0% or NaN.
  it('reports a null percentage rather than zero when nothing has been held', () => {
    const result = summariseEnrollment(enrollment(), [], []);
    expect(result).toMatchObject({ attended: 0, counted: 0, percent: null });
    expect(Number.isNaN(result.percent as number)).toBe(false);
  });

  it('reports null when every session so far was cancelled', () => {
    const sessions = SEASON.slice(0, 3).map(d => session(d, 'cancelled'));
    expect(summariseEnrollment(enrollment(), sessions, []).percent).toBeNull();
  });
});

describe('session breakdown', () => {
  it('names why each excluded session does not count', () => {
    const sessions = [
      session('2026-06-16'),
      session('2026-08-04', 'cancelled'),
      session('2026-08-11'),
    ];
    const attendance = [mark('2026-08-11', 'excused')];

    const rows = sessionBreakdown(sessions, attendance, enrollment({ enrolledOn: '2026-07-21' }));

    expect(rows.map(r => r.excludedReason)).toEqual(['before-enrollment', 'cancelled', 'excused']);
    expect(rows.every(r => !r.countsTowardTotal)).toBe(true);
    expect(summarise(rows).percent).toBeNull();
  });

  it('returns sessions in date order regardless of input order', () => {
    const rows = sessionBreakdown(
      [session('2026-08-11'), session('2026-06-16'), session('2026-07-07')],
      [],
      enrollment(),
    );
    expect(rows.map(r => r.session.sessionDate)).toEqual(['2026-06-16', '2026-07-07', '2026-08-11']);
  });
});
