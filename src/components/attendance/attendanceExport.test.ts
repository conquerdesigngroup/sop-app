import {
  buildAttendanceCSV,
  reasonLabel,
  resolveRange,
  slug,
  statusLabel,
  tally,
  toRow,
} from './attendanceExport';
import { RecordRow } from '../../lib/attendanceRecords';

/**
 * The export, pinned.
 *
 * Every failure in this file is the silent kind: a range that is off by a day
 * produces a report that looks complete, a percentage computed differently from
 * the app's produces a number that is plausible and wrong, and a dropped
 * "Not marked" row produces a spreadsheet that is quietly missing children.
 * None of them look like bugs on screen.
 */

const row = (over: Partial<RecordRow> = {}): RecordRow => ({
  sessionId: 'ses', sessionDate: '2026-09-08', sessionStatus: 'held', sessionNote: null,
  classId: 'cls', className: 'Jr Ballet 2', teachers: 'Ada Nunez',
  studentId: 'stu', firstName: 'Bo', lastName: 'Marsh',
  status: 'present', countsTowardTotal: true, excludedReason: null,
  ...over,
});

describe('date ranges', () => {
  it('a day is itself', () => {
    expect(resolveRange('day', '2026-09-08')).toMatchObject({ from: '2026-09-08', to: '2026-09-08' });
  });

  it('a week runs Sunday to Saturday, matching day_of_week', () => {
    // 2026-09-08 is a Tuesday. Its week must start on Sunday the 6th, because
    // portal_classes.day_of_week is 0=Sunday — a different boundary would file
    // a Sunday class into a different week from the one it is scheduled in.
    expect(resolveRange('week', '2026-09-08')).toMatchObject({ from: '2026-09-06', to: '2026-09-12' });
  });

  it('a week anchored on its own Sunday does not jump back seven days', () => {
    expect(resolveRange('week', '2026-09-06')).toMatchObject({ from: '2026-09-06', to: '2026-09-12' });
  });

  it('a month ends on its real last day, February included', () => {
    expect(resolveRange('month', '2026-09-08')).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    expect(resolveRange('month', '2027-02-14')).toMatchObject({ from: '2027-02-01', to: '2027-02-28' });
    // 2028 is a leap year, and this is the case a hand-written table gets wrong.
    expect(resolveRange('month', '2028-02-14')).toMatchObject({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('crosses a year boundary without drifting', () => {
    expect(resolveRange('week', '2027-01-01')).toMatchObject({ from: '2026-12-27', to: '2027-01-02' });
  });
});

describe('labels', () => {
  it('writes Not marked rather than leaving a blank', () => {
    // The most actionable row in the file. An empty cell gets skimmed past.
    expect(statusLabel(row({ status: null }))).toBe('Not marked');
  });

  it('names each status', () => {
    expect(statusLabel(row({ status: 'sick' }))).toBe('Sick');
    expect(statusLabel(row({ status: 'excused' }))).toBe('Excused');
  });

  it('prefers the session note over the generic reason', () => {
    expect(reasonLabel(row({ excludedReason: 'cancelled', sessionNote: 'Power out' }))).toBe('Power out');
    expect(reasonLabel(row({ excludedReason: 'cancelled', sessionNote: null }))).toBe('Class cancelled');
  });

  it('leaves the reason empty for a row that simply counts', () => {
    expect(reasonLabel(row())).toBe('');
  });
});

describe('CSV', () => {
  it('carries the reason columns, not just the status', () => {
    const { csv } = buildAttendanceCSV([row({ status: null, countsTowardTotal: false, excludedReason: 'closed' })], {
      range: resolveRange('day', '2026-09-08'),
    });

    expect(csv.split('\r\n')[0]).toBe('"Date","Class","Teacher","Dancer","Status","Counted","Reason"');
    expect(csv).toContain('"Not marked","No","Studio closed"');
  });

  it('names the file after the range, and the subject when there is one', () => {
    const range = resolveRange('month', '2026-09-08');
    expect(buildAttendanceCSV([], { range }).filename).toBe('attendance_2026-09-01_to_2026-09-30.csv');
    expect(buildAttendanceCSV([], { range, subject: 'Jr Ballet 2' }).filename)
      .toBe('attendance_jr-ballet-2_2026-09-01_to_2026-09-30.csv');
  });

  it('neutralises a name that would execute as a formula', () => {
    // A dancer whose surname starts with '=' is not a realistic name, but a
    // class called "-Company A" is, and Excel runs both.
    const { csv } = buildAttendanceCSV([row({ className: '=cmd|calc' })], {
      range: resolveRange('day', '2026-09-08'),
    });
    expect(csv).toContain(`"'=cmd|calc"`);
  });

  it('puts the dancer surname-first so the file sorts like a roster', () => {
    expect(toRow(row())[3]).toBe('Marsh, Bo');
  });
});

describe('tally', () => {
  it('computes the percentage the way the database does', () => {
    // present + late over everything that counts. Sick is in the denominator
    // and not in the numerator; excused is in neither.
    const rows = [
      row({ status: 'present' }),
      row({ status: 'late' }),
      row({ status: 'sick' }),
      row({ status: 'absent' }),
      row({ status: 'excused', countsTowardTotal: false, excludedReason: 'excused' }),
    ];
    expect(tally(rows)).toMatchObject({ attended: 2, counted: 4, percent: 50, sick: 1, excused: 1 });
  });

  it('reports null rather than zero when nothing has counted yet', () => {
    const rows = [row({ status: null, countsTowardTotal: false, excludedReason: 'upcoming' })];
    expect(tally(rows).percent).toBeNull();
  });

  it('does not count a future class as an unmarked dancer', () => {
    // Otherwise generating the season would report 4,000 "missing" marks.
    const rows = [row({ status: null, countsTowardTotal: false, excludedReason: 'upcoming' })];
    expect(tally(rows).unmarked).toBe(0);
  });

  it('does count a past held session nobody marked', () => {
    const rows = [row({ status: null, countsTowardTotal: true, excludedReason: null })];
    expect(tally(rows).unmarked).toBe(1);
  });
});

describe('slug', () => {
  it('survives punctuation and never returns empty', () => {
    expect(slug('Ballet 2b / Pre Pointe')).toBe('ballet-2b-pre-pointe');
    expect(slug('!!!')).toBe('all');
  });
});
