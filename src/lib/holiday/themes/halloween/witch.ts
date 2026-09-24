import { drawGlow, drawSprite } from '../../draw';
import { clamp, lerp, smoothstep } from '../../ease';
import type { ActDefinition } from '../../types';
import { groundShadow, sizeFor } from './look';

/**
 * The witch: crosses the screen on a broom in six seconds.
 *
 * SHE IS FRAMES, AND THE FRAMES CAME OFF A RIG
 *
 * The source is a 3D model with a full Rigify armature. It shipped with no
 * animation clip AND with its hat, broom and most of its individual bones
 * parented to the armature OBJECT rather than to any bone — so posing it slid
 * the skull out of its own hat and left her sitting beside her broom.
 *
 * Those twenty loose pieces were bone-parented in Blender first (each Skeleton
 * part to the deform bone it was modelled on, the hat to the head, the broom to
 * the spine), and only then was a flight cycle posed and baked: the body sways
 * and pitches from the torso, the head looks around against that sway, and the
 * legs trail and kick. The chest is deliberately left still, because her arms
 * hang off it and the broom does not — rotating it slides her hands off the
 * handle, which is the same bug the binding pass fixed, from the other end.
 *
 * Every curve is a sine in the loop parameter, so the cycle is seamless and can
 * run under a crossing of any length. It plays on the canvas as eight frames
 * because that is all a rig ever has to be at 100px — the rig earned its keep
 * at bake time, which is the cheapest place for it to.
 */

const DURATION = 6;
/** Seconds per loop of the body cycle. */
const CYCLE = 0.95;
const FRAMES = ['wi_fly0', 'wi_fly1', 'wi_fly2', 'wi_fly3',
                'wi_fly4', 'wi_fly5', 'wi_fly6', 'wi_fly7'] as const;
/** Waves across the crossing. Under one reads as a straight line with a sag. */
const WAVES = 1.5;

export const witch: ActDefinition = {
  id: 'witch',
  layer: 'front',
  needs: [...FRAMES],
  cast(rand) {
    const goRight = rand() < 0.5;
    /** Height of the crossing, as a fraction of the viewport. */
    const lane = 0.2 + rand() * 0.16;
    const swell = 0.06 + rand() * 0.05;
    const phase = rand() * Math.PI * 2;
    const frameOffset = Math.floor(rand() * FRAMES.length);

    return {
      duration: DURATION,
      draw({ t, p, stage, sprites, paint }) {
        const frame =
          sprites[FRAMES[(Math.floor((t / CYCLE) * FRAMES.length) + frameOffset) % FRAMES.length]];
        if (!frame) return;

        const scale = sizeFor(stage);
        const w = frame.w * scale;

        // Eased past both edges, so she is already at speed when she appears
        // and does not decelerate on screen.
        const u = clamp((p - 0.02) / 0.96, 0, 1);
        const x = lerp(
          goRight ? -w * 1.4 : stage.vw + w * 1.4,
          goRight ? stage.vw + w * 1.4 : -w * 1.4,
          u
        );

        const y = stage.vh * (lane + swell * Math.sin(Math.PI * 2 * WAVES * u + phase));

        // Analytic dy/du, so the nose follows the path she is actually on and
        // stays right if the path is ever retuned.
        const dy =
          stage.vh * swell * Math.PI * 2 * WAVES * Math.cos(Math.PI * 2 * WAVES * u + phase);
        const tilt = clamp(dy / (stage.vw * 1.6), -0.5, 0.5);

        // A faint warm wake, brightest mid-crossing. She is the only character
        // that gets one; she is also the only one arriving at speed.
        const presence = smoothstep(0, 0.12, u) * (1 - smoothstep(0.88, 1, u));
        drawGlow(
          paint,
          x - (goRight ? w * 0.5 : -w * 0.5),
          y + frame.h * scale * 0.18,
          w * 0.7,
          paint.palette.glow,
          (paint.mode === 'dark' ? 0.16 : 0.08) * presence,
          paint.mode === 'dark'
        );

        drawSprite(paint, frame, {
          x,
          y,
          scale,
          rot: tilt * 0.6 * (goRight ? 1 : -1),
          pivot: 'center',
          flip: !goRight,
          shadow: groundShadow(paint),
        });
      },
    };
  },
};
