import { drawSprite } from './draw';
import type { Paint, Sprite } from './types';

/**
 * A cutout puppet: separate pieces of art hung off a bone hierarchy.
 *
 * WHY THIS EXISTS
 *
 * The first version of this layer flipped between whole-body frames — three
 * drawn wing poses for the bat, four for the skeleton's walk — and moved them
 * with position, rotation and scale. That is a flipbook, and it shows: a wing
 * cannot articulate if it is a rectangle being swapped, and a zombie whose arms
 * are baked into one image cannot reach for anything.
 *
 * Here each character is drawn once, in pieces, and assembled at runtime. An
 * action is then a set of JOINT ANGLES over time, which means the same art can
 * walk, reach, wave, flap, stagger or come apart without anyone drawing
 * another frame. Adding a new action is a function, not a render.
 *
 * WHAT A BONE IS
 *
 * Two points do all the work:
 *
 *   pivot  — the joint on THIS piece. The shoulder end of an upper arm. The
 *            piece rotates about it.
 *   socket — where on the PARENT's art this joint sits. The shoulder on the
 *            torso.
 *
 * Both are fractions of their sprite's box (0,0 top-left to 1,1 bottom-right),
 * so they survive the art being re-rendered at another size, which it has been
 * once already.
 *
 * `z` is painting order and is independent of the hierarchy — the far arm is a
 * child of the torso but must paint behind it, which a tree walk alone will
 * never give you.
 */

export interface BoneDef {
  name: string;
  /** Omitted for the root. */
  parent?: string;
  /** Sprite key. A bone without one is a pure transform node. */
  sprite?: string;
  /** Where this joint sits on the parent's art. Ignored on the root. */
  socket?: readonly [number, number];
  /** The joint on this bone's own art — the point it rotates about. */
  pivot?: readonly [number, number];
  /** Painting order, low to high. Independent of the hierarchy. */
  z: number;
  /** Resting angle in radians, before any pose is applied. */
  rest?: number;
  /** Multiplied into the sprite's alpha — the far limbs sit back a little. */
  alpha?: number;
  /**
   * Mirror this bone AND everything below it.
   *
   * One drawn wing serves both sides of a bat, one drawn arm both sides of a
   * zombie. The mirror is part of the transform rather than a draw-time flag,
   * so a mirrored shoulder's child elbow lands on the correct side without any
   * per-bone bookkeeping — see the `sign` in place().
   */
  flip?: boolean;
}

/** Bone name to angle DELTA in radians, added to that bone's rest angle. */
export type Pose = Readonly<Record<string, number>>;

export interface Rig {
  bones: readonly BoneDef[];
  /** The bone whose pivot the whole rig is positioned by, usually the feet. */
  root: string;
}

export interface RigOptions {
  x: number;
  y: number;
  scale?: number;
  /** Mirror the whole puppet — walking the other way. */
  flip?: boolean;
  /** Rotate the whole puppet about (x, y) — a body tipping or tumbling. */
  rot?: number;
  pose?: Pose;
  alpha?: number;
  shadow?: { color: string; blur: number; offsetY: number } | null;
}

interface Placed {
  def: BoneDef;
  x: number;
  y: number;
  rot: number;
  /** +1 upright, -1 mirrored. Inherited, so a subtree mirrors as one piece. */
  sign: number;
}

/**
 * Resolve every bone to a position, angle and handedness in rig-local space.
 *
 * The mirror is carried through the recursion as a SIGN rather than applied
 * afterwards, because it has to compose: the whole rig can face left while a
 * single wing inside it is also mirrored, and those two flips must cancel. A
 * sign multiplied into every x offset and every angle does that for free, where
 * a flag checked at draw time does not.
 */
const place = (rig: Rig, sprites: Record<string, Sprite>, pose: Pose, rootSign: number) => {
  const byName = new Map(rig.bones.map((b) => [b.name, b]));
  const out = new Map<string, Placed>();

  const resolve = (name: string, guard: number): Placed | null => {
    const cached = out.get(name);
    if (cached) return cached;

    const def = byName.get(name);
    // A cycle would recurse forever. Bone trees are hand-written, so this is a
    // typo guard rather than a real condition.
    if (!def || guard > 32) return null;

    const angle = (def.rest ?? 0) + (pose[name] ?? 0);

    if (!def.parent) {
      const sign = rootSign * (def.flip ? -1 : 1);
      const placed: Placed = { def, x: 0, y: 0, rot: angle * sign, sign };
      out.set(name, placed);
      return placed;
    }

    const parent = resolve(def.parent, guard + 1);
    if (!parent) return null;

    // The socket, expressed relative to the PARENT's own pivot, because that is
    // the point the parent's art is drawn around.
    const ps = parent.def.sprite ? sprites[parent.def.sprite] : undefined;
    const pPivot = parent.def.pivot ?? [0.5, 0.5];
    const socket = def.socket ?? [0.5, 0.5];
    const ox = ps ? (socket[0] - pPivot[0]) * ps.w * parent.sign : 0;
    const oy = ps ? (socket[1] - pPivot[1]) * ps.h : 0;

    const c = Math.cos(parent.rot);
    const s = Math.sin(parent.rot);
    // The bone's OWN sign drives its angle, the PARENT's drives the socket
    // offset. The distinction matters and is easy to miss: the socket is a
    // point on the parent's (possibly mirrored) art, but the rotation belongs
    // to this bone, so a flipped left wing must swing opposite its unflipped
    // right twin even though both are handed the same angle. Using the
    // parent's sign for both put the zombie's far arm through its own chest.
    const sign = parent.sign * (def.flip ? -1 : 1);
    const placed: Placed = {
      def,
      x: parent.x + ox * c - oy * s,
      y: parent.y + ox * s + oy * c,
      rot: parent.rot + angle * sign,
      sign,
    };
    out.set(name, placed);
    return placed;
  };

  rig.bones.forEach((b) => resolve(b.name, 0));
  return out;
};

/**
 * Draw an assembled puppet.
 *
 * (x, y) names the ROOT bone's pivot, so a rig positioned at a tile's top edge
 * stands on it however its limbs happen to be arranged that frame.
 */
export const drawRig = (
  paint: Paint,
  rig: Rig,
  sprites: Record<string, Sprite>,
  o: RigOptions
): void => {
  const scale = o.scale ?? 1;
  const placed = place(rig, sprites, o.pose ?? {}, o.flip ? -1 : 1);

  // Applied on top of the resolved rig, so a whole body can tip or tumble
  // without disturbing the gait underneath it.
  const rootRot = o.rot ?? 0;
  const cr = Math.cos(rootRot);
  const sr = Math.sin(rootRot);

  rig.bones
    .filter((b) => b.sprite && sprites[b.sprite]?.img)
    .slice()
    .sort((a, b) => a.z - b.z)
    .forEach((def) => {
      const p = placed.get(def.name);
      if (!p) return;

      const lx = p.x * scale;
      const ly = p.y * scale;

      drawSprite(paint, sprites[def.sprite as string], {
        x: o.x + lx * cr - ly * sr,
        y: o.y + lx * sr + ly * cr,
        rot: p.rot + rootRot,
        scale,
        flip: p.sign < 0,
        pivot: def.pivot ?? [0.5, 0.5],
        alpha: (o.alpha ?? 1) * (def.alpha ?? 1),
        shadow: o.shadow,
      });
    });
};

/** Blend two poses. `k` of 0 is all `a`, 1 is all `b`. */
export const blendPose = (a: Pose, b: Pose, k: number): Pose => {
  const out: Record<string, number> = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach((n) => {
    out[n] = (a[n] ?? 0) + ((b[n] ?? 0) - (a[n] ?? 0)) * k;
  });
  return out;
};

/** Add poses together — a breath laid over a walk, a flinch over a stagger. */
export const addPose = (...poses: Pose[]): Pose => {
  const out: Record<string, number> = {};
  poses.forEach((p) => {
    Object.entries(p).forEach(([n, v]) => {
      out[n] = (out[n] ?? 0) + v;
    });
  });
  return out;
};
