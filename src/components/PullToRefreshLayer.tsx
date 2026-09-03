import React, { useEffect, useRef, useState } from 'react';
import { theme } from '../theme';
import { useRefresh } from '../contexts/RefreshContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { RefreshIcon, CheckIcon, Spinner } from './ui';

/**
 * Pull down from the top of any page on a touch screen to refresh it.
 *
 * Mounted once, in App.tsx, for both halves of the app. It listens on the
 * document rather than wrapping a page, because the page scroller in this app
 * is the window: PortalLayout and the staff pages both let the document
 * scroll. The earlier PullToRefresh component wrapped a page in its own
 * overflow:auto box and only ever made it onto /my-tasks — every other screen,
 * and the whole parent portal, had no pull at all.
 *
 * WHAT IT DRAWS
 *
 * Not a translated page. Translating the app root while pulling would move
 * every position:fixed descendant with it — the bottom nav, the toasts, an
 * open modal — for the length of the gesture. Instead a small pill slides out
 * from under the header as the finger comes down, flips its arrow at the
 * threshold, spins while the refresh runs, shows a check for a beat, and slides
 * back up. It sits BELOW the header in z-order so it reads as coming out from
 * behind it; both headers are opaque and at least 60px tall below the safe
 * area, which is what hides it while idle.
 *
 * WHEN IT DOES NOT START
 *
 *   - The page is scrolled at all. Only a pull from the very top counts.
 *   - The finger is inside something that scrolls on its own (a modal body, a
 *     table with overflow) or inside a dialog. Those own their gesture.
 *   - The gesture goes sideways first. The task list swipes rows to complete
 *     them, and a swipe that also refreshed the page would be maddening.
 *   - There is nothing registered to refresh (front door, login).
 *
 * touchmove is registered non-passive so the pull can preventDefault once it
 * has committed, which is what stops iOS rubber-banding the page underneath.
 * It only prevents once committed — a scroll that starts sideways or from
 * mid-page is never interfered with.
 */

type Phase = 'idle' | 'pulling' | 'refreshing' | 'done';

/** Damped pull distance, in px, that arms the refresh. */
const THRESHOLD = 72;
/** Damped pull distance the pill stops responding at. */
const MAX_PULL = 120;
/** Movement before the gesture commits to a direction. */
const SLOP = 10;
/** Where the pill rests while refreshing: px below the safe-area top. */
const REST_TOP = 68;
/** Where it hides: enough to be fully behind a 60px header. */
const HIDDEN_Y = -64;
const DONE_HOLD_MS = 900;

const scrollTop = () =>
  (document.scrollingElement ?? document.documentElement).scrollTop || window.scrollY || 0;

/**
 * True when a touch began inside something that should keep the gesture: an
 * element that scrolls vertically on its own, or any dialog.
 */
const ownsGesture = (start: EventTarget | null): boolean => {
  let node = start instanceof Element ? start : null;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.getAttribute('role') === 'dialog' || node.getAttribute('aria-modal') === 'true') return true;
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
};

const PullToRefreshLayer: React.FC = () => {
  const { refresh, count } = useRefresh();
  const reducedMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>('idle');
  const [pull, setPull] = useState(0);

  // Everything the touch handlers read lives in refs, so the listeners are
  // attached once and never see a stale render.
  const phaseRef = useRef<Phase>('idle');
  const pullRef = useRef(0);
  const countRef = useRef(count);
  const refreshRef = useRef(refresh);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const committed = useRef(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  countRef.current = count;
  refreshRef.current = refresh;

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const setPullBoth = (next: number) => {
    pullRef.current = next;
    setPull(next);
  };

  useEffect(() => {
    const reset = () => {
      origin.current = null;
      committed.current = false;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (phaseRef.current !== 'idle') return;
      if (countRef.current === 0) return;
      if (e.touches.length !== 1) return;
      if (scrollTop() > 0) return;
      if (ownsGesture(e.target)) return;
      origin.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      committed.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      const start = origin.current;
      if (!start) return;
      const touch = e.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;

      if (!committed.current) {
        // Sideways first: not ours. Upwards: a normal scroll.
        if (Math.abs(dx) > SLOP && Math.abs(dx) >= dy) { reset(); return; }
        if (dy < SLOP) return;
        // Re-check: a fast flick can scroll the page between start and here.
        if (scrollTop() > 0) { reset(); return; }
        committed.current = true;
        setPhaseBoth('pulling');
      }

      if (e.cancelable) e.preventDefault();
      // Damped so the pill does not race the finger, and capped so a long drag
      // does not park it halfway down the screen.
      const damped = Math.min(MAX_PULL, Math.max(0, (dy - SLOP) * 0.55));
      setPullBoth(damped);
    };

    const onTouchEnd = () => {
      if (!origin.current) return;
      const wasCommitted = committed.current;
      const distance = pullRef.current;
      reset();
      if (!wasCommitted) return;

      if (distance < THRESHOLD) {
        setPullBoth(0);
        setPhaseBoth('idle');
        return;
      }

      setPullBoth(THRESHOLD);
      setPhaseBoth('refreshing');
      void refreshRef.current('pull').finally(() => {
        setPhaseBoth('done');
        doneTimer.current = setTimeout(() => {
          setPullBoth(0);
          setPhaseBoth('idle');
        }, DONE_HOLD_MS);
      });
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, []);

  const progress = Math.min(1, pull / THRESHOLD);
  const armed = progress >= 1;

  // Slides from hidden to resting over the first THRESHOLD px, then creeps a
  // little further so an over-pull still feels attached to the finger.
  let offsetY: number;
  if (phase === 'idle') offsetY = HIDDEN_Y;
  else if (phase === 'pulling') offsetY = HIDDEN_Y * (1 - progress) + Math.max(0, pull - THRESHOLD) * 0.3;
  else offsetY = 0;

  const label =
    phase === 'refreshing' ? 'Refreshing…' :
    phase === 'done' ? 'Updated' :
    armed ? 'Release to refresh' :
    'Pull to refresh';

  const accent = phase === 'done'
    ? theme.colors.status.success
    : armed || phase === 'refreshing' ? theme.colors.primary : theme.colors.txt.tertiary;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={phase === 'idle' || undefined}
      style={{
        position: 'fixed',
        top: `calc(env(safe-area-inset-top) + ${REST_TOP}px)`,
        left: '50%',
        // Below the sticky headers (zIndex 100), so it emerges from behind them.
        zIndex: 90,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 14px 8px 10px',
        borderRadius: theme.borderRadius.full,
        backgroundColor: theme.colors.bg.secondary,
        border: `1px solid ${theme.colors.bdr.primary}`,
        boxShadow: theme.shadows.md,
        color: accent,
        fontFamily: theme.fonts.primary,
        fontSize: '13px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        opacity: phase === 'idle' ? 0 : 1,
        transform: `translate(-50%, ${offsetY}px)`,
        transition: phase === 'pulling' || reducedMotion
          ? 'none'
          : 'transform 0.25s ease-out, opacity 0.25s ease-out, color 0.2s ease',
      }}
    >
      {phase === 'refreshing' ? (
        <Spinner size={18} color={theme.colors.primary} />
      ) : phase === 'done' ? (
        <CheckIcon size={18} />
      ) : (
        <span
          style={{
            display: 'flex',
            transform: `rotate(${progress * 180}deg)`,
            transition: reducedMotion ? 'none' : 'transform 0.15s ease-out',
          }}
        >
          <RefreshIcon size={18} />
        </span>
      )}
      <span>{label}</span>
    </div>
  );
};

export default PullToRefreshLayer;
