import { PortalEvent } from '../types';

/**
 * "Add to my calendar" for a single portal event.
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

/** RFC 5545 TEXT escaping. Backslash first, or it escapes its own output. */
const escapeText = (text: string): string =>
  String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

/**
 * UTF-8 length of one code point, without TextEncoder.
 *
 * TextEncoder is fine in every browser this ships to, but it is absent from
 * the jsdom the tests run in, and a module-level `new TextEncoder()` takes the
 * whole suite down on import. The arithmetic is four comparisons.
 */
const utf8Len = (codePoint: number): number => {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
};

/**
 * Fold a content line to 75 octets, continuing with CRLF + one space.
 *
 * Counted in OCTETS rather than characters, and never mid-character: the limit
 * is bytes, and an emoji in an event title is four of them. Splitting one
 * produces a file the phone refuses rather than a slightly wide line.
 */
const fold = (line: string): string => {
  const parts: string[] = [];
  let current = '';
  let octets = 0;

  // Array.from, not a for..of over the string, so a surrogate pair counts once.
  for (const ch of Array.from(line)) {
    const size = utf8Len(ch.codePointAt(0) ?? 0);
    if (octets + size > 73) {
      parts.push(current);
      current = ' ';
      octets = 1;
    }
    current += ch;
    octets += size;
  }

  parts.push(current);
  return parts.join('\r\n');
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

  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(fold).join('\r\n') + '\r\n';
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

/** Opened in a new tab, and never with a window handle back to this one. */
export const openCalendarUrl = (url: string): void => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

// ----------------------------------------------------------------- delivery

const fileName = (event: PortalEvent): string => {
  const stem = event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${stem || 'event'}.ics`;
};

export type AddOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Whether the share sheet is the better route on this device.
 *
 * Both halves are needed. canShare({files}) alone is true in desktop Safari,
 * where the sheet offers AirDrop and Mail and no way at all to add a date —
 * a Mac wants the file, which opens Calendar on double-click. The coarse
 * pointer is what separates the phone, where the sheet lists "Add to
 * Calendar" directly and a download disappears into Files.
 *
 * Probed with an empty stand-in rather than the real file: the question is
 * whether this browser shares files of this type at all, and building the
 * .ics to ask is work thrown away on every desktop.
 */
const prefersShareSheet = (): boolean => {
  try {
    if (typeof File !== 'function' || !navigator.canShare) return false;
    if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return false;
    return navigator.canShare({
      files: [new File([''], 'probe.ics', { type: 'text/calendar' })],
    });
  } catch {
    return false;
  }
};

/** Save the .ics straight to the device, no sheet, no questions. */
export const downloadEventIcs = (event: PortalEvent): void => {
  const blob = new Blob([buildEventIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(event);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoked on a turn of the event loop rather than immediately: Safari has
  // been known to cancel an in-flight download when the URL disappears in the
  // same tick as the click.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

/**
 * Hand the event to whatever the parent's device uses for calendars.
 *
 * The share sheet first on a phone, because on iOS — which is most of this
 * studio's parents — the sheet offers "Add to Calendar" in place, whereas a
 * downloaded .ics lands in Files and has to be found and opened again.
 * Everywhere else the download IS the right answer and the sheet is not.
 *
 * Must be called directly from a click: both the share sheet and the download
 * are gated on a user gesture.
 */
export const addEventToCalendar = async (event: PortalEvent): Promise<AddOutcome> => {
  if (prefersShareSheet()) {
    try {
      const file = new File([buildEventIcs(event)], fileName(event), {
        type: 'text/calendar',
      });
      await navigator.share({ files: [file], title: event.title });
      return 'shared';
    } catch (err) {
      // The parent backing out of the sheet is a decision, not a failure.
      // Falling through to a download here would be the app arguing.
      if ((err as Error)?.name === 'AbortError') return 'cancelled';
      // Anything else — a share target that rejected the file — is worth
      // falling through for.
    }
  }

  downloadEventIcs(event);
  return 'downloaded';
};
