import { loadHouseholdSummary, loadMyUpdates } from './attendanceQueries';

/**
 * Whose notes reach the dashboard's Updates card.
 *
 * A note sent to ONE family (v36) is kept from every other parent by RLS. It is
 * not kept from an admin: portal_updates_read_staff returns every family's, so
 * the card used to show a member of staff who is also a parent at the studio
 * every note the studio had sent anyone, each marked FOR YOUR FAMILY. There
 * were two on 2026-09-17. The card now names the household it asks for, the way
 * loadHouseholdSummary does, and both halves of that are pinned here: the
 * filter, and the household id it filters on.
 */

const mockUpdateRows: any[] = [];
const mockMembership: { data: any; error: any } = { data: null, error: null };
const mockStudents: { data: any[]; error: any } = { data: [], error: null };

jest.mock('./supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'me' } } } }),
    },
    from: (table: string) => {
      if (table === 'portal_updates') {
        return {
          select: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: mockUpdateRows, error: null }) }),
          }),
        };
      }
      if (table === 'portal_household_members') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(mockMembership) }) }) };
      }
      if (table === 'portal_students') {
        // Filters chain in any order and the query is awaited directly.
        const query: any = {
          eq: () => query,
          order: () => query,
          then: (resolve: any, reject: any) => Promise.resolve(mockStudents).then(resolve, reject),
        };
        return { select: () => query };
      }
      throw new Error(`No mock for ${table}`);
    },
  },
}));

const update = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  program_id: 'prog-academy',
  class_id: null,
  household_id: null,
  title: id,
  body: '',
  link_url: null,
  link_label: null,
  is_pinned: false,
  is_published: true,
  published_at: '2026-09-01T00:00:00Z',
  author_id: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...over,
});

beforeEach(() => {
  mockUpdateRows.length = 0;
  mockMembership.data = null;
  mockStudents.data = [];
});

describe('loadMyUpdates', () => {
  beforeEach(() => {
    mockUpdateRows.push(
      update('to everyone', { program_id: null }),
      update('to our family', { household_id: 'hh-ours' }),
      update("to another family", { household_id: 'hh-theirs' }),
      update('for our class', { class_id: 'cls-ours' }),
      update("for someone else's class", { class_id: 'cls-theirs' }),
    );
  });

  it("keeps this family's note and drops another family's", async () => {
    const { rows, error } = await loadMyUpdates({ source: 'live' }, ['cls-ours'], 'hh-ours');

    expect(error).toBeNull();
    expect(rows.map(r => r.id).sort()).toEqual(['for our class', 'to everyone', 'to our family']);
  });

  it('shows a login with no household no family notes at all', async () => {
    const { rows } = await loadMyUpdates({ source: 'live' }, ['cls-ours'], null);

    expect(rows.map(r => r.id).sort()).toEqual(['for our class', 'to everyone']);
  });
});

describe('loadHouseholdSummary', () => {
  it('names the household, even when it has no active dancer', async () => {
    // A family whose children are all inactive still owns the notes sent to it.
    mockMembership.data = { household_id: 'hh-ours', member_type: 'guardian', student_id: null };

    const summary = await loadHouseholdSummary({ source: 'live' });

    expect(summary.householdId).toBe('hh-ours');
    expect(summary.students).toEqual([]);
  });

  it('is null for a login that belongs to no household', async () => {
    const summary = await loadHouseholdSummary({ source: 'live' });

    expect(summary.householdId).toBeNull();
  });
});
