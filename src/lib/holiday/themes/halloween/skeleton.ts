import { drawSprite } from '../../draw';
import { lerp } from '../../ease';
import type { ActDefinition } from '../../types';
import { groundShadow, sizeFor, WALK_ART_FACES } from './look';

/**
 * The skeleton: walks the bottom edge and off the far side.
 *
 * A FOUR-FRAME CYCLE, PHASED TO THE BOUNCE
 *
 * Two things make drawn frames read as walking rather than as a slideshow, and
 * both are timing rather than art:
 *
 *   - the body rises once per STEP, which is twice per stride, so the bounce is
 *     |sin| at the stride frequency rather than sin;
 *   - the pose swap lands on the bounce MINIMUM, which is the contact — the
 *     moment a foot actually meets the ground. Swap anywhere else and four good
 *     poses look like four separate pictures.
 *
 * Speed is fixed in pixels per second and the duration is derived from it, so
 * the stride length stays believable on a 390px phone and a 1440px desktop
 * alike. A fixed duration would have it strolling on one and skating on the
 * other.
 */

const STRIDE = 0.62;
const SPEED = 74;
/**
 * However wide the window, the walk is over by here.
 *
 * At a constant 74px/s a 1440px desktop takes 23 seconds to cross, and the
 * director runs one act at a time — so the least interesting act in the set
 * would monopolise nearly half a minute of the loop. Capping trades a slightly
 * longer stride on very wide screens for a schedule that keeps moving.
 */
const MAX_DURATION = 14;
const FRAMES = ['walk0', 'walk1', 'walk2', 'walk3'] as const;

export const skeleton: ActDefinition = {
  id: 'skeleton',
  layer: 'front',
  needs: [...FRAMES],
  cast(rand, stage) {
    const goRight = rand() < 0.5;
    const width = stage.vw + 260;

    return {
      duration: Math.min(MAX_DURATION, width / SPEED),
      draw({ t, p, stage: s, sprites, paint }) {
        const scale = sizeFor(s);
        const first = sprites[FRAMES[0]];
        if (!first) return;
        const w = first.w * scale;

        const cycles = t / STRIDE;
        const frame = sprites[FRAMES[Math.floor(cycles * FRAMES.length) % FRAMES.length]];
        if (!frame) return;

        const from = goRight ? -w : s.vw + w;
        const to = goRight ? s.vw + w : -w;

        // |sin| peaks twice per stride and bottoms out at 0, 0.5 and 1 — the
        // same instants the frame index rolls over to a contact pose.
        const bounce = -3.5 * Math.abs(Math.sin(Math.PI * 2 * cycles * 0.5));

        // Loose bones: a short decaying jitter fired on each contact.
        const sinceContact = (cycles * 2) % 1;
        const rattle =
          sinceContact < 0.12 ? Math.sin(sinceContact * 90) * (1 - sinceContact / 0.12) : 0;

        drawSprite(paint, frame, {
          x: lerp(from, to, p),
          // Feet a shade past the bottom edge. Low enough to pass under the
          // mono caption rather than through it, high enough that the legs —
          // which are the entire read of a walk — stay on screen.
          y: s.vh - 2 + bounce + rattle,
          scale,
          rot: 0.045 * Math.sin(Math.PI * 2 * cycles),
          pivot: 'bottom',
          flip: goRight ? WALK_ART_FACES === 'left' : WALK_ART_FACES === 'right',
          shadow: groundShadow(paint),
        });
      },
    };
  },
};
