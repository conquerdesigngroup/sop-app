/**
 * The avatar's allowed values (§5.2).
 *
 * A CURATED ENUM, NOT A COLOUR PICKER
 *
 * Every pair below was chosen so the foreground stays legible on the
 * background, and so the whole set still looks like this studio's app. A free
 * picker gives you white-on-yellow within a day, and there is no server-side
 * way to reject "ugly" — but there is a very easy way to reject "not in the
 * list". Validation happens against these constants on both sides: the picker
 * only offers them, and the write path re-checks, because a client that can
 * PATCH its own preferences row can send anything.
 *
 * NO PHOTO UPLOADS ON THIS SURFACE
 *
 * Initials, icons and pattern only. That decision removes image moderation,
 * storage cost, and the question of hosting photographs of children — all at
 * once, for a feature whose entire job is to make a profile feel like yours.
 *
 * Staff photographs are a SEPARATE thing and deliberately not this: a member of
 * staff uploads their own picture on their own staff profile, it is stored on
 * `profiles.avatar_url`, and it never renders on a parent-facing page. See
 * lib/staffPhoto.ts. Nothing in this file reads it.
 *
 * EVERY FIELD ADDED HERE MUST DEFAULT TO WHAT USED TO BE DRAWN
 *
 * `shape`, `pattern` and `ring` arrived after rows were already stored with
 * none of them. Their defaults are 'rounded', 'none' and false precisely
 * because that triple reproduces the original avatar exactly — so a teacher
 * mark saved before this change looks the same after it, with no backfill.
 */

export interface AvatarPaletteEntry {
  key: string;
  label: string;
  bg: string;
  fg: string;
  /**
   * The pattern colour. Never the foreground.
   *
   * Patterns sit BEHIND the letter or glyph, so drawing them in `fg` would put
   * full-contrast shapes directly under full-contrast content and cost the
   * initials their legibility — the one property the palette exists to
   * guarantee. Each `alt` is a near neighbour of its own `bg`: visible as
   * texture, never as a competing mark.
   */
  alt: string;
}

export const AVATAR_PALETTE: AvatarPaletteEntry[] = [
  // The original eight. Order and keys are unchanged — `paletteKey` is stored,
  // so renaming one silently repaints somebody's avatar.
  { key: 'electric', label: 'Electric', bg: '#E2144F', fg: '#FFFFFF', alt: '#F0567F' },
  { key: 'violet', label: 'Violet', bg: '#9B8AE0', fg: '#16121F', alt: '#B4A7EA' },
  { key: 'teal', label: 'Teal', bg: '#2FB8A8', fg: '#06201C', alt: '#5FCEC1' },
  { key: 'cobalt', label: 'Cobalt', bg: '#5B8DEF', fg: '#0A1428', alt: '#84AAF4' },
  { key: 'amber', label: 'Amber', bg: '#E0A24A', fg: '#241804', alt: '#EDBF7E' },
  { key: 'rose', label: 'Rose', bg: '#C77BB8', fg: '#22101E', alt: '#D9A0CE' },
  { key: 'moss', label: 'Moss', bg: '#7FBF6A', fg: '#0F2109', alt: '#A2D392' },
  { key: 'slate', label: 'Slate', bg: '#5A6070', fg: '#FFFFFF', alt: '#7B8294' },

  // Eight more, same rules: contrast checked against fg, and alt kept within
  // touching distance of bg so a pattern reads as texture.
  { key: 'sunset', label: 'Sunset', bg: '#F0663F', fg: '#2A0C03', alt: '#F79070' },
  { key: 'ice', label: 'Ice', bg: '#8FD3E8', fg: '#06232E', alt: '#B4E3F1' },
  { key: 'lime', label: 'Lime', bg: '#C2D94A', fg: '#1B2205', alt: '#D6E783' },
  { key: 'plum', label: 'Plum', bg: '#7A4A8C', fg: '#FFFFFF', alt: '#9B6FAB' },
  { key: 'sand', label: 'Sand', bg: '#D9C39A', fg: '#2A2113', alt: '#E7D8BB' },
  { key: 'ink', label: 'Ink', bg: '#2A2E38', fg: '#FFFFFF', alt: '#454B5C' },
  { key: 'coral', label: 'Coral', bg: '#F2899B', fg: '#2E0D15', alt: '#F7AEBB' },
  { key: 'ocean', label: 'Ocean', bg: '#2E6F9E', fg: '#FFFFFF', alt: '#5691BD' },
];

export const DEFAULT_PALETTE_KEY = 'violet';

export const paletteEntry = (key: string | undefined): AvatarPaletteEntry =>
  AVATAR_PALETTE.find(p => p.key === key)
  ?? AVATAR_PALETTE.find(p => p.key === DEFAULT_PALETTE_KEY)!;

/**
 * The icon keys. The SVG paths live in ProfileAvatar.
 *
 * WHY THE FIRST SIX ARE STILL FIRST
 *
 * star, bolt, heart, note, shoe and flame are the original set and are already
 * stored against real rows. They keep their keys and their meaning; everything
 * after them is additive. A key this bundle has never heard of falls back to
 * `star` rather than rendering an empty box, because an installed phone that
 * has not reloaded is routinely behind the database.
 *
 * OBJECTS, NEVER PEOPLE
 *
 * The first cut of this set had six dancers in it — an arabesque, a leap, a
 * handstand, a breaker's freeze. Every one was rejected on sight, and the
 * contact sheet says why: these are drawn at 24px inside a 48px tile and often
 * smaller, since a teacher mark on a class card renders around 30px. That is
 * roughly 15px of actual ink. A human figure at 15px is a smudge with a dot
 * over it, and the more accurate the pose the worse it gets, because accuracy
 * spends detail the size cannot show.
 *
 * So a style is named by the thing you wear or carry — the pointe shoe, the
 * snapback, the tap plate, the splayed jazz hand. Those are single bold
 * silhouettes with one idea in them, and they survive being small. Anything
 * added here should be checked at 28px before it is checked at 96px.
 */
export const AVATAR_ICONS = [
  // Classic — the original six.
  'star', 'bolt', 'heart', 'note', 'shoe', 'flame',
  // Styles — the thing you wear or carry.
  'pointe', 'tapshoe', 'sneaker', 'cap', 'bowler', 'jazzhands', 'ribbon', 'tutu',
  // Stage — the room it happens in.
  'boombox', 'headphones', 'mic', 'disco', 'vinyl', 'spotlight', 'curtain', 'speaker',
  // Fun — no dance meaning, picked because somebody likes it.
  'crown', 'trophy', 'sparkle', 'rocket', 'shades', 'diamond', 'medal', 'ticket',
] as const;

export type AvatarIconKey = typeof AVATAR_ICONS[number];

export type AvatarIconGroup = 'Classic' | 'Styles' | 'Stage' | 'Fun';

/**
 * Labels and grouping for the picker.
 *
 * Thirty icons in one undifferentiated grid is a wall, and the thing a dancer
 * is actually looking for — "the ballet one" — is findable only by scanning all
 * thirty. The groups are the search.
 */
export const AVATAR_ICON_META: Record<AvatarIconKey, { label: string; group: AvatarIconGroup }> = {
  star: { label: 'Star', group: 'Classic' },
  bolt: { label: 'Bolt', group: 'Classic' },
  heart: { label: 'Heart', group: 'Classic' },
  note: { label: 'Music note', group: 'Classic' },
  shoe: { label: 'Dance shoe', group: 'Classic' },
  flame: { label: 'Flame', group: 'Classic' },

  pointe: { label: 'Pointe shoe', group: 'Styles' },
  tapshoe: { label: 'Tap shoe', group: 'Styles' },
  sneaker: { label: 'High top', group: 'Styles' },
  cap: { label: 'Hip hop cap', group: 'Styles' },
  bowler: { label: 'Jazz hat', group: 'Styles' },
  jazzhands: { label: 'Jazz hands', group: 'Styles' },
  ribbon: { label: 'Ribbon', group: 'Styles' },
  tutu: { label: 'Tutu', group: 'Styles' },

  boombox: { label: 'Boombox', group: 'Stage' },
  headphones: { label: 'Headphones', group: 'Stage' },
  mic: { label: 'Microphone', group: 'Stage' },
  disco: { label: 'Disco ball', group: 'Stage' },
  vinyl: { label: 'Record', group: 'Stage' },
  spotlight: { label: 'Spotlight', group: 'Stage' },
  curtain: { label: 'Stage curtain', group: 'Stage' },
  speaker: { label: 'Speaker', group: 'Stage' },

  crown: { label: 'Crown', group: 'Fun' },
  trophy: { label: 'Trophy', group: 'Fun' },
  sparkle: { label: 'Sparkle', group: 'Fun' },
  rocket: { label: 'Rocket', group: 'Fun' },
  shades: { label: 'Sunglasses', group: 'Fun' },
  diamond: { label: 'Diamond', group: 'Fun' },
  medal: { label: 'Medal', group: 'Fun' },
  ticket: { label: 'Ticket', group: 'Fun' },
};

export const AVATAR_ICON_GROUPS: AvatarIconGroup[] = ['Styles', 'Stage', 'Fun', 'Classic'];

export const iconsInGroup = (group: AvatarIconGroup): AvatarIconKey[] =>
  AVATAR_ICONS.filter(key => AVATAR_ICON_META[key].group === group);

export type AvatarMode = 'initials' | 'icon';

/** The tile's outline. 'rounded' is what every avatar drawn before this was. */
export const AVATAR_SHAPES = ['rounded', 'circle', 'squircle'] as const;
export type AvatarShape = typeof AVATAR_SHAPES[number];

export const AVATAR_SHAPE_LABELS: Record<AvatarShape, string> = {
  rounded: 'Rounded',
  circle: 'Circle',
  squircle: 'Squircle',
};

/**
 * The texture behind the letter or glyph. 'none' is the original flat tile.
 *
 * Drawn in the palette's `alt`, never `fg` — see AvatarPaletteEntry. Kept to
 * six because a pattern is background: the moment it competes with the initials
 * it has stopped doing its job.
 */
export const AVATAR_PATTERNS = ['none', 'duotone', 'dots', 'stripes', 'confetti', 'spotlight'] as const;
export type AvatarPattern = typeof AVATAR_PATTERNS[number];

export const AVATAR_PATTERN_LABELS: Record<AvatarPattern, string> = {
  none: 'Flat',
  duotone: 'Two-tone',
  dots: 'Dots',
  stripes: 'Stripes',
  confetti: 'Confetti',
  spotlight: 'Spotlight',
};

export interface AvatarConfig {
  mode: AvatarMode;
  /** At most two letters. Anything else is rejected, not truncated silently. */
  initials: string;
  iconKey: AvatarIconKey;
  paletteKey: string;
  shape: AvatarShape;
  pattern: AvatarPattern;
  /** An inset outline in the foreground colour. */
  ring: boolean;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  mode: 'initials',
  initials: '',
  iconKey: 'star',
  paletteKey: DEFAULT_PALETTE_KEY,
  shape: 'rounded',
  pattern: 'none',
  ring: false,
};

const isIconKey = (value: unknown): value is AvatarIconKey =>
  (AVATAR_ICONS as readonly string[]).includes(value as string);

/**
 * The validator. Used by the picker AND by the write path — §5.5's acceptance
 * item 5 is a crafted request storing an off-palette colour or five-character
 * initials, and the only way that fails is if the check does not live solely in
 * the component that renders the swatches.
 *
 * The three fields added later are COERCED rather than rejected, unlike the
 * palette key. The difference is what a bad value means: an unknown palette key
 * is a request that should not be honoured, while a missing `shape` is simply a
 * row written before the column existed, and every stored row is one of those.
 * Rejecting those would make the validator refuse the entire existing table.
 */
export const validateAvatar = (input: Partial<AvatarConfig>): { ok: true; value: AvatarConfig } | { ok: false; error: string } => {
  const mode = input.mode === 'icon' ? 'icon' : 'initials';

  const initials = (input.initials ?? '').trim().toUpperCase();
  if (initials.length > 2) return { ok: false, error: 'Initials must be at most 2 characters.' };
  if (initials && !/^[A-Z]{1,2}$/.test(initials)) return { ok: false, error: 'Initials must be letters only.' };

  if (!AVATAR_PALETTE.some(p => p.key === input.paletteKey)) {
    return { ok: false, error: 'That colour is not one of the available options.' };
  }

  const iconKey = isIconKey(input.iconKey) ? input.iconKey : 'star';

  const shape = (AVATAR_SHAPES as readonly string[]).includes(input.shape as string)
    ? (input.shape as AvatarShape)
    : 'rounded';

  const pattern = (AVATAR_PATTERNS as readonly string[]).includes(input.pattern as string)
    ? (input.pattern as AvatarPattern)
    : 'none';

  return {
    ok: true,
    value: { mode, initials, iconKey, paletteKey: input.paletteKey!, shape, pattern, ring: input.ring === true },
  };
};

/** Fallback initials from a name, when the family has not picked any. */
export const initialsFrom = (first: string, last: string): string =>
  `${first.trim()[0] ?? ''}${last.trim()[0] ?? ''}`.toUpperCase() || '·';
