import React, { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTask } from '../contexts/TaskContext';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { JobTask } from '../types';

// Types for alerts
interface TeamMemberProgress {
  userId: string;
  userName: string;
  userInitials: string;
  department: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  recentActivity: {
    taskId: string;
    taskTitle: string;
    action: 'completed' | 'step_completed' | 'started';
    timestamp: string;
    stepsCompleted?: number;
    totalSteps?: number;
  }[];
  overallProgress: number;
}

interface TaskAlert {
  id: string;
  taskId: string;
  taskTitle: string;
  type: 'overdue' | 'due_today' | 'due_tomorrow';
  scheduledDate: string;
  daysOverdue?: number;
  priority: string;
  stepsCompleted: number;
  totalSteps: number;
}

const AlertsPage: React.FC = () => {
  const { currentUser, users, isAdmin } = useAuth();
  const { jobTasks } = useTask();
  const { isMobileOrTablet } = useResponsive();

  // Calculate team member progress for admin view
  const teamMemberProgress = useMemo((): TeamMemberProgress[] => {
    if (!isAdmin) return [];

    const progressMap = new Map<string, TeamMemberProgress>();

    // Initialize all team members
    users.forEach(user => {
      if (user.role !== 'admin') {
        progressMap.set(user.id, {
          userId: user.id,
          userName: `${user.firstName} ${user.lastName}`,
          userInitials: `${user.firstName[0]}${user.lastName[0]}`.toUpperCase(),
          department: user.department,
          totalTasks: 0,
          completedTasks: 0,
          inProgressTasks: 0,
          pendingTasks: 0,
          overdueTasks: 0,
          recentActivity: [],
          overallProgress: 0,
        });
      }
    });

    // Process tasks
    jobTasks
      .filter(task => task.status !== 'archived' && task.status !== 'draft')
      .forEach(task => {
        const assignedTo = task.assignedTo || [];
        assignedTo.forEach(userId => {
          const member = progressMap.get(userId);
          if (member) {
            member.totalTasks++;

            switch (task.status) {
              case 'completed':
                member.completedTasks++;
                // Add to recent activity if completed recently (last 7 days)
                if (task.completedAt) {
                  const completedDate = new Date(task.completedAt);
                  const sevenDaysAgo = new Date();
                  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                  if (completedDate >= sevenDaysAgo) {
                    member.recentActivity.push({
                      taskId: task.id,
                      taskTitle: task.title,
                      action: 'completed',
                      timestamp: task.completedAt,
                    });
                  }
                }
                break;
              case 'in-progress':
                member.inProgressTasks++;
                // Track step progress
                if (task.steps.length > 0 && task.completedSteps.length > 0) {
                  member.recentActivity.push({
                    taskId: task.id,
                    taskTitle: task.title,
                    action: 'step_completed',
                    timestamp: task.updatedAt || task.createdAt,
                    stepsCompleted: task.completedSteps.length,
                    totalSteps: task.steps.length,
                  });
                }
                break;
              case 'overdue':
                member.overdueTasks++;
                break;
              case 'pending':
                member.pendingTasks++;
                break;
            }
          }
        });
      });

    // Calculate overall progress and sort recent activity
    progressMap.forEach(member => {
      if (member.totalTasks > 0) {
        member.overallProgress = Math.round((member.completedTasks / member.totalTasks) * 100);
      }
      // Sort by most recent first, limit to 5
      member.recentActivity.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      member.recentActivity = member.recentActivity.slice(0, 5);
    });

    // Convert to array and sort by activity
    return Array.from(progressMap.values())
      .filter(m => m.totalTasks > 0)
      .sort((a, b) => b.recentActivity.length - a.recentActivity.length || b.totalTasks - a.totalTasks);
  }, [isAdmin, users, jobTasks]);

  // Calculate alerts for team member view
  const taskAlerts = useMemo((): TaskAlert[] => {
    if (!currentUser) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const alerts: TaskAlert[] = [];

    // Filter tasks assigned to current user
    const myTasks = jobTasks.filter(task =>
      task.assignedTo?.includes(currentUser.id) &&
      task.status !== 'completed' &&
      task.status !== 'archived' &&
      task.status !== 'draft'
    );

    myTasks.forEach(task => {
      const dueDate = task.scheduledDate;
      const dueDateObj = new Date(dueDate);
      dueDateObj.setHours(0, 0, 0, 0);

      if (dueDate < todayStr || task.status === 'overdue') {
        // Overdue
        const daysOverdue = Math.floor((today.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
        alerts.push({
          id: `alert_${task.id}_overdue`,
          taskId: task.id,
          taskTitle: task.title,
          type: 'overdue',
          scheduledDate: dueDate,
          daysOverdue: daysOverdue > 0 ? daysOverdue : 1,
          priority: task.priority,
          stepsCompleted: task.completedSteps?.length || 0,
          totalSteps: task.steps?.length || 0,
        });
      } else if (dueDate === todayStr) {
        // Due today
        alerts.push({
          id: `alert_${task.id}_today`,
          taskId: task.id,
          taskTitle: task.title,
          type: 'due_today',
          scheduledDate: dueDate,
          priority: task.priority,
          stepsCompleted: task.completedSteps?.length || 0,
          totalSteps: task.steps?.length || 0,
        });
      } else if (dueDate === tomorrowStr) {
        // Due tomorrow (warning)
        alerts.push({
          id: `alert_${task.id}_tomorrow`,
          taskId: task.id,
          taskTitle: task.title,
          type: 'due_tomorrow',
          scheduledDate: dueDate,
          priority: task.priority,
          stepsCompleted: task.completedSteps?.length || 0,
          totalSteps: task.steps?.length || 0,
        });
      }
    });

    // Sort: overdue first, then due today, then due tomorrow
    return alerts.sort((a, b) => {
      const order = { overdue: 0, due_today: 1, due_tomorrow: 2 };
      return order[a.type] - order[b.type];
    });
  }, [currentUser, jobTasks]);

  const getAlertColor = (type: TaskAlert['type']) => {
    switch (type) {
      case 'overdue':
        return theme.colors.status.error;
      case 'due_today':
        return theme.colors.status.warning;
      case 'due_tomorrow':
        return '#F59E0B'; // Amber
      default:
        return theme.colors.txt.secondary;
    }
  };

  const getAlertBgColor = (type: TaskAlert['type']) => {
    switch (type) {
      case 'overdue':
        return 'rgba(239, 35, 60, 0.1)';
      case 'due_today':
        return 'rgba(245, 158, 11, 0.1)';
      case 'due_tomorrow':
        return 'rgba(245, 158, 11, 0.05)';
      default:
        return theme.colors.bg.tertiary;
    }
  };

  const getAlertIcon = (type: TaskAlert['type']) => {
    switch (type) {
      case 'overdue':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        );
      case 'due_today':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case 'due_tomorrow':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        );
    }
  };

  const getAlertLabel = (type: TaskAlert['type'], daysOverdue?: number) => {
    switch (type) {
      case 'overdue':
        return daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`;
      case 'due_today':
        return 'Due today';
      case 'due_tomorrow':
        return 'Due tomorrow';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return theme.colors.status.success;
    if (progress >= 50) return theme.colors.status.info;
    if (progress >= 25) return theme.colors.status.warning;
    return theme.colors.status.error;
  };

  // Render Admin View
  const renderAdminView = () => (
    <div style={styles.adminContainer}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.colors.primary} strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Team Progress Overview
        </h2>
        <span style={styles.memberCount}>{teamMemberProgress.length} team members</span>
      </div>

      {teamMemberProgress.length === 0 ? (
        <div style={styles.emptyState}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
          <h4>No Team Activity</h4>
          <p>No tasks have been assigned to team members yet.</p>
        </div>
      ) : (
        <div style={styles.teamGrid}>
          {teamMemberProgress.map(member => (
            <div key={member.userId} style={styles.memberCard}>
              {/* Member Header */}
              <div style={styles.memberHeader}>
                <div style={styles.memberAvatar}>
                  {member.userInitials}
                </div>
                <div style={styles.memberInfo}>
                  <h3 style={styles.memberName}>{member.userName}</h3>
                  <span style={styles.memberDepartment}>{member.department}</span>
                </div>
                <div style={styles.progressCircle}>
                  <svg width="50" height="50" viewBox="0 0 50 50">
                    <circle
                      cx="25"
                      cy="25"
                      r="20"
                      fill="none"
                      stroke={theme.colors.bg.tertiary}
                      strokeWidth="4"
                    />
                    <circle
                      cx="25"
                      cy="25"
                      r="20"
                      fill="none"
                      stroke={getProgressColor(member.overallProgress)}
                      strokeWidth="4"
                      strokeDasharray={`${(member.overallProgress / 100) * 125.6} 125.6`}
                      strokeLinecap="round"
                      transform="rotate(-90 25 25)"
                    />
                  </svg>
                  <span style={styles.progressText}>{member.overallProgress}%</span>
                </div>
              </div>

              {/* Stats Row */}
              <div style={styles.statsRow}>
                <div style={styles.statItem}>
                  <span style={{ ...styles.statValue, color: theme.colors.status.success }}>
                    {member.completedTasks}
                  </span>
                  <span style={styles.statLabel}>Done</span>
                </div>
                <div style={styles.statItem}>
                  <span style={{ ...styles.statValue, color: theme.colors.status.info }}>
                    {member.inProgressTasks}
                  </span>
                  <span style={styles.statLabel}>Active</span>
                </div>
                <div style={styles.statItem}>
                  <span style={{ ...styles.statValue, color: theme.colors.status.warning }}>
                    {member.pendingTasks}
                  </span>
                  <span style={styles.statLabel}>Pending</span>
                </div>
                <div style={styles.statItem}>
                  <span style={{ ...styles.statValue, color: theme.colors.status.error }}>
                    {member.overdueTasks}
                  </span>
                  <span style={styles.statLabel}>Overdue</span>
                </div>
              </div>

              {/* Recent Activity */}
              {member.recentActivity.length > 0 && (
                <div style={styles.activitySection}>
                  <h4 style={styles.activityTitle}>Recent Activity</h4>
                  <div style={styles.activityList}>
                    {member.recentActivity.map((activity, idx) => (
                      <div key={idx} style={styles.activityItem}>
                        <div style={{
                          ...styles.activityDot,
                          backgroundColor: activity.action === 'completed'
                            ? theme.colors.status.success
                            : theme.colors.status.info
                        }} />
                        <div style={styles.activityContent}>
                          <span style={styles.activityText}>
                            {activity.action === 'completed' && 'Completed '}
                            {activity.action === 'step_completed' && `${activity.stepsCompleted}/${activity.totalSteps} steps on `}
                            {activity.action === 'started' && 'Started '}
                            <strong>{activity.taskTitle}</strong>
                          </span>
                          <span style={styles.activityTime}>{formatTimestamp(activity.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Render Team Member View
  const renderTeamView = () => (
    <div style={styles.teamContainer}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.colors.primary} strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          My Task Alerts
        </h2>
        <span style={styles.alertCount}>
          {taskAlerts.filter(a => a.type === 'overdue').length} overdue
        </span>
      </div>

      {taskAlerts.length === 0 ? (
        <div style={styles.emptyState}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.success} strokeWidth="1.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <h4>All Caught Up!</h4>
          <p>You have no overdue or urgent tasks.</p>
        </div>
      ) : (
        <div style={styles.alertsList}>
          {taskAlerts.map(alert => (
            <div
              key={alert.id}
              style={{
                ...styles.alertCard,
                backgroundColor: getAlertBgColor(alert.type),
                borderLeftColor: getAlertColor(alert.type),
              }}
            >
              <div style={styles.alertHeader}>
                <div style={{ ...styles.alertIcon, color: getAlertColor(alert.type) }}>
                  {getAlertIcon(alert.type)}
                </div>
                <div style={styles.alertInfo}>
                  <h3 style={styles.alertTitle}>{alert.taskTitle}</h3>
                  <div style={styles.alertMeta}>
                    <span style={{ ...styles.alertBadge, backgroundColor: getAlertColor(alert.type) }}>
                      {getAlertLabel(alert.type, alert.daysOverdue)}
                    </span>
                    <span style={styles.alertDate}>
                      Due: {formatDate(alert.scheduledDate)}
                    </span>
                    <span style={{
                      ...styles.priorityBadge,
                      backgroundColor: alert.priority === 'high' || alert.priority === 'urgent'
                        ? 'rgba(239, 35, 60, 0.1)'
                        : 'rgba(245, 158, 11, 0.1)',
                      color: alert.priority === 'high' || alert.priority === 'urgent'
                        ? theme.colors.status.error
                        : theme.colors.status.warning,
                    }}>
                      {alert.priority}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div style={styles.alertProgress}>
                <div style={styles.progressLabel}>
                  <span>Progress</span>
                  <span>{alert.stepsCompleted}/{alert.totalSteps} steps</span>
                </div>
                <div style={styles.progressBar}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${alert.totalSteps > 0 ? (alert.stepsCompleted / alert.totalSteps) * 100 : 0}%`,
                      backgroundColor: getAlertColor(alert.type),
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      <div style={styles.summarySection}>
        <h3 style={styles.summaryTitle}>Alert Summary</h3>
        <div style={styles.summaryGrid}>
          <div style={{ ...styles.summaryCard, borderColor: theme.colors.status.error }}>
            <span style={{ ...styles.summaryValue, color: theme.colors.status.error }}>
              {taskAlerts.filter(a => a.type === 'overdue').length}
            </span>
            <span style={styles.summaryLabel}>Overdue</span>
          </div>
          <div style={{ ...styles.summaryCard, borderColor: theme.colors.status.warning }}>
            <span style={{ ...styles.summaryValue, color: theme.colors.status.warning }}>
              {taskAlerts.filter(a => a.type === 'due_today').length}
            </span>
            <span style={styles.summaryLabel}>Due Today</span>
          </div>
          <div style={{ ...styles.summaryCard, borderColor: '#F59E0B' }}>
            <span style={{ ...styles.summaryValue, color: '#F59E0B' }}>
              {taskAlerts.filter(a => a.type === 'due_tomorrow').length}
            </span>
            <span style={styles.summaryLabel}>Due Tomorrow</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-enter" style={styles.container}>
      <div style={{
        ...styles.content,
        padding: isMobileOrTablet ? '20px 16px' : '40px',
        maxWidth: isMobileOrTablet ? '100%' : '1200px',
      }}>
        {/* Page Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Alerts</h1>
          <p style={styles.subtitle}>
            {isAdmin
              ? 'Monitor team progress and task completion activity'
              : 'Stay on top of your upcoming and overdue tasks'
            }
          </p>
        </div>

        {/* Render appropriate view based on role */}
        {isAdmin ? renderAdminView() : renderTeamView()}

        {/* Team members also see their alerts if they're admin */}
        {isAdmin && taskAlerts.length > 0 && (
          <div style={{ marginTop: theme.spacing.xl }}>
            <div style={styles.divider} />
            <h2 style={{ ...styles.sectionTitle, marginTop: theme.spacing.xl, marginBottom: theme.spacing.lg }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.warning} strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              Your Alerts
            </h2>
            {renderTeamView()}
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: 'calc(100vh - 80px)',
    backgroundColor: theme.colors.background,
  },
  content: {
    margin: '0 auto',
  },
  header: {
    marginBottom: theme.spacing.xl,
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
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  memberCount: {
    fontSize: '14px',
    color: theme.colors.txt.tertiary,
    backgroundColor: theme.colors.bg.tertiary,
    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
    borderRadius: theme.borderRadius.md,
  },
  alertCount: {
    fontSize: '14px',
    color: theme.colors.status.error,
    backgroundColor: 'rgba(239, 35, 60, 0.1)',
    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
    borderRadius: theme.borderRadius.md,
    fontWeight: 600,
  },
  divider: {
    height: '1px',
    backgroundColor: theme.colors.bdr.primary,
  },

  // Admin View Styles
  adminContainer: {
    marginBottom: theme.spacing.xl,
  },
  teamGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: theme.spacing.lg,
  },
  memberCard: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.bdr.primary}`,
    padding: theme.spacing.lg,
    transition: 'all 0.2s',
  },
  memberHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  memberAvatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: 700,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    margin: 0,
  },
  memberDepartment: {
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
  },
  progressCircle: {
    position: 'relative' as const,
    width: '50px',
    height: '50px',
  },
  progressText: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '12px',
    fontWeight: 700,
    color: theme.colors.txt.primary,
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  statItem: {
    textAlign: 'center' as const,
    flex: 1,
  },
  statValue: {
    display: 'block',
    fontSize: '20px',
    fontWeight: 700,
  },
  statLabel: {
    display: 'block',
    fontSize: '11px',
    color: theme.colors.txt.tertiary,
    marginTop: '2px',
  },
  activitySection: {
    marginTop: theme.spacing.md,
  },
  activityTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.txt.tertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: theme.spacing.sm,
  },
  activityItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  activityDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    marginTop: '6px',
    flexShrink: 0,
  },
  activityContent: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  activityText: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
    lineHeight: '1.4',
  },
  activityTime: {
    fontSize: '11px',
    color: theme.colors.txt.tertiary,
    whiteSpace: 'nowrap' as const,
  },

  // Team View Styles
  teamContainer: {},
  alertsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: theme.spacing.md,
  },
  alertCard: {
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderLeft: '4px solid',
    padding: theme.spacing.lg,
    transition: 'all 0.2s',
  },
  alertHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  alertIcon: {
    flexShrink: 0,
  },
  alertInfo: {
    flex: 1,
  },
  alertTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  alertMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap' as const,
  },
  alertBadge: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#fff',
    padding: '3px 8px',
    borderRadius: theme.borderRadius.sm,
    textTransform: 'uppercase' as const,
  },
  alertDate: {
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
  },
  priorityBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: theme.borderRadius.sm,
    textTransform: 'capitalize' as const,
  },
  alertProgress: {
    marginTop: theme.spacing.sm,
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
    marginBottom: theme.spacing.xs,
  },
  progressBar: {
    height: '6px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: '3px',
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },

  // Summary Section
  summarySection: {
    marginTop: theme.spacing.xl,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  summaryTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: theme.spacing.md,
  },
  summaryCard: {
    textAlign: 'center' as const,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    borderLeft: '3px solid',
  },
  summaryValue: {
    display: 'block',
    fontSize: '28px',
    fontWeight: 700,
  },
  summaryLabel: {
    display: 'block',
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
    marginTop: theme.spacing.xs,
  },

  // Empty State
  emptyState: {
    textAlign: 'center' as const,
    padding: theme.spacing.xl,
    color: theme.colors.txt.tertiary,
  },
};

export default AlertsPage;
