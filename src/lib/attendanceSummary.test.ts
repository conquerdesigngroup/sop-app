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

/**
 * The v52 bound: a session that has not happened yet is not an absence.
 *
 * WHY THIS IS THE MOST IMPORTANT TEST IN THE FILE
 *
 * Until v52 every session in the table was in the past, because they only ever
 * arrived from an import of classes that had already met. Generating the
 * season's schedule up front — which is what makes "nobody took attendance on
 * the 9th" answerable at all — puts ~40 future Tuesdays in front of every
 * dancer, and the old denominator counted a held session with no mark as a
 * miss. Every child would have read about 5% in September.
 *
 * It is exactly the failure §3.6 was written to prevent: plausible, and wrong.
 */
describe('sessions that have not happened yet', () => {
  const TODAY = new Date('2026-07-15T12:00:00');

  it('does not count a future session against anyone', () => {
    const sessions = SEASON.map(d => session(d));
    const attendance = ['2026-06-16', '2026-06-23', '2026-06-30', '2026-07-07', '2026-07-14']
      .map(d => mark(d, 'present'));

    const result = summariseEnrollment(enrollment(), sessions, attendance, undefined, TODAY);

    // Five have happened and all five were attended. The other seven are still
    // to come and belong in neither half of the fraction.
    expect(result).toMatchObject({ attended: 5, counted: 5, percent: 100 });
  });

  it('marks a future session upcoming rather than unattended', () => {
    const rows = sessionBreakdown(SEASON.map(d => session(d)), [], enrollment(), undefined, TODAY);

    const future = rows.filter(r => r.session.sessionDate > '2026-07-15');
    expect(future).toHaveLength(7);
    expect(future.every(r => r.excludedReason === 'upcoming')).toBe(true);
    expect(future.every(r => r.countsTowardTotal === false)).toBe(true);
  });

  it('generating the rest of the season does not move the percentage', () => {
    const held = ['2026-06-16', '2026-06-23', '2026-06-30', '2026-07-07', '2026-07-14'];
    const attendance = held.map((d, i) => mark(d, i === 0 ? 'absent' : 'present'));

    const before = summariseEnrollment(
      enrollment(), held.map(d => session(d)), attendance, undefined, TODAY,
    );
    const after = summariseEnrollment(
      enrollment(), SEASON.map(d => session(d)), attendance, undefined, TODAY,
    );

    expect(before).toMatchObject({ attended: 4, counted: 5, percent: 80 });
    expect(after).toEqual(before);
  });

  it('still prefers after-drop over upcoming for a dancer who has left', () => {
    const rows = sessionBreakdown(
      SEASON.map(d => session(d)), [], enrollment({ droppedOn: '2026-07-07' }), undefined, TODAY,
    );

    const later = rows.find(r => r.session.sessionDate === '2026-08-04');
    expect(later?.excludedReason).toBe('after-drop');
  });
});

/**
 * Sick counts against, and says so. Studio decision, 2026-09-08.
 *
 * The arithmetic half is a one-liner; it is here because the temptation to
 * treat sick as a gentler excused is real, and doing so would silently inflate
 * every percentage the studio reports.
 */
describe('sick', () => {
  const TODAY = new Date('2026-09-08T12:00:00');

  it('lowers the percentage exactly as an absence does', () => {
    const sessions = SEASON.map(d => session(d));
    const sick = SEASON.map((d, i) => mark(d, i === 0 ? 'sick' : 'present'));
    const absent = SEASON.map((d, i) => mark(d, i === 0 ? 'absent' : 'present'));

    const withSick = summariseEnrollment(enrollment(), sessions, sick, undefined, TODAY);
    const withAbsent = summariseEnrollment(enrollment(), sessions, absent, undefined, TODAY);

    expect(withSick).toMatchObject({ attended: 11, counted: 12, percent: 92 });
    expect(withSick).toEqual(withAbsent);
  });

  it('stays in the denominator where an excused absence does not', () => {
    const sessions = SEASON.map(d => session(d));
    const excused = SEASON.map((d, i) => mark(d, i === 0 ? 'excused' : 'present'));

    const result = summariseEnrollment(enrollment(), sessions, excused, undefined, TODAY);

    // Excused is subtracted from the denominator; sick is not.
    expect(result).toMatchObject({ attended: 11, counted: 11, percent: 100 });
  });

  it('keeps the reason on the session, so a parent is not left guessing', () => {
    const rows = sessionBreakdown(
      SEASON.map(d => session(d)),
      [mark('2026-06-16', 'sick')],
      enrollment(),
      undefined,
      TODAY,
    );

    const day = rows.find(r => r.session.sessionDate === '2026-06-16');
    expect(day?.status).toBe('sick');
    expect(day?.countsTowardTotal).toBe(true);
    expect(day?.excludedReason).toBeNull();
  });
});
