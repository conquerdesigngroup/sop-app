import {
  AccessCounts,
  AccessPerson,
  accessState,
  describeCounts,
  describeWhen,
  sortPeople,
  summarise,
} from './portalAccessEvents';

const counts = (over: Partial<AccessCounts> = {}): AccessCounts => ({
  signin_failed: 0,
  reset_requested: 0,
  registered: 0,
  verified: 0,
  verify_failed: 0,
  rejected: 0,
  ...over,
});

const person = (over: Partial<AccessPerson> = {}): AccessPerson => ({
  email: 'parent@example.com',
  householdId: 'h1',
  householdName: 'Solares',
  householdStatus: 'active',
  studentCount: 2,
  emailKnown: true,
  hasAccount: true,
  accountRole: 'client',
  accountActive: true,
  isLinked: true,
  counts: counts(),
  firstAt: '2026-09-07T21:00:00Z',
  lastAt: '2026-09-08T20:56:54Z',
  lastIp: '172.56.121.73',
  ...over,
});

describe('accessState', () => {
  // The case this whole feature exists for. On 2026-09-07/08 six households
  // looked exactly like this and every one of them read "failed to sign in"
  // in the activity log, identical to a mistyped password.
  it('calls a known family with no account and failed sign-ins stuck', () => {
    expect(
      accessState(
        person({
          hasAccount: false,
          isLinked: false,
          counts: counts({ signin_failed: 8, reset_requested: 2 }),
        }),
      ),
    ).toBe('stuck');
  });

  it('counts a reset request on its own as trying to get in', () => {
    // A reset is the second thing a locked-out parent tries, and for an
    // address with no account it is the dead end that sends them to an inbox
    // where nothing will ever arrive. It has to raise the flag by itself.
    expect(
      accessState(
        person({ hasAccount: false, isLinked: false, counts: counts({ reset_requested: 1 }) }),
      ),
    ).toBe('stuck');
  });

  it('separates a failed sign-up from a family who never had one', () => {
    expect(
      accessState(
        person({ hasAccount: false, isLinked: false, counts: counts({ rejected: 2 }) }),
      ),
    ).toBe('no_account');
  });

  it('flags an address the studio does not hold before anything else', () => {
    // Checked first on purpose: a parent using their work email instead of the
    // one Enrollio has needs telling which address to use, whether or not they
    // got as far as making an account.
    expect(
      accessState(
        person({
          emailKnown: false,
          householdId: null,
          hasAccount: true,
          isLinked: false,
          counts: counts({ signin_failed: 3 }),
        }),
      ),
    ).toBe('unknown_email');
  });

  it('keeps v48s middle state: an account that claimed no household', () => {
    expect(accessState(person({ isLinked: false }))).toBe('not_linked');
  });

  it('leaves an ordinary mistyped password alone', () => {
    expect(accessState(person({ counts: counts({ signin_failed: 2 }) }))).toBe('in');
  });
});

describe('sortPeople', () => {
  it('puts the family who cannot get in above everyone who can', () => {
    const fine = person({ email: 'fine@example.com', lastAt: '2026-09-08T23:00:00Z' });
    const stuck = person({
      email: 'stuck@example.com',
      hasAccount: false,
      isLinked: false,
      counts: counts({ signin_failed: 1 }),
      lastAt: '2026-09-07T01:00:00Z',
    });

    // `fine` is nearly two days newer and still sorts second: a purely
    // chronological list buries the one row worth acting on.
    expect(sortPeople([fine, stuck]).map(p => p.email)).toEqual([
      'stuck@example.com',
      'fine@example.com',
    ]);
  });

  it('orders within a state by most recent', () => {
    const older = person({ email: 'a@example.com', lastAt: '2026-09-07T01:00:00Z' });
    const newer = person({ email: 'b@example.com', lastAt: '2026-09-08T01:00:00Z' });
    expect(sortPeople([older, newer]).map(p => p.email)).toEqual([
      'b@example.com',
      'a@example.com',
    ]);
  });

  it('does not mutate what it was given', () => {
    const people = [
      person({ email: 'a@example.com' }),
      person({ email: 'b@example.com', hasAccount: false, isLinked: false, counts: counts({ signin_failed: 1 }) }),
    ];
    sortPeople(people);
    expect(people.map(p => p.email)).toEqual(['a@example.com', 'b@example.com']);
  });
});

describe('summarise', () => {
  it('counts states by person and events by occurrence', () => {
    const s = summarise([
      person({ hasAccount: false, isLinked: false, counts: counts({ signin_failed: 8, reset_requested: 2 }) }),
      person({ email: 'b@example.com', emailKnown: false, householdId: null, counts: counts({ signin_failed: 3 }) }),
      person({ email: 'c@example.com', isLinked: false, counts: counts({ registered: 1, verified: 1 }) }),
      person({ email: 'd@example.com', counts: counts({ registered: 1, verify_failed: 2 }) }),
    ]);

    expect(s.people).toBe(4);
    expect(s.stuck).toBe(1);
    expect(s.unknownEmail).toBe(1);
    expect(s.notLinked).toBe(1);
    // Two registrations across two people, and every sign-in failure however
    // many people produced them.
    expect(s.registered).toBe(2);
    expect(s.signinFailed).toBe(11);
    expect(s.resetRequested).toBe(2);
    expect(s.verifyFailed).toBe(2);
  });

  it('is all zeroes for nobody', () => {
    expect(summarise([])).toEqual({
      people: 0,
      stuck: 0,
      unknownEmail: 0,
      notLinked: 0,
      registered: 0,
      signinFailed: 0,
      resetRequested: 0,
      verifyFailed: 0,
    });
  });
});

describe('describeCounts', () => {
  it('names only what happened, and pluralises', () => {
    expect(describeCounts(counts({ signin_failed: 1, reset_requested: 2 }))).toBe(
      '1 failed sign-in · 2 reset requests',
    );
  });

  it('is empty when nothing happened', () => {
    expect(describeCounts(counts())).toBe('');
  });
});

describe('describeWhen', () => {
  // Built from local parts so the test says the same thing in any timezone —
  // an ISO literal would be "today" in Los Angeles and "yesterday" in Sydney.
  const localIso = (y: number, m: number, d: number, hh: number, mm: number) =>
    new Date(y, m - 1, d, hh, mm).toISOString();

  it('names the time for today', () => {
    const now = new Date(2026, 8, 8, 18, 0);
    expect(describeWhen(localIso(2026, 9, 8, 13, 56), now)).toBe('1:56pm today');
  });

  it('crosses midnight by the calendar, not by 24 hours', () => {
    // Two hours apart and still "yesterday" — the bug this argument exists for.
    const now = new Date(2026, 8, 8, 1, 0);
    expect(describeWhen(localIso(2026, 9, 7, 23, 5), now)).toBe('11:05pm yesterday');
  });

  it('falls back to a dated form further out', () => {
    const now = new Date(2026, 8, 8, 12, 0);
    expect(describeWhen(localIso(2026, 9, 4, 9, 30), now)).toMatch(/Sep.*9:30am|9:30am/);
  });

  it('says nothing for an unparseable date', () => {
    expect(describeWhen('not-a-date')).toBe('');
  });
});
