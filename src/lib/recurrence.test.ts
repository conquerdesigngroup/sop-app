import {
  landsOn,
  occurrenceDates,
  nextOccurrence,
  seriesState,
  describeRecurrence,
  occurrenceId,
} from './recurrence';

// 2026-11-02 is a Monday.
describe('landsOn / occurrenceDates', () => {
  it('weekly on picked days', () => {
    const p = { frequency: 'weekly' as const, daysOfWeek: [1, 3] };
    expect(occurrenceDates(p, '2026-11-02', '2026-11-02', '2026-11-15')).toEqual([
      '2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11',
    ]);
  });

  it('every 2 weeks keeps both days in the same on-week', () => {
    const p = { frequency: 'weekly' as const, interval: 2, daysOfWeek: [1, 4] };
    expect(occurrenceDates(p, '2026-11-02', '2026-11-02', '2026-11-22')).toEqual([
      '2026-11-02', '2026-11-05', '2026-11-16', '2026-11-19',
    ]);
  });

  it('weekly with no days falls back to the start weekday', () => {
    expect(landsOn({ frequency: 'weekly', daysOfWeek: [] }, '2026-11-02', '2026-11-09')).toBe(true);
    expect(landsOn({ frequency: 'weekly', daysOfWeek: [] }, '2026-11-02', '2026-11-10')).toBe(false);
  });

  it('every 3 days', () => {
    const p = { frequency: 'daily' as const, interval: 3 };
    expect(occurrenceDates(p, '2026-11-02', '2026-11-03', '2026-11-12')).toEqual([
      '2026-11-05', '2026-11-08', '2026-11-11',
    ]);
  });

  it('monthly on the 31st lands on the last day of short months', () => {
    const p = { frequency: 'monthly' as const, dayOfMonth: 31 };
    expect(occurrenceDates(p, '2026-01-31', '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });

  it('monthly without a day uses the start date day (older rows)', () => {
    expect(landsOn({ frequency: 'monthly', daysOfWeek: [4] }, '2026-10-30', '2026-11-30')).toBe(true);
  });

  it('never before the start, never after the end, nothing while paused', () => {
    const p = { frequency: 'daily' as const, endDate: '2026-11-04' };
    expect(occurrenceDates(p, '2026-11-03', '2026-11-01', '2026-11-10')).toEqual(['2026-11-03', '2026-11-04']);
    expect(occurrenceDates({ ...p, paused: true }, '2026-11-03', '2026-11-01', '2026-11-10')).toEqual([]);
  });

  it('crosses a DST change without drifting', () => {
    // US DST ends 2026-11-01.
    const p = { frequency: 'daily' as const };
    expect(occurrenceDates(p, '2026-10-31', '2026-10-31', '2026-11-02')).toEqual([
      '2026-10-31', '2026-11-01', '2026-11-02',
    ]);
  });
});

describe('nextOccurrence', () => {
  it('finds the next landing day on or after today', () => {
    expect(nextOccurrence({ frequency: 'weekly', daysOfWeek: [5] }, '2026-11-02', '2026-11-06')).toBe('2026-11-06');
    expect(nextOccurrence({ frequency: 'weekly', daysOfWeek: [5] }, '2026-11-02', '2026-11-07')).toBe('2026-11-13');
  });
});

describe('seriesState', () => {
  const p = { frequency: 'daily' as const };
  it('a completed or archived row stays ended, so old one-offs never wake up', () => {
    expect(seriesState(p, 'completed', '2026-06-01', '2026-11-06')).toBe('ended');
    expect(seriesState(p, 'archived', '2026-06-01', '2026-11-06')).toBe('ended');
  });
  it('reads end date, pause and start', () => {
    expect(seriesState({ ...p, endDate: '2026-11-05' }, 'pending', '2026-06-01', '2026-11-06')).toBe('ended');
    expect(seriesState({ ...p, paused: true }, 'pending', '2026-06-01', '2026-11-06')).toBe('paused');
    expect(seriesState(p, 'pending', '2026-11-10', '2026-11-06')).toBe('upcoming');
    expect(seriesState(p, 'pending', '2026-11-01', '2026-11-06')).toBe('active');
  });
});

describe('describeRecurrence', () => {
  it('says it in words', () => {
    expect(describeRecurrence({ frequency: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] }, '2026-11-02')).toBe('Every weekday');
    expect(describeRecurrence({ frequency: 'weekly', daysOfWeek: [3, 1] }, '2026-11-02')).toBe('Every Mon, Wed');
    expect(describeRecurrence({ frequency: 'weekly', interval: 2, daysOfWeek: [2] }, '2026-11-02')).toBe('Every 2 weeks on Tue');
    expect(describeRecurrence({ frequency: 'daily' }, '2026-11-02')).toBe('Every day');
    expect(describeRecurrence({ frequency: 'monthly', dayOfMonth: 1 }, '2026-11-02')).toBe('Monthly on the 1st');
    expect(describeRecurrence({ frequency: 'monthly', dayOfMonth: 22, interval: 3 }, '2026-11-02')).toBe('Every 3 months on the 22nd');
  });
});

describe('occurrenceId', () => {
  it('is a stable, valid UUID that differs by date and series', () => {
    const a = occurrenceId('series-a', '2026-11-06');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(occurrenceId('series-a', '2026-11-06')).toBe(a);
    expect(occurrenceId('series-a', '2026-11-07')).not.toBe(a);
    expect(occurrenceId('series-b', '2026-11-06')).not.toBe(a);
  });
});
