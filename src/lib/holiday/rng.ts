import type { Rng } from './types';

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG.
 *
 * The point of seeding at all is that the schedule becomes reproducible: the
 * same seed replays the identical sequence of acts with the identical choices
 * inside each one. That is what makes director.test.ts able to assert anything
 * about the schedule, and it is what lets you pin a specific performance while
 * tuning one instead of waiting for it to come round again.
 *
 * Math.random would have done for the visuals. It would not have done for the
 * tests, and an untestable scheduler is one that quietly stops scheduling.
 */
export const mulberry32 = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A seed for a real run. Overridable on HolidayStage so a demo can pin one. */
export const randomSeed = (): number => (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;

/** Uniform in [lo, hi). */
export const range = (rand: Rng, lo: number, hi: number): number => lo + rand() * (hi - lo);

/** Uniform pick. Callers guarantee a non-empty list. */
export const pick = <T,>(rand: Rng, items: readonly T[]): T =>
  items[Math.min(items.length - 1, Math.floor(rand() * items.length))];
