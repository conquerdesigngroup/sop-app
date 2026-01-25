import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook that triggers a callback when the browser tab becomes visible again.
 * Useful for refreshing data when users switch back to the app.
 *
 * @param onVisible - Callback to run when tab becomes visible
 * @param minInterval - Minimum time (ms) between refreshes to prevent excessive calls (default: 5000ms)
 */
export const useVisibilityRefresh = (
  onVisible: () => void,
  minInterval: number = 5000
) => {
  const lastRefreshRef = useRef<number>(Date.now());

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      // Only refresh if enough time has passed since last refresh
      if (now - lastRefreshRef.current >= minInterval) {
        lastRefreshRef.current = now;
        onVisible();
      }
    }
  }, [onVisible, minInterval]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also handle window focus for cases where visibility doesn't change
    // but the window regains focus (e.g., switching between browser windows)
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current >= minInterval) {
        lastRefreshRef.current = now;
        onVisible();
      }
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [handleVisibilityChange, onVisible, minInterval]);
};

export default useVisibilityRefresh;
