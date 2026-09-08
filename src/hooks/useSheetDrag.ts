import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drag a bottom sheet down by its grab handle to dismiss it.
 *
 * Every sheet in this app draws the little grabber bar at its top edge, which
 * is a promise: that bar is the universal signal for "pull me down". Until now
 * it was decorative on all three of them, so the only way out of a sheet was to
 * tap the sliver of page still showing above it — a target that shrinks to
 * nothing on a tall sheet, and that a thumb resting at the bottom of a phone
 * cannot reach at all.
 *
 * THE HANDLE, NOT THE LIST
 *
 * Only the handle starts a drag. The list below it owns the vertical gesture
 * for scrolling, and a browser that has decided a touch is a scroll stops
 * sending pointer events for it — it fires pointercancel instead. Reading a
 * drag out of the list means a non-passive touchmove listener racing the
 * scroller for the same finger, which is how you end up with rows that
 * sometimes navigate when you meant to scroll. The handle can be honest about
 * it: `touch-action: none` hands the browser's claim over cleanly, so the
 * gesture is ours from the first pixel.
 *
 * Pointer capture is what lets the finger wander off the 34px strip mid-drag
 * and keep dragging, which it always does.
 *
 * UP IS CLAMPED, NOT RUBBER-BANDED
 *
 * A sheet is anchored to the bottom edge. Translating it up does not stretch
 * it, it lifts it off the floor and shows a band of backdrop underneath. So an
 * upward drag simply holds at rest.
 *
 * REDUCED MOTION
 *
 * The sheet still tracks the finger — that is the control answering a touch,
 * not decoration, and freezing it would read as a dead handle. What is skipped
 * is what happens after release: the spring back and the slide out become
 * instant. index.css already collapses the transition to 0.01ms, so the
 * slide-out timer has to go with it or the sheet sits there, already gone,
 * for a fifth of a second.
 */

/** Far enough down that it cannot be a stray touch on the way to a row. */
const DISMISS_PX = 96;
/** A fast flick means it, and needs much less distance to prove it. */
const FLICK_PX = 24;
/** px per ms. Roughly "faster than a scroll, slower than a fumble". */
const FLICK_VELOCITY = 0.5;
/** How far back to look when asking how fast the finger was moving. */
const VELOCITY_WINDOW_MS = 100;
/**
 * Below this the sample span is noise, not speed.
 *
 * Two pointermove events can land a fraction of a millisecond apart — a
 * coalesced burst, or a synthetic one in a test — and dividing any real
 * distance by that produces a velocity in the hundreds. Every drag then reads
 * as a flick and the 96px threshold may as well not exist.
 */
const MIN_VELOCITY_SPAN_MS = 10;
/** Matches PortalSheet's own slide, so the two sheets leave at one speed. */
const SLIDE_OUT_MS = 180;
const EASE = 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)';

interface Options {
  /** Reset when the sheet reopens: this hook outlives the sheet it drives. */
  isOpen: boolean;
  onDismiss: () => void;
  reducedMotion: boolean;
  /**
   * Whether to carry the throw out on release. Default true, for a sheet that
   * simply unmounts when it closes.
   *
   * Pass false for one that animates its own exit — PortalSheet slides itself
   * to translateY(100%) over 220ms — where a slide-out here would be a second
   * animation racing the host's, and the host's would win anyway.
   */
  slideOut?: boolean;
}

export interface SheetDrag {
  /** Attach to the sheet itself — read for its height when sliding out. */
  sheetRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Merge into the sheet's style. Only for a sheet with no transform of its
   * own: `transform` here is undefined at rest, and spreading that over a
   * host's own translate erases it. Compose from `offset` instead in that case.
   */
  sheetStyle: React.CSSProperties;
  /** How far down the sheet is being held, in px. 0 at rest. */
  offset: number;
  /** True while a finger is down — compose a transition off this. */
  dragging: boolean;
  /** Spread onto the grab handle. */
  handleProps: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
    style: React.CSSProperties;
  };
}

type Phase = 'idle' | 'dragging' | 'leaving';

interface Sample {
  y: number;
  t: number;
}

export const useSheetDrag = ({
  isOpen, onDismiss, reducedMotion, slideOut = true,
}: Options): SheetDrag => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');

  const start = useRef<Sample | null>(null);
  // A trailing window, not the whole gesture: someone who drags slowly halfway
  // and then flicks has flicked, and an average over the whole travel says
  // they did not. The reverse holds too — a fast drag that comes to rest
  // before letting go was a placement, not a throw.
  const samples = useRef<Sample[]>([]);
  const timer = useRef<number | null>(null);

  const sample = (y: number, t: number) => {
    const s = samples.current;
    s.push({ y, t });
    while (s.length > 2 && s[0].t < t - VELOCITY_WINDOW_MS) s.shift();
  };

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  // The sheet unmounts on close but this hook does not, so without a reset it
  // would reopen still parked wherever the last drag left it — off screen.
  useEffect(() => {
    if (isOpen) {
      clearTimer();
      setOffset(0);
      setPhase('idle');
    }
  }, [isOpen]);

  const dismiss = useCallback(() => {
    if (reducedMotion || !slideOut) {
      setPhase('idle');
      setOffset(0);
      onDismiss();
      return;
    }
    // Carry the motion the finger started rather than letting the sheet blink
    // out from under it mid-throw.
    setPhase('leaving');
    // `||`, not `??`: a detached or display:none sheet measures 0, and a 0
    // slide-out is the sheet vanishing on the spot — the thing this avoids.
    setOffset(sheetRef.current?.offsetHeight || window.innerHeight);
    clearTimer();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onDismiss();
    }, SLIDE_OUT_MS);
  }, [onDismiss, reducedMotion, slideOut]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    // Ignore a right-click drag; every touch and pen contact counts.
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    start.current = { y: e.clientY, t: e.timeStamp };
    samples.current = [];
    sample(e.clientY, e.timeStamp);
    setPhase('dragging');

    // jsdom has neither, and a browser refuses capture for a pointer that is
    // already gone. Neither is worth losing the drag over.
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is an optimisation, not a requirement */
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!start.current) return;
    sample(e.clientY, e.timeStamp);
    setOffset(Math.max(0, e.clientY - start.current.y));
  }, []);

  const finish = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const from = start.current;
    start.current = null;
    if (!from) return;

    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* already released */
    }

    sample(e.clientY, e.timeStamp);
    const dy = Math.max(0, e.clientY - from.y);

    const window = samples.current;
    const oldest = window[0];
    const newest = window[window.length - 1];
    const span = newest.t - oldest.t;
    // Too short a span means we cannot tell — so we do not guess, and the
    // drag has to earn its dismissal on distance alone.
    const velocity = span >= MIN_VELOCITY_SPAN_MS ? (newest.y - oldest.y) / span : 0;

    if (dy >= DISMISS_PX || (dy >= FLICK_PX && velocity >= FLICK_VELOCITY)) {
      dismiss();
      return;
    }

    setPhase('idle');
    setOffset(0);
  }, [dismiss]);

  const cancel = useCallback(() => {
    start.current = null;
    setPhase('idle');
    setOffset(0);
  }, []);

  return {
    sheetRef,
    offset,
    dragging: phase === 'dragging',
    sheetStyle: {
      transform: offset > 0 ? `translateY(${offset}px)` : undefined,
      // 1:1 with the finger while it is down; eased only once it lifts.
      transition: phase === 'dragging' ? 'none' : EASE,
    },
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: cancel,
      style: {
        touchAction: 'none',
        cursor: phase === 'dragging' ? 'grabbing' : 'grab',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      },
    },
  };
};

export default useSheetDrag;
