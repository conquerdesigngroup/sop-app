import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

/**
 * Whose dashboard draws a section. The two dashboards are different pages:
 * a team member's is about their own tasks, a manager's about everyone's.
 */
export type WidgetAudience =
  | 'everyone'
  | 'team'          // the team member dashboard: anyone below management
  | 'admin'         // the management dashboard
  | 'superAdmin'    // cards on the management dashboard only a super admin gets
  | 'classHolder';  // anyone holding a class, on either dashboard

export interface DashboardWidget {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  order: number;
  audience: WidgetAudience;
}

/** Who is looking, in the terms a section's audience is written in. */
export interface WidgetViewer {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  holdsClasses: boolean;
}

export const widgetShownTo = (widget: Pick<DashboardWidget, 'audience'>, viewer: WidgetViewer): boolean => {
  switch (widget.audience) {
    case 'everyone': return true;
    case 'team': return !viewer.isAdmin;
    case 'admin': return viewer.isAdmin;
    case 'superAdmin': return viewer.isSuperAdmin;
    case 'classHolder': return viewer.holdsClasses;
    default: return false;
  }
};

interface DashboardSettingsContextType {
  widgets: DashboardWidget[];
  toggleWidget: (widgetId: string) => void;
  reorderWidgets: (widgetIds: string[]) => void;
  isWidgetEnabled: (widgetId: string) => boolean;
  resetToDefaults: () => void;
}

const DashboardSettingsContext = createContext<DashboardSettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'sop_app_dashboard_settings';

/**
 * Every section either dashboard draws, in the order they are drawn.
 *
 * Read by BOTH dashboards in src/pages/Dashboard.tsx and by
 * DashboardSettingsModal. Until the dashboards read it, every switch in the
 * modal was saved and then ignored: the setting existed and did nothing.
 *
 * One list serves both pages because, filtered by audience, it comes out in
 * each page's own order — a team member's runs shortcuts, stats, classes, their
 * tasks, calendar; a manager's runs shortcuts, stats, the three manager cards,
 * classes, departments, SOPs, schedule, calendar.
 */
const defaultWidgets: DashboardWidget[] = ([
  { id: 'shortcuts', name: 'Shortcuts', description: 'Big buttons for the pages you use most', audience: 'everyone' },
  { id: 'stats', name: 'Task Stats', description: 'Overview of pending, in-progress, and completed tasks', audience: 'everyone' },
  { id: 'overdueByPerson', name: 'Overdue by Person', description: 'Who is behind, and on how many tasks', audience: 'admin' },
  { id: 'hoursReview', name: 'Hours Awaiting Review', description: 'Logged hours waiting for your approval', audience: 'superAdmin' },
  { id: 'latestActivity', name: 'Latest Activity', description: 'The last few things that happened in the app', audience: 'superAdmin' },
  { id: 'classesToday', name: 'Your Classes Today', description: 'The classes you teach today, and where each register stands', audience: 'classHolder' },
  { id: 'todayTasks', name: "Today's Tasks", description: 'Tasks due today', audience: 'team' },
  { id: 'upcomingTasks', name: 'Upcoming Tasks', description: 'Tasks coming up this week', audience: 'team' },
  { id: 'overdueTasks', name: 'Overdue Tasks', description: 'Tasks past their due date', audience: 'team' },
  { id: 'departments', name: 'Departments', description: 'Quick access to department SOPs', audience: 'admin' },
  { id: 'recentSops', name: 'Recent SOPs', description: 'Recently created or updated SOPs', audience: 'admin' },
  { id: 'schedule', name: 'Work Schedule', description: 'Upcoming work schedule snapshot', audience: 'admin' },
  { id: 'calendar', name: 'Tasks & Events', description: 'Monthly calendar view with tasks and events', audience: 'everyone' },
] as Omit<DashboardWidget, 'enabled' | 'order'>[]).map((widget, order) => ({ ...widget, enabled: true, order }));

export const DashboardSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Merge with defaults to handle new widgets.
          //
          // Only `enabled` comes out of storage: it is the one thing a person
          // chooses. `name`, `description` and `audience` are code. Spreading
          // the whole stored widget over the default let a stale copy of a
          // label outlive a rename — anyone who had ever opened dashboard
          // settings kept seeing the old name forever, because their
          // localStorage said so.
          //
          // `order` is code too. Nothing in the app lets anyone reorder, so a
          // stored order is only ever an older build's list, and read back it
          // would slot the sections added since in among the old ones by index.
          const mergedWidgets = defaultWidgets.map(defaultWidget => {
            const storedWidget = parsed.find((w: DashboardWidget) => w.id === defaultWidget.id);
            if (!storedWidget) return defaultWidget;
            return {
              ...defaultWidget,
              enabled: typeof storedWidget.enabled === 'boolean' ? storedWidget.enabled : defaultWidget.enabled,
            };
          });
          return mergedWidgets;
        } catch {
          return defaultWidgets;
        }
      }
    }
    return defaultWidgets;
  });

  // Save to localStorage whenever widgets change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const toggleWidget = useCallback((widgetId: string) => {
    setWidgets(prev =>
      prev.map(widget =>
        widget.id === widgetId ? { ...widget, enabled: !widget.enabled } : widget
      )
    );
  }, []);

  const reorderWidgets = useCallback((widgetIds: string[]) => {
    setWidgets(prev => {
      const reordered = widgetIds.map((id, index) => {
        const widget = prev.find(w => w.id === id);
        return widget ? { ...widget, order: index } : null;
      }).filter((w): w is DashboardWidget => w !== null);

      // Add any missing widgets at the end
      const missingWidgets = prev.filter(w => !widgetIds.includes(w.id));
      missingWidgets.forEach((w, i) => {
        reordered.push({ ...w, order: reordered.length + i });
      });

      return reordered;
    });
  }, []);

  const isWidgetEnabled = useCallback((widgetId: string) => {
    const widget = widgets.find(w => w.id === widgetId);
    return widget?.enabled ?? true;
  }, [widgets]);

  const resetToDefaults = useCallback(() => {
    setWidgets(defaultWidgets);
  }, []);

  const value = useMemo(() => ({
    widgets,
    toggleWidget,
    reorderWidgets,
    isWidgetEnabled,
    resetToDefaults,
  }), [widgets, toggleWidget, reorderWidgets, isWidgetEnabled, resetToDefaults]);

  return (
    <DashboardSettingsContext.Provider value={value}>
      {children}
    </DashboardSettingsContext.Provider>
  );
};

export const useDashboardSettings = () => {
  const context = useContext(DashboardSettingsContext);
  if (!context) {
    throw new Error('useDashboardSettings must be used within a DashboardSettingsProvider');
  }
  return context;
};
