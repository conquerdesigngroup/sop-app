import { matchInstructors, normalizeName, differsByOneEdit, StaffCandidate } from './instructorMatch';

/**
 * The matcher, against the names that are actually in the database.
 *
 * Every fixture below is copied from the live 2026-2027 season and the live
 * profiles table rather than invented, because the whole value of this module
 * is how it behaves on THIS studio's spelling. A test built from tidy made-up
 * names would pass while the real Ky'ree row silently found nobody.
 *
 * The negative cases matter as much as the matches. "Guest Choreographer" is
 * not a person and must never be offered an account, and the two Chill
 * accounts must not be silently collapsed into one.
 */

const STAFF: StaffCandidate[] = [
  { id: 'kyree', firstName: 'Ky’Ree ', lastName: 'Nevels', role: 'team' },
  { id: 'kansas', firstName: 'Kansas', lastName: 'ODwyer', role: 'team' },
  { id: 'chill', firstName: 'Chill', lastName: 'K', role: 'team' },
  { id: 'chill-admin', firstName: 'Chill Admin', lastName: 'K', role: 'admin' },
  { id: 'grace', firstName: 'Grace', lastName: 'Kunkle', role: 'team' },
  { id: 'morgan', firstName: 'Morgan', lastName: 'Davison', role: 'team' },
  { id: 'tara', firstName: 'Tara', lastName: 'Triche', role: 'team' },
  { id: 'sierra', firstName: 'Sierra', lastName: 'Faith', role: 'team' },
  { id: 'carlos', firstName: 'Carlos', lastName: 'Renteria', role: 'admin' },
  { id: 'alyssa', firstName: 'Alyssa', lastName: 'Zuppardo', role: 'super_admin' },
];

const klass = (id: string, instructorName: string, isActive = true) => ({
  id,
  instructorName,
  isActive,
});

const rowFor = (scheduleName: string, staff = STAFF) => {
  const rows = matchInstructors([klass('c1', scheduleName)], staff);
  return rows[0];
};

describe('folding a name to the part that identifies it', () => {
  it('ignores case, punctuation and stray spaces', () => {
    expect(normalizeName("Ky'ree Nevels")).toBe(normalizeName('Ky’Ree  Nevels '));
  });

  it('treats a missing apostrophe as the same name', () => {
    expect(normalizeName("Kansas O'dwyer")).toBe(normalizeName('Kansas ODwyer'));
  });

  it('strips accents rather than treating them as a different person', () => {
    expect(normalizeName('José Peña')).toBe('jose pena');
  });
});

describe('one edit apart', () => {
  it.each([
    ['davidson', 'davison'],
    ['smith', 'smyth'],
    ['kerney', 'kerne'],
  ])('%s / %s', (a, b) => expect(differsByOneEdit(a, b)).toBe(true));

  it.each([
    ['ramirez', 'martinez'],
    ['triche', 'triche'],
    ['kunkle', 'k'],
  ])('%s / %s is not a near miss', (a, b) => expect(differsByOneEdit(a, b)).toBe(false));
});

describe('the five ways the real schedule differs from the real accounts', () => {
  it("reads a curly apostrophe and a trailing space as the same name", () => {
    const row = rowFor("Ky'ree Nevels");
    expect(row.suggestion?.id).toBe('kyree');
    expect(row.confidence).toBe('exact');
  });

  it('reads an apostrophe present on only one side as the same name', () => {
    const row = rowFor("Kansas O'dwyer");
    expect(row.suggestion?.id).toBe('kansas');
    expect(row.confidence).toBe('exact');
  });

  it('offers a nickname as likely, not certain', () => {
    const row = rowFor('Gracie Kunkle');
    expect(row.suggestion?.id).toBe('grace');
    expect(row.confidence).toBe('likely');
  });

  it('offers a one-letter surname difference as likely, not certain', () => {
    // Nobody knows whether Davidson or Davison is the correct spelling, which
    // is exactly why this is a suggestion and not an automatic grant.
    const row = rowFor('Morgan Davidson');
    expect(row.suggestion?.id).toBe('morgan');
    expect(row.confidence).toBe('likely');
  });

  it('sends an initial surname to review even when only one account fits', () => {
    // "Chill Admin K" does not share the first name, so there is one candidate
    // — but one character of surname is not enough to grant on.
    const row = rowFor('Chill Kerney');
    expect(row.suggestion?.id).toBe('chill');
    expect(row.confidence).toBe('review');
  });
});

describe('names that must not be matched to anybody', () => {
  it('leaves a teacher with no account unmatched', () => {
    const row = rowFor('Chrisilla Adrien');
    expect(row.suggestion).toBeNull();
    expect(row.confidence).toBe('none');
  });

  it('leaves a placeholder that is not a person unmatched', () => {
    const row = rowFor('Guest Choreographer');
    expect(row.suggestion).toBeNull();
    expect(row.confidence).toBe('none');
  });

  it('refuses to choose when two accounts fit equally', () => {
    const twins: StaffCandidate[] = [
      { id: 'a', firstName: 'Sam', lastName: 'Reed', role: 'team' },
      { id: 'b', firstName: 'Sam', lastName: 'Reed', role: 'team' },
    ];
    const row = rowFor('Sam Reed', twins);
    expect(row.confidence).toBe('ambiguous');
    expect(row.suggestion).toBeNull();
    expect(row.alternatives.map(c => c.id)).toEqual(['a', 'b']);
  });

  it('does not stretch a short first name across a surname it shares', () => {
    // "Jo" is two characters; matching it to Joanna would put one teacher's
    // files in another's class.
    const row = rowFor('Jo Kunkle', [
      { id: 'joanna', firstName: 'Joanna', lastName: 'Kunkle', role: 'team' },
    ]);
    expect(row.suggestion).toBeNull();
  });
});

describe('one field, several teachers', () => {
  it.each([
    ['commas, as the table holds them today', 'Chill Kerney, Ky’Ree Nevels'],
    ['slashes, as the season import wrote them', "Chill Kerney/Ky'ree Nevels"],
    ['the word and', "Chill Kerney and Ky'ree Nevels"],
  ])('splits on %s', (_label, field) => {
    const rows = matchInstructors([klass('c1', field)], STAFF);
    expect(rows.map(r => r.suggestion?.id).sort()).toEqual(['chill', 'kyree']);
  });

  it('gives each teacher in a shared class that class', () => {
    const rows = matchInstructors(
      [klass('production', 'Alyssa Zuppardo, Carlos Renteria')],
      STAFF
    );
    expect(rows.every(r => r.classIds)).toBe(true);
    for (const row of rows) expect(row.classIds).toEqual(['production']);
  });
});

describe('the shape of the list an admin works through', () => {
  it('gathers every class a teacher holds under one row', () => {
    const rows = matchInstructors(
      [klass('c1', 'Tara Triche'), klass('c2', 'Tara Triche'), klass('c3', 'Sierra Faith')],
      STAFF
    );
    expect(rows[0].scheduleName).toBe('Tara Triche');
    expect(rows[0].classIds).toEqual(['c1', 'c2']);
  });

  it('puts the busiest teacher first, because that is the row worth fixing', () => {
    const rows = matchInstructors(
      [klass('c1', 'Sierra Faith'), klass('c2', 'Tara Triche'), klass('c3', 'Tara Triche')],
      STAFF
    );
    expect(rows.map(r => r.scheduleName)).toEqual(['Tara Triche', 'Sierra Faith']);
  });

  it('flags an account that can already publish everywhere', () => {
    // Carlos is an admin. A grant would add nothing, and an admin hunting for
    // "why is Carlos not in my list" should find the answer on screen.
    expect(rowFor('Carlos Renteria').alreadyCovered).toBe(true);
    expect(rowFor('Alyssa Zuppardo').alreadyCovered).toBe(true);
    expect(rowFor('Tara Triche').alreadyCovered).toBe(false);
  });

  it('ignores a class that is hidden from the schedule', () => {
    const rows = matchInstructors([klass('c1', 'Tara Triche', false)], STAFF);
    expect(rows).toEqual([]);
  });

  it('ignores a class with no teacher written on it', () => {
    expect(matchInstructors([{ id: 'c1', instructorName: null }], STAFF)).toEqual([]);
    expect(matchInstructors([{ id: 'c1', instructorName: '  ' }], STAFF)).toEqual([]);
  });
});
