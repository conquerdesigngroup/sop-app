/**
 * The seasonal scenes a super admin can put behind the staff Home screen.
 *
 * Each scene is a Canvas 2D drawing with no dependencies. HomeScene.tsx owns
 * the loop: frame rate, pausing when the tab is hidden, reduced motion,
 * resizing. A scene only answers two questions: how to set itself up for a
 * box of a given size, and how to paint one frame.
 *
 * Rules every scene keeps, because the page in front of it is somebody's work:
 *   - It sits behind glass panels, so it stays quiet. Nothing flashes, nothing
 *     moves faster than a slow drift.
 *   - Electric pink is an accent (a flake, a bulb, a ribbon), never a fill.
 *   - It draws on a transparent canvas over the page background, in both
 *     modes. `dark` is passed in; the scene picks its own palette from it.
 *   - `still` means reduced motion: draw a composed frame and do not animate
 *     anything that depends on wall-clock time.
 *
 * Adding a scene: write a `create` below and add it to HOME_SCENES. The id is
 * what is stored in the database, so never rename one that has shipped.
 */

export type SceneMode = {
  dark: boolean;
  /**
   * Pixels at the foot of the box covered by something fixed (the phone's
   * bottom tab bar). A scene that lives along the bottom stands on top of it.
   */
  floor?: number;
  /** Pixels at the top covered by the sticky header; hanging things hang below it. */
  ceiling?: number;
};

export interface SceneFrame {
  /** Paint one frame. `t` is seconds of scene time, `dt` seconds since the last frame. */
  draw(ctx: CanvasRenderingContext2D, t: number, dt: number, still: boolean): void;
}

export interface HomeSceneDef {
  id: string;
  name: string;
  /** One line for the picker in Settings. */
  blurb: string;
  season: 'christmas';
  /** Frames per second. Nothing here needs 60; most need far less. */
  fps: number;
  create(w: number, h: number, mode: SceneMode): SceneFrame;
}

const TAU = Math.PI * 2;
const PINK = '226,20,79';
/**
 * Snow on a light page. White snow vanishes on white, and grey reads as ash;
 * a cold winter blue reads as snow in shadow, which is what it is against a
 * bright sky.
 */
const LIGHT_SNOW = '150,172,210';
/**
 * Scenes draw their randomness from here rather than Math.random, so the
 * runner can rebuild a scene from the same seed. A resize (a phone rotating,
 * a desktop window dragged) then redraws the SAME village at the new size
 * instead of a different one, which reads as the scene glitching.
 */
let rng: () => number = Math.random;
const rand = () => rng();
const rnd = (a: number, b: number) => a + rand() * (b - a);

/** mulberry32: small, fast, and good enough for where a snowflake goes. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Build a scene with a fixed seed. Only set-up is seeded; anything a scene
 * draws at random later (a flake respawning at the top) uses the live
 * generator, which is fine because it is moving anyway.
 */
export const createSeeded = (scene: HomeSceneDef, seed: number, w: number, h: number, mode: SceneMode): SceneFrame => {
  const previous = rng;
  rng = seeded(seed);
  try {
    return scene.create(w, h, mode);
  } finally {
    rng = previous;
  }
};

/**
 * Scenes are designed on a phone (about 390 x 844). Particle counts scale with
 * the area, so a desktop gets the same density rather than a sparse sky, but
 * capped so a 4K monitor does not pay for four phones' worth of snow.
 */
const density = (w: number, h: number) => Math.min(3, Math.max(0.6, (w * h) / (390 * 844)));

// ---------------------------------------------------------------------------
// Sprites. Drawing a radial gradient per particle per frame is the expensive
// way; one pre-rendered soft disc per colour, stamped with drawImage, is cheap.
// ---------------------------------------------------------------------------

const spriteCache = new Map<string, HTMLCanvasElement>();

const softDisc = (rgb: string, core = 0.18, size = 64): HTMLCanvasElement => {
  const key = `${rgb}|${core}|${size}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const r = size / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, `rgba(${rgb},1)`);
    grd.addColorStop(core, `rgba(${rgb},.85)`);
    grd.addColorStop(0.45, `rgba(${rgb},.22)`);
    grd.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  spriteCache.set(key, c);
  return c;
};

/** A four-point glint, the shape light makes on tinsel. */
const glint = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, a: number, rgb: string) => {
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = `rgb(${rgb})`;
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const ang = (i * TAU) / 4;
    ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
    ctx.lineTo(Math.cos(ang + TAU / 8) * s * 0.16, Math.sin(ang + TAU / 8) * s * 0.16);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

// ---------------------------------------------------------------------------
// Snowfall, shared by First Snow and Holiday Village.
// ---------------------------------------------------------------------------

interface Flake { li: number; x: number; y: number; r: number; v: number; a: number; blur: boolean; ph: number; pink: boolean }

const makeSnow = (w: number, h: number, scale = 1, pinkChance = 1 / 30): Flake[] => {
  const d = density(w, h) * scale;
  const layers = [
    { n: 46, r: [0.6, 1.3], v: [14, 22], a: 0.55, blur: false },
    { n: 26, r: [1.4, 2.4], v: [24, 36], a: 0.7, blur: false },
    { n: 9, r: [7, 13], v: [40, 60], a: 0.22, blur: true },
  ];
  const flakes: Flake[] = [];
  layers.forEach((L, li) => {
    for (let i = 0; i < Math.round(L.n * d); i++) {
      flakes.push({
        li, x: rnd(0, w), y: rnd(0, h), r: rnd(L.r[0], L.r[1]), v: rnd(L.v[0], L.v[1]),
        a: L.a * rnd(0.6, 1), blur: L.blur, ph: rnd(0, TAU), pink: rand() < pinkChance,
      });
    }
  });
  return flakes;
};

const drawSnow = (ctx: CanvasRenderingContext2D, flakes: Flake[], w: number, h: number, t: number, dt: number, snowRgb: string, alpha = 1) => {
  const wind = Math.sin(t * 0.13) * 10 + Math.max(0, Math.sin(t * 0.37)) * 14;
  for (const f of flakes) {
    const depth = 0.5 + f.li * 0.35;
    f.y += f.v * dt;
    f.x += (wind * depth + Math.sin(t * 0.8 + f.ph) * 6) * dt;
    if (f.y > h + 20) { f.y = -20; f.x = rnd(0, w); }
    if (f.x > w + 20) f.x = -20;
    if (f.x < -20) f.x = w + 20;
    const col = f.pink ? PINK : snowRgb;
    if (f.blur) {
      const s = f.r * 4;
      ctx.globalAlpha = f.a * alpha;
      ctx.drawImage(softDisc(col, 0.05), f.x - s / 2, f.y - s / 2, s, s);
    } else {
      ctx.globalAlpha = f.a * alpha;
      ctx.fillStyle = `rgb(${col})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
};

/** Advance a particle scene a few seconds so a still frame looks lived-in, not freshly spawned. */
export const SETTLE_SECONDS = 6;

// ---------------------------------------------------------------------------
// The scenes
// ---------------------------------------------------------------------------

const firstSnow: HomeSceneDef = {
  id: 'snow',
  name: 'First Snow',
  blurb: 'Snow in three depths, a slow wind, and the odd pink flake.',
  season: 'christmas',
  fps: 30,
  create(w, h, { dark }) {
    const flakes = makeSnow(w, h);
    const snow = dark ? '244,244,245' : LIGHT_SNOW;
    return {
      draw(ctx, t, dt) {
        ctx.clearRect(0, 0, w, h);
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.6);
        g.addColorStop(0, dark ? 'rgba(160,170,200,.07)' : 'rgba(150,180,230,.16)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        drawSnow(ctx, flakes, w, h, t, dt, snow);
      },
    };
  },
};

/**
 * Holiday Village: a row of snow-roofed houses along the foot of the screen,
 * windows lit warm, smoke from the chimneys, snow falling over all of it.
 *
 * Everything that does not move (hills, houses, roofs, the snowbank) is drawn
 * once into an offscreen canvas at set-up and stamped each frame. Only the
 * window glow, the smoke and the snow are drawn per frame.
 */
const holidayVillage: HomeSceneDef = {
  id: 'village',
  name: 'Holiday Village',
  blurb: 'A snowy village along the bottom, warm lit windows, chimney smoke and falling snow.',
  season: 'christmas',
  fps: 30,
  create(w, h, { dark, floor = 0 }) {
    const flakes = makeSnow(w, h, 0.8, 0);
    const snow = dark ? '244,244,245' : LIGHT_SNOW;
    const ground = h - floor - Math.min(floor ? 24 : 70, h * 0.07);
    // Houses scale a little with the screen but stay house-sized on a desktop.
    const u = Math.min(1.5, Math.max(0.85, w / 390));

    const pal = dark
      ? { far: '#131318', near: '#1B1B21', edge: 'rgba(255,255,255,.05)', roofSnow: 'rgba(240,242,248,.88)', bank: 'rgba(225,230,242,', hill: '#101015' }
      : // Light mode is winter dusk, not a grey day: slate-blue houses against a
        // peach horizon, deep green pines, and the windows doing the warm work.
        { far: '#9AA8C2', near: '#34405C', edge: 'rgba(255,255,255,.18)', roofSnow: 'rgba(255,255,255,1)', bank: 'rgba(250,252,255,', hill: '#CBD6EA' };
    const pineCol = dark ? { far: pal.far, near: pal.near } : { far: '#93B0A8', near: '#24503F' };

    type Win = { x: number; y: number; w: number; h: number; ph: number; lit: boolean; far: boolean };
    const windows: Win[] = [];
    const chimneys: { x: number; y: number }[] = [];
    let wreath: { x: number; y: number } | null = null;
    let steepleStar: { x: number; y: number } | null = null;

    const stat = document.createElement('canvas');
    const S = Math.min(2, window.devicePixelRatio || 1);
    stat.width = Math.max(1, Math.round(w * S));
    stat.height = Math.max(1, Math.round(h * S));
    const g = stat.getContext('2d');

    const house = (c: CanvasRenderingContext2D, x: number, bw: number, wall: number, far: boolean, opts: { steeple?: boolean; door?: boolean }) => {
      const base = far ? ground - 16 * u : ground;
      const roof = bw * (far ? 0.42 : 0.5);
      const top = base - wall;
      c.fillStyle = far ? pal.far : pal.near;
      c.beginPath();
      c.moveTo(x, base);
      c.lineTo(x, top);
      c.lineTo(x + bw / 2, top - roof);
      c.lineTo(x + bw, top);
      c.lineTo(x + bw, base);
      c.closePath();
      c.fill();
      if (!far) { c.strokeStyle = pal.edge; c.lineWidth = 1; c.stroke(); }

      // Chimney, before the roof snow so the snow sits over its foot.
      if (!opts.steeple && rand() < 0.6) {
        const cx = x + bw * (rand() < 0.5 ? 0.25 : 0.68);
        const slope = Math.abs(cx - (x + bw / 2)) / (bw / 2);
        const roofY = top - roof * (1 - slope);
        c.fillStyle = far ? pal.far : pal.near;
        c.fillRect(cx - 3 * u, roofY - 9 * u, 6 * u, 10 * u);
        c.fillStyle = pal.roofSnow;
        c.fillRect(cx - 3.6 * u, roofY - 10.5 * u, 7.2 * u, 2.2 * u);
        if (!far) chimneys.push({ x: cx, y: roofY - 10 * u });
      }

      // Snow along both roof slopes, thicker at the eaves.
      c.strokeStyle = pal.roofSnow;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.lineWidth = (far ? 2 : 3.2) * u;
      c.beginPath();
      c.moveTo(x - 1.5, top + 0.5);
      c.lineTo(x + bw / 2, top - roof);
      c.lineTo(x + bw + 1.5, top + 0.5);
      c.stroke();

      if (opts.steeple) {
        const sx = x + bw / 2;
        const sTop = top - roof - 30 * u;
        c.fillStyle = far ? pal.far : pal.near;
        c.beginPath();
        c.moveTo(sx - 6 * u, top - roof + 6 * u);
        c.lineTo(sx - 6 * u, top - roof - 8 * u);
        c.lineTo(sx, sTop);
        c.lineTo(sx + 6 * u, top - roof - 8 * u);
        c.lineTo(sx + 6 * u, top - roof + 6 * u);
        c.closePath();
        c.fill();
        steepleStar = { x: sx, y: sTop - 6 * u };
      }

      // Windows: a grid that fits the wall, most of them lit.
      const ww = (far ? 4 : 6) * u;
      const wh = (far ? 5 : 8) * u;
      const cols = Math.max(1, Math.floor((bw - 8 * u) / (ww + 9 * u)));
      const rows = Math.max(1, Math.floor((wall - 10 * u) / (wh + 9 * u)));
      const gx = (bw - cols * ww) / (cols + 1);
      const gy = (wall - rows * wh) / (rows + 1);
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < cols; k++) {
          const wx = x + gx + k * (ww + gx);
          const wy = top + gy + r * (wh + gy);
          // Leave room for a door on the ground floor middle.
          if (opts.door && r === rows - 1 && cols % 2 === 1 && k === Math.floor(cols / 2)) continue;
          windows.push({ x: wx, y: wy, w: ww, h: wh, ph: rnd(0, TAU), lit: rand() < (far ? 0.6 : 0.8), far });
        }
      }
      if (opts.door && !far) {
        const dw = 8 * u, dh = 13 * u;
        const dx = x + bw / 2 - dw / 2;
        c.fillStyle = dark ? '#0E0E12' : '#222A3E';
        c.fillRect(dx, base - dh, dw, dh);
        if (!wreath && rand() < 0.5) wreath = { x: x + bw / 2, y: base - dh - 6 * u };
        else windows.push({ x: dx + 1.5 * u, y: base - dh + 1.5 * u, w: dw - 3 * u, h: 3 * u, ph: rnd(0, TAU), lit: true, far: false });
      }
    };

    const pine = (c: CanvasRenderingContext2D, x: number, size: number, far: boolean) => {
      const base = far ? ground - 14 * u : ground;
      c.fillStyle = far ? pineCol.far : pineCol.near;
      for (let i = 0; i < 3; i++) {
        const tw = size * (1 - i * 0.25);
        const ty = base - i * size * 0.38;
        c.beginPath();
        c.moveTo(x - tw / 2, ty);
        c.lineTo(x, ty - size * 0.62);
        c.lineTo(x + tw / 2, ty);
        c.closePath();
        c.fill();
        c.fillStyle = pal.roofSnow;
        c.beginPath();
        c.moveTo(x - tw * 0.18, ty - size * 0.4);
        c.lineTo(x, ty - size * 0.62);
        c.lineTo(x + tw * 0.18, ty - size * 0.4);
        c.closePath();
        c.fill();
        c.fillStyle = far ? pineCol.far : pineCol.near;
      }
    };

    if (g) {
      g.setTransform(S, 0, 0, S, 0, 0);
      // Distant hill line.
      g.fillStyle = pal.hill;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, ground - 34 * u - Math.sin(x / w * 5 + 1) * 10 * u - Math.sin(x / w * 13) * 4 * u);
      g.lineTo(w, h);
      g.closePath();
      g.fill();

      // Far row, then near row.
      for (let x = -10; x < w + 10;) {
        const bw = rnd(20, 34) * u;
        if (rand() < 0.25) pine(g, x + bw / 2, bw * 0.9, true);
        else house(g, x, bw, rnd(14, 24) * u, true, {});
        x += bw + rnd(2, 8) * u;
      }
      const steepleAt = w * rnd(0.55, 0.7);
      let steepleDone = false;
      for (let x = -14; x < w + 14;) {
        if (rand() < 0.22) {
          const s = rnd(26, 40) * u;
          pine(g, x + s / 2, s, false);
          x += s + rnd(2, 6) * u;
          continue;
        }
        const steeple = !steepleDone && x > steepleAt;
        const bw = (steeple ? 40 : rnd(34, 62)) * u;
        house(g, x, bw, (steeple ? 40 : rnd(24, 46)) * u, false, { steeple, door: true });
        if (steeple) steepleDone = true;
        x += bw + rnd(4, 12) * u;
      }

      // Snowbank along the ground, fading up into the houses.
      const bank = g.createLinearGradient(0, ground - 6, 0, h);
      bank.addColorStop(0, `${pal.bank}${dark ? 0.1 : 0.85})`);
      bank.addColorStop(0.25, `${pal.bank}${dark ? 0.16 : 0.95})`);
      bank.addColorStop(1, `${pal.bank}${dark ? 0.08 : 0.9})`);
      g.fillStyle = bank;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 10) g.lineTo(x, ground - 2 - Math.sin(x * 0.04) * 2 - Math.sin(x * 0.013) * 3);
      g.lineTo(w, h);
      g.closePath();
      g.fill();
    }

    const smoke = chimneys.flatMap(c => Array.from({ length: 5 }, (_, i) => ({ c, age: i / 5, ph: rnd(0, TAU) })));
    const warm = '255,190,110';
    const warmCore = dark ? '#FFC873' : '#FFB648';

    return {
      draw(ctx, t, dt, still) {
        ctx.clearRect(0, 0, w, h);
        // Warm town glow on the horizon, a cold sky above.
        if (dark) {
          const sky = ctx.createLinearGradient(0, ground - 220 * u, 0, ground);
          sky.addColorStop(0, 'rgba(0,0,0,0)');
          sky.addColorStop(1, 'rgba(255,160,80,.10)');
          ctx.fillStyle = sky;
          ctx.fillRect(0, ground - 220 * u, w, 220 * u);
        } else {
          // Dusk: an icy blue sky that warms to peach and rose at the rooftops.
          const sky = ctx.createLinearGradient(0, 0, 0, ground);
          sky.addColorStop(0, 'rgba(176,198,236,.22)');
          sky.addColorStop(0.45, 'rgba(214,224,244,.10)');
          sky.addColorStop(0.78, 'rgba(255,214,190,.30)');
          sky.addColorStop(1, 'rgba(255,184,140,.55)');
          ctx.fillStyle = sky;
          ctx.fillRect(0, 0, w, ground);
        }

        drawSnow(ctx, flakes, w, h, t, dt, snow, 0.9);
        ctx.drawImage(stat, 0, 0, w, h);

        // Chimney smoke: soft puffs that rise, widen and fade.
        for (const p of smoke) {
          if (!still) p.age += dt / 7;
          if (p.age > 1) p.age -= 1;
          const rise = p.age * 70 * u;
          const r = (5 + p.age * 16) * u;
          const x = p.c.x + Math.sin(p.age * 4 + p.ph + t * 0.3) * 5 * u + p.age * 14 * u;
          ctx.globalAlpha = (dark ? 0.1 : 0.32) * Math.sin(p.age * Math.PI);
          ctx.drawImage(softDisc(dark ? '200,200,210' : '255,255,255', 0.3), x - r, p.c.y - rise - r, r * 2, r * 2);
        }

        // Windows: a warm glow behind a lit pane, flickering like a fire inside.
        for (const win of windows) {
          if (!win.lit) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = dark ? 'rgba(255,255,255,.04)' : 'rgba(20,28,48,.35)';
            ctx.fillRect(win.x, win.y, win.w, win.h);
            continue;
          }
          const flick = still ? 0.9 : 0.82 + 0.1 * Math.sin(t * 2.1 + win.ph) + 0.06 * Math.sin(t * 7.3 + win.ph * 2);
          const R = (win.far ? 9 : 16) * u;
          ctx.globalAlpha = (win.far ? 0.25 : 0.38) * (dark ? 1 : 1.35) * flick;
          ctx.drawImage(softDisc(warm, 0.1), win.x + win.w / 2 - R, win.y + win.h / 2 - R, R * 2, R * 2);
          ctx.globalAlpha = (win.far ? 0.7 : 0.95) * flick;
          ctx.fillStyle = warmCore;
          ctx.fillRect(win.x, win.y, win.w, win.h);
          if (!win.far && win.w > 5) {
            ctx.fillStyle = dark ? '#1B1B21' : pal.near;
            ctx.globalAlpha = 0.7;
            ctx.fillRect(win.x + win.w / 2 - 0.5, win.y, 1, win.h);
            ctx.fillRect(win.x, win.y + win.h / 2 - 0.5, win.w, 1);
          }
        }

        // The one pink: a wreath on a door, and a star on the steeple.
        if (wreath) {
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = `rgb(${PINK})`;
          ctx.lineWidth = 2 * u;
          ctx.beginPath();
          ctx.arc(wreath.x, wreath.y, 3.2 * u, 0, TAU);
          ctx.stroke();
        }
        if (steepleStar) {
          const tw = still ? 0.8 : 0.7 + 0.3 * Math.sin(t * 1.4);
          const s = steepleStar as { x: number; y: number };
          ctx.globalAlpha = 0.35 * tw;
          ctx.drawImage(softDisc(PINK, 0.1), s.x - 14 * u, s.y - 14 * u, 28 * u, 28 * u);
          glint(ctx, s.x, s.y, 6 * u, tw, dark ? '255,255,255' : PINK);
        }
        ctx.globalAlpha = 1;
      },
    };
  },
};

const stringLights: HomeSceneDef = {
  id: 'lights',
  name: 'String Lights',
  blurb: 'Fairy lights draped across the top with a slow chase, soft bokeh rising behind.',
  season: 'christmas',
  fps: 30,
  create(w, h, { dark, ceiling = 0 }) {
    const d = density(w, h);
    const bokeh = Array.from({ length: Math.round(16 * d) }, () => ({
      x: rnd(0, w), y: rnd(0, h), r: rnd(16, 46), v: rnd(4, 10), a: rnd(0.08, 0.2), pink: rand() < 0.25, ph: rnd(0, TAU),
    }));
    // Drapes of roughly a phone's width each, overlapping, along the top.
    const strands: { x0: number; y0: number; x1: number; y1: number; sag: number }[] = [];
    const span = Math.min(260, w * 0.62);
    for (let x = -10, i = 0; x < w; x += span * 0.8, i++) {
      strands.push({ x0: x, y0: ceiling + 6 + (i % 2) * 22, x1: x + span, y1: ceiling + 6 + ((i + 1) % 2) * 22, sag: rnd(26, 40) });
    }
    return {
      draw(ctx, t, dt) {
        ctx.clearRect(0, 0, w, h);
        for (const b of bokeh) {
          b.y -= b.v * dt;
          b.x += Math.sin(t * 0.3 + b.ph) * 3 * dt;
          if (b.y < -60) { b.y = h + 60; b.x = rnd(0, w); }
          ctx.globalAlpha = b.a * (dark ? 1 : 0.8);
          ctx.drawImage(softDisc(b.pink ? PINK : dark ? '255,236,205' : '214,170,110', 0.6, 96), b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        }
        let k = 0;
        for (const s of strands) {
          const pt = (u: number): [number, number] => [
            s.x0 + (s.x1 - s.x0) * u,
            s.y0 + (s.y1 - s.y0) * u + s.sag * 4 * u * (1 - u) + Math.sin(t * 0.7 + u * 3) * 1.2,
          ];
          ctx.globalAlpha = dark ? 0.45 : 0.5;
          ctx.strokeStyle = dark ? '#3a3a42' : '#2a2a30';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let u = 0; u <= 1.001; u += 0.02) {
            const [x, y] = pt(u);
            if (u === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
          const nb = Math.round(Math.hypot(s.x1 - s.x0, s.y1 - s.y0) / 20);
          for (let i = 1; i < nb; i++, k++) {
            const [x, y] = pt(i / nb);
            const pink = k % 4 === 2;
            const chase = Math.pow(0.5 + 0.5 * Math.cos(k * 0.55 - t * 2.4), 6);
            const base = 0.45 + 0.55 * chase;
            const col = pink ? PINK : dark ? '255,238,210' : '235,170,80';
            ctx.globalAlpha = (dark ? 0.55 : 0.5) * base;
            const R = 14 + chase * 10;
            ctx.drawImage(softDisc(col), x - R, y + 4 - R, R * 2, R * 2);
            ctx.globalAlpha = 1;
            ctx.fillStyle = `rgba(${col},${0.55 + 0.45 * base})`;
            ctx.beginPath();
            ctx.ellipse(x, y + 4, 2.2, 3.2, 0, 0, TAU);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      },
    };
  },
};

const electricAurora: HomeSceneDef = {
  id: 'aurora',
  name: 'Electric Aurora',
  blurb: 'Ice-white northern lights with one pink curtain, over twinkling stars.',
  season: 'christmas',
  fps: 30,
  create(w, h, { dark, ceiling = 0 }) {
    const stars = Array.from({ length: Math.round(70 * density(w, h)) }, () => ({
      x: rnd(0, w), y: rnd(0, h * 0.55), r: rnd(0.4, 1.1), ph: rnd(0, TAU), sp: rnd(0.6, 1.8),
    }));
    const strips: Record<string, HTMLCanvasElement> = {};
    const strip = (rgb: string) => {
      if (strips[rgb]) return strips[rgb];
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 128;
      const g = c.getContext('2d');
      if (g) {
        const grd = g.createLinearGradient(0, 0, 0, 128);
        grd.addColorStop(0, `rgba(${rgb},0)`);
        grd.addColorStop(0.55, `rgba(${rgb},.55)`);
        grd.addColorStop(0.9, `rgba(${rgb},1)`);
        grd.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = grd;
        g.fillRect(0, 0, 1, 128);
      }
      return (strips[rgb] = c);
    };
    const top = ceiling + Math.min(h * 0.12, 110);
    const curtains = [
      { rgb: dark ? '190,215,235' : '120,140,170', base: top, amp: 26, len: 130, a: dark ? 0.34 : 0.2, s: 0.18, k: 0.018 },
      { rgb: PINK, base: top + Math.min(h * 0.05, 50), amp: 20, len: 80, a: dark ? 0.3 : 0.16, s: -0.14, k: 0.024 },
    ];
    return {
      draw(ctx, t) {
        ctx.clearRect(0, 0, w, h);
        const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
        sky.addColorStop(0, dark ? 'rgba(18,22,38,.9)' : 'rgba(205,212,228,.6)');
        sky.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = dark ? '#F4F4F5' : '#5D5D66';
        for (const s of stars) {
          ctx.globalAlpha = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph))) * (dark ? 0.8 : 0.35);
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, TAU);
          ctx.fill();
        }
        ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
        const step = 2;
        for (const c of curtains) {
          const img = strip(c.rgb);
          for (let x = 0; x < w; x += step) {
            const y = c.base + Math.sin(x * c.k + t * c.s * 3) * c.amp + Math.sin(x * c.k * 2.7 - t * c.s * 5) * c.amp * 0.35;
            const L = c.len * (0.65 + 0.35 * Math.sin(x * 0.05 + t * 0.7));
            const intensity = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(x * 0.031 - t * 0.9 + Math.sin(x * 0.011 + t * 0.3) * 2), 2);
            ctx.globalAlpha = c.a * intensity;
            ctx.drawImage(img, x, y - L, step, L);
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      },
    };
  },
};

const frostedContours: HomeSceneDef = {
  id: 'frost',
  name: 'Frosted Contours',
  blurb: 'The everyday contour lines turned to frost, with tinsel glints and one pink ribbon.',
  season: 'christmas',
  fps: 24,
  create(w, h, { dark }) {
    const n = Math.max(18, Math.round(h / 24));
    const y = (i: number, x: number, t: number) => {
      const base = ((i + 0.5) / n) * h * 1.05 - h * 0.02;
      return base + Math.sin((x / w) * 3.2 + i * 0.45 + t * 0.12) * 16 + Math.sin((x / w) * 7.1 - i * 0.3 - t * 0.08) * 6 + Math.sin(i * 0.9 + t * 0.05) * 8;
    };
    const glints = Array.from({ length: Math.round(14 * density(w, h)) }, () => ({
      line: Math.floor(rnd(0, n)), x: rnd(0, w), v: rnd(18, 40) * (rand() < 0.5 ? -1 : 1), ph: rnd(0, TAU),
    }));
    const ink = dark ? '244,244,245' : '17,17,17';
    const ribbon = Math.round(n * 0.27);
    return {
      draw(ctx, t, dt) {
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < n; i++) {
          const idx = i % 5 === 0;
          const fade = 1 - Math.max(0, i / n - 0.45) * 1.4;
          ctx.strokeStyle = `rgba(${ink},${(idx ? 0.16 : 0.075) * fade})`;
          ctx.lineWidth = idx ? 1.2 : 0.8;
          ctx.beginPath();
          for (let x = -4; x <= w + 4; x += 6) {
            if (x < 0) ctx.moveTo(x, y(i, x, t)); else ctx.lineTo(x, y(i, x, t));
          }
          ctx.stroke();
        }
        ctx.strokeStyle = `rgba(${PINK},.75)`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let x = -4; x <= w + 4; x += 4) {
          const yy = y(ribbon, x, t) + 7 + Math.sin(x * 0.05 + t * 1.2) * 1.5;
          if (x < 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
        for (const g of glints) {
          g.x += g.v * dt;
          if (g.x > w + 10) g.x = -10;
          if (g.x < -10) g.x = w + 10;
          const gy = y(g.line, g.x, t);
          const tw = Math.pow(0.5 + 0.5 * Math.sin(t * 2.2 + g.ph), 3);
          const s = 2 + tw * 6;
          ctx.globalAlpha = 0.5 * tw;
          ctx.drawImage(softDisc(dark ? '244,244,245' : '120,124,140', 0.18, 32), g.x - s * 1.5, gy - s * 1.5, s * 3, s * 3);
          glint(ctx, g.x, gy, s, 0.9 * tw, dark ? '255,255,255' : '60,60,70');
        }
        ctx.globalAlpha = 1;
      },
    };
  },
};

const northStar: HomeSceneDef = {
  id: 'star',
  name: 'North Star',
  blurb: 'A hairline star drawn on in the corner, turning slowly as glitter falls.',
  season: 'christmas',
  fps: 30,
  create(w, h, { dark, ceiling = 0 }) {
    const R = Math.min(90, Math.min(w, h) * 0.17);
    const cx = w - Math.max(R * 1.15, w * 0.2);
    const cy = ceiling + Math.min(h * 0.1, 90);
    const ink = dark ? '244,244,245' : '17,17,17';
    let age = 0;
    const spawn = (anywhere: boolean) => {
      const a = rnd(0, TAU), d = rnd(0, R * 0.6);
      return { x: cx + Math.cos(a) * d, y: anywhere ? rnd(cy, h) : cy + Math.sin(a) * d, v: rnd(10, 26), dx: rnd(-6, 6), s: rnd(0.6, 1.6), ph: rnd(0, TAU), pink: rand() < 0.08 };
    };
    const dust = Array.from({ length: Math.round(40 * density(w, h)) }, () => spawn(true));
    return {
      draw(ctx, t, dt, still) {
        ctx.clearRect(0, 0, w, h);
        age += dt;
        const on = still ? 1 : Math.min(1, age / 2.6);
        const ease = 1 - Math.pow(1 - on, 3);
        const rot = t * 0.03;
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.2);
        halo.addColorStop(0, `rgba(${ink},${dark ? 0.16 : 0.08})`);
        halo.addColorStop(1, `rgba(${ink},0)`);
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-rot * 0.5);
        ctx.lineWidth = 0.7;
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * TAU;
          const breathe = 0.5 + 0.5 * Math.sin(t * 0.6 + i * 1.7);
          const L = R * (1.25 + (i % 2 ? 0.4 : 1.1) * breathe) * ease;
          ctx.strokeStyle = `rgba(${ink},${0.08 + 0.12 * breathe})`;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3);
          ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L);
          ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        const pts: [number, number][] = [];
        for (let i = 0; i < 16; i++) {
          const r = i % 2 ? R * 0.36 : i % 4 ? R * 0.72 : R;
          const a = (i / 16) * TAU - Math.PI / 2;
          pts.push([Math.cos(a) * r, Math.sin(a) * r]);
        }
        let per = 0;
        for (let i = 0; i < 16; i++) {
          const [x0, y0] = pts[i];
          const [x1, y1] = pts[(i + 1) % 16];
          per += Math.hypot(x1 - x0, y1 - y0);
        }
        ctx.setLineDash([per, per]);
        ctx.lineDashOffset = per * (1 - ease);
        ctx.strokeStyle = `rgba(${ink},.95)`;
        ctx.lineWidth = 1.4;
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(${ink},${0.35 * ease})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let i = 0; i < 16; i += 2) { ctx.moveTo(0, 0); ctx.lineTo(pts[i][0], pts[i][1]); }
        ctx.stroke();
        ctx.strokeStyle = `rgba(${PINK},${0.9 * ease})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(pts[0][0], pts[0][1]);
        ctx.stroke();
        ctx.restore();
        glint(ctx, cx, cy, 5 + Math.sin(t * 1.3) * 1.5, ease, dark ? '255,255,255' : '17,17,17');

        for (const p of dust) {
          p.y += p.v * dt;
          p.x += p.dx * dt;
          if (p.y > h + 4) Object.assign(p, spawn(false));
          const tw = 0.5 + 0.5 * Math.sin(t * 3 + p.ph);
          const fall = Math.max(0, 1 - (p.y - cy) / (h * 0.9));
          ctx.globalAlpha = tw * fall * ease * (p.pink ? 1 : 0.85);
          ctx.fillStyle = p.pink ? `rgb(${PINK})` : `rgb(${ink})`;
          ctx.fillRect(p.x, p.y, p.s, p.s);
        }
        ctx.globalAlpha = 1;
      },
    };
  },
};

/**
 * Glass Ornaments: a handful of baubles hanging from the top edge on fine
 * threads, each swinging slowly on its own period, catching the light.
 */
const glassOrnaments: HomeSceneDef = {
  id: 'ornaments',
  name: 'Glass Ornaments',
  blurb: 'Glass baubles hanging from the top edge, swaying slowly and catching the light.',
  season: 'christmas',
  fps: 30,
  create(w, h, { dark, ceiling = 0 }) {
    const count = Math.max(4, Math.min(9, Math.round(w / 70)));
    const tones = dark
      ? ['200,204,214', '120,124,136', '', '230,232,238', '90,94,106']
      : ['150,154,166', '60,62,72', '', '200,202,210', '110,112,124'];
    const balls = Array.from({ length: count }, (_, i) => {
      const x = ((i + 0.5) / count) * w + rnd(-12, 12);
      return {
        x, len: rnd(30, Math.min(160, h * 0.2)), r: rnd(12, 22), amp: rnd(0.04, 0.09), om: rnd(0.5, 0.9), ph: rnd(0, TAU),
        // One pink bauble, in the middle; the rest glass and smoke.
        tone: i === Math.floor(count / 2) ? PINK : tones[[0, 1, 3, 4][i % 4]],
      };
    });
    const flakes = makeSnow(w, h, 0.35, 0);
    return {
      draw(ctx, t, dt) {
        ctx.clearRect(0, 0, w, h);
        drawSnow(ctx, flakes, w, h, t, dt, dark ? '244,244,245' : LIGHT_SNOW, 0.7);
        for (const b of balls) {
          const ang = Math.sin(t * b.om + b.ph) * b.amp;
          const bx = b.x + Math.sin(ang) * b.len;
          const by = ceiling + Math.cos(ang) * b.len;
          ctx.globalAlpha = dark ? 0.35 : 0.4;
          ctx.strokeStyle = dark ? '#9A9AA4' : '#5D5D66';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(b.x, ceiling);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.globalAlpha = 1;
          // cap
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(-ang);
          ctx.fillStyle = dark ? '#3a3a42' : '#9A9AA4';
          ctx.fillRect(-b.r * 0.22, 0, b.r * 0.44, b.r * 0.32);
          ctx.restore();
          const cy = by + b.r * 0.3 + b.r;
          const cx = bx - Math.sin(ang) * b.r;
          // glass body: lit from the upper left
          const g = ctx.createRadialGradient(cx - b.r * 0.35, cy - b.r * 0.4, b.r * 0.1, cx, cy, b.r);
          g.addColorStop(0, `rgba(${b.tone},${dark ? 0.95 : 0.9})`);
          g.addColorStop(0.6, `rgba(${b.tone},${dark ? 0.55 : 0.7})`);
          g.addColorStop(1, `rgba(${b.tone},${dark ? 0.25 : 0.5})`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, b.r, 0, TAU);
          ctx.fill();
          // reflection of the room on the glass
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = 'rgba(255,255,255,.7)';
          ctx.beginPath();
          ctx.ellipse(cx - b.r * 0.38, cy - b.r * 0.42, b.r * 0.22, b.r * 0.12, -0.7, 0, TAU);
          ctx.fill();
          const tw = Math.pow(0.5 + 0.5 * Math.sin(t * 0.9 + b.ph * 3), 8);
          glint(ctx, cx - b.r * 0.42, cy - b.r * 0.46, 3 + tw * 6, tw, '255,255,255');
          ctx.globalAlpha = 1;
        }
      },
    };
  },
};

/** Every seasonal scene, in the order the picker shows them. */
export const HOME_SCENES: HomeSceneDef[] = [
  firstSnow,
  holidayVillage,
  stringLights,
  glassOrnaments,
  electricAurora,
  frostedContours,
  northStar,
];

/** The everyday background: TopoField, not a canvas scene. */
export const DEFAULT_SCENE_ID = 'contours';

export const findScene = (id: string | null | undefined): HomeSceneDef | undefined =>
  HOME_SCENES.find(s => s.id === id);

/** Today as YYYY-MM-DD in local time, which is how ends_on is written. */
export const localDayKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * What Home actually shows, given the saved setting. A scene showing "until"
 * a date shows through that whole day and stops the morning after; an id this
 * build does not know (a newer build saved it, or a scene was retired) falls
 * back to the everyday background rather than to nothing.
 */
export const effectiveSceneId = (
  saved: { scene: string | null; endsOn: string | null } | null,
  today: string = localDayKey(),
): string => {
  if (!saved || !saved.scene || saved.scene === DEFAULT_SCENE_ID) return DEFAULT_SCENE_ID;
  if (saved.endsOn && today > saved.endsOn) return DEFAULT_SCENE_ID;
  return findScene(saved.scene) ? saved.scene : DEFAULT_SCENE_ID;
};
