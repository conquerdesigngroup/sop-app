import React, { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useHomeScene } from '../hooks/useHomeScene';
import { createSeeded, DEFAULT_SCENE_ID, findScene, HomeSceneDef, SETTLE_SECONDS } from '../lib/homeScenes';
import TopoField from './TopoField';

/**
 * Runs one seasonal scene from src/lib/homeScenes.ts on a canvas.
 *
 * The same three rules as TopoField, because the page in front is somebody's
 * work and is often left open all day:
 *
 * 1. `prefers-reduced-motion` paints one composed frame (the scene advanced a
 *    few seconds so it looks settled) and stops. The listener is live.
 * 2. A hidden tab runs no frames: the loop is cancelled, not skipped. A
 *    `contained` preview also stops while it is scrolled out of view.
 * 3. The backing store is capped at 1.5x. Snow and glow are soft; nobody can
 *    see the difference at 3x, and the phone does less than half the work.
 *
 * `contained` draws inside its parent (the previews in Settings) instead of
 * fixed behind the whole page; `still` paints the composed frame only, so a
 * grid of previews costs one animation, not eight.
 */
/** The large viewport where supported, so the address bar never resizes the scene. */
const FIXED_HEIGHT =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('height', '100lvh') ? '100lvh' : '100%';

export const SceneCanvas: React.FC<{ scene: HomeSceneDef; contained?: boolean; still?: boolean }> = ({
  scene,
  contained = false,
  still = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isDark } = useTheme();
  // One seed for the life of this canvas: every rebuild draws the same scene.
  const seedRef = useRef(Math.floor(Math.random() * 2 ** 31));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window.matchMedia !== 'function' || typeof ResizeObserver === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const frameMs = 1000 / scene.fps;
    let w = 0;
    let h = 0;
    let frame: ReturnType<HomeSceneDef['create']> | null = null;
    let raf = 0;
    let last = 0;
    let clock = 0;
    let onScreen = true;

    const build = () => {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return false;
      // A phone's address bar sliding in and out while you scroll changes the
      // viewport's height and nothing else. Rebuilding for that redrew the
      // whole scene every few pixels of scroll, which is the glitch. The fixed
      // canvas is sized to the LARGE viewport (100lvh, below) so this mostly
      // cannot happen; where lvh is unsupported, ignore height-only changes
      // smaller than a quarter of the screen and let the bitmap stretch.
      if (frame && Math.abs(box.width - w) < 1 && Math.abs(box.height - h) < h * 0.25) return false;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = box.width;
      h = box.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Bars fixed over the screen: the phone tab bar at the foot, the sticky
      // header at the top (staff Navigation, or the portal's header and tab
      // bar). A grounded scene (the village) stands on top of the foot bar;
      // a hanging one (lights, ornaments) hangs below the header.
      let floor = 0;
      let ceiling = 0;
      if (!contained) {
        document.querySelectorAll('nav, header, [data-bottom-nav]').forEach(el => {
          const r = el.getBoundingClientRect();
          if (!r.height) return;
          if (r.top <= 1 && r.bottom > 0 && r.bottom < h / 3) ceiling = Math.max(ceiling, r.bottom);
          else if (r.top > (h * 2) / 3 && r.top < h) floor = Math.max(floor, h - r.top);
        });
      }
      frame = createSeeded(scene, seedRef.current, w, h, { dark: isDark, floor, ceiling });
      return true;
    };

    const paintStill = () => {
      if (!frame) return;
      const step = 1 / 30;
      for (let t = 0; t < SETTLE_SECONDS; t += step) frame.draw(ctx, t, step, true);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (last && now - last < frameMs) return;
      // Clamped so coming back to the tab resumes rather than jumps.
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / scene.fps;
      last = now;
      clock += dt;
      frame?.draw(ctx, clock, dt, false);
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const sync = () => {
      const frozen = still || motionQuery.matches;
      if (frozen || document.hidden || !onScreen) {
        stop();
        if (frozen) paintStill();
        return;
      }
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };

    const onResize = () => {
      if (!build()) return;
      stop();
      if (still || motionQuery.matches) paintStill();
      else frame?.draw(ctx, clock, 0, false);
      sync();
    };

    onResize();
    const observer = new ResizeObserver(onResize);
    observer.observe(canvas);
    let io: IntersectionObserver | null = null;
    if (contained && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(entries => {
        onScreen = entries.some(e => e.isIntersecting);
        sync();
      });
      io.observe(canvas);
    }
    document.addEventListener('visibilitychange', sync);
    motionQuery.addEventListener('change', sync);

    return () => {
      stop();
      observer.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      motionQuery.removeEventListener('change', sync);
    };
  }, [scene, isDark, contained, still]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: contained ? 'absolute' : 'fixed',
        inset: 0,
        width: '100%',
        height: contained ? '100%' : FIXED_HEIGHT,
        // Same layering as TopoField: the Dashboard root isolates, so -1 sits
        // above the App background and below every panel.
        zIndex: contained ? 0 : -1,
        pointerEvents: 'none',
        // Its own compositor layer, so scrolling the page over it moves
        // layers instead of repainting the scene under every panel.
        transform: contained ? undefined : 'translateZ(0)',
        willChange: contained ? undefined : 'transform',
      }}
    />
  );
};

/**
 * The background behind staff Home: the seasonal scene a super admin has
 * switched on, or the everyday contour field when none is (or its end date
 * has passed).
 */
const HomeScene: React.FC = () => {
  const { activeSceneId } = useHomeScene('staff');
  const scene = activeSceneId === DEFAULT_SCENE_ID ? undefined : findScene(activeSceneId);
  return scene ? <SceneCanvas key={scene.id} scene={scene} /> : <TopoField />;
};

export default HomeScene;

/**
 * The same scene behind the parent portal, when the super admin has ticked
 * "Also show on the parent portal". Draws nothing otherwise: the portal's
 * everyday look is its plain background, not the staff contour field.
 */
export const PortalScene: React.FC = () => {
  const { activeSceneId, setting } = useHomeScene('portal');
  const scene = setting?.showOnPortal && activeSceneId !== DEFAULT_SCENE_ID ? findScene(activeSceneId) : undefined;
  return scene ? <SceneCanvas key={scene.id} scene={scene} /> : null;
};
