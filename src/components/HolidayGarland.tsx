import React, { useEffect, useRef, useState } from 'react';
import { theme } from '../theme';
import { useCurrentPalette } from '../hooks/useAppPalette';
import type { GarlandItem, GarlandShape } from '../lib/appPalettes';

/**
 * A holiday garland hung along the bottom edge of the top bar: lights for
 * Christmas, fall leaves, acorns and pumpkins for Thanksgiving, pumpkins and
 * bats for Halloween, and so on (`garland` on each palette in
 * src/lib/appPalettes.ts). Renders nothing when the palette has none.
 *
 * Drop it in as the last child of a sticky/positioned header. It hangs below
 * the header's edge over the page, takes no space, catches no taps and is
 * hidden from screen readers. It measures its own width and draws only the
 * ornaments that fit, so nothing in it is ever wider than the screen (an svg
 * that merely clips a longer string still trips audit:mobile).
 *
 * Bulbs twinkle and everything else sways a little (holiday-twinkle and
 * holiday-sway in index.css), staggered per ornament; index.css freezes both
 * under prefers-reduced-motion. Colours are literal hex, so they are safe as
 * SVG attributes; the twine is the one theme token and goes through style.
 */

const SPACING = 30;
const HEIGHT = 26;

const HolidayGarland: React.FC = () => {
  const palette = useCurrentPalette();
  const items = palette.garland;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const on = !!items && items.length > 0;

  useEffect(() => {
    const el = wrapRef.current;
    if (!on || !el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [on]);

  if (!on) return null;
  const count = Math.floor(width / SPACING);

  let twine = 'M0 3';
  for (let i = 0; i < count; i++) twine += ` Q${i * SPACING + SPACING / 2} 9 ${(i + 1) * SPACING} 3`;

  return (
    <div ref={wrapRef} aria-hidden="true" data-holiday-garland={palette.id} style={styles.wrap}>
      <svg width="100%" height={HEIGHT} style={{ display: 'block', overflow: 'hidden' }}>
        <path d={twine} style={{ fill: 'none', stroke: theme.colors.txt.tertiary, strokeWidth: 1, opacity: 0.6 }} />
        {Array.from({ length: count }, (_, i) => (
          <Ornament
            key={i}
            item={items![i % items!.length]}
            x={i * SPACING + SPACING / 2}
            // A fixed scatter rather than Math.random, so a re-render does
            // not restart every ornament.
            delay={((i * 7) % 11) * 0.37}
          />
        ))}
      </svg>
    </div>
  );
};

/** One ornament, hung from (x, 6). Also used by the Settings preview. */
export const Ornament: React.FC<{ item: GarlandItem; x: number; delay?: number }> = ({ item, x, delay = 0 }) => (
  <g transform={`translate(${x} 0)`}>
    <g
      className={item.shape === 'bulb' ? 'holiday-bulb' : 'holiday-sway'}
      style={{ animationDelay: `${delay}s` }}
    >
      {SHAPES[item.shape](item.color)}
    </g>
  </g>
);

const CAP = '#4A4A50';
const STEM = '#5B3A1E';

/** Each drawn about (0, 14), roughly 12px across, hanging from (0, 6). */
const SHAPES: Record<GarlandShape, (c: string) => React.ReactNode> = {
  bulb: c => (
    <>
      <circle cx={0} cy={14} r={7} fill={c} opacity={0.28} />
      <rect x={-1.6} y={6} width={3.2} height={3} rx={0.8} fill={CAP} />
      <ellipse cx={0} cy={14.5} rx={3.2} ry={4.6} fill={c} />
      <ellipse cx={-1} cy={13} rx={0.9} ry={1.6} fill="#FFFFFF" opacity={0.55} />
    </>
  ),
  ornament: c => (
    <>
      <line x1={0} y1={5} x2={0} y2={8} stroke={CAP} strokeWidth={0.8} />
      <rect x={-1.8} y={7.5} width={3.6} height={2.2} rx={0.6} fill="#C9A23A" />
      <circle cx={0} cy={14.5} r={5} fill={c} />
      <path d="M-4.6 13.4 Q0 15.2 4.6 13.4" fill="none" stroke="#FFFFFF" strokeWidth={0.8} opacity={0.6} />
      <circle cx={-1.8} cy={12.6} r={1.1} fill="#FFFFFF" opacity={0.5} />
    </>
  ),
  // Maple: five lobes, hung by its stem.
  leaf: c => (
    <>
      <line x1={0} y1={5} x2={0} y2={9} stroke={STEM} strokeWidth={0.9} />
      <path
        d="M0 8 L1.4 11 L4.2 9.6 L3.6 12.4 L6.6 13 L4 14.8 L5 17.6 L1.6 16.6 L0.6 20 L0 19.2 L-0.6 20 L-1.6 16.6 L-5 17.6 L-4 14.8 L-6.6 13 L-3.6 12.4 L-4.2 9.6 L-1.4 11 Z"
        fill={c}
      />
      <path d="M0 9 V19 M0 14 L3.6 11.6 M0 14 L-3.6 11.6" fill="none" stroke="#000000" strokeWidth={0.5} opacity={0.25} />
    </>
  ),
  oakLeaf: c => (
    <>
      <line x1={0} y1={5} x2={0} y2={8.5} stroke={STEM} strokeWidth={0.9} />
      <path
        d="M0 8 C2 8.6 3.4 9.6 2.6 11 C4.4 11 4.8 12.6 3.4 13.6 C5 14 4.8 15.8 3 16.4 C3.8 18 2.4 19.6 0 20.4 C-2.4 19.6 -3.8 18 -3 16.4 C-4.8 15.8 -5 14 -3.4 13.6 C-4.8 12.6 -4.4 11 -2.6 11 C-3.4 9.6 -2 8.6 0 8 Z"
        fill={c}
      />
      <path d="M0 8.6 V19.6" fill="none" stroke="#000000" strokeWidth={0.5} opacity={0.25} />
    </>
  ),
  acorn: c => (
    <>
      <line x1={0} y1={5} x2={0} y2={8.4} stroke={STEM} strokeWidth={0.9} />
      <ellipse cx={0} cy={15.4} rx={3.6} ry={4.4} fill="#C08A3E" />
      <path d="M-4.6 12.2 Q0 7.6 4.6 12.2 Q0 13.6 -4.6 12.2 Z" fill={c} />
      <ellipse cx={-1.2} cy={15} rx={0.8} ry={1.6} fill="#FFFFFF" opacity={0.3} />
    </>
  ),
  pumpkin: c => (
    <>
      <line x1={0} y1={5} x2={0} y2={9.6} stroke="#3F6212" strokeWidth={1.4} />
      <ellipse cx={-2.6} cy={15} rx={3.2} ry={4.2} fill={c} />
      <ellipse cx={2.6} cy={15} rx={3.2} ry={4.2} fill={c} />
      <ellipse cx={0} cy={15} rx={3} ry={4.6} fill={c} />
      <path d="M0 10.6 V19.4 M-2.6 11 Q-4 15 -2.6 19 M2.6 11 Q4 15 2.6 19" fill="none" stroke="#000000" strokeWidth={0.5} opacity={0.22} />
    </>
  ),
  bat: c => (
    <>
      <line x1={0} y1={5} x2={0} y2={10} stroke={CAP} strokeWidth={0.7} />
      <path
        d="M0 10.6 C1 10.6 1.6 11.4 1.6 12.2 C3 10.8 5.6 10.4 7.4 11.4 C6.2 12 6 13.2 6.4 14.2 C5.2 13.4 3.8 13.8 3.4 14.8 C2.6 14 1.6 14.2 0 15.6 C-1.6 14.2 -2.6 14 -3.4 14.8 C-3.8 13.8 -5.2 13.4 -6.4 14.2 C-6 13.2 -6.2 12 -7.4 11.4 C-5.6 10.4 -3 10.8 -1.6 12.2 C-1.6 11.4 -1 10.6 0 10.6 Z"
        fill={c}
      />
      <circle cx={-0.6} cy={12} r={0.35} fill="#FDE047" />
      <circle cx={0.6} cy={12} r={0.35} fill="#FDE047" />
    </>
  ),
  heart: c => (
    <>
      <line x1={0} y1={5} x2={0} y2={10.6} stroke={CAP} strokeWidth={0.7} />
      <path d="M0 20 C-6.4 15.4 -6.4 10 -3 10 C-1.4 10 -0.4 11 0 12 C0.4 11 1.4 10 3 10 C6.4 10 6.4 15.4 0 20 Z" fill={c} />
      <ellipse cx={-2.6} cy={12.4} rx={0.9} ry={1.3} fill="#FFFFFF" opacity={0.45} />
    </>
  ),
  shamrock: c => (
    <>
      <line x1={0} y1={5} x2={0} y2={9} stroke={CAP} strokeWidth={0.7} />
      <circle cx={0} cy={11.6} r={2.9} fill={c} />
      <circle cx={-2.9} cy={15.2} r={2.9} fill={c} />
      <circle cx={2.9} cy={15.2} r={2.9} fill={c} />
      <path d="M0 14.4 Q0.6 18 2.2 20.4" fill="none" stroke={c} strokeWidth={1.2} strokeLinecap="round" />
    </>
  ),
  snowflake: c => (
    <>
      <line x1={0} y1={5} x2={0} y2={8.4} stroke={CAP} strokeWidth={0.7} />
      <g stroke={c} strokeWidth={1.2} strokeLinecap="round" fill="none">
        <path d="M0 8.6 V20.6 M-5.2 11.6 L5.2 17.6 M-5.2 17.6 L5.2 11.6" />
        <path d="M-1.4 9.8 L0 11.2 L1.4 9.8 M-1.4 19.4 L0 18 L1.4 19.4" />
      </g>
    </>
  ),
  star: c => (
    <>
      <line x1={0} y1={5} x2={0} y2={8.4} stroke={CAP} strokeWidth={0.7} />
      <path d="M0 8.2 L1.8 12.4 L6.2 12.8 L2.8 15.6 L3.9 20 L0 17.6 L-3.9 20 L-2.8 15.6 L-6.2 12.8 L-1.8 12.4 Z" fill={c} />
    </>
  ),
  star6: c => (
    <>
      <line x1={0} y1={5} x2={0} y2={8} stroke={CAP} strokeWidth={0.7} />
      <g fill="none" stroke={c} strokeWidth={1.3} strokeLinejoin="round">
        <path d="M0 8.4 L5.4 17.6 H-5.4 Z" />
        <path d="M0 20.6 L-5.4 11.4 H5.4 Z" />
      </g>
    </>
  ),
  flower: c => (
    <>
      <line x1={0} y1={5} x2={0} y2={9} stroke="#3F6212" strokeWidth={0.8} />
      {[0, 72, 144, 216, 288].map(a => (
        <ellipse key={a} cx={0} cy={11} rx={2.1} ry={3} fill={c} transform={`rotate(${a} 0 14.4)`} />
      ))}
      <circle cx={0} cy={14.4} r={1.8} fill="#FDE68A" />
    </>
  ),
  holly: c => (
    <>
      <line x1={0} y1={5} x2={0} y2={10} stroke={CAP} strokeWidth={0.7} />
      <path d="M0 13 C-2 10.6 -5 10.4 -7 11.4 C-6 12.2 -6.2 13.4 -5.4 14 C-4.4 13.6 -3.4 14.4 -3.6 15.4 C-2 15.4 -0.8 14.6 0 13 Z" fill={c} />
      <path d="M0 13 C2 10.6 5 10.4 7 11.4 C6 12.2 6.2 13.4 5.4 14 C4.4 13.6 3.4 14.4 3.6 15.4 C2 15.4 0.8 14.6 0 13 Z" fill={c} />
      <circle cx={-1.4} cy={15} r={1.6} fill="#DC2626" />
      <circle cx={1.4} cy={15} r={1.6} fill="#DC2626" />
      <circle cx={0} cy={17.2} r={1.6} fill="#B91C1C" />
    </>
  ),
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: `-${HEIGHT - 6}px`,
    height: `${HEIGHT}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: 1,
  },
};

export default HolidayGarland;
