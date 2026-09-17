import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { PortalProvider, usePortal } from './PortalContext';

/**
 * The section list follows the account.
 *
 * Since v55 portal_programs answers per account: an All-Star family and staff
 * get both sections, every other family gets Academy/TNT alone, and the login
 * screen — signed out — is told about both. The provider is mounted around the
 * login page and survives signing in, because signing in navigates rather than
 * reloads. So the list it read on the login screen is the one a family would be
 * shown on their dashboard, All-Star tile included, unless it reloads when the
 * account changes. That reload is the thing pinned here, along with its two
 * ways to go wrong: reloading on every token refresh, and letting the signed-out
 * answer land after the signed-in one and paint over it.
 *
 * Neither can be checked in a browser without an account of each kind.
 */

type Answer = { data: any[]; error: null };

const mockProgramsAnswers: Promise<Answer>[] = [];
// Implemented in beforeEach: CRA's Jest resets every mock's implementation
// before each test, so one given here would be gone by the first.
const mockProgramsQuery = jest.fn();
let mockAuthListener: ((event: string, session: any) => void) | null = null;

jest.mock('../lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    from: (table: string) => (table === 'portal_programs'
      ? { select: () => ({ eq: () => ({ order: () => mockProgramsQuery() }) }) }
      // portal_instructor_looks: decoration, and none of this test's business.
      : { select: () => Promise.resolve({ data: [], error: null }) }),
    auth: {
      onAuthStateChange: (listener: (event: string, session: any) => void) => {
        mockAuthListener = listener;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));

jest.mock('../lib/portalStorage', () => ({ signDocumentUrls: () => Promise.resolve({}) }));
jest.mock('./RefreshContext', () => ({ useRefreshable: () => {} }));

const row = (slug: string, sortOrder: number) => ({
  id: `prog-${slug}`,
  slug,
  name: slug,
  blurb: '',
  requires_code: false,
  sort_order: sortOrder,
  is_active: true,
  hero_path: null,
  hero_alt: null,
});

const answer = (...slugs: string[]): Answer => ({
  data: slugs.map((slug, i) => row(slug, i)),
  error: null,
});

const Probe: React.FC = () => {
  const { programs, loading } = usePortal();
  return (
    <p data-testid="sections">
      {loading ? 'loading' : programs.map(p => p.slug).join(',') || 'none'}
    </p>
  );
};

const renderProvider = () => render(<PortalProvider><Probe /></PortalProvider>);

const sections = () => screen.getByTestId('sections');

const emit = (event: string, userId: string | null) =>
  act(() => mockAuthListener!(event, userId ? { user: { id: userId } } : null));

beforeEach(() => {
  mockProgramsAnswers.length = 0;
  mockProgramsQuery.mockImplementation(
    () => mockProgramsAnswers.shift() ?? Promise.resolve({ data: [], error: null }),
  );
  mockAuthListener = null;
});

it('reloads the sections when a family signs in', async () => {
  mockProgramsAnswers.push(Promise.resolve(answer('allstars', 'academy'))); // the login screen, signed out
  mockProgramsAnswers.push(Promise.resolve(answer('academy'))); // the Academy family who signs in

  renderProvider();
  await waitFor(() => expect(sections()).toHaveTextContent('allstars,academy'));

  emit('INITIAL_SESSION', null);
  emit('SIGNED_IN', 'academy-parent');

  await waitFor(() => expect(sections()).toHaveTextContent(/^academy$/));
  expect(mockProgramsQuery).toHaveBeenCalledTimes(2);
});

it('does not reload when the same account only refreshes its token', async () => {
  mockProgramsAnswers.push(Promise.resolve(answer('academy')));

  renderProvider();
  await waitFor(() => expect(sections()).toHaveTextContent(/^academy$/));

  emit('INITIAL_SESSION', 'academy-parent');
  emit('TOKEN_REFRESHED', 'academy-parent');
  // The reload is dispatched on a timer; give one the chance to fire.
  await act(() => new Promise(resolve => setTimeout(resolve, 20)));

  expect(mockProgramsQuery).toHaveBeenCalledTimes(1);
  expect(sections()).toHaveTextContent(/^academy$/);
});

it("drops the previous account's answer when it arrives after the new one", async () => {
  let answerSignedOut!: (value: Answer) => void;
  mockProgramsAnswers.push(new Promise<Answer>(resolve => { answerSignedOut = resolve; }));
  mockProgramsAnswers.push(Promise.resolve(answer('academy')));

  renderProvider();
  emit('INITIAL_SESSION', null);
  emit('SIGNED_IN', 'academy-parent');
  await waitFor(() => expect(sections()).toHaveTextContent(/^academy$/));

  // The read the login screen started, answering late with both sections.
  await act(async () => { answerSignedOut(answer('allstars', 'academy')); });

  expect(sections()).toHaveTextContent(/^academy$/);
});
