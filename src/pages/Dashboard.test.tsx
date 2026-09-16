import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import Dashboard from './Dashboard';
import { DashboardSettingsProvider } from '../contexts/DashboardSettingsContext';

/**
 * The dashboard obeys Customize Dashboard.
 *
 * WHY THIS EXISTS
 *
 * Settings → Customize Dashboard saved a switch for every section, and the
 * dashboard never read one of them: switching a section off changed nothing,
 * for everyone, for as long as the setting existed. Nothing failed — a
 * dashboard that ignores its settings still renders a perfectly good
 * dashboard — so the only guard against it happening again is a test that
 * switches sections off and looks.
 *
 * The settings store is real here; everything that fetches is stubbed.
 */

const mockNavigate = jest.fn();
const mockAuth = {
  isAdmin: false,
  isSuperAdmin: false,
  currentUser: { id: 'me', firstName: 'Amy', lastName: 'M' },
  users: [] as unknown[],
};
const mockPortal: { checking: boolean; editableClassIds: string[] } = { checking: false, editableClassIds: [] };
const mockActivity = { calls: 0 };

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../contexts/SOPContext', () => ({
  useSOPs: () => ({
    sops: [{ id: 's1', title: 'Opening the studio', category: 'Front Desk', department: 'Operations', status: 'published', isTemplate: false, steps: [], createdAt: '2026-09-01' }],
    loading: false,
  }),
}));
jest.mock('../contexts/TaskContext', () => ({ useTask: () => ({ jobTasks: [], loading: false }) }));
jest.mock('../contexts/EventContext', () => ({ useEvent: () => ({ events: [] }) }));
jest.mock('../contexts/WorkHoursContext', () => ({ useWorkHours: () => ({ workDays: [], workHours: [] }) }));
// A plain function rather than jest.fn: CRA's jest runs with resetMocks.
const mockFetchPage = () => { mockActivity.calls += 1; return Promise.resolve([]); };
jest.mock('../contexts/ActivityLogContext', () => ({ useActivityLog: () => ({ fetchPage: mockFetchPage }) }));
jest.mock('../contexts/PortalAdminContext', () => ({ usePortalAdmin: () => mockPortal }));
jest.mock('../contexts/RefreshContext', () => ({ useRefreshable: () => undefined }));
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: true }),
  useThemeColors: () => ({
    bg: { primary: '#000', secondary: '#111', tertiary: '#222' },
    txt: { primary: '#fff', secondary: '#ccc', tertiary: '#999' },
    bdr: { primary: '#333', secondary: '#444' },
  }),
}));
// The two detail modals reach for Google Calendar; neither is under test.
jest.mock('../components/CalendarTaskModal', () => () => null);
jest.mock('../components/EventDetailModal', () => () => null);
jest.mock('../lib/attendanceStaff', () => ({
  loadDay: () => Promise.resolve({ days: [], error: null }),
  loadGaps: () => Promise.resolve({ rows: [], error: null }),
}));

const STORAGE_KEY = 'sop_app_dashboard_settings';

/** Switch the named sections off, the way the modal stores it. */
const switchOff = (...ids: string[]) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.map(id => ({ id, enabled: false }))));

const ALL = [
  'stats', 'overdueByPerson', 'hoursReview', 'latestActivity', 'classesToday', 'shortcuts',
  'todayTasks', 'upcomingTasks', 'overdueTasks', 'departments', 'recentSops', 'schedule', 'calendar',
];

const draw = () => render(<DashboardSettingsProvider><Dashboard /></DashboardSettingsProvider>);

beforeEach(() => {
  localStorage.clear();
  mockAuth.isAdmin = false;
  mockAuth.isSuperAdmin = false;
  mockPortal.checking = false;
  mockPortal.editableClassIds = [];
  mockActivity.calls = 0;
});

describe("a team member's dashboard", () => {
  it('draws every section while nothing is switched off', () => {
    draw();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Shortcuts' })).toBeInTheDocument();
    expect(screen.getByText('Today (0)')).toBeInTheDocument();
    expect(screen.getByText('Upcoming (0)')).toBeInTheDocument();
    expect(screen.getByText('Tasks & Events')).toBeInTheDocument();
  });

  it('leaves out exactly the sections switched off', () => {
    switchOff('shortcuts', 'todayTasks', 'calendar');
    draw();
    expect(screen.queryByRole('region', { name: 'Shortcuts' })).not.toBeInTheDocument();
    expect(screen.queryByText('Today (0)')).not.toBeInTheDocument();
    expect(screen.queryByText('Tasks & Events')).not.toBeInTheDocument();
    // And nothing else went with them.
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Upcoming (0)')).toBeInTheDocument();
  });

  it('hides the classes card for a teacher who switched it off', () => {
    mockPortal.editableClassIds = ['cls-1'];
    switchOff('classesToday');
    draw();
    expect(screen.queryByRole('region', { name: 'Your classes today' })).not.toBeInTheDocument();
  });
});

describe("the manager's dashboard", () => {
  beforeEach(() => {
    mockAuth.isAdmin = true;
    mockAuth.isSuperAdmin = true;
  });

  it('leaves out the switched-off manager sections', async () => {
    switchOff('departments', 'recentSops', 'schedule', 'overdueByPerson');
    draw();
    expect(screen.queryByText('Departments')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent SOPs')).not.toBeInTheDocument();
    expect(screen.queryByText('Work Schedule')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Overdue by person' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Hours awaiting review' })).toBeInTheDocument();
    expect(screen.getByText('Tasks & Events')).toBeInTheDocument();
    // Latest Activity is still on, and its load lands after the first paint.
    // Waited for here so that setState is not left outside act.
    expect(await screen.findByText('Nothing logged yet.')).toBeInTheDocument();
  });

  it('does not even ask for the activity log while Latest Activity is off', () => {
    switchOff('latestActivity');
    draw();
    expect(screen.queryByRole('region', { name: 'Latest activity' })).not.toBeInTheDocument();
    expect(mockActivity.calls).toBe(0);
  });
});

describe('with everything switched off', () => {
  it('says so, and opens the switches right there', () => {
    switchOff(...ALL);
    draw();
    expect(screen.getByText('Every section of your dashboard is switched off.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Customize dashboard' }));
    const modal = screen.getByRole('dialog', { name: 'Customize Dashboard' });
    fireEvent.click(within(modal).getByRole('switch', { name: 'Shortcuts' }));

    // The section comes back behind the modal, and the notice goes.
    expect(screen.getByRole('region', { name: 'Shortcuts' })).toBeInTheDocument();
    expect(screen.queryByText('Every section of your dashboard is switched off.')).not.toBeInTheDocument();
  });

  it('counts only sections this dashboard draws', () => {
    // Departments is still "on", but a team member's dashboard has no
    // Departments section — so their page is empty all the same.
    switchOff(...ALL.filter(id => id !== 'departments'));
    draw();
    expect(screen.getByText('Every section of your dashboard is switched off.')).toBeInTheDocument();
  });

  it('says nothing while anything at all is still shown', () => {
    switchOff(...ALL.filter(id => id !== 'calendar'));
    draw();
    expect(screen.queryByText('Every section of your dashboard is switched off.')).not.toBeInTheDocument();
  });
});
