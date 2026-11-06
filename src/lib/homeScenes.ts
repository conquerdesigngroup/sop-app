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

export type HolidaySeason = 'halloween' | 'thanksgiving' | 'christmas' | 'newyear' | 'valentines' | 'recital';

/** The holidays, in the order the picker groups them, with their headings. */
export const HOLIDAY_SEASONS: { id: HolidaySeason; name: string }[] = [
  { id: 'halloween', name: 'Halloween' },
  { id: 'thanksgiving', name: 'Thanksgiving' },
  { id: 'christmas', name: 'Christmas' },
  { id: 'newyear', name: "New Year's" },
  { id: 'valentines', name: "Valentine's" },
  { id: 'recital', name: 'Recital and competition season' },
];

/**
 * A sensible "until" for each holiday: the day after it (for Christmas,
 * Twelfth Night; for Thanksgiving, the Sunday after), this year's or next
 * year's once this year's has gone. Recital season has no fixed date: null.
 */
export const suggestedEnd = (season: HolidaySeason, today = new Date()): string | null => {
  const y = today.getFullYear();
  const next = (make: (year: number) => Date) => {
    const d = make(y);
    return localDayKey(localDayKey(d) < localDayKey(today) ? make(y + 1) : d);
  };
  switch (season) {
    case 'thanksgiving':
      return next(year => {
        const first = new Date(year, 10, 1).getDay();
        return new Date(year, 10, 1 + ((4 - first + 7) % 7) + 21 + 3);
      });
    case 'christmas':
      return `${today.getMonth() === 0 ? y : y + 1}-01-06`;
    case 'halloween':
      return next(year => new Date(year, 10, 1));
    case 'newyear':
      return next(year => new Date(year, 0, 2));
    case 'valentines':
      return next(year => new Date(year, 1, 15));
    default:
      return null;
  }
};

export interface HomeSceneDef {
  id: string;
  name: string;
  /** One line for the picker in Settings. */
  blurb: string;
  season: HolidaySeason;
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

// ---------------------------------------------------------------------------
// Thanksgiving. The same rules, an autumn palette: rust, amber, gold and
// crimson, matching the Thanksgiving app palette's garland (src/lib/appPalettes.ts).
// ---------------------------------------------------------------------------

const LEAF_TONES = ['194,65,12', '202,138,4', '185,28,28', '217,119,6', '161,98,7', '146,64,14'];
type LeafKind = 'maple' | 'oak';

/**
 * One leaf, pre-rendered once per shape and colour (the same trick as
 * softDisc): a filled silhouette with a darker vein and a soft highlight, so a
 * leaf reads as a leaf at 10px and at 40px.
 */
const leafSprite = (kind: LeafKind, rgb: string): HTMLCanvasElement => {
  const key = `leaf|${kind}|${rgb}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    g.translate(size / 2, size / 2);
    g.scale(4, 4);
    g.translate(0, -14);
    g.beginPath();
    if (kind === 'maple') {
      const pts = [[0, 8], [1.4, 11], [4.2, 9.6], [3.6, 12.4], [6.6, 13], [4, 14.8], [5, 17.6], [1.6, 16.6], [0.6, 20], [0, 19.2],
        [-0.6, 20], [-1.6, 16.6], [-5, 17.6], [-4, 14.8], [-6.6, 13], [-3.6, 12.4], [-4.2, 9.6], [-1.4, 11]];
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    } else {
      g.moveTo(0, 8);
      g.bezierCurveTo(2, 8.6, 3.4, 9.6, 2.6, 11);
      g.bezierCurveTo(4.4, 11, 4.8, 12.6, 3.4, 13.6);
      g.bezierCurveTo(5, 14, 4.8, 15.8, 3, 16.4);
      g.bezierCurveTo(3.8, 18, 2.4, 19.6, 0, 20.4);
      g.bezierCurveTo(-2.4, 19.6, -3.8, 18, -3, 16.4);
      g.bezierCurveTo(-4.8, 15.8, -5, 14, -3.4, 13.6);
      g.bezierCurveTo(-4.8, 12.6, -4.4, 11, -2.6, 11);
      g.bezierCurveTo(-3.4, 9.6, -2, 8.6, 0, 8);
    }
    g.closePath();
    const fill = g.createLinearGradient(-6, 8, 6, 20);
    fill.addColorStop(0, `rgb(${rgb})`);
    fill.addColorStop(1, `rgba(${rgb},.82)`);
    g.fillStyle = fill;
    g.fill();
    g.save();
    g.clip();
    const hi = g.createRadialGradient(-2, 11, 0, -2, 11, 7);
    hi.addColorStop(0, 'rgba(255,240,200,.35)');
    hi.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = hi;
    g.fillRect(-8, 6, 16, 16);
    g.restore();
    g.strokeStyle = 'rgba(60,20,0,.35)';
    g.lineWidth = 0.45;
    g.beginPath();
    g.moveTo(0, 7);
    g.lineTo(0, 19);
    g.moveTo(0, 14);
    g.lineTo(3.4, 11.4);
    g.moveTo(0, 14);
    g.lineTo(-3.4, 11.4);
    g.stroke();
  }
  spriteCache.set(key, c);
  return c;
};

interface Leaf {
  x: number; y: number; s: number; v: number; a: number; rot: number; spin: number;
  ph: number; flip: number; sway: number; tone: string; kind: LeafKind;
}

const makeLeaf = (w: number, h: number, layer: number, anywhere: boolean, pinkChance: number): Leaf => {
  const L = [
    { s: [11, 15], v: [16, 24], a: 0.5 },
    { s: [18, 26], v: [26, 38], a: 0.85 },
    { s: [32, 42], v: [42, 56], a: 0.95 },
  ][layer];
  return {
    x: rnd(-20, w + 20), y: anywhere ? rnd(-20, h) : rnd(-60, -20),
    s: rnd(L.s[0], L.s[1]), v: rnd(L.v[0], L.v[1]), a: L.a * rnd(0.75, 1),
    rot: rnd(0, TAU), spin: rnd(-0.9, 0.9), ph: rnd(0, TAU), flip: rnd(0.6, 1.4), sway: rnd(14, 34),
    tone: rand() < pinkChance ? PINK : LEAF_TONES[Math.floor(rand() * LEAF_TONES.length)],
    kind: rand() < 0.65 ? 'maple' : 'oak',
  };
};

/** Tumbling: rotating as it falls, and turning over (a squash on one axis) as it swings. */
const drawLeaf = (ctx: CanvasRenderingContext2D, l: Leaf, t: number, alpha: number) => {
  ctx.save();
  ctx.translate(l.x, l.y);
  ctx.rotate(l.rot);
  ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(t * l.flip + l.ph))));
  ctx.globalAlpha = l.a * alpha;
  ctx.drawImage(leafSprite(l.kind, l.tone), -l.s / 2, -l.s / 2, l.s, l.s);
  ctx.restore();
};

const stepLeaf = (l: Leaf, t: number, dt: number, wind: number) => {
  l.y += l.v * dt;
  l.x += (wind + Math.sin(t * 0.9 + l.ph) * l.sway) * dt;
  l.rot += l.spin * dt;
};

/**
 * Falling Leaves: maple and oak leaves in rust, amber, gold and crimson,
 * tumbling down in three depths on a slow gust. The autumn First Snow.
 */
const fallingLeaves: HomeSceneDef = {
  id: 'leaves',
  name: 'Falling Leaves',
  blurb: 'Maple and oak leaves in rust, amber and gold, tumbling down on a slow breeze.',
  season: 'thanksgiving',
  fps: 30,
  create(w, h, { dark }) {
    const d = density(w, h);
    const leaves: (Leaf & { layer: number })[] = [];
    [20, 12, 4].forEach((n, layer) => {
      for (let i = 0; i < Math.round(n * d); i++) leaves.push({ ...makeLeaf(w, h, layer, true, 1 / 45), layer });
    });
    return {
      draw(ctx, t, dt) {
        ctx.clearRect(0, 0, w, h);
        // Low autumn light: warm from the top, a little ember along the foot.
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, dark ? 'rgba(217,119,6,.07)' : 'rgba(251,191,36,.16)');
        g.addColorStop(0.5, 'rgba(0,0,0,0)');
        g.addColorStop(1, dark ? 'rgba(194,65,12,.09)' : 'rgba(234,88,12,.10)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        const wind = Math.sin(t * 0.11) * 12 + Math.max(0, Math.sin(t * 0.29)) * 22;
        for (const l of leaves) {
          stepLeaf(l, t, dt, wind * (0.5 + l.layer * 0.4));
          if (l.y > h + 30 || l.x > w + 40 || l.x < -40) Object.assign(l, makeLeaf(w, h, l.layer, false, 1 / 45));
          drawLeaf(ctx, l, t, dark ? 0.9 : 1);
        }
        ctx.globalAlpha = 1;
      },
    };
  },
};

/**
 * Harvest Field: golden hour over rolling fields along the foot of the screen.
 * A low harvest sun (a moon in dark mode), a red barn with a lit window,
 * pumpkins and hay bales in the foreground, geese crossing now and then, and
 * a few leaves on the wind. Static parts are drawn once, like the village.
 */
const harvestField: HomeSceneDef = {
  id: 'harvest',
  name: 'Harvest Field',
  blurb: 'Golden hour over the fields: a red barn, pumpkins, hay bales and geese heading south.',
  season: 'thanksgiving',
  fps: 30,
  create(w, h, { dark, floor = 0 }) {
    const ground = h - floor - Math.min(floor ? 20 : 56, h * 0.06);
    const u = Math.min(1.5, Math.max(0.85, w / 390));
    const pal = dark
      ? { far: '#2A1D1C', mid: '#1E1517', near: '#130E10', barn: '#3A1814', trim: 'rgba(255,230,200,.25)', pumpkin: ['#9A3A0A', '#8A4A0A'], hay: '#5C4524', hayLine: 'rgba(0,0,0,.35)', stem: '#2F3D17' }
      : { far: '#EBCB9C', mid: '#CF9457', near: '#7A4A22', barn: '#9B2C1F', trim: 'rgba(255,255,255,.9)', pumpkin: ['#EA580C', '#D97706'], hay: '#D8AA52', hayLine: 'rgba(120,70,20,.35)', stem: '#3F6212' };

    const hillY = (x: number, base: number, amp: number, f: number, ph: number) =>
      base - Math.sin(x / w * f + ph) * amp - Math.sin(x / w * f * 2.7 + ph * 2) * amp * 0.35;
    const farBase = ground - 70 * u, midBase = ground - 30 * u;
    const farPh = rnd(0, TAU), midPh = rnd(0, TAU);
    const sun = { x: w * rnd(0.62, 0.8), y: farBase - 40 * u, r: 44 * u };
    let barnWin: { x: number; y: number; w: number; h: number } | null = null;

    const stat = document.createElement('canvas');
    const S = Math.min(2, window.devicePixelRatio || 1);
    stat.width = Math.max(1, Math.round(w * S));
    stat.height = Math.max(1, Math.round(h * S));
    const g = stat.getContext('2d');

    const hill = (c: CanvasRenderingContext2D, base: number, amp: number, f: number, ph: number, fill: string) => {
      c.fillStyle = fill;
      c.beginPath();
      c.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) c.lineTo(x, hillY(x, base, amp, f, ph));
      c.lineTo(w, h);
      c.closePath();
      c.fill();
    };

    const pumpkin = (c: CanvasRenderingContext2D, x: number, r: number, col: string) => {
      const y = ground - r * 0.9;
      c.fillStyle = col;
      for (const dx of [-0.55, 0.55, 0]) {
        c.beginPath();
        c.ellipse(x + dx * r, y, r * (dx ? 0.62 : 0.6), r * 0.9, 0, 0, TAU);
        c.fill();
      }
      c.strokeStyle = 'rgba(0,0,0,.18)';
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(x - r * 0.3, y - r * 0.8);
      c.quadraticCurveTo(x - r * 0.55, y, x - r * 0.3, y + r * 0.8);
      c.moveTo(x + r * 0.3, y - r * 0.8);
      c.quadraticCurveTo(x + r * 0.55, y, x + r * 0.3, y + r * 0.8);
      c.stroke();
      c.fillStyle = pal.stem;
      c.fillRect(x - r * 0.08, y - r * 1.15, r * 0.16, r * 0.35);
    };

    const bale = (c: CanvasRenderingContext2D, x: number, bw: number) => {
      const bh = bw * 0.62;
      c.fillStyle = pal.hay;
      c.beginPath();
      c.roundRect ? c.roundRect(x, ground - bh, bw, bh, bh * 0.25) : c.rect(x, ground - bh, bw, bh);
      c.fill();
      c.strokeStyle = pal.hayLine;
      c.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        c.beginPath();
        c.moveTo(x + 3, ground - bh * (i / 4));
        c.lineTo(x + bw - 3, ground - bh * (i / 4));
        c.stroke();
      }
    };

    const sheaf = (c: CanvasRenderingContext2D, x: number, sh: number) => {
      c.strokeStyle = dark ? '#4A3820' : '#B98A3A';
      c.lineWidth = 1.2;
      for (let i = -4; i <= 4; i++) {
        c.beginPath();
        c.moveTo(x + i * 0.6, ground);
        c.quadraticCurveTo(x + i * 0.4, ground - sh * 0.5, x + i * 2.2, ground - sh);
        c.stroke();
      }
      c.strokeStyle = dark ? '#6B2A12' : '#9B2C1F';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x - 4, ground - sh * 0.45);
      c.lineTo(x + 4, ground - sh * 0.45);
      c.stroke();
    };

    if (g) {
      g.setTransform(S, 0, 0, S, 0, 0);
      hill(g, farBase, 14 * u, 4, farPh, pal.far);
      hill(g, midBase, 10 * u, 6, midPh, pal.mid);

      // The barn, on the middle hill.
      const bx = w * rnd(0.12, 0.3);
      const bw = 46 * u, bh = 28 * u;
      const by = hillY(bx + bw / 2, midBase, 10 * u, 6, midPh) + 4 * u;
      g.fillStyle = pal.barn;
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx, by - bh);
      g.lineTo(bx + bw * 0.18, by - bh - 12 * u);
      g.lineTo(bx + bw / 2, by - bh - 20 * u);
      g.lineTo(bx + bw * 0.82, by - bh - 12 * u);
      g.lineTo(bx + bw, by - bh);
      g.lineTo(bx + bw, by);
      g.closePath();
      g.fill();
      // White trim and the X on the doors.
      g.strokeStyle = pal.trim;
      g.lineWidth = 1.2 * u;
      const dw = 16 * u, dh = 16 * u, dx = bx + bw / 2 - dw / 2, dy = by - dh;
      g.strokeRect(dx, dy, dw, dh);
      g.beginPath();
      g.moveTo(dx, dy); g.lineTo(dx + dw, dy + dh);
      g.moveTo(dx + dw, dy); g.lineTo(dx, dy + dh);
      g.stroke();
      barnWin = { x: bx + bw / 2 - 3.5 * u, y: by - bh - 9 * u, w: 7 * u, h: 6 * u };

      // Near field, then the foreground: pumpkins, bales and corn sheaves.
      hill(g, ground + 4 * u, 3 * u, 3, rnd(0, TAU), pal.near);
      for (let x = rnd(-10, 20); x < w + 20;) {
        const k = rand();
        if (k < 0.5) {
          const n = 1 + Math.floor(rand() * 3);
          for (let i = 0; i < n; i++) pumpkin(g, x + i * 15 * u, rnd(6, 10) * u, pal.pumpkin[Math.floor(rand() * 2)]);
          x += n * 15 * u + rnd(20, 60) * u;
        } else if (k < 0.8) {
          const bw2 = rnd(24, 32) * u;
          bale(g, x, bw2);
          x += bw2 + rnd(24, 70) * u;
        } else {
          sheaf(g, x, rnd(30, 40) * u);
          x += rnd(30, 70) * u;
        }
      }
    }

    // A V of geese every forty seconds or so, crossing the sky slowly.
    const geese = Array.from({ length: 7 }, (_, i) => ({ dx: -Math.ceil(i / 2) * 14, dy: (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 7, ph: rnd(0, TAU) }));
    const geeseY = farBase - rnd(140, 220) * u;
    const leaves = Array.from({ length: Math.round(8 * density(w, h)) }, () => ({ ...makeLeaf(w, h, 1, true, 0), y: rnd(0, ground) }));
    const motes = Array.from({ length: Math.round(22 * density(w, h)) }, () => ({ x: rnd(0, w), y: rnd(ground - 200 * u, ground), v: rnd(4, 10), ph: rnd(0, TAU) }));
    const sunRgb = dark ? '252,211,77' : '253,186,116';

    return {
      draw(ctx, t, dt, still) {
        ctx.clearRect(0, 0, w, h);
        // Golden hour: a warm wash rising from the fields.
        const sky = ctx.createLinearGradient(0, 0, 0, ground);
        if (dark) {
          sky.addColorStop(0, 'rgba(40,20,40,0)');
          sky.addColorStop(0.6, 'rgba(120,40,40,.08)');
          sky.addColorStop(1, 'rgba(234,88,12,.22)');
        } else {
          sky.addColorStop(0, 'rgba(255,237,213,.10)');
          sky.addColorStop(0.55, 'rgba(254,215,170,.22)');
          sky.addColorStop(1, 'rgba(251,146,60,.42)');
        }
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, ground);

        // The low sun (harvest moon in dark mode), sitting behind the far hills.
        const pulse = still ? 1 : 1 + 0.03 * Math.sin(t * 0.5);
        ctx.globalAlpha = dark ? 0.4 : 0.55;
        const R = sun.r * 4 * pulse;
        ctx.drawImage(softDisc(sunRgb, 0.12), sun.x - R, sun.y - R, R * 2, R * 2);
        ctx.globalAlpha = dark ? 0.9 : 0.85;
        ctx.fillStyle = dark ? '#FCD9A0' : '#FDBA74';
        ctx.beginPath();
        ctx.arc(sun.x, sun.y, sun.r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (!still) {
          const span = w + 260;
          const gx = ((t * 14) % (span * 2.2)) - 130;
          if (gx < span) {
            ctx.strokeStyle = dark ? 'rgba(255,236,210,.45)' : 'rgba(91,58,41,.55)';
            ctx.lineWidth = 1.3;
            ctx.lineCap = 'round';
            for (const b of geese) {
              const x = gx + b.dx * u, y = geeseY + b.dy * u + Math.sin(t * 0.4) * 6;
              const flap = Math.sin(t * 5 + b.ph) * 3 * u;
              ctx.beginPath();
              ctx.moveTo(x - 6 * u, y - flap);
              ctx.quadraticCurveTo(x - 2 * u, y - 2 * u, x, y);
              ctx.quadraticCurveTo(x + 2 * u, y - 2 * u, x + 6 * u, y - flap);
              ctx.stroke();
            }
          }
        }

        ctx.drawImage(stat, 0, 0, w, h);

        // The barn window, lit and flickering.
        if (barnWin) {
          const bw = barnWin as { x: number; y: number; w: number; h: number };
          const flick = still ? 0.9 : 0.85 + 0.1 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 6.1);
          ctx.globalAlpha = 0.4 * flick;
          ctx.drawImage(softDisc('255,190,110', 0.1), bw.x + bw.w / 2 - 14 * u, bw.y + bw.h / 2 - 14 * u, 28 * u, 28 * u);
          ctx.globalAlpha = flick;
          ctx.fillStyle = '#FFC266';
          ctx.fillRect(bw.x, bw.y, bw.w, bw.h);
        }

        // Dust and chaff catching the light, drifting up.
        for (const m of motes) {
          if (!still) { m.y -= m.v * dt; m.x += Math.sin(t * 0.7 + m.ph) * 4 * dt; }
          if (m.y < ground - 220 * u) { m.y = ground; m.x = rnd(0, w); }
          const tw = 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.6 + m.ph), 2);
          ctx.globalAlpha = (dark ? 0.55 : 0.45) * tw;
          ctx.drawImage(softDisc(dark ? '253,186,116' : '255,247,230', 0.3, 32), m.x - 3, m.y - 3, 6, 6);
        }

        const wind = 8 + Math.max(0, Math.sin(t * 0.3)) * 20;
        for (const l of leaves) {
          stepLeaf(l, t, dt, wind);
          if (l.y > ground || l.x > w + 40) Object.assign(l, makeLeaf(w, h, 1, false, 0));
          drawLeaf(ctx, l, t, 0.85);
        }
        ctx.globalAlpha = 1;
      },
    };
  },
};

/**
 * Autumn Boughs: maple branches reaching in from the top corners, hung with
 * leaves that sway, and every few seconds one lets go and tumbles down. A
 * pink leaf is hidden among them.
 */
const autumnBoughs: HomeSceneDef = {
  id: 'boughs',
  name: 'Autumn Boughs',
  blurb: 'Maple branches in from the top corners, leaves swaying and letting go one by one.',
  season: 'thanksgiving',
  fps: 30,
  create(w, h, { dark, ceiling = 0 }) {
    const u = Math.min(1.4, Math.max(0.8, w / 390));
    const bark = dark ? '#4A3730' : '#5B3A29';
    type Spot = { x: number; y: number; s: number; tone: string; kind: LeafKind; ph: number; rot: number; gone: number };
    const spots: Spot[] = [];
    const segs: { x1: number; y1: number; cx: number; cy: number; x2: number; y2: number; w1: number; w2: number }[] = [];
    const leafAt = (x: number, y: number, size: number) => spots.push({
      x, y, s: size, ph: rnd(0, TAU), rot: rnd(-0.7, 0.7), gone: 0,
      tone: LEAF_TONES[Math.floor(rand() * LEAF_TONES.length)], kind: rand() < 0.7 ? 'maple' : 'oak',
    });

    // A bough: each limb bends a little and droops under its own weight,
    // tapers to a twig, and carries leaves along its outer limbs, not just in
    // a clump at the tips.
    const grow = (x: number, y: number, ang: number, len: number, width: number, depth: number) => {
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len + len * 0.08;
      const bend = rnd(-0.18, 0.18) * len;
      const cx = (x + x2) / 2 - Math.sin(ang) * bend, cy = (y + y2) / 2 + Math.cos(ang) * bend;
      const w2 = width * 0.62;
      segs.push({ x1: x, y1: y, cx, cy, x2, y2, w1: width, w2 });
      if (depth <= 1) {
        const n = depth === 0 ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const k = depth === 0 ? rnd(0.45, 1) : rnd(0.3, 0.9);
          leafAt(x + (x2 - x) * k + rnd(-5, 5) * u, y + (y2 - y) * k + rnd(-2, 6) * u, rnd(11, 17) * u);
        }
      }
      if (depth === 0) return;
      const n = depth > 2 ? 2 : rand() < 0.5 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * rnd(0.35, 0.6);
        grow(x2, y2, ang + spread + rnd(-0.12, 0.12) + 0.06, len * rnd(0.62, 0.78), w2, depth - 1);
      }
    };
    const reach = Math.min(w * 0.42, 260 * u);
    grow(-12, ceiling + 6 * u, rnd(0.12, 0.25), reach * 0.42, 8 * u, 4);
    grow(w + 12, ceiling + 22 * u, Math.PI - rnd(0.12, 0.25), reach * 0.4, 7.5 * u, 4);
    if (spots.length) spots[Math.floor(rand() * spots.length)].tone = PINK;

    const stat = document.createElement('canvas');
    const S = Math.min(2, window.devicePixelRatio || 1);
    stat.width = Math.max(1, Math.round(w * S));
    stat.height = Math.max(1, Math.round(h * S));
    const g = stat.getContext('2d');
    if (g) {
      g.setTransform(S, 0, 0, S, 0, 0);
      g.strokeStyle = bark;
      g.lineCap = 'round';
      g.globalAlpha = dark ? 0.95 : 0.9;
      // Tapered: each limb drawn in a few strokes that thin toward its end.
      for (const s of segs) {
        const steps = 4;
        for (let i = 0; i < steps; i++) {
          const a = i / steps, b = (i + 1) / steps;
          const at = (k: number) => [
            (1 - k) * (1 - k) * s.x1 + 2 * (1 - k) * k * s.cx + k * k * s.x2,
            (1 - k) * (1 - k) * s.y1 + 2 * (1 - k) * k * s.cy + k * k * s.y2,
          ];
          const [ax, ay] = at(a), [bx, by] = at(b);
          g.lineWidth = Math.max(0.7, s.w1 + (s.w2 - s.w1) * (a + b) / 2);
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.stroke();
        }
      }
    }

    const falling: Leaf[] = [];
    let nextDrop = rnd(2, 5);
    return {
      draw(ctx, t, dt, still) {
        ctx.clearRect(0, 0, w, h);
        const glow = ctx.createLinearGradient(0, 0, 0, h * 0.5);
        glow.addColorStop(0, dark ? 'rgba(217,119,6,.08)' : 'rgba(251,191,36,.14)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h * 0.5);
        ctx.drawImage(stat, 0, 0, w, h);

        if (!still) {
          nextDrop -= dt;
          if (nextDrop <= 0) {
            nextDrop = rnd(2.5, 6);
            const live = spots.filter(s => s.gone <= 0 && s.tone !== PINK);
            const s = live[Math.floor(rand() * live.length)];
            if (s) {
              s.gone = rnd(14, 24);
              falling.push({ ...makeLeaf(w, h, 2, false, 0), x: s.x, y: s.y, s: s.s, tone: s.tone, kind: s.kind, rot: s.rot, a: 0.95 });
            }
          }
        }
        // Leaves still on the branch, swaying from the stem; a fallen one grows back slowly.
        for (const s of spots) {
          let a = 1;
          if (s.gone > 0) {
            if (!still) s.gone -= dt;
            a = s.gone > 3 ? 0 : 1 - s.gone / 3;
            if (a <= 0) continue;
          }
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(s.rot + (still ? 0 : Math.sin(t * 1.1 + s.ph) * 0.12));
          ctx.globalAlpha = a * (dark ? 0.9 : 0.95);
          ctx.drawImage(leafSprite(s.kind, s.tone), -s.s / 2, -s.s * 0.2, s.s, s.s);
          ctx.restore();
        }
        const wind = 6 + Math.sin(t * 0.2) * 10;
        for (let i = falling.length - 1; i >= 0; i--) {
          const l = falling[i];
          stepLeaf(l, t, dt, wind);
          if (l.y > h + 30) { falling.splice(i, 1); continue; }
          drawLeaf(ctx, l, t, 1);
        }
        ctx.globalAlpha = 1;
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Halloween, New Year's, Valentine's and recital season.
// ---------------------------------------------------------------------------

/**
 * Halloween Night: a big moon, bats wheeling slowly across it, mist drifting
 * low, and jack-o'-lanterns flickering along the foot of the screen. In light
 * mode it is dusk: a violet-to-ember sky wash and an orange moon.
 */
const halloweenNight: HomeSceneDef = {
  id: 'moon',
  name: 'Halloween Night',
  blurb: 'A big moon, bats wheeling past it, low mist and flickering jack-o’-lanterns.',
  season: 'halloween',
  fps: 30,
  create(w, h, { dark, floor = 0, ceiling = 0 }) {
    const u = Math.min(1.5, Math.max(0.85, w / 390));
    const ground = h - floor - Math.min(floor ? 18 : 48, h * 0.05);
    const moon = { x: w * rnd(0.74, 0.84), y: ceiling + Math.min(h * 0.16, 150) + 20 * u, r: 60 * u };
    const bats = Array.from({ length: Math.round(5 + 3 * density(w, h)) }, () => ({
      cx: rnd(0, w), cy: rnd(ceiling + 40, h * 0.55), rx: rnd(60, 160) * u, ry: rnd(16, 40) * u,
      sp: rnd(0.08, 0.18) * (rand() < 0.5 ? -1 : 1), ph: rnd(0, TAU), s: rnd(1, 1.8) * u, flap: rnd(6, 9),
    }));
    const lanterns: { x: number; r: number; ph: number }[] = [];
    for (let x = rnd(10, 60); x < w - 10; x += rnd(70, 150) * u) lanterns.push({ x, r: rnd(9, 14) * u, ph: rnd(0, TAU) });
    const mist = Array.from({ length: 6 }, () => ({ x: rnd(0, w), y: ground - rnd(0, 50) * u, r: rnd(80, 160) * u, v: rnd(4, 10) }));
    const ink = dark ? '#09070C' : '#2B1A3A';

    const bat = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, f: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.quadraticCurveTo(-5, -6 - f * 5, -13, -3 - f * 7);
      ctx.quadraticCurveTo(-10, 0, -11, 2);
      ctx.quadraticCurveTo(-7, 0, -5, 3);
      ctx.quadraticCurveTo(-3, 1, 0, 3);
      ctx.quadraticCurveTo(3, 1, 5, 3);
      ctx.quadraticCurveTo(7, 0, 11, 2);
      ctx.quadraticCurveTo(10, 0, 13, -3 - f * 7);
      ctx.quadraticCurveTo(5, -6 - f * 5, 0, -2);
      ctx.fill();
      ctx.restore();
    };

    return {
      draw(ctx, t, dt, still) {
        ctx.clearRect(0, 0, w, h);
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        if (dark) {
          sky.addColorStop(0, 'rgba(60,30,90,.18)');
          sky.addColorStop(0.7, 'rgba(0,0,0,0)');
          sky.addColorStop(1, 'rgba(196,68,14,.12)');
        } else {
          sky.addColorStop(0, 'rgba(124,92,180,.20)');
          sky.addColorStop(0.55, 'rgba(240,200,220,.12)');
          sky.addColorStop(1, 'rgba(238,106,46,.28)');
        }
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        // The moon, with a soft halo and a few maria.
        const mRgb = dark ? '246,238,214' : '251,170,90';
        ctx.globalAlpha = dark ? 0.35 : 0.45;
        ctx.drawImage(softDisc(mRgb, 0.15), moon.x - moon.r * 3.5, moon.y - moon.r * 3.5, moon.r * 7, moon.r * 7);
        ctx.globalAlpha = 1;
        ctx.fillStyle = dark ? '#F3EAD3' : '#FBAA5A';
        ctx.beginPath();
        ctx.arc(moon.x, moon.y, moon.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = dark ? 'rgba(180,165,140,.35)' : 'rgba(200,100,40,.30)';
        for (const [dx, dy, r] of [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [-0.05, 0.4, 0.12], [0.35, -0.35, 0.1]]) {
          ctx.beginPath();
          ctx.arc(moon.x + dx * moon.r, moon.y + dy * moon.r, r * moon.r, 0, TAU);
          ctx.fill();
        }

        // Bats on slow loops; the wings beat, the loops do not hurry.
        ctx.fillStyle = ink;
        ctx.globalAlpha = dark ? 0.95 : 0.85;
        for (const b of bats) {
          const a = b.ph + t * b.sp;
          const x = b.cx + Math.cos(a) * b.rx;
          const y = b.cy + Math.sin(a * 2) * b.ry;
          const f = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * b.flap + b.ph);
          bat(ctx, ((x % (w + 60)) + w + 60) % (w + 60) - 30, y, b.s, f);
        }
        ctx.globalAlpha = 1;

        // Low mist rolling along the ground.
        for (const m of mist) {
          if (!still) m.x += m.v * dt;
          if (m.x - m.r > w) m.x = -m.r;
          ctx.globalAlpha = dark ? 0.1 : 0.35;
          ctx.drawImage(softDisc(dark ? '170,160,200' : '255,255,255', 0.2), m.x - m.r, m.y - m.r * 0.4, m.r * 2, m.r * 0.8);
        }

        // Jack-o'-lanterns: a glow, a pumpkin, a face lit from inside.
        for (const l of lanterns) {
          const flick = still ? 0.9 : 0.8 + 0.12 * Math.sin(t * 3.1 + l.ph) + 0.08 * Math.sin(t * 9.7 + l.ph * 2);
          const y = ground - l.r * 0.85;
          ctx.globalAlpha = (dark ? 0.45 : 0.3) * flick;
          ctx.drawImage(softDisc('255,150,40', 0.1), l.x - l.r * 4, y - l.r * 4, l.r * 8, l.r * 8);
          ctx.globalAlpha = 1;
          ctx.fillStyle = dark ? '#B4470F' : '#EA580C';
          for (const dx of [-0.5, 0.5, 0]) {
            ctx.beginPath();
            ctx.ellipse(l.x + dx * l.r, y, l.r * 0.62, l.r * 0.85, 0, 0, TAU);
            ctx.fill();
          }
          ctx.fillStyle = '#3F6212';
          ctx.fillRect(l.x - l.r * 0.08, y - l.r * 1.1, l.r * 0.16, l.r * 0.3);
          ctx.fillStyle = `rgba(255,${Math.round(200 + 40 * flick)},90,${0.75 + 0.25 * flick})`;
          const e = l.r * 0.2;
          for (const sx of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(l.x + sx * l.r * 0.35 - e, y - l.r * 0.1);
            ctx.lineTo(l.x + sx * l.r * 0.35, y - l.r * 0.42);
            ctx.lineTo(l.x + sx * l.r * 0.35 + e, y - l.r * 0.1);
            ctx.fill();
          }
          ctx.beginPath();
          ctx.moveTo(l.x - l.r * 0.5, y + l.r * 0.18);
          for (let i = 0; i <= 6; i++) ctx.lineTo(l.x - l.r * 0.5 + (i * l.r) / 6, y + l.r * (i % 2 ? 0.28 : 0.42));
          ctx.quadraticCurveTo(l.x, y + l.r * 0.65, l.x - l.r * 0.5, y + l.r * 0.18);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
    };
  },
};

/**
 * Midnight Gold: champagne bubbles rising from the foot of the screen, gold
 * and silver confetti drifting down, and now and then a soft gold starburst
 * high up that blooms and fades. Nothing bangs.
 */
const midnightGold: HomeSceneDef = {
  id: 'champagne',
  name: 'Midnight Gold',
  blurb: 'Champagne bubbles rising, gold and silver confetti, and the odd soft starburst.',
  season: 'newyear',
  fps: 30,
  create(w, h, { dark, ceiling = 0 }) {
    const d = density(w, h);
    const gold = dark ? '232,190,90' : '184,134,11';
    const silver = dark ? '220,224,232' : '128,136,156';
    const bubbles = Array.from({ length: Math.round(40 * d) }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(2, 7), v: rnd(18, 42), ph: rnd(0, TAU) }));
    const confetti = Array.from({ length: Math.round(46 * d) }, () => ({
      x: rnd(0, w), y: rnd(-h, h), w: rnd(5, 8), l: rnd(10, 17), v: rnd(20, 34), rot: rnd(0, TAU), spin: rnd(-2, 2), ph: rnd(0, TAU),
      tone: rand() < 0.08 ? PINK : rand() < 0.6 ? gold : silver,
    }));
    type Spark = { x: number; y: number; vx: number; vy: number; life: number };
    let bursts: { sparks: Spark[]; age: number }[] = [];
    let next = 1.5;
    const burst = () => {
      const cx = rnd(w * 0.15, w * 0.85), cy = ceiling + rnd(h * 0.1, h * 0.3);
      const n = 48;
      bursts.push({ age: 0, sparks: Array.from({ length: n }, (_, i) => {
        const a = (i / n) * TAU + rnd(-0.05, 0.05), sp = rnd(40, 70);
        return { x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(2.2, 3) };
      }) });
    };
    return {
      draw(ctx, t, dt, still) {
        ctx.clearRect(0, 0, w, h);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, dark ? 'rgba(30,30,70,.25)' : 'rgba(184,134,11,.08)');
        g.addColorStop(1, dark ? 'rgba(232,190,90,.08)' : 'rgba(184,134,11,.14)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        if (still && !bursts.length) { burst(); bursts[0].age = 0.9; bursts[0].sparks.forEach(s => { s.x += s.vx * 0.9; s.y += s.vy * 0.9; }); }
        if (!still) {
          next -= dt;
          if (next <= 0) { burst(); next = rnd(5, 8); }
        }
        bursts = bursts.filter(b => b.age < 3);
        for (const b of bursts) {
          if (!still) b.age += dt;
          for (const s of b.sparks) {
            if (!still) {
              s.vx *= 1 - 0.9 * dt;
              s.vy = s.vy * (1 - 0.9 * dt) + 14 * dt;
              s.x += s.vx * dt;
              s.y += s.vy * dt;
            }
            const a = Math.max(0, 1 - b.age / s.life);
            ctx.globalAlpha = a * (dark ? 0.9 : 0.75);
            ctx.drawImage(softDisc(gold, 0.25, 32), s.x - 6, s.y - 6, 12, 12);
          }
        }

        for (const b of bubbles) {
          if (!still) { b.y -= b.v * dt; b.x += Math.sin(t * 2 + b.ph) * 10 * dt; }
          if (b.y < -10) { b.y = h + 10; b.x = rnd(0, w); }
          ctx.globalAlpha = dark ? 0.55 : 0.6;
          ctx.strokeStyle = `rgba(${gold},.9)`;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,255,255,${dark ? 0.7 : 0.9})`;
          ctx.beginPath();
          ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, TAU);
          ctx.fill();
        }

        for (const c of confetti) {
          if (!still) { c.y += c.v * dt; c.x += Math.sin(t * 1.3 + c.ph) * 16 * dt; c.rot += c.spin * dt; }
          if (c.y > h + 20) { c.y = -20; c.x = rnd(0, w); }
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.rotate(c.rot);
          ctx.scale(1, Math.max(0.2, Math.abs(Math.cos(t * 2.4 + c.ph))));
          ctx.globalAlpha = dark ? 0.85 : 0.8;
          ctx.fillStyle = `rgb(${c.tone})`;
          ctx.fillRect(-c.w / 2, -c.l / 2, c.w, c.l);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      },
    };
  },
};

const heartPath = (ctx: CanvasRenderingContext2D, s: number) => {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.5, -s * 1.05, 0, -s * 0.5);
  ctx.bezierCurveTo(s * 0.5, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
  ctx.closePath();
};

/**
 * Floating Hearts: hearts in rose, red and blush rising slowly in three
 * depths, swaying as they go, the far ones soft. A glint now and then.
 */
const floatingHearts: HomeSceneDef = {
  id: 'hearts',
  name: 'Floating Hearts',
  blurb: 'Hearts in rose, red and blush rising slowly and swaying, the far ones soft.',
  season: 'valentines',
  fps: 30,
  create(w, h, { dark }) {
    const d = density(w, h);
    const tones = dark ? ['244,114,182', '225,29,72', '251,207,232', '190,24,93'] : ['219,39,119', '225,29,72', '244,114,182', '190,24,93'];
    const hearts: { x: number; y: number; s: number; v: number; ph: number; a: number; tone: string; layer: number; rot: number }[] = [];
    [[18, 5, 8, 0.4], [14, 9, 14, 0.65], [5, 17, 24, 0.8]].forEach(([n, s0, s1, a], layer) => {
      for (let i = 0; i < Math.round(n * d); i++) hearts.push({
        x: rnd(0, w), y: rnd(0, h + 40), s: rnd(s0, s1), v: rnd(10, 18) * (1 + layer * 0.5), ph: rnd(0, TAU), a: a * rnd(0.75, 1),
        tone: tones[Math.floor(rand() * tones.length)], layer, rot: rnd(-0.3, 0.3),
      });
    });
    return {
      draw(ctx, t, dt, still) {
        ctx.clearRect(0, 0, w, h);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, dark ? 'rgba(225,29,72,.10)' : 'rgba(244,114,182,.16)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        for (const p of hearts) {
          if (!still) { p.y -= p.v * dt; p.x += Math.sin(t * 0.7 + p.ph) * 12 * dt; }
          if (p.y < -30) { p.y = h + 30; p.x = rnd(0, w); }
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot + Math.sin(t * 0.9 + p.ph) * 0.18);
          if (p.layer === 0) {
            ctx.globalAlpha = p.a;
            ctx.drawImage(softDisc(p.tone, 0.3, 32), -p.s * 1.2, -p.s * 1.2, p.s * 2.4, p.s * 2.4);
          } else {
            const fill = ctx.createLinearGradient(-p.s, -p.s, p.s, p.s);
            fill.addColorStop(0, `rgba(${p.tone},${p.a})`);
            fill.addColorStop(1, `rgba(${p.tone},${p.a * 0.7})`);
            ctx.fillStyle = fill;
            heartPath(ctx, p.s);
            ctx.fill();
            ctx.globalAlpha = 0.45 * p.a;
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.ellipse(-p.s * 0.38, -p.s * 0.45, p.s * 0.16, p.s * 0.1, -0.6, 0, TAU);
            ctx.fill();
          }
          ctx.restore();
          if (p.layer === 2) {
            const tw = Math.pow(0.5 + 0.5 * Math.sin(t * 0.8 + p.ph * 3), 10);
            glint(ctx, p.x - p.s * 0.4, p.y - p.s * 0.5, 3 + tw * 5, tw, '255,255,255');
          }
        }
        ctx.globalAlpha = 1;
      },
    };
  },
};

/**
 * Stage Lights: recital and competition season. Spotlight beams from the top
 * sweep slowly across the page and pool on the floor, dust turning in them,
 * a velvet valance along the top edge.
 */
const stageLights: HomeSceneDef = {
  id: 'stage',
  name: 'Stage Lights',
  blurb: 'Recital season: spotlights sweeping slowly, dust in the beams and a velvet valance.',
  season: 'recital',
  fps: 30,
  create(w, h, { dark, ceiling = 0, floor = 0 }) {
    const u = Math.min(1.4, Math.max(0.85, w / 390));
    const n = w > 700 ? 4 : 3;
    const beams = Array.from({ length: n }, (_, i) => ({
      x: ((i + 0.5) / n) * w, sp: rnd(0.12, 0.2), ph: rnd(0, TAU), amp: rnd(0.18, 0.3),
      tone: i === Math.floor(n / 2) ? '226,20,79' : dark ? '255,200,120' : '250,204,21',
    }));
    const motes = Array.from({ length: Math.round(40 * density(w, h)) }, () => ({ x: rnd(0, w), y: rnd(ceiling, h), v: rnd(-4, 4), ph: rnd(0, TAU), s: rnd(1, 2.2) }));
    const val = ceiling;
    const velvet = dark ? '#5B0F24' : '#8E1B36';
    const floorY = h - floor;
    return {
      draw(ctx, t, dt, still) {
        ctx.clearRect(0, 0, w, h);
        if (!dark) {
          ctx.fillStyle = 'rgba(40,30,60,.06)';
          ctx.fillRect(0, 0, w, h);
        }
        // Beams: a cone from a fixture at the top to a pool on the floor.
        ctx.globalCompositeOperation = dark ? 'screen' : 'source-over';
        const len = floorY - val;
        for (const b of beams) {
          const ang = Math.sin(t * b.sp + b.ph) * b.amp;
          const tx = b.x + Math.tan(ang) * len;
          const spread = len * 0.2;
          const g = ctx.createLinearGradient(b.x, val, tx, floorY);
          g.addColorStop(0, `rgba(${b.tone},${dark ? 0.26 : 0.22})`);
          g.addColorStop(1, `rgba(${b.tone},${dark ? 0.07 : 0.06})`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(b.x - 6 * u, val);
          ctx.lineTo(b.x + 6 * u, val);
          ctx.lineTo(tx + spread, floorY);
          ctx.lineTo(tx - spread, floorY);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = dark ? 0.35 : 0.4;
          ctx.drawImage(softDisc(b.tone, 0.2), tx - spread * 1.3, floorY - spread * 0.35, spread * 2.6, spread * 0.7);
          ctx.globalAlpha = 1;
        }
        ctx.globalCompositeOperation = 'source-over';

        // Dust turning in the light.
        for (const m of motes) {
          if (!still) { m.y += m.v * dt; m.x += Math.sin(t * 0.5 + m.ph) * 5 * dt; }
          if (m.y < ceiling) m.y = h; if (m.y > h) m.y = ceiling;
          const tw = 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.4 + m.ph), 2);
          ctx.globalAlpha = (dark ? 0.6 : 0.55) * tw;
          ctx.fillStyle = dark ? '#FFF1D6' : '#B8860B';
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.s, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // The valance: velvet swags along the top edge, gold fringe.
        const sw = 70 * u;
        const depth = 22 * u;
        ctx.fillStyle = velvet;
        ctx.fillRect(0, 0, w, val + 6 * u);
        ctx.beginPath();
        ctx.moveTo(0, val);
        for (let x = 0; x < w; x += sw) ctx.quadraticCurveTo(x + sw / 2, val + depth * 2, x + sw, val);
        ctx.lineTo(w, 0);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = dark ? 'rgba(232,190,90,.75)' : '#C9A227';
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.moveTo(0, val);
        for (let x = 0; x < w; x += sw) ctx.quadraticCurveTo(x + sw / 2, val + depth * 2, x + sw, val);
        ctx.stroke();
        // Shading in each fold.
        for (let x = 0; x < w; x += sw) {
          const g = ctx.createLinearGradient(x, 0, x + sw, 0);
          g.addColorStop(0, 'rgba(0,0,0,.25)');
          g.addColorStop(0.5, 'rgba(255,255,255,.08)');
          g.addColorStop(1, 'rgba(0,0,0,.25)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x, val);
          ctx.quadraticCurveTo(x + sw / 2, val + depth * 2, x + sw, val);
          ctx.lineTo(x + sw, 0);
          ctx.lineTo(x, 0);
          ctx.closePath();
          ctx.fill();
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
  fallingLeaves,
  harvestField,
  autumnBoughs,
  halloweenNight,
  midnightGold,
  floatingHearts,
  stageLights,
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
