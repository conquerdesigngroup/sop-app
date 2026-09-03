import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Navigation from './Navigation';
import { bottomNavPathsFor } from './BottomNavigation';
import { MobileMenuProvider } from '../contexts/MobileMenuContext';

// react-router-dom 7 ships an `exports` map that this jest cannot resolve
// (see PortalAdminTabs.test for the same workaround). The header only needs
// a location, a navigate and a Link, so the mock is small and honest: Link
// is an anchor with the props the tests assert on passed straight through.
let mockPath = '/dashboard';
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPath }),
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...rest }: any) => {
    const React = require('react');
    return React.createElement('a', { href: to, ...rest }, children);
  },
}), { virtual: true });

// The header reads five hooks. Each is replaced with a switchable stub so a
// test can be a team member on a phone in one line and a super admin on a
// laptop in the next, without standing up the providers behind them.
const mockAuth = {
  currentUser: { id: 'u1', firstName: 'Ada', lastName: 'Lovelace', role: 'team' },
  logout: jest.fn(),
  isAdmin: false,
  isSuperAdmin: false,
};
let mockCanEditPortal = false;
let mockMobile = false;
let mockMyOverdue = 0;
let mockAllOverdue = 0;

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../contexts/PortalAdminContext', () => ({
  usePortalAdmin: () => ({ canEdit: mockCanEditPortal }),
}));
jest.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobileOrTablet: mockMobile }),
}));
jest.mock('../hooks/useTaskCounts', () => ({
  useTaskCounts: () => ({ myOverdue: mockMyOverdue, allOverdue: mockAllOverdue }),
}));
// The search palette reads the task and portal contexts; the header only
// needs to know it is there.
jest.mock('./GlobalSearch', () => () => null);
// The refresh button in both header layouts. Stubbed at the context so the
// test can see what a tap asks for without the registry behind it.
const mockRefresh = jest.fn();
jest.mock('../contexts/RefreshContext', () => ({
  useRefresh: () => ({ refreshing: false, reason: null, lastRefreshedAt: null, count: 1, refresh: mockRefresh }),
}));
jest.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn(), showToast: jest.fn() }),
}));
jest.mock('../contexts/ThemeContext', () => {
  const colors = {
    bg: { primary: '#000', secondary: '#111', tertiary: '#222' },
    txt: { primary: '#fff', secondary: '#ccc', tertiary: '#999' },
    bdr: { primary: '#333', secondary: '#444' },
  };
  return {
    useTheme: () => ({ isDark: true, toggleTheme: jest.fn() }),
    useThemeColors: () => colors,
  };
});

const asTeam = () => {
  mockAuth.isAdmin = false;
  mockAuth.isSuperAdmin = false;
  mockCanEditPortal = false;
};
const asAdmin = () => {
  mockAuth.isAdmin = true;
  mockAuth.isSuperAdmin = false;
  mockCanEditPortal = true;
};
const asSuperAdmin = () => {
  asAdmin();
  mockAuth.isSuperAdmin = true;
};

const renderAt = (path = '/dashboard') => {
  mockPath = path;
  // The sheet's open flag is shared with the bottom bar, so it lives in a
  // real (tiny) context rather than a stub.
  return render(
    <MobileMenuProvider>
      <Navigation />
    </MobileMenuProvider>
  );
};

beforeEach(() => {
  asTeam();
  mockMobile = false;
  mockMyOverdue = 0;
  mockAllOverdue = 0;
  // CRA's jest runs with resetMocks, so the resolved value is re-armed here.
  mockRefresh.mockReset().mockResolvedValue({ ok: true, failed: 0, total: 1 });
});

describe('refresh button', () => {
  it.each([
    ['phone', true],
    ['laptop', false],
  ])('is in the header on a %s and asks for a manual refresh', async (_label, mobile) => {
    mockMobile = mobile;
    renderAt('/dashboard');
    const button = screen.getByRole('button', { name: 'Refresh' });
    fireEvent.click(button);
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledWith('manual'));
  });
});

describe('mobile menu sheet', () => {
  beforeEach(() => { mockMobile = true; });

  it('draws no hamburger for a team member: everything they can reach is on the bottom bar', () => {
    renderAt();
    expect(screen.queryByRole('button', { name: /more pages/i })).not.toBeInTheDocument();
    // Search takes the hamburger's slot, and the account menu is still
    // there — the bar does not cover either.
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
  });

  it('gives a teacher with a class a sheet holding only the portal', () => {
    mockCanEditPortal = true;
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: /more pages/i }));
    const sheet = screen.getByRole('dialog', { name: 'More pages' });
    expect(within(sheet).getAllByRole('link').map(a => a.textContent)).toEqual(['Portal Manager']);
  });

  it('offers an admin only what the bottom bar does not, in sections', () => {
    asAdmin();
    renderAt();
    const trigger = screen.getByRole('button', { name: /more pages/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const sheet = screen.getByRole('dialog', { name: 'More pages' });
    // Management starts open because nothing remembers it closed and the
    // current page is not inside it either — it is only the once-toggled
    // state that persists.
    fireEvent.click(within(sheet).getByRole('button', { name: /management/i }));
    const labels = within(sheet).getAllByRole('link').map(a => a.textContent);
    expect(labels).toEqual(['SOPs', 'Hours Input', 'Team', 'Task Library', 'Portal Manager']);

    // Nothing in the sheet duplicates the admin bar, which carries Job Tasks.
    within(sheet).getAllByRole('link').forEach(a => {
      expect(bottomNavPathsFor(true)).not.toContain(a.getAttribute('href'));
    });
    // Search is the first row; "Back to menu" lives in the account menu only now.
    expect(within(sheet).getByRole('button', { name: /search/i })).toBeInTheDocument();
    expect(within(sheet).queryByText('Back to menu')).not.toBeInTheDocument();
  });

  it('remembers Management being closed', () => {
    asAdmin();
    window.localStorage.setItem('didc.nav.management-open', '0');
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: /more pages/i }));
    const sheet = screen.getByRole('dialog', { name: 'More pages' });
    expect(within(sheet).getByRole('button', { name: /management/i })).toHaveAttribute('aria-expanded', 'false');
    expect(within(sheet).queryByRole('link', { name: 'Team' })).not.toBeInTheDocument();
    window.localStorage.removeItem('didc.nav.management-open');
  });

  it('closes on Escape and hands focus back to the hamburger', () => {
    asAdmin();
    renderAt();
    const trigger = screen.getByRole('button', { name: /more pages/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'More pages' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'More pages' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('desktop header', () => {
  it('renders a single-entry group as the link itself', () => {
    renderAt();
    // A team member's Tasks group holds only My Tasks, so there is no
    // dropdown to open — the link is right there.
    expect(screen.getByRole('link', { name: /my tasks/i })).toHaveAttribute('href', '/my-tasks');
    expect(screen.queryByRole('button', { name: /^tasks$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^admin$/i })).not.toBeInTheDocument();
  });

  it('keeps the dropdown once a group has a choice in it', () => {
    asSuperAdmin();
    renderAt();
    const tasks = screen.getByRole('button', { name: /tasks/i });
    expect(tasks).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(tasks);
    expect(tasks).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /job tasks/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /admin/i })).toBeInTheDocument();
  });

  it('keeps Portal lit on its sub-pages', () => {
    asAdmin();
    renderAt('/portal-admin/clients');
    expect(screen.getByRole('link', { name: /portal/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('aria-current');
  });

  it('does not let Hours Input light up Team Schedule', () => {
    asSuperAdmin();
    renderAt('/hours-input');
    expect(screen.getByRole('link', { name: /hours input/i })).toHaveAttribute('aria-current', 'page');
    // Team Schedule sits inside the Admin group, so neither it nor the group
    // may read as current.
    const admin = screen.getByRole('button', { name: /admin/i });
    fireEvent.click(admin);
    expect(screen.getByRole('link', { name: /team schedule/i })).not.toHaveAttribute('aria-current');
  });

  it('keeps a super admin to one top-level row of entries', () => {
    asSuperAdmin();
    renderAt();
    // Dashboard, Tasks, SOPs, Calendar, Hours Input, Portal, Admin: seven,
    // not the nine that wrapped a 1280px header onto a second line.
    const admin = screen.getByRole('button', { name: /admin/i });
    fireEvent.click(admin);
    const inAdmin = ['Team', 'Team Schedule', 'Alerts', 'Activity Log', 'Archive'];
    inAdmin.forEach(label => expect(screen.getByRole('link', { name: label })).toBeInTheDocument());
  });

  it('shows how many tasks are overdue, and nothing when none are', () => {
    renderAt();
    expect(screen.queryByLabelText(/overdue$/)).not.toBeInTheDocument();

    mockMyOverdue = 3;
    renderAt();
    expect(screen.getByLabelText('3 overdue')).toBeInTheDocument();
  });

  it('puts Task Library in the Admin group, so a plain admin gets the dropdown', () => {
    asAdmin();
    renderAt();
    const admin = screen.getByRole('button', { name: /admin/i });
    fireEvent.click(admin);
    expect(screen.getByRole('link', { name: 'Task Library' })).toHaveAttribute('href', '/task-library');
  });

  it('puts Profile, Settings and Logout on real buttons that Escape can leave', () => {
    renderAt();
    const account = screen.getByRole('button', { name: /ada lovelace/i });
    expect(account).toHaveAttribute('aria-haspopup', 'true');
    fireEvent.click(account);

    expect(screen.getByRole('button', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to menu/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /logout/i })).not.toBeInTheDocument();
    expect(account).toHaveFocus();
  });
});
