import { buildEventIcs, googleCalendarUrl, outlookCalendarUrl } from './portalIcs';
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

const linesOf = (ics: string) => unfold(ics).split('\r\n');

/**
 * A property of the EVENT, not of the alarm nested inside it.
 *
 * The scoping is load-bearing rather than tidiness: a DISPLAY alarm is REQUIRED
 * to carry its own DESCRIPTION, so an unscoped search for one finds the alarm's
 * copy of the title and reports a description on an event that has none. That
 * is exactly how the "omits optional fields" test below started passing for the
 * wrong reason.
 */
const between = (ics: string, open: string, close: string, prop: string) => {
  const lines = linesOf(ics);
  const from = lines.indexOf(open);
  if (from === -1) return undefined;
  const to = lines.indexOf(close, from);
  return lines.slice(from + 1, to === -1 ? undefined : to).find(l => l.startsWith(prop));
};

const valueOf = (ics: string, prop: string) =>
  between(ics, 'BEGIN:VEVENT', 'BEGIN:VALARM', prop);

const alarmOf = (ics: string, prop: string) =>
  between(ics, 'BEGIN:VALARM', 'END:VALARM', prop);

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

describe('reminders', () => {
  it('nudges a timed event two hours before', () => {
    const ics = buildEventIcs(event({
      isAllDay: false,
      startsAt: '2027-03-13T17:00:00.000Z',
    }));
    expect(alarmOf(ics, 'TRIGGER')).toBe('TRIGGER:-PT2H');
  });

  it('nudges an all-day event the morning before, not at midnight', () => {
    // DTSTART is midnight for a DATE value, so -PT14H is 10am the previous
    // day. -P1D would fire at midnight, when nothing can be done about it.
    const ics = buildEventIcs(event({ isAllDay: true }));
    expect(alarmOf(ics, 'TRIGGER')).toBe('TRIGGER:-PT14H');
  });

  it('puts the alarm inside the event, not beside it', () => {
    // A VALARM after END:VEVENT is a file the phone rejects outright.
    const lines = unfold(buildEventIcs(event({}))).split('\r\n');
    expect(lines.indexOf('BEGIN:VALARM')).toBeGreaterThan(lines.indexOf('BEGIN:VEVENT'));
    expect(lines.indexOf('END:VALARM')).toBeLessThan(lines.indexOf('END:VEVENT'));
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

/**
 * The web handoffs. Same two-part date convention as the .ics, and the same
 * trap: an all-day end sent as stored is a day short everywhere.
 */

const paramsOf = (url: string) =>
  new URLSearchParams(url.slice(url.indexOf('?') + 1));

describe('google calendar link', () => {
  it('sends an all-day range with an exclusive end', () => {
    const url = googleCalendarUrl(event({
      startsAt: '2026-12-21T00:00:00.000Z',
      endsAt: '2027-01-03T00:00:00.000Z',
    }));
    expect(paramsOf(url).get('dates')).toBe('20261221/20270104');
  });

  it('sends a timed range as UTC instants', () => {
    const url = googleCalendarUrl(event({
      isAllDay: false,
      startsAt: '2026-09-17T01:00:00.000Z',
      endsAt: '2026-09-17T03:30:00.000Z',
    }));
    expect(paramsOf(url).get('dates')).toBe('20260917T010000Z/20260917T033000Z');
  });

  it('carries the title, details and location unescaped', () => {
    // URLSearchParams does the encoding. RFC 5545 escaping here would put
    // literal backslashes in the parent's event.
    const url = googleCalendarUrl(event({
      title: 'Comma, semi; here',
      description: 'line one\nline two',
      location: 'Studio A; Room 2',
    }));
    const p = paramsOf(url);
    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);
    expect(p.get('action')).toBe('TEMPLATE');
    expect(p.get('text')).toBe('Comma, semi; here');
    expect(p.get('details')).toBe('line one\nline two');
    expect(p.get('location')).toBe('Studio A; Room 2');
  });

  it('omits optional fields rather than sending them empty', () => {
    const p = paramsOf(googleCalendarUrl(event({ description: '', location: null })));
    expect(p.has('details')).toBe(false);
    expect(p.has('location')).toBe(false);
  });

  it('writes the date separator literally and spaces as %20', () => {
    // The reason the query is built by hand. URLSearchParams would emit
    // `dates=20260831%2F20260901` and `text=Fall+Session+Begins`; both decode
    // correctly, but only this form matches what Google documents.
    const url = googleCalendarUrl(event({ title: 'Fall Session Begins' }));
    expect(url).toContain('dates=20270313/20270314');
    expect(url).toContain('text=Fall%20Session%20Begins');
    expect(url).not.toContain('+');
  });
});

describe('outlook link', () => {
  it('flags an all-day event and sends bare dates', () => {
    // A timestamped all-day event is read by Outlook as a timed one and filed
    // at midnight.
    const p = paramsOf(outlookCalendarUrl(event({
      startsAt: '2026-12-21T00:00:00.000Z',
      endsAt: '2027-01-03T00:00:00.000Z',
    })));
    expect(p.get('allday')).toBe('true');
    expect(p.get('startdt')).toBe('2026-12-21');
    expect(p.get('enddt')).toBe('2027-01-04');
  });

  it('sends a timed event as full ISO instants, with no allday flag', () => {
    const p = paramsOf(outlookCalendarUrl(event({
      isAllDay: false,
      startsAt: '2026-09-17T01:00:00.000Z',
      endsAt: null,
    })));
    expect(p.has('allday')).toBe(false);
    expect(p.get('startdt')).toBe('2026-09-17T01:00:00.000Z');
    // The one-hour default, the same one the .ics uses.
    expect(p.get('enddt')).toBe('2026-09-17T02:00:00.000Z');
  });

  it('addresses the personal-account host with the compose path', () => {
    const url = outlookCalendarUrl(event({}));
    expect(url.startsWith('https://outlook.live.com/calendar/0/deeplink/compose?')).toBe(true);
    const p = paramsOf(url);
    expect(p.get('path')).toBe('/calendar/action/compose');
    expect(p.get('rru')).toBe('addevent');
    expect(p.get('subject')).toBe('Allstar Showcase');
  });
});
