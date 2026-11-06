import { localDayKey } from './homeScenes';

/**
 * App color themes: the holiday palettes a super admin can switch the whole
 * app to from Settings → App colors.
 *
 * WHAT A PALETTE CHANGES, AND WHAT IT DOES NOT
 *
 * Only the accent: the one colour the brand rule already caps at ~5% of a view
 * (buttons, the active tab, focus rings, links, toggles, badges). Every
 * surface, every text colour, every border and every status colour stays
 * exactly where it is, in light mode and in dark. That is what keeps this
 * low-risk: a holiday palette cannot make a page unreadable, because the
 * things you read are not part of it.
 *
 * `theme.colors.primary / primaryHover / primaryDark` are CSS variables
 * (`--c-accent*`) whose fallbacks are the DIDC electric. applyPalette sets
 * them on <html>; with no palette applied, or on a build that never calls it,
 * the app is pixel-for-pixel the brand default.
 *
 * THE CONTRAST RULE EVERY PALETTE MUST PASS (appPalettes.test.ts)
 *
 * The accent is drawn two ways: as a fill under white text (a primary button)
 * and as text or a ring on the page (a link, the active tab). So each accent
 * has to hold white text at 4.5:1 AND stand off both grounds, the dark panel
 * and the light chalk. The electric itself is 4.7 / 3.8 / 4.3; every palette
 * here sits in the same band. Pale golds and pastels cannot, which is why
 * "gold" is an old gold and the spring colour is a violet, not lilac.
 *
 * Never rename a shipped id: it is what the database stores. An id an old
 * build does not know falls back to the default (effectivePaletteId).
 */

export interface AppPalette {
  id: string;
  name: string;
  blurb: string;
  /** Fills, active states, text links. White text sits on it. */
  accent: string;
  /** Hover, and the lighter tint beside the accent. */
  hover: string;
  /** Pressed. */
  dark: string;
  /**
   * Optional second accent, for the two-colour palettes. It fills the
   * selected item in the navigation (the top bar's active page, the phone
   * tab bar's active tab) while buttons keep `accent`. Held to the same
   * contrast rule. Without it the navigation uses `accent`.
   */
  accent2?: string;
  /**
   * Optional garland hung along the bottom edge of the top bar
   * (HolidayGarland): the ornaments in order, repeated across the width.
   * Purely decorative; colours are literal hex.
   */
  garland?: GarlandItem[];
}

/** The small drawings a garland can hang. Drawn in src/components/HolidayGarland.tsx. */
export type GarlandShape =
  | 'bulb' | 'leaf' | 'oakLeaf' | 'acorn' | 'pumpkin' | 'bat' | 'heart' | 'shamrock'
  | 'snowflake' | 'star' | 'star6' | 'flower' | 'holly' | 'ornament';

export interface GarlandItem {
  shape: GarlandShape;
  color: string;
}

const g = (...items: Array<[GarlandShape, string]>): GarlandItem[] =>
  items.map(([shape, color]) => ({ shape, color }));

export const DEFAULT_PALETTE_ID = 'electric';

export const APP_PALETTES: AppPalette[] = [
  { id: DEFAULT_PALETTE_ID, name: 'DIDC Electric', blurb: 'The everyday brand pink.', accent: '#E2144F', hover: '#FF2D6B', dark: '#C40E45' },
  {
    id: 'christmas', name: 'Christmas Red', blurb: 'Candy-cane red, with red and gold ornaments.', accent: '#D42A3A', hover: '#F0566A', dark: '#B01F2E',
    garland: g(['ornament', '#D42A3A'], ['ornament', '#E0A526'], ['ornament', '#D42A3A'], ['star', '#E0A526']),
  },
  {
    id: 'christmas_duo', name: 'Christmas Red & Green', blurb: 'Red buttons, green tabs, red and green lights.',
    accent: '#D42A3A', hover: '#F0566A', dark: '#B01F2E', accent2: '#15803D',
    garland: g(['bulb', '#E5383B'], ['bulb', '#22A05A']),
  },
  {
    id: 'tree_lights', name: 'Christmas Lights', blurb: 'Multicolour tree lights along the top bar.',
    accent: '#D42A3A', hover: '#F0566A', dark: '#B01F2E', accent2: '#2563EB',
    garland: g(['bulb', '#E5383B'], ['bulb', '#22A05A'], ['bulb', '#F5B700'], ['bulb', '#2F7BF5'], ['bulb', '#F07C1E']),
  },
  {
    id: 'evergreen', name: 'Evergreen', blurb: 'Christmas-tree pine, with sprigs of holly.', accent: '#1D7A55', hover: '#2E9E70', dark: '#145C40',
    garland: g(['holly', '#1D7A55'], ['bulb', '#E5383B'], ['holly', '#1D7A55'], ['bulb', '#F5B700']),
  },
  {
    id: 'winter', name: 'Winter Frost', blurb: 'Icy blue, with snowflakes.', accent: '#0E7490', hover: '#1A9BC0', dark: '#0B5A70',
    garland: g(['snowflake', '#38BDF8'], ['snowflake', '#7DD3FC'], ['snowflake', '#0EA5E9']),
  },
  {
    id: 'hanukkah', name: 'Hanukkah Blue', blurb: 'Deep blue, with blue and silver stars.', accent: '#2563EB', hover: '#3B82F6', dark: '#1D4ED8',
    garland: g(['star6', '#2563EB'], ['star6', '#9CA3AF'], ['star6', '#60A5FA']),
  },
  {
    id: 'new_year', name: 'New Year Gold', blurb: 'Old gold, with gold and silver stars.', accent: '#A16207', hover: '#C98A1C', dark: '#7F4D05',
    garland: g(['star', '#E0A526'], ['star', '#9CA3AF'], ['star', '#F5C542'], ['star', '#C0C4CC']),
  },
  {
    id: 'valentines', name: "Valentine's", blurb: 'Rose pink, with a string of hearts.', accent: '#DB2777', hover: '#EC4899', dark: '#B81E63',
    garland: g(['heart', '#DB2777'], ['heart', '#F472B6'], ['heart', '#E11D48']),
  },
  {
    id: 'st_patricks', name: "St. Patrick's", blurb: 'Kelly green, with shamrocks.', accent: '#0E8048', hover: '#22A05A', dark: '#0A6638',
    garland: g(['shamrock', '#16A34A'], ['shamrock', '#0E8048'], ['star', '#E0A526']),
  },
  {
    id: 'spring', name: 'Spring Violet', blurb: 'Easter and spring recitals, with flowers.', accent: '#9333EA', hover: '#A855F7', dark: '#7A22CC',
    garland: g(['flower', '#A855F7'], ['flower', '#F472B6'], ['flower', '#FACC15'], ['flower', '#60A5FA']),
  },
  {
    id: 'halloween', name: 'Halloween', blurb: 'Pumpkin orange, with pumpkins and bats.', accent: '#C4440E', hover: '#EE6A2E', dark: '#A0370B',
    garland: g(['pumpkin', '#EA580C'], ['bat', '#6D28D9'], ['pumpkin', '#F97316'], ['bat', '#6D28D9']),
  },
  {
    id: 'thanksgiving', name: 'Thanksgiving', blurb: 'Harvest amber, with fall leaves, acorns and pumpkins.', accent: '#B45309', hover: '#D97A2B', dark: '#8F4207',
    garland: g(
      ['leaf', '#C2410C'], ['oakLeaf', '#CA8A04'], ['acorn', '#92400E'], ['leaf', '#B91C1C'],
      ['pumpkin', '#EA580C'], ['oakLeaf', '#D97706'], ['leaf', '#A16207'], ['acorn', '#92400E'],
    ),
  },
];

export const findPalette = (id: string | null | undefined): AppPalette | undefined =>
  APP_PALETTES.find(p => p.id === id);

export const DEFAULT_PALETTE: AppPalette = APP_PALETTES[0];

/**
 * What the app should wear today, given the saved setting. Same rules as the
 * Home background: shows through the whole "until" day, back to the default
 * the morning after, and an unknown id is the default.
 */
export const effectivePaletteId = (
  saved: { palette: string | null; endsOn: string | null } | null,
  today: string = localDayKey(),
): string => {
  if (!saved || !saved.palette || saved.palette === DEFAULT_PALETTE_ID) return DEFAULT_PALETTE_ID;
  if (saved.endsOn && today > saved.endsOn) return DEFAULT_PALETTE_ID;
  return findPalette(saved.palette) ? saved.palette : DEFAULT_PALETTE_ID;
};

const hexToRgbTriple = (hex: string) =>
  [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ');

/** The variables applyPalette writes, for tests and for anything that reads them back. */
export const paletteVariables = (p: AppPalette): Record<string, string> => ({
  '--c-accent': p.accent,
  '--c-accent-hover': p.hover,
  '--c-accent-dark': p.dark,
  '--c-accent-rgb': hexToRgbTriple(p.accent),
  '--c-accent-2': p.accent2 || p.accent,
  // index.css's own names for the same two colours.
  '--c-electric': p.accent,
  '--c-electric-2': p.hover,
});

let applied: AppPalette = DEFAULT_PALETTE;
const listeners = new Set<(p: AppPalette) => void>();

/** Sets the accent variables on <html>. Unknown ids apply the default. */
export const applyPalette = (id: string | null | undefined) => {
  const p = findPalette(id) || DEFAULT_PALETTE;
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    Object.entries(paletteVariables(p)).forEach(([k, v]) => root.style.setProperty(k, v));
    root.setAttribute('data-palette', p.id);
  }
  if (p.id !== applied.id) {
    applied = p;
    listeners.forEach(l => l(p));
  }
};

/** The palette currently on <html>: the WebGL/canvas fields need a real hex. */
export const currentPalette = (): AppPalette => applied;

export const onPaletteChange = (l: (p: AppPalette) => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
