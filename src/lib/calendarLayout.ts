/**
 * Laying calendar events out as continuous bars.
 *
 * Two separate problems live here, and they are easy to mistake for one.
 *
 * DATES. Event dates arrive as 'YYYY-MM-DD' TEXT — a wall-clock day at the
 * studio, carrying no timezone. `new Date('2026-12-05')` does not parse that
 * as a local day; it parses it as UTC midnight, which is 4pm on the 4th in
 * California. Every all-day event therefore rendered one day early: a
 * birthday on the 5th sat on the 4th, and a closure running the 21st to the
 * 3rd covered the 20th to the 2nd. Days are handled here as plain string
 * keys, or parsed with parseDayKey(). Never with `new Date(str)`.
 *
 * SPANS. A day cell that asks "which events cover me?" can only ever draw its
 * own small chip, which is why a two-week closure looked like fourteen
 * unrelated stickers rather than one bar. A continuous bar has to be laid out
 * one WEEK ROW at a time: each event becomes a segment with a starting
 * column, a width in columns, and a lane that stays clear for its whole run.
 * Lanes are what stop a one-day event from punching a hole through the middle
 * of a longer bar.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. Never toISOString(), which is UTC. */
export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Parse YYYY-MM-DD as LOCAL midnight. The whole point of this module. */
export const parseDayKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addDays = (key: string, n: number): string => {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

/**
 * Whole days from `from` to `to`, negative when `to` is earlier.
 *
 * Math.round, not Math.floor, and that is load-bearing. Two local midnights
 * either side of a daylight-saving change are 23 or 25 hours apart, so
 * flooring 23/24 gives 0 and a March event silently loses a day of width.
 */
export const daysBetween = (from: string, to: string): number =>
  Math.round(
    (parseDayKey(to).getTime() - parseDayKey(from).getTime()) / 86400000
  );

/** Sunday of the week containing `key`, matching the grid's Sun–Sat columns. */
export const startOfWeek = (key: string): string =>
  addDays(key, -parseDayKey(key).getDay());

/** Inclusive day range. `end` is the last day the event covers, not the day after. */
export interface DaySpan {
  start: string;
  end: string;
}

export interface Segment<T> {
  item: T;
  /** 0 = Sunday column of this week row. */
  startCol: number;
  /** Width in columns, 1–7. */
  span: number;
  /** Vertical stack position within the row. */
  lane: number;
  /** Ran before this week — draw the left edge square, not rounded. */
  continuesBefore: boolean;
  /** Runs past this week — draw the right edge square. */
  continuesAfter: boolean;
}

/**
 * Clip a list of events to one week row and stack them into lanes.
 *
 * Returns every segment, including ones in lanes too deep to draw. Callers
 * decide how many lanes fit and use hiddenPerColumn() for the rest.
 */
export const layoutWeek = <T>(
  items: T[],
  weekStart: string,
  getSpan: (item: T) => DaySpan
): { segments: Segment<T>[]; laneCount: number } => {
  const weekEnd = addDays(weekStart, 6);
  const segments: Segment<T>[] = [];

  items.forEach(item => {
    const { start, end } = getSpan(item);
    if (!start) return;
    // An end before its start is bad data, not a negative-width event.
    // Treating it as a single day keeps one bad row from blanking the week.
    const safeEnd = !end || end < start ? start : end;
    if (safeEnd < weekStart || start > weekEnd) return;

    const from = start < weekStart ? weekStart : start;
    const to = safeEnd > weekEnd ? weekEnd : safeEnd;

    segments.push({
      item,
      startCol: daysBetween(weekStart, from),
      span: daysBetween(from, to) + 1,
      lane: 0,
      continuesBefore: start < weekStart,
      continuesAfter: safeEnd > weekEnd,
    });
  });

  // Longest first, so multi-day bars settle at the top of the stack and single
  // days fill in beneath them. That ordering is what makes a long run read as
  // one continuous object instead of a staircase.
  segments.sort((a, b) => b.span - a.span || a.startCol - b.startCol);

  // Occupied column intervals per lane. Checking real overlap rather than
  // "last column used" keeps this correct regardless of the sort above.
  const lanes: Array<Array<[number, number]>> = [];
  segments.forEach(seg => {
    const segEnd = seg.startCol + seg.span;
    let lane = 0;
    for (;;) {
      if (!lanes[lane]) lanes[lane] = [];
      const clash = lanes[lane].some(([s, e]) => seg.startCol < e && s < segEnd);
      if (!clash) break;
      lane += 1;
    }
    lanes[lane].push([seg.startCol, segEnd]);
    seg.lane = lane;
  });

  return { segments, laneCount: lanes.length };
};

/**
 * How many segments each column had to drop, for a "+N more" note.
 *
 * Counted per column rather than per event: a bar hidden on Monday through
 * Wednesday is three days' worth of "more", because that is what the reader
 * is missing when they look at any one of those cells.
 */
export const hiddenPerColumn = <T>(
  segments: Segment<T>[],
  maxLanes: number
): number[] => {
  const counts = new Array(7).fill(0) as number[];
  segments
    .filter(s => s.lane >= maxLanes)
    .forEach(s => {
      for (let c = s.startCol; c < s.startCol + s.span; c += 1) counts[c] += 1;
    });
  return counts;
};

/**
 * Week-start keys covering a whole month grid, including the leading and
 * trailing days that belong to the neighbouring months.
 *
 * Those neighbours are drawn greyed rather than left blank, which is both the
 * familiar look and a requirement for spans: a closure running 21 December to
 * 3 January has to have somewhere to go on the December grid.
 */
export const monthWeeks = (year: number, month: number): string[] => {
  const firstOfMonth = dayKey(new Date(year, month, 1));
  const lastOfMonth = dayKey(new Date(year, month + 1, 0));
  const lastWeek = startOfWeek(lastOfMonth);

  const weeks: string[] = [];
  for (let w = startOfWeek(firstOfMonth); w <= lastWeek; w = addDays(w, 7)) {
    weeks.push(w);
  }
  return weeks;
};
