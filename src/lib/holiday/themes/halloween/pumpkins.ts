import { drawContactShadow, drawGlow, drawSprite } from '../../draw';
import { flicker, flickerPhases, FLICKER_STILL, type FlickerPhases } from '../../ease';
import { mulberry32 } from '../../rng';
import type { Ambient, ActContext } from '../../types';

/**
 * The jack-o'-lanterns along the bottom edge. Atmosphere, not a performance —
 * always on, never scheduled, no beginning and no end.
 *
 * THE SPRITE IS DRAWN AT CONSTANT ALPHA
 *
 * A physical object does not flicker. The light it throws does. Pulsing the
 * pumpkin's own opacity is the obvious implementation and it looks like a
 * failing lightbulb; pulsing only the glow beneath it looks like a candle.
 *
 * They sit slightly BELOW the bottom edge so they read as resting on a floor
 * the screen happens to crop, rather than as stickers placed near the bottom.
 *
 * Phases come from a fixed seed. Which candle is ahead of which is not
 * something anybody should be able to notice varying between visits, and a
 * constant seed means the still frame is reproducible for tests.
 */

const seeded = mulberry32(0x9e3779b9);

interface Lantern {
  /** Fraction of viewport width. */
  fx: number;
  scale: number;
  flip: boolean;
  phases: FlickerPhases;
}

/**
 * A lone lantern to one side and a pair to the other reads as placed; three at
 * even spacing reads as a repeating background tile. On a phone there is only
 * room for the pair of outliers.
 */
const LANTERNS: Lantern[] = [
  { fx: 0.08, scale: 1.0, flip: false, phases: flickerPhases(seeded) },
  { fx: 0.85, scale: 0.78, flip: true, phases: flickerPhases(seeded) },
  { fx: 0.95, scale: 0.92, flip: false, phases: flickerPhases(seeded) },
];

const visible = (compact: boolean): Lantern[] =>
  compact ? [LANTERNS[0], LANTERNS[2]] : LANTERNS;

const paintOne = (c: Omit<ActContext, 'p'>, l: Lantern, level: number): void => {
  const { stage, paint } = c;
  const sprite = c.sprites.pumpkin;
  if (!sprite) return;

  const scale = l.scale * (stage.compact ? 0.74 : 1);
  const h = sprite.h * scale;
  const x = stage.vw * l.fx;
  // Sunk a little past the bottom edge — seated on a floor, not sitting on a line.
  const y = stage.vh + h * 0.16;
  const dark = paint.mode === 'dark';

  // Light mode gets the grounding from a shadow instead of from bloom, which
  // does almost nothing over chalk. Drawn first so the pumpkin sits on it.
  if (!dark) {
    drawContactShadow(paint, x, y - h * 0.04, sprite.w * scale * 0.82, paint.palette.shadow, 0.22);
  }

  // Bloom sells dark, shadow sells light. Additive glow over the near-black
  // void is the candle; the same glow over #F4F4F5 is a peach smudge, so in
  // light mode it pulls right back to a hint of warmth around the base and the
  // contact shadow above does the grounding instead.
  drawGlow(
    paint,
    x,
    y - h * 0.42,
    sprite.w * scale * (dark ? 1.5 + 0.12 * level : 1.02 + 0.07 * level),
    paint.palette.glow,
    (dark ? 0.5 : 0.15) * level,
    dark
  );

  drawSprite(paint, sprite, { x, y, scale, pivot: 'bottom', flip: l.flip });

  // The carved face, lit from inside. Small, hot, and over the sprite.
  drawGlow(
    paint,
    x,
    y - h * 0.46,
    sprite.w * scale * 0.3,
    paint.palette.ember,
    (dark ? 0.5 : 0.28) * level,
    dark
  );
};

export const pumpkins: Ambient = {
  layer: 'behind',
  needs: ['pumpkin'],
  draw(c) {
    visible(c.stage.compact).forEach((l) => paintOne(c, l, flicker(c.t, l.phases)));
  },
};

/** The same lanterns at a fixed, good-looking level, for the reduced-motion frame. */
export const drawPumpkinsStill = (c: Omit<ActContext, 'p' | 't'>): void => {
  visible(c.stage.compact).forEach((l) => paintOne({ ...c, t: 0 }, l, FLICKER_STILL));
};
