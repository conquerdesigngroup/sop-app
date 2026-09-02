import { AttendanceClass } from '../types/attendance';

/**
 * One colour per dance style, for the progress bars.
 *
 * WHY NOT RED/AMBER/GREEN
 *
 * §6.1 rules out a pass-fail scale, and it is right to. A seven-year-old who
 * had a cold in July should not open the app to a red bar. Colour here encodes
 * *which class* a row is, never how well the child is doing — the same class is
 * the same colour at 40% and at 100%, and the number next to it carries the
 * meaning.
 *
 * These are literal hex, not theme tokens, for two reasons: they must be stable
 * across light and dark (a class does not change identity with the OS setting),
 * and `theme.colors.bg/txt/bdr` are CSS variables that cannot be used as SVG
 * presentation attributes or given an alpha suffix. Each was checked to sit
 * legibly on both #0B0B0D and the light panel.
 *
 * Electric pink is deliberately absent. It is the brand accent, capped at ~5%
 * of a view, and spending it on a progress bar the parent sees six of would
 * blow that budget on the least important colour decision in the app.
 */
const STYLE_COLORS: Record<string, string> = {
  ballet: '#9B8AE0',
  'hip hop': '#2FB8A8',
  hiphop: '#2FB8A8',
  jazz: '#E0A24A',
  tap: '#C77BB8',
  contemporary: '#5B8DEF',
  lyrical: '#6FB6E8',
  acro: '#7FBF6A',
  technique: '#D8974A',
  'turns & jumps': '#D8974A',
  musical: '#E08A6A',
};

const FALLBACK = '#8A90A6';

/** Style first, then category, then a neutral. Never throws on unknown input. */
export const classAccent = (klass: AttendanceClass): string => {
  const style = klass.style?.trim().toLowerCase();
  if (style && STYLE_COLORS[style]) return STYLE_COLORS[style];

  // A partial match catches 'Junior Ballet' and 'Hip Hop Crew' when the style
  // column is empty and only the class name carries the discipline.
  const name = klass.name.toLowerCase();
  const hit = Object.keys(STYLE_COLORS).find(key => name.includes(key));
  return hit ? STYLE_COLORS[hit] : FALLBACK;
};

/**
 * The bar's track. Kept as rgba of the accent rather than a theme token so the
 * empty part of the bar reads as "the rest of this class" instead of a hole.
 */
export const accentTrack = (accent: string): string => `${accent}26`;
