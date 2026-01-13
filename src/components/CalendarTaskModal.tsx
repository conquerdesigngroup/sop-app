import React from 'react';
import { theme } from '../theme';
import { JobTask, User } from '../types';

interface CalendarTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: JobTask | null;
  users: User[];
}

// Generate ICS file content for calendar export
const generateICSContent = (task: JobTask, users: User[]): string => {
  const assignedUsers = users.filter(u => task.assignedTo.includes(u.id));
  const assigneeNames = assignedUsers.map(u => `${u.firstName} ${u.lastName}`).join(', ');

  // Parse the scheduled date and time
  const scheduledDate = new Date(task.scheduledDate);
  const [hours, minutes] = task.dueTime ? task.dueTime.split(':').map(Number) : [9, 0];
  scheduledDate.setHours(hours, minutes, 0, 0);

  // Calculate end time based on estimated duration
  const endDate = new Date(scheduledDate.getTime() + task.estimatedDuration * 60 * 1000);

  // Format dates for ICS (YYYYMMDDTHHMMSS)
  const formatICSDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  // Build description with steps
  const stepsDescription = task.steps.map((step, index) =>
    `${index + 1}. ${step.title}${step.description ? ': ' + step.description : ''}`
  ).join('\\n');

  const description = `${task.description}\\n\\nAssigned to: ${assigneeNames}\\nPriority: ${task.priority}\\nDepartment: ${task.department}\\nCategory: ${task.category}\\n\\nSteps:\\n${stepsDescription}`;

  const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SOP App//Task Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
DTSTART:${formatICSDate(scheduledDate)}
DTEND:${formatICSDate(endDate)}
DTSTAMP:${formatICSDate(new Date())}
UID:${task.id}@sop-app
SUMMARY:${task.title}
DESCRIPTION:${description}
STATUS:${task.status === 'completed' ? 'COMPLETED' : 'CONFIRMED'}
PRIORITY:${task.priority === 'urgent' ? 1 : task.priority === 'high' ? 3 : task.priority === 'medium' ? 5 : 9}
END:VEVENT
END:VCALENDAR`;

  return icsContent;
};

// Download ICS file
const downloadICSFile = (task: JobTask, users: User[]) => {
  const icsContent = generateICSContent(task, users);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${task.title.replace(/[^a-z0-9]/gi, '_')}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const CalendarTaskModal: React.FC<CalendarTaskModalProps> = ({
  isOpen,
  onClose,
  task,
  users,
}) => {
  if (!isOpen || !task) return null;

  const assignedUsers = users.filter(u => task.assignedTo.includes(u.id));
  const completedStepsCount = task.completedSteps.length;
  const totalSteps = task.steps.length;

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
                <span>{completedStepsCount} / {totalSteps} steps completed</span>
                <span style={styles.progressPercent}>{task.progressPercentage}%</span>
              </div>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${task.progressPercentage}%` }} />
              </div>
            </div>
          </div>

          {/* Steps */}
          {task.steps.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Steps</h3>
              <div style={styles.stepsList}>
                {task.steps.map((step, index) => (
                  <div key={step.id} style={styles.stepItem}>
                    <div style={{
                      ...styles.stepCheckbox,
                      backgroundColor: step.isCompleted ? theme.colors.status.completed : 'transparent',
                      borderColor: step.isCompleted ? theme.colors.status.completed : theme.colors.border,
                    }}>
                      {step.isCompleted && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div style={styles.stepContent}>
                      <span style={{
                        ...styles.stepTitle,
                        textDecoration: step.isCompleted ? 'line-through' : 'none',
                        opacity: step.isCompleted ? 0.6 : 1,
                      }}>
                        {index + 1}. {step.title}
                      </span>
                      {step.description && (
                        <span style={styles.stepDescription}>{step.description}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer with Export Button */}
        <div style={styles.footer}>
          <button
            style={styles.exportButton}
            onClick={() => downloadICSFile(task, users)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <path d="M12 14l-3 3h6l-3-3z" />
              <line x1="12" y1="14" x2="12" y2="20" />
            </svg>
            Add to Calendar
          </button>
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
  exportButton: {
    ...theme.components.button.base,
    ...theme.components.button.sizes.md,
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    fontWeight: 600,
  },
};

export default CalendarTaskModal;
