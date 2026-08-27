import {
  dayKey,
  parseDayKey,
  addDays,
  daysBetween,
  startOfWeek,
  layoutWeek,
  hiddenPerColumn,
  monthWeeks,
  DaySpan,
} from './calendarLayout';

/** Minimal stand-in for a calendar event. */
interface E {
  id: string;
  start: string;
  end?: string;
}
const span = (e: E): DaySpan => ({ start: e.start, end: e.end || e.start });

const layout = (items: E[], weekStart: string) =>
  layoutWeek(items, weekStart, span);

// ---------------------------------------------------------------- dates

describe('day keys', () => {
  it('parses a date string as the local day, not UTC midnight', () => {
    // The bug this module exists for: `new Date('2026-12-05')` is 4pm on the
    // 4th in California, so a birthday on the 5th rendered on the 4th.
    const d = parseDayKey('2026-12-05');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(5);
  });

  it('round-trips through dayKey', () => {
    expect(dayKey(parseDayKey('2027-01-03'))).toBe('2027-01-03');
  });

  it('does not agree with the naive UTC parse west of Greenwich', () => {
    // Guards the fix itself: if someone "simplifies" parseDayKey back to
    // new Date(str), this is the test that goes red.
    const naive = new Date('2026-12-05');
    const local = parseDayKey('2026-12-05');
    if (naive.getTimezoneOffset() > 0) {
      expect(naive.getDate()).not.toBe(local.getDate());
    }
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('counts whole days across a daylight-saving change', () => {
    // US DST starts 8 Mar 2026 and ends 1 Nov 2026. These midnights are 23
    // and 25 hours apart; flooring instead of rounding loses a day of width.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-03-08', '2026-03-08')).toBe(0);
  });

  it('counts backwards as negative', () => {
    expect(daysBetween('2026-12-05', '2026-12-01')).toBe(-4);
  });

  it('finds the Sunday of a week', () => {
    // 2026-12-05 is a Saturday.
    expect(startOfWeek('2026-12-05')).toBe('2026-11-29');
    // A Sunday is its own week start.
    expect(startOfWeek('2026-11-29')).toBe('2026-11-29');
  });
});

// ---------------------------------------------------------------- spans

describe('layoutWeek', () => {
  const week = '2026-12-27'; // Sun 27 Dec – Sat 2 Jan

  it('places a single-day event in one column', () => {
    const { segments } = layout([{ id: 'a', start: '2026-12-29' }], week);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      startCol: 2,
      span: 1,
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  it('spans a multi-day event as ONE segment, not one per day', () => {
    // The whole point: 7 chips become 1 bar.
    const { segments } = layout(
      [{ id: 'a', start: '2026-12-28', end: '2026-12-31' }],
      week
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ startCol: 1, span: 4 });
  });

  it('clips an event that started before this week and flags the edge', () => {
    // Closed for Christmas Break: 21 Dec – 3 Jan.
    const { segments } = layout(
      [{ id: 'x', start: '2026-12-21', end: '2027-01-03' }],
      week
    );
    expect(segments[0]).toMatchObject({
      startCol: 0,
      span: 7,
      continuesBefore: true,
      continuesAfter: true,
    });
  });

  it('ends exactly on the last covered day', () => {
    // Ends Sat 2 Jan, the final column — so it must NOT be marked continuing.
    const { segments } = layout(
      [{ id: 'x', start: '2026-12-30', end: '2027-01-02' }],
      week
    );
    expect(segments[0]).toMatchObject({
      startCol: 3,
      span: 4,
      continuesAfter: false,
    });
  });

  it('drops events that miss the week entirely', () => {
    const { segments } = layout(
      [
        { id: 'before', start: '2026-12-01', end: '2026-12-26' },
        { id: 'after', start: '2027-01-03' },
      ],
      week
    );
    expect(segments).toHaveLength(0);
  });

  it('treats an end before its start as a single day rather than vanishing', () => {
    const { segments } = layout(
      [{ id: 'bad', start: '2026-12-30', end: '2026-12-28' }],
      week
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ startCol: 3, span: 1 });
  });

  it('gives overlapping events separate lanes', () => {
    const { segments, laneCount } = layout(
      [
        { id: 'long', start: '2026-12-27', end: '2027-01-02' },
        { id: 'short', start: '2026-12-30' },
      ],
      week
    );
    expect(laneCount).toBe(2);
    const long = segments.find(s => s.item.id === 'long')!;
    const short = segments.find(s => s.item.id === 'short')!;
    // The long bar takes the top lane so it reads as one object.
    expect(long.lane).toBe(0);
    expect(short.lane).toBe(1);
  });

  it('reuses a lane when two events do not overlap', () => {
    const { laneCount } = layout(
      [
        { id: 'a', start: '2026-12-27', end: '2026-12-28' },
        { id: 'b', start: '2026-12-31', end: '2027-01-01' },
      ],
      week
    );
    expect(laneCount).toBe(1);
  });

  it('never overlaps two segments within one lane', () => {
    const items: E[] = [
      { id: 'a', start: '2026-12-27', end: '2027-01-02' },
      { id: 'b', start: '2026-12-28', end: '2026-12-30' },
      { id: 'c', start: '2026-12-29' },
      { id: 'd', start: '2026-12-29', end: '2026-12-31' },
      { id: 'e', start: '2026-12-27' },
    ];
    const { segments } = layout(items, week);
    const byLane = new Map<number, Array<[number, number]>>();
    segments.forEach(s => {
      const list = byLane.get(s.lane) || [];
      list.forEach(([st, en]) => {
        expect(s.startCol >= en || s.startCol + s.span <= st).toBe(true);
      });
      list.push([s.startCol, s.startCol + s.span]);
      byLane.set(s.lane, list);
    });
  });
});

// ---------------------------------------------------------------- overflow

describe('hiddenPerColumn', () => {
  it('counts a dropped bar against every column it covered', () => {
    const { segments } = layout(
      [
        { id: 'a', start: '2026-12-27', end: '2027-01-02' },
        { id: 'b', start: '2026-12-27', end: '2027-01-02' },
        { id: 'c', start: '2026-12-28', end: '2026-12-29' },
      ],
      '2026-12-27'
    );
    // Keep one lane; the other two bars are hidden.
    const hidden = hiddenPerColumn(segments, 1);
    expect(hidden[0]).toBe(1); // only the second week-long bar
    expect(hidden[1]).toBe(2); // that bar plus the two-day one
    expect(hidden[2]).toBe(2);
    expect(hidden[3]).toBe(1);
  });

  it('reports nothing hidden when everything fits', () => {
    const { segments } = layout([{ id: 'a', start: '2026-12-29' }], '2026-12-27');
    expect(hiddenPerColumn(segments, 3)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

// ---------------------------------------------------------------- grid

describe('monthWeeks', () => {
  it('covers every day of the month', () => {
    // December 2026: 1st is a Tuesday, 31st a Thursday.
    const weeks = monthWeeks(2026, 11);
    expect(weeks[0]).toBe('2026-11-29');
    expect(weeks[weeks.length - 1]).toBe('2026-12-27');
    expect(weeks).toHaveLength(5);
  });

  it('handles a month that starts on a Sunday', () => {
    // November 2026 starts on a Sunday.
    expect(monthWeeks(2026, 10)[0]).toBe('2026-11-01');
  });

  it('gives six rows to a long month that starts late in the week', () => {
    // August 2026: 1st is a Saturday, 31 days — needs six rows.
    expect(monthWeeks(2026, 7)).toHaveLength(6);
  });
});
