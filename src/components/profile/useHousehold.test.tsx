import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { AttendanceSource, HouseholdSummary } from '../../lib/attendanceQueries';
import { resetHouseholdCache, revalidateHousehold, useHousehold } from './useHousehold';

/**
 * The household read is shared by every card on the dashboard, which makes two
 * of its properties load-bearing rather than incidental.
 *
 *   - SIX CARDS, ONE REQUEST. The cache is what lets the dashboard exist at
 *     all; without it, moving the family cards onto the portal home would have
 *     turned three queries into eighteen.
 *
 *   - A REFRESH HAS TO REACH CARDS THAT ARE ALREADY MOUNTED. Evicting the cache
 *     is enough for the next mount and does nothing for what is on screen —
 *     which was the bug this mechanism exists to prevent: a parent pulling to
 *     refresh the dashboard, getting fresh programs and a stale "up next", and
 *     the refresh button reporting success. See CLAUDE.md, DATA REFRESH.
 *
 * And it must arrive SILENTLY. A registered loader may never flip a loading
 * flag on the way, because the person is looking at the page they just asked to
 * refresh and a row of skeletons reads as broken, not as checking.
 */

const summary = (name: string, error: string | null = null): HouseholdSummary => ({
  students: [{
    id: `s-${name}`,
    householdId: 'hh',
    externalStudentId: null,
    firstName: name,
    lastName: 'Alvarez',
    displayName: null,
    status: 'active',
  }],
  memberType: 'guardian',
  perStudent: [],
  upcoming: [],
  series: [],
  cancelledByClass: {},
  enrolledClassIds: [],
  error,
});

/**
 * `mock`-prefixed because jest hoists the factory above every other statement
 * in the file, and only that prefix is allowed to reach out of its scope.
 *
 * The module is replaced rather than spied on: `loadHouseholdSummary` is the
 * one thing useHousehold imports at runtime — the rest are types, erased — and
 * requiring the real module would drag in the Supabase client for no reason.
 */
let mockLoad: jest.Mock;

jest.mock('../../lib/attendanceQueries', () => ({
  loadHouseholdSummary: (...args: unknown[]) => mockLoad(...args),
}));

const LIVE: AttendanceSource = { source: 'live' };

/** Stands in for a card: reads the hook, prints what it would render. */
const Card: React.FC<{ id: string; enabled?: boolean }> = ({ id, enabled }) => {
  const { data, loading } = useHousehold(LIVE, enabled);
  return (
    <div data-testid={id}>
      {loading ? 'loading' : data?.students[0]?.firstName ?? 'none'}
    </div>
  );
};

beforeEach(() => {
  resetHouseholdCache();
  mockLoad = jest.fn().mockResolvedValue(summary('Maya'));
});

test('six cards on one page make one request', async () => {
  render(
    <>
      {['a', 'b', 'c', 'd', 'e', 'f'].map(id => <Card key={id} id={id} />)}
    </>,
  );

  await waitFor(() => expect(screen.getByTestId('f')).toHaveTextContent('Maya'));
  expect(mockLoad).toHaveBeenCalledTimes(1);
});

test('a refresh reaches cards that are already mounted', async () => {
  render(<><Card id="a" /><Card id="b" /></>);
  await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('Maya'));

  // The studio ran an import between the two.
  mockLoad.mockResolvedValue(summary('Eli'));
  await act(async () => { await revalidateHousehold(LIVE); });

  await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('Eli'));
  expect(screen.getByTestId('b')).toHaveTextContent('Eli');
});

test('a refresh never shows a card a loading state', async () => {
  const seen: string[] = [];
  const Watcher: React.FC = () => {
    const { data, loading } = useHousehold(LIVE);
    seen.push(loading ? 'loading' : data?.students[0]?.firstName ?? 'none');
    return null;
  };

  render(<Watcher />);
  await waitFor(() => expect(seen).toContain('Maya'));
  const afterFirstLoad = seen.length;

  mockLoad.mockResolvedValue(summary('Eli'));
  await act(async () => { await revalidateHousehold(LIVE); });
  await waitFor(() => expect(seen).toContain('Eli'));

  // Everything rendered after the first load is data, never a skeleton.
  expect(seen.slice(afterFirstLoad)).not.toContain('loading');
});

test('two cards asking to refresh at once still make one request', async () => {
  render(<><Card id="a" /><Card id="b" /></>);
  await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('Maya'));
  mockLoad.mockClear();

  await act(async () => {
    await Promise.all([revalidateHousehold(LIVE), revalidateHousehold(LIVE)]);
  });
  expect(mockLoad).toHaveBeenCalledTimes(1);
});

test('a failed refresh is reported and not cached', async () => {
  render(<Card id="a" />);
  await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('Maya'));

  mockLoad.mockResolvedValue(summary('Eli', 'We could not load this.'));
  let failed!: HouseholdSummary;
  await act(async () => { failed = await revalidateHousehold(LIVE); });
  // PortalHome turns this into a throw, so the refresh button can say so.
  expect(failed.error).toBe('We could not load this.');

  // Not cached: the next mount asks afresh rather than inheriting the failure.
  mockLoad.mockClear().mockResolvedValue(summary('Maya'));
  render(<Card id="b" />);
  await waitFor(() => expect(screen.getByTestId('b')).toHaveTextContent('Maya'));
  expect(mockLoad).toHaveBeenCalledTimes(1);
});

test('a page with no household cards makes no request at all', async () => {
  render(<Card id="a" enabled={false} />);
  await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('none'));
  expect(mockLoad).not.toHaveBeenCalled();
});
