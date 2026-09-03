import { useEffect, useState } from 'react';

/**
 * Whether a CSS media query currently matches, kept live.
 *
 * useResponsive answers "which breakpoint" — mobile, tablet, desktop — and
 * that is the right question almost everywhere. This is for the rare layout
 * that has to switch INSIDE a breakpoint: every phone is `mobile`, but a
 * 320px SE and a 430px Pro Max are not the same header.
 *
 * jsdom has no matchMedia; a test then gets `fallback`.
 */
export const useMediaQuery = (query: string, fallback: boolean = false): boolean => {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [matches, setMatches] = useState<boolean>(() =>
    supported ? window.matchMedia(query).matches : fallback
  );

  useEffect(() => {
    if (!supported) return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query, supported]);

  return matches;
};
