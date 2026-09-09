import { supabase, isSupabaseConfigured } from './supabase';
import { AvatarConfig, DEFAULT_AVATAR, validateAvatar } from './avatarPalette';

/**
 * Where a family's own avatar is stored, and the only place it is read from.
 *
 * IT USED TO BE STORED NOWHERE
 *
 * The builder shipped as §5.2 described it — a palette, a mode, an icon grid,
 * a nickname — and held all of it in `useState`. It rendered, it validated, it
 * previewed, and on the next page load the profile was a default violet tile
 * again. That is not a small bug: the entire point of the feature is that this
 * is YOURS, and a thing that forgets you is worse than a thing that never
 * offered.
 *
 * ONE ROW PER LOGIN, IN A TABLE THAT HOLDS NOTHING ELSE
 *
 * portal_avatar_prefs (v53) exists rather than columns on
 * portal_household_members, and the reason is in the migration header: that
 * table decides whether a login sees one dancer or a whole family, and a client
 * allowed to UPDATE its own row there to change a colour could change those too
 * — Postgres will not split one table's columns across two policies. Here the
 * worst a crafted request achieves is an ugly avatar.
 *
 * VALIDATED ON THE WAY OUT AND ON THE WAY BACK
 *
 * On the way out because the picker is not a boundary and PostgREST will take
 * whatever is sent. On the way back because a row can predate a column, and
 * because a bundle can be older than the database — validateAvatar coerces the
 * three later fields to the values that reproduce the original tile rather than
 * rejecting a row a real person is looking at.
 */

export interface AvatarPrefs {
  avatar: AvatarConfig;
  /** The household nickname. Empty means "use the name on the account". */
  displayName: string;
}

export const EMPTY_PREFS: AvatarPrefs = { avatar: DEFAULT_AVATAR, displayName: '' };

const COLUMNS = 'mode, initials, icon_key, palette_key, shape, pattern, ring, display_name';

const mapRow = (row: any): AvatarPrefs => {
  const checked = validateAvatar({
    mode: row.mode,
    initials: row.initials ?? '',
    iconKey: row.icon_key,
    paletteKey: row.palette_key,
    shape: row.shape,
    pattern: row.pattern,
    ring: row.ring,
  });

  return {
    avatar: checked.ok ? checked.value : DEFAULT_AVATAR,
    displayName: row.display_name ?? '',
  };
};

/**
 * This login's stored avatar, or null when they have never saved one.
 *
 * Null and "the read failed" are deliberately different returns. A family who
 * has not chosen yet should see the default builder; a family whose read failed
 * must NOT be shown a default and then have it saved over their real choice the
 * next time they press Done.
 */
export const loadAvatarPrefs = async (): Promise<{ prefs: AvatarPrefs | null; error: string | null }> => {
  if (!isSupabaseConfigured()) return { prefs: null, error: null };

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return { prefs: null, error: null };

  const { data, error } = await supabase
    .from('portal_avatar_prefs')
    .select(COLUMNS)
    .eq('profile_id', uid)
    .maybeSingle();

  if (error) return { prefs: null, error: 'We could not load your profile picture settings.' };
  return { prefs: data ? mapRow(data) : null, error: null };
};

/** Upsert this login's avatar. Throws, so the caller can say it did not save. */
export const saveAvatarPrefs = async (prefs: AvatarPrefs): Promise<void> => {
  const checked = validateAvatar(prefs.avatar);
  if (!checked.ok) throw new Error(checked.error);

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error('You need to be signed in to save your profile.');

  const { error } = await supabase.from('portal_avatar_prefs').upsert({
    profile_id: uid,
    mode: checked.value.mode,
    initials: checked.value.initials,
    icon_key: checked.value.iconKey,
    palette_key: checked.value.paletteKey,
    shape: checked.value.shape,
    pattern: checked.value.pattern,
    ring: checked.value.ring,
    // Trimmed here rather than on input, so somebody typing a space mid-name
    // is not fighting the field while they type.
    display_name: prefs.displayName.trim().slice(0, 24),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'profile_id' });

  if (error) throw error;
};
