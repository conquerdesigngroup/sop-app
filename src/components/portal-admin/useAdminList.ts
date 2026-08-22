import { useCallback, useEffect, useState } from 'react';

/**
 * One-shot fetch with an explicit reload, for each manager section.
 *
 * Deliberately not realtime. Portal content is edited by one or two people at a
 * time and read by parents on a pull-to-refresh; holding a socket open per
 * section would cost more than it tells anyone. Every mutation calls reload(),
 * so the list a staff member is looking at is the list they just changed.
 */
export function useAdminList<T>(
  programId: string | undefined,
  run: (programId: string) => Promise<T>,
  fallback: T
): { data: T; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    if (!programId) return;

    let cancelled = false;
    setLoading(true);

    run(programId)
      .then(result => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch(e => {
        if (cancelled) return;
        console.error('Portal manager query failed:', e);
        setError('Could not load this. Check your connection and try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      // Stops a slow response for the previous program overwriting the list
      // after someone has switched tabs.
      cancelled = true;
    };
    // `run` comes from PortalAdminContext and is useCallback-stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, nonce]);

  return { data, loading, error, reload };
}
