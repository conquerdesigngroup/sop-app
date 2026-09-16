import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import BottomNavigation from './BottomNavigation';
import { MobileMenuProvider, useMobileMenu } from '../contexts/MobileMenuContext';
import { JobTask } from '../types';
import { studioToday, shiftIsoDays } from '../lib/studioDate';

/**
 * The bottom bar, by role.
 *
 * WHY THIS EXISTS
 *
 * The bar used to be the same five tabs for everyone, so an admin's daily
 * pages sat two taps away behind the hamburger. Now it is chosen by role and
 * carries overdue counts. Both are the kind of thing that quietly regresses:
 * a refactor that drops the `isAdmin` branch still renders five perfectly
 * good tabs, and a badge that counts the wrong set of tasks still shows a
 * number. These tests pin what each role sees and what the numbers mean.
 */

const mockAuth = { isAdmin: false, currentUser: { id: 'me' } };
const mockPortal = { canEdit: false };
const mockTasks: { jobTasks: Partial<JobTask>[] } = { jobTasks: [] };
const mockRoute = { pathname: '/dashboard' };
const mockNavigate = jest.fn();

// react-router-dom 7 ships ESM that this jest cannot resolve, and the bar
// only reads the current path and asks for a navigate function anyway.
jest.mock('react-router-dom', () => ({
  useLocation: () => mockRoute,
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

// can_edit_portal(): admin, or holds at least one class. Decides whether a
// team member's bar carries Attendance and Portal.
jest.mock('../contexts/PortalAdminContext', () => ({
  usePortalAdmin: () => mockPortal,
}));

jest.mock('../contexts/TaskContext', () => ({
  useTask: () => mockTasks,
}));

jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: true }),
  useThemeColors: () => ({
    bg: { primary: '#000', secondary: '#111', tertiary: '#222' },
    txt: { primary: '#fff', secondary: '#ccc', tertiary: '#999' },
    bdr: { primary: '#333', secondary: '#444' },
  }),
}));

/** Reports the shared menu flag so a test can see what "More" did. */
const MenuProbe: React.FC = () => {
  const { isOpen } = useMobileMenu();
  return <div data-testid="menu-state">{isOpen ? 'open' : 'closed'}</div>;
};

/**
 * Relative to the STUDIO's date, because that is what the badge counts
 * against (studioToday() in src/lib/studioDate.ts). Built from UTC these
 * drifted by a day whenever the runner's UTC date was ahead of California's
 * — every evening, Pacific — and the suite would then fail on a CI box in
 * any zone but this one.
 */
const yesterday = (): string => shiftIsoDays(studioToday(), -1);
const tomorrow = (): string => shiftIsoDays(studioToday(), 1);

const task = (overrides: Partial<JobTask>): Partial<JobTask> => ({
  id: Math.random().toString(36).slice(2),
  status: 'pending',
  assignedTo: [],
  scheduledDate: tomorrow(),
  ...overrides,
});

const renderBar = (path = '/dashboard') => {
  mockRoute.pathname = path;
  return render(
    <MobileMenuProvider>
      <BottomNavigation />
      <MenuProbe />
    </MobileMenuProvider>
  );
};

const tabLabels = () =>
  screen.getAllByRole('button').map(b => b.getAttribute('aria-label'));

beforeEach(() => {
  mockAuth.isAdmin = false;
  mockPortal.canEdit = false;
  mockTasks.jobTasks = [];
  mockNavigate.mockClear();
});

describe('BottomNavigation', () => {
  it('gives a team member Home, Tasks, Calendar, Hours and SOPs', () => {
    renderBar();
    expect(tabLabels()).toEqual(['Home', 'Tasks', 'Calendar', 'Hours', 'SOPs']);
  });

  it('gives management Attendance and Portal in the middle, with Job Tasks and More', () => {
    mockAuth.isAdmin = true;
    mockPortal.canEdit = true;
    renderBar();
    expect(tabLabels()).toEqual(['Home', 'Job Tasks', 'Attendance', 'Portal', 'More']);
  });

  it('does not wait for the portal check before drawing the admin bar', () => {
    // can_edit_portal() is true for every admin. Keying the admin bar on the
    // async answer would draw one bar at load and a different one a beat later.
    mockAuth.isAdmin = true;
    mockPortal.canEdit = false;
    renderBar();
    expect(tabLabels()).toEqual(['Home', 'Job Tasks', 'Attendance', 'Portal', 'More']);
  });

  it('gives a teacher with a class Attendance and Portal in place of Calendar and SOPs', () => {
    // The register happens at the top of every lesson and the class's families
    // hear from Portal after it; Calendar and SOPs are looked up now and then,
    // and move into the sheet. Hours stays: logging time is a phone job.
    mockPortal.canEdit = true;
    renderBar();
    expect(tabLabels()).toEqual(['Home', 'Tasks', 'Attendance', 'Portal', 'Hours']);
  });

  it('leaves the bar alone for a team member who holds no class', () => {
    // The important half of the rule. Someone with no classes has no
    // attendance to take and no class to post to, so both tabs would be
    // permanent dead ends — and adding them would also hand them a hamburger
    // they have never needed.
    renderBar();
    expect(tabLabels()).toEqual(['Home', 'Tasks', 'Calendar', 'Hours', 'SOPs']);
  });

  it('keeps Portal lit on its sub-pages', () => {
    mockAuth.isAdmin = true;
    renderBar('/portal-admin/clients');
    expect(screen.getByRole('button', { name: 'Portal' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('a class tab navigates to its page', () => {
    mockPortal.canEdit = true;
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Attendance' }));
    expect(mockNavigate).toHaveBeenCalledWith('/attendance');
    fireEvent.click(screen.getByRole('button', { name: 'Portal' }));
    expect(mockNavigate).toHaveBeenCalledWith('/portal-admin');
  });

  it('More opens the shared menu sheet rather than navigating', () => {
    mockAuth.isAdmin = true;
    renderBar();
    expect(screen.getByTestId('menu-state')).toHaveTextContent('closed');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByTestId('menu-state')).toHaveTextContent('open');
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('a route tab navigates', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(mockNavigate).toHaveBeenCalledWith('/calendar');
  });

  it('counts only my overdue tasks on the Tasks tab', () => {
    mockTasks.jobTasks = [
      task({ assignedTo: ['me'], scheduledDate: yesterday() }),
      task({ assignedTo: ['me'], scheduledDate: yesterday(), status: 'in-progress' }),
      // Not mine.
      task({ assignedTo: ['someone-else'], scheduledDate: yesterday() }),
      // Mine, but done, or not yet due.
      task({ assignedTo: ['me'], scheduledDate: yesterday(), status: 'completed' }),
      task({ assignedTo: ['me'], scheduledDate: tomorrow() }),
    ];
    renderBar();
    const badges = screen.getAllByTestId('count-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('2');
  });

  it('shows management everyone\'s overdue on Job Tasks, their own included', () => {
    // My Tasks moved into the sheet, where its own count still shows. The one
    // badge on the bar already counts the admin's overdue alongside everyone's.
    mockAuth.isAdmin = true;
    mockTasks.jobTasks = [
      task({ assignedTo: ['me'], scheduledDate: yesterday() }),
      task({ assignedTo: ['a'], scheduledDate: yesterday() }),
      task({ assignedTo: ['b'], status: 'overdue' }),
      task({ assignedTo: ['c'], scheduledDate: yesterday(), status: 'archived' }),
    ];
    renderBar();
    const badges = screen.getAllByTestId('count-badge');
    expect(badges).toHaveLength(1);
    const jobTasks = screen.getByRole('button', { name: 'Job Tasks' });
    expect(jobTasks.querySelector('[data-testid="count-badge"]')).toHaveTextContent('3');
  });

  it('shows no badge at all when nothing is overdue', () => {
    mockAuth.isAdmin = true;
    mockTasks.jobTasks = [task({ assignedTo: ['me'] })];
    renderBar();
    expect(screen.queryByTestId('count-badge')).toBeNull();
  });

  it('marks the current route as the active tab', () => {
    renderBar('/hours-input');
    expect(screen.getByRole('button', { name: 'Hours' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });
});
