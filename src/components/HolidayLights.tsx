import React, { useEffect, useRef, useState } from 'react';
import { theme } from '../theme';
import { useCurrentPalette } from '../hooks/useAppPalette';

/**
 * A string of holiday lights hung along the bottom edge of the top bar, for
 * the palettes that have one (Christmas Red & Green, Christmas Lights in
 * src/lib/appPalettes.ts). Renders nothing for every other palette.
 *
 * Drop it in as the last child of a sticky/positioned header. It hangs 14px
 * below the header's edge over the page, takes no space, catches no taps and
 * is hidden from screen readers. It measures its own width and draws only the
 * bulbs that fit, so nothing in it is ever wider than the screen (an svg that
 * merely clips a longer string still trips audit:mobile).
 *
 * The bulbs twinkle with a staggered CSS animation (holiday-twinkle in
 * index.css), which index.css already freezes under prefers-reduced-motion.
 * Bulb colours are literal hex, so they are safe as SVG attributes.
 */

const SPACING = 28;

const HolidayLights: React.FC = () => {
  const palette = useCurrentPalette();
  const lights = palette.lights;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const on = !!lights && lights.length > 0;

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
  const COUNT = Math.floor(width / SPACING);

  let wire = 'M0 3';
  for (let i = 0; i < COUNT; i++) wire += ` Q${i * SPACING + SPACING / 2} 9 ${(i + 1) * SPACING} 3`;

  return (
    <div ref={wrapRef} aria-hidden="true" data-holiday-lights={palette.id} style={styles.wrap}>
      <svg width="100%" height="22" style={{ display: 'block', overflow: 'hidden' }}>
        <path d={wire} style={{ fill: 'none', stroke: theme.colors.txt.tertiary, strokeWidth: 1, opacity: 0.6 }} />
        {Array.from({ length: COUNT }, (_, i) => {
          const x = i * SPACING + SPACING / 2;
          const color = lights![i % lights!.length];
          // A fixed scatter rather than Math.random, so a re-render does not
          // restart every bulb.
          const delay = ((i * 7) % 11) * 0.37;
          return (
            <g key={i} className="holiday-bulb" style={{ animationDelay: `${delay}s` }}>
              <circle cx={x} cy={13} r={7} fill={color} opacity={0.28} />
              <rect x={x - 1.6} y={6} width={3.2} height={3} rx={0.8} fill="#4A4A50" />
              <ellipse cx={x} cy={13.5} rx={3.2} ry={4.6} fill={color} />
              <ellipse cx={x - 1} cy={12} rx={0.9} ry={1.6} fill="#FFFFFF" opacity={0.55} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '-16px',
    height: '22px',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: 1,
  },
};

export default HolidayLights;
