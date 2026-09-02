import { useEffect, useState } from 'react';
import { AttendanceSource, HouseholdSummary, loadHouseholdSummary } from '../../lib/attendanceQueries';

/**
 * The household read, shared by every card that needs it.
 *
 * WHY A CACHE AND NOT A CONTEXT
 *
 * Four cards want the same answer — who the children are, what they are
 * enrolled in, what is on next. A provider around the page would be the
 * conventional fix, but it would put household knowledge back into Profile.tsx
 * and undo the point of the registry: a card must be addable without editing
 * the page. So each card asks for itself, and a promise cache keyed by source
 * makes the four asks one request.
 *
 * The cache is intentionally tiny and never invalidated on a timer. This data
 * changes when the studio runs an import — days apart, not seconds — and a
 * parent who wants it fresh reloads. `reset()` exists for the demo switcher,
 * which is the one thing that changes it mid-session.
 */

const cache = new Map<string, Promise<HouseholdSummary>>();

const keyOf = (source: AttendanceSource): string =>
  source.source === 'fixture' ? `fixture:${source.scenario}` : 'live';

export const resetHouseholdCache = (): void => {
  cache.clear();
};

export const useHousehold = (source: AttendanceSource): {
  data: HouseholdSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} => {
  const key = keyOf(source);
  const [data, setData] = useState<HouseholdSummary | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumping this evicts the cached promise and re-runs the effect. A failed
  // load must be retryable — a cache that holds a rejection forever would mean
  // one dropped request breaks the page until a full reload.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
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

    return () => { cancelled = true; };
    // `source` is rebuilt by the parent each render; `key` is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reload = () => {
    cache.delete(key);
    setAttempt(n => n + 1);
  };

  return { data, loading, error: data?.error ?? null, reload };
};
