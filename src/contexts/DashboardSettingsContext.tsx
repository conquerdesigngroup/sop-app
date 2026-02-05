import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export interface DashboardWidget {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  order: number;
}

interface DashboardSettingsContextType {
  widgets: DashboardWidget[];
  toggleWidget: (widgetId: string) => void;
  reorderWidgets: (widgetIds: string[]) => void;
  isWidgetEnabled: (widgetId: string) => boolean;
  resetToDefaults: () => void;
}

const DashboardSettingsContext = createContext<DashboardSettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'sop_app_dashboard_settings';

// Default widget configuration
const defaultWidgets: DashboardWidget[] = [
  { id: 'stats', name: 'Task Stats', description: 'Overview of pending, in-progress, and completed tasks', enabled: true, order: 0 },
  { id: 'departments', name: 'Departments', description: 'Quick access to department SOPs', enabled: true, order: 1 },
  { id: 'recentSops', name: 'Recent SOPs', description: 'Recently created or updated SOPs', enabled: true, order: 2 },
  { id: 'schedule', name: '7-Day Schedule', description: 'Upcoming work schedule snapshot', enabled: true, order: 3 },
  { id: 'calendar', name: 'Calendar', description: 'Monthly calendar view with tasks and events', enabled: true, order: 4 },
  { id: 'todayTasks', name: "Today's Tasks", description: 'Tasks due today', enabled: true, order: 5 },
  { id: 'upcomingTasks', name: 'Upcoming Tasks', description: 'Tasks coming up this week', enabled: true, order: 6 },
  { id: 'overdueTasks', name: 'Overdue Tasks', description: 'Tasks past their due date', enabled: true, order: 7 },
];

export const DashboardSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Merge with defaults to handle new widgets
          const mergedWidgets = defaultWidgets.map(defaultWidget => {
            const storedWidget = parsed.find((w: DashboardWidget) => w.id === defaultWidget.id);
            return storedWidget ? { ...defaultWidget, ...storedWidget } : defaultWidget;
          });
          return mergedWidgets.sort((a, b) => a.order - b.order);
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
