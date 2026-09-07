import { useCallback, useEffect, useState } from 'react';
import { AttendanceSource, HouseholdSummary, loadHouseholdSummary } from '../../lib/attendanceQueries';

/**
 * The household read, shared by every card that needs it.
 *
 * WHY A CACHE AND NOT A CONTEXT
 *
 * Several cards want the same answer — who the children are, what they are
 * enrolled in, what is on next. A provider around the page would be the
 * conventional fix, but it would put household knowledge back into the page and
 * undo the point of the registry: a card must be addable without editing the
 * page. So each card asks for itself, and a promise cache keyed by source makes
 * those asks one request.
 *
 * The cache is intentionally tiny and never invalidated on a timer. This data
 * changes when the studio runs an import — days apart, not seconds — so the
 * only things that move it are `reset()` for the demo switcher, and a refresh
 * the parent asked for.
 *
 * REFRESH HAS TO REACH CARDS THAT ARE ALREADY MOUNTED
 *
 * That is what the subscriber set below is for, and it is new with the
 * dashboard. Evicting the cache is enough for the NEXT mount and does nothing
 * for the six cards currently on screen — they resolved their promise long ago
 * and will never look again. So a parent pulling to refresh the dashboard got
 * fresh programs and a stale "up next", which is precisely the lie the refresh
 * button is not allowed to tell (see RefreshContext).
 *
 * `revalidateHousehold` refetches once per source however many cards ask, and
 * pushes the result into all of them WITHOUT flipping `loading` — the person is
 * looking at the page they just asked to refresh, and a row of spinners
 * replacing it reads as broken rather than as checking.
 */

const cache = new Map<string, Promise<HouseholdSummary>>();

/** Mounted hooks per key, so a refetch can hand them the new data. */
const subscribers = new Map<string, Set<(next: HouseholdSummary) => void>>();

/** One refetch per key at a time, so six cards do not make six requests. */
const inFlight = new Map<string, Promise<HouseholdSummary>>();

const keyOf = (source: AttendanceSource): string =>
  source.source === 'fixture' ? `fixture:${source.scenario}` : 'live';

export const resetHouseholdCache = (): void => {
  cache.clear();
  inFlight.clear();
};

/**
 * Refetch the household and push it to every card showing it.
 *
 * Resolves with the summary so a caller can inspect `error` — the loaders
 * registered with `useRefreshable` are required to throw on failure, and
 * `loadHouseholdSummary` reports failure in the result rather than by
 * rejecting. See PortalHome.
 */
export const revalidateHousehold = (source: AttendanceSource): Promise<HouseholdSummary> => {
  const key = keyOf(source);

  const already = inFlight.get(key);
  if (already) return already;

  const pending = loadHouseholdSummary(source).then(result => {
    inFlight.delete(key);
    // Never cache a failure: the next mount, or Try again, must ask afresh.
    if (result.error) cache.delete(key);
    subscribers.get(key)?.forEach(notify => notify(result));
    return result;
  });

  inFlight.set(key, pending);
  cache.set(key, pending);
  return pending;
};

export const useHousehold = (
  source: AttendanceSource,
  /**
   * Off for a page that has no household cards on it. The account page is the
   * one that does this: three sequential queries for data nothing on it renders
   * is three queries a parent waits through for nothing.
   */
  enabled: boolean = true,
): {
  data: HouseholdSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} => {
  const key = keyOf(source);
  const [data, setData] = useState<HouseholdSummary | null>(null);
  // Not loading when switched off — there is nothing in flight to wait for, and
  // a card that reads this to decide between a skeleton and an empty state
  // would otherwise skeleton forever.
  const [loading, setLoading] = useState(enabled);
  // Bumping this evicts the cached promise and re-runs the effect. A failed
  // load must be retryable — a cache that holds a rejection forever would mean
  // one dropped request breaks the page until a full reload.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    let pending = cache.get(key);
    if (!pending) {
      pending = loadHouseholdSummary(source);
      cache.set(key, pending);
    }

    pending.then(result => {
      if (cancelled) return;
      // Never cache a failure: the next mount, or Try again, must ask afresh.
      if (result.error) cache.delete(key);
      setData(result);
      setLoading(false);
    });

    // A refetch started elsewhere — the refresh button, the pull gesture —
    // lands here. Silent by design: data only, `loading` untouched.
    const listener = (next: HouseholdSummary) => {
      if (!cancelled) setData(next);
    };
    const set = subscribers.get(key) ?? new Set();
    set.add(listener);
    subscribers.set(key, set);

    return () => {
      cancelled = true;
      set.delete(listener);
      if (!set.size) subscribers.delete(key);
    };
    // `source` is rebuilt by the parent each render; `key` is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, enabled]);

  const reload = useCallback(() => {
    cache.delete(key);
    inFlight.delete(key);
    setAttempt(n => n + 1);
  }, [key]);

  return { data, loading, error: data?.error ?? null, reload };
};
