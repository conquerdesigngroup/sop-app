import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the person has asked their OS to cut down on motion.
 *
 * index.css already shortens every CSS animation and transition under this
 * media query, but that is not enough on its own for the menu rows: they are
 * given `opacity: 0` inline and rely on the entrance animation to fade them
 * in, so a component that wants to honour the preference has to know about
 * it and skip that setup entirely. That is what this is for.
 */
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(QUERY).matches
      : false
  );

  useEffect(() => {
    // jsdom has no matchMedia; a test then simply gets full motion.
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
};
