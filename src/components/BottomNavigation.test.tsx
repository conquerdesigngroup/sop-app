import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import BottomNavigation from './BottomNavigation';
import { MobileMenuProvider, useMobileMenu } from '../contexts/MobileMenuContext';
import { JobTask } from '../types';

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
 * A date string `days` from now, built in LOCAL time.
 *
 * Deliberately not `toISOString()`. The bar decides overdue against the local
 * date, but an ISO string is UTC — so from 17:00 Pacific onwards, when it is
 * already tomorrow in UTC, `yesterday()` handed back *today's* local date,
 * nothing was overdue and the two badge tests below failed every evening and
 * passed again the next morning. Same rule as `todayIso()` in
 * supabase/functions/alert-push, which reads the parts rather than the offset.
 */
const dayFromNow = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const yesterday = (): string => dayFromNow(-1);

const tomorrow = (): string => dayFromNow(1);

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
  mockTasks.jobTasks = [];
  mockNavigate.mockClear();
});

describe('BottomNavigation', () => {
  it('gives a team member Home, Tasks, Calendar, Hours and SOPs', () => {
    renderBar();
    expect(tabLabels()).toEqual(['Home', 'Tasks', 'Calendar', 'Hours', 'SOPs']);
  });

  it('gives management Job Tasks and More instead of Hours and SOPs', () => {
    mockAuth.isAdmin = true;
    renderBar();
    expect(tabLabels()).toEqual(['Home', 'Tasks', 'Job Tasks', 'Calendar', 'More']);
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

  it('shows management everyone\'s overdue on Job Tasks and their own on Tasks', () => {
    mockAuth.isAdmin = true;
    mockTasks.jobTasks = [
      task({ assignedTo: ['me'], scheduledDate: yesterday() }),
      task({ assignedTo: ['a'], scheduledDate: yesterday() }),
      task({ assignedTo: ['b'], status: 'overdue' }),
      task({ assignedTo: ['c'], scheduledDate: yesterday(), status: 'archived' }),
    ];
    renderBar();
    const tasks = screen.getByRole('button', { name: 'Tasks' });
    const jobTasks = screen.getByRole('button', { name: 'Job Tasks' });
    expect(tasks.querySelector('[data-testid="count-badge"]')).toHaveTextContent('1');
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
