import React, { useState } from 'react';
import { useSOPs } from '../contexts/SOPContext';
import { useTask } from '../contexts/TaskContext';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { SOP, JobTask } from '../types';

type TabType = 'sops' | 'tasks';

const ArchivePage: React.FC = () => {
  const { sops, updateSOPStatus } = useSOPs();
  const { jobTasks, restoreJobTask } = useTask();
  const { isMobile, isTablet, isMobileOrTablet } = useResponsive();
  const [activeTab, setActiveTab] = useState<TabType>('sops');
  const [restoring, setRestoring] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Get archived items
  const archivedSOPs = sops.filter(sop => sop.status === 'archived');
  const archivedTasks = jobTasks.filter(task => task.status === 'archived');

  // Filter by search
  const filteredSOPs = archivedSOPs.filter(sop =>
    sop.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sop.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sop.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTasks = archivedTasks.filter(task =>
    task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    task.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRestoreSOP = async (sop: SOP) => {
    setRestoring(sop.id);
    try {
      await updateSOPStatus(sop.id, 'draft');
    } catch (error) {
      console.error('Error restoring SOP:', error);
    }
    setRestoring(null);
  };

  const handleRestoreTask = async (task: JobTask) => {
    setRestoring(task.id);
    try {
      await restoreJobTask(task.id);
    } catch (error) {
      console.error('Error restoring task:', error);
    }
    setRestoring(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getActiveItems = () => {
    return activeTab === 'sops' ? filteredSOPs : filteredTasks;
  };

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
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: isMobile ? '16px' : '0',
        }}>
          <div>
            <h1 style={{
              ...styles.title,
              fontSize: isMobile ? '24px' : '28px',
            }}>Archive</h1>
            <p style={styles.subtitle}>
              View and restore archived SOPs and Tasks
            </p>
          </div>
          <div style={styles.stats}>
            <div style={styles.statItem}>
              <span style={styles.statNumber}>{archivedSOPs.length}</span>
              <span style={styles.statLabel}>SOPs</span>
            </div>
            <div style={styles.statDivider} />
            <div style={styles.statItem}>
              <span style={styles.statNumber}>{archivedTasks.length}</span>
              <span style={styles.statLabel}>Tasks</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          ...styles.tabsContainer,
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? '12px' : '0',
        }}>
          <div style={styles.tabs}>
            <button
              style={{
                ...styles.tab,
                ...(activeTab === 'sops' ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab('sops')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              SOPs ({archivedSOPs.length})
            </button>
            <button
              style={{
                ...styles.tab,
                ...(activeTab === 'tasks' ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab('tasks')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              Tasks ({archivedTasks.length})
            </button>
          </div>

          {/* Search */}
          <div style={{
            ...styles.searchContainer,
            width: isMobile ? '100%' : '300px',
          }}>
            <svg
              style={styles.searchIcon}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={`Search archived ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>
        </div>

        {/* Content */}
        <div style={styles.listContainer}>
          {getActiveItems().length === 0 ? (
            <div style={styles.emptyState}>
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.colors.textMuted}
                strokeWidth="1.5"
              >
                <path d="M21 8v13H3V8" />
                <path d="M1 3h22v5H1z" />
                <path d="M10 12h4" />
              </svg>
              <h3 style={styles.emptyTitle}>
                {searchQuery ? 'No results found' : `No archived ${activeTab}`}
              </h3>
              <p style={styles.emptyText}>
                {searchQuery
                  ? 'Try adjusting your search terms'
                  : `When you archive ${activeTab === 'sops' ? 'SOPs' : 'Tasks'}, they will appear here`}
              </p>
            </div>
          ) : (
            <div style={{
              ...styles.grid,
              gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
            }}>
              {activeTab === 'sops'
                ? filteredSOPs.map((sop) => (
                    <div key={sop.id} style={styles.card}>
                      <div style={styles.cardHeader}>
                        <div style={styles.cardIcon}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <span style={styles.cardCategory}>{sop.category}</span>
                      </div>
                      <h3 style={styles.cardTitle}>{sop.title}</h3>
                      <p style={styles.cardDescription}>{sop.description}</p>
                      <div style={styles.cardMeta}>
                        <span style={styles.cardDepartment}>{sop.department}</span>
                        <span style={styles.cardDate}>Archived {formatDate(sop.updatedAt || sop.createdAt)}</span>
                      </div>
                      <div style={styles.cardSteps}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="8" y1="6" x2="21" y2="6" />
                          <line x1="8" y1="12" x2="21" y2="12" />
                          <line x1="8" y1="18" x2="21" y2="18" />
                          <line x1="3" y1="6" x2="3.01" y2="6" />
                          <line x1="3" y1="12" x2="3.01" y2="12" />
                          <line x1="3" y1="18" x2="3.01" y2="18" />
                        </svg>
                        {sop.steps.length} steps
                      </div>
                      <button
                        style={{
                          ...styles.restoreButton,
                          opacity: restoring === sop.id ? 0.7 : 1,
                        }}
                        onClick={() => handleRestoreSOP(sop)}
                        disabled={restoring === sop.id}
                      >
                        {restoring === sop.id ? (
                          <span style={styles.spinner} />
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                            <path d="M21 3v5h-5" />
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                            <path d="M8 16H3v5" />
                          </svg>
                        )}
                        {restoring === sop.id ? 'Restoring...' : 'Restore'}
                      </button>
                    </div>
                  ))
                : filteredTasks.map((task) => (
                    <div key={task.id} style={styles.card}>
                      <div style={styles.cardHeader}>
                        <div style={styles.cardIcon}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 11l3 3L22 4" />
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                          </svg>
                        </div>
                        <span style={styles.priorityBadge} data-priority={task.priority}>
                          {task.priority}
                        </span>
                      </div>
                      <h3 style={styles.cardTitle}>{task.title}</h3>
                      <p style={styles.cardDescription}>{task.description}</p>
                      <div style={styles.cardMeta}>
                        <span style={styles.cardDepartment}>{task.department}</span>
                        <span style={styles.cardDate}>
                          Scheduled: {formatDate(task.scheduledDate)}
                        </span>
                      </div>
                      <div style={styles.cardSteps}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="8" y1="6" x2="21" y2="6" />
                          <line x1="8" y1="12" x2="21" y2="12" />
                          <line x1="8" y1="18" x2="21" y2="18" />
                          <line x1="3" y1="6" x2="3.01" y2="6" />
                          <line x1="3" y1="12" x2="3.01" y2="12" />
                          <line x1="3" y1="18" x2="3.01" y2="18" />
                        </svg>
                        {task.steps.length} steps
                      </div>
                      <button
                        style={{
                          ...styles.restoreButton,
                          opacity: restoring === task.id ? 0.7 : 1,
                        }}
                        onClick={() => handleRestoreTask(task)}
                        disabled={restoring === task.id}
                      >
                        {restoring === task.id ? (
                          <span style={styles.spinner} />
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                            <path d="M21 3v5h-5" />
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                            <path d="M8 16H3v5" />
                          </svg>
                        )}
                        {restoring === task.id ? 'Restoring...' : 'Restore'}
                      </button>
                    </div>
                  ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        [data-priority="low"] {
          background-color: ${theme.colors.status.info}20;
          color: ${theme.colors.status.info};
        }
        [data-priority="medium"] {
          background-color: ${theme.colors.status.warning}20;
          color: ${theme.colors.status.warning};
        }
        [data-priority="high"] {
          background-color: ${theme.colors.status.error}20;
          color: ${theme.colors.status.error};
        }
        [data-priority="urgent"] {
          background-color: ${theme.colors.status.error}40;
          color: ${theme.colors.status.error};
        }
      `}</style>
    </div>
  );
};

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
    marginBottom: '24px',
  },
  title: {
    color: theme.colors.txt.primary,
    fontWeight: 700,
    margin: 0,
    marginBottom: '8px',
  },
  subtitle: {
    color: theme.colors.txt.secondary,
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
    fontSize: '20px',
    fontWeight: 700,
    color: theme.colors.txt.primary,
  },
  statLabel: {
    fontSize: '12px',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statDivider: {
    width: '1px',
    height: '32px',
    backgroundColor: theme.colors.bdr.primary,
  },
  tabsContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    padding: '4px',
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabActive: {
    backgroundColor: theme.colors.primary,
    color: theme.colors.txt.primary,
  },
  searchContainer: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: theme.colors.textMuted,
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px 10px 40px',
    fontSize: '14px',
    color: theme.colors.txt.primary,
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    outline: 'none',
    boxSizing: 'border-box',
  },
  listContainer: {
    minHeight: '300px',
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
  grid: {
    display: 'grid',
    gap: '16px',
  },
  card: {
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.lg,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    transition: 'all 0.2s',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardIcon: {
    width: '36px',
    height: '36px',
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.bg.tertiary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.txt.secondary,
  },
  cardCategory: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.primary,
    padding: '4px 10px',
    backgroundColor: `${theme.colors.primary}15`,
    borderRadius: theme.borderRadius.sm,
  },
  priorityBadge: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    padding: '4px 10px',
    borderRadius: theme.borderRadius.sm,
  },
  cardTitle: {
    color: theme.colors.txt.primary,
    fontSize: '16px',
    fontWeight: 600,
    margin: 0,
    lineHeight: 1.3,
  },
  cardDescription: {
    color: theme.colors.txt.secondary,
    fontSize: '13px',
    margin: 0,
    lineHeight: 1.5,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: theme.colors.textMuted,
  },
  cardDepartment: {
    padding: '3px 8px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.sm,
  },
  cardDate: {
    color: theme.colors.textMuted,
  },
  cardSteps: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: theme.colors.textMuted,
    paddingTop: '8px',
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  },
  restoreButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    backgroundColor: theme.colors.primary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: '4px',
  },
  spinner: {
    width: '14px',
    height: '14px',
    border: '2px solid transparent',
    borderTopColor: 'currentColor',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};

export default ArchivePage;
