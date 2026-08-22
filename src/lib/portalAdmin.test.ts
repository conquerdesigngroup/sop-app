import { allDayToIso, timedToIso, isoToDateInput, isoToTimeInput } from './portalAdmin';
import { formatEventDate, eventDayOfMonth } from './portal';

/**
 * The one thing in the portal manager that is worth a test.
 *
 * Phase 2 shipped an all-day event that rendered a day early for every parent
 * west of Greenwich, because a timestamptz at UTC midnight read through local
 * getters is the previous evening. The fix was on the read side; this is the
 * write side of the same pair, and the two only work if they agree.
 *
 * Run with: npx react-scripts test --testPathPattern portalAdmin
 *
 * TZ matters here — that is the entire point — so the cases that must hold
 * everywhere are asserted through the UTC-framed reader rather than through
 * local getters.
 */

describe('all-day events survive the round trip', () => {
  const date = '2026-09-30';

  it('stores UTC midnight, iCal-style', () => {
    expect(allDayToIso(date)).toBe('2026-09-30T00:00:00.000Z');
  });

  it('reads back as the same day, not the evening before', () => {
    const iso = allDayToIso(date);
    expect(isoToDateInput(iso, true)).toBe(date);
    expect(eventDayOfMonth(iso, true)).toBe(30);
    expect(
      formatEventDate(iso, true, { weekday: 'short', month: 'short', day: 'numeric' })
    ).toContain('30');
  });

  it('does not drift across a month or year boundary', () => {
    for (const d of ['2026-01-01', '2026-02-28', '2026-12-31']) {
      expect(isoToDateInput(allDayToIso(d), true)).toBe(d);
    }
  });
});

describe('timed events keep their wall clock', () => {
  it('round trips the time it was typed in', () => {
    const iso = timedToIso('2026-09-30', '17:00');
    expect(isoToDateInput(iso, false)).toBe('2026-09-30');
    expect(isoToTimeInput(iso)).toBe('17:00');
  });

  it('is a different instant from the all-day form of the same date', () => {
    // If these ever match, a timed event is being stored as if it had no time.
    expect(timedToIso('2026-09-30', '17:00')).not.toBe(allDayToIso('2026-09-30'));
  });

  it('handles a midnight start without rolling to the previous day', () => {
    const iso = timedToIso('2026-09-30', '00:00');
    expect(isoToDateInput(iso, false)).toBe('2026-09-30');
    expect(isoToTimeInput(iso)).toBe('00:00');
  });
});
