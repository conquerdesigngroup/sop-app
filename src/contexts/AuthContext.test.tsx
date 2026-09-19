import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

/**
 * Who the staff app lets in.
 *
 * Deactivating a staff member only sets profiles.is_active = false. The
 * database already treats that profile as non-staff, but the app decided who
 * was signed in from the role alone, so a deactivated account with a session
 * got the staff app: the navigation, the admin menus, every page.
 *
 * Both directions are pinned. Letting a deactivated account in is the bug;
 * locking an active one out would be worse and just as quiet.
 */

type Session = { user: { id: string; email: string } };

let mockSession: Session | null = null;
let mockProfile: Record<string, unknown> = {};
let mockListener: ((event: string, session: Session | null) => void) | null = null;
const mockSignOuts: string[] = [];
// supabase-js returns an error instead of throwing when /logout fails, and
// then keeps the session and sends no SIGNED_OUT.
let mockSignOutFails = false;

jest.mock('../lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: mockSession } }),
      onAuthStateChange: (cb: (event: string, session: Session | null) => void) => {
        mockListener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: ({ email }: { email: string }) => {
        mockSession = { user: { id: 'staff-1', email } };
        mockListener?.('SIGNED_IN', mockSession);
        return Promise.resolve({ data: { user: mockSession.user, session: mockSession }, error: null });
      },
      signOut: (opts?: { scope?: string }) => {
        mockSignOuts.push(opts?.scope ?? 'global');
        if (mockSignOutFails) return Promise.resolve({ error: { message: 'Failed to fetch' } });
        mockSession = null;
        mockListener?.('SIGNED_OUT', null);
        return Promise.resolve({ error: null });
      },
    },
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        neq: () => query,
        order: () => Promise.resolve({ data: [], error: null }),
        single: () => Promise.resolve({ data: mockProfile, error: null }),
      };
      return query;
    },
    channel: () => {
      const channel: any = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: () => {},
  },
}));

jest.mock('../utils/activityLogger', () => ({ logActivity: () => {} }));
jest.mock('../lib/activityLog', () => ({ logActivity: () => Promise.resolve() }));
jest.mock('../lib/clientAuth', () => ({ reportSignInFailure: () => {}, reportResetRequested: () => {} }));
jest.mock('./RefreshContext', () => ({ useRefreshable: () => {} }));

const staffProfile = (isActive: boolean) => ({
  id: 'staff-1',
  email: 'sam@example.com',
  first_name: 'Sam',
  last_name: 'Ortega',
  role: 'team',
  department: 'Front Desk',
  is_active: isActive,
});

const Probe: React.FC = () => {
  const { loading, isAuthenticated, currentUser, login } = useAuth();
  const [result, setResult] = React.useState('');
  return (
    <>
      <div data-testid="who">{loading ? 'loading' : isAuthenticated ? `in:${currentUser?.email}` : 'out'}</div>
      <div data-testid="login-result">{result}</div>
      <button onClick={async () => setResult(String(await login('sam@example.com', 'correct horse')))}>log in</button>
    </>
  );
};

// Every auth path hops through setTimeout and a profile read before it
// settles, so assertions wait on real time inside act.
const settle = () => act(() => new Promise((r) => setTimeout(r, 30)));

beforeEach(() => {
  mockSession = null;
  mockListener = null;
  mockSignOuts.length = 0;
  mockSignOutFails = false;
});

it('keeps a stored session out when the profile has been deactivated, and ends it on this device', async () => {
  mockSession = { user: { id: 'staff-1', email: 'sam@example.com' } };
  mockProfile = staffProfile(false);
  render(<AuthProvider><Probe /></AuthProvider>);
  await settle();

  expect(screen.getByTestId('who')).toHaveTextContent('out');
  expect(mockSignOuts).toEqual(['local']);
});

it('turns a deactivated sign-in away, and the sign-in event does not let it in afterwards', async () => {
  mockProfile = staffProfile(false);
  render(<AuthProvider><Probe /></AuthProvider>);
  await settle();

  fireEvent.click(screen.getByRole('button', { name: 'log in' }));
  await settle();

  expect(screen.getByTestId('login-result')).toHaveTextContent('false');
  expect(screen.getByTestId('who')).toHaveTextContent('out');
  expect(mockSignOuts).toEqual(['local']);
});

it('signs out an open session at its next token refresh once the account is deactivated', async () => {
  mockSession = { user: { id: 'staff-1', email: 'sam@example.com' } };
  mockProfile = staffProfile(true);
  render(<AuthProvider><Probe /></AuthProvider>);
  await settle();
  expect(screen.getByTestId('who')).toHaveTextContent('in:sam@example.com');

  mockProfile = staffProfile(false);
  act(() => mockListener?.('TOKEN_REFRESHED', mockSession));
  await settle();

  expect(screen.getByTestId('who')).toHaveTextContent('out');
  expect(mockSignOuts).toEqual(['local']);
});

it('lets an active staff member in and leaves their session alone', async () => {
  mockSession = { user: { id: 'staff-1', email: 'sam@example.com' } };
  mockProfile = staffProfile(true);
  render(<AuthProvider><Probe /></AuthProvider>);
  await settle();

  expect(screen.getByTestId('who')).toHaveTextContent('in:sam@example.com');
  expect(mockSignOuts).toEqual([]);
});

it('keeps an open tab out even when the sign-out request itself fails', async () => {
  mockSession = { user: { id: 'staff-1', email: 'sam@example.com' } };
  mockProfile = staffProfile(true);
  render(<AuthProvider><Probe /></AuthProvider>);
  await settle();

  mockProfile = staffProfile(false);
  mockSignOutFails = true;
  act(() => mockListener?.('TOKEN_REFRESHED', mockSession));
  await settle();

  expect(screen.getByTestId('who')).toHaveTextContent('out');
});

it("leaves a parent's session to the portal, active or not", async () => {
  mockSession = { user: { id: 'parent-1', email: 'rosa@example.com' } };
  mockProfile = { ...staffProfile(false), id: 'parent-1', email: 'rosa@example.com', role: 'client' };
  render(<AuthProvider><Probe /></AuthProvider>);
  await settle();
  act(() => mockListener?.('TOKEN_REFRESHED', mockSession));
  await settle();

  expect(screen.getByTestId('who')).toHaveTextContent('out');
  expect(mockSignOuts).toEqual([]);
});
