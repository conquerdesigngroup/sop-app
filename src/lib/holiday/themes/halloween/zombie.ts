import { unionRect } from '../../anchors';
import { clamp01, lerp, shambleStep, teeter } from '../../ease';
import { drawRig } from '../../rig';
import type { ActDefinition } from '../../types';
import { fallbackTile, groundShadow, sizeFor } from './look';
import { zombieBob, zombieShamble, zombieTeeter, zombieTumble } from './poses';
import { ZOMBIE } from './rigs';

/**
 * The zombie: shambles along the top edge of the tiles, teeters on the corner
 * and falls off.
 *
 * Three beats, and now three POSES rather than one sprite being rotated: it
 * walks with its arms out, throws them up as it loses the corner, and flails
 * on the way down. The tumble in particular only reads because the limbs move
 * independently of the body's spin — a rigid figure rotating is a wheel.
 *
 * Staged across the UNION of both tiles. A single tile is about 138px on a
 * 320px phone, which is two strides and a fall.
 */

const DURATION = 7.5;
const WALK_END = 0.62;
const TEETER_END = 0.73;
/** Seconds of teeter shape squeezed into that window — commits at the handoff. */
const TEETER_SPAN = 0.85;
const STRIDE = 0.92;
const GRAVITY = 1400;

export const zombie: ActDefinition = {
  id: 'zombie',
  layer: 'front',
  needs: ['zo_head', 'zo_torso', 'zo_upperArm', 'zo_foreArm', 'zo_leg'],
  // Below this there is not enough ledge to read as walking before it falls.
  canRun: (stage) => stage.vw >= 300,
  cast(rand) {
    const goRight = rand() < 0.5;

    return {
      duration: DURATION,
      draw({ t, p, stage, sprites, paint }) {
        const scale = sizeFor(stage);
        const shadow = groundShadow(paint);
        // Torso centre above the feet, so the rig stands ON the ledge.
        const hip = 40 * scale;

        const ledge = unionRect(
          stage.anchorOr('staff', fallbackTile(stage, 'left')),
          stage.anchorOr('dancer', fallbackTile(stage, 'right'))
        );
        const startX = goRight ? ledge.x + 14 : ledge.x + ledge.w - 14;
        const cornerX = goRight ? ledge.x + ledge.w : ledge.x;
        const topY = ledge.y;

        // --- shamble ---------------------------------------------------------
        if (p < WALK_END) {
          const walkT = p * DURATION;
          const strides = walkT / STRIDE;
          const done = Math.floor(strides);
          const q = strides - done;
          const progress = (done + shambleStep(q)) / ((WALK_END * DURATION) / STRIDE);

          drawRig(paint, ZOMBIE, sprites, {
            x: lerp(startX, cornerX, clamp01(progress)),
            y: topY - hip + zombieBob(q) * scale,
            scale,
            flip: !goRight,
            pose: zombieShamble(q),
            shadow,
          });
          return;
        }

        // --- teeter: an inverted pendulum, pivoting on the corner underfoot ---
        if (p < TEETER_END) {
          const u = (p - WALK_END) / (TEETER_END - WALK_END);
          drawRig(paint, ZOMBIE, sprites, {
            x: cornerX,
            y: topY - hip,
            scale,
            flip: !goRight,
            rot: teeter(u * TEETER_SPAN) * (goRight ? 1 : -1),
            pose: zombieTeeter(u),
            shadow,
          });
          return;
        }

        // --- tumble ----------------------------------------------------------
        const u = (p - TEETER_END) * DURATION;
        const exitRot = teeter(TEETER_SPAN) * (goRight ? 1 : -1);

        drawRig(paint, ZOMBIE, sprites, {
          x: cornerX + (goRight ? 40 : -40) * u,
          y: topY - hip + 0.5 * GRAVITY * u * u,
          scale,
          flip: !goRight,
          rot: exitRot + (goRight ? 3.4 : -3.4) * u,
          pose: zombieTumble(u),
          shadow,
        });
      },
    };
  },
};
