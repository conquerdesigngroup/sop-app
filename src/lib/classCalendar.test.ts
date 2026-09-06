import {
  canAddClassToCalendar,
  classSeries,
  classTarget,
  describeWeekly,
  lastClassOccurrence,
  nextClassOccurrence,
  seriesIcs,
} from './classCalendar';
import { PortalClass } from '../types';

/**
 * Putting a class in a parent's calendar, pinned.
 *
 * Every failure mode in here is silent and confidently wrong. An off-by-one
 * weekday, a UTC parse that shifts the day, a recurrence anchored to an
 * instant instead of a time of day — none of them look like errors on screen,
 * and all of them end with a family arriving on the wrong day or at the wrong
 * hour for the rest of the season.
 */

// A Sunday, midday, so "next Tuesday" is two days out and nothing is ambiguous.
const SUNDAY = new Date(2026, 7, 30, 12, 0, 0);

const klass = (over: Partial<PortalClass> = {}): PortalClass => ({
  id: 'cls',
  programId: 'prog',
  category: 'academy',
  name: 'Junior Ballet',
  dayOfWeek: 2,
  startTime: '16:30:00',
  endTime: '17:30:00',
  level: '2',
  location: 'Studio A',
  description: '',
  instructorName: 'Jess Moreau',
  sortOrder: 0,
  isActive: true,
  style: 'Ballet',
  ageGroup: 'Junior / Teen',
  ageMinYears: 8,
  ageMaxYears: 12,
  capacity: null,
  tuitionFee: null,
  registrationFee: null,
  costumeFee: null,
  billingCycle: null,
  billingDay: null,
  season: '2026-2027',
  seasonStart: '2026-06-15',
  seasonEnd: '2026-09-30',
  registrationOpens: null,
  sourceTitle: null,
  ...over,
});

const icsOf = (c: PortalClass, from = SUNDAY): string => {
  const series = classSeries(c, from);
  if (!series) throw new Error('expected a series');
  return seriesIcs(series);
};

describe('the next occurrence', () => {
  it('walks forward to the class day', () => {
    const next = nextClassOccurrence(klass(), SUNDAY);
    // Tuesday 1 September, 4:30 PM — not the Sunday it was asked on.
    expect(next?.start).toEqual(new Date(2026, 8, 1, 16, 30, 0));
    expect(next?.end).toEqual(new Date(2026, 8, 1, 17, 30, 0));
  });

  it('keeps a class that is running right now', () => {
    // Mid-lesson on the class's own day: a parent checking now is checking
    // the pickup time, not next week.
    const midClass = new Date(2026, 8, 1, 17, 0, 0);
    expect(nextClassOccurrence(klass(), midClass)?.start)
      .toEqual(new Date(2026, 8, 1, 16, 30, 0));
  });

  it('rolls to next week once today’s class has finished', () => {
    const afterClass = new Date(2026, 8, 1, 18, 0, 0);
    expect(nextClassOccurrence(klass(), afterClass)?.start)
      .toEqual(new Date(2026, 8, 8, 16, 30, 0));
  });

  it('waits for a season that has not started', () => {
    // Browsing the autumn schedule in July must not promise a lesson this week.
    const july = new Date(2026, 6, 5, 12, 0, 0);
    const autumn = klass({ seasonStart: '2026-09-08', seasonEnd: '2027-06-20' });
    expect(nextClassOccurrence(autumn, july)?.start)
      .toEqual(new Date(2026, 8, 8, 16, 30, 0));
  });

  it('gives up on a season that has ended', () => {
    expect(nextClassOccurrence(klass({ seasonEnd: '2026-08-01' }), SUNDAY)).toBeNull();
  });

  it('runs on for a class with no season end', () => {
    expect(nextClassOccurrence(klass({ seasonEnd: null }), SUNDAY)?.start)
      .toEqual(new Date(2026, 8, 1, 16, 30, 0));
  });

  it('has nothing to add without a day or a start time', () => {
    expect(nextClassOccurrence(klass({ dayOfWeek: null }), SUNDAY)).toBeNull();
    expect(nextClassOccurrence(klass({ startTime: null }), SUNDAY)).toBeNull();
  });

  it('defaults to an hour when no end time is stored', () => {
    expect(nextClassOccurrence(klass({ endTime: null }), SUNDAY)?.end)
      .toEqual(new Date(2026, 8, 1, 17, 30, 0));
  });
});

describe('the last lesson', () => {
  it('is the class’s own weekday, not the day the season ends', () => {
    // The season ends on Sunday 20 June 2027; a Tuesday class last meets on
    // the 15th. Announcing "to Sun, 20 Jun" would name a day it does not run.
    const last = lastClassOccurrence(klass({ seasonEnd: '2027-06-20' }), SUNDAY);
    expect(last).toEqual(new Date(2027, 5, 15, 16, 30, 0));
  });

  it('lands exactly on a season that ends on the class day', () => {
    expect(lastClassOccurrence(klass({ seasonEnd: '2027-06-15' }), SUNDAY))
      .toEqual(new Date(2027, 5, 15, 16, 30, 0));
  });

  it('never walks back past the next lesson', () => {
    // One lesson left: the walk back from the season end must not name a date
    // earlier than the class the parent is about to add.
    const last = lastClassOccurrence(klass({ seasonEnd: '2026-09-04' }), SUNDAY);
    expect(last).toEqual(new Date(2026, 8, 1, 16, 30, 0));
  });

  it('is unknown for a season with no end', () => {
    expect(lastClassOccurrence(klass({ seasonEnd: null }), SUNDAY)).toBeNull();
  });
});

describe('the button appears exactly when there is something to add', () => {
  it.each([
    ['a scheduled class in season', klass(), true],
    ['no day', klass({ dayOfWeek: null }), false],
    ['no start time', klass({ startTime: null }), false],
    ['a finished season', klass({ seasonEnd: '2026-08-01' }), false],
  ])('%s', (_label, c, expected) => {
    expect(canAddClassToCalendar(c as PortalClass, SUNDAY)).toBe(expected);
    expect(classTarget(c as PortalClass, SUNDAY) !== null).toBe(expected);
  });
});

describe('the calendar file', () => {
  it('is one weekly event bounded by the season', () => {
    const ics = icsOf(klass());

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20260930T235900');
    expect(ics).toContain('SUMMARY:Junior Ballet');
    expect(ics).toContain('LOCATION:Studio A');
  });

  it('repeats indefinitely when the studio has set no season end', () => {
    const ics = icsOf(klass({ seasonEnd: null }));
    expect(ics).toContain('RRULE:FREQ=WEEKLY');
    expect(ics).not.toContain('UNTIL=');
  });

  /**
   * The bug this guards is invisible unless a season crosses a clock change.
   * A UTC-anchored DTSTART fixes an instant rather than a time of day, so
   * every occurrence after November lands an hour early — 4:30 becomes 3:30
   * on every parent's phone, all winter.
   */
  it('keeps its wall-clock time across a daylight-saving change', () => {
    const ics = icsOf(klass({ seasonEnd: '2027-06-20' }));

    expect(ics).toContain('DTSTART:20260901T163000');
    expect(ics).toContain('DTEND:20260901T173000');

    const recurrence = ics.split('\r\n').filter(l => /^(DTSTART|DTEND|EXDATE|RRULE)/.test(l));
    expect(recurrence).not.toHaveLength(0);
    // DTSTAMP may keep its Z — it is a real instant, not a time of day.
    recurrence.forEach(line => expect(line).not.toContain('Z'));
  });

  it('names the teacher and the level in the notes', () => {
    const ics = icsOf(klass());
    expect(ics).toContain('DESCRIPTION:With Jess Moreau\\nLevel 2');
  });

  it('escapes the characters RFC 5545 reserves', () => {
    const ics = icsOf(klass({
      name: 'Turns, Jumps; Leaps',
      location: 'Studio A, upstairs',
    }));

    expect(ics).toContain('SUMMARY:Turns\\, Jumps\\; Leaps');
    expect(ics).toContain('LOCATION:Studio A\\, upstairs');
  });

  it('folds a long description rather than emitting an invalid line', () => {
    const ics = icsOf(klass({
      description: 'Bring pink ballet shoes, hair in a bun, and a water bottle. '
        + 'Parents watch from the corridor on the last Tuesday of each month.',
    }));

    // 75 octets is the RFC limit; a longer line is a file the phone refuses.
    ics.split('\r\n').forEach(line => {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    });
    // And it still says what it said, once the folds are undone.
    expect(ics.replace(/\r\n /g, '')).toContain('Parents watch from the corridor');
  });

  it('uses CRLF, as Outlook insists', () => {
    const ics = icsOf(klass());
    expect(ics).toContain('\r\n');
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('keys the event on the class, so adding twice does not duplicate it', () => {
    expect(icsOf(klass())).toContain('UID:class-cls@didc.app');
  });
});

describe('the handoff', () => {
  it('sends Google the recurrence and an explicit timezone', () => {
    const target = classTarget(klass(), SUNDAY)!;
    const url = decodeURIComponent(target.google);

    expect(url).toContain('dates=20260901T163000/20260901T173000');
    expect(url).toContain('recur=RRULE:FREQ=WEEKLY;UNTIL=20260930T235900');
    expect(url).toContain('ctz=');
  });

  /**
   * Outlook's deeplink has no recurrence parameter. Offering it would hand an
   * Outlook parent one Tuesday in September and no sign the other twenty-nine
   * were missing, so the sheet drops that row and they take the .ics.
   */
  it('offers no Outlook link for something that repeats', () => {
    expect(classTarget(klass(), SUNDAY)!.outlook).toBeNull();
  });

  it('says what will land, in weeks rather than in one date', () => {
    const target = classTarget(klass(), SUNDAY)!;
    expect(target.when).toBe('Tuesdays · 4:30 PM – 5:30 PM');
    expect(target.note).toMatch(/^Every week from .+ to .+\.$/);
    expect(target.fileName).toBe('junior-ballet.ics');
  });

  it('describes a class with no end time by its start alone', () => {
    expect(describeWeekly(klass({ endTime: null }))).toBe('Tuesdays · 4:30 PM');
  });
});
