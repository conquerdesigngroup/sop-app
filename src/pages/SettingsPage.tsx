import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSOPs } from '../contexts/SOPContext';
import { useToast } from '../contexts/ToastContext';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { FormButton } from '../components/FormComponents';
import GoogleCalendarConnect from '../components/GoogleCalendarConnect';
import DataIntegrityPanel from '../components/DataIntegrityPanel';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!checked)}
    style={{
      ...toggleStyles.switch,
      backgroundColor: checked ? theme.colors.primary : theme.colors.bg.tertiary,
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? 'not-allowed' : 'pointer',
    }}
    disabled={disabled}
  >
    <span
      style={{
        ...toggleStyles.knob,
        left: checked ? '27px' : '3px',
      }}
    />
  </button>
);

const toggleStyles: { [key: string]: React.CSSProperties } = {
  switch: {
    width: '52px',
    height: '28px',
    borderRadius: '14px',
    border: 'none',
    position: 'relative',
    transition: 'background-color 0.2s ease',
    flexShrink: 0,
    padding: 0,
  },
  knob: {
    position: 'absolute',
    top: '50%',
    marginTop: '-11px',
    width: '22px',
    height: '22px',
    borderRadius: '11px',
    backgroundColor: '#FFFFFF',
    transition: 'transform 0.2s ease, left 0.2s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
};

const SettingsPage: React.FC = () => {
  const { currentUser, updateUser, isAdmin } = useAuth();
  const { sops } = useSOPs();
  const { showToast } = useToast();
  const { isMobileOrTablet } = useResponsive();

  const [loading, setLoading] = useState(false);
  const [exportingJSON, setExportingJSON] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);

  // Notification settings from user preferences
  const [pushEnabled, setPushEnabled] = useState(
    currentUser?.notificationPreferences?.pushEnabled ?? true
  );
  const [emailEnabled, setEmailEnabled] = useState(
    currentUser?.notificationPreferences?.emailEnabled ?? true
  );
  const [taskReminders, setTaskReminders] = useState(
    currentUser?.notificationPreferences?.taskReminders ?? true
  );
  const [overdueAlerts, setOverdueAlerts] = useState(
    currentUser?.notificationPreferences?.overdueAlerts ?? true
  );
  const [calendarSync, setCalendarSync] = useState(
    currentUser?.notificationPreferences?.calendarSyncEnabled ?? false
  );

  // App settings
  const [compactMode, setCompactMode] = useState(false);
  const [cacheClearing, setCacheClearing] = useState(false);

  const handleClearCache = async () => {
    setCacheClearing(true);
    try {
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      // Unregister service worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
      }

      showToast('Cache cleared! Reloading app...', 'success');

      // Reload after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error clearing cache:', error);
      showToast('Failed to clear cache', 'error');
      setCacheClearing(false);
    }
  };

  const handleExportJSON = () => {
    setExportingJSON(true);
    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        exportedBy: currentUser?.email || 'Unknown',
        version: '1.0.2',
        totalSOPs: sops.length,
        sops: sops.map(sop => ({
          ...sop,
        })),
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `didc-sops-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`Successfully exported ${sops.length} SOPs as JSON`, 'success');
    } catch (error) {
      console.error('Error exporting SOPs:', error);
      showToast('Failed to export SOPs', 'error');
    } finally {
      setExportingJSON(false);
    }
  };

  const handleExportCSV = () => {
    setExportingCSV(true);
    try {
      // CSV headers
      const headers = [
        'ID',
        'Title',
        'Description',
        'Department',
        'Category',
        'Status',
        'Is Template',
        'Tags',
        'Step Count',
        'Steps (Title | Description)',
        'Created At',
        'Created By',
        'Updated At'
      ];

      // Escape CSV field (handle commas, quotes, newlines)
      const escapeCSV = (field: any): string => {
        if (field === null || field === undefined) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Build CSV rows
      const rows = sops.map(sop => {
        const stepsFormatted = sop.steps
          .map(step => `${step.title} | ${step.description.replace(/\n/g, ' ')}`)
          .join('; ');

        return [
          sop.id,
          sop.title,
          sop.description,
          sop.department,
          sop.category,
          sop.status,
          sop.isTemplate ? 'Yes' : 'No',
          (sop.tags || []).join(', '),
          sop.steps.length,
          stepsFormatted,
          sop.createdAt,
          sop.createdBy,
          sop.updatedAt || ''
        ].map(escapeCSV).join(',');
      });

      // Combine headers and rows
      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `didc-sops-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`Successfully exported ${sops.length} SOPs as CSV`, 'success');
    } catch (error) {
      console.error('Error exporting SOPs to CSV:', error);
      showToast('Failed to export SOPs', 'error');
    } finally {
      setExportingCSV(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!currentUser) return;

    setLoading(true);
    try {
      await updateUser(currentUser.id, {
        notificationPreferences: {
          pushEnabled,
          emailEnabled,
          taskReminders,
          overdueAlerts,
          calendarSyncEnabled: calendarSync,
        },
      });
      showToast('Notification settings saved', 'success');
    } catch (error) {
      showToast('Failed to save settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="page-enter" style={styles.container}>
      <div style={{
        ...styles.content,
        padding: isMobileOrTablet ? '20px 16px' : '40px',
        maxWidth: isMobileOrTablet ? '100%' : '800px',
      }}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Settings</h1>
          <p style={styles.subtitle}>Customize your experience</p>
        </div>

        {/* Notifications Card */}
        <div className="card-hover-subtle" style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              Notifications
            </h3>
          </div>

          <div style={styles.settingsList}>
            <div style={styles.settingItem}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>Push Notifications</span>
                <span style={styles.settingDescription}>
                  Receive notifications in your browser
                </span>
              </div>
              <ToggleSwitch checked={pushEnabled} onChange={setPushEnabled} />
            </div>

            <div style={styles.divider} />

            <div style={styles.settingItem}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>Email Notifications</span>
                <span style={styles.settingDescription}>
                  Receive updates via email
                </span>
              </div>
              <ToggleSwitch checked={emailEnabled} onChange={setEmailEnabled} />
            </div>

            <div style={styles.divider} />

            <div style={styles.settingItem}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>Task Reminders</span>
                <span style={styles.settingDescription}>
                  Get reminded about upcoming tasks
                </span>
              </div>
              <ToggleSwitch checked={taskReminders} onChange={setTaskReminders} />
            </div>

            <div style={styles.divider} />

            <div style={styles.settingItem}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>Overdue Alerts</span>
                <span style={styles.settingDescription}>
                  Be notified when tasks are overdue
                </span>
              </div>
              <ToggleSwitch checked={overdueAlerts} onChange={setOverdueAlerts} />
            </div>
          </div>

          <div style={styles.cardFooter}>
            <FormButton
              variant="primary"
              onClick={handleSaveNotifications}
              loading={loading}
            >
              Save Notification Settings
            </FormButton>
          </div>
        </div>

        {/* Integrations Card */}
        <div className="card-hover-subtle" style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Integrations
            </h3>
          </div>

          <div style={styles.integrationSection}>
            <GoogleCalendarConnect />
          </div>

          <div style={styles.divider} />

          <div style={styles.settingsList}>
            <div style={styles.settingItem}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>Auto-sync Tasks to Calendar</span>
                <span style={styles.settingDescription}>
                  Automatically sync new tasks to your connected calendar
                </span>
              </div>
              <ToggleSwitch checked={calendarSync} onChange={setCalendarSync} />
            </div>
          </div>

          {calendarSync && (
            <div style={styles.integrationNote}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.info} strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>When enabled, new tasks will automatically be added to your connected Google Calendar.</span>
            </div>
          )}
        </div>

        {/* Appearance Card */}
        <div className="card-hover-subtle" style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              Appearance
            </h3>
          </div>

          <div style={styles.settingsList}>
            <div style={styles.settingItem}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>Dark Mode</span>
                <span style={styles.settingDescription}>
                  Use dark theme (currently active)
                </span>
              </div>
              <ToggleSwitch checked={true} onChange={() => {}} disabled />
            </div>

            <div style={styles.divider} />

            <div style={styles.settingItem}>
              <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>Compact Mode</span>
                <span style={styles.settingDescription}>
                  Show more content with less spacing
                </span>
              </div>
              <ToggleSwitch checked={compactMode} onChange={setCompactMode} />
            </div>
          </div>
        </div>

        {/* Session Card */}
        <div className="card-hover-subtle" style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Session & Security
            </h3>
          </div>

          <div style={styles.sessionInfo}>
            <div style={styles.sessionItem}>
              <span style={styles.sessionLabel}>Session Timeout</span>
              <span style={styles.sessionValue}>30 minutes of inactivity</span>
            </div>
            <div style={styles.sessionItem}>
              <span style={styles.sessionLabel}>Last Login</span>
              <span style={styles.sessionValue}>Current session</span>
            </div>
          </div>

          <div style={styles.securityNote}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>Your session will automatically end after 30 minutes of inactivity for security.</span>
          </div>
        </div>

        {/* Cache Management Card */}
        <div className="card-hover-subtle" style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
              Cache & Data
            </h3>
          </div>

          <div style={styles.aboutInfo}>
            <div style={styles.aboutItem}>
              <span style={styles.aboutLabel}>Cache Version</span>
              <span style={styles.aboutValue}>1.0.2</span>
            </div>
            <div style={styles.aboutItem}>
              <span style={styles.aboutLabel}>Service Worker</span>
              <span style={styles.aboutValue}>
                {('serviceWorker' in navigator) ? 'Active' : 'Not Available'}
              </span>
            </div>
          </div>

          <div style={styles.securityNote}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.warning} strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>If you see old data or logos, clear the cache to force a refresh.</span>
          </div>

          <div style={styles.cardFooter}>
            <FormButton
              variant="danger"
              onClick={handleClearCache}
              loading={cacheClearing}
            >
              Clear All Cache & Reload
            </FormButton>
          </div>
        </div>

        {/* About Card */}
        <div className="card-hover-subtle" style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              About
            </h3>
          </div>

          <div style={styles.aboutInfo}>
            <div style={styles.aboutItem}>
              <span style={styles.aboutLabel}>App Version</span>
              <span style={styles.aboutValue}>1.0.2</span>
            </div>
            <div style={styles.aboutItem}>
              <span style={styles.aboutLabel}>Build Date</span>
              <span style={styles.aboutValue}>{new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Admin Tools - Data Integrity Agent (Admin Only) */}
        {isAdmin && (
          <div style={styles.adminSection}>
            <div style={styles.adminSectionHeader}>
              <h2 style={styles.adminSectionTitle}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.colors.primary} strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Admin Tools
              </h2>
              <span style={styles.adminBadge}>Admin Only</span>
            </div>

            {/* Data Export Card */}
            <div className="card-hover-subtle" style={styles.card}>
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Data Export
                </h3>
              </div>

              <div style={styles.aboutInfo}>
                <div style={styles.aboutItem}>
                  <span style={styles.aboutLabel}>Total SOPs</span>
                  <span style={styles.aboutValue}>{sops.length}</span>
                </div>
              </div>

              <div style={{ ...styles.securityNote, marginTop: '16px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.info} strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>Export all SOPs as a backup file. CSV is great for spreadsheets, JSON for full data backup.</span>
              </div>

              <div style={{ ...styles.cardFooter, gap: '12px' }}>
                <FormButton
                  variant="secondary"
                  onClick={handleExportCSV}
                  loading={exportingCSV}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  Export CSV
                </FormButton>
                <FormButton
                  variant="primary"
                  onClick={handleExportJSON}
                  loading={exportingJSON}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export JSON
                </FormButton>
              </div>
            </div>

            <DataIntegrityPanel />
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: 'calc(100vh - 80px)',
    backgroundColor: theme.colors.background,
  },
  content: {
    margin: '0 auto',
  },
  header: {
    marginBottom: theme.pageLayout.headerMargin.desktop,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    ...theme.typography.subtitle,
    color: theme.colors.txt.secondary,
  },
  card: {
    ...theme.components.card.base,
    marginBottom: theme.pageLayout.sectionMargin.desktop,
  },
  cardHeader: {
    marginBottom: theme.pageLayout.filterGap.desktop,
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  cardFooter: {
    marginTop: '24px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  settingsList: {
    display: 'flex',
    flexDirection: 'column',
  },
  settingItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
  },
  settingInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  settingLabel: {
    fontSize: '15px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
  },
  settingDescription: {
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
  },
  divider: {
    height: '1px',
    backgroundColor: theme.colors.bdr.primary,
  },
  integrationSection: {
    marginBottom: '16px',
  },
  integrationNote: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '16px',
    padding: '12px 16px',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: theme.borderRadius.md,
    fontSize: '13px',
    color: theme.colors.status.info,
  },
  sessionInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
  },
  sessionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionLabel: {
    fontSize: '14px',
    color: theme.colors.txt.tertiary,
  },
  sessionValue: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
  },
  securityNote: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
  },
  aboutInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  aboutItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aboutLabel: {
    fontSize: '14px',
    color: theme.colors.txt.tertiary,
  },
  aboutValue: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
  },
  adminSection: {
    marginTop: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    borderTop: `2px solid ${theme.colors.primary}`,
  },
  adminSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  adminSectionTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  adminBadge: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    backgroundColor: `${theme.colors.primary}20`,
    color: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    textTransform: 'uppercase' as const,
  },
};

export default SettingsPage;
