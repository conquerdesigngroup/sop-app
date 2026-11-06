import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTask, TASK_COMPLETE_MARKER } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { useSOPs } from '../contexts/SOPContext';
import { useToast } from '../contexts/ToastContext';
import { JobTask } from '../types';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { studioToday, shiftIsoDays } from '../lib/studioDate';
import { Badge, Button, Card, Modal, Select } from '../components/ui';

/**
 * My Tasks — a team member's own checklist.
 *
 * The list is deliberately just titles with a checkbox: tick it and the task is
 * done. Everything else an admin may have filled in (description, steps, due
 * time, priority, SOPs) lives one tap away in the task's detail modal, and the
 * modal only shows the fields that were actually filled in, so a task that is
 * nothing but a title reads as nothing but a title.
 */

const isTaskDone = (task: JobTask) => task.status === 'completed';

/** The patch that marks a task finished, steps and all. */
const completePatch = (task: JobTask): Partial<JobTask> => {
  const now = new Date().toISOString();
  if (task.steps.length === 0) {
    return {
      completedSteps: [TASK_COMPLETE_MARKER],
      status: 'completed',
      progressPercentage: 100,
      completedAt: now,
    };
  }
  return {
    steps: task.steps.map(s => ({ ...s, isCompleted: true, completedAt: s.completedAt || now })),
    completedSteps: task.steps.map(s => s.id),
    status: 'completed',
    progressPercentage: 100,
    startedAt: task.startedAt || now,
    completedAt: now,
  };
};

/** The patch that puts a finished task back on the to-do list. */
const reopenPatch = (task: JobTask): Partial<JobTask> => ({
  ...(task.steps.length > 0
    ? { steps: task.steps.map(s => ({ ...s, isCompleted: false, completedAt: undefined })) }
    : {}),
  completedSteps: [],
  status: 'pending',
  progressPercentage: 0,
  completedAt: undefined,
});

/** The patch for ticking or unticking one step. */
const stepTogglePatch = (task: JobTask, stepId: string): Partial<JobTask> | null => {
  if (!task.steps.some(s => s.id === stepId)) return null;
  const wasDone = task.completedSteps.includes(stepId);
  const now = new Date().toISOString();
  const steps = task.steps.map(s =>
    s.id === stepId ? { ...s, isCompleted: !wasDone, completedAt: wasDone ? undefined : now } : s
  );
  const completedSteps = wasDone
    ? task.completedSteps.filter(id => id !== stepId)
    : [...task.completedSteps.filter(id => id !== TASK_COMPLETE_MARKER), stepId];
  const doneCount = completedSteps.filter(id => task.steps.some(s => s.id === id)).length;
  const status: JobTask['status'] =
    doneCount === 0 ? 'pending' : doneCount === task.steps.length ? 'completed' : 'in-progress';
  return {
    steps,
    completedSteps,
    status,
    progressPercentage: Math.round((doneCount / task.steps.length) * 100),
    startedAt: task.startedAt || now,
    ...(status === 'completed' ? { completedAt: now } : {}),
  };
};

const formatDay = (iso: string, long = false) => {
  const todayStr = studioToday();
  if (iso === todayStr) return 'Today';
  if (iso === shiftIsoDays(todayStr, 1)) return 'Tomorrow';
  if (iso === shiftIsoDays(todayStr, -1)) return 'Yesterday';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    weekday: long ? 'long' : undefined,
    month: long ? 'long' : 'short',
    day: 'numeric',
  });
};

const formatTime = (hhmm?: string) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${suffix}`;
};

const MyTasksPage: React.FC = () => {
  const { jobTasks, updateJobTask } = useTask();
  const { currentUser } = useAuth();
  const { sops } = useSOPs();
  const { error: showError } = useToast();
  const location = useLocation();
  const { isMobileOrTablet } = useResponsive();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');

  /**
   * Saves land in TaskContext only once the server has answered, so a tick
   * would otherwise sit unticked for the length of a round trip — exactly
   * long enough for someone to tick it again. Each save is shown here
   * straight away and dropped once the context has caught up (or failed).
   */
  const [patches, setPatches] = useState<Record<string, Partial<JobTask>>>({});
  const patchVersion = useRef<Record<string, number>>({});
  const savingIds = useRef<Set<string>>(new Set());
  const [saving, setSaving] = useState<string[]>([]);

  const withPatch = useCallback(
    (task: JobTask): JobTask => (patches[task.id] ? { ...task, ...patches[task.id] } : task),
    [patches]
  );

  const saveTask = useCallback(async (task: JobTask, patch: Partial<JobTask>) => {
    const version = (patchVersion.current[task.id] || 0) + 1;
    patchVersion.current[task.id] = version;
    setPatches(prev => ({ ...prev, [task.id]: { ...prev[task.id], ...patch } }));
    try {
      await updateJobTask(task.id, patch);
    } catch (error) {
      console.error('Failed to save task change:', error);
      showError('Could not save the change. Check your connection and try again.');
    } finally {
      if (patchVersion.current[task.id] === version) {
        setPatches(prev => {
          const next = { ...prev };
          delete next[task.id];
          return next;
        });
      }
    }
  }, [updateJobTask, showError]);

  /** The checkbox on a row: finish the task, or put it back on the list. */
  const toggleDone = useCallback(async (task: JobTask) => {
    // A second tap can land before the re-render that disables the box.
    if (savingIds.current.has(task.id)) return;
    savingIds.current.add(task.id);
    setSaving(prev => [...prev, task.id]);
    try {
      await saveTask(task, isTaskDone(task) ? reopenPatch(task) : completePatch(task));
    } finally {
      savingIds.current.delete(task.id);
      setSaving(prev => prev.filter(id => id !== task.id));
    }
  }, [saveTask]);

  const toggleStep = useCallback((task: JobTask, stepId: string) => {
    const patch = stepTogglePatch(task, stepId);
    if (patch) saveTask(task, patch);
  }, [saveTask]);

  // Dashboard links arrive with a filter in navigation state.
  useEffect(() => {
    if (location.state) {
      const state = location.state as any;
      if (state.filterStatus) setFilterStatus(state.filterStatus);
      if (state.filterDate) setFilterDate(state.filterDate);
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const today = studioToday();
  const isTaskOverdue = (task: JobTask) =>
    task.status === 'overdue' || (task.scheduledDate < today && !isTaskDone(task));

  // Tasks assigned to me (never archived or draft), with any unsaved tick applied.
  const myTasks = jobTasks
    .filter(task =>
      currentUser &&
      task.assignedTo.includes(currentUser.id) &&
      task.status !== 'archived' &&
      task.status !== 'draft'
    )
    .map(withPatch);

  const filteredTasks = myTasks.filter(task => {
    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'overdue' ? isTaskOverdue(task) : task.status === filterStatus);
    if (!matchesStatus) return false;
    if (filterDate === 'today') return task.scheduledDate === today;
    if (filterDate === 'upcoming') return task.scheduledDate > today;
    if (filterDate === 'past') return task.scheduledDate < today;
    return true;
  });

  const byDate = (a: JobTask, b: JobTask) =>
    a.scheduledDate.localeCompare(b.scheduledDate) || (a.dueTime || '').localeCompare(b.dueTime || '');
  const toDo = filteredTasks.filter(t => !isTaskDone(t)).sort(byDate);
  // Most recently finished first, so the one you just ticked is right there.
  const done = filteredTasks.filter(isTaskDone).sort((a, b) => byDate(b, a));

  const todayTasksCount = myTasks.filter(t => t.scheduledDate === today && !isTaskDone(t)).length;

  const selectedTask = selectedTaskId ? myTasks.find(t => t.id === selectedTaskId) || null : null;
  const closeDetail = useCallback(() => setSelectedTaskId(null), []);

  const renderRows = (tasks: JobTask[]) => (
    <Card padding="none" style={{ overflow: 'hidden' }}>
      {tasks.map((task, i) => (
        <TaskRow
          key={task.id}
          task={task}
          first={i === 0}
          overdue={isTaskOverdue(task)}
          saving={saving.includes(task.id)}
          onToggle={() => toggleDone(task)}
          onOpen={() => setSelectedTaskId(task.id)}
        />
      ))}
    </Card>
  );

  return (
    <div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
      <div style={isMobileOrTablet ? styles.headerMobile : styles.header}>
        <h1 style={isMobileOrTablet ? styles.titleMobile : styles.title}>
          <svg
            width={isMobileOrTablet ? 24 : 32}
            height={isMobileOrTablet ? 24 : 32}
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: theme.colors.primary, marginRight: isMobileOrTablet ? 8 : 12, flexShrink: 0 }}
            aria-hidden="true"
          >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          My Tasks
        </h1>
        <p style={styles.subtitle}>
          {todayTasksCount > 0
            ? `You have ${todayTasksCount} task${todayTasksCount !== 1 ? 's' : ''} due today`
            : 'All caught up!'}
        </p>
      </div>

      <div style={styles.filters}>
        <div style={styles.filterItem}>
          <Select
            aria-label="Filter by date"
            size="sm"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            options={[
              { value: 'all', label: 'All dates' },
              { value: 'today', label: 'Today' },
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'past', label: 'Past' },
            ]}
          />
        </div>
        <div style={styles.filterItem}>
          <Select
            aria-label="Filter by status"
            size="sm"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'in-progress', label: 'In progress' },
              { value: 'completed', label: 'Completed' },
              { value: 'overdue', label: 'Overdue' },
            ]}
          />
        </div>
      </div>

      {toDo.length === 0 && done.length === 0 ? (
        <div style={styles.emptyState}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" style={{ stroke: theme.colors.txt.tertiary }} strokeWidth="1.5" aria-hidden="true">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <p style={styles.emptyText}>No tasks found</p>
          <p style={styles.emptySubtext}>You're all set!</p>
        </div>
      ) : (
        <>
          {toDo.length > 0 && (
            <section style={styles.group} aria-label="To do">
              <p style={styles.groupTitle}>To do · {toDo.length}</p>
              {renderRows(toDo)}
            </section>
          )}
          {done.length > 0 && (
            <section style={styles.group} aria-label="Done">
              <p style={styles.groupTitle}>Done · {done.length}</p>
              {renderRows(done)}
            </section>
          )}
        </>
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          sops={sops}
          overdue={isTaskOverdue(selectedTask)}
          saving={saving.includes(selectedTask.id)}
          onClose={closeDetail}
          onStepToggle={(stepId) => toggleStep(selectedTask, stepId)}
          onToggleDone={() => toggleDone(selectedTask)}
        />
      )}
    </div>
  );
};

// ─── One line of the checklist ────────────────────────────────────────────

interface TaskRowProps {
  task: JobTask;
  first: boolean;
  overdue: boolean;
  saving: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

const TaskRow: React.FC<TaskRowProps> = ({ task, first, overdue, saving, onToggle, onOpen }) => {
  const isDone = isTaskDone(task);
  const stepTotal = task.steps.length;
  const stepDone = task.completedSteps.filter(id => task.steps.some(s => s.id === id)).length;

  return (
    <div
      style={{
        ...styles.row,
        borderTop: first ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
      }}
    >
      <label style={styles.checkWrap}>
        <input
          type="checkbox"
          checked={isDone}
          disabled={saving}
          onChange={onToggle}
          aria-label={isDone ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
          style={styles.check}
        />
      </label>
      <button type="button" onClick={onOpen} style={styles.rowButton} aria-label={`Open ${task.title}`}>
        <span style={styles.rowText}>
          <span
            style={{
              ...styles.rowTitle,
              color: isDone ? theme.colors.txt.tertiary : theme.colors.txt.primary,
              textDecoration: isDone ? 'line-through' : 'none',
            }}
          >
            {task.title}
          </span>
          {!isDone && (overdue || (stepTotal > 0 && stepDone > 0)) && (
            <span style={styles.rowHints}>
              {overdue && <Badge variant="danger" size="sm">Overdue</Badge>}
              {stepTotal > 0 && stepDone > 0 && (
                <span style={styles.rowHint}>{stepDone} of {stepTotal} steps</span>
              )}
            </span>
          )}
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2" style={{ stroke: theme.colors.txt.tertiary, flexShrink: 0 }} aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
};

// ─── Detail modal ─────────────────────────────────────────────────────────

interface TaskDetailModalProps {
  task: JobTask;
  sops: any[];
  overdue: boolean;
  saving: boolean;
  onClose: () => void;
  onStepToggle: (stepId: string) => void;
  onToggleDone: () => void;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task, sops, overdue, saving, onClose, onStepToggle, onToggleDone,
}) => {
  const attachedSOPs = sops.filter(sop => task.sopIds.includes(sop.id));
  const isDone = isTaskDone(task);
  const totalSteps = task.steps.length;
  const completedCount = task.completedSteps.filter(id => task.steps.some(s => s.id === id)).length;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
  const description = task.description?.trim();

  // Only what the admin actually filled in.
  const details: { label: string; value: string }[] = [];
  if (task.scheduledDate) {
    details.push({
      label: 'Due',
      value: `${formatDay(task.scheduledDate, true)}${task.dueTime ? ` at ${formatTime(task.dueTime)}` : ''}`,
    });
  }
  if (task.priority && task.priority !== 'medium') {
    details.push({ label: 'Priority', value: task.priority[0].toUpperCase() + task.priority.slice(1) });
  }
  if (task.category && task.category !== 'General') {
    details.push({ label: 'Category', value: task.category });
  }
  if (task.estimatedDuration > 0) {
    details.push({ label: 'Takes about', value: `${task.estimatedDuration} min` });
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={task.title}
      size="lg"
      footer={
        <div style={styles.footer}>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button
            variant={isDone ? 'outline' : 'primary'}
            onClick={onToggleDone}
            disabled={saving}
            loading={saving}
          >
            {isDone ? 'Mark not done' : 'Mark done'}
          </Button>
        </div>
      }
    >
      {(isDone || overdue) && (
        <div style={{ marginBottom: theme.spacing.md }}>
          {isDone ? <Badge variant="success">Done</Badge> : <Badge variant="danger">Overdue</Badge>}
        </div>
      )}

      {description && <p style={styles.description}>{description}</p>}

      {details.length > 0 && (
        <dl style={styles.details}>
          {details.map(d => (
            <div key={d.label} style={styles.detail}>
              <dt style={styles.detailLabel}>{d.label}</dt>
              <dd style={styles.detailValue}>{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {totalSteps > 0 && (
        <div style={styles.section}>
          <div style={styles.progressHeader}>
            <h3 style={styles.sectionTitle}>Steps</h3>
            <span style={styles.progressText}>{completedCount} of {totalSteps} done</span>
          </div>
          <div
            style={styles.progressBar}
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Steps done"
          >
            <div style={{ ...styles.progressFill, width: `${progressPercent}%` }} />
          </div>
          <div style={styles.stepsList}>
            {task.steps.map((step, index) => {
              const stepDone = task.completedSteps.includes(step.id);
              return (
                <label key={step.id} style={styles.step}>
                  <input
                    type="checkbox"
                    checked={stepDone}
                    onChange={() => onStepToggle(step.id)}
                    style={styles.check}
                  />
                  <span style={styles.stepContent}>
                    <span
                      style={{
                        ...styles.stepTitle,
                        textDecoration: stepDone ? 'line-through' : 'none',
                        color: stepDone ? theme.colors.txt.tertiary : theme.colors.txt.primary,
                      }}
                    >
                      {index + 1}. {step.title}
                    </span>
                    {step.description && <span style={styles.stepDescription}>{step.description}</span>}
                    {step.requiresPhoto && (
                      <span style={styles.photoRequired}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        Photo required
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {attachedSOPs.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Reference SOPs</h3>
          <div style={styles.stepsList}>
            {attachedSOPs.map(sop => (
              <div key={sop.id} style={styles.sopItem}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }} aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span style={styles.sopTitle}>{sop.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!description && details.length <= 1 && totalSteps === 0 && attachedSOPs.length === 0 && (
        <p style={styles.noDetails}>No extra details for this one. Tap Mark done when it's finished.</p>
      )}
    </Modal>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: theme.pageLayout.containerPadding.desktop,
    maxWidth: '800px',
    margin: '0 auto',
  },
  containerMobile: {
    padding: theme.pageLayout.containerPadding.mobile,
    maxWidth: '100%',
    margin: '0 auto',
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  headerMobile: {
    marginBottom: theme.spacing.md,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.sm,
    display: 'flex',
    alignItems: 'center',
  },
  titleMobile: {
    ...theme.typography.h1Mobile,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.sm,
    display: 'flex',
    alignItems: 'center',
  },
  subtitle: {
    ...theme.typography.subtitle,
    color: theme.colors.txt.secondary,
    marginTop: theme.spacing.sm,
  },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  filterItem: {
    flex: '1 1 140px',
    minWidth: 0,
  },
  group: {
    marginBottom: theme.spacing.lg,
  },
  // A <p>, not a heading: index.css forces every h2 on a phone to 22px
  // display type, and this is a quiet group label.
  groupTitle: {
    fontFamily: theme.fonts.mono,
    fontWeight: 600,
    fontSize: '12px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: theme.colors.txt.tertiary,
    margin: `0 0 ${theme.spacing.sm} ${theme.spacing.xs}`,
  },
  row: {
    display: 'flex',
    alignItems: 'stretch',
    minHeight: '56px',
  },
  checkWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '52px',
    flexShrink: 0,
    cursor: 'pointer',
  },
  check: {
    width: '22px',
    height: '22px',
    minWidth: '22px',
    margin: 0,
    cursor: 'pointer',
    accentColor: theme.colors.primary,
    flexShrink: 0,
  },
  rowButton: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: `${theme.spacing.sm} ${theme.spacing.md} ${theme.spacing.sm} 0`,
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    color: 'inherit',
    font: 'inherit',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  rowTitle: {
    fontSize: '16px',
    fontWeight: 500,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
  },
  rowHints: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowHint: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
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
  footer: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    width: '100%',
  },
  description: {
    fontSize: '15px',
    color: theme.colors.txt.secondary,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    margin: `0 0 ${theme.spacing.lg}`,
  },
  details: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))',
    gap: theme.spacing.md,
    margin: `0 0 ${theme.spacing.lg}`,
  },
  detail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  detailLabel: {
    fontFamily: theme.fonts.mono,
    fontSize: '11px',
    fontWeight: 600,
    color: theme.colors.txt.tertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  detailValue: {
    margin: 0,
    fontSize: '14px',
    color: theme.colors.txt.primary,
    overflowWrap: 'anywhere',
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontFamily: theme.fonts.primary,
    fontStyle: 'normal',
    textTransform: 'none',
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    margin: 0,
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  progressText: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    transition: 'width 0.3s ease',
  },
  stepsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  step: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
    cursor: 'pointer',
  },
  stepContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    minWidth: 0,
  },
  stepTitle: {
    fontSize: '15px',
    fontWeight: 500,
    overflowWrap: 'anywhere',
  },
  stepDescription: {
    fontSize: '14px',
    color: theme.colors.txt.secondary,
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
  },
  photoRequired: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    fontSize: '12px',
    color: theme.colors.status.info,
    fontWeight: 500,
  },
  sopItem: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
    color: theme.colors.txt.secondary,
  },
  sopTitle: {
    fontSize: '14px',
    color: theme.colors.txt.primary,
    fontWeight: 500,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  noDetails: {
    fontSize: '14px',
    color: theme.colors.txt.tertiary,
    margin: 0,
  },
};

export default MyTasksPage;
