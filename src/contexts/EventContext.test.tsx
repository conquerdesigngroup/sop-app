import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { EventProvider, useEvent } from './EventContext';

/**
 * Who the staff calendar fetches for.
 *
 * DataProvider sits above the Router, so EventProvider mounts on EVERY route —
 * including the parent portal, where the visitor is anonymous and has no
 * business reading calendar_events. It used to fetch unconditionally, so every
 * parent's phone asked and was told "permission denied for table
 * calendar_events" on every page.
 *
 * Both directions are pinned here because both are failure modes. Fetching
 * signed out is the bug being fixed; NOT fetching signed in would be a silently
 * empty calendar for staff, which is worse and much harder to notice. The
 * signed-in half is the reason this file exists at all — that path cannot be
 * checked in a browser without an account.
 */

const mockOrder = jest.fn();
const mockAuth = { isAuthenticated: false, loading: false };

jest.mock('./AuthContext', () => ({
  useAuth: () => mockAuth,
}));

jest.mock('../lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    from: () => ({
      select: () => ({ order: (...a: unknown[]) => mockOrder(...a) }),
    }),
  },
}));

const Probe: React.FC = () => {
  const { loading, events } = useEvent();
  return <div data-testid="probe">{loading ? 'loading' : `ready:${events.length}`}</div>;
};

const renderProvider = () =>
  render(<EventProvider><Probe /></EventProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.isAuthenticated = false;
  mockAuth.loading = false;
  mockOrder.mockResolvedValue({ data: [], error: null });
});

describe('signed out', () => {
  it('does not touch the staff calendar at all', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready'));
    expect(mockOrder).not.toHaveBeenCalled();
  });

  it('stops loading rather than spinning forever on a fetch that is not coming', async () => {
    renderProvider();
    // Without setLoading(false) on this path the portal would hold a spinner
    // for a request it deliberately never makes.
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready:0'));
  });
});

describe('while auth is still settling', () => {
  it('waits instead of guessing', async () => {
    mockAuth.loading = true;
    renderProvider();

    // Not "signed out" yet — just unknown. Fetching now would race the session
    // check; giving up now would leave a signed-in user with nothing.
    expect(screen.getByTestId('probe')).toHaveTextContent('loading');
    expect(mockOrder).not.toHaveBeenCalled();
  });
});

describe('signed in', () => {
  it('LOADS — the guard must not lock staff out of their own calendar', async () => {
    mockAuth.isAuthenticated = true;
    renderProvider();

    await waitFor(() => expect(mockOrder).toHaveBeenCalled());
    // events and sources, both in flight together.
    expect(mockOrder).toHaveBeenCalledTimes(2);
  });

  it('loads once auth resolves, not only if it was ready at mount', async () => {
    mockAuth.loading = true;
    const { rerender } = renderProvider();
    expect(mockOrder).not.toHaveBeenCalled();

    // The session check finishes a moment after mount, which is the normal
    // case. The effect has to re-run on that, or a real user gets nothing.
    mockAuth.loading = false;
    mockAuth.isAuthenticated = true;
    rerender(<EventProvider><Probe /></EventProvider>);

    await waitFor(() => expect(mockOrder).toHaveBeenCalledTimes(2));
  });
});
