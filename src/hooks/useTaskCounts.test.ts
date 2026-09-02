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
