import { toGoogleEvent, buildEventPayload, shiftDate } from './googleEventMap';

/**
 * The outbound half of the Google round trip.
 *
 * staff-calendar-sync already has the inbound convention pinned by comment:
 * DTEND is exclusive, so it shifts back a day and stores the last day
 * INCLUSIVE. These tests exist to keep this file the exact inverse of that.
 * Get it wrong and a two-week closure is pushed to Google a day short — the
 * studio shut on a day the calendar says it is open.
 *
 * Run with: npx react-scripts test --testPathPattern googleEventMap
 */

const TZ = 'America/Los_Angeles';

const event = (over: Record<string, unknown> = {}) => ({
  title: 'Allstar Showcase',
  description: '',
  location: '',
  startDate: '2027-03-13',
  startTime: undefined as string | undefined,
  endDate: undefined as string | undefined,
  endTime: undefined as string | undefined,
  isAllDay: true,
  ...over,
} as Parameters<typeof toGoogleEvent>[0]);

describe('shiftDate', () => {
  it('crosses a month boundary', () => {
    expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('crosses a year boundary', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('is unaffected by daylight saving', () => {
    // US DST starts 2027-03-14. A local-midnight Date plus 86400000ms lands on
    // the same calendar day here; UTC arithmetic does not.
    expect(shiftDate('2027-03-13', 1)).toBe('2027-03-14');
    expect(shiftDate('2027-03-14', 1)).toBe('2027-03-15');
    // ...and the November end of it, where a local day is 25 hours.
    expect(shiftDate('2027-11-06', 1)).toBe('2027-11-07');
    expect(shiftDate('2027-11-07', 1)).toBe('2027-11-08');
  });
});

describe('all-day events', () => {
  it('ends the day AFTER the single day it covers', () => {
    const g = toGoogleEvent(event(), TZ);
    expect(g.start).toEqual({ date: '2027-03-13' });
    expect(g.end).toEqual({ date: '2027-03-14' });
  });

  it('keeps the last day of a run, which is stored inclusively', () => {
    // Christmas break: closed the 21st through the 3rd. Google must be told
    // it ends on the 4th, or the 3rd silently becomes an open day.
    const g = toGoogleEvent(event({
      startDate: '2026-12-21', endDate: '2027-01-03',
    }), TZ);
    expect(g.start).toEqual({ date: '2026-12-21' });
    expect(g.end).toEqual({ date: '2027-01-04' });
  });

  it('collapses an end that is not after the start', () => {
    const g = toGoogleEvent(event({ endDate: '2027-03-13' }), TZ);
    expect(g.end).toEqual({ date: '2027-03-14' });
  });

  it('treats a missing start time as all-day even when the flag disagrees', () => {
    // Rows written before is_all_day existed have the two out of step, and a
    // missing time is the more reliable signal.
    const g = toGoogleEvent(event({ isAllDay: false, startTime: undefined }), TZ);
    expect(g.start).toEqual({ date: '2027-03-13' });
  });

  it('sends no timeZone, which is meaningless for a DATE', () => {
    const g = toGoogleEvent(event(), TZ);
    expect(g.start.timeZone).toBeUndefined();
    expect(g.start.dateTime).toBeUndefined();
  });
});

describe('timed events', () => {
  it('sends studio wall-clock plus the zone, with no UTC conversion', () => {
    // start_time is a zoneless TEXT column: 16:30 is half four at the studio.
    // Converting to UTC here would mean undoing it at the other end, and
    // getting DST wrong on the way.
    const g = toGoogleEvent(event({
      isAllDay: false, startTime: '16:30', endTime: '18:00',
    }), TZ);
    expect(g.start).toEqual({ dateTime: '2027-03-13T16:30:00', timeZone: TZ });
    expect(g.end).toEqual({ dateTime: '2027-03-13T18:00:00', timeZone: TZ });
  });

  it('defaults to an hour when no end time is stored', () => {
    const g = toGoogleEvent(event({ isAllDay: false, startTime: '16:30' }), TZ);
    expect(g.end.dateTime).toBe('2027-03-13T17:30:00');
  });

  it('rolls into the next day when that hour crosses midnight', () => {
    const g = toGoogleEvent(event({ isAllDay: false, startTime: '23:30' }), TZ);
    expect(g.end.dateTime).toBe('2027-03-14T00:30:00');
  });

  it('spans days when an end date is stored', () => {
    const g = toGoogleEvent(event({
      isAllDay: false, startTime: '22:00', endDate: '2027-03-14', endTime: '02:00',
    }), TZ);
    expect(g.start.dateTime).toBe('2027-03-13T22:00:00');
    expect(g.end.dateTime).toBe('2027-03-14T02:00:00');
  });

  it('pads a single-digit hour', () => {
    const g = toGoogleEvent(event({ isAllDay: false, startTime: '9:05', endTime: '10:00' }), TZ);
    expect(g.start.dateTime).toBe('2027-03-13T09:05:00');
  });
});

describe('refusals', () => {
  it('refuses an end at or before the start rather than letting Google 400', () => {
    expect(() => toGoogleEvent(event({
      isAllDay: false, startTime: '18:00', endTime: '17:00',
    }), TZ)).toThrow(/after its start/);

    expect(() => toGoogleEvent(event({
      isAllDay: false, startTime: '18:00', endTime: '18:00',
    }), TZ)).toThrow(/after its start/);
  });

  it('refuses an untitled event', () => {
    expect(() => toGoogleEvent(event({ title: '   ' }), TZ)).toThrow(/needs a title/);
  });

  it('refuses a timed event with no calendar time zone', () => {
    expect(() => toGoogleEvent(event({ isAllDay: false, startTime: '16:30' }), '')).toThrow(/time zone/);
  });
});

describe('optional fields', () => {
  it('omits description and location when blank rather than sending empties', () => {
    const g = toGoogleEvent(event({ description: '  ', location: '' }), TZ);
    expect(g.description).toBeUndefined();
    expect(g.location).toBeUndefined();
  });

  it('trims what it does send', () => {
    const g = toGoogleEvent(event({
      title: '  Showcase  ', description: ' bring shoes ', location: ' Studio A ',
    }), TZ);
    expect(g.summary).toBe('Showcase');
    expect(g.description).toBe('bring shoes');
    expect(g.location).toBe('Studio A');
  });
});


/**
 * The row half, added after an audit found three ways it could disagree with
 * the Google half. Each of these is a specific defect that shipped in v19.
 */
describe('the row and the Google resource agree', () => {
  it('refuses an all-day range that ends before it starts', () => {
    // v19 collapsed this for Google and wrote the inversion to the row. Every
    // render path asks `date >= start && date <= end`, so the event appeared
    // on NO day at all — behind a green "Event added to Google Calendar".
    expect(() => buildEventPayload(event({
      startDate: '2027-03-13', endDate: '2027-03-10',
    }), TZ)).toThrow(/cannot be before/);
  });

  it('still collapses an end EQUAL to the start, which is not a mistake', () => {
    const { googleEvent, row } = buildEventPayload(event({
      startDate: '2027-03-13', endDate: '2027-03-13',
    }), TZ);
    expect(googleEvent.end).toEqual({ date: '2027-03-14' });
    // Stored as no end at all, which is what the sync writes for a single day.
    expect(row.end_date).toBeNull();
  });

  it('refuses a timed event with an end date but no end time', () => {
    // v19 overwrote the end date with a +1 hour guess, so a three-day trip
    // became a one-hour Friday slot in Google while the row kept three days.
    expect(() => buildEventPayload(event({
      isAllDay: false, startTime: '09:00',
      endDate: '2027-03-16', endTime: undefined,
    }), TZ)).toThrow(/end time/);
  });

  it('keeps a multi-day timed range in both halves', () => {
    const { googleEvent, row } = buildEventPayload(event({
      isAllDay: false, startTime: '22:00',
      endDate: '2027-03-14', endTime: '02:00',
    }), TZ);
    expect(googleEvent.end.dateTime).toBe('2027-03-14T02:00:00');
    expect(row.end_date).toBe('2027-03-14');
    expect(row.end_time).toBe('02:00');
  });

  it('writes the row the way staff-calendar-sync writes it', () => {
    // The sync stores end_date only when the event genuinely spans days, and
    // no times at all for an all-day event. A pushed row that differs would
    // render differently from the same event after the next sync.
    const allDay = buildEventPayload(event({}), TZ).row;
    expect(allDay).toEqual({
      title: 'Allstar Showcase',
      description: '',
      location: null,
      start_date: '2027-03-13',
      start_time: null,
      end_date: null,
      end_time: null,
      is_all_day: true,
    });

    const timed = buildEventPayload(event({
      isAllDay: false, startTime: '16:30', endTime: '18:00',
    }), TZ).row;
    expect(timed.start_time).toBe('16:30');
    expect(timed.end_time).toBe('18:00');
    // Same day, so no end_date — matching the sync's "only worth storing when
    // it genuinely spans days".
    expect(timed.end_date).toBeNull();
    expect(timed.is_all_day).toBe(false);
  });

  it('carries the same span in both halves for a run of days', () => {
    const { googleEvent, row } = buildEventPayload(event({
      startDate: '2026-12-21', endDate: '2027-01-03',
    }), TZ);
    // Google exclusive, row inclusive — the same closure described two ways.
    expect(googleEvent.end).toEqual({ date: '2027-01-04' });
    expect(row.end_date).toBe('2027-01-03');
  });

  it('normalises a single-digit time in the row too, not just for Google', () => {
    const { googleEvent, row } = buildEventPayload(event({
      isAllDay: false, startTime: '9:05', endTime: '10:00',
    }), TZ);
    expect(googleEvent.start.dateTime).toBe('2027-03-13T09:05:00');
    expect(row.start_time).toBe('09:05');
  });
});
