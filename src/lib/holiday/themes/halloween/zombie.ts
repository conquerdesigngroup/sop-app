import { drawSprite } from '../../draw';
import { clamp01, lerp, shambleBob, shambleRoll, shambleStep, teeter } from '../../ease';
import { unionRect } from '../../anchors';
import type { ActDefinition } from '../../types';
import { fallbackTile, groundShadow, sizeFor } from './look';

/**
 * The zombie: shambles along the top edge of the tiles, teeters on the corner
 * and falls off.
 *
 * Staged across the UNION of both tiles rather than one of them. A single tile
 * is about 138px wide on a 320px phone — two strides and a fall, which reads as
 * a stumble rather than a walk. The pair gives roughly 400px on a phone and 520
 * on a desktop, and the fall then happens off the outer corner, which is the
 * better shot anyway.
 */

const DURATION = 7.5;
const WALK_END = 0.62;
const TEETER_END = 0.73;
/** Seconds of teeter shape squeezed into that window — tuned so it commits at the handoff. */
const TEETER_SPAN = 0.85;
const STRIDE = 0.92;
const GRAVITY = 1400;

export const zombie: ActDefinition = {
  id: 'zombie',
  layer: 'front',
  needs: ['zombie'],
  // Below this there is not enough ledge to read as walking before it falls.
  canRun: (stage) => stage.vw >= 300,
  cast(rand) {
    const goRight = rand() < 0.5;

    return {
      duration: DURATION,
      draw({ t, p, stage, sprites, paint }) {
        const sprite = sprites.zombie;
        if (!sprite) return;

        const scale = sizeFor(stage);
        const w = sprite.w * scale;
        const shadow = groundShadow(paint);

        const ledge = unionRect(
          stage.anchorOr('staff', fallbackTile(stage, 'left')),
          stage.anchorOr('dancer', fallbackTile(stage, 'right'))
        );
        const startX = goRight ? ledge.x + w * 0.2 : ledge.x + ledge.w - w * 0.2;
        const cornerX = goRight ? ledge.x + ledge.w : ledge.x;
        const topY = ledge.y;

        // --- shamble ---------------------------------------------------------
        if (p < WALK_END) {
          const walkT = p * DURATION;
          const strides = walkT / STRIDE;
          const done = Math.floor(strides);
          const q = strides - done;
          // The bad leg's drag is inside shambleStep; the distance still has to
          // come out right over the whole walk, so progress is measured in
          // completed strides plus the current one's partial.
          const progress = (done + shambleStep(q)) / (WALK_END * DURATION / STRIDE);

          drawSprite(paint, sprite, {
            x: lerp(startX, cornerX, clamp01(progress)),
            y: topY + shambleBob(q),
            scale,
            rot: shambleRoll(q) * (goRight ? 1 : -1),
            pivot: 'bottom',
            flip: !goRight,
            shadow,
          });
          return;
        }

        // --- teeter: an inverted pendulum, pivoting on the corner underfoot ---
        if (p < TEETER_END) {
          const u = ((p - WALK_END) / (TEETER_END - WALK_END)) * TEETER_SPAN;
          drawSprite(paint, sprite, {
            x: cornerX,
            y: topY,
            scale,
            rot: teeter(u) * (goRight ? 1 : -1),
            pivot: 'bottom',
            flip: !goRight,
            shadow,
          });
          return;
        }

        // --- tumble ----------------------------------------------------------
        const u = (p - TEETER_END) * DURATION;
        const exitRot = teeter(TEETER_SPAN) * (goRight ? 1 : -1);
        const h = sprite.h * scale;

        // A falling body rotates about its centre of mass, but it was rotating
        // about its foot a moment ago. Jumping between the two is visible, so
        // the pivot is faked by sliding the draw point up to the centre over
        // the first eighth of a second.
        const toCentre = clamp01(u / 0.12);
        const y = topY + 0.5 * GRAVITY * u * u - (h / 2) * toCentre;

        drawSprite(paint, sprite, {
          x: cornerX + (goRight ? 40 : -40) * u,
          y,
          scale,
          rot: exitRot + (goRight ? 3.4 : -3.4) * u,
          pivot: toCentre < 1 ? 'bottom' : 'center',
          flip: !goRight,
          shadow,
        });
      },
    };
  },
};
