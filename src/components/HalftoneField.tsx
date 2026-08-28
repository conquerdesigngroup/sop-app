import React, { useEffect, useRef } from 'react';
import { getThemeColors, theme } from '../theme';
import { useTheme } from '../contexts/ThemeContext';

/**
 * The ambient background on the front door.
 *
 * A dot matrix at a fixed pitch, with one moving attractor passing through it.
 * Dots near the attractor swell, brighten and lean toward electric, then settle
 * behind it — so the field reads as a body moving under fabric rather than as a
 * pattern. With a mouse the attractor IS the pointer, so the field answers the
 * person choosing; on a phone, where there is nothing to follow, it drifts on
 * its own path.
 *
 * Only the chooser gets this. Motion behind a screen somebody works in all day
 * is a different and much worse idea.
 *
 * Three things this must not cost anybody, in rough order of how likely they
 * are to be forgotten:
 *
 * 1. `prefers-reduced-motion` paints ONE composed frame and stops. The screen
 *    keeps its atmosphere; nothing moves. The listener is live, so toggling the
 *    setting takes effect without a reload.
 * 2. A hidden tab runs no frames at all — the loop is cancelled, not skipped.
 * 3. Canvas backing store is capped at 2x DPR. A 3x phone would otherwise paint
 *    2.25 times the pixels for a difference nobody can see in a 1px dot.
 */

/** '#RRGGBB' -> [r, g, b]. The palette in theme.ts is all six-digit hex. */
const toRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const mixRgb = (
  a: [number, number, number],
  b: [number, number, number],
  k: number
): [number, number, number] => [
  Math.round(a[0] + (b[0] - a[0]) * k),
  Math.round(a[1] + (b[1] - a[1]) * k),
  Math.round(a[2] + (b[2] - a[2]) * k),
];

const TAU = Math.PI * 2;

/**
 * How many distinct dot colours the field is quantised into.
 *
 * Setting fillStyle per dot means a colour string allocation and a state change
 * for every one of them — about 1,700 of each per frame on a desktop. Sorting
 * the dots into ten buckets first costs one fillStyle and one fill each, and at
 * this dot size nobody can see the banding.
 */
const BUCKETS = 10;

/**
 * The attractor's path when there is no pointer: two sines per axis.
 *
 * The two frequencies on each axis are not multiples of each other, so the
 * figure never closes and you cannot catch it repeating. Amplitudes sum below
 * 0.5, which is what keeps it inside the frame without any clamping.
 * [ax, fx, px, bx, gx, qx, ay, fy, py, by, gy, qy]
 */
const PATH = [0.31, 0.19, 1.2, 0.12, 0.53, 0.4, 0.28, 0.23, 2.7, 0.11, 0.61, 1.9];

/** The frame drawn when motion is off. Chosen because the attractor sits high
 *  and left here, which reads as composed rather than accidentally centred. */
const STILL_AT = 6.2;

const HalftoneField: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { mode } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas cannot resolve var(), so the CSS-variable tokens are no use here —
    // this reads the literal palette for the current mode instead. The effect
    // re-runs on a mode change, so the field re-themes with everything else.
    const palette = getThemeColors(mode);
    const base = mixRgb(toRgb(palette.bdr.secondary), toRgb(palette.txt.tertiary), 0.35);
    const accent = toRgb(theme.colors.primary);

    // Bucket colours and alphas never change while the mode holds, so build the
    // strings once rather than 600 times a second.
    const fills: string[] = [];
    const alphas: number[] = [];
    for (let i = 0; i < BUCKETS; i++) {
      const k = i / (BUCKETS - 1);
      const c = mixRgb(base, accent, k);
      fills.push(`rgb(${c[0]},${c[1]},${c[2]})`);
      alphas.push(0.44 + k * 0.5);
    }
    const bins: number[][] = [];
    for (let i = 0; i < BUCKETS; i++) bins.push([]);

    let w = 0;
    let h = 0;

    /**
     * Returns true when the backing store actually had to be reallocated.
     *
     * w/h are read every time regardless. They live in this effect's closure,
     * so a re-run — a theme toggle, or StrictMode's double mount in dev —
     * starts with them at zero even though the canvas element is already the
     * right size. Returning early before assigning them left every frame
     * drawing a 0x0 field, which is to say nothing at all.
     */
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(1, Math.round(box.width * dpr));
      const ch = Math.max(1, Math.round(box.height * dpr));
      w = Math.round(box.width);
      h = Math.round(box.height);
      const changed = canvas.width !== cw || canvas.height !== ch;
      if (changed) {
        canvas.width = cw;
        canvas.height = ch;
      }
      // Assigning width/height resets the transform, so it has to be re-applied
      // here; doing it unconditionally also covers the re-run case above.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return changed;
    };

    // Where the attractor is being pulled toward (0..1 of the canvas), and where
    // it actually is. Easing between them means the pointer never yanks the
    // field, and letting go of it drifts back rather than snapping.
    const target = { x: 0.5, y: 0.5 };
    const at = { x: 0.5, y: 0.5 };
    let pointer: { x: number; y: number } | null = null;
    let seeded = false;

    const draw = (t: number) => {
      if (!w || !h) return;

      if (pointer) {
        target.x = pointer.x;
        target.y = pointer.y;
      } else {
        target.x =
          0.5 + PATH[0] * Math.sin(t * PATH[1] + PATH[2]) + PATH[3] * Math.sin(t * PATH[4] + PATH[5]);
        target.y =
          0.5 + PATH[6] * Math.cos(t * PATH[7] + PATH[8]) + PATH[9] * Math.sin(t * PATH[10] + PATH[11]);
      }
      if (!seeded) {
        at.x = target.x;
        at.y = target.y;
        seeded = true;
      } else {
        at.x += (target.x - at.x) * 0.06;
        at.y += (target.y - at.y) * 0.06;
      }

      const ax = at.x * w;
      const ay = at.y * h;
      // Scaling off the long edge alone makes the swell 82% of the width on a
      // portrait phone — the electric core then covers a quarter of the screen,
      // several times the brand's budget for it. The second term caps it against
      // the short edge, which leaves desktop untouched and reins in the phone.
      const radius = Math.min(Math.max(w, h) * 0.38, Math.min(w, h) * 0.62);
      // A pitch near 26px, held across every screen this runs on: fixed at 22px
      // on a phone, opening up to 34px on a desktop so the count stays sane.
      const gap = Math.max(22, Math.min(34, Math.min(w, h) / 22));

      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < BUCKETS; i++) bins[i].length = 0;

      for (let y = gap * 0.5; y < h; y += gap) {
        for (let x = gap * 0.5; x < w; x += gap) {
          const dx = x - ax;
          const dy = y - ay;
          let k = 1 - Math.sqrt(dx * dx + dy * dy) / radius;
          k = k > 0 ? k * k * (3 - 2 * k) : 0;
          // Size and displacement ride the soft falloff so the swell is wide;
          // colour rides a much sharper one so only the core turns electric.
          // Without the second curve the pink spreads over a third of the
          // screen, which is several times the brand's budget for it.
          let ck = k * k;
          ck = ck * ck;
          const bi = Math.min(BUCKETS - 1, (ck * BUCKETS) | 0);
          bins[bi].push(x + dx * k * 0.07, y + dy * k * 0.07, 0.85 + k * 3.4);
        }
      }

      for (let i = 0; i < BUCKETS; i++) {
        const dots = bins[i];
        if (!dots.length) continue;
        ctx.fillStyle = fills[i];
        ctx.globalAlpha = alphas[i];
        ctx.beginPath();
        for (let j = 0; j < dots.length; j += 3) {
          // moveTo before each arc, or every dot is joined to the last one.
          ctx.moveTo(dots[j] + dots[j + 2], dots[j + 1]);
          ctx.arc(dots[j], dots[j + 1], dots[j + 2], 0, TAU);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

    let raf = 0;
    let last = 0;
    let clock = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!last) last = now;
      // Clamped so a backgrounded tab that missed a second of frames resumes
      // where it was rather than jumping the attractor across the screen.
      clock += Math.min(0.05, (now - last) / 1000);
      last = now;
      draw(clock);
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const sync = () => {
      if (motionQuery.matches || document.hidden) {
        stop();
        // Reduced motion still gets a picture, just not a moving one.
        if (motionQuery.matches) {
          pointer = null;
          seeded = false;
          draw(STILL_AT);
        }
        return;
      }
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    const onResize = () => {
      if (resize() && (motionQuery.matches || document.hidden)) draw(motionQuery.matches ? STILL_AT : clock);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!w || !h) return;
      const box = canvas.getBoundingClientRect();
      pointer = { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
    };
    // Leaving the window hands the field back to its own path.
    const onPointerOut = (e: PointerEvent) => {
      if (!e.relatedTarget) pointer = null;
    };

    resize();
    sync();

    const observer = new ResizeObserver(onResize);
    observer.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    motionQuery.addEventListener('change', sync);
    if (pointerQuery.matches) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('pointerout', onPointerOut);
    }

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      motionQuery.removeEventListener('change', sync);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerout', onPointerOut);
    };
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        // Behind the page's content but above its background. The page root sets
        // `isolation: isolate`, which is what makes that reliable: it pins this
        // to the chooser's own stacking context instead of leaving it to
        // negotiate with whatever else is on the page.
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  );
};

export default HalftoneField;
