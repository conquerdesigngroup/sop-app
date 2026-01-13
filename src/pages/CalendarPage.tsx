import React, { useState } from 'react';
import { theme } from '../theme';
import { useEvent } from '../contexts/EventContext';
import { useTask } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import { CalendarEvent, JobTask, User } from '../types';
import EventFormModal from '../components/EventFormModal';
import EventDetailModal from '../components/EventDetailModal';
import CalendarTaskModal from '../components/CalendarTaskModal';

const CalendarPage: React.FC = () => {
  const { events, addEvent, updateEvent, deleteEvent } = useEvent();
  const { jobTasks } = useTask();
  const { users } = useAuth();
  const { isMobileOrTablet } = useResponsive();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

  // Modal states
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedTask, setSelectedTask] = useState<JobTask | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calendar calculations
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Get events for a specific date
  const getEventsForDate = (day: number) => {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    const dateStr = date.toISOString().split('T')[0];

    return events.filter(event => {
      const eventStartDate = new Date(event.startDate);
      eventStartDate.setHours(0, 0, 0, 0);
      const eventEndDate = event.endDate ? new Date(event.endDate) : eventStartDate;
      eventEndDate.setHours(0, 0, 0, 0);
      return date >= eventStartDate && date <= eventEndDate;
    });
  };

  // Get tasks for a specific date
  const getTasksForDate = (day: number) => {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);

    return jobTasks.filter(task => {
      if (task.status === 'archived' || task.status === 'draft') return false;
      const taskDate = new Date(task.scheduledDate);
      taskDate.setHours(0, 0, 0, 0);
      return taskDate.getTime() === date.getTime();
    });
  };

  // Get status color for tasks
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return theme.colors.status.completed;
      case 'in-progress': return theme.colors.status.inProgress;
      case 'overdue': return theme.colors.status.overdue;
      case 'pending': return theme.colors.status.pending;
      default: return theme.colors.textMuted;
    }
  };

  // Navigation
  const previousMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentMonth(new Date());

  // Event handlers
  const handleAddEvent = () => {
    setEditingEvent(null);
    setSelectedDate(undefined);
    setShowEventForm(true);
  };

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setEditingEvent(null);
    setShowEventForm(true);
  };

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEvent(event);
  };

  const handleTaskClick = (task: JobTask, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTask(task);
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setSelectedEvent(null);
    setEditingEvent(event);
    setShowEventForm(true);
  };

  const handleSaveEvent = async (eventData: Omit<CalendarEvent, 'id' | 'createdAt' | 'createdBy'>) => {
    if (editingEvent) {
      await updateEvent(editingEvent.id, eventData);
    } else {
      await addEvent(eventData);
    }
    setShowEventForm(false);
    setEditingEvent(null);
  };

  const handleDeleteEvent = async (eventId: string) => {
    await deleteEvent(eventId);
    setSelectedEvent(null);
  };

  // Calculate week view dates
  const getWeekDates = () => {
    const startOfWeek = new Date(currentMonth);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day);

    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const weekDates = getWeekDates();

  return (
    <div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
      {/* Header */}
      <div style={isMobileOrTablet ? styles.headerMobile : styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={isMobileOrTablet ? styles.titleMobile : styles.title}>Calendar</h1>
          <p style={styles.subtitle}>Manage events and view scheduled tasks</p>
        </div>
        <button onClick={handleAddEvent} style={styles.addButton}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Event
        </button>
      </div>

      {/* Calendar Controls */}
      <div style={styles.controls}>
        <div style={styles.navControls}>
          <button onClick={previousMonth} style={styles.navButton}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button onClick={goToToday} style={styles.todayButton}>
            Today
          </button>
          <button onClick={nextMonth} style={styles.navButton}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        <h2 style={styles.monthTitle}>{monthNames[month]} {year}</h2>

        <div style={styles.viewToggle}>
          <button
            onClick={() => setViewMode('month')}
            style={viewMode === 'month' ? styles.viewButtonActive : styles.viewButton}
          >
            Month
          </button>
          <button
            onClick={() => setViewMode('week')}
            style={viewMode === 'week' ? styles.viewButtonActive : styles.viewButton}
          >
            Week
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div style={styles.calendarWrapper}>
        {viewMode === 'month' ? (
          <div style={styles.calendar}>
            {/* Day headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} style={styles.dayHeader}>{day}</div>
            ))}

            {/* Empty cells before first day */}
            {Array.from({ length: startingDayOfWeek }).map((_, index) => (
              <div key={`empty-${index}`} style={styles.calendarDayEmpty} />
            ))}

            {/* Days of month */}
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const eventsForDay = getEventsForDate(day);
              const tasksForDay = getTasksForDate(day);
              const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
              const totalItems = eventsForDay.length + tasksForDay.length;
              const maxVisible = isMobileOrTablet ? 2 : 3;

              return (
                <div
                  key={day}
                  style={{
                    ...styles.calendarDay,
                    ...(isToday ? styles.calendarDayToday : {}),
                  }}
                  onClick={() => handleDayClick(day)}
                >
                  <div style={{
                    ...styles.dayNumber,
                    ...(isToday ? styles.dayNumberToday : {}),
                  }}>
                    {day}
                  </div>

                  <div style={styles.itemsList}>
                    {/* Events first (blue) */}
                    {eventsForDay.slice(0, maxVisible).map(event => (
                      <div
                        key={event.id}
                        style={{
                          ...styles.eventItem,
                          backgroundColor: event.color,
                        }}
                        onClick={(e) => handleEventClick(event, e)}
                        title={event.title}
                      >
                        <span style={styles.itemTitle}>{event.title}</span>
                      </div>
                    ))}

                    {/* Tasks (status colored) */}
                    {tasksForDay.slice(0, Math.max(0, maxVisible - eventsForDay.length)).map(task => (
                      <div
                        key={task.id}
                        style={{
                          ...styles.taskItem,
                          borderLeftColor: getStatusColor(task.status),
                        }}
                        onClick={(e) => handleTaskClick(task, e)}
                        title={task.title}
                      >
                        <span style={styles.itemTitle}>{task.title}</span>
                      </div>
                    ))}

                    {/* More indicator */}
                    {totalItems > maxVisible && (
                      <div style={styles.moreIndicator}>
                        +{totalItems - maxVisible} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Week View */
          <div style={styles.weekView}>
            {/* Day headers for week view */}
            {weekDates.map((date, index) => {
              const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              const isToday = date.toDateString() === today.toDateString();

              return (
                <div key={index} style={styles.weekDay}>
                  <div style={{
                    ...styles.weekDayHeader,
                    ...(isToday ? styles.weekDayHeaderToday : {}),
                  }}>
                    <span style={styles.weekDayName}>{dayNames[date.getDay()]}</span>
                    <span style={{
                      ...styles.weekDayNumber,
                      ...(isToday ? styles.weekDayNumberToday : {}),
                    }}>
                      {date.getDate()}
                    </span>
                  </div>

                  <div
                    style={styles.weekDayContent}
                    onClick={() => {
                      const dateStr = date.toISOString().split('T')[0];
                      setSelectedDate(dateStr);
                      setEditingEvent(null);
                      setShowEventForm(true);
                    }}
                  >
                    {/* Events */}
                    {events.filter(event => {
                      const eventStart = new Date(event.startDate);
                      const eventEnd = event.endDate ? new Date(event.endDate) : eventStart;
                      eventStart.setHours(0, 0, 0, 0);
                      eventEnd.setHours(0, 0, 0, 0);
                      const checkDate = new Date(date);
                      checkDate.setHours(0, 0, 0, 0);
                      return checkDate >= eventStart && checkDate <= eventEnd;
                    }).map(event => (
                      <div
                        key={event.id}
                        style={{
                          ...styles.weekEventItem,
                          backgroundColor: event.color,
                        }}
                        onClick={(e) => handleEventClick(event, e)}
                      >
                        {!event.isAllDay && event.startTime && (
                          <span style={styles.weekEventTime}>{event.startTime}</span>
                        )}
                        <span style={styles.weekEventTitle}>{event.title}</span>
                      </div>
                    ))}

                    {/* Tasks */}
                    {jobTasks.filter(task => {
                      if (task.status === 'archived' || task.status === 'draft') return false;
                      const taskDate = new Date(task.scheduledDate);
                      return taskDate.toDateString() === date.toDateString();
                    }).map(task => (
                      <div
                        key={task.id}
                        style={{
                          ...styles.weekTaskItem,
                          borderLeftColor: getStatusColor(task.status),
                        }}
                        onClick={(e) => handleTaskClick(task, e)}
                      >
                        {task.dueTime && (
                          <span style={styles.weekTaskTime}>{task.dueTime}</span>
                        )}
                        <span style={styles.weekTaskTitle}>{task.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendColor, backgroundColor: '#3B82F6' }} />
          <span style={styles.legendText}>Events</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendColor, backgroundColor: theme.colors.status.pending }} />
          <span style={styles.legendText}>Pending Tasks</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendColor, backgroundColor: theme.colors.status.inProgress }} />
          <span style={styles.legendText}>In Progress</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendColor, backgroundColor: theme.colors.status.completed }} />
          <span style={styles.legendText}>Completed</span>
        </div>
      </div>

      {/* Modals */}
      <EventFormModal
        isOpen={showEventForm}
        onClose={() => {
          setShowEventForm(false);
          setEditingEvent(null);
          setSelectedDate(undefined);
        }}
        onSave={handleSaveEvent}
        editingEvent={editingEvent}
        users={users}
        initialDate={selectedDate}
      />

      <EventDetailModal
        isOpen={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
        event={selectedEvent}
        users={users}
        onEdit={handleEditEvent}
        onDelete={handleDeleteEvent}
      />

      <CalendarTaskModal
        isOpen={selectedTask !== null}
        onClose={() => setSelectedTask(null)}
        task={selectedTask}
        users={users}
      />
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: theme.responsiveSpacing.containerPadding.desktop,
    maxWidth: '1400px',
    margin: '0 auto',
  },
  containerMobile: {
    padding: theme.responsiveSpacing.containerPadding.mobile,
    maxWidth: '100%',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  headerMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  headerLeft: {},
  title: {
    ...theme.typography.h1,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  titleMobile: {
    ...theme.typography.h1Mobile,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    ...theme.typography.subtitle,
    color: theme.colors.textSecondary,
  },
  addButton: {
    ...theme.components.button.base,
    ...theme.components.button.sizes.md,
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  controls: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  navControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  navButton: {
    padding: '10px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.txt.primary,
    transition: 'all 0.2s',
  },
  todayButton: {
    padding: '10px 16px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    transition: 'all 0.2s',
  },
  monthTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  viewToggle: {
    display: 'flex',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  viewButton: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  viewButtonActive: {
    padding: '10px 20px',
    backgroundColor: theme.colors.primary,
    border: 'none',
    fontSize: '14px',
    fontWeight: 600,
    color: '#FFFFFF',
    cursor: 'pointer',
  },
  calendarWrapper: {
    backgroundColor: theme.colors.backgroundLight,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
  },
  calendar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
  },
  dayHeader: {
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: 700,
    color: theme.colors.txt.secondary,
    padding: '16px 8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    backgroundColor: theme.colors.bg.tertiary,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  calendarDay: {
    minHeight: '120px',
    padding: '8px',
    backgroundColor: theme.colors.bg.secondary,
    borderRight: `1px solid ${theme.colors.bdr.primary}`,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  calendarDayEmpty: {
    minHeight: '120px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRight: `1px solid ${theme.colors.bdr.primary}`,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  calendarDayToday: {
    backgroundColor: theme.colors.bg.primary,
  },
  dayNumber: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    marginBottom: '8px',
  },
  dayNumberToday: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    borderRadius: '50%',
  },
  itemsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  eventItem: {
    padding: '4px 8px',
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    overflow: 'hidden',
  },
  taskItem: {
    padding: '4px 8px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.sm,
    borderLeft: '3px solid',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    overflow: 'hidden',
  },
  itemTitle: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#FFFFFF',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
  },
  moreIndicator: {
    fontSize: '10px',
    color: theme.colors.txt.secondary,
    fontWeight: 600,
    padding: '2px 8px',
  },
  weekView: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    minHeight: '500px',
  },
  weekDay: {
    borderRight: `1px solid ${theme.colors.bdr.primary}`,
    display: 'flex',
    flexDirection: 'column',
  },
  weekDayHeader: {
    padding: '16px 8px',
    textAlign: 'center',
    backgroundColor: theme.colors.bg.tertiary,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  weekDayHeaderToday: {
    backgroundColor: theme.colors.primary,
  },
  weekDayName: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  weekDayNumber: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    fontSize: '18px',
    fontWeight: 700,
    color: theme.colors.txt.primary,
    borderRadius: '50%',
  },
  weekDayNumberToday: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: '#FFFFFF',
  },
  weekDayContent: {
    flex: 1,
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    cursor: 'pointer',
    backgroundColor: theme.colors.bg.secondary,
  },
  weekEventItem: {
    padding: '8px 10px',
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
  },
  weekEventTime: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.8)',
    display: 'block',
    marginBottom: '2px',
  },
  weekEventTitle: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#FFFFFF',
    display: 'block',
  },
  weekTaskItem: {
    padding: '8px 10px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.sm,
    borderLeft: '3px solid',
    cursor: 'pointer',
  },
  weekTaskTime: {
    fontSize: '10px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    display: 'block',
    marginBottom: '2px',
  },
  weekTaskTitle: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
    display: 'block',
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
    padding: '16px 20px',
    backgroundColor: theme.colors.backgroundLight,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  legendColor: {
    width: '12px',
    height: '12px',
    borderRadius: '3px',
  },
  legendText: {
    fontSize: '13px',
    color: theme.colors.textSecondary,
    fontWeight: 500,
  },
};

export default CalendarPage;
