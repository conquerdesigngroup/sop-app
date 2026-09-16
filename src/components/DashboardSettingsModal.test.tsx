import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DashboardSettingsModal from './DashboardSettingsModal';
import { DashboardSettingsProvider } from '../contexts/DashboardSettingsContext';

/**
 * Customize Dashboard, by role.
 *
 * The modal must offer exactly the sections the person's own dashboard draws.
 * It used to offer everyone the same eight, so a team member could switch off
 * Departments or Work Schedule — sections that only exist on the manager's
 * dashboard — and see nothing change.
 */

const mockAuth = { isAdmin: false, isSuperAdmin: false };
const mockPortal: { checking: boolean; editableClassIds: string[] } = { checking: false, editableClassIds: [] };

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../contexts/PortalAdminContext', () => ({ usePortalAdmin: () => mockPortal }));
jest.mock('../contexts/ThemeContext', () => ({
  useThemeColors: () => ({
    bg: { primary: '#000', secondary: '#111', tertiary: '#222' },
    txt: { primary: '#fff', secondary: '#ccc', tertiary: '#999' },
    bdr: { primary: '#333', secondary: '#444' },
  }),
}));

const open = () => render(
  <DashboardSettingsProvider>
    <DashboardSettingsModal isOpen onClose={() => undefined} />
  </DashboardSettingsProvider>
);

// In the order the list shows them, by each switch's accessible name.
const offered = () => screen.getAllByRole('switch').map(s => {
  const id = s.getAttribute('aria-labelledby');
  return id ? document.getElementById(id)?.textContent : null;
});

beforeEach(() => {
  localStorage.clear();
  mockAuth.isAdmin = false;
  mockAuth.isSuperAdmin = false;
  mockPortal.checking = false;
  mockPortal.editableClassIds = [];
});

describe('what it offers', () => {
  it('gives a team member with no class their own dashboard, and nothing of the manager one', () => {
    open();
    expect(offered()).toEqual([
      'Task Stats', 'Shortcuts', "Today's Tasks", 'Upcoming Tasks', 'Overdue Tasks', 'Tasks & Events',
    ]);
  });

  it('adds the classes card for a teacher, but not while the portal check is still out', () => {
    mockPortal.editableClassIds = ['cls-1'];
    const { unmount } = open();
    expect(offered()).toEqual([
      'Task Stats', 'Your Classes Today', 'Shortcuts', "Today's Tasks", 'Upcoming Tasks', 'Overdue Tasks', 'Tasks & Events',
    ]);
    unmount();

    mockPortal.checking = true;
    open();
    expect(offered()).not.toContain('Your Classes Today');
  });

  it('gives management the manager dashboard, without the super-admin cards', () => {
    mockAuth.isAdmin = true;
    mockPortal.editableClassIds = ['cls-1'];
    open();
    expect(offered()).toEqual([
      'Task Stats', 'Overdue by Person', 'Your Classes Today', 'Shortcuts',
      'Departments', 'Recent SOPs', 'Work Schedule', 'Tasks & Events',
    ]);
  });

  it('gives a super admin the hours and activity cards too', () => {
    mockAuth.isAdmin = true;
    mockAuth.isSuperAdmin = true;
    open();
    expect(offered()).toEqual([
      'Task Stats', 'Overdue by Person', 'Hours Awaiting Review', 'Latest Activity', 'Shortcuts',
      'Departments', 'Recent SOPs', 'Work Schedule', 'Tasks & Events',
    ]);
  });

  it('says where the choice is kept', () => {
    open();
    expect(screen.getByText(/saved on this device/i)).toBeInTheDocument();
  });
});

describe('switching', () => {
  it('flips once whether the switch or the rest of the row is tapped', () => {
    open();
    const shortcuts = screen.getByRole('switch', { name: 'Shortcuts' });
    expect(shortcuts).toHaveAttribute('aria-checked', 'true');

    // The switch sits inside the tappable row: one tap must not count twice.
    fireEvent.click(shortcuts);
    expect(shortcuts).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByText('Big buttons for the pages you use most'));
    expect(shortcuts).toHaveAttribute('aria-checked', 'true');
  });

  it('saves the choice, and puts everything back on with Reset to Defaults', () => {
    open();
    fireEvent.click(screen.getByRole('switch', { name: 'Tasks & Events' }));
    const stored = JSON.parse(localStorage.getItem('sop_app_dashboard_settings') || '[]');
    expect(stored.find((w: { id: string }) => w.id === 'calendar').enabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    expect(screen.getAllByRole('switch').every(s => s.getAttribute('aria-checked') === 'true')).toBe(true);
  });
});
