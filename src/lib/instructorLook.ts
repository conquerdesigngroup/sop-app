import {
  AVATAR_PALETTE, AvatarConfig, AvatarIconKey, AVATAR_ICONS, DEFAULT_PALETTE_KEY,
} from './avatarPalette';
import { normalizeName } from './instructorMatch';

/**
 * What a teacher's mark looks like.
 *
 * THE DEFAULT IS THE FEATURE
 *
 * Every teacher has a look from the moment this ships, with nothing written
 * anywhere: initials from the name they are already listed under, and a colour
 * derived from that same name. The studio has thirteen teachers across a
 * hundred and three classes and nobody was going to fill in a form for each of
 * them before the schedule looked different — v44's whole existence is the
 * lesson that a feature requiring 103 small decisions gets zero of them.
 *
 * portal_instructor_looks (v46) then overrides the default for whichever
 * teachers somebody has actually styled. A missing row is not a missing
 * feature, it is the default, and that distinction is why this can be useful
 * on day one.
 *
 * KEYED BY NAME, BECAUSE THE SCHEDULE IS
 *
 * portal_classes.instructor_name is free text with no foreign key to anyone —
 * see the v46 header. normalizeName is the same fold the bulk-assign screen
 * matches on, so "Ky'Ree" and "Kyree" resolve to one look rather than two, and
 * a teacher with no account is styleable like everybody else.
 *
 * DETERMINISTIC, NOT RANDOM
 *
 * The colour is a hash of the key, so a teacher is the same colour on every
 * device, in every session, forever — which is the only property that makes it
 * useful for finding a name in a list. An index into a fetched array would
 * reshuffle the whole schedule the day somebody is added.
 */

export interface InstructorLook extends AvatarConfig {
  /** normalizeName of the instructor name this look belongs to. */
  nameKey: string;
  /** The name as the schedule spells it. */
  displayName: string;
}

export const instructorKey = (instructorName: string): string => normalizeName(instructorName);

/**
 * The palette the automatic colour is drawn from — everything except electric.
 *
 * Electric is the brand accent and CLAUDE.md caps it at about 5% of a view. A
 * schedule is twenty class cards; letting the hash hand pink to one teacher in
 * eight would put it on two or three of them and spend the entire budget on
 * the least important colour decision on the page. It stays available in the
 * picker, where somebody is choosing it on purpose for one person.
 */
const AUTO_PALETTE = AVATAR_PALETTE.filter(p => p.key !== 'electric');

/**
 * Up to two letters from a name.
 *
 * "Sarah Davidson" gives SD, "Chrisilla" gives C — not CH, because a single
 * given name is one name and its second letter carries no information. An
 * empty result falls through to a dot, as initialsFrom does.
 */
export const instructorInitials = (instructorName: string): string => {
  const words = instructorName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0][0].toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
};

/** djb2-ish, matching the shape HouseholdCard uses for a child's colour. */
const hashOf = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return hash;
};

/**
 * The look for a name, with any stored override applied.
 *
 * `looks` is keyed by nameKey and is normally empty — the table is optional and
 * a failed fetch passes {} rather than blocking a schedule on a decoration.
 */
export const lookFor = (
  instructorName: string,
  looks: Record<string, InstructorLook> = {},
): AvatarConfig => {
  const key = instructorKey(instructorName);
  const stored = looks[key];

  if (stored) {
    return {
      mode: stored.mode,
      // An empty stored `initials` means "keep using the name", which is what
      // the column's default is and what the editor writes when the field is
      // cleared. Falling back here rather than storing a copy means a teacher
      // whose name is corrected on the schedule gets corrected initials too.
      initials: stored.initials || instructorInitials(instructorName),
      iconKey: stored.iconKey,
      paletteKey: stored.paletteKey,
    };
  }

  return {
    mode: 'initials',
    initials: instructorInitials(instructorName),
    iconKey: 'star',
    paletteKey: key
      ? AUTO_PALETTE[hashOf(key) % AUTO_PALETTE.length].key
      : DEFAULT_PALETTE_KEY,
  };
};

/** PostgREST row → the shape the app uses. */
export const mapInstructorLook = (row: any): InstructorLook => ({
  nameKey: row.name_key,
  displayName: row.display_name,
  mode: row.mode === 'icon' ? 'icon' : 'initials',
  initials: row.initials ?? '',
  iconKey: (AVATAR_ICONS as readonly string[]).includes(row.icon_key)
    ? (row.icon_key as AvatarIconKey)
    : 'star',
  // A palette key this bundle has never heard of means the database is ahead
  // of the deploy, which happens routinely on an installed phone that has not
  // reloaded. paletteEntry() already falls back for an unknown key, so it is
  // passed through rather than rejected here.
  paletteKey: row.palette_key,
});
