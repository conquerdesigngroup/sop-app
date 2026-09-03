import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from '../theme';
import { useRefresh } from '../contexts/RefreshContext';
import { useToast } from '../contexts/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { RefreshIcon, CheckIcon } from './ui';

/**
 * The refresh control that sits in both headers — staff Navigation and the
 * parent PortalLayout.
 *
 * Deliberately quiet. It is one icon, ghost-styled, the same size as the
 * buttons beside it, and it says what happened in place rather than with a
 * toast: the arrows spin for as long as the refresh runs, then a check holds
 * for a second, then the arrows are back. It also spins when the app refreshes
 * ITSELF on returning to the foreground, so a person coming back to a page sees
 * that it is catching up rather than wondering whether it is.
 *
 * The one thing that does get a toast is failure, because a check that never
 * comes is not a message anyone reads.
 *
 * Renders nothing when there is nothing registered to refresh (the front door,
 * the login) — a button that always says "done" on a page with no data is a
 * button people stop trusting.
 */

interface RefreshButtonProps {
  /** Square size in px. Both headers use 36; the desktop staff bar 40. */
  size?: number;
  style?: React.CSSProperties;
}

const DONE_HOLD_MS = 1100;

const RefreshButton: React.FC<RefreshButtonProps> = ({ size = 36, style }) => {
  const { refreshing, refresh, count } = useRefresh();
  const { error: toastError } = useToast();
  const reducedMotion = useReducedMotion();
  const [done, setDone] = useState(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (doneTimer.current) clearTimeout(doneTimer.current);
  }, []);

  const handleClick = useCallback(async () => {
    if (refreshing) return;
    const result = await refresh('manual');
    if (result.ok) {
      setDone(true);
      if (doneTimer.current) clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => setDone(false), DONE_HOLD_MS);
    } else {
      toastError("Couldn't refresh. Check your connection and try again.");
    }
  }, [refresh, refreshing, toastError]);

  if (count === 0) return null;

  const iconSize = Math.round(size * 0.5);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={refreshing ? 'Refreshing' : done ? 'Up to date' : 'Refresh'}
      title="Refresh"
      aria-busy={refreshing || undefined}
      disabled={refreshing}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
        padding: 0,
        background: 'none',
        border: 'none',
        borderRadius: theme.borderRadius.md,
        color: done ? theme.colors.status.success : theme.colors.txt.secondary,
        // Not the 0.6 a disabled button normally gets: while spinning it is
        // busy, not unavailable, and dimming it makes the spin harder to see.
        cursor: refreshing ? 'default' : 'pointer',
        transition: 'color 0.2s ease',
        ...style,
      }}
    >
      {done ? (
        <span
          style={{
            display: 'flex',
            animation: reducedMotion ? 'none' : 'refresh-done-pop 0.25s ease-out',
          }}
        >
          <CheckIcon size={iconSize} />
        </span>
      ) : (
        <span
          style={{
            display: 'flex',
            // The `spin` keyframes live in App.css. Under reduced motion the
            // global rule collapses every animation to nothing, so the busy
            // state falls back to a dimmed icon there.
            animation: refreshing && !reducedMotion ? 'spin 0.9s linear infinite' : 'none',
            opacity: refreshing && reducedMotion ? 0.45 : 1,
            transition: 'opacity 0.2s ease',
          }}
        >
          <RefreshIcon size={iconSize} />
        </span>
      )}
      <span aria-live="polite" style={srOnly}>{done ? 'Up to date' : ''}</span>
    </button>
  );
};

const srOnly: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export default RefreshButton;
