import type { Rect, Stage } from './types';

/**
 * Where the page's furniture is, so a character can be staged against it.
 *
 * A ghost that rises from behind the Staff Portal tile and sinks behind the
 * Dancer Portal one has to know where those two tiles are. The alternative —
 * drifting across at an arbitrary height and letting the tiles occlude whatever
 * they happen to occlude — looks random, because it is.
 *
 * THE CONTRACT IS A DATA ATTRIBUTE, NOT A REF
 *
 * A page names its furniture with `data-holiday-anchor="staff"` and mounts the
 * layer. Nothing is threaded through props, the layer needs no ref-shaped API,
 * and a page that names nothing still works — every act reads through anchorOr
 * and falls back to viewport-relative staging. That is what makes this
 * mountable on a portal page later without touching this file.
 *
 * MEASURE ON A DIRTY FLAG, NEVER IN A LISTENER
 *
 * getBoundingClientRect forces layout. Calling it from a scroll handler is how
 * you turn a decorative layer into jank on the one screen that has to feel
 * instant. Listeners set a flag; the RAF reads it once per frame at most.
 *
 * Scroll is in that list for a reason that is easy to miss: the canvases are
 * position:fixed and the tiles are not, so on a 320x568 phone — where the
 * chooser genuinely scrolls — a cached rect detaches the ghost from the tile
 * the instant anybody moves the page.
 */

/** ChooserPage's own compact switch is `isMobileOrTablet`, which is < 768. */
const COMPACT_MAX = 768;

export interface AnchorSource {
  /** The current stage. Re-measures only if something invalidated the cache. */
  read(): Stage;
  dispose(): void;
}

const toRect = (el: Element): Rect => {
  const b = el.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height };
};

/** The smallest rect containing both. Used for staging across a pair of tiles. */
export const unionRect = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

export const createAnchorSource = (): AnchorSource => {
  let dirty = true;
  let rects = new Map<string, Rect>();
  let vw = 0;
  let vh = 0;

  const invalidate = () => {
    dirty = true;
  };

  const hasRO = typeof ResizeObserver === 'function';
  const observer = hasRO ? new ResizeObserver(invalidate) : null;

  const measure = () => {
    vw = window.innerWidth;
    vh = window.innerHeight;

    // Re-query rather than caching the node list. An element that mounts later
    // — a lazily-rendered tile, the client-auth beta link — would otherwise be
    // missed for the lifetime of the page rather than for one frame.
    const found = document.querySelectorAll<HTMLElement>('[data-holiday-anchor]');
    const next = new Map<string, Rect>();
    observer?.disconnect();
    found.forEach((el) => {
      const name = el.dataset.holidayAnchor;
      if (!name) return;
      next.set(name, toRect(el));
      observer?.observe(el);
    });
    // documentElement so a reflow with no anchor resize still invalidates.
    if (observer && document.documentElement) observer.observe(document.documentElement);
    rects = next;
    dirty = false;
  };

  const stage: Stage = {
    get vw() {
      return vw;
    },
    get vh() {
      return vh;
    },
    get compact() {
      return vw < COMPACT_MAX;
    },
    anchor(name) {
      return rects.get(name) ?? null;
    },
    anchorOr(name, fallback) {
      return rects.get(name) ?? fallback;
    },
  };

  window.addEventListener('scroll', invalidate, { passive: true, capture: true });
  window.addEventListener('resize', invalidate);
  window.addEventListener('orientationchange', invalidate);

  // The logo is `height: auto`, so its box only settles when the PNG decodes,
  // and the tile labels can rewrap when Barlow arrives. Both land after first
  // paint; both move an anchor. One-shot, and guarded — Safari shipped
  // document.fonts late and jsdom has never had it.
  let alive = true;
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    document.fonts.ready.then(() => {
      if (alive) invalidate();
    }).catch(() => undefined);
  }

  return {
    read() {
      if (dirty) measure();
      return stage;
    },
    dispose() {
      alive = false;
      observer?.disconnect();
      window.removeEventListener('scroll', invalidate, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('orientationchange', invalidate);
    },
  };
};
