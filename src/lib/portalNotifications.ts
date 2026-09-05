import { supabase, isSupabaseConfigured } from './supabase';

/**
 * What a family has asked to be told about.
 *
 * THREE LEVELS, AND ONLY THE MIDDLE TWO ARE OURS
 *
 * A notification reaching a phone depends on three separate switches, and
 * conflating them is what makes notification settings feel broken everywhere
 * else:
 *
 *   1. the OS/browser permission — the parent's, in system settings. We can
 *      read granted/denied/default and nothing more (see pushSupport()).
 *   2. the device subscription   — one row in push_subscriptions per browser.
 *      A phone and an iPad are two rows. src/lib/push.ts owns this.
 *   3. the account preference    — this file. It applies to every device the
 *      family has subscribed, because it is what the sender reads.
 *
 * WHY THIS LIVES IN profiles.notification_preferences
 *
 * The column already exists, already defaults sensibly, and every client
 * profile gets one at signup — handle_new_user() (v28) inserts clients with
 * role='client', is_active=true, and the same schema default as staff. The
 * "Users can update own profile" policy (v3) is USING (auth.uid() = id) with
 * no role test, so a signed-in parent can already write their own row, and
 * prevent_privilege_escalation() (v6) still stops them touching role or
 * is_active. No migration is needed for any of this.
 *
 * Staff keys (taskReminders, overdueAlerts, calendarSyncEnabled) and family
 * keys share the object because they never share a row. They must still be
 * preserved on write — see writePortalPrefs.
 */

export interface PortalNotificationPrefs {
  /** The master. Already honoured by alert-push; reused rather than renamed. */
  pushEnabled: boolean;
  /** Program-wide announcements. */
  studioNotices: boolean;
  /** Notices addressed to a class this family is actually in. */
  classNotices: boolean;
  /** A note addressed to this household alone. */
  familyNotes: boolean;
  /** Photos, videos and documents posted to a class. */
  newFiles: boolean;
}

/**
 * ABSENT MEANS THE DEFAULT, and the defaults are not all the same.
 *
 * The three notice types default ON, matching the rule alert-push already
 * uses (`p.pushEnabled !== false`) — a profile created before this shipped
 * must not go silent, and must not need a backfill.
 *
 * newFiles defaults OFF on purpose. A class with fifty photos posted at once
 * is fifty reasons to turn everything off forever, and the parent who wants
 * that can ask for it.
 */
export const DEFAULT_PORTAL_PREFS: PortalNotificationPrefs = {
  pushEnabled: true,
  studioNotices: true,
  classNotices: true,
  familyNotes: true,
  newFiles: false,
};

export type PortalPrefKey = keyof PortalNotificationPrefs;
export type PortalCategoryKey = Exclude<PortalPrefKey, 'pushEnabled'>;

/**
 * The categories, in the order they are shown. Described by what arrives, not
 * by which table it came from — "Class notices" means something to a parent,
 * "portal_updates.class_id" does not.
 */
export const PORTAL_NOTIFICATION_CATEGORIES: {
  key: PortalCategoryKey;
  label: string;
  description: string;
}[] = [
  {
    key: 'familyNotes',
    label: 'Just for your family',
    description: 'A message the studio sends to you alone.',
  },
  {
    key: 'classNotices',
    label: 'Your classes',
    description: 'Cancellations and changes for the classes your dancers are in.',
  },
  {
    key: 'studioNotices',
    label: 'Studio announcements',
    description: 'Recital news, closures and anything that goes to everyone.',
  },
  {
    key: 'newFiles',
    label: 'New photos and files',
    description: 'When something new is posted to one of your classes.',
  },
];

/** The stored JSONB, with keys we do not own left untouched. */
type RawPrefs = Record<string, unknown>;

const coerce = (raw: RawPrefs): PortalNotificationPrefs => {
  const flag = (key: PortalPrefKey): boolean =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : DEFAULT_PORTAL_PREFS[key];
  return {
    pushEnabled: flag('pushEnabled'),
    studioNotices: flag('studioNotices'),
    classNotices: flag('classNotices'),
    familyNotes: flag('familyNotes'),
    newFiles: flag('newFiles'),
  };
};

/** Exported for the card's optimistic state and for tests. */
export const prefsFromRaw = coerce;

export type PrefsError = string | null;

const GENERIC_ERROR = 'Could not load your notification settings.';

export const readPortalPrefs = async (
  userId: string,
): Promise<{ prefs: PortalNotificationPrefs; error: PrefsError }> => {
  if (!isSupabaseConfigured() || !supabase) {
    return { prefs: DEFAULT_PORTAL_PREFS, error: GENERIC_ERROR };
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('notification_preferences')
    .eq('id', userId)
    .single();

  if (error || !data) return { prefs: DEFAULT_PORTAL_PREFS, error: GENERIC_ERROR };
  return { prefs: coerce((data.notification_preferences ?? {}) as RawPrefs), error: null };
};

/**
 * Merge a patch into the stored object. READ, SPREAD, WRITE — never replace.
 *
 * SettingsPage writes the whole object because it owns every key it knows
 * about. This one must not: an object rebuilt from the four family keys would
 * silently drop taskReminders and calendarSyncEnabled the first time a staff
 * account previewed the portal and touched a switch.
 *
 * The read-then-write is not atomic. Two of a family's own tabs racing would
 * lose one switch, which is a worse trade to fix (an RPC, or a jsonb || in
 * SQL) than it is to accept for a settings card.
 */
export const writePortalPrefs = async (
  userId: string,
  patch: Partial<PortalNotificationPrefs>,
): Promise<{ error: PrefsError }> => {
  if (!isSupabaseConfigured() || !supabase) {
    return { error: 'Notification settings need the online app.' };
  }

  const { data, error: readError } = await supabase
    .from('profiles')
    .select('notification_preferences')
    .eq('id', userId)
    .single();

  if (readError || !data) return { error: 'Could not save that. Check your connection and try again.' };

  const merged = { ...((data.notification_preferences ?? {}) as RawPrefs), ...patch };

  const { error } = await supabase
    .from('profiles')
    .update({ notification_preferences: merged })
    .eq('id', userId);

  if (error) return { error: 'Could not save that. Check your connection and try again.' };
  return { error: null };
};
