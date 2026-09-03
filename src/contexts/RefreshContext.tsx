import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useVisibilityRefresh } from '../hooks/useVisibilityRefresh';

/**
 * One refresh for the whole app.
 *
 * WHY THIS EXISTS
 *
 * "Things sync fast, but every now and then I have to kill the app to see a
 * change." That was true, and for a concrete reason: freshness was handled
 * per data source, and the sources disagreed about how.
 *
 *   - Tasks, SOPs and the staff list had a realtime channel AND refetched when
 *     the tab came back into view.
 *   - The calendar and work hours had the channel but never refetched on
 *     resume — and a realtime socket that was asleep with the phone does not
 *     replay what it missed, so an event edited while the app was in the
 *     background stayed stale until the next full load.
 *   - The parent portal had neither. Its own comments said "pull-to-refresh
 *     and reopening the app are the refresh mechanism", but nothing in the
 *     portal implemented pull-to-refresh, and reopening only helped if iOS had
 *     actually evicted the page. Usually it had not.
 *
 * So this is a registry. Anything that fetches data registers a loader with
 * `useRefreshable`, and `refresh()` runs every registered loader at once. Three
 * things call it:
 *
 *   1. The refresh button in the header (staff nav and the portal shell).
 *   2. Pull-to-refresh on a phone (PullToRefreshLayer).
 *   3. The app coming back to the foreground, or the network coming back —
 *      handled here, so no context has to remember to do it itself.
 *
 * A loader is expected to be SILENT: replace its data when the fetch resolves
 * and never flip a `loading` flag on the way, because the person is looking at
 * the page they just asked to refresh and a spinner replacing it reads as
 * "something broke", not "checking". The indicator is the header button and
 * the pull pill, nothing else.
 *
 * If you add a fetch anywhere in the app — a context, a page, a hook — register
 * it. A source that is not registered is a source the refresh button lies
 * about.
 */

export type RefreshReason = 'manual' | 'pull' | 'resume' | 'online';

export interface RefreshResult {
  /** Every loader resolved. */
  ok: boolean;
  /** How many loaders rejected. */
  failed: number;
  /** How many loaders ran. */
  total: number;
}

type Loader = () => Promise<unknown> | unknown;

interface RegistryValue {
  register: (loader: Loader) => () => void;
}

interface StateValue {
  /** A refresh is in flight, whoever started it. */
  refreshing: boolean;
  /** Why the in-flight refresh started; null when idle. */
  reason: RefreshReason | null;
  lastRefreshedAt: number | null;
  /**
   * How many loaders are registered right now. Zero means the screen has
   * nothing to refresh — the front door, the login — and the controls hide.
   */
  count: number;
  refresh: (reason?: RefreshReason) => Promise<RefreshResult>;
}

// Two contexts, on purpose. Registration is stable for the life of a provider
// and never changes; state changes on every refresh. A hook that only needs to
// register must not re-render everything that uses it each time someone pulls.
const RegistryContext = createContext<RegistryValue | null>(null);
const StateContext = createContext<StateValue | null>(null);

/**
 * A manual refresh that finishes instantly does not read as having done
 * anything, so the spinner is held for at least this long. A resume refresh is
 * not something the person asked for, so it is not padded.
 */
const MIN_VISIBLE_MS = 500;

/**
 * Coming back to the app within this window of the last refresh does nothing.
 * Matches what TaskContext, SOPContext and AuthContext each used on their own
 * before the visibility refetch moved here.
 */
const RESUME_MIN_INTERVAL_MS = 3000;

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export const RefreshProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const loadersRef = useRef(new Set<Loader>());
  const inFlightRef = useRef<Promise<RefreshResult> | null>(null);

  const [count, setCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [reason, setReason] = useState<RefreshReason | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  const register = useCallback((loader: Loader) => {
    loadersRef.current.add(loader);
    setCount(loadersRef.current.size);
    return () => {
      loadersRef.current.delete(loader);
      setCount(loadersRef.current.size);
    };
  }, []);

  const refresh = useCallback((why: RefreshReason = 'manual'): Promise<RefreshResult> => {
    // A pull while a resume refresh is already running joins it rather than
    // starting a second round of the same requests.
    if (inFlightRef.current) return inFlightRef.current;

    const loaders = Array.from(loadersRef.current);
    const startedAt = Date.now();
    setRefreshing(true);
    setReason(why);

    const run = (async (): Promise<RefreshResult> => {
      const settled = await Promise.allSettled(
        // Wrapped so a loader that throws synchronously counts as a failure
        // instead of taking the whole refresh down with it.
        loaders.map(loader => Promise.resolve().then(() => loader()))
      );
      const failed = settled.filter(s => s.status === 'rejected').length;
      settled.forEach(s => {
        if (s.status === 'rejected') console.error('[Refresh] a loader failed:', s.reason);
      });

      if (why === 'manual' || why === 'pull') {
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_VISIBLE_MS) await wait(MIN_VISIBLE_MS - elapsed);
      }

      return { ok: failed === 0, failed, total: loaders.length };
    })();

    inFlightRef.current = run;
    run.finally(() => {
      inFlightRef.current = null;
      setRefreshing(false);
      setReason(null);
      setLastRefreshedAt(Date.now());
    });
    return run;
  }, []);

  // Back to the foreground: a phone that was locked, an app switched away
  // from, a tab left for another. Realtime channels reconnect on their own
  // but do not replay what they missed while the socket was down, so this is
  // the only thing that closes that gap.
  const onVisible = useCallback(() => {
    if (loadersRef.current.size === 0) return;
    void refresh('resume');
  }, [refresh]);
  useVisibilityRefresh(onVisible, RESUME_MIN_INTERVAL_MS);

  // Back online: whatever failed or was skipped while offline is stale now.
  useEffect(() => {
    const onOnline = () => {
      if (loadersRef.current.size === 0) return;
      void refresh('online');
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refresh]);

  const registry = useMemo<RegistryValue>(() => ({ register }), [register]);
  const state = useMemo<StateValue>(
    () => ({ refreshing, reason, lastRefreshedAt, count, refresh }),
    [refreshing, reason, lastRefreshedAt, count, refresh]
  );

  return (
    <RegistryContext.Provider value={registry}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </RegistryContext.Provider>
  );
};

/** Refresh state and the trigger. For the header button and the pull layer. */
export const useRefresh = (): StateValue => {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error('useRefresh must be used within a RefreshProvider');
  return ctx;
};

/**
 * Register a loader for as long as the caller is mounted and `enabled`.
 *
 * The loader is read through a ref at call time, so the latest closure runs
 * even though the registration itself never changes — a page whose fetch
 * depends on a filter does not re-register on every keystroke.
 *
 * Tolerates the absence of a provider on purpose: hooks like useAdminList are
 * unit-tested on their own, and a test should not have to stand up the
 * refresh plumbing to check a list loads.
 */
export const useRefreshable = (loader: Loader | null | undefined, enabled: boolean = true): void => {
  const registry = useContext(RegistryContext);
  const loaderRef = useRef<Loader | null | undefined>(loader);
  loaderRef.current = loader;

  const active = enabled && !!loader;

  useEffect(() => {
    if (!registry || !active) return;
    return registry.register(() => loaderRef.current?.());
  }, [registry, active]);
};
