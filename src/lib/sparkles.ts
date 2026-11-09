/**
 * A burst of Christmas sparkles from a point: four-point stars and glints in
 * gold, white, red and green that fly out, twinkle, drift down and fade. Drawn
 * on its own canvas fixed over the page and appended to <body>, removed when
 * done (about two seconds), catches no taps.
 *
 * Under prefers-reduced-motion nothing is drawn; callers say it in words.
 */

export const CHRISTMAS_SPARKLES = ['#FFD966', '#F5C451', '#FFFFFF', '#FFF3C4', '#E2344F', '#2FA86A'];

const star = (ctx: CanvasRenderingContext2D, r: number) => {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.28;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
};

/**
 * Each colour's star and dot, glow included, drawn once onto a small sprite.
 * shadowBlur per particle per frame is the expensive way to glow, and on a
 * phone it is the difference between a sparkle and a stutter.
 */
const SPRITE = 48;
const sprite = (color: string, round: boolean): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const g = c.getContext('2d');
  if (!g) return c;
  g.translate(SPRITE / 2, SPRITE / 2);
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, SPRITE / 2);
  glow.addColorStop(0, color);
  glow.addColorStop(0.25, color + '88');
  glow.addColorStop(1, color + '00');
  g.globalAlpha = 0.55;
  g.fillStyle = glow;
  g.fillRect(-SPRITE / 2, -SPRITE / 2, SPRITE, SPRITE);
  g.globalAlpha = 1;
  g.fillStyle = color;
  if (round) {
    g.beginPath();
    g.arc(0, 0, SPRITE * 0.1, 0, Math.PI * 2);
    g.fill();
  } else star(g, SPRITE * 0.42);
  return c;
};

export const burstSparkles = (x: number, y: number, colors: string[] = CHRISTMAS_SPARKLES) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '2147483000' });
  document.body.appendChild(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const sprites = new Map<string, HTMLCanvasElement>();
  const spriteFor = (color: string, round: boolean) => {
    const k = `${color}${round}`;
    if (!sprites.has(k)) sprites.set(k, sprite(color, round));
    return sprites.get(k)!;
  };

  const pieces = Array.from({ length: 70 }, (_, i) => {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 340;
    return {
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 120,
      r: i % 5 === 0 ? 7 + Math.random() * 5 : 2.5 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 6,
      tw: 8 + Math.random() * 10,
      ph: Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      round: Math.random() < 0.3,
    };
  });
  const LIFE = 2.1;
  let t = 0, last = 0;
  const frame = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    t += dt;
    ctx.clearRect(0, 0, w, h);
    // A soft flash where he was, for the first moment.
    if (t < 0.35) {
      const k = 1 - t / 0.35;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 70);
      g.addColorStop(0, `rgba(255,240,190,${0.8 * k})`);
      g.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 70, y - 70, 140, 140);
    }
    const fade = Math.max(0, 1 - Math.max(0, t - LIFE * 0.5) / (LIFE * 0.5));
    ctx.globalCompositeOperation = 'lighter';
    for (const p of pieces) {
      p.vx *= 1 - 2.2 * dt;
      p.vy = p.vy * (1 - 2.2 * dt) + 160 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      const twinkle = 0.55 + 0.45 * Math.sin(t * p.tw + p.ph);
      ctx.save();
      ctx.globalAlpha = fade * twinkle;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const size = p.r * 2.6;
      ctx.drawImage(spriteFor(p.color, p.round), -size, -size, size * 2, size * 2);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (t < LIFE) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
};
