import { clamp, easeOutCubic, lerp, smoothstep } from '../../ease';
import type { Pose } from '../../rig';

/**
 * What the puppets DO. Each of these is one action, expressed as joint angles
 * over time.
 *
 * This is the file that makes the rig worth having: a new thing for a character
 * to do is a function in here, not another render. The skeleton walks, waves
 * and comes apart from one set of six bones.
 *
 * SIGN CONVENTION
 *
 * Canvas y points down, so a POSITIVE angle is clockwise on screen. A limb
 * hanging downward from its joint therefore swings BACKWARD (to the left) on a
 * positive angle and forward on a negative one, for a character facing right.
 * Rig mirroring handles the other direction, so every pose here is authored
 * facing right and never needs a direction term.
 *
 * KNEES AND ELBOWS ONLY BEND ONE WAY
 *
 * Every shin and forearm angle below is clamped to stay on the correct side of
 * straight. Without that a walk cycle looks fine for most of its phase and then
 * briefly snaps the knee inside out, which reads as a glitch rather than as bad
 * animation and is very hard to spot in a still.
 */

const TAU = Math.PI * 2;

/** A knee that never inverts: bends back only, and never quite locks straight. */
const knee = (v: number): number => clamp(v, 0.05, 1.5);
/** Likewise an elbow. */
const elbow = (v: number): number => clamp(v, 0.08, 1.6);

/* ------------------------------------------------------------- skeleton --- */

/**
 * A walk cycle.
 *
 * The shin lags the thigh by roughly a third of a cycle, which is what puts the
 * knee bend where a real one happens — flexed as the leg swings through, almost
 * straight as the heel lands. Arms swing opposite their own side's leg, which
 * is what stops a two-legged walk reading as a hop.
 */
export const skeletonWalk = (phase: number): Pose => {
  const w = TAU * phase;
  const o = w + Math.PI;
  return {
    thighNear: -0.55 * Math.sin(w),
    thighFar: -0.55 * Math.sin(o),
    shinNear: knee(0.42 + 0.46 * Math.sin(w - 2.0)),
    shinFar: knee(0.42 + 0.46 * Math.sin(o - 2.0)),

    armNear: 0.42 * Math.sin(w),
    armFar: 0.42 * Math.sin(o),
    foreNear: elbow(0.34 + 0.2 * Math.sin(w - 0.8)),
    foreFar: elbow(0.34 + 0.2 * Math.sin(o - 0.8)),

    // The spine counter-rotates against the hips, twice per stride.
    ribs: 0.05 * Math.sin(2 * w),
    skull: -0.05 * Math.sin(2 * w) + 0.03,
  };
};

/** Hip height over a stride. Rises once per STEP, so twice per cycle. */
export const skeletonBob = (phase: number): number =>
  -3.2 * Math.abs(Math.sin(Math.PI * phase * 2)) + 1.6;

/**
 * Stops, waves the near arm, walks on. `u` runs 0..1 across the whole gesture.
 *
 * The far arm and the legs stay in their standing rest, so this layers over a
 * halted walk rather than replacing it.
 */
export const skeletonWave = (u: number): Pose => {
  const inOut = Math.sin(Math.PI * clamp(u, 0, 1));
  const wag = Math.sin(TAU * 2.6 * u);
  return {
    armNear: lerp(0, -2.35, inOut),
    foreNear: elbow(lerp(0.3, 0.55 + 0.42 * wag, inOut)),
    skull: 0.03 + 0.12 * inOut,
    ribs: -0.05 * inOut,
  };
};

/* --------------------------------------------------------------- zombie --- */

/**
 * The shamble.
 *
 * One leg is bad — the same asymmetry the old procedural version had, but now
 * it is in the joints rather than in the whole sprite's rotation, so the bad
 * leg visibly swings less and lands harder than the good one.
 *
 * The arms are out in front the whole time, which is the entire silhouette of
 * the thing. They sag and recover rather than swinging, because a zombie is not
 * really holding them up.
 */
export const zombieShamble = (phase: number): Pose => {
  const w = TAU * phase;
  const o = w + Math.PI;
  return {
    // The near leg gets a full swing; the far one drags at 60% and lags.
    legNear: -0.5 * Math.sin(w),
    legFar: -0.3 * Math.sin(o - 0.5),

    // Reaching forward, elbows soft, sagging on alternate steps.
    armNearUp: -1.15 + 0.12 * Math.sin(w),
    armFarUp: -1.05 + 0.12 * Math.sin(o),
    armNearLo: elbow(0.5 + 0.16 * Math.sin(w - 1.1)),
    armFarLo: elbow(0.58 + 0.16 * Math.sin(o - 1.1)),

    // Permanent list, plus a lurch onto the bad leg.
    torso: 0.07 + 0.05 * Math.sin(w),
    head: -0.16 + 0.08 * Math.sin(w + 0.6),
  };
};

export const zombieBob = (phase: number): number =>
  -4.2 * Math.abs(Math.sin(Math.PI * phase)) + 2.1;

/** Arms up, head back — the moment before it topples. */
export const zombieTeeter = (u: number): Pose => {
  const k = clamp(u, 0, 1);
  return {
    armNearUp: lerp(-1.15, -2.5, k),
    armFarUp: lerp(-1.05, -2.3, k),
    armNearLo: elbow(lerp(0.5, 0.18, k)),
    armFarLo: elbow(lerp(0.58, 0.2, k)),
    legNear: lerp(0, 0.25, k),
    legFar: lerp(0, -0.15, k),
    torso: lerp(0.07, -0.2, k),
    head: lerp(-0.16, -0.5, k),
  };
};

/** Limbs flailing loose while it falls. */
export const zombieTumble = (t: number): Pose => ({
  armNearUp: -2.5 + 0.5 * Math.sin(TAU * 1.6 * t),
  armFarUp: -2.3 + 0.5 * Math.sin(TAU * 1.6 * t + 1.4),
  armNearLo: elbow(0.4 + 0.35 * Math.sin(TAU * 2.1 * t)),
  armFarLo: elbow(0.45 + 0.35 * Math.sin(TAU * 2.1 * t + 1.0)),
  legNear: 0.4 * Math.sin(TAU * 1.3 * t + 0.7),
  legFar: 0.4 * Math.sin(TAU * 1.3 * t + 2.2),
  head: -0.3 + 0.2 * Math.sin(TAU * 1.9 * t),
});

/* ------------------------------------------------------------------ bat --- */

/**
 * A wingbeat.
 *
 * The outer wing LAGS the inner one by about a fifth of a cycle. That lag is
 * the whole difference between a wing and a pair of hinged boards: it makes the
 * wingtip trail on the downstroke and whip through at the bottom, which is what
 * a membrane actually does. Take the lag out and the bat flaps like a
 * cardboard cut-out.
 */
export const batFlap = (phase: number, amplitude = 1): Pose => {
  const inner = 0.85 * Math.sin(phase) * amplitude;
  const outer = 0.7 * Math.sin(phase - 1.25) * amplitude;
  return {
    wingInL: inner,
    wingInR: inner,
    wingOutL: outer,
    wingOutR: outer,
    head: 0.05 * Math.sin(phase),
    footL: 0.25 + 0.12 * Math.sin(phase - 0.6),
    footR: 0.25 + 0.12 * Math.sin(phase - 0.6),
  };
};

/** Wings held out flat, tips tilted up — coasting between beats. */
export const batGlide: Pose = {
  wingInL: -0.12,
  wingInR: -0.12,
  wingOutL: 0.18,
  wingOutR: 0.18,
  footL: 0.3,
  footR: 0.3,
};

/**
 * Hanging asleep: wings wrapped around the body, feet up.
 *
 * The body itself is turned upside down by the act, not by this pose — a rig
 * rotation rather than a joint one, because everything inverts together.
 */
export const batHang = (breath: number): Pose => ({
  wingInL: 1.5,
  wingInR: 1.5,
  wingOutL: 1.15 + 0.05 * breath,
  wingOutR: 1.15 + 0.05 * breath,
  head: 0.06 * breath,
  footL: -0.35,
  footR: -0.35,
});

/** The stretch on waking — wings thrown open, then settling. */
export const batWake = (u: number): Pose => {
  const open = easeOutCubic(smoothstep(0, 0.55, u));
  const settle = smoothstep(0.55, 1, u);
  return {
    wingInL: lerp(1.5, lerp(-0.95, 0, settle), open),
    wingInR: lerp(1.5, lerp(-0.95, 0, settle), open),
    wingOutL: lerp(1.15, lerp(-0.6, 0.1, settle), open),
    wingOutR: lerp(1.15, lerp(-0.6, 0.1, settle), open),
    head: lerp(0.06, -0.15, open),
    footL: lerp(-0.35, 0.25, open),
    footR: lerp(-0.35, 0.25, open),
  };
};
