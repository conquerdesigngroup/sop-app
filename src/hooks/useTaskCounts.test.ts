import { isTaskOverdue } from './useTaskCounts';
import { JobTask } from '../types';

/**
 * The single rule behind every overdue badge. Pinned here because the Alerts
 * page, the Job Tasks filter and the badges all have to agree, and the only
 * way they do is if they all mean this.
 */
const base = (overrides: Partial<JobTask>): JobTask =>
  ({ status: 'pending', scheduledDate: '2026-01-10', assignedTo: [], ...overrides } as JobTask);

const TODAY = '2026-01-15';

describe('isTaskOverdue', () => {
  it('is overdue when scheduled before today and not finished', () => {
    expect(isTaskOverdue(base({ scheduledDate: '2026-01-14' }), TODAY)).toBe(true);
    expect(isTaskOverdue(base({ scheduledDate: '2026-01-14', status: 'in-progress' }), TODAY)).toBe(true);
  });

  it('is not overdue on the day it is due', () => {
    expect(isTaskOverdue(base({ scheduledDate: TODAY }), TODAY)).toBe(false);
  });

  it('trusts a stored overdue status even if the date says otherwise', () => {
    expect(isTaskOverdue(base({ scheduledDate: '2026-02-01', status: 'overdue' }), TODAY)).toBe(true);
  });

  it('never counts completed, archived or draft tasks', () => {
    for (const status of ['completed', 'archived', 'draft'] as const) {
      expect(isTaskOverdue(base({ scheduledDate: '2025-01-01', status }), TODAY)).toBe(false);
    }
  });
});

/**
 * Everything above passes `today` in, which is what makes it zone-proof — and
 * is also why the defaulted argument went four months without a test while it
 * was wrong. It resolved local midnight through toISOString(), so east of
 * Greenwich it answered with yesterday and a task that fell due yesterday
 * counted as not-yet-due. The default is now the STUDIO's date, which is what
 * the push digest in supabase/functions/alert-push compares against.
 *
 * The two instants below are chosen to separate the answers: the first is
 * one the old idiom got wrong in Berlin and Tokyo, the second one it got
 * wrong on a UTC runner. Neither of them depends on the runner's own zone to
 * assert the right result, which is the property that was missing.
 */
describe('isTaskOverdue with no explicit today', () => {
  const at = (instant: string) => jest.useFakeTimers().setSystemTime(new Date(instant));
  afterEach(() => jest.useRealTimers());

  // 02:00 in California. Berlin and Tokyo have both been on the 4th for
  // hours, but their local midnight converts back to the 3rd in UTC, which
  // is the answer the old idiom gave them.
  describe('while California is early on the 4th', () => {
    beforeEach(() => at('2026-09-04T09:00:00Z'));

    it('does not count a task due today', () => {
      expect(isTaskOverdue(base({ scheduledDate: '2026-09-04' }))).toBe(false);
    });

    it('counts a task due yesterday', () => {
      expect(isTaskOverdue(base({ scheduledDate: '2026-09-03' }))).toBe(true);
    });
  });

  // 19:00 in California, where UTC has already turned over to the 5th.
  describe('after UTC has rolled over but California has not', () => {
    beforeEach(() => at('2026-09-05T02:00:00Z'));

    it('still treats the 4th as the studio\'s today', () => {
      expect(isTaskOverdue(base({ scheduledDate: '2026-09-04' }))).toBe(false);
      expect(isTaskOverdue(base({ scheduledDate: '2026-09-03' }))).toBe(true);
    });

    it('does not count the 5th, which only UTC has reached', () => {
      expect(isTaskOverdue(base({ scheduledDate: '2026-09-05' }))).toBe(false);
    });
  });
});
