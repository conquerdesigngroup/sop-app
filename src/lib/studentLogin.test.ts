import {
  normaliseEmail, isValidEmail, dancerBlockedReason, emailBlockedReason,
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
    expect(dancerBlockedReason(dancer(), new Set(['stu-1']))).toMatch(/already has/);
  });

  // A row pointing at an archived dancer can never link, so it would create a
  // login that silently never works.
  it('refuses an archived dancer', () => {
    expect(dancerBlockedReason(dancer({ status: 'inactive' }), new Set())).toMatch(/archived/);
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
