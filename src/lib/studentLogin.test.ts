import {
  normaliseEmail, isValidEmail, dancerBlockedReason, emailBlockedReason, DANCER_LOGIN_MIN_AGE,
} from './studentLogin';
import { ViewerStudent } from './portalViewer';

const dancer = (over: Partial<ViewerStudent> = {}): ViewerStudent => ({
  id: 'stu-1',
  firstName: 'Ava',
  lastName: 'Martinez',
  displayName: null,
  dateOfBirth: '2010-04-02',
  status: 'active',
  externalStudentId: null,
  householdId: 'hh-1',
  householdName: 'Martinez',
  householdEmail: 'parent@example.com',
  enrollmentCount: 3,
  categories: ['Academy'],
  ownLogins: 0,
  householdLogins: 0,
  ownLoginEmail: null,
  householdAccountName: null,
  ...over,
});

describe('normaliseEmail / isValidEmail', () => {
  it('trims and lower-cases, because the roster is matched case-insensitively', () => {
    expect(normaliseEmail('  Ava@Example.COM ')).toBe('ava@example.com');
  });

  it('accepts an ordinary address', () => {
    expect(isValidEmail('ava@example.com')).toBe(true);
    expect(isValidEmail(' AVA@Example.com ')).toBe(true);
  });

  it('rejects what would fail server-side anyway', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('ava')).toBe(false);
    expect(isValidEmail('ava@example')).toBe(false);
    expect(isValidEmail('a b@example.com')).toBe(false);
    expect(isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });
});

describe('dancerBlockedReason', () => {
  it('allows an active dancer with no login', () => {
    expect(dancerBlockedReason(dancer(), new Set())).toBeNull();
  });

  it('refuses a dancer who already has one, rather than letting the server 400', () => {
    const blocked = dancerBlockedReason(dancer(), new Set(['stu-1']));
    expect(blocked?.badge).toBe('Has a login');
    expect(blocked?.reason).toMatch(/already has/);
  });

  // A row pointing at an archived dancer can never link, so it would create a
  // login that silently never works.
  it('refuses an archived dancer', () => {
    const blocked = dancerBlockedReason(dancer({ status: 'inactive' }), new Set());
    expect(blocked?.badge).toBe('Archived');
    expect(blocked?.reason).toMatch(/archived/);
  });

  // The Privacy Policy promises dancer logins are 13+, and v58 makes the RPC
  // refuse anyone younger. These pin the picker to the same line, on a fixed
  // day so the tests do not age into passing.
  describe(`the ${DANCER_LOGIN_MIN_AGE}+ rule`, () => {
    const today = new Date(2026, 8, 18); // 18 September 2026, local

    it('refuses a dancer under 13, and says so on the badge rather than "Has a login"', () => {
      const blocked = dancerBlockedReason(dancer({ dateOfBirth: '2016-03-01' }), new Set(), today);
      expect(blocked?.badge).toBe('Under 13');
      expect(blocked?.reason).toMatch(/13 and up/);
    });

    it('refuses the day before a 13th birthday and allows the day itself', () => {
      expect(dancerBlockedReason(dancer({ dateOfBirth: '2013-09-19' }), new Set(), today)?.badge)
        .toBe('Under 13');
      expect(dancerBlockedReason(dancer({ dateOfBirth: '2013-09-18' }), new Set(), today)).toBeNull();
    });

    it('refuses a dancer with no date of birth, because nothing shows they are old enough', () => {
      const blocked = dancerBlockedReason(dancer({ dateOfBirth: null }), new Set(), today);
      expect(blocked?.badge).toBe('No birth date');
    });

    it('still reports an existing login first, whatever the age', () => {
      expect(dancerBlockedReason(dancer({ dateOfBirth: '2016-03-01' }), new Set(['stu-1']), today)?.badge)
        .toBe('Has a login');
    });
  });
});

describe('emailBlockedReason', () => {
  it('says nothing while the field is still empty', () => {
    expect(emailBlockedReason(dancer(), '')).toBeNull();
    expect(emailBlockedReason(dancer(), '   ')).toBeNull();
  });

  it('accepts the dancer’s own address', () => {
    expect(emailBlockedReason(dancer(), 'ava@example.com')).toBeNull();
  });

  it('rejects a malformed address', () => {
    expect(emailBlockedReason(dancer(), 'nope')).toMatch(/not a valid/);
  });

  // The failure this check exists for: the parent later registers on that same
  // address, is filed as a STUDENT member, and sees one of their own children.
  it('rejects the family’s own address, case and spacing regardless', () => {
    expect(emailBlockedReason(dancer(), 'parent@example.com')).toMatch(/family/);
    expect(emailBlockedReason(dancer(), '  PARENT@Example.com ')).toMatch(/family/);
  });

  it('allows an address that merely resembles the family’s', () => {
    expect(emailBlockedReason(dancer(), 'parent2@example.com')).toBeNull();
  });
});
