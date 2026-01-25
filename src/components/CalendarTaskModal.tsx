import React, { useState, useEffect } from 'react';
import { theme } from '../theme';
import { JobTask, User } from '../types';
import { useTask } from '../contexts/TaskContext';
import { useToast } from '../contexts/ToastContext';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import {
  generateGoogleCalendarUrlForTask,
  generateICSForTask,
  downloadICS,
  openGoogleCalendar,
  copyCalendarLink,
} from '../utils/calendarExport';

interface CalendarTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: JobTask | null;
  users: User[];
}

const CalendarTaskModal: React.FC<CalendarTaskModalProps> = ({
  isOpen,
  onClose,
  task: initialTask,
  users,
}) => {
  const { updateJobTask } = useTask();
  const { showToast } = useToast();
  const { isConnected: isGoogleConnected, syncTaskToGoogle } = useGoogleCalendar();
  const [showCalendarMenu, setShowCalendarMenu] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Local state to track completed steps - this is the SOURCE OF TRUTH for the modal
  const [completedStepIds, setCompletedStepIds] = useState<string[]>([]);

  // Sync local state when modal opens with a new task
  useEffect(() => {
    if (initialTask) {
      setCompletedStepIds(initialTask.completedSteps || []);
    }
  }, [initialTask]);

  if (!isOpen || !initialTask) return null;

  // Use initialTask for static data, completedStepIds for dynamic progress
  const task = initialTask;

  // Calendar export handlers
  const handleAddToGoogleCalendar = () => {
    const url = generateGoogleCalendarUrlForTask(task);
    openGoogleCalendar(url);
    setShowCalendarMenu(false);
    showToast('Opening Google Calendar...', 'success');
  };

  const handleDownloadICS = () => {
    const icsContent = generateICSForTask(task);
    const filename = task.title.replace(/[^a-zA-Z0-9]/g, '_');
    downloadICS(icsContent, filename);
    setShowCalendarMenu(false);
    showToast('Calendar file downloaded', 'success');
  };

  const handleCopyCalendarLink = async () => {
    const url = generateGoogleCalendarUrlForTask(task);
    const success = await copyCalendarLink(url);
    setShowCalendarMenu(false);
    if (success) {
      showToast('Calendar link copied to clipboard', 'success');
    } else {
      showToast('Failed to copy link', 'error');
    }
  };

  const handleSyncToGoogleCalendar = async () => {
    if (!isGoogleConnected) {
      showToast('Please connect your Google Calendar in Settings first', 'info');
      setShowCalendarMenu(false);
      return;
    }

    setIsSyncing(true);
    try {
      const success = await syncTaskToGoogle(task);
      setShowCalendarMenu(false);
      if (success) {
        showToast('Task synced to Google Calendar!', 'success');
      } else {
        showToast('Failed to sync task', 'error');
      }
    } catch (error) {
      showToast('Error syncing to Google Calendar', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const assignedUsers = users.filter(u => task.assignedTo.includes(u.id));

  // Calculate progress directly from local state - NO MEMOIZATION
  // This recalculates on every render, which is exactly what we want
  const totalSteps = task.steps.length;
  const completedCount = completedStepIds.filter(id =>
    task.steps.some(step => step.id === id)
  ).length;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  // Handle step toggle - updates local state immediately, then persists
  const handleStepToggle = async (stepId: string) => {
    const isCurrentlyCompleted = completedStepIds.includes(stepId);

    // Calculate new completed steps
    let newCompletedSteps: string[];
    if (isCurrentlyCompleted) {
      newCompletedSteps = completedStepIds.filter(id => id !== stepId);
    } else {
      newCompletedSteps = [...completedStepIds, stepId];
    }

    // Update local state IMMEDIATELY - this triggers re-render with new progress
    setCompletedStepIds(newCompletedSteps);

    // Calculate values for database update
    const updatedSteps = task.steps.map(s =>
      s.id === stepId ? { ...s, isCompleted: !isCurrentlyCompleted } : s
    );
    const newProgressPercentage = totalSteps > 0 ? Math.round((newCompletedSteps.length / totalSteps) * 100) : 0;

    // Update status based on progress
    let newStatus: JobTask['status'];
    if (newCompletedSteps.length === 0) {
      newStatus = 'pending';
    } else if (newCompletedSteps.length === totalSteps) {
      newStatus = 'completed';
    } else {
      newStatus = 'in-progress';
    }

    // Persist to database (async, but UI already updated)
    await updateJobTask(task.id, {
      steps: updatedSteps,
      completedSteps: newCompletedSteps,
      status: newStatus,
      progressPercentage: newProgressPercentage,
      startedAt: task.startedAt || new Date().toISOString(),
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return theme.colors.status.completed;
      case 'in-progress': return theme.colors.status.inProgress;
      case 'overdue': return theme.colors.status.overdue;
      case 'pending': return theme.colors.status.pending;
      default: return theme.colors.textMuted;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return theme.colors.status.error;
      case 'high': return theme.colors.status.warning;
      case 'medium': return theme.colors.status.info;
      case 'low': return theme.colors.status.completed;
      default: return theme.colors.textMuted;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return 'No time set';
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerContent}>
            <h2 style={styles.title}>{task.title}</h2>
            <div style={styles.badges}>
              <span style={{ ...styles.badge, backgroundColor: getStatusColor(task.status) }}>
                {task.status.replace('-', ' ')}
              </span>
              <span style={{ ...styles.badge, backgroundColor: getPriorityColor(task.priority) }}>
                {task.priority}
              </span>
            </div>
          </div>
          <button style={styles.closeButton} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Description */}
          {task.description && (
            <div style={styles.section}>
              <p style={styles.description}>{task.description}</p>
            </div>
          )}

          {/* Date & Time */}
          <div style={styles.section}>
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span style={styles.infoText}>{formatDate(task.scheduledDate)}</span>
              </div>
              <div style={styles.infoItem}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span style={styles.infoText}>{formatTime(task.dueTime)}</span>
              </div>
              <div style={styles.infoItem}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                <span style={styles.infoText}>{task.department} - {task.category}</span>
              </div>
              <div style={styles.infoItem}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span style={styles.infoText}>{task.estimatedDuration} min estimated</span>
              </div>
            </div>
          </div>

          {/* Assigned Users */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Assigned To</h3>
            <div style={styles.assignedUsers}>
              {assignedUsers.map(user => (
                <div key={user.id} style={styles.userChip}>
                  <div style={styles.userAvatar}>
                    {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                  </div>
                  <span style={styles.userName}>{user.firstName} {user.lastName}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Progress */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Progress</h3>
            <div style={styles.progressContainer}>
              <div style={styles.progressInfo}>
                <span>{completedCount} / {totalSteps} steps completed</span>
                <span style={styles.progressPercent}>{progressPercent}%</span>
              </div>
              <div style={styles.progressBar}>
                <div
                  style={{
                    height: '100%',
                    backgroundColor: theme.colors.primary,
                    borderRadius: theme.borderRadius.full,
                    transition: 'width 0.3s ease',
                    width: `${progressPercent}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Steps */}
          {task.steps.length > 0 && (
            <div style={styles.section}>
              <div style={styles.stepsHeader}>
                <h3 style={{...styles.sectionTitle, marginBottom: 0}}>Steps</h3>
                {completedCount < totalSteps && (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      // Mark all steps as complete
                      const allIds = task.steps.map(s => s.id);
                      const updatedSteps = task.steps.map(s => ({ ...s, isCompleted: true }));

                      // Update local state immediately
                      setCompletedStepIds(allIds);

                      // Persist to database
                      await updateJobTask(task.id, {
                        steps: updatedSteps,
                        completedSteps: allIds,
                        status: 'completed',
                        progressPercentage: 100,
                      });
                    }}
                    style={styles.markAllButton}
                  >
                    Mark All Complete
                  </button>
                )}
              </div>
              <div style={styles.stepsList}>
                {task.steps.map((step, index) => {
                  const isChecked = completedStepIds.includes(step.id);
                  return (
                    <div
                      key={step.id}
                      style={{
                        ...styles.stepItem,
                        backgroundColor: isChecked ? 'rgba(16, 185, 129, 0.1)' : theme.colors.inputBackground,
                      }}
                      onClick={() => handleStepToggle(step.id)}
                    >
                      <div style={{
                        ...styles.stepCheckbox,
                        backgroundColor: isChecked ? theme.colors.status.completed : 'transparent',
                        borderColor: isChecked ? theme.colors.status.completed : theme.colors.textSecondary,
                      }}>
                        {isChecked && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <div style={styles.stepContent}>
                        <span style={{
                          ...styles.stepTitle,
                          textDecoration: isChecked ? 'line-through' : 'none',
                          opacity: isChecked ? 0.6 : 1,
                        }}>
                          {index + 1}. {step.title}
                        </span>
                        {step.description && (
                          <span style={styles.stepDescription}>{step.description}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer with Calendar Dropdown */}
        <div style={styles.footer}>
          <div style={styles.calendarDropdownContainer}>
            <button
              onClick={() => setShowCalendarMenu(!showCalendarMenu)}
              style={styles.calendarButton}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="12" y1="14" x2="12" y2="18" />
                <line x1="10" y1="16" x2="14" y2="16" />
              </svg>
              Add to Calendar
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '4px' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showCalendarMenu && (
              <div style={styles.calendarDropdown}>
                {isGoogleConnected && (
                  <button
                    onClick={handleSyncToGoogleCalendar}
                    style={styles.calendarMenuItem}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <div style={styles.syncSpinner} />
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.success} strokeWidth="2">
                        <polyline points="17 1 21 5 17 9" />
                        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                        <polyline points="7 23 3 19 7 15" />
                        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      </svg>
                    )}
                    {isSyncing ? 'Syncing...' : 'Sync to My Calendar'}
                  </button>
                )}
                <button onClick={handleAddToGoogleCalendar} style={styles.calendarMenuItem}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Open in Google Calendar
                </button>
                <button onClick={handleDownloadICS} style={styles.calendarMenuItem}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download .ics File
                </button>
                <button onClick={handleCopyCalendarLink} style={styles.calendarMenuItem}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy Link
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.borderRadius.lg,
    border: `2px solid ${theme.colors.border}`,
    width: '100%',
    maxWidth: '600px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '24px',
    borderBottom: `2px solid ${theme.colors.border}`,
  },
  headerContent: {
    flex: 1,
    paddingRight: '16px',
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
    marginBottom: '12px',
  },
  badges: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  badge: {
    ...theme.components.badge.base,
    color: '#FFFFFF',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.sm,
    transition: 'all 0.2s',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    ...theme.typography.subtitle,
    color: theme.colors.textPrimary,
    marginBottom: '12px',
    fontWeight: 600,
  },
  description: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    lineHeight: 1.6,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
  },
  infoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  infoText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },
  assignedUsers: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  userChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.full,
    border: `1px solid ${theme.colors.border}`,
  },
  userAvatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
  },
  userName: {
    ...theme.typography.bodySmall,
    color: theme.colors.textPrimary,
    fontWeight: 500,
  },
  progressContainer: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.md,
    padding: '16px',
    border: `1px solid ${theme.colors.border}`,
  },
  progressInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    fontSize: '14px',
    color: theme.colors.textSecondary,
  },
  progressPercent: {
    fontWeight: 700,
    color: theme.colors.primary,
  },
  progressBar: {
    height: '8px',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    transition: 'width 0.3s ease',
  },
  stepsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  markAllButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: theme.colors.status.error,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    color: '#FFFFFF',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  stepsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  stepCheckbox: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: '2px',
  },
  stepContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  stepTitle: {
    ...theme.typography.bodySmall,
    color: theme.colors.textPrimary,
    fontWeight: 500,
  },
  stepDescription: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
  footer: {
    padding: '20px 24px',
    borderTop: `2px solid ${theme.colors.border}`,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  calendarDropdownContainer: {
    position: 'relative',
  },
  calendarButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: theme.colors.primary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    color: '#FFFFFF',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  calendarDropdown: {
    position: 'absolute',
    bottom: '100%',
    right: 0,
    marginBottom: '8px',
    backgroundColor: theme.colors.backgroundLight,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.3)',
    minWidth: '200px',
    zIndex: 10,
    overflow: 'hidden',
  },
  calendarMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '12px 16px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.colors.textPrimary,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.2s',
  },
  syncSpinner: {
    width: '16px',
    height: '16px',
    border: `2px solid ${theme.colors.border}`,
    borderTopColor: theme.colors.status.success,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

export default CalendarTaskModal;
