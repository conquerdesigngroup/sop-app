import { loadStudioClosures } from './studioClosures';
import {
  closureDateLabel,
  closureDayKeys,
  daysUntil,
  isClosureTitle,
  seasonEndLabel,
} from './studioClosures';

/**
 * The title match is a heuristic standing in for a column portal_events does
 * not have, so it is worth more than the usual amount of testing: a false
 * positive tells a family to stay home from a class that is running, and every
 * case below is a real title off the studio's own calendar.
 */
describe('spotting a closure by its title', () => {
  it.each([
    'Closed for Thanksgiving Holiday',
    'Closed for Christmas Break',
    'Memorial Day – CLOSED',
    'Studios Closed',
    'No Classes – Teacher Training',
  ])('treats %s as a closure', title => {
    expect(isClosureTitle(title)).toBe(true);
  });

  it.each([
    // The one that makes a loose pattern dangerous: same calendar, same
    // holiday shape, opposite meaning.
    'Veterans Day – Studio OPEN',
    // "closes" is not "closed" — matching the stem would catch this.
    'Registration closes Friday',
    'Halloween Week',
    'Winter Session Begins',
    'Last Call for CREATE Registration',
    'JBJ Dress Rehearsal in class',
    'DI Birthday: 48 years',
  ])('leaves %s alone', title => {
    expect(isClosureTitle(title)).toBe(false);
  });

  it('says no to nothing at all', () => {
    expect(isClosureTitle(null)).toBe(false);
    expect(isClosureTitle('')).toBe(false);
  });
});

describe('how a closure reads', () => {
  const closure = (firstDay: string, lastDay: string) => ({ title: 'Closed', firstDay, lastDay });

  it('prints one day on its own', () => {
    expect(closureDateLabel(closure('2027-05-31', '2027-05-31'))).toBe('Mon 31 May');
  });

  it('prints the month once when both ends share it', () => {
    expect(closureDateLabel(closure('2026-11-24', '2026-11-27'))).toBe('Tue 24 – Fri 27 Nov');
  });

  it('prints both months when the span crosses one', () => {
    expect(closureDateLabel(closure('2026-12-21', '2027-01-03'))).toBe('Mon 21 Dec – Sun 3 Jan');
  });

  /**
   * A date key is a local calendar day. `new Date('2026-11-24')` parses as UTC
   * midnight, which is the 23rd for every US timezone — so a naive
   * implementation names the wrong day, and does it only for the studio.
   */
  it('reads a date key in the local frame, not UTC', () => {
    expect(closureDateLabel(closure('2026-11-24', '2026-11-24'))).toBe('Tue 24 Nov');
  });
});

describe('how far away it is', () => {
  const closure = { title: 'Closed', firstDay: '2026-11-24', lastDay: '2026-11-27' };

  it('counts whole days from today', () => {
    expect(daysUntil(closure, new Date(2026, 10, 20, 22, 30))).toBe(4);
  });

  it('ignores the time of day, so an evening reader is not a day out', () => {
    expect(daysUntil(closure, new Date(2026, 10, 23, 23, 59))).toBe(1);
    expect(daysUntil(closure, new Date(2026, 10, 23, 0, 1))).toBe(1);
  });

  it('goes negative once it has begun, which is what "On now" keys off', () => {
    expect(daysUntil(closure, new Date(2026, 10, 26, 9, 0))).toBe(-2);
  });
});

describe('the season end', () => {
  it('carries the year, on a date most of a year out', () => {
    expect(seasonEndLabel('2027-06-20')).toBe('Sun 20 Jun 2027');
  });
});

/**
 * These keys are what the class projection subtracts, so a wrong one is a
 * class that silently stops being announced — or one announced on a day the
 * building is locked. Both are invisible on screen.
 */
describe('expanding a closure into the days it covers', () => {
  const closure = (firstDay: string, lastDay: string) => ({ title: 'Closed', firstDay, lastDay });

  it('gives one day for a one-day closure', () => {
    expect(closureDayKeys([closure('2027-05-31', '2027-05-31')])).toEqual(['2027-05-31']);
  });

  it('covers a multi-day closure inclusively at both ends', () => {
    expect(closureDayKeys([closure('2026-11-24', '2026-11-27')])).toEqual([
      '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
    ]);
  });

  it('crosses a year boundary — the Christmas break is a fortnight, not two days', () => {
    const keys = closureDayKeys([closure('2026-12-21', '2027-01-03')]);
    expect(keys).toHaveLength(14);
    expect(keys[0]).toBe('2026-12-21');
    expect(keys[13]).toBe('2027-01-03');
    expect(keys).toContain('2026-12-31');
    expect(keys).toContain('2027-01-01');
  });

  /**
   * US DST ends on 1 November 2026. Stepping by adding 86,400,000ms across it
   * repeats 1 November and loses 2 November — the exact failure eventDayKeys
   * in lib/portal documents. setDate is calendar-aware and does not.
   */
  it('steps correctly across a daylight-saving boundary', () => {
    expect(closureDayKeys([closure('2026-10-31', '2026-11-02')])).toEqual([
      '2026-10-31', '2026-11-01', '2026-11-02',
    ]);
  });

  it('merges overlapping closures instead of blocking a day twice', () => {
    const keys = closureDayKeys([
      closure('2026-11-24', '2026-11-26'),
      closure('2026-11-25', '2026-11-27'),
    ]);
    expect(keys).toEqual(['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']);
  });

  it('is empty for no closures, which leaves the schedule exactly as it was', () => {
    expect(closureDayKeys([])).toEqual([]);
  });
});

/**
 * The contract loadHouseholdSummary depends on. It awaits this to build the
 * schedule's blocked dates, so a rejection here would take down up next, the
 * class roster and the calendar export together — for every family, over a
 * decoration.
 */
describe('the loader never throws', () => {
  it('returns empty rather than rejecting when the query blows up', async () => {
    jest.resetModules();
    jest.doMock('./supabase', () => ({
      isSupabaseConfigured: () => true,
      supabase: {
        from: () => { throw new Error('network went away mid-flight'); },
      },
    }));

    // Re-imported so it binds to the mocked client.
    const { loadStudioClosures: loader } = require('./studioClosures');
    await expect(loader(new Date(2026, 8, 10))).resolves.toEqual({
      closures: [],
      error: 'We could not load the studio closures.',
    });

    jest.dontMock('./supabase');
    jest.resetModules();
  });

  it('is a no-op without a configured backend', async () => {
    await expect(loadStudioClosures(new Date(2026, 8, 10)))
      .resolves.toEqual({ closures: [], error: null });
  });
});
