import type { HolidayId } from './flag';

/**
 * The contract between the engine and a holiday.
 *
 * The engine knows how to schedule performances, load sprites, measure the page
 * and paint two canvases. It knows nothing about ghosts. A holiday is DATA — a
 * sprite manifest, a palette and a list of acts — which is what makes adding
 * Thanksgiving a new folder under themes/ rather than a change in here.
 */

export type Layer = 'behind' | 'front';

/** 0..1, seeded. The director's whole schedule is reproducible from one seed. */
export type Rng = () => number;

/** Page geometry in CSS pixels, viewport-relative (the canvases are fixed). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Stage {
  vw: number;
  vh: number;
  /** Below theme.breakpoints.tablet. Acts scale down rather than get cut off. */
  compact: boolean;
  /** null when the page never published this name — see anchorOr. */
  anchor(name: string): Rect | null;
  /**
   * The anchor, or a fallback. Every act must go through this rather than
   * assuming its furniture exists: the layer is designed to be mountable on a
   * page that publishes no anchors at all, and an act that throws there would
   * take the page with it.
   */
  anchorOr(name: string, fallback: Rect): Rect;
}

export interface Sprite {
  /**
   * null until decoded, and permanently null if the fetch failed. Acts never
   * see this — the director will not cast an act whose sprites are not ready —
   * but the draw helpers still no-op on it, because a decorative layer that can
   * throw is a decorative layer that can take out the front door.
   */
  img: CanvasImageSource | null;
  /**
   * Intrinsic size in CSS px at scale 1, declared in the manifest rather than
   * read from naturalWidth. An act's layout must be deterministic before the
   * image exists, and it must not shift when a re-render swaps a 2x file in.
   */
  w: number;
  h: number;
}

export interface HolidayPalette {
  /** The warm light a pumpkin throws. Literal hex — canvas cannot resolve var(). */
  glow: string;
  /** The hotter core of that light. */
  ember: string;
  /** Contact shadow under a seated object. */
  shadow: string;
  /** The presence glow behind a translucent tile. */
  rim: string;
}

export interface Paint {
  ctx: CanvasRenderingContext2D;
  /**
   * Expands this frame's dirty box. Called by the draw helpers, not by acts —
   * an act that draws by hand and forgets to mark leaves a trail on screen.
   */
  mark(x: number, y: number, w: number, h: number): void;
  palette: HolidayPalette;
  mode: 'dark' | 'light';
}

export interface ActContext {
  /** Seconds since this performance began. */
  t: number;
  /** t / duration, clamped to 0..1. */
  p: number;
  stage: Stage;
  sprites: Record<string, Sprite>;
  paint: Paint;
}

export interface Performance {
  /** Seconds. The director retires the act here regardless of what it drew. */
  duration: number;
  draw(c: ActContext): void;
}

export interface ActDefinition {
  id: string;
  layer: Layer;
  /** Sprite keys. An act with an unmet need is never cast. */
  needs: readonly string[];
  /** False when the page's furniture cannot support it — too narrow, no anchor. */
  canRun?(stage: Stage): boolean;
  /**
   * Build one performance. Discrete choices — which tile, which direction, the
   * step timings — are frozen HERE, once. Geometry is read live in draw(), so a
   * mid-act scroll or resize simply works and there is no stale-rect bug class.
   *
   * `stage` is passed for the one thing that genuinely cannot be decided later:
   * an act's DURATION. A character crossing the screen at a believable walking
   * pace needs longer on a 1440px desktop than on a 390px phone, and duration
   * is fixed once a performance exists. Use it for that and read everything
   * else live in draw().
   */
  cast(rand: Rng, stage: Stage): Performance;
}

/** Always on, no duration, no scheduling. The atmosphere rather than the show. */
export interface Ambient {
  layer: Layer;
  needs: readonly string[];
  draw(c: Omit<ActContext, 'p'>): void;
}

export interface HolidayTheme {
  id: HolidayId;
  sprites: Record<string, { url: string; w: number; h: number }>;
  acts: readonly ActDefinition[];
  ambient: readonly Ambient[];
  palette: Record<'dark' | 'light', HolidayPalette>;
  /**
   * Act ids the FIRST performance is drawn from.
   *
   * Median time on the front door is a few seconds, and acts are spaced 8-15s
   * apart, so for most visitors the first performance is the only one they will
   * ever see. Picking it uniformly means half of them meet the skeleton walking
   * along the bottom while they are already tapping a tile. These are the ones
   * worth opening on.
   */
  openers: readonly string[];
  /** Sprite keys the reduced-motion tableau needs. Only these are fetched then. */
  stillNeeds: readonly string[];
  /** The one frame painted when the person has asked for less motion. */
  drawStill(c: Omit<ActContext, 'p' | 't'>): void;
}
