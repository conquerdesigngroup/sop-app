import {
  instructorInitials, instructorKey, lookFor, mapInstructorLook, InstructorLook,
} from './instructorLook';

/**
 * The default is the part worth pinning.
 *
 * Every teacher has a mark before anybody opens the editor, and the two
 * properties that make that useful — the same colour for the same person
 * everywhere, and one colour per person rather than one per spelling — are
 * both invisible when broken. A reshuffled palette looks like a palette; two
 * colours for "Ky'Ree" and "Kyree" looks like two teachers.
 */

const look = (over: Partial<InstructorLook> = {}): InstructorLook => ({
  nameKey: 'sarah davidson',
  displayName: 'Sarah Davidson',
  mode: 'initials',
  initials: '',
  iconKey: 'star',
  paletteKey: 'teal',
  shape: 'rounded',
  pattern: 'none',
  ring: false,
  ...over,
});

describe('instructorInitials', () => {
  it('takes the first and last name', () => {
    expect(instructorInitials('Sarah Davidson')).toBe('SD');
    expect(instructorInitials('Mary Beth O’Dwyer')).toBe('MO');
  });

  it('gives a single name one letter, not two', () => {
    // "CH" for Chrisilla reads as two names. The second letter of a given name
    // carries nothing.
    expect(instructorInitials('Chrisilla')).toBe('C');
  });

  it('is empty for an empty name rather than throwing', () => {
    expect(instructorInitials('   ')).toBe('');
  });
});

describe('lookFor, with nothing stored', () => {
  it('is stable for the same name', () => {
    expect(lookFor('Sarah Davidson')).toEqual(lookFor('Sarah Davidson'));
  });

  it('gives one colour to one teacher however the schedule spells them', () => {
    // The whole reason the key is the folded name and not the raw string.
    expect(lookFor("Ky'Ree Adams").paletteKey).toBe(lookFor('Kyree Adams').paletteKey);
  });

  it('never hands out the brand pink automatically', () => {
    // Electric is capped at ~5% of a view and a schedule is twenty cards. It
    // stays in the picker; it is never assigned.
    const names = ['Sarah Davidson', 'Chrisilla', 'Kyree Adams', 'Mia Tran', 'Jo Beck',
      'Ana Ruiz', 'Pat Lee', 'Sam Okafor', 'Nina Volkov', 'Dee Marsh', 'Rae Quinn'];
    names.forEach(n => expect(lookFor(n).paletteKey).not.toBe('electric'));
  });

  it('uses initials mode and the name it was given', () => {
    expect(lookFor('Sarah Davidson')).toMatchObject({ mode: 'initials', initials: 'SD' });
  });
});

describe('lookFor, with a stored override', () => {
  const looks = { 'sarah davidson': look({ paletteKey: 'electric', mode: 'icon', iconKey: 'flame' }) };

  it('takes the stored colour and symbol', () => {
    expect(lookFor('Sarah Davidson', looks)).toMatchObject({
      mode: 'icon', iconKey: 'flame', paletteKey: 'electric',
    });
  });

  it('still derives initials from the name when the stored letters are empty', () => {
    // Empty means "keep using the name", so correcting a spelling on the
    // schedule corrects the mark too rather than leaving a stale copy.
    expect(lookFor('Sarah Davidson', looks).initials).toBe('SD');
  });

  it('prefers stored letters when there are some', () => {
    const withLetters = { 'sarah davidson': look({ initials: 'MS' }) };
    expect(lookFor('Sarah Davidson', withLetters).initials).toBe('MS');
  });

  it('ignores an override filed under a different name', () => {
    expect(lookFor('Chrisilla', looks).paletteKey).not.toBe('electric');
  });
});

describe('mapInstructorLook', () => {
  it('falls back to a known icon when the row carries one this bundle has not heard of', () => {
    const out = mapInstructorLook({
      name_key: 'x', display_name: 'X', mode: 'icon',
      initials: '', icon_key: 'unicorn', palette_key: 'teal',
    });
    expect(out.iconKey).toBe('star');
  });

  it('passes an unknown palette through for paletteEntry to resolve', () => {
    // The database being ahead of the bundle is routine on an installed phone
    // that has not reloaded. paletteEntry already has a fallback; rejecting the
    // row here would lose the rest of it too.
    const out = mapInstructorLook({
      name_key: 'x', display_name: 'X', mode: 'initials',
      initials: 'AB', icon_key: 'star', palette_key: 'ultraviolet',
    });
    expect(out.paletteKey).toBe('ultraviolet');
    expect(out.initials).toBe('AB');
  });
});

describe('instructorKey', () => {
  it('folds case, punctuation and spacing', () => {
    expect(instructorKey("  Ky'Ree   ADAMS ")).toBe(instructorKey('kyree adams'));
  });
});
