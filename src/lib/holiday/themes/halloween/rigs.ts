import type { Rig } from '../../rig';

/**
 * The three puppets: which piece hangs off which, and where the joints are.
 *
 * READING A BONE
 *
 *   pivot  — the joint on THIS piece, as a fraction of its own art.
 *   socket — where that joint sits on the PARENT's art.
 *   z      — painting order, independent of the hierarchy. The far arm is a
 *            child of the torso and must paint BEHIND it, which no tree walk
 *            gives you.
 *
 * The near/far pairs are the same drawn piece used twice, the far one dimmer
 * and behind. That is the whole trick that makes a side-view walk read in
 * three dimensions from flat art.
 *
 * The elbow and knee fractions came out of the limb splitter rather than being
 * eyeballed: it reports where in each emitted piece the joint landed, because
 * both halves keep the joint's rounded bulge and the seam is otherwise
 * invisible to measure by eye.
 */

/** Far limbs sit back: dimmer, and painted behind the body. */
const FAR = 0.82;

/**
 * The skeleton, in profile facing right.
 *
 * Rooted at the pelvis rather than the feet, because the hips are what a walk
 * actually drives — the feet are a consequence of the leg angles, and a rig
 * rooted at the ground has to solve backwards for them every frame.
 */
export const SKELETON: Rig = {
  root: 'pelvis',
  bones: [
    { name: 'pelvis', sprite: 'sk_pelvis', pivot: [0.5, 0.42], z: 3 },

    { name: 'ribs', parent: 'pelvis', sprite: 'sk_ribs',
      socket: [0.46, 0.12], pivot: [0.5, 0.94], z: 4 },
    { name: 'skull', parent: 'ribs', sprite: 'sk_skull',
      socket: [0.5, 0.04], pivot: [0.42, 0.9], z: 5 },

    // Arms. Shoulder high on the ribcage, elbow at the bottom of the humerus.
    { name: 'armFar', parent: 'ribs', sprite: 'sk_upperArm',
      socket: [0.5, 0.16], pivot: [0.5, 0.06], z: 1, alpha: FAR },
    { name: 'foreFar', parent: 'armFar', sprite: 'sk_foreArm',
      socket: [0.5, 0.94], pivot: [0.5, 0.1], z: 1, alpha: FAR },
    { name: 'armNear', parent: 'ribs', sprite: 'sk_upperArm',
      socket: [0.5, 0.16], pivot: [0.5, 0.06], z: 7 },
    { name: 'foreNear', parent: 'armNear', sprite: 'sk_foreArm',
      socket: [0.5, 0.94], pivot: [0.5, 0.1], z: 7 },

    // Legs. sk_shin carries the foot, so the ankle is not a joint.
    { name: 'thighFar', parent: 'pelvis', sprite: 'sk_thigh',
      socket: [0.5, 0.78], pivot: [0.5, 0.06], z: 2, alpha: FAR },
    { name: 'shinFar', parent: 'thighFar', sprite: 'sk_shin',
      socket: [0.5, 0.92], pivot: [0.5, 0.13], z: 2, alpha: FAR },
    { name: 'thighNear', parent: 'pelvis', sprite: 'sk_thigh',
      socket: [0.5, 0.78], pivot: [0.5, 0.06], z: 6 },
    { name: 'shinNear', parent: 'thighNear', sprite: 'sk_shin',
      socket: [0.5, 0.92], pivot: [0.5, 0.13], z: 6 },
  ],
};

/**
 * The zombie, facing the viewer.
 *
 * Two-segment arms so it can actually reach for something, one-piece legs
 * because the art has no knee drawn in it — and a stiff-legged lurch is the
 * right read for a zombie anyway, so that limitation costs nothing here.
 */
export const ZOMBIE: Rig = {
  root: 'torso',
  bones: [
    { name: 'torso', sprite: 'zo_torso', pivot: [0.5, 0.5], z: 3 },
    { name: 'head', parent: 'torso', sprite: 'zo_head',
      socket: [0.5, 0.08], pivot: [0.5, 0.88], z: 4 },

    { name: 'armFarUp', parent: 'torso', sprite: 'zo_upperArm', flip: true,
      socket: [0.16, 0.2], pivot: [0.5, 0.08], z: 1, alpha: FAR },
    { name: 'armFarLo', parent: 'armFarUp', sprite: 'zo_foreArm',
      socket: [0.5, 0.92], pivot: [0.5, 0.08], z: 1, alpha: FAR },
    { name: 'armNearUp', parent: 'torso', sprite: 'zo_upperArm',
      socket: [0.84, 0.2], pivot: [0.5, 0.08], z: 5 },
    { name: 'armNearLo', parent: 'armNearUp', sprite: 'zo_foreArm',
      socket: [0.5, 0.92], pivot: [0.5, 0.08], z: 5 },

    { name: 'legFar', parent: 'torso', sprite: 'zo_leg', flip: true,
      socket: [0.41, 0.9], pivot: [0.5, 0.08], z: 2, alpha: FAR },
    { name: 'legNear', parent: 'torso', sprite: 'zo_leg',
      socket: [0.59, 0.9], pivot: [0.5, 0.08], z: 2 },
  ],
};

/**
 * The bat, facing the viewer.
 *
 * The wing is the point of this whole exercise: two segments hinged at the
 * body and again at the elbow, so a beat is a pair of angle curves rather than
 * three drawn pictures swapped in turn. Inner wings paint behind the body,
 * outer wings in front of them, which is what gives the flap depth as it comes
 * over the top.
 */
export const BAT: Rig = {
  root: 'body',
  bones: [
    { name: 'body', sprite: 'ba_body', pivot: [0.5, 0.5], z: 3 },
    { name: 'head', parent: 'body', sprite: 'ba_head',
      socket: [0.5, 0.16], pivot: [0.5, 0.78], z: 4 },

    // The shoulder is the INNER edge of the wing, so the wing extends away
    // from the body. Pivoting on the outer edge — the first attempt — swept
    // each wing back across the body and the bat spent the whole beat looking
    // like it was hugging itself.
    { name: 'wingInL', parent: 'body', sprite: 'ba_wingIn', flip: true,
      socket: [0.14, 0.36], pivot: [0.1, 0.42], z: 1 },
    { name: 'wingOutL', parent: 'wingInL', sprite: 'ba_wingOut',
      socket: [0.9, 0.46], pivot: [0.1, 0.44], z: 2 },
    { name: 'wingInR', parent: 'body', sprite: 'ba_wingIn',
      socket: [0.86, 0.36], pivot: [0.1, 0.42], z: 1 },
    { name: 'wingOutR', parent: 'wingInR', sprite: 'ba_wingOut',
      socket: [0.9, 0.46], pivot: [0.1, 0.44], z: 2 },

    { name: 'footL', parent: 'body', sprite: 'ba_foot',
      socket: [0.38, 0.94], pivot: [0.5, 0.1], z: 5 },
    { name: 'footR', parent: 'body', sprite: 'ba_foot',
      socket: [0.62, 0.94], pivot: [0.5, 0.1], z: 5 },
  ],
};
