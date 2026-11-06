import { currentPalette } from './appPalettes';

/**
 * A one-shot confetti burst from a point on the screen, drawn on its own
 * canvas fixed over everything and appended to <body>. It is not part of any
 * page, so it carries on over the next screen while the app navigates: the
 * tap goes through straight away and the confetti is the send-off.
 *
 * Colours follow the app palette (its accent, hover and garland colours), so
 * a Halloween front door throws orange and purple. Nothing happens under
 * prefers-reduced-motion. It removes itself after about a second and a half.
 */

const BRIGHTS = ['#FFFFFF', '#F5C451'];

export const confettiColors = (): string[] => {
  const p = currentPalette();
  const garland = (p.garland || []).map(g => g.color);
  return Array.from(new Set([p.accent, p.hover, ...(p.accent2 ? [p.accent2] : []), ...garland, ...BRIGHTS]));
};

export const burstConfetti = (x: number, y: number, colors: string[] = confettiColors()) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '2147483000' });
  document.body.appendChild(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pieces = Array.from({ length: 90 }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const sp = 260 + Math.random() * 420;
    return {
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 14,
      w: 5 + Math.random() * 4, l: 8 + Math.random() * 7, ph: Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)], round: Math.random() < 0.25,
    };
  });
  const LIFE = 1.6;
  let t = 0, last = 0;
  const frame = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    t += dt;
    ctx.clearRect(0, 0, w, h);
    const fade = Math.max(0, 1 - Math.max(0, t - LIFE * 0.55) / (LIFE * 0.45));
    for (const p of pieces) {
      p.vx *= 1 - 1.8 * dt;
      p.vy = p.vy * (1 - 1.8 * dt) + 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.max(0.2, Math.abs(Math.cos(t * 9 + p.ph))));
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-p.w / 2, -p.l / 2, p.w, p.l);
      ctx.restore();
    }
    if (t < LIFE) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
};
