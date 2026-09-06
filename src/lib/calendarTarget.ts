/**
 * What "add this to my calendar" needs to know, whatever "this" is.
 *
 * Two things in this app are addable: a one-off studio event (portalIcs) and a
 * weekly class that runs to the end of the season (classCalendar). They are
 * different shapes — one is an instant, the other a recurrence — but the ROUTES
 * out of the app are identical: Google's composer, the iOS share sheet, an .ics
 * file, a link to paste to someone else. This is the descriptor those routes
 * take, so there is one sheet and one hook rather than two of each drifting
 * apart.
 *
 * `ics` is a thunk on purpose: building the file on every render of a list of a
 * hundred classes, to service a button nobody has pressed, is work thrown away.
 */

// ---------------------------------------------------------------- descriptor

export interface CalendarTarget {
  /** What is being added. Shown at the top of the sheet. */
  title: string;
  /** When, in words — "Tuesdays · 4:30 PM – 5:30 PM". */
  when: string;
  /**
   * One line saying what pressing a route will actually produce, where that is
   * not obvious from the title and the time. A recurring class needs it — "every
   * week from 9 Sep to 20 Jun" is the difference between one date and thirty —
   * and a one-off event does not.
   */
  note?: string;
  /** Google's composer, prefilled. */
  google: string;
  /**
   * Outlook.com's composer, prefilled, or null where it cannot say it.
   *
   * The deeplink has no recurrence parameter, so a weekly class sent through it
   * would arrive as one lesson — an Outlook parent would end up with a single
   * Tuesday in September and no idea the rest were missing. A series passes
   * null and the sheet drops the row; the .ics below carries the recurrence
   * and Outlook imports it correctly.
   */
  outlook: string | null;
  /** The .ics body. Built on demand — see the note above. */
  ics: () => string;
  /** What to call the downloaded file, including the extension. */
  fileName: string;
}

// -------------------------------------------------------------- ics plumbing

/** RFC 5545 TEXT escaping. Backslash first, or it escapes its own output. */
export const icsEscape = (text: string): string =>
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
export const foldIcsLine = (line: string): string => {
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

/** 'junior-hip-hop-1.ics' from a title, with a fallback for a name of symbols. */
export const icsFileName = (title: string, fallback = 'event'): string => {
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${stem || fallback}.ics`;
};

// ----------------------------------------------------------------- delivery

/** Opened in a new tab, and never with a window handle back to this one. */
export const openCalendarUrl = (url: string): void => {
  window.open(url, '_blank', 'noopener,noreferrer');
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
export const downloadIcsFile = (body: string, fileName: string): void => {
  const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoked on a turn of the event loop rather than immediately: Safari has
  // been known to cancel an in-flight download when the URL disappears in the
  // same tick as the click.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

/**
 * Hand the file to whatever the reader's device uses for calendars.
 *
 * The share sheet first on a phone, because on iOS — which is most of this
 * studio's parents — the sheet offers "Add to Calendar" in place, whereas a
 * downloaded .ics lands in Files and has to be found and opened again.
 * Everywhere else the download IS the right answer and the sheet is not.
 *
 * Must be called directly from a click: both the share sheet and the download
 * are gated on a user gesture.
 */
export const shareOrDownloadIcs = async (
  body: string,
  fileName: string,
  title: string
): Promise<AddOutcome> => {
  if (prefersShareSheet()) {
    try {
      const file = new File([body], fileName, { type: 'text/calendar' });
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      // The parent backing out of the sheet is a decision, not a failure.
      // Falling through to a download here would be the app arguing.
      if ((err as Error)?.name === 'AbortError') return 'cancelled';
      // Anything else — a share target that rejected the file — is worth
      // falling through for.
    }
  }

  downloadIcsFile(body, fileName);
  return 'downloaded';
};
