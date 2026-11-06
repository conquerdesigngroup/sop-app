import {
  normalizeTime,
  formatShiftRange,
  formatShiftShort,
  formatShiftLength,
  shiftLengthHours,
  validateShift,
  hasShiftTimes,
} from './workDayHours';

describe('normalizeTime', () => {
  it('trims the seconds Postgres sends back', () => {
    expect(normalizeTime('09:00:00')).toBe('09:00');
    expect(normalizeTime('17:30:00')).toBe('17:30');
  });
  it('pads a single-digit hour', () => {
    expect(normalizeTime('9:05')).toBe('09:05');
  });
  it('treats null, junk and out-of-range values as no time', () => {
    expect(normalizeTime(null)).toBeUndefined();
    expect(normalizeTime(undefined)).toBeUndefined();
    expect(normalizeTime('')).toBeUndefined();
    expect(normalizeTime('noon')).toBeUndefined();
    expect(normalizeTime('25:00')).toBeUndefined();
  });
});

describe('formatting a shift', () => {
  const shift = { startTime: '09:00', endTime: '17:30' };

  it('reads as a 12-hour range', () => {
    expect(formatShiftRange(shift)).toBe('9:00 AM – 5:30 PM');
  });
  it('has a compact form for calendar chips', () => {
    expect(formatShiftShort(shift)).toBe('9a–5:30p');
    expect(formatShiftShort({ startTime: '12:00', endTime: '00:00' })).toBe('12p–12a');
  });
  it('gives the length', () => {
    expect(shiftLengthHours(shift)).toBe(8.5);
    expect(formatShiftLength(shift)).toBe('8.5 hrs');
    expect(formatShiftLength({ startTime: '09:00', endTime: '10:00' })).toBe('1 hr');
  });
  it('renders nothing for a half-filled or empty day, never "9:00 AM – "', () => {
    for (const t of [{}, { startTime: '09:00' }, { endTime: '17:00' }, null, undefined]) {
      expect(formatShiftRange(t)).toBeUndefined();
      expect(formatShiftShort(t)).toBeUndefined();
      expect(formatShiftLength(t)).toBeUndefined();
      expect(hasShiftTimes(t)).toBe(false);
    }
  });
});

describe('validateShift', () => {
  it('accepts no hours at all', () => {
    expect(validateShift({})).toBeNull();
    expect(validateShift({ startTime: '', endTime: '' })).toBeNull();
  });
  it('accepts an end after the start', () => {
    expect(validateShift({ startTime: '09:00', endTime: '09:05' })).toBeNull();
  });
  it('asks for the missing half', () => {
    expect(validateShift({ startTime: '09:00' })).toMatch(/end time/);
    expect(validateShift({ endTime: '17:00' })).toMatch(/start time/);
  });
  it('rejects an end at or before the start', () => {
    expect(validateShift({ startTime: '17:00', endTime: '09:00' })).toMatch(/after the start/);
    expect(validateShift({ startTime: '09:00', endTime: '09:00' })).toMatch(/after the start/);
  });
});
