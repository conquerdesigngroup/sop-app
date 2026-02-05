import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useTask, TASK_COMPLETE_MARKER } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { useSOPs } from '../contexts/SOPContext';
import { useToast } from '../contexts/ToastContext';
import { JobTask, TaskStep } from '../types';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { SwipeableListItem, createSwipeAction } from '../components/SwipeableList';
import PullToRefresh from '../components/PullToRefresh';

const MyTasksPage: React.FC = () => {
  const { jobTasks, updateJobTask } = useTask();
  const { currentUser } = useAuth();
  const { sops } = useSOPs();
  const { success: showSuccess } = useToast();
  const location = useLocation();
  const { isMobileOrTablet } = useResponsive();
  const [selectedTask, setSelectedTask] = useState<JobTask | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pull to refresh handler - simulates refresh with small delay
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    // Simulate refresh since data is already reactive
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsRefreshing(false);
  }, []);

  // Quick complete task (mark all steps as done)
  const handleQuickComplete = useCallback((task: JobTask) => {
    if (task.steps.length === 0) {
      // Task without steps - use the special marker
      updateJobTask(task.id, {
        completedSteps: [TASK_COMPLETE_MARKER],
        status: 'completed',
        progressPercentage: 100,
        completedAt: new Date().toISOString(),
      });
    } else {
      // Task with steps - mark all steps complete
      const allStepIds = task.steps.map(s => s.id);
      const updatedSteps = task.steps.map(s => ({
        ...s,
        isCompleted: true,
        completedAt: new Date().toISOString(),
      }));

      updateJobTask(task.id, {
        steps: updatedSteps,
        completedSteps: allStepIds,
        status: 'completed',
        progressPercentage: 100,
        completedAt: new Date().toISOString(),
      });
    }

    showSuccess(`"${task.title}" marked as complete!`);
  }, [updateJobTask, showSuccess]);

  // Check if we should apply filters based on navigation state
  useEffect(() => {
    if (location.state) {
      const state = location.state as any;
      if (state.filterStatus) {
        setFilterStatus(state.filterStatus);
      }
      if (state.filterDate) {
        setFilterDate(state.filterDate);
      }
      // Clear the state so it doesn't reapply on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Get tasks assigned to current user (excluding archived and draft tasks)
  const myTasks = jobTasks.filter(task =>
    currentUser &&
    task.assignedTo.includes(currentUser.id) &&
    task.status !== 'archived' &&
    task.status !== 'draft'
  );

  // Filter tasks
  const filteredTasks = myTasks.filter(task => {
    const matchesStatus = filterStatus === 'all' || task.status === filterStatus;

    if (filterDate === 'today') {
      const today = new Date().toISOString().split('T')[0];
      return matchesStatus && task.scheduledDate === today;
    } else if (filterDate === 'upcoming') {
      const today = new Date().toISOString().split('T')[0];
      return matchesStatus && task.scheduledDate > today;
    } else if (filterDate === 'past') {
      const today = new Date().toISOString().split('T')[0];
      return matchesStatus && task.scheduledDate < today;
    }

    return matchesStatus;
  });

  // Sort by scheduled date
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
  });

  const handleTaskClick = (task: JobTask) => {
    setSelectedTask(task);
  };

  const handleCloseDetail = () => {
    setSelectedTask(null);
  };

  const handleStepToggle = (task: JobTask, stepId: string) => {
    const step = task.steps.find(s => s.id === stepId);
    if (!step) return;

    // Check current completion state from completedSteps array (source of truth)
    const isCurrentlyCompleted = task.completedSteps.includes(stepId);

    let newCompletedSteps: string[];
    let updatedSteps = task.steps.map(s => {
      if (s.id === stepId) {
        return { ...s, isCompleted: !isCurrentlyCompleted, completedAt: !isCurrentlyCompleted ? new Date().toISOString() : undefined };
      }
      return s;
    });

    if (isCurrentlyCompleted) {
      // Unchecking - remove from completed
      newCompletedSteps = task.completedSteps.filter(id => id !== stepId);
    } else {
      // Checking - add to completed
      newCompletedSteps = [...task.completedSteps, stepId];
    }

    // Calculate new progress percentage
    const newProgressPercentage = task.steps.length > 0
      ? Math.round((newCompletedSteps.length / task.steps.length) * 100)
      : 0;

    // Update status based on progress
    let newStatus = task.status;
    if (newCompletedSteps.length === 0) {
      newStatus = 'pending';
    } else if (newCompletedSteps.length === task.steps.length) {
      newStatus = 'completed';
    } else {
      newStatus = 'in-progress';
    }

    updateJobTask(task.id, {
      steps: updatedSteps,
      completedSteps: newCompletedSteps,
      status: newStatus,
      progressPercentage: newProgressPercentage,
      startedAt: task.startedAt || new Date().toISOString(),
    });

    // Update selected task if it's open
    if (selectedTask?.id === task.id) {
      const updatedTask = {
        ...task,
        steps: updatedSteps,
        completedSteps: newCompletedSteps,
        status: newStatus,
        progressPercentage: newProgressPercentage,
      };
      setSelectedTask(updatedTask);
    }
  };

  // Toggle completion for tasks without steps
  const handleNoStepsToggle = (task: JobTask) => {
    const isCurrentlyComplete = task.completedSteps.includes(TASK_COMPLETE_MARKER);

    if (isCurrentlyComplete) {
      // Unmark as complete
      updateJobTask(task.id, {
        completedSteps: [],
        status: 'pending',
        progressPercentage: 0,
        completedAt: undefined,
      });
    } else {
      // Mark as complete
      updateJobTask(task.id, {
        completedSteps: [TASK_COMPLETE_MARKER],
        status: 'completed',
        progressPercentage: 100,
        completedAt: new Date().toISOString(),
      });
    }

    // Update selected task if open
    if (selectedTask?.id === task.id) {
      setSelectedTask({
        ...task,
        completedSteps: isCurrentlyComplete ? [] : [TASK_COMPLETE_MARKER],
        status: isCurrentlyComplete ? 'pending' : 'completed',
        progressPercentage: isCurrentlyComplete ? 0 : 100,
      });
    }
  };

  // Get today's tasks count
  const todayTasksCount = myTasks.filter(task => {
    const today = new Date().toISOString().split('T')[0];
    return task.scheduledDate === today && task.status !== 'completed';
  }).length;

  return (
    <div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
      <div style={isMobileOrTablet ? styles.headerMobile : styles.header}>
        <div>
          <h1 style={isMobileOrTablet ? styles.titleMobile : styles.title}>
            <svg
              width={isMobileOrTablet ? "24" : "32"}
              height={isMobileOrTablet ? "24" : "32"}
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.colors.primary}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: isMobileOrTablet ? '8px' : '12px' }}
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            My Tasks
          </h1>
          <p style={styles.subtitle}>
            {todayTasksCount > 0 ? `You have ${todayTasksCount} task${todayTasksCount !== 1 ? 's' : ''} due today` : 'All caught up!'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={isMobileOrTablet ? styles.filtersContainerMobile : styles.filtersContainer}>
        <select
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          style={isMobileOrTablet ? styles.filterSelectMobile : styles.filterSelect}
        >
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={isMobileOrTablet ? styles.filterSelectMobile : styles.filterSelect}
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {/* Tasks List with Pull to Refresh */}
      <PullToRefresh onRefresh={handleRefresh} disabled={!isMobileOrTablet}>
        <div style={styles.tasksList}>
          {isMobileOrTablet && (
            <p style={styles.swipeHint}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              Swipe right to complete
            </p>
          )}
          {sortedTasks.length === 0 ? (
            <div style={styles.emptyState}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="1.5">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <p style={styles.emptyText}>No tasks found</p>
              <p style={styles.emptySubtext}>You're all set!</p>
            </div>
          ) : (
            sortedTasks.map(task => (
              isMobileOrTablet && task.status !== 'completed' ? (
                <SwipeableListItem
                  key={task.id}
                  leftAction={createSwipeAction.complete(() => handleQuickComplete(task))}
                >
                  <MyTaskCard
                    task={task}
                    onClick={() => handleTaskClick(task)}
                    onStepToggle={(stepId) => handleStepToggle(task, stepId)}
                    onNoStepsToggle={() => handleNoStepsToggle(task)}
                    isMobileOrTablet={isMobileOrTablet}
                  />
                </SwipeableListItem>
              ) : (
                <MyTaskCard
                  key={task.id}
                  task={task}
                  onClick={() => handleTaskClick(task)}
                  onStepToggle={(stepId) => handleStepToggle(task, stepId)}
                  onNoStepsToggle={() => handleNoStepsToggle(task)}
                  isMobileOrTablet={isMobileOrTablet}
                />
              )
            ))
          )}
        </div>
      </PullToRefresh>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          sops={sops}
          onClose={handleCloseDetail}
          onStepToggle={(stepId) => handleStepToggle(selectedTask, stepId)}
          onNoStepsToggle={() => handleNoStepsToggle(selectedTask)}
          isMobileOrTablet={isMobileOrTablet}
        />
      )}
    </div>
  );
};

// My Task Card Component
interface MyTaskCardProps {
  task: JobTask;
  onClick: () => void;
  onStepToggle: (stepId: string) => void;
  onNoStepsToggle: () => void;
  isMobileOrTablet: boolean;
}

const MyTaskCard: React.FC<MyTaskCardProps> = ({ task, onClick, onStepToggle, onNoStepsToggle, isMobileOrTablet }) => {
  const [expanded, setExpanded] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return theme.colors.status.success;
      case 'in-progress': return theme.colors.status.info;
      case 'overdue': return theme.colors.status.error;
      case 'pending': return theme.colors.status.warning;
      default: return theme.colors.txt.tertiary;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return theme.colors.status.error;
      case 'high': return theme.colors.status.warning;
      case 'medium': return theme.colors.status.info;
      default: return theme.colors.txt.tertiary;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  return (
    <div style={isMobileOrTablet ? styles.taskCardMobile : styles.taskCard}>
      <div style={styles.taskCardHeader} onClick={onClick}>
        <div style={styles.taskCardHeaderLeft}>
          <h3 style={isMobileOrTablet ? styles.taskCardTitleMobile : styles.taskCardTitle}>{task.title}</h3>
          <p style={styles.taskCardDescription}>{task.description}</p>
        </div>
        <button
          style={isMobileOrTablet ? styles.expandButtonMobile : styles.expandButton}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      <div style={styles.taskCardMeta}>
        <div style={styles.taskCardBadges}>
          <span style={{...styles.statusBadge, backgroundColor: getStatusColor(task.status) + '20', color: getStatusColor(task.status)}}>
            {task.status.replace('-', ' ').toUpperCase()}
          </span>
          <span style={{...styles.priorityBadge, color: getPriorityColor(task.priority)}}>
            {task.priority.toUpperCase()}
          </span>
        </div>

        <div style={styles.taskCardDate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {formatDate(task.scheduledDate)}
          {task.dueTime && ` at ${task.dueTime}`}
        </div>
      </div>

      {/* Progress Bar */}
      <div style={isMobileOrTablet ? styles.progressSectionMobile : styles.progressSection}>
        <div style={styles.progressHeader}>
          <span style={styles.progressText}>Progress: {task.progressPercentage}%</span>
          <span style={styles.progressSteps}>
            {task.steps.length === 0
              ? (task.progressPercentage === 100 ? 'Complete' : 'Not started')
              : `${task.completedSteps.filter(id => id !== '__task_complete__').length} / ${task.steps.length} steps`
            }
          </span>
        </div>
        <div style={isMobileOrTablet ? styles.progressBarMobile : styles.progressBar}>
          <div style={{...styles.progressFill, width: `${task.progressPercentage}%`}} />
        </div>
      </div>

      {/* Expandable Steps Section */}
      {expanded && (
        <div style={styles.stepsSection}>
          {task.steps.length === 0 ? (
            /* No steps - show single completion checkbox */
            <label style={isMobileOrTablet ? styles.stepCheckboxMobile : styles.stepCheckbox}>
              <input
                type="checkbox"
                checked={task.progressPercentage === 100}
                onChange={(e) => {
                  e.stopPropagation();
                  onNoStepsToggle();
                }}
                style={isMobileOrTablet ? styles.checkboxMobile : styles.checkbox}
              />
              <div style={styles.stepContent}>
                <span style={{
                  ...styles.stepTitle,
                  textDecoration: task.progressPercentage === 100 ? 'line-through' : 'none',
                  fontWeight: 600,
                }}>
                  Mark Task Complete
                </span>
                <span style={styles.stepDescription}>
                  This task has no individual steps. Check this box to mark the entire task as complete.
                </span>
              </div>
            </label>
          ) : (
            /* Has steps - show step list */
            <>
              <h4 style={styles.stepsSectionTitle}>Task Steps</h4>
              {task.steps.map((step, index) => (
                <label key={step.id} style={isMobileOrTablet ? styles.stepCheckboxMobile : styles.stepCheckbox}>
                  <input
                    type="checkbox"
                    checked={step.isCompleted}
                    onChange={(e) => {
                      e.stopPropagation();
                      onStepToggle(step.id);
                    }}
                    style={isMobileOrTablet ? styles.checkboxMobile : styles.checkbox}
                  />
                  <div style={styles.stepContent}>
                    <span style={{...styles.stepTitle, textDecoration: step.isCompleted ? 'line-through' : 'none'}}>
                      {index + 1}. {step.title}
                    </span>
                    {step.description && (
                      <span style={styles.stepDescription}>{step.description}</span>
                    )}
                    {step.requiresPhoto && (
                      <span style={styles.photoRequiredBadge}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        Photo Required
                      </span>
                    )}
                  </div>
                </label>
              ))}
            </>
          )}
        </div>
      )}

      {/* Task Stats */}
      <div style={styles.taskCardStats}>
        <div style={styles.stat}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>{task.estimatedDuration} min</span>
        </div>
        {task.sopIds.length > 0 && (
          <div style={styles.stat}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>{task.sopIds.length} SOPs</span>
          </div>
        )}
        <div style={styles.stat}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 7h-9M14 17H5M17 12H3" />
          </svg>
          <span>{task.category}</span>
        </div>
      </div>
    </div>
  );
};

// Task Detail Modal Component
interface TaskDetailModalProps {
  task: JobTask;
  sops: any[];
  onClose: () => void;
  onStepToggle: (stepId: string) => void;
  onNoStepsToggle: () => void;
  isMobileOrTablet: boolean;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, sops, onClose, onStepToggle, onNoStepsToggle, isMobileOrTablet }) => {
  const attachedSOPs = sops.filter(sop => task.sopIds.includes(sop.id));

  // Calculate progress - handle tasks without steps
  const totalSteps = task.steps.length;
  const hasNoSteps = totalSteps === 0;
  const isNoStepsComplete = hasNoSteps && task.completedSteps.includes('__task_complete__');
  const completedCount = hasNoSteps
    ? (isNoStepsComplete ? 1 : 0)
    : task.completedSteps.filter(id => task.steps.some(step => step.id === id)).length;
  const progressPercent = hasNoSteps
    ? (isNoStepsComplete ? 100 : 0)
    : (totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <div style={isMobileOrTablet ? styles.modalOverlayMobile : styles.modalOverlay} onClick={onClose}>
      <div style={isMobileOrTablet ? styles.modalMobile : styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={isMobileOrTablet ? styles.modalHeaderMobile : styles.modalHeader}>
          <h2 style={isMobileOrTablet ? styles.modalTitleMobile : styles.modalTitle}>{task.title}</h2>
          <button style={styles.closeButton} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={isMobileOrTablet ? styles.modalContentMobile : styles.modalContent}>
          {/* Task Description */}
          <div style={styles.modalSection}>
            <p style={styles.taskDetailDescription}>{task.description}</p>
          </div>

          {/* Task Meta */}
          <div style={styles.modalSection}>
            <div style={styles.metaGrid}>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Scheduled:</span>
                <span style={styles.metaValue}>
                  {formatDate(task.scheduledDate)}
                  {task.dueTime && ` at ${task.dueTime}`}
                </span>
              </div>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Duration:</span>
                <span style={styles.metaValue}>{task.estimatedDuration} minutes</span>
              </div>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Priority:</span>
                <span style={styles.metaValue}>{task.priority}</span>
              </div>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Category:</span>
                <span style={styles.metaValue}>{task.category}</span>
              </div>
            </div>
          </div>

          {/* Progress */}
          <div style={styles.modalSection}>
            <h3 style={styles.sectionTitle}>Progress</h3>
            <div style={isMobileOrTablet ? styles.progressSectionMobile : styles.progressSection}>
              <div style={styles.progressHeader}>
                <span style={styles.progressText}>{progressPercent}%</span>
                <span style={styles.progressSteps}>
                  {hasNoSteps
                    ? (isNoStepsComplete ? 'Complete' : 'Not started')
                    : `${completedCount} / ${totalSteps} steps completed`
                  }
                </span>
              </div>
              <div style={isMobileOrTablet ? styles.progressBarMobile : styles.progressBar}>
                <div style={{...styles.progressFill, width: `${progressPercent}%`}} />
              </div>
            </div>
          </div>

          {/* Steps / Completion */}
          <div style={styles.modalSection}>
            <h3 style={styles.sectionTitle}>{hasNoSteps ? 'Completion' : 'Steps'}</h3>
            <div style={styles.stepsList}>
              {hasNoSteps ? (
                /* No steps - show single completion checkbox */
                <label style={isMobileOrTablet ? styles.stepCheckboxLargeMobile : styles.stepCheckboxLarge}>
                  <input
                    type="checkbox"
                    checked={isNoStepsComplete}
                    onChange={onNoStepsToggle}
                    style={isMobileOrTablet ? styles.checkboxLargeMobile : styles.checkboxLarge}
                  />
                  <div style={styles.stepContentLarge}>
                    <span style={{
                      ...styles.stepTitleLarge,
                      textDecoration: isNoStepsComplete ? 'line-through' : 'none'
                    }}>
                      Mark Task Complete
                    </span>
                    <span style={styles.stepDescriptionLarge}>
                      This task has no individual steps. Check this box to mark it as complete.
                    </span>
                  </div>
                </label>
              ) : (
                /* Has steps - show step list */
                task.steps.map((step, index) => (
                  <label key={step.id} style={isMobileOrTablet ? styles.stepCheckboxLargeMobile : styles.stepCheckboxLarge}>
                    <input
                      type="checkbox"
                      checked={step.isCompleted}
                      onChange={() => onStepToggle(step.id)}
                      style={isMobileOrTablet ? styles.checkboxLargeMobile : styles.checkboxLarge}
                    />
                    <div style={styles.stepContentLarge}>
                      <span style={{...styles.stepTitleLarge, textDecoration: step.isCompleted ? 'line-through' : 'none'}}>
                        {index + 1}. {step.title}
                      </span>
                      {step.description && (
                        <span style={styles.stepDescriptionLarge}>{step.description}</span>
                      )}
                      {step.requiresPhoto && (
                        <span style={styles.photoRequiredBadge}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                          Photo Required
                        </span>
                      )}
                      {step.isCompleted && step.completedAt && (
                        <span style={styles.completedTime}>
                          Completed {new Date(step.completedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Attached SOPs */}
          {attachedSOPs.length > 0 && (
            <div style={styles.modalSection}>
              <h3 style={styles.sectionTitle}>Reference SOPs</h3>
              <div style={styles.sopsList}>
                {attachedSOPs.map(sop => (
                  <div key={sop.id} style={styles.sopItem}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    <span style={styles.sopTitle}>{sop.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: theme.pageLayout.containerPadding.desktop,
    maxWidth: theme.pageLayout.maxWidth,
    margin: '0 auto',
  },
  containerMobile: {
    padding: theme.pageLayout.containerPadding.mobile,
    maxWidth: '100%',
    margin: '0 auto',
  },
  header: {
    marginBottom: theme.pageLayout.headerMargin.desktop,
  },
  headerMobile: {
    marginBottom: theme.pageLayout.headerMargin.mobile,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    display: 'flex',
    alignItems: 'center',
  },
  titleMobile: {
    ...theme.typography.h1Mobile,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    display: 'flex',
    alignItems: 'center',
  },
  subtitle: {
    ...theme.typography.subtitle,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  filtersContainer: {
    display: 'flex',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  filtersContainerMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  filterSelect: {
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '15px',
    cursor: 'pointer',
    outline: 'none',
  },
  filterSelectMobile: {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '15px',
    cursor: 'pointer',
    outline: 'none',
    width: '100%',
  },
  tasksList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.lg,
  },
  swipeHint: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.xs,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xxl,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
  },
  emptySubtext: {
    fontSize: '14px',
    color: theme.colors.txt.tertiary,
  },
  taskCard: {
    ...theme.components.card.base,
    transition: 'all 0.2s',
    cursor: 'pointer',
  },
  taskCardMobile: {
    ...theme.components.card.base,
    ...theme.components.card.mobile,
    transition: 'all 0.2s',
    cursor: 'pointer',
    width: '100%',
  },
  taskCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  taskCardHeaderLeft: {
    flex: 1,
  },
  taskCardTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.xs,
  },
  taskCardTitleMobile: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.xs,
  },
  taskCardDescription: {
    fontSize: '14px',
    color: theme.colors.txt.secondary,
    lineHeight: '1.5',
  },
  expandButton: {
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.txt.primary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '44px',
    minHeight: '44px',
  },
  expandButtonMobile: {
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.txt.primary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '44px',
    minHeight: '44px',
  },
  taskCardMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  taskCardBadges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  statusBadge: {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
  priorityBadge: {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
  taskCardDate: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
  },
  progressSection: {
    marginBottom: theme.spacing.lg,
  },
  progressSectionMobile: {
    marginBottom: theme.spacing.md,
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  progressText: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  progressSteps: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
  },
  progressBarMobile: {
    width: '100%',
    height: '10px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    transition: 'width 0.3s ease',
  },
  stepsSection: {
    marginBottom: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  },
  stepsSectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.md,
  },
  stepCheckbox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    cursor: 'pointer',
    borderRadius: theme.borderRadius.md,
    transition: 'background-color 0.2s',
  },
  stepCheckboxMobile: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    cursor: 'pointer',
    borderRadius: theme.borderRadius.md,
    transition: 'background-color 0.2s',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    marginTop: '2px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  checkboxMobile: {
    width: '22px',
    height: '22px',
    marginTop: '2px',
    cursor: 'pointer',
    flexShrink: 0,
    minWidth: '22px',
    minHeight: '22px',
  },
  stepContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.xs,
    flex: 1,
  },
  stepTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
  },
  stepDescription: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
  },
  photoRequiredBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    fontSize: '11px',
    color: theme.colors.status.info,
    fontWeight: 500,
  },
  taskCardStats: {
    display: 'flex',
    gap: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  },
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
  },
  modalOverlay: {
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
    padding: theme.spacing.lg,
  },
  modalOverlayMobile: {
    position: 'fixed',
    top: '60px', // Add space for the navigation header
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: theme.spacing.sm,
  },
  modal: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    width: '100%',
    maxWidth: '800px',
    maxHeight: '90vh',
    overflow: 'auto',
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  modalMobile: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    width: '100%',
    maxWidth: '100%',
    maxHeight: 'calc(100vh - 60px)', // Adjust height to account for nav header
    overflow: 'auto',
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.xl,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    position: 'sticky',
    top: 0,
    backgroundColor: theme.colors.bg.secondary,
    zIndex: 10,
  },
  modalHeaderMobile: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    position: 'sticky',
    top: 0,
    backgroundColor: theme.colors.bg.secondary,
    zIndex: 10,
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  modalTitleMobile: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.colors.txt.tertiary,
    cursor: 'pointer',
    padding: theme.spacing.xs,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '44px',
    minHeight: '44px',
  },
  modalContent: {
    padding: theme.spacing.xl,
  },
  modalContentMobile: {
    padding: theme.spacing.md,
  },
  modalSection: {
    marginBottom: theme.spacing.xl,
  },
  taskDetailDescription: {
    fontSize: '15px',
    color: theme.colors.txt.secondary,
    lineHeight: '1.6',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.md,
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: theme.spacing.lg,
  },
  metaItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.xs,
  },
  metaLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.txt.tertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  metaValue: {
    fontSize: '14px',
    color: theme.colors.txt.primary,
  },
  stepsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
  },
  stepCheckboxLarge: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  stepCheckboxLargeMobile: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  checkboxLarge: {
    width: '20px',
    height: '20px',
    marginTop: '2px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  checkboxLargeMobile: {
    width: '24px',
    height: '24px',
    marginTop: '2px',
    cursor: 'pointer',
    flexShrink: 0,
    minWidth: '24px',
    minHeight: '24px',
  },
  stepContentLarge: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    flex: 1,
  },
  stepTitleLarge: {
    fontSize: '15px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
  },
  stepDescriptionLarge: {
    fontSize: '14px',
    color: theme.colors.txt.secondary,
    lineHeight: '1.5',
  },
  completedTime: {
    fontSize: '12px',
    color: theme.colors.status.success,
    fontStyle: 'italic',
  },
  sopsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  sopItem: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  sopTitle: {
    fontSize: '14px',
    color: theme.colors.txt.primary,
    fontWeight: 500,
  },
};

export default MyTasksPage;
