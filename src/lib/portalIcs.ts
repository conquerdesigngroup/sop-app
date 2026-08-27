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
  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : null;

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
    // DTEND is EXCLUSIVE for DATE values — the exact inverse of what
    // portal-calendar-sync does on the way IN, where it shifts Google's
    // exclusive end back a day to store the last day inclusively. Skipping
    // this here drops the final day: a break ending the 3rd would show as
    // ending the 2nd on the parent's phone.
    const lastDay = end && end > start ? end : start;
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(start)}`);
    lines.push(`DTEND;VALUE=DATE:${dateStamp(addDaysUtc(lastDay, 1))}`);
  } else {
    // An hour is the conventional default for an event with no stated end.
    const finish = end ?? new Date(start.getTime() + 60 * 60 * 1000);
    lines.push(`DTSTART:${utcStamp(start)}`);
    lines.push(`DTEND:${utcStamp(finish)}`);
  }

  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(fold).join('\r\n') + '\r\n';
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
 * Hand the event to whatever the parent's device uses for calendars.
 *
 * Two routes, and the order matters on a phone. The share sheet is tried first
 * because on iOS — which is most of this studio's parents — a downloaded .ics
 * lands in Files and has to be found and opened again, whereas sharing offers
 * "Add to Calendar" in the sheet itself. Desktop browsers do not advertise file
 * sharing, so they fall through to the download, which is the right behaviour
 * there anyway.
 *
 * Must be called directly from a click: both the share sheet and the download
 * are gated on a user gesture.
 */
export const addEventToCalendar = async (event: PortalEvent): Promise<AddOutcome> => {
  const ics = buildEventIcs(event);
  const name = fileName(event);

  // File is not constructible in every older browser, and canShare({files}) is
  // the only reliable way to ask whether files are actually supported —
  // navigator.share alone is true on browsers that only take text and url.
  try {
    if (typeof File === 'function' && navigator.canShare) {
      const file = new File([ics], name, { type: 'text/calendar' });
      if (navigator.canShare({ files: [file] })) {
        try {
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
    }
  } catch {
    /* no share support; the download below is the whole fallback */
  }

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoked on a turn of the event loop rather than immediately: Safari has
  // been known to cancel an in-flight download when the URL disappears in the
  // same tick as the click.
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  return 'downloaded';
};
