import { describeMark, stripSessions } from './attendanceMarks';
import { sessionBreakdown } from './attendanceSummary';
import {
  AttendanceRecord,
  AttendanceSummary,
  ClassSession,
  Enrollment,
  SessionAttendance,
} from '../types/attendance';

/**
 * The rule the strip lives or dies by: it draws only when it can prove it is
 * describing the same sessions the fraction beside it was computed from.
 *
 * This is worth a unit test rather than a look at the screen because the
 * failure is silent and plausible. A strip clipped to the wrong window renders
 * as a perfectly normal row of marks; the only symptom is that counting them
 * gives a different answer from the words underneath, and the one person
 * positioned to notice is a parent who already half-suspects the number.
 */

const SEASON: string[] = [
  '2026-06-16', '2026-06-23', '2026-06-30', '2026-07-07', '2026-07-14',
  '2026-07-21', '2026-07-28', '2026-08-04', '2026-08-11', '2026-08-18',
];

const ACCENT = '#9B8AE0';

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

const summary = (attended: number, counted: number): AttendanceSummary => ({
  studentId: 'stu',
  classId: 'cls',
  enrollmentId: 'enr',
  attended,
  counted,
  percent: counted === 0 ? null : Math.round((attended / counted) * 100),
});

/** The rows the detail view returns: every session, unclipped. */
const allRows = (over: { cancelled?: string[]; absent?: string[] } = {}): SessionAttendance[] =>
  sessionBreakdown(
    SEASON.map(d => session(d, over.cancelled?.includes(d) ? 'cancelled' : 'held')),
    SEASON
      .filter(d => !over.cancelled?.includes(d))
      .map(d => mark(d, over.absent?.includes(d) ? 'absent' : 'present')),
    enrollment(),
  );

describe('stripSessions', () => {
  it('draws the season when its own count matches the server denominator', () => {
    const rows = allRows({ absent: ['2026-07-07'] });
    const out = stripSessions(rows, summary(9, 10), 'season', null, null, new Date('2026-08-20'));

    expect(out).not.toBeNull();
    expect(out).toHaveLength(10);
  });

  it('refuses to draw when its clip disagrees with the denominator', () => {
    // The server says eight counted; the client can only see ten. That is
    // precisely the month-boundary case the check exists for, and the honest
    // answer is no strip rather than a contradiction.
    const out = stripSessions(allRows(), summary(8, 8), 'all', null, null, new Date('2026-08-20'));
    expect(out).toBeNull();
  });

  it('excludes cancelled sessions from the count it checks, but still draws them', () => {
    // Two cancelled: the denominator is eight, and the strip still shows ten
    // marks — the two dashes are what make "8 of 8" checkable against a
    // calendar that has ten Tuesdays on it.
    const rows = allRows({ cancelled: ['2026-06-30', '2026-08-04'] });
    const out = stripSessions(rows, summary(8, 8), 'all', null, null, new Date('2026-08-20'));

    expect(out).toHaveLength(10);
    expect(out!.filter(r => r.countsTowardTotal)).toHaveLength(8);
  });

  it('clips to the season bounds the class actually carries', () => {
    const out = stripSessions(
      allRows(),
      summary(6, 6),
      'season',
      '2026-07-14',
      '2026-08-18',
      new Date('2026-08-20'),
    );

    expect(out).toHaveLength(6);
    expect(out![0].session.sessionDate).toBe('2026-07-14');
  });

  it('draws nothing for a class that has not met', () => {
    expect(stripSessions([], summary(0, 0), 'season', null, null, new Date())).toBeNull();
    expect(stripSessions(undefined, summary(0, 0), 'season', null, null, new Date())).toBeNull();
  });
});

describe('describeMark', () => {
  it('gives attendance the class accent and absence a hollow mark', () => {
    const rows = allRows({ absent: ['2026-07-07'] });
    const present = rows.find(r => r.session.sessionDate === '2026-06-16')!;
    const absent = rows.find(r => r.session.sessionDate === '2026-07-07')!;

    expect(describeMark(present, ACCENT).dot).toBe(ACCENT);
    expect(describeMark(absent, ACCENT).dot).toBeNull();
    expect(describeMark(absent, ACCENT).excluded).toBe(false);
  });

  it('marks a cancelled session excluded, so it is never drawn as an absence', () => {
    const rows = allRows({ cancelled: ['2026-06-30'] });
    const cancelled = rows.find(r => r.session.sessionDate === '2026-06-30')!;

    const out = describeMark(cancelled, ACCENT);
    expect(out.excluded).toBe(true);
    expect(out.label).toBe('Class cancelled');
  });

  it('treats late as attendance, not as a problem', () => {
    const rows = sessionBreakdown(
      [session('2026-06-16')],
      [mark('2026-06-16', 'late')],
      enrollment(),
    );
    expect(describeMark(rows[0], ACCENT).excluded).toBe(false);
    expect(describeMark(rows[0], ACCENT).dot).not.toBeNull();
  });
});

/**
 * The two marks v52 adds, in the parent's register.
 *
 * describeMark is the gentler of the two vocabularies — the teacher's capture
 * screen uses STATUS_COLORS and its own five full-strength hues. What these
 * pin is that the softer reading never loses the *reason*, which is the whole
 * argument for carrying sick as its own status instead of writing 'absent'.
 */
describe('sick and upcoming marks', () => {
  const entry = (over: Partial<SessionAttendance>): SessionAttendance => ({
    session: session('2026-06-16'),
    status: null,
    countsTowardTotal: true,
    excludedReason: null,
    ...over,
  });

  it('says Sick, and does not quietly exclude it', () => {
    const mark = describeMark(entry({ status: 'sick' }), ACCENT);

    expect(mark.label).toBe('Sick');
    // It counts against. A muted or excluded rendering here would contradict
    // the number the card shows beside it.
    expect(mark.excluded).toBe(false);
    expect(mark.muted).toBe(false);
    expect(mark.strike).toBe(false);
    expect(mark.dot).toBeTruthy();
  });

  it('gives Sick a different dot from Absent, Late and Excused', () => {
    const dots = (['sick', 'late'] as const).map(s => describeMark(entry({ status: s }), ACCENT).dot);
    const excused = describeMark(entry({ status: 'excused', excludedReason: 'excused' }), ACCENT).dot;
    const absent = describeMark(entry({ status: 'absent' }), ACCENT).dot;

    expect(new Set([...dots, excused]).size).toBe(3);
    expect(absent).toBeNull();
  });

  it('reads an upcoming session as Not yet, without striking it through', () => {
    const mark = describeMark(
      entry({ countsTowardTotal: false, excludedReason: 'upcoming' }),
      ACCENT,
    );

    expect(mark.label).toBe('Not yet');
    expect(mark.excluded).toBe(true);
    // A strike says the class did not happen. Next Tuesday still might.
    expect(mark.strike).toBe(false);
  });
});
