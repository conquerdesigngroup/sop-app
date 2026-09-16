import React from 'react';
import { act, render } from '@testing-library/react';
import {
  DashboardSettingsProvider,
  useDashboardSettings,
  widgetShownTo,
  WidgetAudience,
  WidgetViewer,
} from './DashboardSettingsContext';

/**
 * The switches behind Settings → Customize Dashboard.
 *
 * WHY THIS EXISTS
 *
 * For as long as the setting existed, nothing read it: every switch was saved
 * and the dashboard drew every section anyway. The dashboard's own test pins
 * that the switches now hide things. This one pins the store under them — that
 * a choice survives a reload, and that one saved by an older build (eight
 * sections, and an order nobody could actually change) still means the same
 * thing once the list has grown.
 */

const STORAGE_KEY = 'sop_app_dashboard_settings';

let api: ReturnType<typeof useDashboardSettings>;
const Probe: React.FC = () => {
  api = useDashboardSettings();
  return null;
};
const mount = () => render(<DashboardSettingsProvider><Probe /></DashboardSettingsProvider>);

beforeEach(() => {
  localStorage.clear();
});

describe('the section list', () => {
  it('holds every section either dashboard draws, in the order they are drawn, all on', () => {
    mount();
    expect(api.widgets.map(w => w.id)).toEqual([
      'stats', 'overdueByPerson', 'hoursReview', 'latestActivity', 'classesToday', 'shortcuts',
      'todayTasks', 'upcomingTasks', 'overdueTasks', 'departments', 'recentSops', 'schedule', 'calendar',
    ]);
    expect(api.widgets.every(w => w.enabled)).toBe(true);
  });

  it('keeps a choice an older build saved, but not its order or its labels', () => {
    // As the eight-section build left it: Departments off, and a stored order
    // that put the calendar first.
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'calendar', name: 'An old label', enabled: true, order: 0 },
      { id: 'departments', name: 'Departments', enabled: false, order: 1 },
      { id: 'stats', name: 'Task Stats', enabled: true, order: 7 },
    ]));
    mount();

    expect(api.isWidgetEnabled('departments')).toBe(false);
    // A section added since is on, not missing.
    expect(api.isWidgetEnabled('shortcuts')).toBe(true);
    expect(api.widgets[0].id).toBe('stats');
    expect(api.widgets.find(w => w.id === 'calendar')!.name).toBe('Tasks & Events');
  });

  it('remembers a switch across a reload', () => {
    const first = mount();
    act(() => api.toggleWidget('shortcuts'));
    expect(api.isWidgetEnabled('shortcuts')).toBe(false);
    first.unmount();

    mount();
    expect(api.isWidgetEnabled('shortcuts')).toBe(false);
    expect(api.isWidgetEnabled('stats')).toBe(true);
  });

  it('turns everything back on with reset', () => {
    mount();
    act(() => api.toggleWidget('stats'));
    act(() => api.toggleWidget('calendar'));
    act(() => api.resetToDefaults());
    expect(api.widgets.every(w => w.enabled)).toBe(true);
  });

  it('starts from the defaults when storage holds something unreadable', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    mount();
    expect(api.widgets.every(w => w.enabled)).toBe(true);
  });
});

describe('widgetShownTo', () => {
  const viewer = (over: Partial<WidgetViewer> = {}): WidgetViewer => ({
    isAdmin: false, isSuperAdmin: false, holdsClasses: false, ...over,
  });
  const shown = (audience: WidgetAudience, v: WidgetViewer) => widgetShownTo({ audience }, v);

  it('offers a team member their own dashboard and nothing from the manager one', () => {
    const team = viewer();
    expect(shown('everyone', team)).toBe(true);
    expect(shown('team', team)).toBe(true);
    expect(shown('admin', team)).toBe(false);
    expect(shown('superAdmin', team)).toBe(false);
  });

  it('offers management the manager dashboard, and a super admin its cards', () => {
    expect(shown('team', viewer({ isAdmin: true }))).toBe(false);
    expect(shown('admin', viewer({ isAdmin: true }))).toBe(true);
    expect(shown('superAdmin', viewer({ isAdmin: true }))).toBe(false);
    expect(shown('superAdmin', viewer({ isAdmin: true, isSuperAdmin: true }))).toBe(true);
  });

  it('offers the classes card to whoever holds a class, whatever their role', () => {
    expect(shown('classHolder', viewer())).toBe(false);
    expect(shown('classHolder', viewer({ holdsClasses: true }))).toBe(true);
    expect(shown('classHolder', viewer({ isAdmin: true, holdsClasses: true }))).toBe(true);
  });
});
