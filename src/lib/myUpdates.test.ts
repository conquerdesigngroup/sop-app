import { loadMyUpdates } from './attendanceQueries';
import { PortalUpdate } from '../types';

/**
 * Which notices are a family's own.
 *
 * Same scoping as files, with one rule files do not have: a note written to ONE
 * household is always theirs. `householdId` is set by the office writing to a
 * single family, RLS has already decided the row may be seen by this login, and
 * these rows carry no class — so under the programme rule alone a personal note
 * would be checked against a programme filter it was never meant to pass. The
 * failure that guards against is a family losing sight of a note written for
 * them, which is the worst thing this card could do.
 */

const fixture = { source: 'fixture', scenario: 'guardian' } as const;

const titles = (rows: { title: string }[]) => rows.map(r => r.title).sort();

/** The fixture's one studio-wide notice sits on the academy programme. */
const STUDIO_WIDE_ACADEMY = 'Recital tickets are on sale';

describe('loadMyUpdates', () => {
  it('keeps a notice for a class the household is in', async () => {
    const { rows } = await loadMyUpdates(fixture, ['cls-ballet'], ['academy']);
    expect(titles(rows)).toEqual(
      [STUDIO_WIDE_ACADEMY, 'New shoe supplier for Junior Ballet'].sort());
  });

  it('drops a notice for a class the household is not in', async () => {
    const { rows } = await loadMyUpdates(fixture, ['cls-ballet'], ['academy']);
    expect(titles(rows)).not.toContain('Showcase is on the 14th');
  });

  // The change this file exists for: matching the files rule.
  it('drops a studio-wide notice from a programme the household is not in', async () => {
    const { rows } = await loadMyUpdates(fixture, ['cls-hiphop'], ['allstars']);
    expect(titles(rows)).not.toContain(STUDIO_WIDE_ACADEMY);
  });

  it('keeps a studio-wide notice for a programme the household IS in', async () => {
    const { rows } = await loadMyUpdates(fixture, [], ['academy']);
    expect(titles(rows)).toEqual([STUDIO_WIDE_ACADEMY]);
  });

  it('shows nothing studio-wide to a household in no programme', async () => {
    const { rows } = await loadMyUpdates(fixture, [], []);
    expect(rows).toEqual([]);
  });
});

/**
 * The fixture's `update()` helper always sets householdId null — a personal
 * note is only ever real data — so this case is built by hand.
 */
const personal = (over: Partial<PortalUpdate> = {}): PortalUpdate => ({
  id: 'upd-personal',
  programId: 'prog-allstars',
  classId: null,
  householdId: 'hh-1',
  title: 'Your costume balance',
  body: 'There is £40 outstanding on Maya’s costume.',
  linkUrl: null,
  linkLabel: null,
  isPinned: false,
  isPublished: true,
  publishedAt: '2026-09-01T09:00:00Z',
  authorId: null,
  createdAt: '2026-09-01T09:00:00Z',
  updatedAt: '2026-09-01T09:00:00Z',
  ...over,
});

describe('a note addressed to one household', () => {
  // Exercised through the same `mine` filter by standing it in as the row set.
  const onlyPersonal = async (
    row: PortalUpdate,
    classIds: string[],
    programs: ('academy' | 'allstars')[],
  ) => {
    const mod = jest.requireActual('./attendanceFixture');
    const original = mod.FIXTURE_UPDATES.slice();
    mod.FIXTURE_UPDATES.length = 0;
    mod.FIXTURE_UPDATES.push(row);
    try {
      return (await loadMyUpdates(fixture, classIds, programs)).rows;
    } finally {
      mod.FIXTURE_UPDATES.length = 0;
      mod.FIXTURE_UPDATES.push(...original);
    }
  };

  it('reaches the household even with no matching programme', async () => {
    const rows = await onlyPersonal(personal(), [], []);
    expect(titles(rows)).toEqual(['Your costume balance']);
  });

  it('reaches the household even when they are in a different programme', async () => {
    const rows = await onlyPersonal(personal({ programId: 'prog-academy' }), [], ['allstars']);
    expect(titles(rows)).toEqual(['Your costume balance']);
  });

  it('is still withheld when unpublished', async () => {
    const rows = await onlyPersonal(personal({ isPublished: false }), [], ['allstars']);
    expect(rows).toEqual([]);
  });
});
