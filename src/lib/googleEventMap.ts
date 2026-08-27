import { CalendarEvent } from '../types';

/**
 * A staff calendar event, translated into the resource the Google Calendar API
 * expects.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE
 *
 * It is the whole risk surface of writing back to Google. Everything else in
 * the push path is an HTTP call that either works or returns an error you can
 * read; this is the part that silently puts an event on the wrong day.
 *
 * THE TWO CONVENTIONS IT HAS TO HONOUR
 *
 * 1. Google's `end.date` is EXCLUSIVE for all-day events, while calendar_events
 *    stores the last day INCLUSIVE — staff-calendar-sync shifts it back on the
 *    way in. This is the exact inverse of that shift. Get it wrong and a
 *    week-long closure is pushed to Google a day short.
 *
 * 2. start_date / start_time are zoneless TEXT: '16:30' means half four at the
 *    studio, full stop. Google accepts exactly that shape — a local dateTime
 *    plus an explicit timeZone — so nothing here converts to UTC. Converting
 *    would introduce a DST bug for the sake of undoing it at the other end.
 */

export interface GoogleDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleEventResource {
  summary: string;
  description?: string;
  location?: string;
  start: GoogleDateTime;
  end: GoogleDateTime;
}

/** calendar_events, in its own columns. Exactly what the sync writes. */
export interface CalendarEventRow {
  title: string;
  description: string;
  location: string | null;
  start_date: string;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  is_all_day: boolean;
}

export interface EventPayload {
  googleEvent: GoogleEventResource;
  row: CalendarEventRow;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Shift a 'YYYY-MM-DD' by whole days.
 *
 * Done in UTC arithmetic rather than a local Date: across a DST boundary a
 * local "day" is 23 or 25 hours, and adding 86400000ms to a local midnight
 * lands on the same date again or skips one.
 */
export const shiftDate = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const out = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  return `${out.getUTCFullYear()}-${pad(out.getUTCMonth() + 1)}-${pad(out.getUTCDate())}`;
};

/** 'HH:MM' or 'HH:MM:SS' -> 'HH:MM', which is what calendar_events stores. */
const normalizeTime = (time: string): string => {
  const [h, m] = time.split(':');
  return `${pad(Number(h))}:${pad(Number(m))}`;
};

const minutesOf = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** An hour later, rolling into the next day if it crosses midnight. */
const oneHourAfter = (date: string, time: string): { date: string; time: string } => {
  const total = minutesOf(time) + 60;
  return {
    date: total >= 1440 ? shiftDate(date, 1) : date,
    time: `${pad(Math.floor((total % 1440) / 60))}:${pad(total % 60)}`,
  };
};

/**
 * Build BOTH shapes of an event from one set of normalised values.
 *
 * WHY THIS RETURNS TWO THINGS
 *
 * They used to be built separately — this module made the Google resource and
 * EventContext hand-rolled the row beside it. An audit found three ways they
 * could disagree, and disagreement here is not a rendering nit: the row is what
 * the studio's own calendar shows and what the parent portal reads.
 *
 * The worst was an all-day event whose end date preceded its start. This module
 * collapsed it to a single day for Google; the hand-rolled row kept the
 * inverted range verbatim, and every render path asks `date >= start && date <=
 * end`, so the event appeared on NO day at all — behind a green "Event added to
 * Google Calendar".
 *
 * One function, one normalisation, two renderings of it.
 *
 * `timeZone` is the calendar's own zone from calendar_sources.time_zone.
 * Required for timed events, meaningless for all-day ones.
 *
 * Throws rather than guessing when the event cannot be represented. A refused
 * save the studio can read beats an event quietly landing on the wrong day of a
 * calendar parents are reading.
 */
export const buildEventPayload = (
  event: Pick<CalendarEvent,
    'title' | 'description' | 'location' | 'startDate' | 'startTime' |
    'endDate' | 'endTime' | 'isAllDay'>,
  timeZone: string
): EventPayload => {
  const title = (event.title ?? '').trim();
  if (!title) throw new Error('An event needs a title.');
  if (!event.startDate) throw new Error('An event needs a start date.');

  const description = (event.description ?? '').trim();
  const location = (event.location ?? '').trim();
  const startDate = event.startDate;

  // No start time means all-day, whatever the flag says. The two disagree in
  // rows written before is_all_day existed, and a missing time is the more
  // reliable signal of the two.
  if (event.isAllDay || !event.startTime) {
    const stored = event.endDate || '';

    // Inverted ranges are refused, not repaired. Repairing them is what let an
    // event render on no day at all: Google got the collapsed version and the
    // row got the inversion.
    if (stored && stored < startDate) {
      throw new Error('The last day of an event cannot be before the first.');
    }

    // Stored inclusively, so a run ending on the 3rd is closed on the 3rd. A
    // single day stores no end at all, matching what the sync writes.
    const spans = Boolean(stored) && stored > startDate;
    const lastDay = spans ? stored : startDate;

    return {
      googleEvent: {
        summary: title,
        ...(description ? { description } : {}),
        ...(location ? { location } : {}),
        start: { date: startDate },
        // DTEND / end.date is EXCLUSIVE — the exact inverse of the shift
        // staff-calendar-sync applies on the way in.
        end: { date: shiftDate(lastDay, 1) },
      },
      row: {
        title,
        description,
        location: location || null,
        start_date: startDate,
        start_time: null,
        end_date: spans ? stored : null,
        end_time: null,
        is_all_day: true,
      },
    };
  }

  if (!timeZone) throw new Error('A timed event needs the calendar time zone.');

  const startTime = normalizeTime(event.startTime);
  let endDate = event.endDate || '';
  let endTime = event.endTime ? normalizeTime(event.endTime) : '';

  if (!endTime) {
    // An end date with no end time cannot be represented without inventing one.
    // Guessing +1 hour here is what silently turned a three-day trip into a
    // one-hour Friday slot in Google while the row kept the three days.
    if (endDate && endDate !== startDate) {
      throw new Error('Give the event an end time, or clear the end date.');
    }
    const guess = oneHourAfter(startDate, startTime);
    endDate = guess.date;
    endTime = guess.time;
  } else if (!endDate) {
    endDate = startDate;
  }

  // Google refuses end <= start with a 400 that names neither field. Caught
  // here so the studio gets a sentence instead.
  if (endDate < startDate ||
      (endDate === startDate && minutesOf(endTime) <= minutesOf(startTime))) {
    throw new Error('The end of an event has to come after its start.');
  }

  return {
    googleEvent: {
      summary: title,
      ...(description ? { description } : {}),
      ...(location ? { location } : {}),
      // Studio wall clock plus the zone, never converted to UTC: start_time is
      // a zoneless TEXT column, and converting means undoing it at the other
      // end, getting DST wrong on the way.
      start: { dateTime: `${startDate}T${startTime}:00`, timeZone },
      end: { dateTime: `${endDate}T${endTime}:00`, timeZone },
    },
    row: {
      title,
      description,
      location: location || null,
      start_date: startDate,
      start_time: startTime,
      // Only stored when it genuinely spans days, matching the sync.
      end_date: endDate !== startDate ? endDate : null,
      end_time: endTime,
      is_all_day: false,
    },
  };
};

/** The Google half alone. Kept because the round-trip tests read it directly. */
export const toGoogleEvent = (
  event: Parameters<typeof buildEventPayload>[0],
  timeZone: string
): GoogleEventResource => buildEventPayload(event, timeZone).googleEvent;
