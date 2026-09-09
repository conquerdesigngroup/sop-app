import { buildDay, buildRoster, byName, byStartTime, ClassDay } from './attendanceStaff';

/**
 * The counting behind the "you have not finished this" banner.
 *
 * Worth unit-testing rather than eyeballing because both failures are silent:
 * an `expected` that is too high invents dancers who were never on the roster
 * and nags a teacher forever about a class they did in fact finish, and one
 * that is too low tells them they are done when a child has no mark at all.
 */

const klass = (over: any = {}) => ({
  id: 'cls-1', name: 'Jr Ballet 2', day_of_week: 2, start_time: '17:20:00',
  end_time: '18:20:00', location: 'Studio B', level: 'Level 2', style: 'Ballet', ...over,
});

const session = (over: any = {}) => ({
  id: 'ses-1', class_id: 'cls-1', session_date: '2026-09-08',
  status: 'held', source: 'schedule', note: null, ...over,
});

const enrolled = (studentId: string, classId = 'cls-1') => ({ student_id: studentId, class_id: classId });
const student = (id: string, first: string, last: string) => ({ id, first_name: first, last_name: last });

describe('a teacher day', () => {
  it('counts the roster and the marks taken so far', () => {
    const days = buildDay(
      [klass()],
      [session()],
      [enrolled('a'), enrolled('b'), enrolled('c')],
      [{ student_id: 'a', session_id: 'ses-1', status: 'present' }],
    );

    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ expected: 3, marked: 1 });
    expect(days[0].klass.name).toBe('Jr Ballet 2');
  });

  it('counts marks per session, not per class', () => {
    // Two classes meeting the same day. A mark on one must not make the other
    // look finished.
    const days = buildDay(
      [klass(), klass({ id: 'cls-2', name: 'Tap 1', start_time: '18:30:00' })],
      [session(), session({ id: 'ses-2', class_id: 'cls-2' })],
      [enrolled('a'), enrolled('b', 'cls-2')],
      [{ student_id: 'a', session_id: 'ses-1', status: 'present' }],
    );

    expect(days.find(d => d.klass.id === 'cls-1')).toMatchObject({ expected: 1, marked: 1 });
    expect(days.find(d => d.klass.id === 'cls-2')).toMatchObject({ expected: 1, marked: 0 });
  });

  it('drops a session whose class RLS did not return', () => {
    // Not this teacher's class. Rendering it with a blank name would be worse
    // than not rendering it.
    const days = buildDay([], [session()], [enrolled('a')], []);
    expect(days).toEqual([]);
  });

  it('orders the day by start time, with untimed classes last', () => {
    const days = buildDay(
      [
        klass({ id: 'c1', name: 'Late', start_time: '18:30:00' }),
        klass({ id: 'c2', name: 'Early', start_time: '16:00:00' }),
        klass({ id: 'c3', name: 'Untimed', start_time: null }),
      ],
      [
        session({ id: 's1', class_id: 'c1' }),
        session({ id: 's2', class_id: 'c2' }),
        session({ id: 's3', class_id: 'c3' }),
      ],
      [], [],
    );

    expect(days.map(d => d.klass.name)).toEqual(['Early', 'Late', 'Untimed']);
  });

  it('keeps a cancelled session in the list, carrying its status', () => {
    // The teacher still needs to see that the class exists and was called off,
    // and needs the way back if it was called off by mistake.
    const days = buildDay([klass()], [session({ status: 'cancelled', note: 'Power out' })], [enrolled('a')], []);

    expect(days[0].session.status).toBe('cancelled');
    expect(days[0].session.note).toBe('Power out');
  });
});

describe('a class roster', () => {
  it('attaches each dancer to their mark, and null when there is none', () => {
    const rows = buildRoster(
      [enrolled('a'), enrolled('b')],
      [student('a', 'Ada', 'Nunez'), student('b', 'Bo', 'Marsh')],
      [{ student_id: 'a', status: 'sick' }],
    );

    expect(rows).toEqual([
      { studentId: 'b', firstName: 'Bo', lastName: 'Marsh', status: null },
      { studentId: 'a', firstName: 'Ada', lastName: 'Nunez', status: 'sick' },
    ]);
  });

  it('sorts by surname, the way a paper roster reads', () => {
    const rows = buildRoster(
      [enrolled('a'), enrolled('b'), enrolled('c')],
      [student('a', 'Zoe', 'Adams'), student('b', 'Amy', 'Zimmer'), student('c', 'Al', 'Adams')],
      [],
    );

    expect(rows.map(r => `${r.lastName}, ${r.firstName}`))
      .toEqual(['Adams, Al', 'Adams, Zoe', 'Zimmer, Amy']);
  });

  it('drops an enrollment whose student did not come back', () => {
    const rows = buildRoster([enrolled('a'), enrolled('ghost')], [student('a', 'Ada', 'Nunez')], []);
    expect(rows).toHaveLength(1);
  });

  it('never reads display_name, even when one is present', () => {
    // The household nickname. Readable to a teacher because it sits on a row
    // they may now see; never theirs to render. v33: "Bug is not on the invoice".
    const rows = buildRoster(
      [enrolled('a')],
      [{ ...student('a', 'Beatrix', 'Nunez'), display_name: 'Bug' }],
      [],
    );

    expect(JSON.stringify(rows)).not.toContain('Bug');
    expect(rows[0].firstName).toBe('Beatrix');
  });
});

describe('sorters', () => {
  it('byStartTime falls back to the name when two classes share a time', () => {
    const at = (name: string): ClassDay => ({
      klass: { id: name, name, dayOfWeek: 2, startTime: '17:00:00', endTime: null, location: null, level: null, style: null },
      session: { id: name, classId: name, sessionDate: '2026-09-08', status: 'held', source: 'schedule', note: null },
      expected: 0, marked: 0,
    });
    expect([at('Tap'), at('Ballet')].sort(byStartTime).map(d => d.klass.name)).toEqual(['Ballet', 'Tap']);
  });

  it('byName is stable on identical surnames', () => {
    const r = (first: string, last: string) => ({ studentId: first, firstName: first, lastName: last, status: null });
    expect([r('Zoe', 'Lee'), r('Ann', 'Lee')].sort(byName).map(x => x.firstName)).toEqual(['Ann', 'Zoe']);
  });
});

/**
 * Scope: holding the admin role and holding a class are different facts.
 *
 * These pin the rule rather than the query, because the failure is not an
 * error — it is a screen that answers a different question from the one asked,
 * and it lands on exactly the two busiest people in the studio.
 */
describe('whose classes to show', () => {
  const scopeFor = (isAdmin: boolean, scope: 'mine' | 'all', holds: number): 'filtered' | 'everything' =>
    (isAdmin && scope === 'all') ? 'everything'
      : (isAdmin && holds === 0) ? 'everything'
      : 'filtered';

  it('gives a plain teacher their own classes whichever scope is asked for', () => {
    expect(scopeFor(false, 'mine', 16)).toBe('filtered');
    expect(scopeFor(false, 'all', 16)).toBe('filtered');
  });

  it('gives an admin who teaches their own classes by default', () => {
    // The owner and the studio manager hold sixteen classes each AND the admin
    // role. Answering "what am I teaching now" with the whole studio's
    // timetable is the wrong answer for someone standing in a studio.
    expect(scopeFor(true, 'mine', 16)).toBe('filtered');
  });

  it('still lets that admin ask for the whole studio', () => {
    expect(scopeFor(true, 'all', 16)).toBe('everything');
  });

  it('never strands an admin who teaches nothing on an empty screen', () => {
    // 'mine' would be empty with no way out, so it is overridden.
    expect(scopeFor(true, 'mine', 0)).toBe('everything');
  });
});
