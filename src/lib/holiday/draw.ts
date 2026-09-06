import type { Paint, Sprite } from './types';

/**
 * Putting a sprite on a canvas, and telling the frame where it went.
 *
 * DIRTY RECTANGLES, NOT FULL CLEARS
 *
 * This layer paints over a page that already runs one full-viewport animated
 * canvas. Clearing two more full viewports every frame to move one 140px
 * character is most of the cost of the feature for none of the benefit, so each
 * canvas clears only the box it dirtied last frame.
 *
 * That only works if EVERY draw is marked. An act that reaches for ctx directly
 * and forgets to call paint.mark leaves a smear on screen that will look like a
 * compositor bug and will not be. Go through these helpers.
 *
 * PIVOTS
 *
 * `pivot` is the point that (x, y) names, and it is a physics decision rather
 * than a layout one. A ghost squashes about its bottom because its tail stays
 * planted; a hanging bat swings about its toes because that is what it is
 * gripping with; a falling body rotates about its centre of mass. Getting this
 * wrong does not produce an error, it produces motion that reads as wrong for
 * reasons nobody can name.
 */

export type Pivot = 'bottom' | 'center' | 'top';

export interface SpriteOptions {
  x: number;
  y: number;
  /** Uniform scale applied on top of sx/sy. */
  scale?: number;
  /** Non-uniform scale, for squash and stretch. */
  sx?: number;
  sy?: number;
  /** Radians. */
  rot?: number;
  alpha?: number;
  pivot?: Pivot;
  /** Mirror horizontally — a character walking the other way. */
  flip?: boolean;
  /**
   * A grounding drop shadow. Off by default and used only in light mode, where
   * a bone-white ghost on #F4F4F5 has no edge of its own to read against.
   */
  shadow?: { color: string; blur: number; offsetY: number } | null;
}

const pivotOffset = (pivot: Pivot, h: number): number =>
  pivot === 'bottom' ? -h : pivot === 'center' ? -h / 2 : 0;

/**
 * The axis-aligned box a rotated, scaled sprite occupies, in canvas space.
 *
 * Exported because the still-frame path needs to size its one clear without
 * drawing first.
 */
export const spriteBounds = (
  sprite: Sprite,
  o: SpriteOptions
): { x: number; y: number; w: number; h: number } => {
  const scale = o.scale ?? 1;
  const sx = (o.sx ?? 1) * scale;
  const sy = (o.sy ?? 1) * scale;
  const rot = o.rot ?? 0;
  const oy = pivotOffset(o.pivot ?? 'center', sprite.h);

  const W = Math.abs(sprite.w * sx);
  const H = Math.abs(sprite.h * sy);
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));

  // The sprite's own centre, in local space, is offset from the pivot.
  const localCy = (oy + sprite.h / 2) * sy;
  const cx = o.x - localCy * Math.sin(rot);
  const cy = o.y + localCy * Math.cos(rot);

  const hw = (c * W + s * H) / 2;
  const hh = (s * W + c * H) / 2;

  const pad = o.shadow ? o.shadow.blur + Math.abs(o.shadow.offsetY) : 0;
  return { x: cx - hw - pad, y: cy - hh - pad, w: 2 * (hw + pad), h: 2 * (hh + pad) };
};

export const drawSprite = (paint: Paint, sprite: Sprite, o: SpriteOptions): void => {
  if (!sprite.img) return;
  const { ctx } = paint;
  const scale = o.scale ?? 1;
  const sx = (o.sx ?? 1) * scale * (o.flip ? -1 : 1);
  const sy = (o.sy ?? 1) * scale;

  const b = spriteBounds(sprite, o);
  paint.mark(b.x, b.y, b.w, b.h);

  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.shadow) {
    ctx.shadowColor = o.shadow.color;
    ctx.shadowBlur = o.shadow.blur;
    ctx.shadowOffsetY = o.shadow.offsetY;
  }
  ctx.translate(o.x, o.y);
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(sx, sy);
  ctx.drawImage(sprite.img, -sprite.w / 2, pivotOffset(o.pivot ?? 'center', sprite.h), sprite.w, sprite.h);
  ctx.restore();
};

/**
 * A soft radial light.
 *
 * `additive` uses 'lighter', which is how a candle behaves and how it has to be
 * drawn on the near-black void — but it does essentially nothing over light
 * mode's chalk, where the same glow is drawn source-over in a warmer hue and
 * the grounding comes from the contact shadow instead. Bloom sells dark,
 * shadow sells light.
 */
export const drawGlow = (
  paint: Paint,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
  additive: boolean
): void => {
  if (alpha <= 0.002 || radius <= 0) return;
  const { ctx } = paint;
  paint.mark(x - radius, y - radius, radius * 2, radius * 2);

  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(0.45, color);
  g.addColorStop(1, 'transparent');

  ctx.save();
  ctx.globalAlpha = alpha;
  if (additive) ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/**
 * The squashed ellipse under a seated object.
 *
 * A contact shadow, not a cast one: it says "this is resting on something"
 * without implying a light source the rest of the page does not have.
 */
export const drawContactShadow = (
  paint: Paint,
  x: number,
  y: number,
  w: number,
  color: string,
  alpha: number
): void => {
  if (alpha <= 0.002 || w <= 0) return;
  const { ctx } = paint;
  const h = w * 0.22;
  paint.mark(x - w / 2, y - h / 2, w, h);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/** How much of `a` lies inside `b`, 0..1 by area. Drives the presence glow. */
export const overlapFraction = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number => {
  const ow = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oh = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ow <= 0 || oh <= 0) return 0;
  const area = a.w * a.h;
  return area > 0 ? (ow * oh) / area : 0;
};

/**
 * Accumulates the region touched this frame, so the next frame knows what to
 * clear. Grown by a pixel on every side because a rotated edge lands on
 * fractional coordinates and antialiasing bleeds one pixel past the maths.
 */
export interface Dirty {
  mark(x: number, y: number, w: number, h: number): void;
  /** Erase the region drawn last frame. Call BEFORE this frame's draws. */
  begin(ctx: CanvasRenderingContext2D, vw: number, vh: number): void;
  /** Commit this frame's marks as the region to erase next time. Call AFTER. */
  end(): void;
  /** True when nothing was drawn last frame and nothing needs clearing. */
  readonly clean: boolean;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const createDirty = (): Dirty => {
  let cur: Box | null = null;
  let prev: Box | null = null;

  return {
    mark(x, y, w, h) {
      const x1 = x + w;
      const y1 = y + h;
      if (!cur) cur = { x0: x, y0: y, x1, y1 };
      else {
        if (x < cur.x0) cur.x0 = x;
        if (y < cur.y0) cur.y0 = y;
        if (x1 > cur.x1) cur.x1 = x1;
        if (y1 > cur.y1) cur.y1 = y1;
      }
    },
    begin(ctx, vw, vh) {
      if (!prev) return;
      // Grown by two pixels: a rotated edge lands on fractional coordinates and
      // antialiasing puts ink a shade outside the box the maths predicts.
      const x = Math.max(0, Math.floor(prev.x0) - 2);
      const y = Math.max(0, Math.floor(prev.y0) - 2);
      const w = Math.min(vw, Math.ceil(prev.x1) + 2) - x;
      const h = Math.min(vh, Math.ceil(prev.y1) + 2) - y;
      if (w > 0 && h > 0) ctx.clearRect(x, y, w, h);
    },
    end() {
      prev = cur;
      cur = null;
    },
    get clean() {
      return prev === null;
    },
  };
};
