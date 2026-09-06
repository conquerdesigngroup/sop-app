import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { createAnchorSource } from '../../lib/holiday/anchors';
import { createDirector } from '../../lib/holiday/director';
import { createDirty } from '../../lib/holiday/draw';
import type { HolidayId } from '../../lib/holiday/flag';
import { mulberry32, randomSeed } from '../../lib/holiday/rng';
import { createSpriteStore, type SpriteStore } from '../../lib/holiday/sprites';
import { loadTheme } from '../../lib/holiday/themes';
import type { HolidayTheme, Layer, Paint } from '../../lib/holiday/types';

/**
 * The two canvases, the clock, and everything that has to be given back.
 *
 * This follows the contract RefractedGlassField established on this page, and
 * for the same reasons — see its docblock. Reduced motion paints one still
 * frame and CANCELS the loop; a hidden tab runs no frames at all; the backing
 * store is capped at 2x DPR; the delta is clamped so a backgrounded tab resumes
 * where it left off instead of teleporting.
 *
 * TWO CANVASES, AND WHY THE Z-INDICES ARE WHAT THEY ARE
 *
 * The back one at -1 sits above the page background and below the tiles, which
 * is what lets a ghost rise from behind one. It must come AFTER
 * <RefractedGlassField /> in tree order — equal z-index resolves by tree order,
 * and that is the difference between drifting in front of the glass field and
 * being lost inside it.
 *
 * The front one is at 1, deliberately NOT 0. ChooserTile applies
 * `transform: translateY(-2px)` on hover, and a transformed element paints in
 * the same pass as a z-index:0 positioned one with tree order breaking the tie
 * — so at 0, hovering a tile would draw it OVER the zombie standing on it.
 * Only on hover, only with a mouse, and only sometimes. HolidayLayer.test.tsx
 * pins both values.
 *
 * Both are pointer-events:none and aria-hidden. Neither can ever intercept a
 * tap or reach a screen reader; the front door behaves exactly as it did.
 *
 * 30fps, not 60. The clock still integrates at the real delta so the physics is
 * unchanged — only the paint is throttled. Half the fill rate for motion nobody
 * will read as choppy at this size, on a page that is already running one
 * full-viewport canvas at full rate.
 */

interface Props {
  holiday: HolidayId;
  /** Pin the schedule. Same seed replays the identical run; used by tests. */
  seed?: number;
}

const PAINT_STEP = 1 / 30;

const canvasStyle = (zIndex: number): React.CSSProperties => ({
  position: 'fixed',
  inset: 0,
  width: '100%',
  height: '100%',
  zIndex,
  pointerEvents: 'none',
});

const HolidayStage: React.FC<Props> = ({ holiday, seed }) => {
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const { mode } = useTheme();
  const [theme, setTheme] = useState<HolidayTheme | null>(null);

  useEffect(() => {
    let alive = true;
    loadTheme(holiday)
      .then((t) => {
        if (alive) setTheme(t);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [holiday]);

  useEffect(() => {
    const back = backRef.current;
    const front = frontRef.current;
    if (!theme || !back || !front) return;

    // jsdom has no 2d context. Bailing here rather than throwing is what lets
    // the component be mounted in a test at all.
    const bctx = back.getContext('2d');
    const fctx = front.getContext('2d');
    if (!bctx || !fctx) return;

    const palette = theme.palette[mode];
    const backDirty = createDirty();
    const frontDirty = createDirty();
    const backPaint: Paint = { ctx: bctx, mark: backDirty.mark, palette, mode };
    const frontPaint: Paint = { ctx: fctx, mark: frontDirty.mark, palette, mode };

    const anchors = createAnchorSource();
    const rand = mulberry32(seed ?? randomSeed());
    const director = createDirector({ acts: theme.acts, rand, openers: theme.openers });

    // Guarded: jsdom has no matchMedia, and useReducedMotion.ts documents the
    // same fallback — a test simply gets full motion.
    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    let store: SpriteStore = createSpriteStore(
      theme.sprites,
      mq?.matches ? theme.stillNeeds : Object.keys(theme.sprites)
    );
    let unsubscribe = store.subscribe(() => sync());

    let w = 0;
    let h = 0;

    const resize = () => {
      const box = back.getBoundingClientRect();
      if (!box.width || !box.height) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(1, Math.round(box.width * dpr));
      const ch = Math.max(1, Math.round(box.height * dpr));
      w = Math.round(box.width);
      h = Math.round(box.height);
      const changed = back.width !== cw || back.height !== ch;
      if (changed) {
        back.width = cw;
        back.height = ch;
        front.width = cw;
        front.height = ch;
      }
      // Assigning width/height resets the transform, so it is reapplied every
      // time rather than only when the size changed.
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return changed;
    };

    const paintLayer = (layer: Layer, dirty: ReturnType<typeof createDirty>, paint: Paint, t: number) => {
      const ctx = paint.ctx;
      dirty.begin(ctx, w, h);
      const stage = anchors.read();
      const base = { t, stage, sprites: store.sprites, paint };

      theme.ambient.forEach((a) => {
        if (a.layer === layer && a.needs.every(store.ready)) a.draw(base);
      });

      const cur = director.current;
      if (cur && cur.def.layer === layer) {
        const elapsed = t - cur.startedAt;
        cur.perf.draw({
          ...base,
          t: elapsed,
          p: Math.min(1, Math.max(0, elapsed / cur.perf.duration)),
        });
      }
      dirty.end();
    };

    const paintFrame = (t: number) => {
      if (!w || !h) return;
      director.step(t, store.ready, anchors.read());
      paintLayer('behind', backDirty, backPaint, t);
      paintLayer('front', frontDirty, frontPaint, t);
    };

    const paintStill = () => {
      if (!w || !h) return;
      // The tableau lives entirely on the back layer, so the front canvas is
      // cleared once and then left alone.
      frontDirty.begin(fctx, w, h);
      frontDirty.end();
      backDirty.begin(bctx, w, h);
      if (theme.stillNeeds.every(store.ready)) {
        theme.drawStill({ stage: anchors.read(), sprites: store.sprites, paint: backPaint });
      }
      backDirty.end();
    };

    let raf = 0;
    let last = 0;
    let clock = 0;
    let acc = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!last) last = now;
      // Clamped so a tab that missed a second of frames resumes rather than
      // jumping every character across the screen at once.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt;
      acc += dt;
      if (acc < PAINT_STEP) return;
      // Reset rather than subtract: subtracting invites a catch-up spiral of
      // back-to-back paints after the tab has been away.
      acc = 0;
      paintFrame(clock);
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    function sync() {
      if (mq?.matches || document.hidden) {
        stop();
        if (mq?.matches) paintStill();
        return;
      }
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    }

    const onMotionChange = () => {
      // Turning motion back ON needs the rest of the cast, which was skipped at
      // mount. The module-level cache means already-loaded files are free.
      if (mq && !mq.matches) {
        unsubscribe();
        store.dispose();
        store = createSpriteStore(theme.sprites, Object.keys(theme.sprites));
        unsubscribe = store.subscribe(() => sync());
      }
      sync();
    };

    const onResize = () => {
      if (resize() && (mq?.matches || document.hidden)) paintStill();
    };

    resize();
    sync();

    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    observer?.observe(back);
    document.addEventListener('visibilitychange', sync);
    mq?.addEventListener('change', onMotionChange);

    return () => {
      stop();
      unsubscribe();
      store.dispose();
      anchors.dispose();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      mq?.removeEventListener('change', onMotionChange);
    };
  }, [theme, mode, seed]);

  return (
    <>
      <canvas ref={backRef} aria-hidden="true" style={canvasStyle(-1)} />
      <canvas ref={frontRef} aria-hidden="true" style={canvasStyle(1)} />
    </>
  );
};

export default HolidayStage;
