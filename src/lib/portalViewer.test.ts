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
  categories: ['All-Stars'],
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
    category: 'All-Stars',
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
