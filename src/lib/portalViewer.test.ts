import {
  ViewerHousehold,
  ViewerStudent,
  ACCESS_BADGE,
  STUDENT_ACCESS_BADGE,
  accessLabel,
  ageFrom,
  classMatches,
  familyLabel,
  householdMatches,
  householdSubtitle,
  householdTitle,
  studentAccessIsKnown,
  studentAccessLabel,
  studentFamilyName,
  studentFullName,
  studentMatches,
} from './portalViewer';

const household = (over: Partial<ViewerHousehold> = {}): ViewerHousehold => ({
  id: 'h1',
  externalAccountId: 'ENR-9001',
  email: 'brittknee58@yahoo.com',
  name: 'Kettenbrink',
  status: 'active',
  studentCount: 3,
  linkedLogins: 0,
  unlinkedAccounts: 0,
  enrollmentCount: 4,
  categories: ['allstars'],
  lastNoteAt: null,
  accountName: null,
  accountEmail: null,
  ...over,
});

const student = (over: Partial<ViewerStudent> = {}): ViewerStudent => ({
  id: 's1',
  firstName: 'Ava',
  lastName: 'Kettenbrink',
  displayName: null,
  dateOfBirth: '2016-03-12',
  status: 'active',
  externalStudentId: null,
  householdId: 'h1',
  householdName: 'Kettenbrink',
  householdEmail: 'brittknee58@yahoo.com',
  enrollmentCount: 2,
  categories: ['allstars'],
  ownLogins: 0,
  householdLogins: 0,
  ownLoginEmail: null,
  householdAccountName: null,
  ...over,
});

describe('ageFrom', () => {
  it('is a whole year count, not a subtraction of year numbers', () => {
    // Birthday has not happened yet this year, so she is still 9 and not 10.
    expect(ageFrom('2016-03-12', new Date(2026, 0, 15))).toBe(9);
    expect(ageFrom('2016-03-12', new Date(2026, 2, 12))).toBe(10);
    expect(ageFrom('2016-03-12', new Date(2026, 2, 11))).toBe(9);
  });

  it('has no answer without a date of birth', () => {
    expect(ageFrom(null, new Date(2026, 0, 1))).toBeNull();
    expect(ageFrom('', new Date(2026, 0, 1))).toBeNull();
  });

  it('refuses a nonsense date rather than printing a nonsense age', () => {
    // The import once split one child in two on a 2026-for-2016 typo. A future
    // date of birth must not render as "-10".
    expect(ageFrom('2036-01-01', new Date(2026, 0, 1))).toBeNull();
    expect(ageFrom('not-a-date', new Date(2026, 0, 1))).toBeNull();
  });
});

describe('householdMatches', () => {
  it('finds a family by their email, not only their name', () => {
    // The whole point: Enrolio spells this surname two ways, so the email is
    // the only spelling that is reliably right.
    expect(householdMatches(household(), 'brittknee')).toBe(true);
    expect(householdMatches(household(), 'yahoo.com')).toBe(true);
  });

  it('finds a family by their Enrolio account id', () => {
    expect(householdMatches(household(), 'enr-9001')).toBe(true);
  });

  it('ignores case and surrounding space', () => {
    expect(householdMatches(household(), '  KETTEN  ')).toBe(true);
  });

  it('matches everything when the box is empty', () => {
    expect(householdMatches(household(), '')).toBe(true);
    expect(householdMatches(household(), '   ')).toBe(true);
  });

  it('does not match an unrelated family', () => {
    expect(householdMatches(household(), 'reyes')).toBe(false);
  });
});

describe('studentMatches', () => {
  it('finds a dancer through their parent’s email', () => {
    // "A parent emailed from this address about their daughter" is the actual
    // question, and the child's name is the part nobody can spell.
    expect(studentMatches(student(), 'brittknee58@yahoo.com')).toBe(true);
  });

  it('finds a dancer by nickname', () => {
    expect(studentMatches(student({ displayName: 'Bug' }), 'bug')).toBe(true);
  });

  it('matches on the full name across the space', () => {
    expect(studentMatches(student(), 'ava ketten')).toBe(true);
  });
});

describe('classMatches', () => {
  const klass = {
    id: 'c1',
    programId: 'p1',
    name: 'All-Star Bb',
    category: 'allstars',
    style: null,
    level: null,
    dayOfWeek: 6,
    startTime: '09:00',
    endTime: '10:00',
    location: null,
    instructorName: 'Chill Kerney',
    season: null,
    isActive: true,
    externalClassId: 'all-star bb (chill/m-6pm)',
    activeEnrollments: 12,
  };

  it('finds a class by its Enrolio title, which is the attendance join key', () => {
    expect(classMatches(klass, 'chill/m-6pm')).toBe(true);
  });

  it('finds a class by instructor and by category', () => {
    expect(classMatches(klass, 'kerney')).toBe(true);
    expect(classMatches(klass, 'all-stars')).toBe(true);
  });
});

describe('accessLabel', () => {
  it('says a family has not signed up when there is no account and no link', () => {
    expect(accessLabel(household({ linkedLogins: 0, unlinkedAccounts: 0 })))
      .toEqual({ text: 'Not signed up', state: 'none' });
  });

  it('says signed up for exactly one login', () => {
    expect(accessLabel(household({ linkedLogins: 1 }))).toEqual({ text: 'Signed up', state: 'linked' });
  });

  it('counts when two parents have both claimed the same household', () => {
    expect(accessLabel(household({ linkedLogins: 2 }))).toEqual({ text: '2 logins', state: 'linked' });
  });

  /**
   * The distinction this whole state exists for. On 2026-09-07 two families
   * with real, verified accounts were rendered identically to the 330 who had
   * never signed up, because the label was a boolean over membership rows.
   */
  it('separates an account that never linked from a family that never signed up', () => {
    expect(accessLabel(household({ linkedLogins: 0, unlinkedAccounts: 1 })))
      .toEqual({ text: 'Account not linked', state: 'unlinked' });
  });

  it('reads as signed up when one guardian linked and a second did not', () => {
    // The family has access, which is what the badge answers.
    expect(accessLabel(household({ linkedLogins: 1, unlinkedAccounts: 1 })))
      .toEqual({ text: 'Signed up', state: 'linked' });
  });

  it('gives every state a badge colour', () => {
    expect(ACCESS_BADGE.linked).toBe('success');
    expect(ACCESS_BADGE.unlinked).toBe('warning');
    expect(ACCESS_BADGE.none).toBe('default');
  });
});

describe('studentFullName', () => {
  it('does not leave a trailing space when a name is missing', () => {
    expect(studentFullName({ firstName: 'Ava', lastName: '' })).toBe('Ava');
  });
});

// ------------------------------------------------------------------- names

/**
 * The complaint these cover: "I can only see their last name."
 *
 * Measured on this database 2026-09-17 — 341 of 349 households have a
 * single-word display_name, because the import writes the Enrolio guardian
 * column and that column holds a surname. Meanwhile all 58 client profiles
 * carry a first AND a last name, one join away, which no staff screen read.
 */
describe('familyLabel', () => {
  it('names a bare surname as a family rather than as a person', () => {
    expect(familyLabel({ name: 'Kettenbrink', email: 'brittknee58@yahoo.com' }))
      .toBe('Kettenbrink family');
  });

  it('leaves a name somebody actually typed alone', () => {
    expect(familyLabel({ name: 'The Kettenbrinks', email: 'x@y.com' })).toBe('The Kettenbrinks');
    expect(familyLabel({ name: 'Brittany Kettenbrink', email: 'x@y.com' }))
      .toBe('Brittany Kettenbrink');
  });

  it('does not turn a stand-in email address into a family', () => {
    // mapHousehold falls back to the email when Enrolio carries no name at
    // all; "brittknee58@yahoo.com family" would be nonsense.
    expect(familyLabel({ name: 'brittknee58@yahoo.com', email: 'brittknee58@yahoo.com' }))
      .toBe('brittknee58@yahoo.com');
    expect(familyLabel({ name: '', email: 'brittknee58@yahoo.com' }))
      .toBe('brittknee58@yahoo.com');
  });
});

describe('householdTitle', () => {
  it('is the name they signed up with, once they have', () => {
    expect(householdTitle(household({ accountName: 'Brittany Kettenbrink' })))
      .toBe('Brittany Kettenbrink');
  });

  it('falls back to the family, never to half a name', () => {
    expect(householdTitle(household())).toBe('Kettenbrink family');
  });

  it('is unchanged when v57 has not been applied', () => {
    // account_name is simply absent from the response, which maps to null.
    expect(householdTitle(household({ accountName: null }))).toBe('Kettenbrink family');
  });
});

describe('householdSubtitle', () => {
  it('says nothing when the surname is already in the name above it', () => {
    expect(householdSubtitle(household({ accountName: 'Brittany Kettenbrink' }))).toBeNull();
  });

  it('names the roster surname when the parent does not share it', () => {
    // The row somebody is on the phone about: the account is Brittany Ruiz,
    // the children are filed under Kettenbrink.
    expect(householdSubtitle(household({ accountName: 'Brittany Ruiz' })))
      .toBe('Kettenbrink family');
  });

  it('says nothing at all when nobody has signed up', () => {
    expect(householdSubtitle(household())).toBeNull();
  });

  it('sees through however the studio wrote the family name', () => {
    // "Boateng family", "The Boatengs" and "Boateng" are one fact about
    // Marcus Boateng, and a line repeating any of them under his name is noise.
    expect(householdSubtitle(household({
      name: 'Kettenbrink family', accountName: 'Brittany Kettenbrink',
    }))).toBeNull();
    expect(householdSubtitle(household({
      name: 'The Kettenbrink Family', accountName: 'Brittany Kettenbrink',
    }))).toBeNull();
  });
});

describe('studentFamilyName', () => {
  it('names the parent instead of repeating the child’s own surname', () => {
    expect(studentFamilyName(student({ householdAccountName: 'Brittany Kettenbrink' })))
      .toBe('Brittany Kettenbrink');
  });

  it('falls back to the family label', () => {
    expect(studentFamilyName(student())).toBe('Kettenbrink family');
  });
});

// ----------------------------------------------------------- dancer access

describe('studentAccessLabel', () => {
  it('reads as her own login when she has one, even if her parents also signed up', () => {
    // The badge answers "what does SHE have"; the family's own access is on
    // their record, one tap away.
    expect(studentAccessLabel(student({ ownLogins: 1, householdLogins: 2 })))
      .toEqual({ text: 'Own login', state: 'own' });
  });

  it('reads as the family’s when a parent signed up and she did not', () => {
    expect(studentAccessLabel(student({ householdLogins: 1 })))
      .toEqual({ text: 'Family signed up', state: 'family' });
  });

  it('says nobody can see her when nobody can', () => {
    expect(studentAccessLabel(student())).toEqual({ text: 'No account', state: 'none' });
  });

  it('gives every state a badge colour', () => {
    expect(STUDENT_ACCESS_BADGE.own).toBe('success');
    expect(STUDENT_ACCESS_BADGE.family).toBe('info');
    expect(STUDENT_ACCESS_BADGE.none).toBe('default');
  });
});

describe('studentAccessIsKnown', () => {
  /**
   * The failure this prevents: with v57 unapplied the counts are absent, and
   * reading absent as zero would badge all 395 dancers "No account" — a screen
   * confidently telling the owner something false. The lists show no badge and
   * no filter at all in that case.
   */
  it('is false when the columns are not in the response', () => {
    expect(studentAccessIsKnown([
      student({ ownLogins: null, householdLogins: null }),
      student({ ownLogins: null, householdLogins: null }),
    ])).toBe(false);
  });

  it('is true as soon as one row carries a count, zero included', () => {
    expect(studentAccessIsKnown([student({ ownLogins: 0, householdLogins: 0 })])).toBe(true);
  });

  it('is false for an empty list, because nothing has been proved', () => {
    expect(studentAccessIsKnown([])).toBe(false);
  });
});

// --------------------------------------------------------------- filtering

import {
  EMPTY_FILTERS,
  NO_DIVISION,
  ViewerClass,
  ViewerFilters,
  classPasses,
  filtersAreEmpty,
  householdPasses,
  matchesDivisions,
  studentPasses,
  toggleDivision,
} from './portalViewer';

const filters = (over: Partial<ViewerFilters> = {}): ViewerFilters => ({ ...EMPTY_FILTERS, ...over });

const klass = (over: Partial<ViewerClass> = {}): ViewerClass => ({
  id: 'c1', programId: 'p1', name: 'All-Star Bb', category: 'allstars',
  style: null, level: null, dayOfWeek: 6, startTime: '09:00', endTime: '10:00',
  location: null, instructorName: 'Chill Kerney', season: null, isActive: true,
  externalClassId: 'all-star bb (chill/m-6pm)', activeEnrollments: 12, ...over,
});

describe('matchesDivisions', () => {
  it('lets everything through when no chip is selected', () => {
    // A filter row that returns nothing until you pick something reads as
    // broken, and clearing the row is the first thing anyone does.
    expect(matchesDivisions(['allstars'], [])).toBe(true);
    expect(matchesDivisions([], [])).toBe(true);
  });

  it('is ANY-of, not all-of', () => {
    // 93 of 343 households are in more than one division. Selecting All-Stars
    // and TNT means "anyone touching either", not "in exactly those two".
    expect(matchesDivisions(['academy'], ['allstars', 'academy'])).toBe(true);
    expect(matchesDivisions(['allstars', 'tnt'], ['tnt'])).toBe(true);
    expect(matchesDivisions(['academy'], ['allstars', 'tnt'])).toBe(false);
  });

  it('reaches the families no other division filter can', () => {
    // 72 households have no active enrollment at all.
    expect(matchesDivisions([], [NO_DIVISION])).toBe(true);
    expect(matchesDivisions(['tnt'], [NO_DIVISION])).toBe(false);
    // And it combines with real divisions rather than replacing them.
    expect(matchesDivisions(['tnt'], [NO_DIVISION, 'tnt'])).toBe(true);
  });
});

describe('toggleDivision', () => {
  it('adds then removes, so a chip is its own off switch', () => {
    expect(toggleDivision([], 'tnt')).toEqual(['tnt']);
    expect(toggleDivision(['tnt'], 'tnt')).toEqual([]);
    expect(toggleDivision(['tnt'], 'academy')).toEqual(['tnt', 'academy']);
  });

  it('does not mutate the array it was given', () => {
    const before = ['tnt'];
    toggleDivision(before, 'academy');
    expect(before).toEqual(['tnt']);
  });
});

describe('householdPasses', () => {
  it('finds who still has to sign up — the filter the beta needs', () => {
    const signedUp = household({ linkedLogins: 1 });
    const not = household({ linkedLogins: 0 });
    expect(householdPasses(not, '', filters({ access: 'not-signed-up' }))).toBe(true);
    expect(householdPasses(signedUp, '', filters({ access: 'not-signed-up' }))).toBe(false);
    expect(householdPasses(signedUp, '', filters({ access: 'signed-up' }))).toBe(true);
  });

  /**
   * The chase list must not contain families who have already signed up. That
   * is the whole reason "not linked" is its own filter rather than a badge
   * alone: someone working the "Not signed up" list should never be emailing
   * "please create an account" to a family who created one an hour ago.
   */
  it('keeps a family who signed up but never linked off the chase list', () => {
    const stranded = household({ linkedLogins: 0, unlinkedAccounts: 1 });
    expect(householdPasses(stranded, '', filters({ access: 'not-signed-up' }))).toBe(false);
    expect(householdPasses(stranded, '', filters({ access: 'not-linked' }))).toBe(true);
    expect(householdPasses(stranded, '', filters({ access: 'signed-up' }))).toBe(false);
  });

  it('shows nobody under "not linked" once everyone with an account has one', () => {
    expect(householdPasses(household({ linkedLogins: 1 }), '', filters({ access: 'not-linked' }))).toBe(false);
    expect(householdPasses(household({ linkedLogins: 0 }), '', filters({ access: 'not-linked' }))).toBe(false);
  });

  it('applies the search AND the filters, not one or the other', () => {
    const h = household({ categories: ['allstars'] });
    expect(householdPasses(h, 'ketten', filters({ divisions: ['allstars'] }))).toBe(true);
    expect(householdPasses(h, 'reyes', filters({ divisions: ['allstars'] }))).toBe(false);
    expect(householdPasses(h, 'ketten', filters({ divisions: ['tnt'] }))).toBe(false);
  });
});

describe('studentPasses', () => {
  it('filters a dancer by the divisions they are actually enrolled in', () => {
    const s = student({ categories: ['tnt'] });
    expect(studentPasses(s, '', filters({ divisions: ['tnt'] }))).toBe(true);
    expect(studentPasses(s, '', filters({ divisions: ['allstars'] }))).toBe(false);
  });

  it('separates withdrawn dancers from current ones', () => {
    const gone = student({ status: 'inactive' });
    expect(studentPasses(gone, '', filters({ activity: 'inactive' }))).toBe(true);
    expect(studentPasses(gone, '', filters({ activity: 'active' }))).toBe(false);
  });

  /**
   * The cut the Families tab has had since v48, asked about children. 71 of
   * 395 dancers are visible to somebody; one has a login of her own.
   */
  describe('by who can see her', () => {
    const own = student({ ownLogins: 1, householdLogins: 1 });
    const viaParent = student({ ownLogins: 0, householdLogins: 1 });
    const nobody = student({ ownLogins: 0, householdLogins: 0 });

    it('counts a parent’s login as signed up — she is not on the chase list', () => {
      expect(studentPasses(viaParent, '', filters({ dancerAccess: 'signed-up' }))).toBe(true);
      expect(studentPasses(viaParent, '', filters({ dancerAccess: 'no-account' }))).toBe(false);
    });

    it('keeps "own login" to the dancers who actually have one', () => {
      expect(studentPasses(own, '', filters({ dancerAccess: 'own-login' }))).toBe(true);
      expect(studentPasses(viaParent, '', filters({ dancerAccess: 'own-login' }))).toBe(false);
    });

    it('finds the children nobody can see at all', () => {
      expect(studentPasses(nobody, '', filters({ dancerAccess: 'no-account' }))).toBe(true);
      expect(studentPasses(nobody, '', filters({ dancerAccess: 'signed-up' }))).toBe(false);
    });

    it('lets everyone through when the chip row is clear', () => {
      expect(studentPasses(nobody, '', filters())).toBe(true);
      expect(studentPasses(own, '', filters())).toBe(true);
    });
  });
});

describe('classPasses', () => {
  it('treats a class single category the same way as a family list', () => {
    expect(classPasses(klass(), '', filters({ divisions: ['allstars'] }))).toBe(true);
    expect(classPasses(klass(), '', filters({ divisions: ['tnt'] }))).toBe(false);
  });

  it('answers "what is on Saturday"', () => {
    expect(classPasses(klass({ dayOfWeek: 6 }), '', filters({ dayOfWeek: 6 }))).toBe(true);
    expect(classPasses(klass({ dayOfWeek: 3 }), '', filters({ dayOfWeek: 6 }))).toBe(false);
    // Sunday is 0, which must not be read as "no day chosen".
    expect(classPasses(klass({ dayOfWeek: 0 }), '', filters({ dayOfWeek: 0 }))).toBe(true);
    expect(classPasses(klass({ dayOfWeek: 3 }), '', filters({ dayOfWeek: 0 }))).toBe(false);
  });

  it('finds a hidden class, which is otherwise invisible', () => {
    expect(classPasses(klass({ isActive: false }), '', filters({ activity: 'inactive' }))).toBe(true);
    expect(classPasses(klass({ isActive: false }), '', filters({ activity: 'active' }))).toBe(false);
  });

  it('finds a class with no category under Not enrolled', () => {
    expect(classPasses(klass({ category: null }), '', filters({ divisions: [NO_DIVISION] }))).toBe(true);
    expect(classPasses(klass({ category: null }), '', filters({ divisions: ['tnt'] }))).toBe(false);
  });
});

describe('filtersAreEmpty', () => {
  it('is true only when nothing at all is narrowing', () => {
    expect(filtersAreEmpty(EMPTY_FILTERS)).toBe(true);
    expect(filtersAreEmpty(filters({ divisions: ['tnt'] }))).toBe(false);
    expect(filtersAreEmpty(filters({ access: 'signed-up' }))).toBe(false);
    // The dancer list's own access cut counts too — without this the Clear
    // button disappears while a chip is still narrowing the list.
    expect(filtersAreEmpty(filters({ dancerAccess: 'no-account' }))).toBe(false);
    expect(filtersAreEmpty(filters({ activity: 'inactive' }))).toBe(false);
    // Sunday again: 0 is a real choice, not an absent one.
    expect(filtersAreEmpty(filters({ dayOfWeek: 0 }))).toBe(false);
  });
});

describe('searching for the words that are actually on the row', () => {
  it('accepts the division label the chips display, not only the stored slug', () => {
    // The bug this exists for: the chips were changed to read "All-Stars" while
    // the search still only matched "allstars", so typing the exact text on
    // thirty visible rows returned "No class matches that".
    const c = klass({ category: 'allstars' });
    expect(classMatches(c, 'All-Stars')).toBe(true);
    expect(classMatches(c, 'all-stars')).toBe(true);
    expect(classMatches(c, 'allstars')).toBe(true);
  });

  it('does the same on the families and dancers lists, which show the same chips', () => {
    expect(householdMatches(household({ categories: ['allstars'] }), 'All-Stars')).toBe(true);
    expect(studentMatches(student({ categories: ['tnt'] }), 'TNT')).toBe(true);
  });

  it('does not match a division the row is not in', () => {
    expect(classMatches(klass({ category: 'academy' }), 'All-Stars')).toBe(false);
    expect(householdMatches(household({ categories: ['academy'] }), 'All-Stars')).toBe(false);
  });

  it('finds a class by the day printed on it', () => {
    expect(classMatches(klass({ dayOfWeek: 6 }), 'saturday')).toBe(true);
    expect(classMatches(klass({ dayOfWeek: 6 }), 'monday')).toBe(false);
  });

  it('keeps an unrecognised category searchable by its own spelling', () => {
    // A category the studio adds later has no label; falling back to the slug
    // means the row is never unsearchable.
    expect(classMatches(klass({ category: 'juniors' }), 'juniors')).toBe(true);
  });
});
