import { PortalEvent } from '../types';
import { describeEventWhen, formatEventDate } from './portal';
import {
  CalendarTarget,
  foldIcsLine,
  icsEscape,
  icsFileName,
} from './calendarTarget';

/**
 * "Add to my calendar" for a single portal event.
 *
 * The routes out of the app — the share sheet, the download, the copied link —
 * are shared with the class series in classCalendar.ts and live in
 * calendarTarget.ts. What is specific to an event, and lives here, is how one
 * instant is written down: its ICS, its Google link, its Outlook link.
 *
 * WHY NOT utils/calendarExport.ts
 *
 * That one exists and works, but it is built for the staff `CalendarEvent`,
 * whose date and time are separate zoneless TEXT columns. A PortalEvent is a
 * real instant. Feeding one to the other would mean inventing a wall-clock
 * split just to have it reassembled, and it emits three things that are wrong
 * for a file a parent's phone has to read:
 *
 *   - LF line endings. RFC 5545 says CRLF; Outlook is the one that minds.
 *   - No folding. A content line over 75 octets is invalid, and studio event
 *     descriptions run long.
 *   - Floating local times for timed events — no Z, no TZID — so a 5pm
 *     rehearsal becomes 5pm in whatever zone the reader's phone is set to.
 *
 * The staff exporter is left alone. It is correct for the shape it serves.
 */

// --------------------------------------------------------------- formatting

const pad = (n: number): string => String(n).padStart(2, '0');

/** 20260831T170000Z — an absolute instant, which is what portal events are. */
const utcStamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
  `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/**
 * 20260831 — read in UTC deliberately. All-day events are stored at UTC
 * midnight, the same convention iCal uses for DATE values, so reading them
 * locally names the previous day west of Greenwich. See lib/portal.ts.
 */
const dateStamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

const addDaysUtc = (d: Date, days: number): Date => {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
};

/**
 * Start, and the EXCLUSIVE end.
 *
 * Shared by all three exporters below, because iCal, Google and Outlook all
 * take the same two-part convention and all three get the all-day case wrong
 * in the same way if you hand them the stored end date. Portal all-day events
 * are stored LAST-DAY-INCLUSIVE by portal-calendar-sync, which shifts Google's
 * exclusive end back a day on the way in; every reader wants it shifted
 * forward again. Computed once here so the three cannot drift apart.
 *
 * An hour is the conventional default for a timed event with no stated end.
 */
const boundsOf = (event: PortalEvent): { start: Date; end: Date } => {
  const start = new Date(event.startsAt);
  const stored = event.endsAt ? new Date(event.endsAt) : null;

  if (event.isAllDay) {
    const lastDay = stored && stored > start ? stored : start;
    return { start, end: addDaysUtc(lastDay, 1) };
  }

  return { start, end: stored ?? new Date(start.getTime() + 60 * 60 * 1000) };
};

// ------------------------------------------------------------------ builder

/** One VEVENT, wrapped in a VCALENDAR, ready to hand to a phone. */
export const buildEventIcs = (event: PortalEvent): string => {
  const { start, end } = boundsOf(event);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DIDC//Parent Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // Stable, so a parent who taps Add twice updates the event they already
    // have instead of ending up with two of it.
    `UID:${event.id}@didc.app`,
    `DTSTAMP:${utcStamp(new Date())}`,
  ];

  if (event.isAllDay) {
    // DTEND is EXCLUSIVE for DATE values. boundsOf has already added the day;
    // skipping that drops the final day, so a break ending the 3rd would show
    // as ending the 2nd on the parent's phone.
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(start)}`);
    lines.push(`DTEND;VALUE=DATE:${dateStamp(end)}`);
  } else {
    lines.push(`DTSTART:${utcStamp(start)}`);
    lines.push(`DTEND:${utcStamp(end)}`);
  }

  lines.push(`SUMMARY:${icsEscape(event.title)}`);
  if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
  if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);

  // A reminder the parent did not have to set.
  //
  // Without this, "Add" produced an event that sits silently in the calendar
  // and never says anything — which is most of the value a parent thought they
  // were getting when they pressed it.
  //
  // Two hours before a timed event is the leave-the-house nudge. For an all-day
  // one, DTSTART is midnight, so -PT14H is 10am the day before — while there is
  // still time to wash a costume, rather than at midnight when there is not.
  //
  // The same block is emitted by supabase/functions/portal-calendar-feed. It is
  // honoured reliably HERE, on the import path; a subscription may strip it
  // (iOS offers "Remove Alarms", Google substitutes the viewer's defaults).
  lines.push(
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(event.title)}`,
    `TRIGGER:${event.isAllDay ? '-PT14H' : '-PT2H'}`,
    'END:VALARM'
  );

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
};

// --------------------------------------------------- web calendar handoffs

/** 2026-08-31 — UTC, for the same reason dateStamp reads in UTC. */
const isoDate = (d: Date): string =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * A query string, built by hand rather than with URLSearchParams.
 *
 * Two differences, and both are the reason:
 *
 *   - URLSearchParams writes a space as `+`, which only means space under
 *     form encoding. `%20` means it everywhere.
 *   - It also escapes the `/` in Google's `dates` pair to `%2F`. A slash is a
 *     legal sub-delimiter in a query and Google documents the pair with it
 *     literal, so `raw` values are passed through untouched and the URL comes
 *     out looking exactly like the one in Google's own docs.
 *
 * Empty values are dropped, so an event with no location does not arrive with
 * an empty location field.
 */
const query = (parts: Array<[string, string | null | undefined, 'raw'?]>): string =>
  parts
    .filter(([, value]) => !!value)
    .map(([key, value, raw]) => `${key}=${raw ? value : encodeURIComponent(value!)}`)
    .join('&');

/**
 * Google Calendar's event composer, prefilled.
 *
 * This is the route that actually saves a parent some work: it lands on a
 * filled-in event with a Save button, and on a phone with the app installed
 * Google opens it there rather than in the browser. No file, no Files app, no
 * second decision about what to do with a download.
 *
 * `dates` takes the same inclusive-start / exclusive-end pair as the .ics, in
 * the same two shapes — YYYYMMDD for all-day, and a UTC instant otherwise.
 */
export const googleCalendarUrl = (event: PortalEvent): string => {
  const { start, end } = boundsOf(event);

  const dates = event.isAllDay
    ? `${dateStamp(start)}/${dateStamp(end)}`
    : `${utcStamp(start)}/${utcStamp(end)}`;

  return 'https://calendar.google.com/calendar/render?' + query([
    ['action', 'TEMPLATE', 'raw'],
    ['text', event.title],
    ['dates', dates, 'raw'],
    ['details', event.description],
    ['location', event.location],
  ]);
};

/**
 * Outlook.com's event composer, prefilled.
 *
 * outlook.live.com is the personal-account host, which is what a parent has.
 * A work or school account lives on outlook.office.com and would have to sign
 * in again here — that is what the .ics rows below are for, and why this is
 * offered alongside them rather than instead of them.
 *
 * All-day events are sent as bare dates with allday=true. Outlook reads a
 * timestamped all-day event as a timed one and files it at midnight.
 */
export const outlookCalendarUrl = (event: PortalEvent): string => {
  const { start, end } = boundsOf(event);

  return 'https://outlook.live.com/calendar/0/deeplink/compose?' + query([
    ['path', '/calendar/action/compose'],
    ['rru', 'addevent', 'raw'],
    ['subject', event.title],
    ['allday', event.isAllDay ? 'true' : null, 'raw'],
    ['startdt', event.isAllDay ? isoDate(start) : start.toISOString(), 'raw'],
    ['enddt', event.isAllDay ? isoDate(end) : end.toISOString(), 'raw'],
    ['body', event.description],
    ['location', event.location],
  ]);
};

/**
 * The event, as something the sheet can hand to a calendar.
 *
 * Everything below the surface — which routes exist, what the share sheet does,
 * how the file is delivered — is in calendarTarget.ts and shared with the
 * weekly class series. This is the only part that is about an event.
 */
export const eventTarget = (event: PortalEvent): CalendarTarget => ({
  title: event.title,
  when: `${formatEventDate(event.startsAt, event.isAllDay, {
    weekday: 'short', month: 'short', day: 'numeric',
  })} · ${describeEventWhen(event.startsAt, event.endsAt, event.isAllDay)}`,
  google: googleCalendarUrl(event),
  outlook: outlookCalendarUrl(event),
  ics: () => buildEventIcs(event),
  fileName: icsFileName(event.title),
});
