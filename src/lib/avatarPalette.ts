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
 * NO PHOTO UPLOADS ANYWHERE IN THIS FEATURE
 *
 * Initials and icons only. That decision removes image moderation, storage
 * cost, and the question of hosting photographs of children — all at once, for
 * a feature whose entire job is to make a profile feel like yours.
 */

export interface AvatarPaletteEntry {
  key: string;
  label: string;
  bg: string;
  fg: string;
}

export const AVATAR_PALETTE: AvatarPaletteEntry[] = [
  { key: 'electric', label: 'Electric', bg: '#E2144F', fg: '#FFFFFF' },
  { key: 'violet', label: 'Violet', bg: '#9B8AE0', fg: '#16121F' },
  { key: 'teal', label: 'Teal', bg: '#2FB8A8', fg: '#06201C' },
  { key: 'cobalt', label: 'Cobalt', bg: '#5B8DEF', fg: '#0A1428' },
  { key: 'amber', label: 'Amber', bg: '#E0A24A', fg: '#241804' },
  { key: 'rose', label: 'Rose', bg: '#C77BB8', fg: '#22101E' },
  { key: 'moss', label: 'Moss', bg: '#7FBF6A', fg: '#0F2109' },
  { key: 'slate', label: 'Slate', bg: '#5A6070', fg: '#FFFFFF' },
];

export const DEFAULT_PALETTE_KEY = 'violet';

export const paletteEntry = (key: string | undefined): AvatarPaletteEntry =>
  AVATAR_PALETTE.find(p => p.key === key)
  ?? AVATAR_PALETTE.find(p => p.key === DEFAULT_PALETTE_KEY)!;

/** Dance-flavoured icon keys. The SVG paths live in ProfileAvatar. */
export const AVATAR_ICONS = ['star', 'bolt', 'heart', 'note', 'shoe', 'flame'] as const;
export type AvatarIconKey = typeof AVATAR_ICONS[number];

export type AvatarMode = 'initials' | 'icon';

export interface AvatarConfig {
  mode: AvatarMode;
  /** At most two letters. Anything else is rejected, not truncated silently. */
  initials: string;
  iconKey: AvatarIconKey;
  paletteKey: string;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  mode: 'initials',
  initials: '',
  iconKey: 'star',
  paletteKey: DEFAULT_PALETTE_KEY,
};

/**
 * The validator. Used by the picker AND by the write path — §5.5's acceptance
 * item 5 is a crafted request storing an off-palette colour or five-character
 * initials, and the only way that fails is if the check does not live solely in
 * the component that renders the swatches.
 */
export const validateAvatar = (input: Partial<AvatarConfig>): { ok: true; value: AvatarConfig } | { ok: false; error: string } => {
  const mode = input.mode === 'icon' ? 'icon' : 'initials';

  const initials = (input.initials ?? '').trim().toUpperCase();
  if (initials.length > 2) return { ok: false, error: 'Initials must be at most 2 characters.' };
  if (initials && !/^[A-Z]{1,2}$/.test(initials)) return { ok: false, error: 'Initials must be letters only.' };

  if (!AVATAR_PALETTE.some(p => p.key === input.paletteKey)) {
    return { ok: false, error: 'That colour is not one of the available options.' };
  }

  const iconKey = input.iconKey && (AVATAR_ICONS as readonly string[]).includes(input.iconKey)
    ? input.iconKey
    : 'star';

  return { ok: true, value: { mode, initials, iconKey, paletteKey: input.paletteKey! } };
};

/** Fallback initials from a name, when the family has not picked any. */
export const initialsFrom = (first: string, last: string): string =>
  `${first.trim()[0] ?? ''}${last.trim()[0] ?? ''}`.toUpperCase() || '·';
