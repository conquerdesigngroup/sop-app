import React, { useState, useEffect, ReactElement } from 'react';
import { useActivityLog, ActivityLog, EntityType, ActionType } from '../contexts/ActivityLogContext';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';

const ActivityLogPage: React.FC = () => {
  const { logs, loading, totalCount, fetchLogs, fetchMoreLogs, clearFilters } = useActivityLog();
  const { users } = useAuth();
  const { isMobile, isMobileOrTablet } = useResponsive();

  // Filters
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedEntityType, setSelectedEntityType] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Load logs on mount
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Apply filters
  const handleApplyFilters = () => {
    fetchLogs({
      userId: selectedUser !== 'all' ? selectedUser : undefined,
      entityType: selectedEntityType !== 'all' ? selectedEntityType as EntityType : undefined,
      action: selectedAction !== 'all' ? selectedAction : undefined,
      searchQuery: searchQuery || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };

  const handleClearFilters = () => {
    setSelectedUser('all');
    setSelectedEntityType('all');
    setSelectedAction('all');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    clearFilters();
  };

  // Get action display info
  const getActionInfo = (action: ActionType): { label: string; color: string; icon: ReactElement } => {
    const actionMap: Record<string, { label: string; color: string; icon: ReactElement }> = {
      // SOP actions
      sop_created: {
        label: 'Created SOP',
        color: theme.colors.status.success,
        icon: <PlusIcon />,
      },
      sop_updated: {
        label: 'Updated SOP',
        color: theme.colors.status.info,
        icon: <EditIcon />,
      },
      sop_deleted: {
        label: 'Deleted SOP',
        color: theme.colors.status.error,
        icon: <TrashIcon />,
      },
      sop_published: {
        label: 'Published SOP',
        color: theme.colors.status.success,
        icon: <PublishIcon />,
      },
      sop_archived: {
        label: 'Archived SOP',
        color: theme.colors.status.warning,
        icon: <ArchiveIcon />,
      },
      sop_restored: {
        label: 'Restored SOP',
        color: theme.colors.status.info,
        icon: <RestoreIcon />,
      },
      sop_imported: {
        label: 'Imported SOPs',
        color: theme.colors.status.success,
        icon: <ImportIcon />,
      },
      // Task actions
      task_created: {
        label: 'Created Task',
        color: theme.colors.status.success,
        icon: <PlusIcon />,
      },
      task_updated: {
        label: 'Updated Task',
        color: theme.colors.status.info,
        icon: <EditIcon />,
      },
      task_deleted: {
        label: 'Deleted Task',
        color: theme.colors.status.error,
        icon: <TrashIcon />,
      },
      task_assigned: {
        label: 'Assigned Task',
        color: theme.colors.status.info,
        icon: <AssignIcon />,
      },
      task_completed: {
        label: 'Completed Task',
        color: theme.colors.status.success,
        icon: <CheckIcon />,
      },
      task_started: {
        label: 'Started Task',
        color: theme.colors.status.info,
        icon: <PlayIcon />,
      },
      task_archived: {
        label: 'Archived Task',
        color: theme.colors.status.warning,
        icon: <ArchiveIcon />,
      },
      task_restored: {
        label: 'Restored Task',
        color: theme.colors.status.info,
        icon: <RestoreIcon />,
      },
      task_step_completed: {
        label: 'Completed Step',
        color: theme.colors.status.success,
        icon: <CheckIcon />,
      },
      // Job actions
      job_created: {
        label: 'Created Job',
        color: theme.colors.status.success,
        icon: <PlusIcon />,
      },
      job_updated: {
        label: 'Updated Job',
        color: theme.colors.status.info,
        icon: <EditIcon />,
      },
      job_deleted: {
        label: 'Deleted Job',
        color: theme.colors.status.error,
        icon: <TrashIcon />,
      },
      job_completed: {
        label: 'Completed Job',
        color: theme.colors.status.success,
        icon: <CheckIcon />,
      },
      job_archived: {
        label: 'Archived Job',
        color: theme.colors.status.warning,
        icon: <ArchiveIcon />,
      },
      job_restored: {
        label: 'Restored Job',
        color: theme.colors.status.info,
        icon: <RestoreIcon />,
      },
      // Template actions
      template_created: {
        label: 'Created Template',
        color: theme.colors.status.success,
        icon: <PlusIcon />,
      },
      template_updated: {
        label: 'Updated Template',
        color: theme.colors.status.info,
        icon: <EditIcon />,
      },
      template_deleted: {
        label: 'Deleted Template',
        color: theme.colors.status.error,
        icon: <TrashIcon />,
      },
      // User actions
      user_login: {
        label: 'Logged In',
        color: theme.colors.status.success,
        icon: <LoginIcon />,
      },
      user_logout: {
        label: 'Logged Out',
        color: theme.colors.textMuted,
        icon: <LogoutIcon />,
      },
      user_created: {
        label: 'Created User',
        color: theme.colors.status.success,
        icon: <UserPlusIcon />,
      },
      user_updated: {
        label: 'Updated User',
        color: theme.colors.status.info,
        icon: <EditIcon />,
      },
      user_deleted: {
        label: 'Deleted User',
        color: theme.colors.status.error,
        icon: <TrashIcon />,
      },
      user_role_changed: {
        label: 'Changed Role',
        color: theme.colors.status.warning,
        icon: <RoleIcon />,
      },
      user_password_changed: {
        label: 'Changed Password',
        color: theme.colors.status.info,
        icon: <KeyIcon />,
      },
    };

    return actionMap[action] || {
      label: action.replace(/_/g, ' '),
      color: theme.colors.textMuted,
      icon: <DefaultIcon />,
    };
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatFullTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getEntityTypeLabel = (type: EntityType) => {
    const labels: Record<EntityType, string> = {
      sop: 'SOP',
      task: 'Task',
      job: 'Job',
      template: 'Template',
      user: 'User',
      system: 'System',
    };
    return labels[type] || type;
  };

  // Action categories for filter
  const actionCategories = [
    { value: 'all', label: 'All Actions' },
    { value: 'created', label: 'Created' },
    { value: 'updated', label: 'Updated' },
    { value: 'deleted', label: 'Deleted' },
    { value: 'archived', label: 'Archived' },
    { value: 'restored', label: 'Restored' },
    { value: 'completed', label: 'Completed' },
    { value: 'login', label: 'Login' },
    { value: 'logout', label: 'Logout' },
  ];

  return (
    <div style={{
      ...styles.container,
      padding: isMobileOrTablet ? '16px' : '32px 40px',
    }}>
      <div style={styles.content}>
        {/* Header */}
        <div style={{
          ...styles.header,
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? '16px' : '0',
        }}>
          <div>
            <h1 style={{
              ...styles.title,
              fontSize: isMobile ? '24px' : '28px',
            }}>
              <svg
                width={isMobile ? '24' : '28'}
                height={isMobile ? '24' : '28'}
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.colors.primary}
                strokeWidth="2"
                style={{ marginRight: '12px' }}
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
                <path d="M10 9H8" />
              </svg>
              Activity Log
            </h1>
            <p style={styles.subtitle}>
              Track all user actions and changes across the system
            </p>
          </div>
          <div style={styles.stats}>
            <div style={styles.statItem}>
              <span style={styles.statNumber}>{totalCount}</span>
              <span style={styles.statLabel}>Total Events</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{
          ...styles.filtersCard,
          flexDirection: isMobile ? 'column' : 'row',
        }}>
          <div style={{
            ...styles.filtersRow,
            flexDirection: isMobile ? 'column' : 'row',
          }}>
            {/* Search */}
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Search</label>
              <div style={styles.searchInputWrapper}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="2" style={styles.searchIcon}>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={styles.searchInput}
                />
              </div>
            </div>

            {/* User Filter */}
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>User</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                style={styles.select}
              >
                <option value="all">All Users</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName}
                  </option>
                ))}
              </select>
            </div>

            {/* Entity Type Filter */}
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Type</label>
              <select
                value={selectedEntityType}
                onChange={(e) => setSelectedEntityType(e.target.value)}
                style={styles.select}
              >
                <option value="all">All Types</option>
                <option value="sop">SOPs</option>
                <option value="task">Tasks</option>
                <option value="job">Jobs</option>
                <option value="template">Templates</option>
                <option value="user">Users</option>
              </select>
            </div>

            {/* Action Filter */}
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Action</label>
              <select
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value)}
                style={styles.select}
              >
                {actionCategories.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{
            ...styles.filtersRow,
            flexDirection: isMobile ? 'column' : 'row',
          }}>
            {/* Date Range */}
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={styles.dateInput}
              />
            </div>

            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={styles.dateInput}
              />
            </div>

            {/* Filter Buttons */}
            <div style={{
              ...styles.filterButtons,
              marginLeft: isMobile ? '0' : 'auto',
              width: isMobile ? '100%' : 'auto',
            }}>
              <button onClick={handleClearFilters} style={styles.clearButton}>
                Clear
              </button>
              <button onClick={handleApplyFilters} style={styles.applyButton}>
                Apply Filters
              </button>
            </div>
          </div>
        </div>

        {/* Log List */}
        <div style={styles.logList}>
          {loading && logs.length === 0 ? (
            <div style={styles.loadingState}>
              <div style={styles.spinner} />
              <p>Loading activity logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div style={styles.emptyState}>
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.colors.textMuted}
                strokeWidth="1.5"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
              </svg>
              <h3 style={styles.emptyTitle}>No activity logs found</h3>
              <p style={styles.emptyText}>
                Activity will appear here as users interact with the system
              </p>
            </div>
          ) : (
            <>
              {logs.map((log, index) => {
                const actionInfo = getActionInfo(log.action);
                return (
                  <div
                    key={log.id}
                    style={{
                      ...styles.logItem,
                      borderBottom: index === logs.length - 1 ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
                    }}
                  >
                    <div style={{
                      ...styles.logIcon,
                      backgroundColor: `${actionInfo.color}20`,
                      color: actionInfo.color,
                    }}>
                      {actionInfo.icon}
                    </div>

                    <div style={styles.logContent}>
                      <div style={styles.logMain}>
                        <span style={styles.logUser}>{log.user_name}</span>
                        <span style={{
                          ...styles.logAction,
                          color: actionInfo.color,
                        }}>
                          {actionInfo.label}
                        </span>
                        {log.entity_title && (
                          <>
                            <span style={styles.logSeparator}>-</span>
                            <span style={styles.logEntity}>{log.entity_title}</span>
                          </>
                        )}
                      </div>

                      <div style={styles.logMeta}>
                        <span style={styles.logType}>
                          {getEntityTypeLabel(log.entity_type as EntityType)}
                        </span>
                        <span style={styles.logTimestamp} title={formatFullTimestamp(log.created_at)}>
                          {formatTimestamp(log.created_at)}
                        </span>
                      </div>

                      {log.details && Object.keys(log.details).length > 0 && (
                        <div style={styles.logDetails}>
                          {Object.entries(log.details).map(([key, value]) => (
                            <span key={key} style={styles.logDetail}>
                              <strong>{key}:</strong> {String(value)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={styles.logTime}>
                      {formatTimestamp(log.created_at)}
                    </div>
                  </div>
                );
              })}

              {logs.length < totalCount && (
                <div style={styles.loadMore}>
                  <button
                    onClick={fetchMoreLogs}
                    disabled={loading}
                    style={styles.loadMoreButton}
                  >
                    {loading ? 'Loading...' : `Load More (${totalCount - logs.length} remaining)`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// Icon Components
const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const ArchiveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 8v13H3V8" />
    <path d="M1 3h22v5H1z" />
    <path d="M10 12h4" />
  </svg>
);

const RestoreIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
  </svg>
);

const PublishIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2l9 4.5v6a9 9 0 0 1-18 0v-6L12 2z" />
    <path d="M12 22v-10" />
    <path d="M12 12l-3-3" />
    <path d="M12 12l3-3" />
  </svg>
);

const ImportIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const AssignIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <line x1="20" y1="8" x2="20" y2="14" />
    <line x1="23" y1="11" x2="17" y2="11" />
  </svg>
);

const LoginIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const UserPlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <line x1="20" y1="8" x2="20" y2="14" />
    <line x1="23" y1="11" x2="17" y2="11" />
  </svg>
);

const RoleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const KeyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

const DefaultIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: theme.colors.background,
  },
  content: {
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
  },
  title: {
    color: theme.colors.txt.primary,
    fontWeight: 700,
    margin: 0,
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: '15px',
    margin: 0,
  },
  stats: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 20px',
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  statNumber: {
    fontSize: '24px',
    fontWeight: 700,
    color: theme.colors.primary,
  },
  statLabel: {
    fontSize: '12px',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  filtersCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '20px',
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.bdr.primary}`,
    marginBottom: '24px',
  },
  filtersRow: {
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1,
    minWidth: '150px',
  },
  filterLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  searchInputWrapper: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px 10px 36px',
    fontSize: '14px',
    color: theme.colors.txt.primary,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    padding: '10px 12px',
    fontSize: '14px',
    color: theme.colors.txt.primary,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    outline: 'none',
    cursor: 'pointer',
  },
  dateInput: {
    padding: '10px 12px',
    fontSize: '14px',
    color: theme.colors.txt.primary,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    outline: 'none',
  },
  filterButtons: {
    display: 'flex',
    gap: '8px',
  },
  clearButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
  },
  applyButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    backgroundColor: theme.colors.primary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
  },
  logList: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.bdr.primary}`,
    overflow: 'hidden',
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    color: theme.colors.textMuted,
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: `3px solid ${theme.colors.bdr.primary}`,
    borderTopColor: theme.colors.primary,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginBottom: '16px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    textAlign: 'center',
  },
  emptyTitle: {
    color: theme.colors.txt.primary,
    fontSize: '18px',
    fontWeight: 600,
    margin: '24px 0 8px 0',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: '14px',
    margin: 0,
    maxWidth: '300px',
  },
  logItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    padding: '16px 20px',
    transition: 'background-color 0.2s',
  },
  logIcon: {
    width: '36px',
    height: '36px',
    borderRadius: theme.borderRadius.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logContent: {
    flex: 1,
    minWidth: 0,
  },
  logMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '4px',
  },
  logUser: {
    fontWeight: 600,
    color: theme.colors.txt.primary,
    fontSize: '14px',
  },
  logAction: {
    fontSize: '14px',
    fontWeight: 500,
  },
  logSeparator: {
    color: theme.colors.textMuted,
  },
  logEntity: {
    color: theme.colors.txt.secondary,
    fontSize: '14px',
  },
  logMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '12px',
    color: theme.colors.textMuted,
  },
  logType: {
    padding: '2px 8px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.sm,
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  logTimestamp: {
    cursor: 'help',
  },
  logDetails: {
    marginTop: '8px',
    padding: '8px 12px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.sm,
    fontSize: '12px',
    color: theme.colors.textSecondary,
  },
  logDetail: {
    display: 'block',
  },
  logTime: {
    fontSize: '12px',
    color: theme.colors.textMuted,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  loadMore: {
    padding: '16px 20px',
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
    textAlign: 'center',
  },
  loadMoreButton: {
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
  },
};

export default ActivityLogPage;
