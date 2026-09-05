import { studioDate, studioToday, shiftIsoDays, daysBetweenIso } from './studioDate';

/**
 * These assert exact dates at exact instants, with no reference to the
 * runner's own zone. That is the point: if any of this still depended on
 * where the machine thinks it is, the suite would only pass in Pacific — and
 * passing only in Pacific is the bug this module was written to remove.
 */
describe('studioDate', () => {
  it('reports the studio date, not the runner\'s', () => {
    // 16:00Z is 09:00 in California — same calendar day everywhere involved.
    expect(studioDate(new Date('2026-09-04T16:00:00Z'))).toBe('2026-09-04');
  });

  it('is still the previous day once UTC has rolled over but California has not', () => {
    // 02:00Z on the 5th is 19:00 PDT on the 4th. This is the instant the old
    // toISOString() idiom got wrong in the other direction.
    expect(studioDate(new Date('2026-09-05T02:00:00Z'))).toBe('2026-09-04');
  });

  it('rolls at California midnight', () => {
    expect(studioDate(new Date('2026-09-05T06:59:59Z'))).toBe('2026-09-04'); // 23:59:59 PDT
    expect(studioDate(new Date('2026-09-05T07:00:00Z'))).toBe('2026-09-05'); // 00:00:00 PDT
  });

  it('follows the DST offset rather than a fixed one', () => {
    // PST (UTC-8) in January: midnight arrives an hour later in UTC terms.
    expect(studioDate(new Date('2026-01-05T07:59:59Z'))).toBe('2026-01-04');
    expect(studioDate(new Date('2026-01-05T08:00:00Z'))).toBe('2026-01-05');
  });

  it('formats as a sortable YYYY-MM-DD', () => {
    expect(studioToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('shiftIsoDays', () => {
  it('moves whole days', () => {
    expect(shiftIsoDays('2026-09-04', 1)).toBe('2026-09-05');
    expect(shiftIsoDays('2026-09-04', -1)).toBe('2026-09-03');
    expect(shiftIsoDays('2026-09-04', 7)).toBe('2026-09-11');
  });

  it('crosses months, years and a DST boundary without losing a day', () => {
    expect(shiftIsoDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftIsoDays('2026-03-01', -1)).toBe('2026-02-28');
    // US DST starts 2026-03-08. A naive local-midnight shift lands at 23:00
    // on the 8th and formats as the 8th.
    expect(shiftIsoDays('2026-03-08', 1)).toBe('2026-03-09');
  });
});

describe('daysBetweenIso', () => {
  it('counts forwards and backwards', () => {
    expect(daysBetweenIso('2026-09-01', '2026-09-04')).toBe(3);
    expect(daysBetweenIso('2026-09-04', '2026-09-04')).toBe(0);
    expect(daysBetweenIso('2026-09-04', '2026-09-01')).toBe(-3);
  });

  it('is unaffected by DST', () => {
    expect(daysBetweenIso('2026-03-07', '2026-03-09')).toBe(2);
  });
});
