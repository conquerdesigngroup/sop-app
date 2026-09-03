import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { RefreshProvider, useRefresh, useRefreshable } from './RefreshContext';

/**
 * The refresh registry is the one thing every "why is this stale" report now
 * routes through, so its contract is pinned here:
 *
 *   - refresh() runs EVERY registered loader, and reports how many failed.
 *   - one loader failing does not stop the others.
 *   - a second refresh while one is in flight joins it instead of doubling
 *     every request.
 *   - unmounting a registrant removes its loader.
 *   - coming back to the foreground refreshes on its own.
 *   - a hook with no provider above it is a no-op, not a crash.
 */

const Registrant: React.FC<{ loader: () => Promise<unknown> | unknown; enabled?: boolean }> = ({
  loader,
  enabled = true,
}) => {
  useRefreshable(loader, enabled);
  return null;
};

let latest: ReturnType<typeof useRefresh> | null = null;
const Probe: React.FC = () => {
  const value = useRefresh();
  latest = value;
  return (
    <div data-testid="probe">
      {value.refreshing ? 'refreshing' : 'idle'}:{value.count}
    </div>
  );
};

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  latest = null;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('refresh runs every registered loader and reports success', async () => {
  const a = jest.fn().mockResolvedValue(undefined);
  const b = jest.fn().mockResolvedValue(undefined);
  render(
    <RefreshProvider>
      <Registrant loader={a} />
      <Registrant loader={b} />
      <Probe />
    </RefreshProvider>
  );
  expect(screen.getByTestId('probe')).toHaveTextContent('idle:2');

  let result: { ok: boolean; failed: number; total: number } | undefined;
  await act(async () => {
    result = await latest!.refresh('resume');
  });

  expect(a).toHaveBeenCalledTimes(1);
  expect(b).toHaveBeenCalledTimes(1);
  expect(result).toEqual({ ok: true, failed: 0, total: 2 });
  expect(screen.getByTestId('probe')).toHaveTextContent('idle:2');
});

test('one loader failing does not stop the others, and is counted', async () => {
  const good = jest.fn().mockResolvedValue(undefined);
  const bad = jest.fn().mockRejectedValue(new Error('offline'));
  const throws = jest.fn(() => { throw new Error('sync'); });
  render(
    <RefreshProvider>
      <Registrant loader={bad} />
      <Registrant loader={good} />
      <Registrant loader={throws} />
      <Probe />
    </RefreshProvider>
  );

  let result: { ok: boolean; failed: number; total: number } | undefined;
  await act(async () => {
    result = await latest!.refresh('resume');
  });

  expect(good).toHaveBeenCalledTimes(1);
  expect(result).toEqual({ ok: false, failed: 2, total: 3 });
});

test('a refresh started while one is running joins it', async () => {
  const gate = deferred<void>();
  const loader = jest.fn(() => gate.promise);
  render(
    <RefreshProvider>
      <Registrant loader={loader} />
      <Probe />
    </RefreshProvider>
  );

  let first: Promise<unknown> | undefined;
  let second: Promise<unknown> | undefined;
  // Loaders start on a microtask (so a synchronous throw is caught), hence
  // the async act: it lets that tick run before the assertions.
  await act(async () => {
    first = latest!.refresh('resume');
    second = latest!.refresh('pull');
  });
  expect(first).toBe(second);
  expect(loader).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('probe')).toHaveTextContent('refreshing:1');

  await act(async () => {
    gate.resolve();
    await first;
  });
  expect(screen.getByTestId('probe')).toHaveTextContent('idle:1');
});

test('a manual refresh holds the busy state long enough to be seen', async () => {
  jest.useFakeTimers();
  try {
    const loader = jest.fn().mockResolvedValue(undefined);
    render(
      <RefreshProvider>
        <Registrant loader={loader} />
        <Probe />
      </RefreshProvider>
    );

    let done = false;
    act(() => {
      void latest!.refresh('manual').then(() => { done = true; });
    });
    // The loader has resolved, but the spinner is still up.
    await act(async () => { await Promise.resolve(); });
    expect(done).toBe(false);
    expect(screen.getByTestId('probe')).toHaveTextContent('refreshing:1');

    await act(async () => { jest.advanceTimersByTime(600); });
    expect(done).toBe(true);
    expect(screen.getByTestId('probe')).toHaveTextContent('idle:1');
  } finally {
    jest.useRealTimers();
  }
});

test('unmounting or disabling a registrant removes its loader', async () => {
  const loader = jest.fn().mockResolvedValue(undefined);
  const { rerender } = render(
    <RefreshProvider>
      <Registrant loader={loader} enabled />
      <Probe />
    </RefreshProvider>
  );
  expect(screen.getByTestId('probe')).toHaveTextContent('idle:1');

  rerender(
    <RefreshProvider>
      <Registrant loader={loader} enabled={false} />
      <Probe />
    </RefreshProvider>
  );
  expect(screen.getByTestId('probe')).toHaveTextContent('idle:0');

  await act(async () => { await latest!.refresh('resume'); });
  expect(loader).not.toHaveBeenCalled();
});

test('the latest loader runs, even though the registration never changes', async () => {
  const first = jest.fn().mockResolvedValue(undefined);
  const second = jest.fn().mockResolvedValue(undefined);
  const { rerender } = render(
    <RefreshProvider>
      <Registrant loader={first} />
      <Probe />
    </RefreshProvider>
  );
  rerender(
    <RefreshProvider>
      <Registrant loader={second} />
      <Probe />
    </RefreshProvider>
  );

  await act(async () => { await latest!.refresh('resume'); });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

test('coming back to the foreground refreshes on its own', async () => {
  const loader = jest.fn().mockResolvedValue(undefined);
  render(
    <RefreshProvider>
      <Registrant loader={loader} />
      <Probe />
    </RefreshProvider>
  );
  expect(loader).not.toHaveBeenCalled();

  // useVisibilityRefresh throttles to one refresh per interval, measured
  // from mount, so the clock has to move before the event counts.
  const realNow = Date.now;
  Date.now = () => realNow() + 10_000;
  try {
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
  } finally {
    Date.now = realNow;
  }

  await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
});

test('useRefreshable without a provider is a no-op', () => {
  const loader = jest.fn();
  expect(() => render(<Registrant loader={loader} />)).not.toThrow();
});
