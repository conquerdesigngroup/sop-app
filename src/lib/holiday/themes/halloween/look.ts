import type { Paint, Rect, Stage } from '../../types';

/**
 * Shared look decisions, so five acts cannot drift apart on them.
 */

/**
 * The drop shadow every character wears in LIGHT MODE ONLY.
 *
 * The clay art carries its own ambient occlusion, which is enough of an edge
 * against the near-black void. It is not enough against #F4F4F5: a bone-white
 * ghost and a bone-white skeleton both dissolve into chalk. One shadow property
 * set before the drawImage is the whole fix, and it is why there is no second
 * light-mode sprite set — that would have doubled the payload and the art
 * pipeline for the minority mode.
 */
const LIGHT_SHADOW = { color: 'rgba(17,17,17,0.26)', blur: 10, offsetY: 4 };

export const groundShadow = (paint: Paint) => (paint.mode === 'light' ? LIGHT_SHADOW : null);

/** Characters are drawn smaller on a phone, in step with the tiles themselves. */
export const sizeFor = (stage: Stage): number => (stage.compact ? 0.72 : 1);

/**
 * Which way the side-view walk art faces, so acts can mirror correctly.
 *
 * A one-line change if the frames are ever re-rendered facing the other way,
 * which is exactly what happened once already — the first skeleton sheet came
 * back walking left and the replacement walks right.
 */
export const WALK_ART_FACES: 'left' | 'right' = 'right';

/**
 * Viewport-relative stand-ins for the chooser's two tiles.
 *
 * Every act reads its furniture through stage.anchorOr with one of these, so
 * the layer stays mountable on a page that publishes no anchors at all. It will
 * not be as well staged there — nothing rises from behind anything — but it
 * runs, and it cannot throw.
 */
export const fallbackTile = (stage: Stage, side: 'left' | 'right'): Rect => {
  const w = Math.min(200, stage.vw * 0.34);
  const h = Math.min(220, stage.vh * 0.26);
  return {
    x: side === 'left' ? stage.vw * 0.5 - w - 8 : stage.vw * 0.5 + 8,
    y: stage.vh * 0.5 - h * 0.3,
    w,
    h,
  };
};

export const centreX = (r: Rect): number => r.x + r.w / 2;
