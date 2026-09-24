import {
  batSwing,
  clamp01,
  easeOutBack,
  easeOutCubic,
  flapActive,
  lerp,
  pendulumHz,
  wingbeatBob,
  wingPhase,
} from '../../ease';
import { blendPose, drawRig } from '../../rig';
import type { ActContext, ActDefinition } from '../../types';
import { batFlap, batGlide, batHang, batWake } from './poses';
import { groundShadow, sizeFor } from './look';
import { BAT } from './rigs';

/**
 * The bat: comes down from the ceiling, hangs, sleeps, wakes and flies off.
 *
 * The wing is the reason this became a rig. Three drawn poses swapped in turn
 * could only ever be three drawn poses; two hinged segments with the outer one
 * lagging the inner gives a continuous beat with a real membrane whip at the
 * bottom of the downstroke, and lets the same wings WRAP the body while it
 * hangs — a pose that no amount of frame-swapping was going to produce.
 */

const DURATION = 15;
const DESCEND_END = 0.13;
const HANG_END = 0.55;
const WAKE_END = 0.63;

export const bat: ActDefinition = {
  id: 'bat',
  layer: 'front',
  needs: ['ba_body', 'ba_head', 'ba_wingIn', 'ba_wingOut', 'ba_foot'],
  cast(rand) {
    /**
     * Which side of the ceiling it comes down on, and therefore which way it
     * leaves. Rolling the direction separately meant half of all performances
     * hung in a corner and exited through the wall two feet away.
     */
    const perchLeft = rand() < 0.5;
    const perchFx = perchLeft ? 0.1 : 0.9;
    const goRight = perchLeft;

    return {
      duration: DURATION,
      draw({ t, p, stage, sprites, paint }) {
        const body = sprites.ba_body;
        if (!body) return;

        const scale = sizeFor(stage);
        const bodyH = body.h * scale;
        const shadow = groundShadow(paint);
        const perchX = stage.vw * perchFx;
        const perchY = 6;

        // --- descend, hanging upside down from the toes ----------------------
        if (p < DESCEND_END) {
          const u = p / DESCEND_END;
          drawRig(paint, BAT, sprites, {
            x: perchX,
            // Upside down, so the body's own centre hangs BELOW the grip point.
            y: lerp(-bodyH, perchY + bodyH * 0.5, easeOutBack(u, 1.2)),
            scale,
            rot: Math.PI,
            pose: batHang(0),
            shadow,
          });
          return;
        }

        // --- hang, settle, sleep, then wake ----------------------------------
        if (p < WAKE_END) {
          const hangT = (p - DESCEND_END) * DURATION;
          const swing = batSwing(hangT, pendulumHz(bodyH * 1.4));
          const breath = Math.sin(2 * Math.PI * 0.28 * hangT);

          const waking = p >= HANG_END;
          const u = waking ? clamp01((p - HANG_END) / (WAKE_END - HANG_END)) : 0;

          drawRig(paint, BAT, sprites, {
            x: perchX,
            y: perchY + bodyH * 0.5,
            scale,
            // Still inverted; the swing is about the grip, which the rotation
            // and the pivot together put at the top of the screen.
            rot: Math.PI + swing,
            pose: waking ? batWake(u) : batHang(breath),
            shadow,
          });
          return;
        }

        // --- flight -----------------------------------------------------------
        const u = clamp01((p - WAKE_END) / (1 - WAKE_END));
        const flyT = (p - WAKE_END) * DURATION;
        const phase = wingPhase(flyT);
        const active = flapActive(flyT);

        const w = body.w * scale;
        const exitX = goRight ? stage.vw + w * 3 : -w * 3;
        const x = lerp(perchX, exitX, u * u * (3 - 2 * u));

        // Lets go of the ceiling, swoops DOWN to a cruising height, then holds
        // it. Climbing instead put the bat above the top edge — and therefore
        // invisible — for most of the flight it was supposed to be making.
        const release = perchY + bodyH;
        const cruise = Math.max(release, stage.vh * 0.22);
        const swoop = lerp(release, cruise, easeOutCubic(Math.min(1, u * 2.5)));
        const y = swoop + 24 * (1 - active) * u + wingbeatBob(phase, 6 * active * scale);

        drawRig(paint, BAT, sprites, {
          x,
          y,
          scale,
          flip: !goRight,
          // Noses down through a glide, level while beating.
          rot: 0.08 * Math.sin(phase - Math.PI / 2) + 0.14 * (1 - active),
          pose: blendPose(batGlide, batFlap(phase, 1), active),
          shadow,
        });
      },
    };
  },
};

/**
 * The bat's contribution to the reduced-motion tableau.
 *
 * Hanging, wings wrapped, tipped a couple of degrees off plumb. A character at
 * exactly zero reads as pasted on; a small constant lean reads as one frame of
 * something alive, which is the whole job of a still that stands in for an
 * animation.
 */
export const drawBatStill = (c: Omit<ActContext, 'p' | 't'>): void => {
  const body = c.sprites.ba_body;
  if (!body) return;
  const scale = sizeFor(c.stage);
  drawRig(c.paint, BAT, c.sprites, {
    x: c.stage.vw * 0.9,
    y: 6 + body.h * scale * 0.5,
    scale,
    rot: Math.PI + 0.06,
    pose: batHang(0.4),
    shadow: groundShadow(c.paint),
  });
};
