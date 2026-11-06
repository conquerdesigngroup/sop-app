import * as fs from 'fs';
import * as path from 'path';
import {
  APP_PALETTES,
  DEFAULT_PALETTE_ID,
  applyPalette,
  currentPalette,
  effectivePaletteId,
  paletteVariables,
} from './appPalettes';
import { darkColors, lightColors } from '../theme';

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('app palettes', () => {
  it('starts with the brand electric as the default', () => {
    expect(APP_PALETTES[0].id).toBe(DEFAULT_PALETTE_ID);
    expect(APP_PALETTES[0].accent).toBe('#E2144F');
  });

  it('has unique ids that fit the database check', () => {
    const ids = APP_PALETTES.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach(id => expect(id.length).toBeLessThanOrEqual(40));
  });

  // The rule that keeps a holiday palette from making anything unreadable:
  // white text on the accent, and the accent on both modes' grounds.
  it.each(APP_PALETTES.map(p => [p.name, p] as const))('%s keeps the accent legible in both modes', (_, p) => {
    // accent2 fills the selected nav item under white text, and is the
    // phone tab bar's active label on the page: the same two jobs.
    [p.accent, ...(p.accent2 ? [p.accent2] : [])].forEach(a => {
      expect(contrast(a, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(a, darkColors.bg.primary)).toBeGreaterThanOrEqual(3.5);
      expect(contrast(a, darkColors.bg.secondary)).toBeGreaterThanOrEqual(3.3);
      expect(contrast(a, lightColors.bg.primary)).toBeGreaterThanOrEqual(4);
      expect(contrast(a, lightColors.bg.secondary)).toBeGreaterThanOrEqual(4.5);
    });
    [p.accent, p.hover, p.dark, ...(p.accent2 ? [p.accent2] : []), ...(p.lights || [])]
      .forEach(c => expect(c).toMatch(/^#[0-9A-F]{6}$/));
  });

  it('gives the navigation its own colour only on two-colour palettes', () => {
    const duo = APP_PALETTES.find(p => p.id === 'christmas_duo')!;
    expect(paletteVariables(duo)['--c-accent-2']).toBe('#15803D');
    expect(paletteVariables(APP_PALETTES[0])['--c-accent-2']).toBe('#E2144F');
  });

  it('falls back to the default after the end date, and for an unknown id', () => {
    expect(effectivePaletteId(null)).toBe(DEFAULT_PALETTE_ID);
    expect(effectivePaletteId({ palette: 'halloween', endsOn: null }, '2026-10-01')).toBe('halloween');
    expect(effectivePaletteId({ palette: 'halloween', endsOn: '2026-10-31' }, '2026-10-31')).toBe('halloween');
    expect(effectivePaletteId({ palette: 'halloween', endsOn: '2026-10-31' }, '2026-11-01')).toBe(DEFAULT_PALETTE_ID);
    expect(effectivePaletteId({ palette: 'not-a-palette', endsOn: null })).toBe(DEFAULT_PALETTE_ID);
  });

  it('sets the accent variables on <html>', () => {
    applyPalette('christmas');
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--c-accent')).toBe('#D42A3A');
    expect(root.getPropertyValue('--c-accent-rgb')).toBe('212, 42, 58');
    expect(currentPalette().id).toBe('christmas');
    applyPalette('nope');
    expect(root.getPropertyValue('--c-accent')).toBe('#E2144F');
    expect(paletteVariables(APP_PALETTES[0])['--c-accent-rgb']).toBe('226, 20, 79');
  });
});

/**
 * theme.colors.primary is a var() now. Two ways to use it silently draw
 * nothing: a hex alpha suffix (`${theme.colors.primary}20` is not a colour)
 * and an SVG presentation attribute (stroke="var(...)" is ignored). Both
 * used to be fine, so guard them.
 */
describe('accent token usage', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
    });
  };
  walk(path.join(__dirname, '..'));

  it('never appends a hex alpha to the accent', () => {
    const bad = files.filter(f => /theme\.colors\.primary(Hover|Dark)?\}[0-9A-Fa-f]{2}\b/.test(fs.readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('never passes the accent as an SVG presentation attribute', () => {
    const bad = files.filter(f => /\b(stroke|fill|stopColor)=\{theme\.colors\.primary/.test(fs.readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
});
