import {
  AttendanceClass,
  ClassSession,
  Enrollment,
  Student,
} from '../types/attendance';
import { PortalEvent } from '../types';

/**
 * "When is my kid's next class?" — projected from the schedule, not read from
 * a table.
 *
 * WHY THERE IS NOTHING TO LOOK UP
 *
 * §3.5 derives `portal_class_sessions` from the import: a session row exists
 * because a batch contained an attendance mark for that date. That is the right
 * model for a denominator, and it means **no session row is ever in the
 * future**. Asking the sessions table for the next class returns nothing,
 * forever.
 *
 * So the next class is computed the way the class schedule pages already do it:
 * take the weekly recurrence (`dayOfWeek` + `startTime`), walk it forward from
 * today, and stop at the end of the season. Two things then subtract from it:
 *
 *   - the enrollment window, so a dropped class stops appearing; and
 *   - any session row that DOES exist for a future date with status
 *     'cancelled' or 'closed'. Those are the manual closures an admin enters
 *     ahead of a holiday, and they are the only future rows the table holds.
 *
 * That second one is the whole reason this is not three lines of date maths.
 * A studio that closes for a week and marks it should not still be telling
 * forty families to turn up.
 */

export interface UpcomingClass {
  student: Student;
  klass: AttendanceClass;
  enrollment: Enrollment;
  /** 'YYYY-MM-DD' of the occurrence. */
  date: string;
  startsAt: Date;
  endsAt: Date | null;
}

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

const withTime = (date: Date, time: string | null): Date => {
  const out = new Date(date);
  if (!time) return out;
  const [h, min] = time.split(':').map(Number);
  out.setHours(h ?? 0, min ?? 0, 0, 0);
  return out;
};

const startOfDay = (d: Date): Date => {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
};

/**
 * The dates a class next meets, soonest first.
 *
 * `blocked` holds the dates a session row has already excused — a pre-marked
 * closure. `limit` bounds the walk so a class with no season end cannot spin.
 */
export const nextOccurrences = (
  klass: AttendanceClass,
  enrollment: Enrollment,
  blocked: Set<string>,
  from: Date,
  limit = 8,
): string[] => {
  if (klass.dayOfWeek === null) return [];

  const out: string[] = [];
  const cursor = startOfDay(from);

  // Advance to the first occurrence on or after `from`.
  const delta = (klass.dayOfWeek - cursor.getDay() + 7) % 7;
  cursor.setDate(cursor.getDate() + delta);

  // 52 weeks is a hard stop, not a schedule assumption: a class with no
  // seasonEnd would otherwise loop until `limit` was met, which never happens
  // once every remaining date is blocked.
  for (let week = 0; week < 52 && out.length < limit; week += 1) {
    const iso = localIso(cursor);

    const pastSeason = klass.seasonEnd !== null && iso > klass.seasonEnd;
    if (pastSeason) break;

    const beforeSeason = klass.seasonStart !== null && iso < klass.seasonStart;
    const afterDrop = enrollment.droppedOn !== null && iso > enrollment.droppedOn;
    if (afterDrop) break;

    if (!beforeSeason && !blocked.has(iso) && iso >= enrollment.enrolledOn) {
      out.push(iso);
    }
    cursor.setDate(cursor.getDate() + 7);
  }

  return out;
};

/** Dates a session row has already ruled out. Only non-'held' rows block. */
export const blockedDates = (sessions: ClassSession[]): Set<string> =>
  new Set(sessions.filter(s => s.status !== 'held').map(s => s.sessionDate));

/**
 * Every child's next class, merged into one chronological list.
 *
 * Merged rather than grouped per child on purpose: a parent with three dancers
 * is not asking "what does each of them have this season", they are asking
 * "who do I need to get in the car in the next hour".
 */
export const buildUpcoming = (
  entries: { student: Student; klass: AttendanceClass; enrollment: Enrollment; sessions: ClassSession[] }[],
  from: Date,
  limit = 4,
): UpcomingClass[] => {
  const all: UpcomingClass[] = [];

  entries.forEach(({ student, klass, enrollment, sessions }) => {
    if (enrollment.status !== 'active') return;

    nextOccurrences(klass, enrollment, blockedDates(sessions), from, 3).forEach(date => {
      const day = parseIso(date);
      const startsAt = withTime(day, klass.startTime);

      // A class that started an hour ago is not "next". Anything already
      // finished today drops out; anything still running stays, because a
      // parent checking mid-class is usually checking the pickup time.
      const ends = klass.endTime ? withTime(day, klass.endTime) : null;
      if ((ends ?? startsAt) < from) return;

      all.push({ student, klass, enrollment, date, startsAt, endsAt: ends });
    });
  });

  return all.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).slice(0, limit);
};

/**
 * The next occurrence of EVERY class, one row each.
 *
 * `buildUpcoming` answers "what is on soonest" and caps the list, which is what
 * a schedule needs and exactly wrong for the calendar card: a class that meets
 * on Saturday must still be addable on a Tuesday. This keeps one row per
 * enrollment, uncapped.
 */
export const nextPerClass = (
  entries: { student: Student; klass: AttendanceClass; enrollment: Enrollment; sessions: ClassSession[] }[],
  from: Date,
): UpcomingClass[] => {
  const out: UpcomingClass[] = [];

  entries.forEach(({ student, klass, enrollment, sessions }) => {
    if (enrollment.status !== 'active') return;
    const [date] = nextOccurrences(klass, enrollment, blockedDates(sessions), from, 1);
    if (!date) return;

    const day = parseIso(date);
    out.push({
      student,
      klass,
      enrollment,
      date,
      startsAt: withTime(day, klass.startTime),
      endsAt: klass.endTime ? withTime(day, klass.endTime) : null,
    });
  });

  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
};

// --------------------------------------------------------------- formatting

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Tonight", "Tomorrow", "Thursday", "Thu 18 Sep".
 *
 * Relative words only inside the window where they are unambiguous. Past a
 * week, "Thursday" could be either of two Thursdays, so it becomes a date.
 */
export const relativeDay = (date: Date, now: Date): string => {
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86400000);

  if (days === 0) return date.getHours() >= 17 ? 'Tonight' : 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return DAYS[date.getDay()];
  return `${DAYS[date.getDay()].slice(0, 3)} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
};

export const clockTime = (d: Date): string => {
  const h = d.getHours();
  const m = `${d.getMinutes()}`.padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:${m} ${suffix}`;
};

// ----------------------------------------------------------------- calendar

/**
 * A class occurrence dressed as a PortalEvent.
 *
 * useAddToCalendar and portalIcs already handle every route a parent might
 * want — Google, Outlook, the iOS share sheet, a plain .ics — and all of them
 * speak PortalEvent. Synthesising one is far better than writing a second
 * calendar path that will drift from the tested one.
 *
 * The id is deterministic (class + date) because portalIcs uses it as the ICS
 * UID: a parent who taps Add twice should update the event they already have
 * rather than acquire a duplicate.
 */
export const occurrenceEvent = (u: UpcomingClass): PortalEvent => ({
  id: `class-${u.klass.id}-${u.date}`,
  programId: '',
  classId: u.klass.id,
  title: `${u.klass.name} — ${u.student.firstName}`,
  description: [
    u.klass.instructorName ? `With ${u.klass.instructorName}` : null,
    u.klass.level,
    u.klass.whatToBring?.length ? `Bring: ${u.klass.whatToBring.join(', ')}` : null,
  ].filter(Boolean).join('\n'),
  startsAt: u.startsAt.toISOString(),
  endsAt: (u.endsAt ?? u.startsAt).toISOString(),
  isAllDay: false,
  location: u.klass.location,
  source: 'manual',
  isPublished: true,
  googleCalendarId: null,
  googleEventId: null,
});

const icsEscape = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

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
const localStamp = (d: Date): string =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  + `T${pad(d.getHours())}${pad(d.getMinutes())}00`;

/** DTSTAMP is a real instant — when the file was produced — so it stays UTC. */
const utcStamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
  + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

/**
 * The whole remaining season as ONE recurring event.
 *
 * A parent does not want to press Add fourteen times, and fourteen separate
 * events are fourteen things to delete when the class moves. One VEVENT with an
 * RRULE is what a calendar is actually for.
 *
 * Cancelled dates go in as EXDATE rather than being skipped silently — that is
 * how a calendar expresses "this series, minus that week", and it means a
 * pre-marked studio closure never puts a family in the car.
 */
export const buildSeriesIcs = (
  u: UpcomingClass,
  cancelled: string[],
): string => {
  const until = u.klass.seasonEnd ? withTime(parseIso(u.klass.seasonEnd), '23:59:00') : null;
  const event = occurrenceEvent(u);
  const end = u.endsAt ?? new Date(u.startsAt.getTime() + 60 * 60 * 1000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DIDC//Parent Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:series-${u.klass.id}-${u.student.id}@didc.app`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${localStamp(u.startsAt)}`,
    `DTEND:${localStamp(end)}`,
    until ? `RRULE:FREQ=WEEKLY;UNTIL=${localStamp(until)}` : 'RRULE:FREQ=WEEKLY',
    `SUMMARY:${icsEscape(event.title)}`,
    event.description ? `DESCRIPTION:${icsEscape(event.description)}` : null,
    event.location ? `LOCATION:${icsEscape(event.location)}` : null,
  ].filter(Boolean) as string[];

  // Each excluded date at the class's own start time — an EXDATE only matches
  // an occurrence if the instant lines up, so a bare date silently does nothing.
  cancelled
    .filter(date => date >= u.date)
    .forEach(date => {
      lines.push(`EXDATE:${localStamp(withTime(parseIso(date), u.klass.startTime))}`);
    });

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
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
export const googleSeriesUrl = (u: UpcomingClass): string => {
  const event = occurrenceEvent(u);
  const end = u.endsAt ?? new Date(u.startsAt.getTime() + 60 * 60 * 1000);
  const until = u.klass.seasonEnd ? withTime(parseIso(u.klass.seasonEnd), '23:59:00') : null;

  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', event.title);
  params.set('dates', `${localStamp(u.startsAt)}/${localStamp(end)}`);

  // Google reads a Z-less range in the timezone named by ctz, falling back to
  // the viewer's calendar setting. Naming it explicitly means the event lands
  // at 4:30 PM even for a parent whose Google account is set elsewhere.
  const zone = browserTimeZone();
  if (zone) params.set('ctz', zone);
  if (event.description) params.set('details', event.description);
  if (event.location) params.set('location', event.location);
  if (until) params.set('recur', `RRULE:FREQ=WEEKLY;UNTIL=${localStamp(until)}`);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

/** Hand the .ics to the browser. A real anchor, so iOS does not swallow it. */
export const downloadIcs = (fileName: string, body: string): void => {
  const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
