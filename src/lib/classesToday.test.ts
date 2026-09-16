import { classPhase, minutesOf, registerState } from './classesToday';
import { ClassDay } from './attendanceStaff';

/**
 * The pills on the dashboard's "Your classes today" card.
 *
 * Each case below is a pill a teacher would stop believing if it were wrong:
 * amber on a class that has not started, "Done" with a dancer unmarked, or a
 * cancelled class still asking for a register.
 */

const day = (over: Partial<ClassDay> & { status?: ClassDay['session']['status'] } = {}): ClassDay => {
  const { status = 'held', ...rest } = over;
  return {
    klass: {
      id: 'cls-1', name: 'Jr Ballet 2', dayOfWeek: 3, startTime: '17:20:00', endTime: '18:20:00',
      location: 'Studio B', level: 'Level 2', style: 'Ballet',
    },
    session: {
      id: 'ses-1', classId: 'cls-1', sessionDate: '2026-09-16', status, source: 'schedule', note: null,
    },
    expected: 12,
    marked: 0,
    ...rest,
  };
};

describe('minutesOf', () => {
  it('reads a Postgres time with or without seconds', () => {
    expect(minutesOf('17:20:00')).toBe(17 * 60 + 20);
    expect(minutesOf('09:05')).toBe(9 * 60 + 5);
  });

  it('refuses what is not a time', () => {
    expect(minutesOf(null)).toBeNull();
    expect(minutesOf('')).toBeNull();
    expect(minutesOf('soon')).toBeNull();
  });
});

describe('classPhase', () => {
  it('is upcoming before the start, on during the class, and over from its end', () => {
    expect(classPhase('17:20:00', '18:20:00', '17:19')).toBe('upcoming');
    expect(classPhase('17:20:00', '18:20:00', '17:20')).toBe('on');
    expect(classPhase('17:20:00', '18:20:00', '18:19')).toBe('on');
    expect(classPhase('17:20:00', '18:20:00', '18:20')).toBe('over');
  });

  it('gives a class with no end time an hour', () => {
    expect(classPhase('17:00:00', null, '17:59')).toBe('on');
    expect(classPhase('17:00:00', null, '18:00')).toBe('over');
  });

  it('does not trust an end time that is not after the start', () => {
    expect(classPhase('17:00:00', '17:00:00', '17:30')).toBe('on');
  });

  it('will not guess about a class with no start time', () => {
    expect(classPhase(null, '18:00:00', '17:30')).toBe('unknown');
  });
});

describe('registerState', () => {
  it('does not ask for a register on a class that is not meeting', () => {
    expect(registerState(day({ status: 'cancelled' }), 'over')).toMatchObject({ tone: 'muted', label: 'Cancelled' });
    expect(registerState(day({ status: 'closed', marked: 3 }), 'on')).toMatchObject({ tone: 'muted', label: 'Closed' });
  });

  it('says Done only when every dancer on the roster has a mark', () => {
    expect(registerState(day({ marked: 11 }), 'over')).toMatchObject({ tone: 'due', label: '11 of 12' });
    expect(registerState(day({ marked: 12 }), 'over')).toMatchObject({ tone: 'done', label: 'Done' });
    // Done is done whatever the clock says — a register finished early is finished.
    expect(registerState(day({ marked: 12 }), 'upcoming')).toMatchObject({ tone: 'done' });
  });

  it('says who is coming, not "0 of 12" in amber, before a class starts', () => {
    expect(registerState(day(), 'upcoming')).toEqual({
      tone: 'muted', label: '12 dancers', description: '12 dancers on the roster',
    });
    expect(registerState(day({ expected: 1 }), 'upcoming')).toMatchObject({ label: '1 dancer' });
  });

  it('shows a mark taken early as progress, still without the warning', () => {
    expect(registerState(day({ marked: 1 }), 'upcoming')).toMatchObject({ tone: 'muted', label: '1 of 12' });
  });

  it('marks a running class live and a finished, unmarked one as due', () => {
    expect(registerState(day({ marked: 3 }), 'on')).toEqual({
      tone: 'live', label: '3 of 12', description: '3 of 12 dancers marked',
    });
    expect(registerState(day(), 'over')).toMatchObject({ tone: 'due', label: '0 of 12' });
  });

  it('treats a class with no time as due, the way the Attendance page does', () => {
    expect(registerState(day(), 'unknown')).toMatchObject({ tone: 'due', label: '0 of 12' });
  });

  it('does not count an empty roster as work still to do', () => {
    expect(registerState(day({ expected: 0 }), 'over')).toMatchObject({ tone: 'muted', label: 'No dancers' });
  });
});
