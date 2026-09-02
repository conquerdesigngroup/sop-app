import {
  ViewerHousehold,
  ViewerStudent,
  accessLabel,
  ageFrom,
  classMatches,
  householdMatches,
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
  enrollmentCount: 4,
  categories: ['allstars'],
  lastNoteAt: null,
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
  it('says a family has not signed up when nothing has claimed the household', () => {
    expect(accessLabel(household({ linkedLogins: 0 }))).toEqual({ text: 'Not signed up', ok: false });
  });

  it('says signed up for exactly one login', () => {
    expect(accessLabel(household({ linkedLogins: 1 }))).toEqual({ text: 'Signed up', ok: true });
  });

  it('counts when two parents have both claimed the same household', () => {
    expect(accessLabel(household({ linkedLogins: 2 }))).toEqual({ text: '2 logins', ok: true });
  });
});

describe('studentFullName', () => {
  it('does not leave a trailing space when a name is missing', () => {
    expect(studentFullName({ firstName: 'Ava', lastName: '' })).toBe('Ava');
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
