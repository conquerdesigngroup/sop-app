import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTask, TASK_COMPLETE_MARKER } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { JobTask } from '../types';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { studioToday, shiftIsoDays } from '../lib/studioDate';
import { Badge, Button, Card } from '../components/ui';
import CalendarTaskModal from '../components/CalendarTaskModal';
import { WEEKDAY_SHORT, weekdayOf, occurrenceDates, occurrenceId, seriesState } from '../lib/recurrence';

/**
 * My Tasks — a team member's own checklist, one day at a time.
 *
 * It opens on today: the tasks scheduled for today in time order, each with
 * a line saying what it is for, plus anything overdue from earlier days. A
 * week strip moves to other days to see what is coming. Repeating tasks show
 * on every day their rule lands on.
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

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

/** Monday of the week `iso` falls in. */
const mondayOf = (iso: string) => shiftIsoDays(iso, -((weekdayOf(iso) + 6) % 7));

/** "HH:MM" sorts as text; untimed tasks go after the timed ones. */
const byTime = (a: JobTask, b: JobTask) =>
  (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99') || a.title.localeCompare(b.title);

/** First line of the description, for the row's "what it's for" line. */
const purposeOf = (task: JobTask) => (task.description || '').trim().split('\n')[0];

const MyTasksPage: React.FC = () => {
  const { jobTasks, recurringSeries = [], updateJobTask } = useTask();
  const { currentUser, users = [] } = useAuth();
  const { error: showError } = useToast();
  const location = useLocation();
  const { isMobileOrTablet } = useResponsive();
  const today = studioToday();
  const [selectedDay, setSelectedDay] = useState<string>(today);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

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


  // Dashboard links arrive with a date in navigation state.
  useEffect(() => {
    if (location.state) {
      const state = location.state as any;
      if (state.filterDate === 'upcoming') setSelectedDay(shiftIsoDays(today, 1));
      window.history.replaceState({}, document.title);
    }
  }, [location, today]);

  const isTaskOverdue = (task: JobTask) =>
    !isTaskDone(task) && (task.status === 'overdue' || task.scheduledDate < today);

  // Tasks assigned to me (never archived or draft), with any unsaved tick applied.
  const myTasks = useMemo(() => jobTasks
    .filter(task =>
      currentUser &&
      task.assignedTo.includes(currentUser.id) &&
      task.status !== 'archived' &&
      task.status !== 'draft'
    )
    .map(withPatch), [jobTasks, currentUser, withPatch]);

  /**
   * Repeating tasks on days that have no task yet.
   *
   * A manager's device creates each day's copy of a repeating task a week
   * ahead (src/lib/recurrence.ts). Further out than that — or before anyone
   * has opened the app — the day would look empty, so the days the rule
   * lands on are filled in here, read-only, until the real task exists.
   * A day that was generated and then deleted on purpose stays empty.
   */
  const myTaskIds = useMemo(() => new Set(jobTasks.map(t => t.id)), [jobTasks]);
  const projectedFor = useCallback((day: string): JobTask[] => {
    if (!currentUser || day < today) return [];
    return recurringSeries
      .filter(series => series.assignedTo.includes(currentUser.id) && series.recurrencePattern)
      .filter(series => {
        const p = series.recurrencePattern!;
        const state = seriesState(p, series.status, series.scheduledDate, today);
        if (state !== 'active' && state !== 'upcoming') return false;
        if (p.generatedThrough && day <= p.generatedThrough) return false;
        if (myTaskIds.has(occurrenceId(series.id, day))) return false;
        return occurrenceDates(p, series.scheduledDate, day, day).length > 0;
      })
      .map(series => ({
        ...series,
        id: occurrenceId(series.id, day),
        isRecurring: false,
        recurrencePattern: undefined,
        seriesId: series.id,
        scheduledDate: day,
        status: 'pending' as const,
        steps: (series.steps || []).map(s => ({ ...s, isCompleted: false, completedAt: undefined })),
        completedSteps: [],
        progressPercentage: 0,
        startedAt: undefined,
        completedAt: undefined,
        files: [],
      }));
  }, [recurringSeries, currentUser, today, myTaskIds]);

  const tasksOn = useCallback(
    (day: string) => [...myTasks.filter(t => t.scheduledDate === day), ...projectedFor(day)],
    [myTasks, projectedFor]
  );

  const dayTasks = tasksOn(selectedDay);
  const toDo = dayTasks.filter(t => !isTaskDone(t)).sort(byTime);
  const done = dayTasks.filter(isTaskDone).sort(byTime);
  // Left over from earlier days: shown on today so nothing quietly disappears.
  const overdue = selectedDay === today
    ? myTasks.filter(t => t.scheduledDate < today && !isTaskDone(t))
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || byTime(a, b))
    : [];

  const projectedIds = new Set(projectedFor(selectedDay).map(t => t.id));
  const allShown = [...overdue, ...dayTasks];
  const selectedTask = selectedTaskId ? allShown.find(t => t.id === selectedTaskId) || null : null;
  const closeDetail = useCallback(() => setSelectedTaskId(null), []);

  const weekStart = mondayOf(selectedDay);
  const week = Array.from({ length: 7 }, (_, i) => shiftIsoDays(weekStart, i));
  const isToday = selectedDay === today;

  const dayHeading = isToday
    ? 'Today'
    : selectedDay === shiftIsoDays(today, 1)
      ? 'Tomorrow'
      : selectedDay === shiftIsoDays(today, -1) ? 'Yesterday' : WEEKDAY_LONG[weekdayOf(selectedDay)];
  const dayDate = new Date(`${selectedDay}T00:00:00`)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  const summary = toDo.length === 0
    ? (dayTasks.length === 0 ? 'Nothing scheduled.' : 'All done for this day.')
    : `${toDo.length} to do${done.length ? `, ${done.length} done` : ''}`;

  const renderRows = (tasks: JobTask[], showDate = false) => (
    <Card padding="none" style={{ overflow: 'hidden' }}>
      {tasks.map((task, i) => (
        <TaskRow
          key={task.id}
          task={task}
          first={i === 0}
          overdue={isTaskOverdue(task)}
          showDate={showDate}
          projected={projectedIds.has(task.id)}
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
      </div>

      {/* Day picker: a week at a time, today by default. A group, not a <nav>:
          index.css strips the background off every button inside a nav. */}
      <div style={styles.dayNav} role="group" aria-label="Choose a day">
        <div style={styles.weekRow}>
          <button
            type="button"
            style={styles.weekArrow}
            onClick={() => setSelectedDay(shiftIsoDays(selectedDay, -7))}
            aria-label="Previous week"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div style={styles.weekDays}>
            {week.map(day => {
              const count = tasksOn(day).filter(t => !isTaskDone(t)).length;
              const selected = day === selectedDay;
              const label = new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  aria-pressed={selected}
                  aria-label={`${label}${day === today ? ' (today)' : ''}, ${count} to do`}
                  style={{
                    ...styles.dayPill,
                    ...(selected ? styles.dayPillSelected : {}),
                    ...(day === today && !selected ? styles.dayPillToday : {}),
                  }}
                >
                  <span style={styles.dayPillWeekday}>{WEEKDAY_SHORT[weekdayOf(day)].slice(0, 1)}</span>
                  <span style={styles.dayPillNumber}>{Number(day.slice(8, 10))}</span>
                  <span
                    style={{
                      ...styles.dayPillDot,
                      visibility: count > 0 ? 'visible' : 'hidden',
                      backgroundColor: selected ? '#FFFFFF' : theme.colors.primary,
                    }}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            style={styles.weekArrow}
            onClick={() => setSelectedDay(shiftIsoDays(selectedDay, 7))}
            aria-label="Next week"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>

      <div style={styles.dayHeader}>
        <div style={{ minWidth: 0 }}>
          <p style={styles.dayTitle}>{dayHeading} <span style={styles.dayDate}>· {dayDate}</span></p>
          <p style={styles.subtitle} role="status" aria-live="polite">{summary}</p>
        </div>
        {!isToday && (
          <Button variant="outline" size="sm" onClick={() => setSelectedDay(today)}>Back to today</Button>
        )}
      </div>

      {overdue.length > 0 && (
        <section style={styles.group} aria-label="Overdue">
          <p style={{ ...styles.groupTitle, color: theme.colors.status.error }}>Overdue · {overdue.length}</p>
          {renderRows(overdue, true)}
        </section>
      )}

      {dayTasks.length === 0 ? (
        <div style={styles.emptyState}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ stroke: theme.colors.txt.tertiary }} strokeWidth="1.5" aria-hidden="true">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <p style={styles.emptyText}>No tasks {isToday ? 'today' : 'on this day'}</p>
          <p style={styles.emptySubtext}>Use the days above to see what's coming up.</p>
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

      {/* The same full view managers get on Job Tasks: every field that was
          filled in (and none that weren't), steps, files, team discussion,
          add to calendar — plus Mark done. */}
      {selectedTask && (
        <CalendarTaskModal
          isOpen
          task={selectedTask}
          users={users}
          onClose={closeDetail}
          onToggleDone={() => toggleDone(selectedTask)}
          doneSaving={saving.includes(selectedTask.id)}
          readOnly={projectedIds.has(selectedTask.id)}
          notice={projectedIds.has(selectedTask.id)
            ? 'This repeating task gets added to your list closer to the day. You can tick it off then.'
            : undefined}
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
  /** Overdue rows come from other days, so they say which. */
  showDate: boolean;
  /** A repeating task's day that has not been created yet: read-only. */
  projected: boolean;
  saving: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

const TaskRow: React.FC<TaskRowProps> = ({ task, first, overdue, showDate, projected, saving, onToggle, onOpen }) => {
  const isDone = isTaskDone(task);
  const stepTotal = task.steps.length;
  const stepDone = task.completedSteps.filter(id => task.steps.some(s => s.id === id)).length;
  const purpose = purposeOf(task);
  const when = [showDate ? formatDay(task.scheduledDate) : '', task.dueTime ? formatTime(task.dueTime) : '']
    .filter(Boolean).join(' · ');
  const repeats = Boolean(task.seriesId);

  return (
    <div
      style={{
        ...styles.row,
        borderTop: first ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
      }}
    >
      <label style={{ ...styles.checkWrap, cursor: projected ? 'default' : 'pointer' }}>
        <input
          type="checkbox"
          checked={isDone}
          disabled={saving || projected}
          onChange={onToggle}
          aria-label={isDone ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
          style={{ ...styles.check, opacity: projected ? 0.4 : 1 }}
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
          {purpose && !isDone && <span style={styles.rowPurpose}>{purpose}</span>}
          {(when || repeats || (!isDone && (overdue || (stepTotal > 0 && stepDone > 0)))) && (
            <span style={styles.rowHints}>
              {when && <span style={styles.rowTime}>{when}</span>}
              {repeats && (
                <span style={styles.rowHint}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ marginRight: 3, verticalAlign: '-1px' }}>
                    <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                  Repeats
                </span>
              )}
              {!isDone && overdue && <Badge variant="danger" size="sm">Overdue</Badge>}
              {!isDone && stepTotal > 0 && stepDone > 0 && (
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
    fontSize: '14px',
    color: theme.colors.txt.secondary,
    margin: `${theme.spacing.xs} 0 0`,
  },
  dayNav: {
    marginBottom: theme.spacing.md,
  },
  weekRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  weekArrow: {
    flexShrink: 0,
    width: '32px',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.secondary,
    cursor: 'pointer',
    padding: 0,
  },
  weekDays: {
    flex: 1,
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gap: '4px',
  },
  dayPill: {
    minWidth: 0,
    height: '56px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    padding: 0,
    background: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    cursor: 'pointer',
    fontFamily: theme.fonts.primary,
  },
  dayPillSelected: {
    background: theme.colors.primary,
    borderColor: theme.colors.primary,
    color: '#FFFFFF',
  },
  dayPillToday: {
    borderColor: theme.colors.primary,
  },
  dayPillWeekday: {
    fontSize: '11px',
    fontWeight: 600,
    opacity: 0.75,
    lineHeight: 1,
  },
  dayPillNumber: {
    fontSize: '16px',
    fontWeight: 700,
    lineHeight: 1.1,
  },
  dayPillDot: {
    width: '5px',
    height: '5px',
    borderRadius: theme.borderRadius.full,
  },
  dayHeader: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  dayTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: theme.colors.txt.primary,
    margin: 0,
  },
  dayDate: {
    fontWeight: 400,
    color: theme.colors.txt.secondary,
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
  rowPurpose: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowTime: {
    fontFamily: theme.fonts.mono,
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
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
};

export default MyTasksPage;
