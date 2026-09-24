import { range } from './rng';
import type { ActDefinition, Performance, Rng, Stage } from './types';

/**
 * Decides who performs and when.
 *
 * Pure: no DOM, no canvas, no clock of its own. It is handed an absolute time
 * and told which sprites are ready, and it owns one decision — whether anybody
 * is on stage right now. That makes it the one part of this feature with real
 * tests, which matters because a scheduler that quietly stops scheduling looks
 * exactly like a scheduler that is between acts.
 *
 * ONE AT A TIME, WITH GAPS
 *
 * Two characters on screen at once turns a surprise into a screensaver, and the
 * front door's whole job is a single tap decision. So: one performance, then
 * eight to fifteen seconds of nothing but the ambient pumpkins.
 *
 * THE FIRST ONE IS THE ONLY ONE MOST PEOPLE SEE
 *
 * Median time on this screen is a few seconds. With acts spaced 8-15s apart,
 * the overwhelming majority of visits contain exactly one performance or none.
 * Two consequences, both deliberate:
 *
 *   - firstDelay is 2.2s, not one full gap. Long enough for the page to settle
 *     and the sprites to decode, short enough that somebody reading both tile
 *     labels sees something happen.
 *   - the first pick is drawn from `openers` rather than uniformly, so the one
 *     act most visitors ever see is one of the good ones and not the skeleton
 *     wandering along the bottom edge while they are already tapping.
 */

export interface DirectorOptions {
  acts: readonly ActDefinition[];
  rand: Rng;
  /** Act ids worth opening on. Ignored once the first performance has run. */
  openers?: readonly string[];
  /** Seconds before the first performance. */
  firstDelay?: number;
  /** Quiet seconds between performances, [min, max]. */
  gap?: [number, number];
  /** How many recent ids are excluded from the next pick. */
  noRepeatWindow?: number;
}

export interface Running {
  def: ActDefinition;
  perf: Performance;
  startedAt: number;
}

export interface Director {
  /**
   * Advance to absolute time t, casting and retiring as needed.
   *
   * `ready(spriteKey)` gates on art that may still be decoding or may have
   * failed outright; an act whose sprites never arrive is simply never cast,
   * which is how a 404 degrades to "that character does not appear" instead of
   * to a broken page.
   */
  step(t: number, ready: (spriteKey: string) => boolean, stage: Stage): void;
  readonly current: Running | null;
  /** Act ids performed so far, oldest first. Test seam. */
  readonly history: readonly string[];
}

export const createDirector = (opts: DirectorOptions): Director => {
  const {
    acts,
    rand,
    openers = [],
    firstDelay = 2.2,
    gap = [8, 15],
    noRepeatWindow = 2,
  } = opts;

  let running: Running | null = null;
  let nextAt = firstDelay;
  const history: string[] = [];

  const eligible = (ready: (k: string) => boolean, stage: Stage): ActDefinition[] =>
    acts.filter(
      (a) => a.needs.every(ready) && (a.canRun ? a.canRun(stage) : true)
    );

  /**
   * Narrow by recency, relaxing rather than failing.
   *
   * With few acts loaded — early on, or after a sprite fetch failed — a strict
   * no-repeat window can empty the pool entirely. Standing idle in that case
   * would be a decorative layer that silently switches itself off, so the
   * window relaxes to 1 and then to nothing before we give up.
   */
  const choose = (pool: ActDefinition[]): ActDefinition | null => {
    if (pool.length === 0) return null;

    if (history.length === 0 && openers.length > 0) {
      const first = pool.filter((a) => openers.includes(a.id));
      if (first.length > 0) return first[Math.floor(rand() * first.length)];
    }

    for (const window of [noRepeatWindow, 1, 0]) {
      const recent = window > 0 ? history.slice(-window) : [];
      const fresh = pool.filter((a) => !recent.includes(a.id));
      if (fresh.length > 0) return fresh[Math.floor(rand() * fresh.length)];
    }
    return null;
  };

  return {
    step(t, ready, stage) {
      if (running) {
        if (t - running.startedAt >= running.perf.duration) {
          running = null;
          nextAt = t + range(rand, gap[0], gap[1]);
        }
        return;
      }

      if (t < nextAt) return;

      const def = choose(eligible(ready, stage));
      // Nothing castable yet — art still decoding, or every act ruled out by
      // this page's geometry. Hold at nextAt and try again next frame rather
      // than burning the slot.
      if (!def) return;

      running = { def, perf: def.cast(rand, stage), startedAt: t };
      history.push(def.id);
    },
    get current() {
      return running;
    },
    get history() {
      return history;
    },
  };
};
