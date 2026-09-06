import { drawGlow, drawSprite, overlapFraction, spriteBounds } from '../../draw';
import { clamp, easeInCubic, easeInOutSine, easeOutCubic, ghostBob, ghostSquash, lerp, smoothstep } from '../../ease';
import type { ActDefinition } from '../../types';
import { centreX, fallbackTile, groundShadow, sizeFor } from './look';

/**
 * The ghost: rises from behind one tile, drifts across the gap, sinks behind
 * the other.
 *
 * This is the act the whole layering arrangement exists for. It runs on the
 * BACK canvas, so the tiles occlude it — and because they are 78% opaque with
 * a 6px backdrop blur, the moment before it clears the edge it is a soft bloom
 * behind frosted glass rather than a sprite behind a rectangle. That is the
 * best two seconds in the feature and it is free; the presence glow below is
 * there to make sure it registers, because a flat colour field survives a blur
 * and a 22% composite far better than a shaded figure does.
 */

const DURATION = 9;
const RISE_END = 0.22;
const SINK_START = 0.78;
/** x starts moving before the rise finishes, so the two beats overlap. */
const DRIFT_FROM = 0.18;
const DRIFT_SPAN = 0.64;

export const ghost: ActDefinition = {
  id: 'ghost',
  layer: 'behind',
  needs: ['ghost'],
  cast(rand) {
    const rightward = rand() < 0.5;
    const fromName = rightward ? 'staff' : 'dancer';
    const toName = rightward ? 'dancer' : 'staff';

    return {
      duration: DURATION,
      draw({ t, p, stage, sprites, paint }) {
        const sprite = sprites.ghost;
        if (!sprite) return;

        const scale = sizeFor(stage);
        const h = sprite.h * scale;

        const from = stage.anchorOr(fromName, fallbackTile(stage, rightward ? 'left' : 'right'));
        const to = stage.anchorOr(toName, fallbackTile(stage, rightward ? 'right' : 'left'));

        // Fully inside the tile it is hiding behind: with a bottom pivot the
        // sprite spans [y - h, y], so y must clear the tile's top edge by a
        // whole sprite height before any of it is showing.
        const hideIn = (r: typeof from) => r.y + h + 6;
        // Risen far enough to be unmistakable, but still rooted: the bottom
        // third stays behind the tile. Clearing the tile entirely was the first
        // attempt and it read as a ghost floating in empty space near the logo
        // rather than as one coming out from behind a button — the occlusion is
        // what sells where it came from, so some of it has to stay occluded.
        const peak = from.y + h * 0.34;

        let baseY: number;
        if (p < RISE_END) baseY = lerp(hideIn(from), peak, easeOutCubic(p / RISE_END));
        else if (p < SINK_START) baseY = peak;
        else baseY = lerp(peak, hideIn(to), easeInCubic((p - SINK_START) / (1 - SINK_START)));

        // Bob only once it is out and settling again, so the emergence reads as
        // one deliberate rise rather than a rise with a wobble on top.
        const out = smoothstep(0, RISE_END, p) * (1 - smoothstep(SINK_START, 1, p));
        const y = baseY + ghostBob(t) * out;

        const u = clamp((p - DRIFT_FROM) / DRIFT_SPAN, 0, 1);
        const x0 = centreX(from);
        const x1 = centreX(to);
        const x = lerp(x0, x1, easeInOutSine(u)) + 5 * Math.sin(2 * Math.PI * 0.31 * t + 0.4) * out;

        // Analytic dx/dt: differentiating the easing beats differencing frames,
        // which is one frame stale and changes meaning when the paint rate does.
        const vx =
          u > 0 && u < 1
            ? ((x1 - x0) * 0.5 * Math.PI * Math.sin(Math.PI * u)) / (DRIFT_SPAN * DURATION)
            : 0;
        const rot = clamp(vx / 220, -1, 1) * 0.16;

        const { sx, sy } = ghostSquash(t);
        const opts = {
          x,
          y,
          scale,
          sx,
          sy,
          rot,
          // Bottom, so the hem stays planted and the squash reads as a body
          // compressing rather than a sprite pulsing.
          pivot: 'bottom' as const,
          shadow: groundShadow(paint),
        };

        // Presence glow — how much of the ghost is currently behind a tile.
        const box = spriteBounds(sprite, opts);
        const hidden = Math.max(
          overlapFraction(box, from),
          overlapFraction(box, to)
        );
        if (hidden > 0.02) {
          drawGlow(
            paint,
            x,
            y - h * 0.5,
            sprite.w * scale * 1.35,
            paint.palette.rim,
            0.35 * hidden,
            paint.mode === 'dark'
          );
        }

        drawSprite(paint, sprite, opts);
      },
    };
  },
};
