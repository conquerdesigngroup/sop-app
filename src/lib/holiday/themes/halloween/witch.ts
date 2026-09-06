import { drawGlow, drawSprite } from '../../draw';
import { clamp, lerp, smoothstep } from '../../ease';
import type { ActDefinition, Sprite } from '../../types';
import { groundShadow, sizeFor } from './look';

/**
 * The witch: crosses the screen on a broom in six seconds.
 *
 * WHY THIS ONE IS NOT A RIG
 *
 * The source is a 3D model with a full Rigify armature, but it carries no
 * animation clip, and — the part that actually decides it — its hat and broom
 * are plain scene meshes that were never parented to that armature. Posing a
 * bone slides the skull out of its own hat. So the body is baked in its rest
 * pose and the life comes from the flight instead.
 *
 * What the 3D source IS used for is the thing a flat sprite genuinely cannot
 * do: three BANK angles, rendered by rolling the whole assembly about its line
 * of flight, so leaning into a climb shows the underside of the broom and the
 * hat brim from below. Rotating a 2D image is free and looks like a rotating
 * 2D image; this looks like a body turning.
 *
 * The bank is chosen from the path's own vertical velocity rather than from a
 * timer, so the lean always agrees with where she is actually going.
 */

const DURATION = 6;
/** Waves across the crossing. Under one reads as a straight line with a sag. */
const WAVES = 1.5;

export const witch: ActDefinition = {
  id: 'witch',
  layer: 'front',
  needs: ['wi_bankL', 'wi_level', 'wi_bankR'],
  cast(rand) {
    const goRight = rand() < 0.5;
    /** Height of the crossing, as a fraction of the viewport. */
    const lane = 0.2 + rand() * 0.16;
    const swell = 0.06 + rand() * 0.05;
    const phase = rand() * Math.PI * 2;

    return {
      duration: DURATION,
      draw({ t, p, stage, sprites, paint }) {
        const level = sprites.wi_level;
        if (!level) return;

        const scale = sizeFor(stage);
        const w = level.w * scale;

        // Eased in and out past the edges, so she is already at speed when she
        // appears and does not decelerate on screen.
        const u = clamp((p - 0.02) / 0.96, 0, 1);
        const x = lerp(goRight ? -w * 1.4 : stage.vw + w * 1.4, goRight ? stage.vw + w * 1.4 : -w * 1.4, u);

        const wave = (k: number) => Math.sin(Math.PI * 2 * WAVES * k + phase);
        const y = stage.vh * (lane + swell * wave(u));

        // Analytic dy/du, so the lean is derived from the path rather than
        // guessed at — and stays correct if the path is ever retuned.
        const dy = stage.vh * swell * Math.PI * 2 * WAVES * Math.cos(Math.PI * 2 * WAVES * u + phase);
        const tilt = clamp(dy / (stage.vw * 1.6), -0.5, 0.5);

        // Climbing rolls one way, diving the other. Mirrored with the flight
        // direction so a leftward crossing banks into its own turns.
        const bankAmount = clamp(tilt * 2.2, -1, 1) * (goRight ? 1 : -1);
        const frame: Sprite =
          bankAmount < -0.33
            ? sprites.wi_bankL
            : bankAmount > 0.33
              ? sprites.wi_bankR
              : sprites.wi_level;
        if (!frame) return;

        // A faint warm wake, brightest mid-crossing. She is the only character
        // that gets one; she is also the only one arriving at speed.
        const presence = smoothstep(0, 0.12, u) * (1 - smoothstep(0.88, 1, u));
        drawGlow(
          paint,
          x - (goRight ? w * 0.5 : -w * 0.5),
          y + level.h * scale * 0.18,
          w * 0.7,
          paint.palette.glow,
          (paint.mode === 'dark' ? 0.16 : 0.08) * presence,
          paint.mode === 'dark'
        );

        drawSprite(paint, frame, {
          x,
          y,
          scale,
          // Nose follows the path. Small — the bank frames carry most of it.
          rot: tilt * 0.5 * (goRight ? 1 : -1),
          pivot: 'center',
          flip: !goRight,
          shadow: groundShadow(paint),
        });
      },
    };
  },
};
