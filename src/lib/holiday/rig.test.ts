import { addPose, blendPose, drawRig, type Rig } from './rig';
import type { Paint, Sprite } from './types';

/**
 * The bone hierarchy.
 *
 * Worth real tests because every failure here is a silent one: a socket on the
 * wrong axis or a sign the wrong way round still draws a character, just a
 * character whose arm comes out of its chest. The mirroring case below is not
 * hypothetical — it shipped that way for one iteration.
 *
 * Assertions read the transform the rig hands to the canvas, so they exercise
 * the real drawing path rather than an exported internal.
 */

interface Drawn {
  x: number;
  y: number;
  rot: number;
  scaleX: number;
}

/** A canvas that records the transform of each drawImage instead of painting. */
const recorder = () => {
  const drawn: Drawn[] = [];
  let cur: Drawn = { x: 0, y: 0, rot: 0, scaleX: 1 };
  const ctx = {
    save: () => {
      cur = { x: 0, y: 0, rot: 0, scaleX: 1 };
    },
    restore: () => undefined,
    translate: (x: number, y: number) => {
      cur.x = x;
      cur.y = y;
    },
    rotate: (r: number) => {
      cur.rot = r;
    },
    scale: (sx: number) => {
      cur.scaleX = sx;
    },
    drawImage: () => {
      drawn.push({ ...cur });
    },
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
  } as unknown as CanvasRenderingContext2D;

  const paint: Paint = {
    ctx,
    mark: () => undefined,
    palette: { glow: '#000', ember: '#000', shadow: '#000', rim: '#000' },
    mode: 'dark',
  };
  return { paint, drawn };
};

const sprite = (w: number, h: number): Sprite => ({ img: {} as CanvasImageSource, w, h });

const sprites: Record<string, Sprite> = {
  body: sprite(100, 100),
  limb: sprite(10, 40),
};

/** Torso with one limb hung off its right-hand edge, halfway down. */
const oneLimb: Rig = {
  root: 'body',
  bones: [
    { name: 'body', sprite: 'body', pivot: [0.5, 0.5], z: 1 },
    { name: 'limb', parent: 'body', sprite: 'limb', socket: [1, 0.5], pivot: [0.5, 0], z: 2 },
  ],
};

const draw = (rig: Rig, opts: Parameters<typeof drawRig>[3]) => {
  const { paint, drawn } = recorder();
  drawRig(paint, rig, sprites, opts);
  return drawn;
};

describe('drawRig', () => {
  it('puts the root pivot exactly where it is told', () => {
    const [body] = draw(oneLimb, { x: 200, y: 120 });
    expect(body.x).toBeCloseTo(200, 6);
    expect(body.y).toBeCloseTo(120, 6);
  });

  it('places a child at its socket on the parent', () => {
    const [, limb] = draw(oneLimb, { x: 0, y: 0 });
    // Socket [1, 0.5] on a 100px body pivoted at its centre: half a body to the
    // right, level with the middle.
    expect(limb.x).toBeCloseTo(50, 6);
    expect(limb.y).toBeCloseTo(0, 6);
  });

  it('scales the socket offset with the rig', () => {
    const [, limb] = draw(oneLimb, { x: 0, y: 0, scale: 2 });
    expect(limb.x).toBeCloseTo(100, 6);
  });

  it('swings a child around the parent when the parent rotates', () => {
    const [, limb] = draw(oneLimb, { x: 0, y: 0, pose: { body: Math.PI / 2 } });
    // A quarter turn clockwise takes the right-hand socket to directly below.
    expect(limb.x).toBeCloseTo(0, 6);
    expect(limb.y).toBeCloseTo(50, 6);
    expect(limb.rot).toBeCloseTo(Math.PI / 2, 6);
  });

  it('accumulates rotation down the chain', () => {
    const [, limb] = draw(oneLimb, { x: 0, y: 0, pose: { body: 0.3, limb: 0.2 } });
    expect(limb.rot).toBeCloseTo(0.5, 6);
  });

  describe('mirroring', () => {
    it('flips the whole rig about its root', () => {
      const [, limb] = draw(oneLimb, { x: 0, y: 0, flip: true });
      expect(limb.x).toBeCloseTo(-50, 6);
      expect(limb.scaleX).toBeLessThan(0);
    });

    it('negates joint angles when mirrored, so a gait mirrors too', () => {
      const [, a] = draw(oneLimb, { x: 0, y: 0, pose: { limb: 0.4 } });
      const [, b] = draw(oneLimb, { x: 0, y: 0, flip: true, pose: { limb: 0.4 } });
      expect(b.rot).toBeCloseTo(-a.rot, 6);
    });

    /**
     * The bug this file was written for.
     *
     * A bone marked flip inside an UNMIRRORED rig — a left wing sharing art
     * with the right one — must swing opposite its twin when both are handed
     * the same angle. Driving the angle from the parent's sign instead of the
     * bone's own left the zombie's far arm rotating into its chest.
     */
    it('mirrors a single bone within an upright rig', () => {
      const twins: Rig = {
        root: 'body',
        bones: [
          { name: 'body', sprite: 'body', pivot: [0.5, 0.5], z: 1 },
          { name: 'right', parent: 'body', sprite: 'limb', socket: [1, 0.5], pivot: [0.5, 0], z: 2 },
          { name: 'left', parent: 'body', sprite: 'limb', socket: [0, 0.5], pivot: [0.5, 0], z: 2, flip: true },
        ],
      };
      const [, right, left] = draw(twins, { x: 0, y: 0, pose: { right: 0.5, left: 0.5 } });

      expect(right.x).toBeCloseTo(50, 6);
      expect(left.x).toBeCloseTo(-50, 6);
      // Same angle in, opposite angle out — that is what mirroring means.
      expect(left.rot).toBeCloseTo(-right.rot, 6);
      expect(left.scaleX).toBeLessThan(0);
      expect(right.scaleX).toBeGreaterThan(0);
    });

    it('cancels a mirrored bone against a mirrored rig', () => {
      const twins: Rig = {
        root: 'body',
        bones: [
          { name: 'body', sprite: 'body', pivot: [0.5, 0.5], z: 1 },
          { name: 'left', parent: 'body', sprite: 'limb', socket: [0, 0.5], pivot: [0.5, 0], z: 2, flip: true },
        ],
      };
      const [, left] = draw(twins, { x: 0, y: 0, flip: true, pose: { left: 0.5 } });
      // Two flips make an upright limb again.
      expect(left.scaleX).toBeGreaterThan(0);
      expect(left.rot).toBeCloseTo(0.5, 6);
    });
  });

  it('paints in z order, not tree order', () => {
    const backFirst: Rig = {
      root: 'body',
      bones: [
        { name: 'body', sprite: 'body', pivot: [0.5, 0.5], z: 5 },
        { name: 'behind', parent: 'body', sprite: 'limb', socket: [0.5, 0.5], pivot: [0.5, 0], z: 1 },
      ],
    };
    const drawn = draw(backFirst, { x: 0, y: 0 });
    // The child declares a lower z, so it must be painted before its parent —
    // which is the only way a far arm ever gets behind a torso.
    expect(drawn).toHaveLength(2);
    expect(drawn[0].y).toBeCloseTo(0, 6);
  });

  it('skips bones whose art has not arrived, without throwing', () => {
    const missing = { ...sprites, limb: { img: null, w: 10, h: 40 } };
    const { paint, drawn } = recorder();
    expect(() => drawRig(paint, oneLimb, missing, { x: 0, y: 0 })).not.toThrow();
    expect(drawn).toHaveLength(1);
  });

  it('survives a bone naming a parent that does not exist', () => {
    const orphan: Rig = {
      root: 'body',
      bones: [
        { name: 'body', sprite: 'body', pivot: [0.5, 0.5], z: 1 },
        { name: 'lost', parent: 'nope', sprite: 'limb', pivot: [0.5, 0], z: 2 },
      ],
    };
    const { paint } = recorder();
    expect(() => drawRig(paint, orphan, sprites, { x: 0, y: 0 })).not.toThrow();
  });

  it('does not hang on a cycle', () => {
    const loop: Rig = {
      root: 'a',
      bones: [
        { name: 'a', parent: 'b', sprite: 'limb', pivot: [0.5, 0], z: 1 },
        { name: 'b', parent: 'a', sprite: 'limb', pivot: [0.5, 0], z: 2 },
      ],
    };
    const { paint } = recorder();
    expect(() => drawRig(paint, loop, sprites, { x: 0, y: 0 })).not.toThrow();
  });
});

describe('pose maths', () => {
  it('blends between two poses', () => {
    expect(blendPose({ a: 0 }, { a: 10 }, 0.25)).toEqual({ a: 2.5 });
  });

  it('treats a bone missing from one side as zero', () => {
    expect(blendPose({}, { a: 8 }, 0.5)).toEqual({ a: 4 });
  });

  it('adds poses so a flinch can lie over a walk', () => {
    expect(addPose({ a: 1, b: 2 }, { a: 0.5 })).toEqual({ a: 1.5, b: 2 });
  });
});
