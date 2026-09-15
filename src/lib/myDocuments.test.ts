import { loadMyDocuments } from './attendanceQueries';
import { FIXTURE_DOCUMENTS } from './attendanceFixture';

/**
 * Which files are a family's own.
 *
 * THE CLAIM THIS PINS
 *
 * "Files & forms" on the dashboard is a roll-up, and a roll-up is only useful
 * while it stays a list of YOUR things. A studio-wide file used to reach every
 * household regardless of the programme it was posted to, so an All-Star family
 * opened the card and read the Academy and TNT paperwork too — a directory of
 * the whole app rather than their own shelf.
 *
 * The fixture is the right harness for this: it is the same `mine` filter the
 * live path runs, exercised without a network, and its documents already cover
 * both shapes — attached to a class, and studio-wide on each programme.
 */

const fixture = { source: 'fixture', scenario: 'two-dancers' } as const;

const titles = (rows: { title: string }[]) => rows.map(r => r.title).sort();

/** The fixture's studio-wide files both sit on the academy programme. */
const STUDIO_WIDE_ACADEMY = ['Family handbook 2026', 'Recital information pack'];

describe('loadMyDocuments', () => {
  it('keeps a file attached to a class the household is in', async () => {
    const { rows } = await loadMyDocuments(fixture, ['cls-ballet'], ['academy']);
    expect(titles(rows)).toEqual(
      [...STUDIO_WIDE_ACADEMY, 'Junior Ballet dress code'].sort());
  });

  it('drops a file attached to a class the household is not in', async () => {
    const { rows } = await loadMyDocuments(fixture, ['cls-ballet'], ['academy']);
    expect(titles(rows)).not.toContain('Showcase routine music');
  });

  // The regression this whole change exists for.
  it('drops a studio-wide file from a programme the household is not in', async () => {
    const { rows } = await loadMyDocuments(fixture, ['cls-hiphop'], ['allstars']);

    // The All-Star family keeps their own class file and sees none of the
    // academy programme's studio-wide paperwork.
    expect(titles(rows)).toEqual(['Showcase routine music']);
  });

  it('keeps a studio-wide file for a programme the household IS in', async () => {
    const { rows } = await loadMyDocuments(fixture, [], ['academy']);
    expect(titles(rows)).toEqual([...STUDIO_WIDE_ACADEMY].sort());
  });

  it('gives a household in both programmes both sets', async () => {
    const { rows } = await loadMyDocuments(fixture, ['cls-hiphop'], ['academy', 'allstars']);
    expect(titles(rows)).toEqual(
      [...STUDIO_WIDE_ACADEMY, 'Showcase routine music'].sort());
  });

  // A household with no programmes yet must not be handed the studio's whole
  // shelf as a fallback. Empty is the correct answer, not "show everything".
  it('shows nothing studio-wide to a household in no programme', async () => {
    const { rows } = await loadMyDocuments(fixture, [], []);
    expect(rows).toEqual([]);
  });

  it('never shows an unpublished file', async () => {
    const published = FIXTURE_DOCUMENTS.filter(d => d.isPublished).length;
    const { rows } = await loadMyDocuments(
      fixture,
      FIXTURE_DOCUMENTS.map(d => d.classId).filter((c): c is string => c !== null),
      ['academy', 'allstars'],
    );
    expect(rows.length).toBeLessThanOrEqual(published);
    expect(rows.every(r => r.isPublished)).toBe(true);
  });
});
