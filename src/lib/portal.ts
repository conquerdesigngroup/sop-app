import type { PortalProgramSlug } from '../types';

/**
 * Parent-portal constants, route helpers and the access-gate flag.
 *
 * The portal is the client-facing half of the app: reachable before any login,
 * from the STAFF / TEAM chooser at `/`.
 *
 * Note what is NOT here. Program names and blurbs live in portal_programs and
 * are fetched by PortalContext, so renaming a section is a database edit rather
 * than a deploy. This file keeps only the slugs, because routes are typed
 * against them and they must exist before any fetch resolves.
 */

export type ProgramSlug = PortalProgramSlug;

/** Every valid `:program` route segment. Display text comes from the database. */
export const PROGRAM_SLUGS: readonly ProgramSlug[] = ['allstars', 'academy'] as const;

const SLUG_SET = new Set<string>(PROGRAM_SLUGS);

/**
 * Narrow a `:program` route param.
 *
 * Never pass a raw URL segment to a query — it reaches the database as a filter
 * value. Callers redirect when this returns false.
 */
export const isProgramSlug = (slug: string | undefined): slug is ProgramSlug =>
  !!slug && SLUG_SET.has(slug);

/**
 * Enrollio — billing, registration and account admin.
 *
 * Confirmed by the studio as the parent-facing entry point: Enrollio serves the
 * same login for families and staff and routes by account after sign-in, so
 * this is the same URL as the staff dashboard link in commit d63c7a5 rather
 * than an oversight.
 *
 * Defined once here; no component references the raw string.
 */
export const ENROLLIO_URL =
  'https://portal.enrollio.ai/login?studioId=02CXn3sR0U7KkN3DSkwZ';

// ---------------------------------------------------------------- routes

export const portalRoutes = {
  chooser: '/',
  home: '/portal',
  program: (slug: ProgramSlug) => `/portal/${slug}`,
  classes: (slug: ProgramSlug) => `/portal/${slug}/classes`,
  classDetail: (slug: ProgramSlug, classId: string) =>
    `/portal/${slug}/classes/${classId}`,
  updates: (slug: ProgramSlug) => `/portal/${slug}/updates`,
  documents: (slug: ProgramSlug) => `/portal/${slug}/documents`,
  calendar: (slug: ProgramSlug) => `/portal/${slug}/calendar`,
} as const;

/** True for any path rendered inside the portal shell (i.e. no staff chrome). */
export const isPortalPath = (pathname: string): boolean =>
  pathname === '/' || pathname === '/portal' || pathname.startsWith('/portal/');

// ---------------------------------------------------------------- access gate

const GATE_KEY_PREFIX = 'didc_portal_access_';

/**
 * Remember that a visitor cleared the access code for a program.
 *
 * localStorage rather than sessionStorage: a parent who adds the app to their
 * home screen should not re-enter the code every launch.
 *
 * This is a convenience flag, not a security boundary. The code is verified by
 * the verify_portal_code() RPC against a bcrypt hash that never leaves the
 * database — but portal content is readable by `anon`, so setting this flag by
 * hand does not expose anything that was protected. Keep private information
 * out of portal content. See the v9 migration header.
 */
export const hasPortalAccess = (slug: ProgramSlug): boolean => {
  try {
    return window.localStorage.getItem(GATE_KEY_PREFIX + slug) === 'granted';
  } catch {
    // Safari private mode throws on localStorage access.
    return false;
  }
};

export const grantPortalAccess = (slug: ProgramSlug): void => {
  try {
    window.localStorage.setItem(GATE_KEY_PREFIX + slug, 'granted');
  } catch {
    /* no-op — the visitor just re-enters the code next time */
  }
};

export const revokePortalAccess = (slug: ProgramSlug): void => {
  try {
    window.localStorage.removeItem(GATE_KEY_PREFIX + slug);
  } catch {
    /* no-op */
  }
};

// ---------------------------------------------------------------- formatting

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const dayName = (dayOfWeek: number | null): string | null =>
  dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6 ? null : DAY_NAMES[dayOfWeek];

/**
 * 'HH:MM:SS' from a Postgres `time` column -> '4:30 PM'.
 *
 * Formatted by hand rather than through Date: building a Date from a bare time
 * would attach today's date and drag timezone conversion into a value that has
 * no timezone. A class at 16:30 is at 16:30 in the studio regardless.
 */
export const formatTime = (time: string | null): string | null => {
  if (!time) return null;
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
};

/** "Tuesday · 4:30 PM – 5:30 PM", omitting whatever is missing. */
export const formatClassSchedule = (
  dayOfWeek: number | null,
  startTime: string | null,
  endTime: string | null
): string | null => {
  const day = dayName(dayOfWeek);
  const start = formatTime(startTime);
  const end = formatTime(endTime);

  const time = start && end ? `${start} – ${end}` : start;
  if (day && time) return `${day} · ${time}`;
  return day || time || null;
};

// ------------------------------------------------------------------- events

/**
 * All-day events must be read in UTC, timed events in local time.
 *
 * portal_events.starts_at is timestamptz, so an all-day event is stored at
 * UTC midnight — the same convention iCal uses for DATE values. Rendered with
 * local getters, UTC midnight is the *previous evening* anywhere west of
 * Greenwich, so "Studio closed — Thanksgiving" on Sept 30 displays as Sept 29
 * in California. A studio-closed date on the wrong day sends families in on the
 * wrong day, so this is not cosmetic.
 *
 * Timed events get the opposite treatment: a 5pm rehearsal is 5pm to everyone
 * reading it, which is exactly what local rendering gives.
 */
const eventZone = (isAllDay: boolean): Pick<Intl.DateTimeFormatOptions, 'timeZone'> =>
  isAllDay ? { timeZone: 'UTC' } : {};

export const formatEventDate = (
  iso: string,
  isAllDay: boolean,
  opts: Intl.DateTimeFormatOptions
): string => new Date(iso).toLocaleDateString(undefined, { ...opts, ...eventZone(isAllDay) });

export const formatEventTime = (iso: string, isAllDay: boolean): string =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...eventZone(isAllDay),
  });

/** Day-of-month for the agenda date chip, in the event's own frame. */
export const eventDayOfMonth = (iso: string, isAllDay: boolean): number => {
  const d = new Date(iso);
  return isAllDay ? d.getUTCDate() : d.getDate();
};

/** Stable YYYY-M key for grouping, in the event's own frame. */
export const eventMonthKey = (iso: string, isAllDay: boolean): string => {
  const d = new Date(iso);
  return isAllDay
    ? `${d.getUTCFullYear()}-${d.getUTCMonth()}`
    : `${d.getFullYear()}-${d.getMonth()}`;
};

/**
 * Midnight-today in local time, for deciding what has already passed.
 *
 * Compared against midnight rather than `now` so an event earlier today does
 * not disappear while it is still happening.
 */
export const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * 'YYYY-MM-DD' for a local Date — how a month-grid cell is addressed.
 *
 * Built by hand rather than `toISOString().slice(0, 10)`, which converts to UTC
 * first and so names the wrong day for every local evening west of Greenwich.
 */
const pad2 = (n: number): string => String(n).padStart(2, '0');

export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * 'YYYY-MM-DD' for an event boundary, read in the event's own frame.
 *
 * Same split as eventMonthKey and for the same reason: an all-day event is
 * stored at UTC midnight, so reading it locally names the previous day.
 */
export const eventDayKey = (iso: string, isAllDay: boolean): string => {
  const d = new Date(iso);
  return isAllDay
    ? `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
    : dateKey(d);
};

// A season is at most a year of grid. Runaway guard for a bad end date.
const MAX_SPAN_DAYS = 400;

/**
 * The last day an event covers, inclusive.
 *
 * portal_events stores all-day ends inclusively — portal-calendar-sync shifts
 * iCal's exclusive DTEND back a day before writing — so "Closed for Christmas
 * Break" ending 2027-01-03 really is closed on the 3rd.
 *
 * Keys are zero-padded, so `>` and `>=` on the strings order dates correctly
 * and no Date needs building to compare two of them.
 */
export const eventLastDayKey = (
  startsAt: string,
  endsAt: string | null,
  isAllDay: boolean
): string => {
  const first = eventDayKey(startsAt, isAllDay);
  if (!endsAt) return first;
  const last = eventDayKey(endsAt, isAllDay);
  return last > first ? last : first;
};

/**
 * Every day key an event covers, so a multi-day event paints across the grid
 * instead of appearing only on the day it started.
 *
 * Stepped a day at a time in the event's own frame rather than by dividing a
 * millisecond difference: across a DST boundary a "day" is 23 or 25 hours and
 * the division silently loses or repeats a date.
 */
export const eventDayKeys = (
  startsAt: string,
  endsAt: string | null,
  isAllDay: boolean
): string[] => {
  const first = eventDayKey(startsAt, isAllDay);
  const last = eventLastDayKey(startsAt, endsAt, isAllDay);
  if (last === first) return [first];

  const keys: string[] = [];
  const cursor = new Date(startsAt);

  for (let i = 0; i < MAX_SPAN_DAYS; i++) {
    const key = eventDayKey(cursor.toISOString(), isAllDay);
    keys.push(key);
    if (key >= last) break;
    if (isAllDay) cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
};

/**
 * The Sundays-to-Saturdays block of local dates a month grid shows, including
 * the leading and trailing days from the neighbouring months.
 */
export const monthGridDays = (year: number, month: number): Date[] => {
  const first = new Date(year, month, 1);
  const cursor = new Date(year, month, 1 - first.getDay());
  const days: Date[] = [];

  // Six rows always. A fixed height stops the page jumping as the parent pages
  // between a month that needs five rows and one that needs six.
  for (let i = 0; i < 42; i++) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
};

/**
 * "4:30 PM – 6:00 PM", "All day", or "Dec 21 – Jan 3" for a run of days.
 *
 * Lives here rather than in the calendar page because the event card shows the
 * same string, and two copies of this would drift the first time one of them
 * learned about multi-day events.
 */
export const describeEventWhen = (
  startsAt: string,
  endsAt: string | null,
  isAllDay: boolean
): string => {
  const firstDay = eventDayKey(startsAt, isAllDay);
  const lastDay = eventLastDayKey(startsAt, endsAt, isAllDay);

  if (lastDay !== firstDay) {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${formatEventDate(startsAt, isAllDay, opts)} – ${formatEventDate(endsAt!, isAllDay, opts)}`;
  }

  if (isAllDay) return 'All day';

  return endsAt
    ? `${formatEventTime(startsAt, false)} – ${formatEventTime(endsAt, false)}`
    : formatEventTime(startsAt, false);
};

// ---------------------------------------------------------------- files

export const formatFileSize = (bytes: number | null): string | null => {
  if (bytes === null || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
