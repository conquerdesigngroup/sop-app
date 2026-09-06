import { createDirector } from './director';
import { mulberry32 } from './rng';
import type { ActDefinition, Stage } from './types';

/**
 * The scheduler.
 *
 * Worth real tests because its failure mode is invisible: a director that has
 * quietly stopped scheduling looks exactly like a director that is between
 * acts, and the gap is fifteen seconds either way.
 */

const stage: Stage = {
  vw: 390,
  vh: 844,
  compact: true,
  anchor: () => null,
  anchorOr: (_n, fallback) => fallback,
};

const act = (id: string, extra: Partial<ActDefinition> = {}): ActDefinition => ({
  id,
  layer: 'front',
  needs: [],
  cast: () => ({ duration: 5, draw: () => undefined }),
  ...extra,
});

type Ready = (spriteKey: string) => boolean;

const allReady: Ready = () => true;

/** Run a director forward at 30fps and report the order acts were cast in. */
const run = (d: ReturnType<typeof createDirector>, seconds: number, ready: Ready = allReady) => {
  for (let t = 0; t <= seconds; t += 1 / 30) d.step(t, ready, stage);
  return d.history;
};

describe('createDirector', () => {
  it('casts nothing before the first delay', () => {
    const d = createDirector({ acts: [act('a')], rand: mulberry32(1), firstDelay: 2.2 });
    for (let t = 0; t < 2.19; t += 1 / 30) d.step(t, allReady, stage);
    expect(d.current).toBeNull();
    d.step(2.2, allReady, stage);
    expect(d.current).not.toBeNull();
  });

  it('never runs two performances at once', () => {
    const d = createDirector({ acts: [act('a'), act('b'), act('c')], rand: mulberry32(2) });
    for (let t = 0; t <= 300; t += 1 / 30) {
      d.step(t, allReady, stage);
      // `current` is a single slot by construction; this asserts the state
      // machine never leaves a retired act in it while casting the next.
      const cur = d.current;
      if (cur) expect(t - cur.startedAt).toBeLessThanOrEqual(cur.perf.duration);
    }
  });

  it('leaves a gap in the configured range between performances', () => {
    const d = createDirector({
      acts: [act('a'), act('b')],
      rand: mulberry32(3),
      gap: [8, 15],
    });
    const starts: number[] = [];
    let seen = 0;
    for (let t = 0; t <= 400; t += 1 / 30) {
      d.step(t, allReady, stage);
      if (d.history.length > seen) {
        seen = d.history.length;
        starts.push(d.current!.startedAt);
      }
    }
    expect(starts.length).toBeGreaterThan(10);
    for (let i = 1; i < starts.length; i += 1) {
      const gap = starts[i] - (starts[i - 1] + 5); // 5s duration
      expect(gap).toBeGreaterThanOrEqual(8 - 1 / 30);
      expect(gap).toBeLessThanOrEqual(15 + 1 / 30);
    }
  });

  it('does not repeat an act back to back', () => {
    const d = createDirector({
      acts: ['a', 'b', 'c', 'd', 'e'].map((id) => act(id)),
      rand: mulberry32(4),
    });
    const history = run(d, 3000);
    expect(history.length).toBeGreaterThan(100);
    for (let i = 1; i < history.length; i += 1) {
      expect(history[i]).not.toBe(history[i - 1]);
    }
  });

  it('never casts an act whose sprites are missing', () => {
    const d = createDirector({
      acts: [act('needsArt', { needs: ['missing'] }), act('fine')],
      rand: mulberry32(5),
    });
    const history = run(d, 600, (key) => key !== 'missing');
    expect(history.length).toBeGreaterThan(10);
    expect(history).not.toContain('needsArt');
  });

  it('respects canRun, so a page too narrow for an act simply never sees it', () => {
    const d = createDirector({
      acts: [act('wide', { canRun: () => false }), act('any')],
      rand: mulberry32(6),
    });
    expect(run(d, 400)).not.toContain('wide');
  });

  it('holds rather than throwing when nothing is castable', () => {
    const d = createDirector({ acts: [act('a', { needs: ['nope'] })], rand: mulberry32(7) });
    expect(() => run(d, 200, () => false)).not.toThrow();
    expect(d.history).toHaveLength(0);
    expect(d.current).toBeNull();
  });

  it('casts as soon as late-arriving art becomes ready', () => {
    let loaded = false;
    const d = createDirector({ acts: [act('a', { needs: ['art'] })], rand: mulberry32(8) });
    for (let t = 0; t <= 20; t += 1 / 30) d.step(t, () => loaded, stage);
    expect(d.history).toHaveLength(0);
    loaded = true;
    for (let t = 20; t <= 22; t += 1 / 30) d.step(t, () => loaded, stage);
    expect(d.history).toEqual(['a']);
  });

  it('opens on an act from `openers`', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const d = createDirector({
        acts: ['ghost', 'bat', 'zombie', 'skeleton'].map((id) => act(id)),
        rand: mulberry32(seed),
        openers: ['ghost', 'bat'],
      });
      run(d, 5);
      // Most visits are one performance long, so the first pick is the only
      // impression most people get. It must be one of the good ones.
      expect(['ghost', 'bat']).toContain(d.history[0]);
    }
  });

  it('replays identically from the same seed, and differently from another', () => {
    const acts = ['a', 'b', 'c', 'd'].map((id) => act(id));
    const of = (seed: number) =>
      run(createDirector({ acts, rand: mulberry32(seed), openers: ['a', 'b'] }), 500).join();

    expect(of(11)).toBe(of(11));
    expect(of(11)).not.toBe(of(12));
  });
});
