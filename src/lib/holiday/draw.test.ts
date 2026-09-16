import { spriteBounds } from './draw';
import type { Sprite } from './types';

/**
 * The dirty box a sprite reports.
 *
 * This governs what gets ERASED next frame, so an undersized or misplaced box
 * does not throw or look broken in a still — it leaves the previous frame's
 * pixels on the canvas and smears the character across the page as it moves.
 * The failure is only ever visible in motion, which is exactly why it needs a
 * test rather than an eye.
 */

const sprite = (w: number, h: number): Sprite => ({ img: {} as CanvasImageSource, w, h });

/** Does the reported box actually contain the four corners of the drawn quad? */
const containsQuad = (
  box: { x: number; y: number; w: number; h: number },
  corners: Array<[number, number]>
) =>
  corners.every(
    ([x, y]) =>
      x >= box.x - 1e-6 &&
      x <= box.x + box.w + 1e-6 &&
      y >= box.y - 1e-6 &&
      y <= box.y + box.h + 1e-6
  );

/** Where the sprite's corners actually land, mirroring drawSprite's transform. */
const drawnCorners = (
  s: Sprite,
  o: { x: number; y: number; pivot: readonly [number, number]; flip?: boolean; rot?: number }
) => {
  const sx = o.flip ? -1 : 1;
  const rot = o.rot ?? 0;
  const ox = -o.pivot[0] * s.w;
  const oy = -o.pivot[1] * s.h;
  return [
    [ox, oy],
    [ox + s.w, oy],
    [ox, oy + s.h],
    [ox + s.w, oy + s.h],
  ].map(([lx, ly]) => {
    const px = lx * sx;
    return [
      o.x + px * Math.cos(rot) - ly * Math.sin(rot),
      o.y + px * Math.sin(rot) + ly * Math.cos(rot),
    ] as [number, number];
  });
};

describe('spriteBounds', () => {
  const s = sprite(40, 20);

  it('covers a plain centred sprite', () => {
    const o = { x: 100, y: 100, pivot: [0.5, 0.5] as const };
    expect(containsQuad(spriteBounds(s, o), drawnCorners(s, o))).toBe(true);
  });

  it('covers a sprite pivoted off its own midline', () => {
    const o = { x: 100, y: 100, pivot: [0.1, 0.42] as const };
    expect(containsQuad(spriteBounds(s, o), drawnCorners(s, o))).toBe(true);
  });

  /**
   * The regression. A mirrored sprite with an off-midline pivot lands on the
   * OTHER side of that pivot, and a box computed without the flip covers empty
   * canvas while the art is never cleared. Every rig bone has an off-midline
   * pivot and half of them are mirrored, so this was every left-hand limb.
   *
   * It stayed hidden before the rig because 'center', 'top' and 'bottom' all
   * put the pivot on the midline, where the sign cancels and cannot be seen.
   */
  it('covers a MIRRORED sprite pivoted off its midline', () => {
    const o = { x: 100, y: 100, pivot: [0.1, 0.42] as const, flip: true };
    expect(containsQuad(spriteBounds(s, o), drawnCorners(s, o))).toBe(true);
  });

  it('covers mirrored and rotated together, at a range of angles', () => {
    for (let i = 0; i < 24; i += 1) {
      const o = {
        x: 100,
        y: 100,
        pivot: [0.1, 0.42] as const,
        flip: true,
        rot: (i / 24) * Math.PI * 2,
      };
      expect(containsQuad(spriteBounds(s, o), drawnCorners(s, o))).toBe(true);
    }
  });

  it('puts a mirrored sprite on the opposite side of its pivot', () => {
    const base = { x: 100, y: 100, pivot: [0.1, 0.5] as const };
    const upright = spriteBounds(s, base);
    const mirrored = spriteBounds(s, { ...base, flip: true });
    // Pivot near the left edge: upright the art extends right, mirrored left.
    expect(upright.x + upright.w).toBeGreaterThan(base.x);
    expect(mirrored.x).toBeLessThan(base.x);
    expect(mirrored.x).not.toBeCloseTo(upright.x, 3);
  });

  it('grows the box to take a drop shadow in', () => {
    const o = { x: 100, y: 100, pivot: [0.5, 0.5] as const };
    const plain = spriteBounds(s, o);
    const shadowed = spriteBounds(s, { ...o, shadow: { color: '#000', blur: 10, offsetY: 4 } });
    expect(shadowed.w).toBeGreaterThan(plain.w);
    expect(shadowed.h).toBeGreaterThan(plain.h);
  });
});
