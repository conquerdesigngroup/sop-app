import {
  batSwing,
  clamp01,
  easeInCubic,
  easeInOutSine,
  easeOutBack,
  easeOutCubic,
  flapActive,
  flicker,
  flickerPhases,
  ghostBob,
  ghostBobVelocity,
  ghostSquash,
  GHOST_BOB_VMAX,
  pendulumHz,
  shambleStep,
  smoothstep,
  teeter,
  wingbeatBob,
} from './ease';
import { mulberry32 } from './rng';

/**
 * The physics, which is the part of this feature most able to be subtly wrong.
 *
 * A dropped 2*PI or a flipped sign does not throw and does not look broken in a
 * screenshot — it looks like an animation somebody tuned badly. These check the
 * claims the acts actually rely on.
 */

describe('easings', () => {
  it.each([
    ['easeOutCubic', easeOutCubic],
    ['easeInCubic', easeInCubic],
    ['easeInOutSine', easeInOutSine],
  ] as const)('%s spans 0..1 and is monotonic', (_name, fn) => {
    expect(fn(0)).toBeCloseTo(0, 10);
    expect(fn(1)).toBeCloseTo(1, 10);
    for (let i = 1; i <= 100; i += 1) {
      expect(fn(i / 100)).toBeGreaterThanOrEqual(fn((i - 1) / 100));
    }
  });

  it('clamps out-of-range input rather than extrapolating', () => {
    expect(easeOutCubic(-3)).toBe(0);
    expect(easeInCubic(9)).toBe(1);
    expect(clamp01(-1)).toBe(0);
  });

  it('easeOutBack overshoots past 1 and returns to it', () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 10);
    expect(easeOutBack(1)).toBeCloseTo(1, 10);
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => easeOutBack((i + 1) / 100)));
    // The overshoot is the whole point — it is what gives an arrival weight.
    expect(peak).toBeGreaterThan(1.02);
  });

  it('smoothstep is flat outside its edges', () => {
    expect(smoothstep(0.35, 0.65, 0.1)).toBe(0);
    expect(smoothstep(0.35, 0.65, 0.9)).toBe(1);
    expect(smoothstep(0.35, 0.65, 0.5)).toBeCloseTo(0.5, 6);
  });
});

describe('ghost', () => {
  /**
   * The single highest-value assertion in the file. ghostSquash derives the
   * squash from ghostBob's ANALYTIC derivative; if that derivative is wrong the
   * ghost still animates, just wrongly, and nothing else would ever catch it.
   */
  it('analytic bob velocity matches a central finite difference', () => {
    const h = 1e-5;
    for (let i = 0; i < 1000; i += 1) {
      const t = i * 0.017;
      const numeric = (ghostBob(t + h) - ghostBob(t - h)) / (2 * h);
      expect(ghostBobVelocity(t)).toBeCloseTo(numeric, 4);
    }
  });

  it('never exceeds its declared velocity bound', () => {
    for (let i = 0; i < 5000; i += 1) {
      expect(Math.abs(ghostBobVelocity(i * 0.003))).toBeLessThanOrEqual(GHOST_BOB_VMAX + 1e-9);
    }
  });

  it('conserves area through squash and stretch', () => {
    for (let i = 0; i < 2000; i += 1) {
      const { sx, sy } = ghostSquash(i * 0.007);
      expect(sx * sy).toBeCloseTo(1, 9);
    }
  });

  it('is stretched when moving fastest and squat at the turnaround', () => {
    // t where the bob velocity is near zero, found by scan, versus its maximum.
    let slowest = 0;
    let fastest = 0;
    for (let i = 0; i < 4000; i += 1) {
      const t = i * 0.002;
      if (Math.abs(ghostBobVelocity(t)) < Math.abs(ghostBobVelocity(slowest))) slowest = t;
      if (Math.abs(ghostBobVelocity(t)) > Math.abs(ghostBobVelocity(fastest))) fastest = t;
    }
    expect(ghostSquash(fastest).sy).toBeGreaterThan(ghostSquash(slowest).sy);
  });

  it('does not repeat inside a performance', () => {
    // Two incommensurate frequencies: the pattern at t and t+9s must differ.
    const drift = Array.from({ length: 200 }, (_, i) => Math.abs(ghostBob(i * 0.04) - ghostBob(i * 0.04 + 9)));
    expect(Math.max(...drift)).toBeGreaterThan(1);
  });
});

describe('zombie and bat oscillators point opposite ways', () => {
  /**
   * teeter and batSwing are the same shape with the exponent's sign flipped.
   * Swapping them looks animated either way: the bat would wind itself up
   * instead of settling, and the zombie would recover instead of falling.
   */
  it('the teeter diverges', () => {
    const early = Math.abs(teeter(0.15));
    const late = Math.abs(teeter(0.9));
    expect(late).toBeGreaterThan(early * 2);
  });

  it('the hang decays', () => {
    const hz = pendulumHz(70);
    const envelope = (t: number) => Math.abs(batSwing(t, hz)) + 1e-12;
    // Sampled at the same phase each period so the cosine is not the variable.
    const period = 1 / hz;
    expect(envelope(period)).toBeGreaterThan(envelope(period * 5));
    expect(envelope(period * 5)).toBeGreaterThan(envelope(period * 9));
  });

  it('pendulum frequency follows sqrt(g/L)', () => {
    // Four times the length is half the frequency.
    expect(pendulumHz(280)).toBeCloseTo(pendulumHz(70) / 2, 6);
  });
});

describe('bat wingbeat', () => {
  it('the body is lowest mid-downstroke and highest at the top', () => {
    // Canvas y is positive-down, so "lowest" is the largest value. With wing
    // angle sin(phase), the body must lag a quarter cycle: -A*cos(phase).
    expect(wingbeatBob(Math.PI, 6)).toBeCloseTo(6, 9);
    expect(wingbeatBob(0, 6)).toBeCloseTo(-6, 9);
    // The two plausible wrong answers.
    expect(wingbeatBob(Math.PI, 6)).not.toBeCloseTo(-6 * Math.sin(Math.PI), 9);
  });

  it('alternates bursts of beating with glides', () => {
    const samples = Array.from({ length: 400 }, (_, i) => flapActive(i * 0.01));
    expect(Math.max(...samples)).toBeGreaterThan(0.95);
    expect(Math.min(...samples)).toBeLessThan(0.05);
  });
});

describe('zombie gait', () => {
  it('covers the stride but not evenly - one leg drags', () => {
    expect(shambleStep(0)).toBeCloseTo(0, 9);
    expect(shambleStep(1)).toBeCloseTo(1, 9);
    // The good leg does 62% of the distance in the first 40% of the time.
    expect(shambleStep(0.4)).toBeCloseTo(0.62, 6);
    expect(shambleStep(0.4)).toBeGreaterThan(0.55);
  });

  it('is monotonic, so the feet never slide backwards', () => {
    for (let i = 1; i <= 200; i += 1) {
      expect(shambleStep(i / 200)).toBeGreaterThanOrEqual(shambleStep((i - 1) / 200));
    }
  });
});

describe('candle flicker', () => {
  const ph = flickerPhases(mulberry32(7));

  it('stays a positive brightness and never blows out', () => {
    for (let i = 0; i < 10000; i += 1) {
      const v = flicker(i * 0.01, ph);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('guts occasionally - the candle nearly goes out', () => {
    const samples = Array.from({ length: 4000 }, (_, i) => flicker(i * 0.01, ph));
    expect(Math.min(...samples)).toBeLessThan(0.5);
    // But it is not mostly dark: the gutter is rare, not the default.
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.5);
  });

  it('gives each lantern its own phase', () => {
    const rand = mulberry32(3);
    const a = flickerPhases(rand);
    const b = flickerPhases(rand);
    expect(flicker(2.5, a)).not.toBeCloseTo(flicker(2.5, b), 3);
  });
});
