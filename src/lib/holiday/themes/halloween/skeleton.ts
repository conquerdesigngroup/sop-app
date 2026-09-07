import { clamp01, lerp } from '../../ease';
import { addPose, drawRig } from '../../rig';
import type { ActDefinition } from '../../types';
import { groundShadow, sizeFor } from './look';
import { skeletonBob, skeletonWalk, skeletonWave } from './poses';
import { SKELETON } from './rigs';

/**
 * The skeleton: walks the bottom edge, stops halfway to wave, walks off.
 *
 * The wave is the reason the rig exists. It is not a second set of art, or a
 * second act — it is the walk cycle held still while one arm does something
 * else, which is three lines here and would have been eleven more drawn frames
 * before.
 *
 * Speed is fixed in px/s and duration derived from it, so the stride stays
 * believable from a 390px phone to a 1440px desktop.
 */

const STRIDE = 0.62;
const SPEED = 74;
/**
 * However wide the window, the walk is over by here.
 *
 * The director runs one act at a time, and at a constant pace a 1440px desktop
 * would take 23 seconds to cross — half a minute of the loop given over to the
 * quietest act in the set.
 */
const MAX_DURATION = 15;

/** Where in the crossing it stops to wave, and for how long. */
const WAVE_AT = 0.42;
const WAVE_FOR = 0.22;

export const skeleton: ActDefinition = {
  id: 'skeleton',
  layer: 'front',
  needs: ['sk_skull', 'sk_ribs', 'sk_pelvis', 'sk_upperArm', 'sk_foreArm', 'sk_thigh', 'sk_shin'],
  cast(rand, stage) {
    const goRight = rand() < 0.5;
    const waves = rand() < 0.7;
    const width = stage.vw + 220;

    return {
      duration: Math.min(MAX_DURATION, width / SPEED),
      draw({ t, p, stage: s, sprites, paint }) {
        const scale = sizeFor(s);

        // The pause: horizontal progress stalls across the wave, so the
        // character stops where it stands rather than sliding through it.
        const waveU = waves ? clamp01((p - WAVE_AT) / WAVE_FOR) : 0;
        const halted = waves ? Math.min(p, WAVE_AT) + Math.max(0, p - WAVE_AT - WAVE_FOR) : p;
        const travel = waves ? halted / (1 - WAVE_FOR) : p;

        // The gait freezes while waving, so the legs hold a standing pose
        // instead of marching on the spot.
        const moving = waves ? 1 - Math.sin(Math.PI * waveU) : 1;
        const phase = (travel * (width / SPEED)) / STRIDE;

        const walk = skeletonWalk(phase);
        const pose =
          waveU > 0 && waveU < 1
            ? addPose(
                Object.fromEntries(
                  Object.entries(walk).map(([k, v]) => [k, v * moving])
                ),
                skeletonWave(waveU)
              )
            : walk;

        const foot = s.vh - 2;
        const hipHeight = 40 * scale;

        drawRig(paint, SKELETON, sprites, {
          x: lerp(goRight ? -60 : s.vw + 60, goRight ? s.vw + 60 : -60, travel),
          y: foot - hipHeight + skeletonBob(phase) * moving * scale,
          scale,
          flip: !goRight,
          pose,
          shadow: groundShadow(paint),
        });
      },
    };
  },
};
