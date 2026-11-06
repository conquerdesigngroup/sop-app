import { ShiftReport, filterReports, mapReport, unseenTaggedReports, DEFAULT_FILTER, formatShiftDate } from './shiftReports';

const report = (id: string, over: Partial<ShiftReport> = {}): ShiftReport => ({
  ...mapReport({ id, author_id: 'a', shift_type: 'closing', shift_date: '2026-11-05', body: 'Mopped B', created_at: `2026-11-05T0${id}:00:00Z` }),
  ...over,
});
const tag = (reportId: string, userId: string, seenAt: string | null = null) =>
  ({ reportId, userId, taggedBy: 'a', createdAt: '2026-11-05T00:00:00Z', seenAt });

describe('unseenTaggedReports', () => {
  it('is the reports I am tagged on and have not opened, newest first, never archived ones', () => {
    const reports = [
      report('1', { tags: [tag('1', 'me')] }),
      report('2', { tags: [tag('2', 'me', '2026-11-05T05:00:00Z')] }),
      report('3', { tags: [tag('3', 'someone-else')] }),
      report('4', { tags: [tag('4', 'me')], archivedAt: '2026-11-05T06:00:00Z' }),
      report('5', { tags: [tag('5', 'me')] }),
    ];
    expect(unseenTaggedReports(reports, 'me').map(r => r.id)).toEqual(['5', '1']);
    expect(unseenTaggedReports(reports, undefined)).toEqual([]);
  });
});

describe('filterReports', () => {
  const reports = [
    report('1', { shiftType: 'opening', authorId: 'jess', body: 'Speaker crackles' }),
    report('2', { authorId: 'devon', tags: [tag('2', 'me')] }),
  ];
  const nameOf = (id: string) => (id === 'jess' ? 'Jess Moreau' : 'Devon Clarke');

  it('filters by type, author, tag and text, including the author name', () => {
    expect(filterReports(reports, { ...DEFAULT_FILTER, shiftType: 'opening' }, 'me', nameOf).map(r => r.id)).toEqual(['1']);
    expect(filterReports(reports, { ...DEFAULT_FILTER, authorId: 'devon' }, 'me', nameOf).map(r => r.id)).toEqual(['2']);
    expect(filterReports(reports, { ...DEFAULT_FILTER, taggedMe: true }, 'me', nameOf).map(r => r.id)).toEqual(['2']);
    expect(filterReports(reports, { ...DEFAULT_FILTER, search: 'speaker' }, 'me', nameOf).map(r => r.id)).toEqual(['1']);
    expect(filterReports(reports, { ...DEFAULT_FILTER, search: 'moreau' }, 'me', nameOf).map(r => r.id)).toEqual(['1']);
  });
});

it('prints a studio day without shifting it a day in any zone', () => {
  expect(formatShiftDate('2026-11-05')).toMatch(/Nov 5/);
});
