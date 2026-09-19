import { isLegalPath, LEGAL_PATHS, LEGAL_VERSION, LegalDoc, LegalInline, STUDIO_LEGAL } from './legal';
import { LEGAL_DOCS, PRIVACY_POLICY, TERMS_OF_USE } from './legalDocs';
import { DANCER_LOGIN_MIN_AGE } from './studentLogin';

/**
 * The Privacy Policy and Terms of Use as data.
 *
 * The wording is not asserted line by line — that would be a second copy of the
 * policy to keep in step with the first. What is pinned is what a bad edit or a
 * bad merge breaks without anybody reading the page: a dead link, a missing
 * contact address, a placeholder left in, and the one number that three places
 * have to agree on.
 */

const runsOf = (doc: LegalDoc): LegalInline[] => [
  ...doc.intro,
  ...doc.sections.flatMap(s =>
    s.blocks.flatMap(b => (b.kind === 'p' ? b.parts : b.items.flat()))
  ),
];

const textOf = (doc: LegalDoc): string =>
  runsOf(doc).map(r => (typeof r === 'string' ? r : r.text)).join(' ');

const linksOf = (doc: LegalDoc) =>
  runsOf(doc).filter((r): r is { text: string; href: string } => typeof r !== 'string');

describe('LEGAL_VERSION', () => {
  // portal-signup records the version only if it has this shape, and the page
  // prints it as a date — anything else would be dropped from the audit row.
  it('is a real ISO calendar date', () => {
    expect(LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(new Date(`${LEGAL_VERSION}T00:00:00`).getTime())).toBe(false);
  });
});

describe('isLegalPath', () => {
  it('matches both pages, with or without a trailing slash', () => {
    expect(isLegalPath('/privacy')).toBe(true);
    expect(isLegalPath('/terms')).toBe(true);
    expect(isLegalPath('/terms/')).toBe(true);
  });

  // It switches the staff header off, so a false positive would strip the
  // navigation from a real staff page.
  it('matches nothing else', () => {
    expect(isLegalPath('/')).toBe(false);
    expect(isLegalPath('/portal')).toBe(false);
    expect(isLegalPath('/portal/policies')).toBe(false);
    expect(isLegalPath('/privacy-settings')).toBe(false);
    expect(isLegalPath('/settings')).toBe(false);
  });
});

describe.each(Object.values(LEGAL_DOCS))('$title', doc => {
  it('gives every section its own anchor', () => {
    const ids = doc.sections.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach(id => expect(id).toMatch(/^[a-z0-9-]+$/));
  });

  it('links only to pages that exist, or to the studio’s inbox', () => {
    const allowed = new Set<string>([
      LEGAL_PATHS.privacy,
      LEGAL_PATHS.terms,
      '/portal/policies',
      `mailto:${STUDIO_LEGAL.contactEmail}`,
    ]);
    const links = linksOf(doc);
    expect(links.length).toBeGreaterThan(0);
    links.forEach(link => expect(allowed).toContain(link.href));
  });

  it('names the studio and says how to reach it', () => {
    const text = textOf(doc);
    expect(text).toContain(STUDIO_LEGAL.name);
    expect(text).toContain(STUDIO_LEGAL.contactEmail);
    expect(doc.sections[doc.sections.length - 1].id).toBe('contact');
  });

  it('has no placeholder left in it', () => {
    expect(textOf(doc)).not.toMatch(/TODO|TBD|XXX|lorem|\[[A-Z _]+\]/i);
  });

  // The studio's name ends "Inc.", so a sentence that ends on it and adds its
  // own full stop prints "Inc.." — which it did, once.
  it('never doubles a full stop', () => {
    doc.sections.forEach(s =>
      s.blocks.forEach(b => {
        const runs = b.kind === 'p' ? [b.parts] : b.items;
        runs.forEach(parts => {
          const text = parts.map(r => (typeof r === 'string' ? r : r.text)).join('');
          expect(text).not.toMatch(/\.\./);
        });
      })
    );
  });
});

// studentLogin.ts's picker and migration v58 refuse younger dancers; the
// documents promise the same line. Change one, and this says where else to look.
it('states the dancer-login age that the picker and v58 enforce', () => {
  expect(textOf(PRIVACY_POLICY)).toContain(`${DANCER_LOGIN_MIN_AGE} or older`);
  expect(textOf(TERMS_OF_USE)).toContain(`${DANCER_LOGIN_MIN_AGE} or older`);
});

// The first thing the Privacy Policy has to get right, and the thing v30 and
// v55 made subtle: posted class content is not limited to the class.
it('tells families that class content reaches beyond their dancer’s class', () => {
  expect(textOf(PRIVACY_POLICY)).toMatch(/not only (families in that class|your dancer’s class)/);
});
