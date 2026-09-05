import { PortalClass } from '../types';
import {
  CalendarTarget,
  foldIcsLine,
  icsEscape,
  icsFileName,
} from './calendarTarget';
import { dayName, formatTime } from './portal';

/**
 * A weekly class, as something a parent can put in their own calendar.
 *
 * THE WHOLE SEASON, NOT THE NEXT LESSON
 *
 * A weekly class added one week at a time is fourteen taps now and fourteen
 * deletions when the class moves. One recurring event is what a calendar is
 * for, so every route here emits an RRULE that runs to the end of the season —
 * `seriesIcs` for anything reading .ics, and Google's `recur` parameter for the
 * majority who are on Google.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * portalIcs speaks PortalEvent, which is a single instant and has no notion of
 * recurrence; a class series cannot be expressed in it without inventing a
 * field on a shared type that only this would set. What the two DO share — the
 * share sheet, the download, the copied link, the ICS escaping and folding —
 * is in calendarTarget.ts, so there is still one way out of the app.
 *
 * Both callers pass through here: the class schedule, where a class is a
 * PortalClass off the catalogue, and the profile card, where it is one child's
 * enrolment with the studio's known closures attached. See upcomingClasses.ts,
 * which now builds a ClassSeries and hands it to the same two builders.
 */

// -------------------------------------------------------------------- dates

/** 'YYYY-MM-DD' from a local Date, without going through UTC. */
export const localIso = (d: Date): string =>
  `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;

/**
 * Parse 'YYYY-MM-DD' as a LOCAL date.
 *
 * `new Date('2026-08-11')` is midnight UTC, which is the 10th for everyone west
 * of Greenwich — the class would be announced a day early for the entire
 * studio. Every date in this feature is a wall-clock date, so every parse is
 * done by hand.
 */
export const parseIso = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** The date, at 'HH:MM:SS'. A null time leaves midnight alone. */
export const withTime = (date: Date, time: string | null): Date => {
  const out = new Date(date);
  if (!time) return out;
  const [h, min] = time.split(':').map(Number);
  out.setHours(h ?? 0, min ?? 0, 0, 0);
  return out;
};

export const startOfDay = (d: Date): Date => {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
};

const HOUR = 60 * 60 * 1000;

// ------------------------------------------------------------------- series

/**
 * One weekly recurrence, in the terms a calendar file needs.
 *
 * Deliberately not a PortalClass: `upcomingClasses` builds one of these from an
 * enrolment (title carrying the child's name, closures as exclusions) and the
 * schedule builds one from the catalogue row. Everything downstream is shared.
 */
export interface ClassSeries {
  /** The ICS UID, minus the domain. Deterministic — see seriesIcs. */
  uid: string;
  title: string;
  description: string;
  location: string | null;
  /** The first occurrence, in local wall time. */
  start: Date;
  end: Date;
  /** The instant the recurrence stops, or null for a season with no end. */
  until: Date | null;
  /** Occurrence STARTS to skip — a closure the studio has already marked. */
  exdates: Date[];
}

const pad = (n: number): string => `${n}`.padStart(2, '0');

/**
 * 'YYYYMMDDTHHMMSS' in LOCAL wall time. The missing trailing Z is the point.
 *
 * WHY NOT UTC — THIS WAS A REAL BUG
 *
 * A UTC-anchored DTSTART with FREQ=WEEKLY fixes every occurrence to an
 * instant, not to a time of day. The moment the clocks change the whole series
 * shifts: a 4:30 PM class that ran from September would start showing up at
 * 3:30 PM from the first week of November, on every parent's phone, every
 * year. It is invisible in testing unless the fixture season happens to cross
 * a DST boundary — ours ended in September, so it did not.
 *
 * "Every Tuesday at 4:30" is a wall-clock statement, so it is written as one.
 * A floating time is re-read against local time at each occurrence and follows
 * the clock change on its own.
 *
 * The strictly complete form is DTSTART;TZID=America/New_York plus a VTIMEZONE
 * block carrying the DST rules. That needs the studio's timezone, which no
 * table stores, and hand-rolled VTIMEZONE is its own source of bugs. Floating
 * is wrong only for a parent reading the schedule from another timezone, which
 * corrects itself the moment they are home — a far smaller and rarer error
 * than being an hour off for everyone all winter.
 *
 * RFC 5545: when DTSTART is floating, UNTIL and EXDATE must be floating too,
 * so every stamp in the series goes through this one function.
 */
export const localStamp = (d: Date): string =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  + `T${pad(d.getHours())}${pad(d.getMinutes())}00`;

/** DTSTAMP is a real instant — when the file was produced — so it stays UTC. */
const utcStamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
  + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

/**
 * The whole remaining season as ONE recurring event.
 *
 * Cancelled dates go in as EXDATE rather than being skipped silently — that is
 * how a calendar expresses "this series, minus that week", and it means a
 * pre-marked studio closure never puts a family in the car.
 *
 * The UID is deterministic so that a parent who taps Add twice updates the
 * event they already have rather than acquiring a duplicate.
 */
export const seriesIcs = (series: ClassSeries): string => {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DIDC//Parent Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${series.uid}@didc.app`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${localStamp(series.start)}`,
    `DTEND:${localStamp(series.end)}`,
    series.until
      ? `RRULE:FREQ=WEEKLY;UNTIL=${localStamp(series.until)}`
      : 'RRULE:FREQ=WEEKLY',
    `SUMMARY:${icsEscape(series.title)}`,
    series.description ? `DESCRIPTION:${icsEscape(series.description)}` : null,
    series.location ? `LOCATION:${icsEscape(series.location)}` : null,
  ].filter(Boolean) as string[];

  // An EXDATE only matches an occurrence if the instant lines up, so these are
  // stamped at the class's own start time; a bare date silently does nothing.
  series.exdates
    .filter(date => date >= series.start)
    .forEach(date => lines.push(`EXDATE:${localStamp(date)}`));

  lines.push('END:VEVENT', 'END:VCALENDAR');

  // Folded, because a class description is free text an admin typed and a
  // content line over 75 octets is a file the phone refuses.
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
};

/** The viewer's IANA zone, or null where Intl is unavailable. Never throws. */
export const browserTimeZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

/** Google's composer, prefilled with the recurrence rather than one week. */
export const seriesGoogleUrl = (series: ClassSeries): string => {
  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', series.title);
  params.set('dates', `${localStamp(series.start)}/${localStamp(series.end)}`);

  // Google reads a Z-less range in the timezone named by ctz, falling back to
  // the viewer's calendar setting. Naming it explicitly means the event lands
  // at 4:30 PM even for a parent whose Google account is set elsewhere.
  const zone = browserTimeZone();
  if (zone) params.set('ctz', zone);
  if (series.description) params.set('details', series.description);
  if (series.location) params.set('location', series.location);
  if (series.until) params.set('recur', `RRULE:FREQ=WEEKLY;UNTIL=${localStamp(series.until)}`);

  // Google's composer takes no exclusions, so a parent on this route gets the
  // closed weeks too. The .ics is the accurate one, which is why it is offered
  // alongside rather than as a fallback.
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

// ------------------------------------------------------- from a PortalClass

/**
 * The fields a recurrence needs, so the schedule's PortalClass and the
 * attendance side's AttendanceClass can both be handed straight in.
 */
export interface WeeklyClass {
  /** 0 = Sunday, matching Date.getDay(). Null for a class with no fixed day. */
  dayOfWeek: number | null;
  /** 'HH:MM:SS' from a Postgres `time` column. */
  startTime: string | null;
  endTime: string | null;
  seasonStart: string | null;
  seasonEnd: string | null;
}

/**
 * The next time this class meets, or null if it never does again.
 *
 * Three things return null, and all three must: a class with no day or no
 * start time has nothing to put in a calendar; a season that has already
 * ended has no occurrence left. The button is hidden in each case rather than
 * added and doing nothing.
 *
 * A season that has not started yet walks from its first day rather than from
 * today, so a parent browsing the autumn schedule in July gets September's
 * first lesson and not a phantom one this week.
 */
export const nextClassOccurrence = (
  klass: WeeklyClass,
  from: Date,
): { start: Date; end: Date } | null => {
  if (klass.dayOfWeek === null || !klass.startTime) return null;

  const seasonStart = klass.seasonStart ? parseIso(klass.seasonStart) : null;
  const today = startOfDay(from);
  const floor = seasonStart && seasonStart > today ? seasonStart : today;

  const day = new Date(floor);
  day.setDate(day.getDate() + ((klass.dayOfWeek - day.getDay() + 7) % 7));

  const boundsOn = (d: Date) => {
    const start = withTime(d, klass.startTime);
    const end = klass.endTime ? withTime(d, klass.endTime) : new Date(start.getTime() + HOUR);
    return { start, end };
  };

  // Today's class, already finished, is not the next one. A class still
  // running stays: a parent checking mid-class is checking the pickup time.
  let bounds = boundsOn(day);
  if (bounds.end < from) {
    day.setDate(day.getDate() + 7);
    bounds = boundsOn(day);
  }

  if (klass.seasonEnd && localIso(day) > klass.seasonEnd) return null;
  return bounds;
};

/**
 * The last time this class meets, or null if it never does.
 *
 * The season END is not the answer, and saying it is reads as a mistake: a
 * Monday class in a season ending Sunday 20 June would announce itself as
 * running "to Sun, 20 Jun", a date on which it does not meet. So the last day
 * of the season is walked BACK to the class's own weekday.
 *
 * The recurrence itself still stops at the season end — an UNTIL a few days
 * late excludes nothing — this is only what the parent is told.
 */
export const lastClassOccurrence = (klass: WeeklyClass, from: Date): Date | null => {
  const next = nextClassOccurrence(klass, from);
  if (!next || !klass.seasonEnd) return null;

  const day = parseIso(klass.seasonEnd);
  day.setDate(day.getDate() - ((day.getDay() - klass.dayOfWeek! + 7) % 7));

  const last = withTime(day, klass.startTime);
  // A season ending in the same week as the next lesson can walk back past it.
  return last < next.start ? next.start : last;
};

/**
 * What goes in the calendar entry's notes.
 *
 * The teacher and the level are what a parent actually wants to see on the
 * event three months from now; the class's own description follows, separated,
 * because it is free text and can run to a paragraph.
 */
const classNotes = (klass: PortalClass): string =>
  [
    klass.instructorName ? `With ${klass.instructorName}` : null,
    klass.level ? `Level ${klass.level}` : null,
    klass.description?.trim() || null,
  ].filter(Boolean).join('\n');

/** The catalogue row as a recurrence, or null when there is nothing to add. */
export const classSeries = (klass: PortalClass, from: Date): ClassSeries | null => {
  const bounds = nextClassOccurrence(klass, from);
  if (!bounds) return null;

  return {
    // Per CLASS, not per class-and-child: a parent who adds the same class
    // from the schedule twice should end up with one entry. The profile card
    // keys on the child as well, because "Ballet — Maya" and "Ballet — Sam"
    // really are two events.
    uid: `class-${klass.id}`,
    title: klass.name,
    description: classNotes(klass),
    location: klass.location,
    start: bounds.start,
    end: bounds.end,
    until: klass.seasonEnd ? withTime(parseIso(klass.seasonEnd), '23:59:00') : null,
    // The schedule has no closure data. Session rows are attendance-side and
    // scoped to a household, so they are only available on the profile card —
    // which is why that one passes its own.
    exdates: [],
  };
};

const dateLabel = (d: Date): string =>
  d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** "Tuesdays · 4:30 PM – 5:30 PM" — the recurrence, not one date. */
export const describeWeekly = (klass: PortalClass): string => {
  const day = dayName(klass.dayOfWeek);
  const start = formatTime(klass.startTime);
  const end = formatTime(klass.endTime);
  const time = start && end ? `${start} – ${end}` : start;
  return [day ? `${day}s` : null, time].filter(Boolean).join(' · ');
};

/**
 * A class, ready for the add-to-calendar sheet. Null when it cannot be added.
 *
 * No Outlook link: its deeplink cannot carry a recurrence, so a class sent
 * that way would arrive as a single lesson. The .ics row covers Outlook and
 * says so.
 */
export const classTarget = (klass: PortalClass, from: Date): CalendarTarget | null => {
  const series = classSeries(klass, from);
  if (!series) return null;

  const last = lastClassOccurrence(klass, from);

  return {
    title: klass.name,
    when: describeWeekly(klass),
    note: last
      ? `Every week from ${dateLabel(series.start)} to ${dateLabel(last)}.`
      : `Every week from ${dateLabel(series.start)}.`,
    google: seriesGoogleUrl(series),
    outlook: null,
    ics: () => seriesIcs(series),
    fileName: icsFileName(klass.name, 'class'),
  };
};

/** Whether to draw the button at all. Same three rules as the occurrence walk. */
export const canAddClassToCalendar = (klass: PortalClass, from: Date): boolean =>
  nextClassOccurrence(klass, from) !== null;
