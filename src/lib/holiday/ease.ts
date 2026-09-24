/**
 * The physics library.
 *
 * Everything that decides how a character MOVES lives here as a pure function
 * of time, so it can be tested without a canvas, a DOM or a clock. The acts are
 * then mostly bookkeeping: read an anchor, call these, draw a sprite.
 *
 * Canvas y is positive-DOWN throughout. A negative bob is a rise.
 *
 * Two conventions that are load-bearing:
 *
 * 1. Oscillators use incommensurate frequencies (0.42 against 0.67, not 0.4
 *    against 0.8). Rationally related frequencies produce a short common period
 *    and the eye finds the loop within seconds; irrational-ish ratios do not
 *    visibly repeat inside the length of a performance.
 *
 * 2. Where a sprite's SCALE follows its own motion, the velocity is derived
 *    analytically rather than by differencing frames. A frame-differenced
 *    velocity is one frame stale and goes wrong the moment the frame rate
 *    changes — and this layer deliberately paints at 30fps inside a 60fps RAF.
 *    ease.test.ts checks the analytic derivatives against finite differences,
 *    because a dropped 2*PI in here looks like a slightly odd animation rather
 *    than like a bug.
 */

const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

export const easeOutCubic = (p: number): number => 1 - Math.pow(1 - clamp01(p), 3);

export const easeInCubic = (p: number): number => Math.pow(clamp01(p), 3);

export const easeInOutSine = (p: number): number => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(p));

/**
 * Overshoots past 1 and settles back. Used on arrivals — a bat dropping onto a
 * perch that eases in has no weight; one that overshoots and recoils does.
 */
export const easeOutBack = (p: number, s = 1.70158): number => {
  const u = clamp01(p) - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};

export const smoothstep = (a: number, b: number, x: number): number => {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ---------------------------------------------------------------- ghost --- */

const G1_AMP = 7;
const G1_HZ = 0.42;
const G2_AMP = 3;
const G2_HZ = 0.67;
const G2_PHASE = 1.1;

/** Vertical bob in px. Two incommensurate frequencies — see the header. */
export const ghostBob = (t: number): number =>
  G1_AMP * Math.sin(TAU * G1_HZ * t) + G2_AMP * Math.sin(TAU * G2_HZ * t + G2_PHASE);

/** d(ghostBob)/dt, analytically. px/s. */
export const ghostBobVelocity = (t: number): number =>
  G1_AMP * TAU * G1_HZ * Math.cos(TAU * G1_HZ * t) +
  G2_AMP * TAU * G2_HZ * Math.cos(TAU * G2_HZ * t + G2_PHASE);

/** The exact bound on |ghostBobVelocity|, reached only when both cosines peak. */
export const GHOST_BOB_VMAX = G1_AMP * TAU * G1_HZ + G2_AMP * TAU * G2_HZ;

/**
 * Squash and stretch driven by the ghost's own vertical speed.
 *
 * Fast through the middle of a bob means stretched; slow at the top and bottom
 * means squat. Deriving it from the velocity rather than from a second
 * oscillator is the whole difference between something that reads as a floating
 * body and something that reads as two unrelated animations on one sprite.
 *
 * sx is 1/sy exactly, so the silhouette's area is conserved — clay does not
 * gain volume when it stretches. Draw with the pivot at the BOTTOM of the
 * sprite; a centre pivot turns this into a pulse.
 */
export const ghostSquash = (t: number): { sx: number; sy: number } => {
  const speed = Math.abs(ghostBobVelocity(t)) / GHOST_BOB_VMAX;
  // A slow breath on top, so it never sits perfectly still at a bob extreme.
  const sy = (0.93 + 0.14 * speed) * (1 + 0.02 * Math.sin(TAU * 0.23 * t));
  return { sx: 1 / sy, sy };
};

/* --------------------------------------------------------------- zombie --- */

/**
 * Where in the stride the body is, 0..1, for a phase q in 0..1.
 *
 * ONE LEG IS BAD, and the entire read comes from that. The good leg covers 62%
 * of the stride in the first 40% of the time; the bad one drags the remaining
 * 38% out over the other 60%. Make this symmetric and you have a walk.
 */
export const shambleStep = (q: number): number => {
  const u = clamp01(q);
  return u < 0.4 ? 0.62 * easeOutCubic(u / 0.4) : 0.62 + 0.38 * easeInOutSine((u - 0.4) / 0.6);
};

/** Push off the good leg (up), sag onto the bad one (down). px, negative is up. */
export const shambleBob = (q: number): number => {
  const u = clamp01(q);
  return (
    -5.5 * Math.sin(Math.PI * clamp01(u / 0.4)) +
    2.5 * Math.sin(Math.PI * clamp01((u - 0.4) / 0.6))
  );
};

/**
 * Body roll in radians, lagging the bob, around a permanent list.
 *
 * The constant -0.045 is doing most of the work here. A symmetric roll with a
 * bob is a walk; a walk that never returns to vertical is a shamble.
 */
export const shambleRoll = (q: number): number =>
  0.10 * Math.sin(TAU * clamp01(q) - 0.6) - 0.045;

/**
 * Teetering on the edge, in radians, for u seconds past the moment of balance.
 *
 * The exponent is POSITIVE. This is an inverted pendulum past its balance
 * point: it does not settle, it runs away, and that is why the fall reads as
 * inevitable rather than as a decision. Compare batSwing, which has the same
 * shape with the sign flipped — swapping the two is an easy mistake that looks
 * animated either way, so ease.test.ts pins the direction of both.
 */
export const teeter = (u: number): number =>
  0.12 * Math.sin(TAU * 0.75 * u) * Math.exp(1.9 * u);

/** Past here the zombie has committed and the tumble takes over. */
export const TEETER_COMMIT = 0.42;

/* ------------------------------------------------------------------ bat --- */

/** A pendulum of length L px under gravity g px/s^2, in Hz. */
export const pendulumHz = (lengthPx: number, g = 1400): number =>
  Math.sqrt(g / Math.max(1, lengthPx)) / TAU;

/**
 * A real damped pendulum, in radians. Pivot at the TOES, not the centre —
 * the bat is hanging from them.
 */
export const batSwing = (t: number, hz: number, amp = 0.22, tau = 3.2): number =>
  amp * Math.exp(-t / tau) * Math.cos(TAU * hz * t);

/** Wingbeat phase in radians. */
export const WINGBEAT_HZ = 5.5;
export const wingPhase = (t: number): number => TAU * WINGBEAT_HZ * t;

/**
 * How much the bat is beating rather than gliding, 0..1, on a 1.6s cycle.
 *
 * Bats do not flap continuously — a burst of beats, then a flat-winged coast.
 * That cadence is most of what distinguishes a bat from a bird at this size.
 */
export const flapActive = (t: number): number =>
  smoothstep(0.35, 0.65, 0.5 + 0.5 * Math.sin(TAU * t / 1.6));

/**
 * Body height offset from the wingbeat, px, negative is up.
 *
 * The quarter-cycle lag is the point and it is easy to get wrong. Height is the
 * double integral of lift, so the body lags the wing: with wing angle
 * sin(phase), the body is LOWEST at phase = PI (mid-downstroke, where the wing
 * is moving fastest) and HIGHEST at phase = 0. That is -A*cos(phase).
 * -A*sin(phase) and +A*cos(phase) both look animated and are both wrong.
 */
export const wingbeatBob = (phase: number, amplitude: number): number =>
  -amplitude * Math.cos(phase);

/* -------------------------------------------------------------- pumpkin --- */

/** Four phase offsets, so no two pumpkins ever flicker in unison. */
export interface FlickerPhases {
  a: number;
  b: number;
  c: number;
  gutter: number;
}

export const flickerPhases = (rand: () => number): FlickerPhases => ({
  a: rand() * TAU,
  b: rand() * TAU,
  c: rand() * TAU,
  gutter: rand() * TAU,
});

/**
 * Candle brightness, in (0, 1].
 *
 * Three stacked sines give the constant restlessness of a flame. The `^12` term
 * is what sells it: it sits at ~1 almost all the time, then briefly pulls the
 * level down to about two thirds — the candle nearly going out and catching
 * again. It is the single most convincing detail in the whole feature, and it
 * costs one line.
 *
 * The pumpkin sprite itself is drawn at CONSTANT alpha. A physical object does
 * not flicker; the light it throws does.
 */
export const flicker = (t: number, ph: FlickerPhases): number => {
  const base =
    0.62 +
    0.14 * Math.sin(TAU * 1.7 * t + ph.a) +
    0.09 * Math.sin(TAU * 3.1 * t + ph.b) +
    0.06 * Math.sin(TAU * 5.9 * t + ph.c);
  const gutter = 1 - 0.35 * Math.pow(Math.max(0, Math.sin(TAU * 0.11 * t + ph.gutter)), 12);
  return base * gutter;
};

/** The still-frame brightness under reduced motion — a good mid-flicker value. */
export const FLICKER_STILL = 0.78;
