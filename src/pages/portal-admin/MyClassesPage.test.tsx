import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MyClassesPage from './MyClassesPage';
import { PortalClass } from '../../types';

/**
 * The teacher's way into their own classes.
 *
 * The rules worth pinning are the ones that fail silently: a list that quietly
 * includes somebody else's class, a teacher whose All-Star classes vanish
 * because the page only looked at one program, and an Open button that lands
 * on the editor without saying which class to open.
 */

const mockNavigate = jest.fn();
let mockRedirectedTo: string | null = null;

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Navigate: ({ to }: { to: string }) => {
    mockRedirectedTo = to;
    return <div>redirected</div>;
  },
}), { virtual: true });

// useAdminList registers with the app-wide refresh; the provider is not what
// this page is being tested for.
jest.mock('../../contexts/RefreshContext', () => ({ useRefreshable: () => {} }));
jest.mock('../../hooks/useResponsive', () => ({ useResponsive: () => ({ isMobileOrTablet: false }) }));

const mockPortal: any = {};
jest.mock('../../contexts/PortalAdminContext', () => ({ usePortalAdmin: () => mockPortal }));

const klass = (over: Partial<PortalClass>): PortalClass => ({
  id: 'c1',
  programId: 'p-academy',
  category: 'class' as any,
  name: 'Junior Hip Hop',
  dayOfWeek: 2,
  startTime: '17:00:00',
  endTime: '18:00:00',
  level: null,
  location: 'Studio A',
  description: '',
  instructorName: 'Miss Sarah',
  sortOrder: 0,
  isActive: true,
  style: 'Hip Hop',
  ageGroup: 'Junior / Teen',
  ageMinYears: null,
  ageMaxYears: null,
  capacity: null,
  ...over,
} as PortalClass);

const ACADEMY = { id: 'p-academy', slug: 'academy', name: 'Academy' };
const ALLSTAR = { id: 'p-allstar', slug: 'all-stars', name: 'All-Stars' };

const ALL = [
  klass({ id: 'mine-academy', name: 'Junior Hip Hop' }),
  klass({ id: 'someone-elses', name: 'Adult Tap' }),
  klass({ id: 'mine-allstar', name: 'Senior Company', programId: 'p-allstar' }),
];

beforeEach(() => {
  mockNavigate.mockReset();
  mockRedirectedTo = null;
  Object.assign(mockPortal, {
    canEdit: true,
    checking: false,
    editableClassIds: ['mine-academy', 'mine-allstar'],
    programs: [ACADEMY, ALLSTAR],
    fetchAllClasses: jest.fn().mockResolvedValue(ALL),
  });
});

describe('MyClassesPage', () => {
  it('lists the classes this account holds and nobody else\'s', async () => {
    render(<MyClassesPage />);

    expect(await screen.findByText('Junior Hip Hop')).toBeInTheDocument();
    expect(screen.getByText('Senior Company')).toBeInTheDocument();
    // The whole point of the page: a class they do not hold is not theirs.
    expect(screen.queryByText('Adult Tap')).toBeNull();
  });

  it('crosses programs, because a teacher does', async () => {
    // A teacher holds Academy and All-Star classes alike. A page scoped to one
    // program would silently show half of them.
    render(<MyClassesPage />);

    await screen.findByText('Junior Hip Hop');
    expect(screen.getByRole('region', { name: 'Academy' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'All-Stars' })).toBeInTheDocument();
  });

  it('opens a class in the portal editor, naming its program and the class', async () => {
    render(<MyClassesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open Senior Company' }));
    // Without the program the editor falls back to the first one and then
    // ignores a class id that is not in it — the row would open nothing.
    expect(mockNavigate).toHaveBeenCalledWith(
      '/portal-admin?section=classes&class=mine-allstar&program=all-stars'
    );
  });

  it('says so, rather than showing an empty list, when no class is assigned yet', async () => {
    mockPortal.editableClassIds = [];
    render(<MyClassesPage />);

    expect(await screen.findByText(/No classes are assigned to you yet/i)).toBeInTheDocument();
  });

  it('keeps a class reachable when its program has gone missing', async () => {
    mockPortal.programs = [ACADEMY];
    render(<MyClassesPage />);

    // Hiding it would strand a class its teacher still holds.
    expect(await screen.findByText('Senior Company')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Senior Company' }));
    expect(mockNavigate).toHaveBeenCalledWith('/portal-admin?section=classes&class=mine-allstar');
  });

  it('turns away anyone can_edit_portal() refuses', async () => {
    mockPortal.canEdit = false;
    render(<MyClassesPage />);

    await waitFor(() => expect(mockRedirectedTo).toBe('/dashboard'));
    expect(mockPortal.fetchAllClasses).not.toHaveBeenCalled();
  });
});
