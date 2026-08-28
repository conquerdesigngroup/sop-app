import { buildEventIcs } from './portalIcs';
import { PortalEvent } from '../types';

/**
 * The .ics a parent's phone reads, which is the one artefact here that no
 * amount of looking at the app will verify.
 *
 * Run with: npx react-scripts test --testPathPattern portalIcs
 */

const event = (over: Partial<PortalEvent>): PortalEvent => ({
  id: 'abc-123',
  programId: 'p1',
  classId: null,
  title: 'Allstar Showcase',
  description: '',
  startsAt: '2027-03-13T00:00:00.000Z',
  endsAt: null,
  isAllDay: true,
  location: null,
  googleCalendarId: null,
  googleEventId: null,
  source: 'google',
  isPublished: true,
  ...over,
});

/** Unfold before asserting: a folded line is still one logical value. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const valueOf = (ics: string, prop: string) =>
  unfold(ics).split('\r\n').find(l => l.startsWith(prop));

describe('all-day events', () => {
  it('ends the day AFTER the last day, because DTEND is exclusive', () => {
    // Stored inclusively: this event covers the 13th and only the 13th.
    const ics = buildEventIcs(event({ isAllDay: true }));
    expect(valueOf(ics, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20270313');
    expect(valueOf(ics, 'DTEND')).toBe('DTEND;VALUE=DATE:20270314');
  });

  it('keeps the final day of a run', () => {
    // Christmas break: stored as last-day-inclusive by portal-calendar-sync,
    // so the 3rd is a closed day and DTEND must be the 4th.
    const ics = buildEventIcs(event({
      title: 'Closed for Christmas Break',
      startsAt: '2026-12-21T00:00:00.000Z',
      endsAt: '2027-01-03T00:00:00.000Z',
    }));
    expect(valueOf(ics, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20261221');
    expect(valueOf(ics, 'DTEND')).toBe('DTEND;VALUE=DATE:20270104');
  });

  it('names the stored day regardless of the reader zone', () => {
    // The bug this guards: local getters on a UTC-midnight instant name the
    // previous day anywhere west of Greenwich.
    const ics = buildEventIcs(event({ startsAt: '2026-08-31T00:00:00.000Z' }));
    expect(valueOf(ics, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20260831');
  });
});

describe('timed events', () => {
  it('writes absolute UTC instants, not floating local times', () => {
    const ics = buildEventIcs(event({
      isAllDay: false,
      startsAt: '2026-09-17T01:00:00.000Z',
      endsAt: '2026-09-17T03:30:00.000Z',
    }));
    expect(valueOf(ics, 'DTSTART')).toBe('DTSTART:20260917T010000Z');
    expect(valueOf(ics, 'DTEND')).toBe('DTEND:20260917T033000Z');
  });

  it('defaults to an hour when no end is stored', () => {
    const ics = buildEventIcs(event({
      isAllDay: false,
      startsAt: '2026-09-17T01:00:00.000Z',
      endsAt: null,
    }));
    expect(valueOf(ics, 'DTEND')).toBe('DTEND:20260917T020000Z');
  });
});

describe('escaping', () => {
  it('escapes the four characters RFC 5545 reserves', () => {
    const ics = buildEventIcs(event({
      title: 'Comma, semi; slash\\ here',
      description: 'line one\nline two',
    }));
    expect(valueOf(ics, 'SUMMARY')).toBe('SUMMARY:Comma\\, semi\\; slash\\\\ here');
    expect(valueOf(ics, 'DESCRIPTION')).toBe('DESCRIPTION:line one\\nline two');
  });

  it('escapes a semicolon in a location', () => {
    // Unescaped, a semicolon reads as a parameter separator and eats the field.
    const ics = buildEventIcs(event({ location: 'Studio A; Room 2' }));
    expect(valueOf(ics, 'LOCATION')).toBe('LOCATION:Studio A\\; Room 2');
  });
});

describe('line structure', () => {
  it('uses CRLF', () => {
    const ics = buildEventIcs(event({}));
    expect(ics).toContain('\r\n');
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('folds every line to 75 octets or fewer', () => {
    const ics = buildEventIcs(event({
      description: 'A very long description '.repeat(20),
    }));
    // Buffer, deliberately: an independent measurement of the same thing the
    // module computes by hand, so a bug in utf8Len cannot pass its own test.
    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('does not split a multi-byte character across a fold', () => {
    const ics = buildEventIcs(event({ description: '🩰'.repeat(60) }));
    // A split surrogate or truncated UTF-8 sequence round-trips as U+FFFD.
    expect(unfold(ics)).not.toContain('�');
  });

  it('is a well-formed single VEVENT', () => {
    const ics = buildEventIcs(event({}));
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.filter(l => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lines.filter(l => l === 'END:VEVENT')).toHaveLength(1);
    expect(lines.filter(Boolean).pop()).toBe('END:VCALENDAR');
    expect(valueOf(ics, 'UID')).toBe('UID:abc-123@didc.app');
  });

  it('omits optional fields rather than emitting them empty', () => {
    const ics = buildEventIcs(event({ description: '', location: null }));
    expect(valueOf(ics, 'DESCRIPTION')).toBeUndefined();
    expect(valueOf(ics, 'LOCATION')).toBeUndefined();
  });
});
