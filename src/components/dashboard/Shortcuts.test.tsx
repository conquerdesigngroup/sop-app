import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Shortcuts, { shortcutsFor } from './Shortcuts';
import { bottomNavPathsFor } from '../BottomNavigation';

/**
 * The dashboard's shortcuts, by role.
 *
 * WHY THIS EXISTS
 *
 * The grid is the other half of the bottom bar's bargain. Giving teachers
 * Attendance and Portal on the bar pushed pages off it, on the promise that
 * each one is still a tile here. That promise breaks silently — a tile removed
 * in a tidy-up still leaves a perfectly good-looking grid — so the invariant
 * is tested directly against the bar's own list rather than by eye.
 */

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/dashboard' }),
  useNavigate: () => jest.fn(),
}), { virtual: true });

const mockAuth = { isAdmin: false, currentUser: { id: 'me' } };
const mockPortal = { canEdit: false };
const mockCounts = { myOverdue: 0, allOverdue: 0 };

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../contexts/PortalAdminContext', () => ({ usePortalAdmin: () => mockPortal }));
jest.mock('../../hooks/useTaskCounts', () => ({ useTaskCounts: () => mockCounts }));

const labels = (isAdmin: boolean, teaches: boolean) =>
  shortcutsFor(isAdmin, teaches, 0).map(s => s.label);

beforeEach(() => {
  mockAuth.isAdmin = false;
  mockPortal.canEdit = false;
  mockCounts.myOverdue = 0;
});

describe('shortcutsFor', () => {
  const CLASS_HOLDER = ['Take attendance', 'Portal manager', 'Log hours', 'My tasks', 'Calendar', 'SOPs'];

  it('gives anyone who holds a class the class pages first', () => {
    expect(labels(false, true)).toEqual(CLASS_HOLDER);
    expect(labels(true, true)).toEqual(CLASS_HOLDER);
  });

  it('does not wait for the portal check to give management the class pages', () => {
    expect(labels(true, false)).toEqual(CLASS_HOLDER);
  });

  it('gives a team member with no class the pages of their day, and no class pages', () => {
    expect(labels(false, false)).toEqual(['Log hours', 'My tasks', 'Calendar', 'SOPs', 'My profile', 'Settings']);
  });

  it.each([[true, true], [true, false], [false, true], [false, false]])(
    'is six tiles for isAdmin=%s teaches=%s, so three across fills two whole rows',
    (isAdmin, teaches) => {
      expect(shortcutsFor(isAdmin, teaches, 0)).toHaveLength(6);
    },
  );

  it.each([
    ['management', true, true],
    ['management, before the portal check answers', true, false],
    ['a teacher', false, true],
    ['a team member with no class', false, false],
  ])('leaves no page of the day more than one tap from Home for %s', (_who, isAdmin, teaches) => {
    const reachable = new Set([
      ...bottomNavPathsFor(isAdmin, teaches),
      ...shortcutsFor(isAdmin, teaches, 0).map(s => s.to),
    ]);
    ['/my-tasks', '/calendar', '/hours-input', '/sop'].forEach(path => expect(reachable).toContain(path));
    if (isAdmin || teaches) {
      ['/attendance', '/portal-admin'].forEach(path => expect(reachable).toContain(path));
    }
  });

  it('never offers a page whose route would turn a team member away', () => {
    // These routes are adminOnly or superAdminOnly in App.tsx: a tile for one
    // would bounce a teacher straight back to this dashboard.
    const guarded = [
      '/job-tasks', '/task-library', '/team', '/archive', '/activity-log', '/alerts', '/hours',
      '/portal-admin/viewer', '/portal-admin/clients',
    ];
    [true, false].forEach(teaches => {
      const paths = shortcutsFor(false, teaches, 0).map(s => s.to);
      guarded.forEach(path => expect(paths).not.toContain(path));
    });
    // And nobody without a class is sent to pages that would be empty for them.
    const noClass = shortcutsFor(false, false, 0).map(s => s.to);
    expect(noClass).not.toContain('/attendance');
    expect(noClass).not.toContain('/portal-admin');
  });
});

describe('the grid', () => {
  it('goes to the page a tile names', () => {
    mockPortal.canEdit = true;
    const navigate = jest.fn();
    render(<Shortcuts navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: /take attendance/i }));
    expect(navigate).toHaveBeenCalledWith('/attendance');
    fireEvent.click(screen.getByRole('button', { name: /portal manager/i }));
    expect(navigate).toHaveBeenCalledWith('/portal-admin');
  });

  it('carries the overdue count on My tasks, and nothing when none are overdue', () => {
    const { unmount } = render(<Shortcuts navigate={jest.fn()} />);
    expect(screen.queryByTestId('count-badge')).toBeNull();
    unmount();

    mockCounts.myOverdue = 4;
    render(<Shortcuts navigate={jest.fn()} />);
    const myTasks = screen.getByRole('button', { name: /my tasks/i });
    expect(myTasks.querySelector('[data-testid="count-badge"]')).toHaveTextContent('4');
  });
});
