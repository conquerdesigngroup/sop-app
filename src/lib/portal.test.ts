import {
  CLASS_CATEGORY_ORDER,
  PROGRAM_CLASS_CATEGORIES,
  PROGRAM_SLUGS,
  programSlugForCategory,
} from './portal';

/**
 * Where a class opens from the dashboard.
 *
 * The dashboard lists a family's enrolments, which carry a category and no
 * program id, so this function is the whole of the link between a class on the
 * dashboard and its page under a section. Getting it wrong does not throw — it
 * routes to a section that does not list the class, and ClassDetail reports it
 * missing.
 */
describe('programSlugForCategory', () => {
  it('sends a company class to the company section', () => {
    expect(programSlugForCategory('allstars')).toBe('allstars');
  });

  it('sends an academy class to the academy section', () => {
    expect(programSlugForCategory('academy')).toBe('academy');
  });

  it('sends a TNT class to Academy/TNT, not to the company section that also lists it', () => {
    // The All-Star schedule lists TNT deliberately. Opening a TNT class there
    // would still find the class, and would hand a TNT parent a back button
    // into a section closed to them.
    expect(programSlugForCategory('tnt')).toBe('academy');
  });

  it('gives no section for a missing or unknown category rather than guessing one', () => {
    expect(programSlugForCategory(null)).toBeNull();
    expect(programSlugForCategory(undefined)).toBeNull();
    expect(programSlugForCategory('')).toBeNull();
    expect(programSlugForCategory('summer-intensive')).toBeNull();
  });

  it('resolves every category to a section that actually lists it', () => {
    // The guard on the derivation: this is what fails if a schedule's
    // categories change and the mapping stops agreeing with them.
    CLASS_CATEGORY_ORDER.forEach(category => {
      const slug = programSlugForCategory(category);
      expect(slug).not.toBeNull();
      expect(PROGRAM_CLASS_CATEGORIES[slug!]).toContain(category);
    });
  });

  it('is defined for every category any schedule lists', () => {
    const listed = PROGRAM_SLUGS.flatMap(slug => [...PROGRAM_CLASS_CATEGORIES[slug]]);
    listed.forEach(category => {
      expect(programSlugForCategory(category)).not.toBeNull();
    });
  });
});
