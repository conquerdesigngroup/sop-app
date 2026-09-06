import { drawSprite } from '../../draw';
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
import type { ActContext, ActDefinition, Sprite } from '../../types';
import { groundShadow, sizeFor } from './look';

/**
 * The bat: drops in on an invisible thread, hangs under the logo, falls asleep,
 * wakes up and flies off.
 *
 * The longest act by some way, because it is four beats rather than one move,
 * and the one that most needs its timing left alone. The sleep only reads as
 * sleep because the swing before it has visibly run out of energy.
 */

const DURATION = 15;
const DESCEND_END = 0.13;
const HANG_END = 0.55;
const WAKE_END = 0.62;

/** Which wing pose the beat is currently in. Three drawn frames, one cycle. */
const wingFrame = (sprites: Record<string, Sprite>, phase: number, gliding: boolean): Sprite => {
  if (gliding) return sprites.batLevel;
  const s = Math.sin(phase);
  if (s > 0.35) return sprites.batUp;
  if (s < -0.35) return sprites.batDown;
  return sprites.batLevel;
};

export const bat: ActDefinition = {
  id: 'bat',
  layer: 'front',
  needs: ['batHang', 'batUp', 'batLevel', 'batDown'],
  cast(rand) {
    /**
     * Which side of the ceiling it comes down on, as a fraction of the width.
     *
     * It hangs from the TOP OF THE SCREEN rather than from the mark, which was
     * the first attempt. Two reasons, and the second is the real one:
     *
     *   - the mark's underside is about 27px above the theme toggle, so
     *     anything hanging from it lands on that control and STAYS there for
     *     the eight seconds of the hang. A character crossing a control while
     *     walking is fine; one parked on it is a bug.
     *   - a bat descending from the top of the screen on an invisible thread is
     *     the thing itself. The ceiling is where bats hang.
     *
     * Kept near the edges so the descent passes either side of the wordmark.
     *
     * The flight direction FOLLOWS from the side rather than being rolled
     * separately: hang on the left and it leaves to the right. Rolling the two
     * independently meant half of all performances hung in a corner and then
     * exited through the wall two feet away, wasting the entire flight beat.
     */
    const perchLeft = rand() < 0.5;
    const perchFx = perchLeft ? 0.10 : 0.90;
    const goRight = perchLeft;

    return {
      duration: DURATION,
      draw({ t, p, stage, sprites, paint }) {
        const hangSprite = sprites.batHang;
        if (!hangSprite) return;

        const scale = sizeFor(stage);
        const hangH = hangSprite.h * scale;
        const shadow = groundShadow(paint);

        // The ceiling, so this needs no page furniture at all and stages the
        // same way wherever the layer is mounted.
        const perchX = stage.vw * perchFx;
        const perchY = 6;

        // --- descend: pivot at the toes, which is what it grips with ---------
        if (p < DESCEND_END) {
          const u = p / DESCEND_END;
          // Overshoot and recoil. An arrival that merely eases in has no weight.
          const y = lerp(-hangH, perchY, easeOutBack(u, 1.2));
          drawSprite(paint, hangSprite, { x: perchX, y, scale, pivot: 'top', shadow });
          return;
        }

        // --- hang, and fall asleep ------------------------------------------
        if (p < WAKE_END) {
          const hangT = (p - DESCEND_END) * DURATION;
          const hz = pendulumHz(hangH * 0.8);
          let rot = batSwing(hangT, hz);
          // Breathing, so the sleep is still alive rather than a frozen frame.
          let sy = 1 + 0.025 * Math.sin(2 * Math.PI * 0.28 * hangT);

          if (p >= HANG_END) {
            // Waking: a jolt, then a stretch, still gripping the beam.
            const u = clamp01((p - HANG_END) / (WAKE_END - HANG_END));
            rot += 0.18 * easeOutBack(Math.min(1, u * 2.2), 2.4) * (1 - u);
            sy += 0.08 * Math.sin(Math.PI * u);
          }

          drawSprite(paint, hangSprite, {
            x: perchX,
            y: perchY,
            scale,
            sy,
            rot,
            pivot: 'top',
            shadow,
          });
          return;
        }

        // --- flight ----------------------------------------------------------
        const flySprite = wingFrame(sprites, 0, false);
        if (!flySprite) return;

        const u = clamp01((p - WAKE_END) / (1 - WAKE_END));
        const flyT = (p - WAKE_END) * DURATION;
        const phase = wingPhase(flyT);
        const active = flapActive(flyT);
        const gliding = active < 0.2;

        const w = flySprite.w * scale;
        const exitX = goRight ? stage.vw + w * 2 : -w * 2;
        // smoothstep, with the exit far enough off screen that its ease-out
        // happens where nobody can see it.
        const x = lerp(perchX, exitX, u * u * (3 - 2 * u));

        // Lets go of the ceiling, swoops DOWN to a cruising height, then holds
        // it. An earlier version climbed by a fraction of the viewport instead,
        // which put the bat above the top edge — and therefore invisible — for
        // most of the flight it was supposed to be making.
        const release = perchY + hangH * 0.5;
        const cruise = Math.max(release, stage.vh * 0.22);
        const swoop = lerp(release, cruise, easeOutCubic(Math.min(1, u * 2.5)));
        const sag = 26 * (1 - active) * u;
        const y = swoop + sag + wingbeatBob(phase, 6 * active * scale);

        // Noses down through a glide, level while beating.
        const rot = (0.10 * Math.sin(phase - Math.PI / 2) + 0.16 * (1 - active)) * (goRight ? 1 : -1);

        drawSprite(paint, wingFrame(sprites, phase, gliding), {
          x,
          y,
          scale,
          rot,
          pivot: 'center',
          flip: !goRight,
          shadow,
        });
      },
    };
  },
};

/**
 * The bat's contribution to the reduced-motion tableau.
 *
 * Hanging, and tipped a couple of degrees off vertical rather than perfectly
 * plumb. A character at exactly 0 rotation reads as pasted on; a small constant
 * lean reads as one frame of something alive — which is the whole trick of a
 * still frame that has to stand in for an animation.
 */
export const drawBatStill = (c: Omit<ActContext, 'p' | 't'>): void => {
  const sprite = c.sprites.batHang;
  if (!sprite) return;
  drawSprite(c.paint, sprite, {
    x: c.stage.vw * 0.9,
    y: 6,
    scale: sizeFor(c.stage),
    rot: 0.06,
    pivot: 'top',
    shadow: groundShadow(c.paint),
  });
};
