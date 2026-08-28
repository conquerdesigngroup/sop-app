import type { PortalClass, PortalClassCategory } from '../types';
import { CLASS_CATEGORY_ORDER } from './portal';

/**
 * The schedule engine behind /portal/:program/classes.
 *
 * Everything here is pure: no React, no Supabase, no Date.now() baked into a
 * result. The three views (list, week, month) and the filter bar all read from
 * this file so that "does this class run on the 14th" has exactly one answer.
 *
 * WHY DATES ARE COMPARED AS STRINGS
 *
 * A class recurs weekly between season_start and season_end, both of which are
 * bare 'YYYY-MM-DD' dates with no time and no zone. The obvious implementation
 * — parse both to Date and compare — is the same trap this repo has already
 * been bitten by twice: `new Date('2026-08-31')` is parsed as UTC midnight,
 * which in California is the evening of the 30th, so a season starting on a
 * Monday would light up the Sunday before it. ISO date strings sort
 * lexicographically in calendar order, so comparing them as text is both
 * simpler and correct.
 *
 * The same reasoning is why monthGrid builds each cell with
 * `new Date(y, m, dayNumber)` rather than adding 86_400_000 to the previous
 * one. Adding a day in milliseconds lands an hour early across a DST boundary,
 * and November has one.
 */

// ------------------------------------------------------------------ view

export type ClassView = 'list' | 'week' | 'month';

const VIEW_KEY = 'didc_portal_classes_view';
const VIEWS: readonly ClassView[] = ['list', 'week', 'month'];

/**
 * Which view this device last used.
 *
 * Remembered, unlike the filters. The filters answer one question and should
 * not survive it; the view is a preference — a parent who reads the schedule
 * as a week reads it as a week every time.
 *
 * It is also the only handle the mobile audit has on the week and month
 * layouts. Those are the wide ones, the seven-column grid and the
 * side-scrolling columns, and with the view in component state the audit would
 * measure the single-column list six times and report CLEAN. See
 * AUDIT_CLASSES_VIEW in scripts/audit-mobile-ui.js.
 */
export const readClassView = (): ClassView => {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY) as ClassView | null;
    return stored && VIEWS.includes(stored) ? stored : 'list';
  } catch {
    // Safari private mode throws on localStorage access.
    return 'list';
  }
};

export const writeClassView = (view: ClassView): void => {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* no-op — the view just resets next visit */
  }
};

// ------------------------------------------------------------------ time

/** '16:30:00' -> 990. Null for a missing or unparseable time. */
export const minutesOfDay = (time: string | null): number | null => {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

export type TimeBand = 'morning' | 'afternoon' | 'evening';

export const TIME_BANDS: { value: TimeBand; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

/**
 * Which part of the day a class starts in.
 *
 * The 5 PM cut is the studio's, not a generic one: the after-school block runs
 * from about 3:45 and the older companies start at 5, so splitting there puts
 * "after school" and "after dinner" either side of the line.
 */
export const timeBandOf = (startTime: string | null): TimeBand | null => {
  const mins = minutesOfDay(startTime);
  if (mins === null) return null;
  if (mins < 12 * 60) return 'morning';
  if (mins < 17 * 60) return 'afternoon';
  return 'evening';
};

/** '16:00:00' + '17:15:00' -> '1h 15m'. Null when either end is missing. */
export const durationLabel = (c: PortalClass): string | null => {
  const start = minutesOfDay(c.startTime);
  const end = minutesOfDay(c.endTime);
  if (start === null || end === null || end <= start) return null;
  const total = end - start;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
};

/** '7-18' -> 'Ages 7-18'; equal bounds collapse to 'Age 2'. */
export const ageRangeLabel = (c: PortalClass): string | null => {
  const { ageMinYears: lo, ageMaxYears: hi } = c;
  if (lo === null && hi === null) return null;
  if (lo !== null && hi !== null) {
    return lo === hi ? `Age ${lo}` : `Ages ${lo}–${hi}`;
  }
  return lo !== null ? `Ages ${lo}+` : `Up to age ${hi}`;
};

// ------------------------------------------------------------------ people

/**
 * 'Chill Kerney/Ky’Ree Nevels' -> two names.
 *
 * Co-taught classes are one text field in the export. Splitting matters for
 * the teacher filter: without it, searching for Carlos misses Production,
 * which he co-teaches with three other people.
 */
export const instructorNames = (c: PortalClass): string[] =>
  (c.instructorName ?? '')
    .split('/')
    .map(n => n.trim())
    .filter(Boolean);

/**
 * 'Junior / Teen' -> ['Junior', 'Teen'].
 *
 * A class that spans two bands has to answer to both, or filtering to "Junior"
 * hides half the classes a Junior can actually take.
 */
export const ageGroupTokens = (c: PortalClass): string[] =>
  (c.ageGroup ?? '')
    .split('/')
    .map(t => t.trim())
    .filter(Boolean);

/** Youngest first, then by how far the studio has moved from age to ability. */
const AGE_GROUP_ORDER = [
  'Tiny Tots', 'Creative Movement', 'Ages 5-6', 'Pre-Level',
  'Petite', 'Mini', 'Junior', 'Teen', 'All ages', 'Company',
];

const byKnownOrder = (order: string[]) => (a: string, b: string) => {
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  // Anything an admin adds by hand falls to the bottom, alphabetically, rather
  // than silently taking position 0 the way indexOf's -1 would.
  if (ia === -1 && ib === -1) return a.localeCompare(b);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
};

// ------------------------------------------------------------------ filters

export interface ClassFilters {
  search: string;
  categories: PortalClassCategory[];
  days: number[];
  styles: string[];
  ageGroups: string[];
  instructors: string[];
  rooms: string[];
  bands: TimeBand[];
  /** A dancer's age in years. Matches classes whose range contains it. */
  age: number | null;
}

export const EMPTY_FILTERS: ClassFilters = {
  search: '',
  categories: [],
  days: [],
  styles: [],
  ageGroups: [],
  instructors: [],
  rooms: [],
  bands: [],
  age: null,
};

/** How many facets are narrowing the list, for the "Clear (3)" button. */
export const activeFilterCount = (f: ClassFilters): number =>
  (f.search.trim() ? 1 : 0) +
  (f.age !== null ? 1 : 0) +
  f.categories.length + f.days.length + f.styles.length +
  f.ageGroups.length + f.instructors.length + f.rooms.length + f.bands.length;

/**
 * Free text across the fields a parent would actually type.
 *
 * Description is deliberately excluded. The blurbs are shared between every
 * class of a style and several name other styles in passing — the Turns &
 * Jumps paragraph mentions jazz, contemporary and ballet — so including them
 * makes a search for "ballet" return most of the schedule.
 */
const haystack = (c: PortalClass): string =>
  [c.name, c.instructorName, c.style, c.level, c.ageGroup, c.location]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const someOf = (selected: string[], values: string[]): boolean =>
  selected.length === 0 || values.some(v => selected.includes(v));

export const applyFilters = (classes: PortalClass[], f: ClassFilters): PortalClass[] => {
  const needle = f.search.trim().toLowerCase();

  return classes.filter(c => {
    if (needle && !haystack(c).includes(needle)) return false;
    if (f.categories.length && !f.categories.includes(c.category)) return false;
    if (f.days.length && (c.dayOfWeek === null || !f.days.includes(c.dayOfWeek))) return false;
    if (!someOf(f.styles, c.style ? [c.style] : [])) return false;
    if (!someOf(f.ageGroups, ageGroupTokens(c))) return false;
    if (!someOf(f.instructors, instructorNames(c))) return false;
    if (!someOf(f.rooms, c.location ? [c.location] : [])) return false;

    if (f.bands.length) {
      const band = timeBandOf(c.startTime);
      if (!band || !f.bands.includes(band)) return false;
    }

    if (f.age !== null) {
      // An open-ended range still matches: a class with no stated minimum is
      // not a class that excludes six-year-olds, it is a class nobody has
      // filled that field in for.
      if (c.ageMinYears !== null && f.age < c.ageMinYears) return false;
      if (c.ageMaxYears !== null && f.age > c.ageMaxYears) return false;
    }

    return true;
  });
};

// ------------------------------------------------------------------ facets

export interface ClassFacets {
  categories: PortalClassCategory[];
  days: number[];
  styles: string[];
  ageGroups: string[];
  instructors: string[];
  rooms: string[];
  bands: TimeBand[];
}

/**
 * The options each filter offers, taken from the classes actually on the page.
 *
 * Built from the UNFILTERED list on purpose. Deriving options from the filtered
 * result makes a chip vanish the moment you use it, which reads as a bug and
 * leaves no way back.
 */
export const buildFacets = (classes: PortalClass[]): ClassFacets => {
  const uniq = (values: string[]) => Array.from(new Set(values));

  const categories = CLASS_CATEGORY_ORDER.filter(cat => classes.some(c => c.category === cat));
  const days = Array.from(
    new Set(classes.map(c => c.dayOfWeek).filter((d): d is number => d !== null))
  ).sort((a, b) => a - b);

  return {
    categories: [...categories],
    days,
    styles: uniq(classes.map(c => c.style).filter((s): s is string => !!s)).sort(),
    ageGroups: uniq(classes.flatMap(ageGroupTokens)).sort(byKnownOrder(AGE_GROUP_ORDER)),
    instructors: uniq(classes.flatMap(instructorNames)).sort(),
    rooms: uniq(classes.map(c => c.location).filter((r): r is string => !!r)).sort(),
    bands: TIME_BANDS.map(b => b.value)
      .filter(band => classes.some(c => timeBandOf(c.startTime) === band)),
  };
};

// ------------------------------------------------------------------ sorting

export type ClassSort = 'schedule' | 'name' | 'style' | 'instructor';

export const CLASS_SORTS: { value: ClassSort; label: string }[] = [
  { value: 'schedule', label: 'Day & time' },
  { value: 'name', label: 'Class name' },
  { value: 'style', label: 'Style' },
  { value: 'instructor', label: 'Teacher' },
];

const scheduleKey = (c: PortalClass): number =>
  // A class with no fixed day sorts after Saturday rather than before Sunday.
  (c.dayOfWeek === null ? 7 : c.dayOfWeek) * 1440 + (minutesOfDay(c.startTime) ?? 0);

export const sortClasses = (classes: PortalClass[], sort: ClassSort): PortalClass[] => {
  const out = [...classes];
  const bySchedule = (a: PortalClass, b: PortalClass) =>
    scheduleKey(a) - scheduleKey(b) || a.name.localeCompare(b.name);

  switch (sort) {
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name) || bySchedule(a, b));
    case 'style':
      return out.sort((a, b) => (a.style ?? '').localeCompare(b.style ?? '') || bySchedule(a, b));
    case 'instructor':
      return out.sort(
        (a, b) => (a.instructorName ?? '').localeCompare(b.instructorName ?? '') || bySchedule(a, b)
      );
    default:
      return out.sort(bySchedule);
  }
};

// ------------------------------------------------------------------ grouping

export interface DayGroup {
  /** 0-6, or null for the "no fixed day" bucket. */
  day: number | null;
  classes: PortalClass[];
}

/** Classes bucketed by weekday, in week order, empty days omitted. */
export const groupByDay = (classes: PortalClass[]): DayGroup[] => {
  const buckets = new Map<number, PortalClass[]>();
  const undated: PortalClass[] = [];

  for (const c of classes) {
    if (c.dayOfWeek === null) {
      undated.push(c);
      continue;
    }
    const bucket = buckets.get(c.dayOfWeek);
    if (bucket) bucket.push(c);
    else buckets.set(c.dayOfWeek, [c]);
  }

  const groups: DayGroup[] = Array.from(buckets.keys())
    .sort((a, b) => a - b)
    .map(day => ({
      day,
      classes: (buckets.get(day) ?? []).sort(
        (a, b) => (minutesOfDay(a.startTime) ?? 0) - (minutesOfDay(b.startTime) ?? 0)
          || a.name.localeCompare(b.name)
      ),
    }));

  if (undated.length) groups.push({ day: null, classes: undated });
  return groups;
};

// ------------------------------------------------------------------ calendar

const pad = (n: number) => String(n).padStart(2, '0');

/** A Date -> 'YYYY-MM-DD' in the viewer's own calendar, never UTC. */
export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Does this class meet on this date?
 *
 * Weekly on its day, bounded by the season. Both bounds are inclusive, and a
 * class with neither is treated as running always — a hand-added class with no
 * season should still appear on its weekday rather than nowhere.
 */
export const occursOn = (c: PortalClass, date: Date): boolean => {
  if (c.dayOfWeek === null || date.getDay() !== c.dayOfWeek) return false;
  const iso = isoDate(date);
  if (c.seasonStart && iso < c.seasonStart) return false;
  if (c.seasonEnd && iso > c.seasonEnd) return false;
  return true;
};

/**
 * Six rows of seven days covering `month`, padded out to whole weeks.
 *
 * Always six rows rather than the four-to-six a month actually needs, so the
 * grid does not change height as you page through it — a calendar that jumps
 * when you press "next" is much harder to scan than one that does not.
 */
export const monthGrid = (year: number, month: number): Date[] => {
  const firstOfMonth = new Date(year, month, 1);
  const start = 1 - firstOfMonth.getDay();
  // Each cell is constructed from parts. Adding days in milliseconds lands an
  // hour early across the November DST boundary and silently repeats a date.
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, start + i));
};

/**
 * Which weekday the phone opens on.
 *
 * Today when the studio runs that day, otherwise the first day it does. The
 * point is that the schedule opens on an answer — "here is what is on today" —
 * rather than on a hundred and two classes and a scrollbar.
 *
 * `today` is a parameter rather than a call to new Date() so this stays pure
 * and testable, the same as initialMonth below.
 */
export const defaultDay = (days: number[], today: Date): number | null => {
  if (days.length === 0) return null;
  const dow = today.getDay();
  return days.includes(dow) ? dow : days[0];
};

/**
 * Is any class running on this date?
 *
 * Used to decide whether to mark today on the day strip. Out of season the
 * mark would be a lie: there is a Thursday schedule, but not this Thursday.
 */
export const anyClassOn = (classes: PortalClass[], date: Date): boolean =>
  classes.some(c => occursOn(c, date));

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The month to open on: the first month of the season if it has not started,
 * otherwise the current one.
 *
 * Opening on "today" during the summer gap shows an empty grid and reads as
 * broken. `today` is a parameter rather than a call to new Date() so this stays
 * pure and testable.
 */
export const initialMonth = (classes: PortalClass[], today: Date): { year: number; month: number } => {
  const starts = classes.map(c => c.seasonStart).filter((s): s is string => !!s).sort();
  const earliest = starts[0];
  if (earliest && isoDate(today) < earliest) {
    const [y, m] = earliest.split('-').map(Number);
    return { year: y, month: m - 1 };
  }
  return { year: today.getFullYear(), month: today.getMonth() };
};
