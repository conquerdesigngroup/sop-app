// react-router-dom 7 ships ESM this jest cannot resolve, and countdownLabel is
// a pure date function that never touches the router — the same virtual mock
// BottomNavigation.test.tsx uses, for the same reason.
jest.mock('react-router-dom', () => ({ Link: 'a' }), { virtual: true });

// eslint-disable-next-line import/first
import { countdownLabel } from './CountdownBand';

/**
 * The four things the left block can say, and the one that used to be a bug.
 *
 * A countdown is arithmetic on dates, which is where this codebase has been
 * bitten repeatedly: an all-day event is stored at UTC midnight and reads as
 * the previous day locally, and a multi-day event is "past" by its start and
 * "coming up" by its end. Both are pinned here because both render as a
 * plausible-looking band rather than as an error.
 */

const allDay = (startsAt: string, endsAt: string | null = null) => ({
  startsAt,
  endsAt,
  isAllDay: true,
});

describe('countdownLabel', () => {
  it('counts whole days to an all-day event', () => {
    expect(countdownLabel('2026-09-05', allDay('2026-09-12T00:00:00Z')))
      .toEqual({ headline: '7', unit: 'days' });
  });

  it('says the day rather than a number for today and tomorrow', () => {
    expect(countdownLabel('2026-09-05', allDay('2026-09-05T00:00:00Z')).headline).toBe('Today');
    expect(countdownLabel('2026-09-05', allDay('2026-09-06T00:00:00Z')).headline).toBe('Tmrw');
  });

  it('says ON NOW in the middle of a multi-day event, never a negative number', () => {
    // Saturday of a Friday–Sunday competition. The difference from the start
    // is -1; rendering that as "-1 days" is the failure this branch exists for.
    const out = countdownLabel('2026-09-05', allDay('2026-09-04T00:00:00Z', '2026-09-06T00:00:00Z'));
    expect(out).toEqual({ headline: 'On now', unit: null });
  });

  it('is not thrown by a DST boundary', () => {
    // 1 Nov 2026 is the US fall-back. A local-midnight subtraction across it
    // gives 7.04 days, which floors to 7 by luck and would floor to 6 in the
    // spring. daysBetweenIso is anchored at UTC, so neither happens.
    expect(countdownLabel('2026-10-28', allDay('2026-11-04T00:00:00Z')).headline).toBe('7');
    expect(countdownLabel('2026-03-04', allDay('2026-03-11T00:00:00Z')).headline).toBe('7');
  });

  it('reads a timed event in the local frame, as the rest of the portal does', () => {
    // 7pm Pacific on the 12th. Stored as UTC, read back locally: still the 12th
    // for anyone in the Americas, which is who this is for.
    const out = countdownLabel('2026-09-05', {
      startsAt: new Date(2026, 8, 12, 19, 0).toISOString(),
      endsAt: null,
      isAllDay: false,
    });
    expect(out).toEqual({ headline: '7', unit: 'days' });
  });
});
