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

/** 'HH:MM' or 'HH:MM:SS' -> 'HH:MM:SS', which is what Google wants. */
const normalizeTime = (time: string): string => {
  const [h, m, s] = time.split(':');
  return `${pad(Number(h))}:${pad(Number(m))}:${pad(Number(s ?? 0))}`;
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
 * Build the Google resource for an event.
 *
 * `timeZone` is the calendar's own zone, from calendar_sources.time_zone. It is
 * required for timed events and meaningless for all-day ones.
 *
 * Throws rather than guessing when the event could not be represented: a
 * refused save the studio can read beats an event quietly landing at the wrong
 * time on a calendar parents are reading.
 */
export const toGoogleEvent = (
  event: Pick<CalendarEvent,
    'title' | 'description' | 'location' | 'startDate' | 'startTime' |
    'endDate' | 'endTime' | 'isAllDay'>,
  timeZone: string
): GoogleEventResource => {
  const title = (event.title ?? '').trim();
  if (!title) throw new Error('An event needs a title.');
  if (!event.startDate) throw new Error('An event needs a start date.');

  const resource: GoogleEventResource = {
    summary: title,
    start: {},
    end: {},
  };

  const description = (event.description ?? '').trim();
  const location = (event.location ?? '').trim();
  if (description) resource.description = description;
  if (location) resource.location = location;

  // No start time means all-day, whatever the flag says. The two disagree in
  // rows written before is_all_day existed, and a missing time is the more
  // reliable signal of the two.
  if (event.isAllDay || !event.startTime) {
    const stored = event.endDate;
    // Stored inclusively, so a run ending on the 3rd is closed on the 3rd.
    // Anything at or before the start collapses to a single day.
    const lastDay = stored && stored > event.startDate ? stored : event.startDate;
    resource.start = { date: event.startDate };
    resource.end = { date: shiftDate(lastDay, 1) };
    return resource;
  }

  if (!timeZone) throw new Error('A timed event needs the calendar time zone.');

  const startTime = event.startTime;
  let endDate = event.endDate || event.startDate;
  let endTime = event.endTime;

  if (!endTime) {
    const guess = oneHourAfter(event.startDate, startTime);
    endDate = guess.date;
    endTime = guess.time;
  }

  // Google refuses end <= start with a 400 that names neither field. Caught
  // here so the studio gets a sentence instead.
  if (endDate < event.startDate ||
      (endDate === event.startDate && minutesOf(endTime) <= minutesOf(startTime))) {
    throw new Error('The end of an event has to come after its start.');
  }

  resource.start = {
    dateTime: `${event.startDate}T${normalizeTime(startTime)}`,
    timeZone,
  };
  resource.end = {
    dateTime: `${endDate}T${normalizeTime(endTime)}`,
    timeZone,
  };

  return resource;
};
