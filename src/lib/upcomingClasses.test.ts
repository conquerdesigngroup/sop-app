import {
  buildSeriesIcs,
  buildUpcoming,
  clockTime,
  nextOccurrences,
  nextPerClass,
  relativeDay,
} from './upcomingClasses';
import { AttendanceClass, ClassSession, Enrollment, Student } from '../types/attendance';

/**
 * The schedule projection, pinned.
 *
 * This is date arithmetic driving a claim a parent will act on — "be at Studio A
 * on Tuesday". Every failure mode here is silent and confidently wrong: an
 * off-by-one weekday, a UTC parse that shifts the day, a cancelled week that
 * still gets announced. None of them look like errors on screen.
 */

// A Sunday, so "next Tuesday" is two days out and nothing is ambiguous.
const SUNDAY = new Date(2026, 7, 30, 12, 0, 0);

const klass = (over: Partial<AttendanceClass> = {}): AttendanceClass => ({
  id: 'cls',
  name: 'Junior Ballet',
  style: 'Ballet',
  category: 'academy',
  dayOfWeek: 2,
  startTime: '16:30:00',
  endTime: '17:30:00',
  seasonStart: '2026-06-15',
  seasonEnd: '2026-09-30',
  location: 'Studio A',
  instructorName: 'Jess Moreau',
  level: 'Level 2',
  whatToBring: ['Pink ballet shoes'],
  ...over,
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

const student: Student = {
  id: 'stu',
  householdId: 'hh',
  externalStudentId: null,
  firstName: 'Maya',
  lastName: 'Alvarez',
  displayName: null,
  status: 'active',
};

const session = (date: string, status: ClassSession['status']): ClassSession => ({
  id: `ses-${date}`,
  classId: 'cls',
  sessionDate: date,
  status,
  source: 'manual',
  note: null,
});

describe('nextOccurrences', () => {
  it('finds the next weekday occurrences from a given day', () => {
    expect(nextOccurrences(klass(), enrollment(), new Set(), SUNDAY, 3))
      .toEqual(['2026-09-01', '2026-09-08', '2026-09-15']);
  });

  it('skips a date the studio has already marked cancelled', () => {
    const blocked = new Set(['2026-09-01']);
    expect(nextOccurrences(klass(), enrollment(), blocked, SUNDAY, 2))
      .toEqual(['2026-09-08', '2026-09-15']);
  });

  it('stops at the end of the season', () => {
    const dates = nextOccurrences(klass({ seasonEnd: '2026-09-09' }), enrollment(), new Set(), SUNDAY, 10);
    expect(dates).toEqual(['2026-09-01', '2026-09-08']);
  });

  it('stops at a drop date', () => {
    const dates = nextOccurrences(
      klass(),
      enrollment({ status: 'dropped', droppedOn: '2026-09-05' }),
      new Set(),
      SUNDAY,
      10,
    );
    expect(dates).toEqual(['2026-09-01']);
  });

  it('returns nothing for a class with no fixed day', () => {
    expect(nextOccurrences(klass({ dayOfWeek: null }), enrollment(), new Set(), SUNDAY)).toEqual([]);
  });

  it('does not loop forever when every remaining date is blocked', () => {
    const blocked = new Set(
      ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'],
    );
    expect(nextOccurrences(klass(), enrollment(), blocked, SUNDAY, 5)).toEqual([]);
  });
});

describe('buildUpcoming', () => {
  const entry = (over: Partial<AttendanceClass>, id: string) => ({
    student,
    klass: klass({ ...over, id }),
    enrollment: enrollment({ classId: id }),
    sessions: [],
  });

  it('merges every class into one chronological list', () => {
    const result = buildUpcoming(
      [
        entry({ dayOfWeek: 6, startTime: '10:00:00', endTime: '11:00:00' }, 'sat'),
        entry({ dayOfWeek: 2, startTime: '16:30:00', endTime: '17:30:00' }, 'tue'),
      ],
      SUNDAY,
      2,
    );
    expect(result.map(r => r.klass.id)).toEqual(['tue', 'sat']);
  });

  it('drops a class that already finished today', () => {
    // Sunday 12:00. A Sunday class that ended at 11:00 is not "up next".
    const morning = buildUpcoming(
      [entry({ dayOfWeek: 0, startTime: '10:00:00', endTime: '11:00:00' }, 'sun-am')],
      SUNDAY,
      3,
    );
    expect(morning.map(r => r.date)).not.toContain('2026-08-30');
  });

  it('keeps a class that is running right now, for the pickup time', () => {
    const during = buildUpcoming(
      [entry({ dayOfWeek: 0, startTime: '11:30:00', endTime: '12:30:00' }, 'sun-now')],
      SUNDAY,
      3,
    );
    expect(during[0].date).toBe('2026-08-30');
  });

  it('ignores dropped enrollments', () => {
    const result = buildUpcoming(
      [{ student, klass: klass(), enrollment: enrollment({ status: 'dropped' }), sessions: [] }],
      SUNDAY,
      3,
    );
    expect(result).toEqual([]);
  });

  it('excludes a pre-marked closure from the schedule', () => {
    const result = buildUpcoming(
      [{ student, klass: klass(), enrollment: enrollment(), sessions: [session('2026-09-01', 'cancelled')] }],
      SUNDAY,
      1,
    );
    expect(result[0].date).toBe('2026-09-08');
  });
});

describe('nextPerClass', () => {
  it('returns one row per class, however far off it is', () => {
    const result = nextPerClass(
      [
        { student, klass: klass({ id: 'sat', dayOfWeek: 6 }), enrollment: enrollment({ classId: 'sat' }), sessions: [] },
        { student, klass: klass({ id: 'tue', dayOfWeek: 2 }), enrollment: enrollment({ classId: 'tue' }), sessions: [] },
      ],
      SUNDAY,
    );
    expect(result).toHaveLength(2);
    expect(result.map(r => r.klass.id)).toEqual(['tue', 'sat']);
  });
});

describe('wording', () => {
  it('uses relative words only while they are unambiguous', () => {
    const at = (day: number, hour: number) => new Date(2026, 7, day, hour, 0, 0);

    expect(relativeDay(at(30, 10), SUNDAY)).toBe('Today');
    expect(relativeDay(at(30, 18), SUNDAY)).toBe('Tonight');
    expect(relativeDay(at(31, 10), SUNDAY)).toBe('Tomorrow');
    expect(relativeDay(at(1 + 31, 16), SUNDAY)).toBe('Tuesday');
    // Eight days out: "Monday" would be either of two Mondays, so it dates it.
    expect(relativeDay(new Date(2026, 8, 7, 16, 0, 0), SUNDAY)).toBe('Mon 7 Sep');
  });

  it('formats midday and midnight without a zero hour', () => {
    expect(clockTime(new Date(2026, 7, 30, 12, 5))).toBe('12:05 PM');
    expect(clockTime(new Date(2026, 7, 30, 0, 5))).toBe('12:05 AM');
    expect(clockTime(new Date(2026, 7, 30, 16, 30))).toBe('4:30 PM');
  });
});

describe('buildSeriesIcs', () => {
  const item = nextPerClass(
    [{ student, klass: klass(), enrollment: enrollment(), sessions: [] }],
    SUNDAY,
  )[0];

  it('emits one recurring event bounded by the season', () => {
    const ics = buildSeriesIcs(item, []);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    // UNTIL is asserted as an INSTANT, not as a literal stamp. RFC 5545 wants
    // it in UTC when DTSTART is, so the printed digits depend on the machine's
    // timezone — hardcoding them writes a test that passes in one office and
    // fails in another. What must be true is that it lands on the last moment
    // of the season's final day, wherever the reader is.
    const until = ics.match(/UNTIL=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
    expect(until).not.toBeNull();
    const [, y, mo, d, hh, mm] = until!;
    expect(Date.UTC(+y, +mo - 1, +d, +hh, +mm))
      .toBe(new Date(2026, 8, 30, 23, 59).getTime());
    expect(ics).toContain('SUMMARY:Junior Ballet — Maya');
    expect(ics).toContain('LOCATION:Studio A');
  });

  it('excludes known closures rather than dropping them silently', () => {
    const ics = buildSeriesIcs(item, ['2026-09-08']);
    expect(ics).toMatch(/EXDATE:20260908T/);
  });

  it('does not exclude a closure that already passed', () => {
    const ics = buildSeriesIcs(item, ['2026-08-04']);
    expect(ics).not.toContain('20260804');
  });

  it('escapes commas so a multi-item description cannot split the field', () => {
    const ics = buildSeriesIcs(item, []);
    // whatToBring joins with ", " — an unescaped comma would end DESCRIPTION.
    expect(ics).toContain('Bring: Pink ballet shoes');
    expect(ics).not.toMatch(/DESCRIPTION:[^\r\n]*[^\\],/);
  });
});
