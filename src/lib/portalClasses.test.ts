import {
  applyFilters, ageGroupTokens, buildFacets, durationLabel, EMPTY_FILTERS,
  groupByDay, initialMonth, instructorNames, isoDate, minutesOfDay, monthGrid,
  occursOn, sortClasses, timeBandOf,
} from './portalClasses';
import { PortalClass } from '../types';

/**
 * The parts of the class schedule that looking at the app will not verify.
 *
 * Mostly the recurrence maths. Two bugs have shipped in this repo from date
 * handling — both of them a day early, both from parsing a bare 'YYYY-MM-DD'
 * as UTC — so the season bounds are tested from both sides, and the month grid
 * is tested across a DST boundary where adding 24 hours repeats a date.
 *
 * Run with: npx react-scripts test --testPathPattern portalClasses
 */

const klass = (over: Partial<PortalClass> = {}): PortalClass => ({
  id: 'c1',
  programId: 'p1',
  category: 'academy',
  name: 'Junior Hip Hop 1',
  dayOfWeek: 1,
  startTime: '16:00:00',
  endTime: '17:00:00',
  level: '1',
  location: 'Studio 4',
  description: '',
  instructorName: 'Ky’Ree Nevels',
  sortOrder: 1,
  isActive: true,
  style: 'Hip Hop',
  ageGroup: 'Junior',
  ageMinYears: 7,
  ageMaxYears: 18,
  capacity: 20,
  tuitionFee: 77.5,
  registrationFee: 0,
  costumeFee: 0,
  billingCycle: 'Monthly',
  billingDay: 15,
  season: '2026-2027',
  seasonStart: '2026-08-31',
  seasonEnd: '2027-06-20',
  registrationOpens: '2026-08-29',
  sourceTitle: 'Junior Hip Hop 1 (KyRee/M-4PM)',
  ...over,
});

describe('time helpers', () => {
  it('reads a Postgres time column', () => {
    expect(minutesOfDay('16:30:00')).toBe(990);
    expect(minutesOfDay('09:05:00')).toBe(545);
    expect(minutesOfDay(null)).toBeNull();
  });

  it('bands the day at noon and 5pm', () => {
    expect(timeBandOf('09:30:00')).toBe('morning');
    expect(timeBandOf('15:45:00')).toBe('afternoon');
    expect(timeBandOf('16:59:00')).toBe('afternoon');
    expect(timeBandOf('17:00:00')).toBe('evening');
  });

  it('describes a duration without a stray zero', () => {
    expect(durationLabel(klass())).toBe('1h');
    expect(durationLabel(klass({ endTime: '17:15:00' }))).toBe('1h 15m');
    expect(durationLabel(klass({ endTime: '16:30:00' }))).toBe('30m');
    expect(durationLabel(klass({ endTime: null }))).toBeNull();
  });
});

describe('co-taught and multi-band classes', () => {
  it('splits every teacher out of one text field', () => {
    const production = klass({
      instructorName: 'Alyssa Zuppardo/Carlos Renteria/Ky’Ree Nevels/Chill Kerney',
    });
    expect(instructorNames(production)).toHaveLength(4);
    expect(instructorNames(production)).toContain('Carlos Renteria');
  });

  it('answers to both halves of a Junior / Teen band', () => {
    expect(ageGroupTokens(klass({ ageGroup: 'Junior / Teen' }))).toEqual(['Junior', 'Teen']);
    expect(ageGroupTokens(klass({ ageGroup: null }))).toEqual([]);
  });
});

describe('applyFilters', () => {
  const hipHop = klass({ id: 'a' });
  const tinyTots = klass({
    id: 'b', name: 'Tiny Tots', category: 'tnt', dayOfWeek: 5, startTime: '16:30:00',
    endTime: '17:00:00', style: 'Tiny Tots', ageGroup: 'Tiny Tots', level: null,
    ageMinYears: 2, ageMaxYears: 2, location: 'Studio 3', instructorName: 'Kansas O’Dwyer',
  });
  const production = klass({
    id: 'c', name: 'Production', category: 'allstars', dayOfWeek: 6, startTime: '10:00:00',
    endTime: '13:00:00', style: 'Production', ageGroup: 'Company', level: null,
    ageMinYears: 5, ageMaxYears: 18, location: 'Studio 1',
    instructorName: 'Alyssa Zuppardo/Carlos Renteria',
  });
  const all = [hipHop, tinyTots, production];
  const ids = (cs: PortalClass[]) => cs.map(c => c.id).sort();

  it('passes everything through when nothing is set', () => {
    expect(applyFilters(all, EMPTY_FILTERS)).toHaveLength(3);
  });

  it('matches an age against the class range, not the age group label', () => {
    expect(ids(applyFilters(all, { ...EMPTY_FILTERS, age: 6 }))).toEqual(['c']);
    expect(ids(applyFilters(all, { ...EMPTY_FILTERS, age: 2 }))).toEqual(['b']);
    expect(ids(applyFilters(all, { ...EMPTY_FILTERS, age: 8 }))).toEqual(['a', 'c']);
  });

  it('finds a co-taught class by either teacher', () => {
    const f = { ...EMPTY_FILTERS, instructors: ['Carlos Renteria'] };
    expect(ids(applyFilters(all, f))).toEqual(['c']);
  });

  it('combines facets as AND', () => {
    const f = { ...EMPTY_FILTERS, categories: ['tnt' as const], days: [5] };
    expect(ids(applyFilters(all, f))).toEqual(['b']);
    expect(applyFilters(all, { ...f, days: [1] })).toHaveLength(0);
  });

  it('searches the name, teacher, style and room but not the blurb', () => {
    const blurbed = klass({ id: 'd', name: 'Mini Acro 1', style: 'Acro', description: 'Ballet-ish.' });
    expect(applyFilters([blurbed], { ...EMPTY_FILTERS, search: 'acro' })).toHaveLength(1);
    expect(applyFilters([blurbed], { ...EMPTY_FILTERS, search: 'Studio 4' })).toHaveLength(1);
    expect(applyFilters([blurbed], { ...EMPTY_FILTERS, search: 'ballet' })).toHaveLength(0);
  });

  it('offers options from the whole page, not the filtered result', () => {
    const facets = buildFacets(all);
    expect(facets.categories).toEqual(['allstars', 'academy', 'tnt']);
    expect(facets.days).toEqual([1, 5, 6]);
    expect(facets.rooms).toEqual(['Studio 1', 'Studio 3', 'Studio 4']);
    expect(facets.bands).toEqual(['morning', 'afternoon']);
    // Youngest band first, and Company last, rather than alphabetical.
    expect(facets.ageGroups).toEqual(['Tiny Tots', 'Junior', 'Company']);
  });
});

describe('sorting and grouping', () => {
  const mon4 = klass({ id: 'a', dayOfWeek: 1, startTime: '16:00:00', name: 'Bravo' });
  const mon6 = klass({ id: 'b', dayOfWeek: 1, startTime: '18:00:00', name: 'Alpha' });
  const sat = klass({ id: 'c', dayOfWeek: 6, startTime: '09:30:00', name: 'Charlie' });
  const floating = klass({ id: 'd', dayOfWeek: null, startTime: null, name: 'Delta' });

  it('orders by day then time', () => {
    const out = sortClasses([sat, mon6, mon4], 'schedule').map(c => c.id);
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('sorts a dayless class after Saturday, not before Sunday', () => {
    expect(sortClasses([floating, sat], 'schedule').map(c => c.id)).toEqual(['c', 'd']);
  });

  it('groups into weekdays and drops the empty ones', () => {
    const groups = groupByDay([sat, mon6, mon4, floating]);
    expect(groups.map(g => g.day)).toEqual([1, 6, null]);
    expect(groups[0].classes.map(c => c.id)).toEqual(['a', 'b']);
  });
});

describe('weekly recurrence', () => {
  // 2026-08-31 is a Monday; the season runs to 2027-06-20.
  const monday = klass({ dayOfWeek: 1 });

  it('meets on its own weekday inside the season', () => {
    expect(occursOn(monday, new Date(2026, 8, 7))).toBe(true);   // Mon 7 Sep
  });

  it('does not meet on any other weekday', () => {
    expect(occursOn(monday, new Date(2026, 8, 8))).toBe(false);  // Tue 8 Sep
  });

  it('includes the first and last day of the season', () => {
    expect(occursOn(monday, new Date(2026, 7, 31))).toBe(true);  // Mon 31 Aug
    // 2027-06-20 is a Sunday, so the last Monday inside the season is the 14th.
    expect(occursOn(klass({ dayOfWeek: 0 }), new Date(2027, 5, 20))).toBe(true);
  });

  it('does not meet the week before the season starts', () => {
    expect(occursOn(monday, new Date(2026, 7, 24))).toBe(false);
  });

  it('does not meet after the season ends', () => {
    expect(occursOn(monday, new Date(2027, 5, 21))).toBe(false);
  });

  it('runs always when nobody has set a season', () => {
    const undated = klass({ seasonStart: null, seasonEnd: null });
    expect(occursOn(undated, new Date(2030, 0, 7))).toBe(true);  // a Monday
  });

  it('never meets when it has no fixed day', () => {
    expect(occursOn(klass({ dayOfWeek: null }), new Date(2026, 8, 7))).toBe(false);
  });
});

describe('monthGrid', () => {
  it('always returns six whole weeks starting on a Sunday', () => {
    const grid = monthGrid(2026, 8);
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(0);
    expect(grid[41].getDay()).toBe(6);
  });

  it('pads with the tail of the previous month', () => {
    // 1 September 2026 is a Tuesday, so the grid opens on Sunday 30 August.
    expect(isoDate(monthGrid(2026, 8)[0])).toBe('2026-08-30');
  });

  it('does not repeat a date across the autumn DST change', () => {
    // November 2026: the clocks go back on the 1st in the US. Adding 86,400,000
    // ms per cell lands at 23:00 the same evening and repeats it.
    const seen = monthGrid(2026, 10).map(isoDate);
    expect(new Set(seen).size).toBe(42);
    expect(seen).toContain('2026-11-01');
    expect(seen).toContain('2026-11-02');
  });

  it('does not repeat a date across the spring DST change', () => {
    const seen = monthGrid(2027, 2).map(isoDate);
    expect(new Set(seen).size).toBe(42);
  });
});

describe('initialMonth', () => {
  const classes = [klass()];

  it('opens on the current month once the season is under way', () => {
    expect(initialMonth(classes, new Date(2026, 9, 12))).toEqual({ year: 2026, month: 9 });
  });

  it('opens on the first month of the season before it starts', () => {
    // An empty grid in the summer gap reads as a broken page.
    expect(initialMonth(classes, new Date(2026, 5, 1))).toEqual({ year: 2026, month: 7 });
  });

  it('falls back to today when no class has a season', () => {
    const undated = [klass({ seasonStart: null })];
    expect(initialMonth(undated, new Date(2026, 5, 1))).toEqual({ year: 2026, month: 5 });
  });
});
