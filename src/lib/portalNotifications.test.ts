import {
  DEFAULT_PORTAL_PREFS,
  prefsFromRaw,
  readPortalPrefs,
  writePortalPrefs,
} from './portalNotifications';

/**
 * The two rules that decide whether a family goes silent by accident.
 *
 * "Absent means the default" — every profile that existed before this shipped
 * has a notification_preferences object with only the staff keys in it. If a
 * missing key read as `false`, every one of those families would be opted out
 * of everything the day the sender goes live, and nothing would look wrong.
 *
 * "Merge, never replace" — SettingsPage writes the whole object because it
 * owns every key it knows about. This module must not: rebuilding the object
 * from the four family keys would drop taskReminders and calendarSyncEnabled
 * the first time a staff account previewed the portal and touched a switch.
 */

const mockSingle = jest.fn();
const mockUpdate = jest.fn();

jest.mock('./supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: (...a: unknown[]) => mockSingle(...a) }) }),
      update: (payload: unknown) => ({ eq: () => mockUpdate(payload) }),
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue({ error: null });
});

describe('prefsFromRaw', () => {
  it('treats an absent key as its default, not as off', () => {
    // A staff-shaped object from before this feature existed.
    const prefs = prefsFromRaw({
      pushEnabled: true,
      emailEnabled: true,
      taskReminders: true,
      overdueAlerts: true,
      calendarSyncEnabled: false,
    });

    expect(prefs.studioNotices).toBe(true);
    expect(prefs.classNotices).toBe(true);
    expect(prefs.familyNotes).toBe(true);
  });

  it('defaults new files to OFF, because fifty photos is fifty buzzes', () => {
    expect(prefsFromRaw({}).newFiles).toBe(false);
    expect(DEFAULT_PORTAL_PREFS.newFiles).toBe(false);
  });

  it('honours a stored false', () => {
    expect(prefsFromRaw({ familyNotes: false }).familyNotes).toBe(false);
  });

  it('ignores a non-boolean rather than coercing it', () => {
    // A hand-edited row, or a value that arrived as a string. `!!'false'` is
    // true, which would silently turn a deliberate opt-out back on.
    expect(prefsFromRaw({ familyNotes: 'false' }).familyNotes).toBe(true);
  });
});

describe('readPortalPrefs', () => {
  it('returns the defaults and an error when the row cannot be read', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'nope' } });

    const { prefs, error } = await readPortalPrefs('user-1');

    expect(error).toBeTruthy();
    expect(prefs).toEqual(DEFAULT_PORTAL_PREFS);
  });

  it('reads a null preferences column as the defaults', async () => {
    mockSingle.mockResolvedValue({ data: { notification_preferences: null }, error: null });

    const { prefs, error } = await readPortalPrefs('user-1');

    expect(error).toBeNull();
    expect(prefs.studioNotices).toBe(true);
  });
});

describe('writePortalPrefs', () => {
  it('preserves keys it does not own', async () => {
    mockSingle.mockResolvedValue({
      data: {
        notification_preferences: {
          pushEnabled: true,
          taskReminders: true,
          calendarSyncEnabled: false,
        },
      },
      error: null,
    });

    await writePortalPrefs('user-1', { newFiles: true });

    expect(mockUpdate).toHaveBeenCalledWith({
      notification_preferences: {
        pushEnabled: true,
        taskReminders: true,
        calendarSyncEnabled: false,
        newFiles: true,
      },
    });
  });

  it('does not write at all when the row cannot be read first', async () => {
    // Replacing the object with just the patch would wipe every other key.
    mockSingle.mockResolvedValue({ data: null, error: { message: 'nope' } });

    const { error } = await writePortalPrefs('user-1', { newFiles: true });

    expect(error).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
