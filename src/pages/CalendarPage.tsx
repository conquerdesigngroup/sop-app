import React, { useState, useMemo, useRef, useEffect } from 'react';
import { theme } from '../theme';
import { useEvent } from '../contexts/EventContext';
import { useTask } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import { CalendarEvent, JobTask } from '../types';
import EventFormModal from '../components/EventFormModal';
import EventDetailModal from '../components/EventDetailModal';
import CalendarTaskModal from '../components/CalendarTaskModal';

const CalendarPage: React.FC = () => {
  const { events, addEvent, updateEvent, deleteEvent, tags } = useEvent();
  const { jobTasks } = useTask();
  const { users, currentUser, isAdmin } = useAuth();
  const { isMobileOrTablet } = useResponsive();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

  // Modal states
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedTask, setSelectedTask] = useState<JobTask | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);

  // Quick Add states
  const [quickAddDay, setQuickAddDay] = useState<number | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterColor, setFilterColor] = useState<string | ''>('');
  const [filterAttendee, setFilterAttendee] = useState<string | ''>('');
  const [filterTag, setFilterTag] = useState<string | ''>('');

  // Drag and drop states
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);

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

  // Filter events based on search and filters
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Search filter
      if (searchQuery && !event.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Color filter
      if (filterColor && event.color !== filterColor) {
        return false;
      }
      // Attendee filter
      if (filterAttendee && !event.attendees.includes(filterAttendee)) {
        return false;
      }
      // Tag filter
      if (filterTag && (!event.tags || !event.tags.includes(filterTag))) {
        return false;
      }
      return true;
    });
  }, [events, searchQuery, filterColor, filterAttendee, filterTag]);

  // Get today's events and tasks for the agenda sidebar
  const todaysItems = useMemo(() => {
    const todaysEvents = events.filter(event => {
      const eventStart = new Date(event.startDate);
      eventStart.setHours(0, 0, 0, 0);
      const eventEnd = event.endDate ? new Date(event.endDate) : eventStart;
      eventEnd.setHours(0, 0, 0, 0);
      return today >= eventStart && today <= eventEnd;
    }).sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });

    const todaysTasks = jobTasks.filter(task => {
      if (task.status === 'archived' || task.status === 'draft') return false;
      const taskDate = new Date(task.scheduledDate);
      taskDate.setHours(0, 0, 0, 0);
      return taskDate.getTime() === today.getTime();
    }).sort((a, b) => {
      return (a.dueTime || '').localeCompare(b.dueTime || '');
    });

    return { events: todaysEvents, tasks: todaysTasks };
  }, [events, jobTasks, today]);

  // Focus quick add input when opened
  useEffect(() => {
    if (quickAddDay !== null && quickAddInputRef.current) {
      quickAddInputRef.current.focus();
    }
  }, [quickAddDay]);

  // Get events for a specific date (uses filtered events)
  const getEventsForDate = (day: number) => {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);

    return filteredEvents.filter(event => {
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

  // Quick Add handlers
  const handleQuickAddClick = (day: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setQuickAddDay(day);
    setQuickAddTitle('');
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddTitle.trim() || quickAddDay === null) return;

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(quickAddDay).padStart(2, '0')}`;
    await addEvent({
      title: quickAddTitle.trim(),
      description: '',
      startDate: dateStr,
      isAllDay: true,
      color: '#3B82F6',
      attendees: [],
      isRecurring: false,
    });

    setQuickAddDay(null);
    setQuickAddTitle('');
  };

  const handleQuickAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setQuickAddDay(null);
      setQuickAddTitle('');
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, event: CalendarEvent) => {
    e.dataTransfer.setData('text/plain', event.id);
    e.dataTransfer.setData('eventId', event.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.dropEffect = 'move';
    setDraggedEvent(event);
  };

  const handleDragEnd = () => {
    setDraggedEvent(null);
    setDragOverDay(null);
  };

  const handleDragOver = (e: React.DragEvent, day: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDay(day);
  };

  const handleDragLeave = () => {
    setDragOverDay(null);
  };

  const handleDrop = async (e: React.DragEvent, day: number) => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent duplicate processing - only process if we have a dragged event
    if (!draggedEvent) return;

    const eventId = e.dataTransfer.getData('eventId');
    const event = events.find(ev => ev.id === eventId);

    if (event && isAdmin) {
      // Create the new date using local timezone (year and month from currentMonth state)
      const newStartDate = new Date(year, month, day);
      const newDate = `${newStartDate.getFullYear()}-${String(newStartDate.getMonth() + 1).padStart(2, '0')}-${String(newStartDate.getDate()).padStart(2, '0')}`;

      // Calculate new end date
      let newEndDate: string | undefined;

      // Check if this is a multi-day event (endDate exists and is different from startDate)
      const isMultiDay = event.endDate && event.startDate !== event.endDate;

      if (isMultiDay) {
        // Parse dates using local timezone by splitting the string
        const [startYear, startMonth, startDay] = event.startDate.split('-').map(Number);
        const [endYear, endMonth, endDay] = event.endDate!.split('-').map(Number);

        const originalStart = new Date(startYear, startMonth - 1, startDay);
        const originalEnd = new Date(endYear, endMonth - 1, endDay);
        const daysDiff = Math.round((originalEnd.getTime() - originalStart.getTime()) / (1000 * 60 * 60 * 24));

        const newEnd = new Date(year, month, day + daysDiff);
        newEndDate = `${newEnd.getFullYear()}-${String(newEnd.getMonth() + 1).padStart(2, '0')}-${String(newEnd.getDate()).padStart(2, '0')}`;
      } else {
        // Single-day event: set endDate to same as startDate (or undefined if it wasn't set)
        newEndDate = event.endDate ? newDate : undefined;
      }

      // Clear drag state BEFORE updating to prevent re-processing
      setDraggedEvent(null);
      setDragOverDay(null);

      await updateEvent(eventId, {
        startDate: newDate,
        endDate: newEndDate,
      });
    } else {
      setDraggedEvent(null);
      setDragOverDay(null);
    }
  };

  // Mini calendar navigation - jump to specific date
  const handleMiniCalendarDayClick = (day: number, miniMonth: number, miniYear: number) => {
    setCurrentMonth(new Date(miniYear, miniMonth, day));
  };

  // Available event colors for filter (matches EventFormModal colors)
  const eventColors = [
    { value: '#3B82F6', label: 'Blue' },
    { value: '#10B981', label: 'Green' },
    { value: '#F59E0B', label: 'Orange' },
    { value: '#8B5CF6', label: 'Purple' },
    { value: '#EC4899', label: 'Pink' },
    { value: '#06B6D4', label: 'Cyan' },
  ];

  // Helper to get user initials
  const getUserInitials = (userId: string): string => {
    const user = users.find(u => u.id === userId);
    if (user) {
      return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
    }
    return '??';
  };

  // Get all assigned user initials for a task
  const getTaskInitials = (task: JobTask): string => {
    if (!task.assignedTo || task.assignedTo.length === 0) return '';
    if (task.assignedTo.length === 1) {
      return getUserInitials(task.assignedTo[0]);
    }
    // Multiple assignees - show first + count
    return `${getUserInitials(task.assignedTo[0])}+${task.assignedTo.length - 1}`;
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

  // Time slots for week view (6 AM to 10 PM)
  const timeSlots = Array.from({ length: 17 }, (_, i) => {
    const hour = i + 6; // Start at 6 AM
    return {
      hour,
      label: hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`,
    };
  });

  // Helper to get event position in time slots view
  const getEventPosition = (event: CalendarEvent) => {
    if (event.isAllDay || !event.startTime) return null;
    const [hours, mins] = event.startTime.split(':').map(Number);
    if (hours < 6 || hours >= 23) return null;
    const top = (hours - 6) * 60 + mins; // pixels from top (1px per minute)

    let duration = 60; // default 1 hour
    if (event.endTime) {
      const [endHours, endMins] = event.endTime.split(':').map(Number);
      duration = (endHours * 60 + endMins) - (hours * 60 + mins);
    }
    return { top, height: Math.max(duration, 20) }; // minimum 20px height
  };

  // Helper to get task position in time slots view
  const getTaskPosition = (task: JobTask) => {
    if (!task.dueTime) return null;
    const [hours, mins] = task.dueTime.split(':').map(Number);
    if (hours < 6 || hours >= 23) return null;
    const top = (hours - 6) * 60 + mins;
    return { top, height: Math.max(task.estimatedDuration || 30, 20) };
  };

  // Render mini calendar
  const renderMiniCalendar = (miniMonth: number, miniYear: number) => {
    const firstDay = new Date(miniYear, miniMonth, 1);
    const lastDay = new Date(miniYear, miniMonth + 1, 0);
    const daysCount = lastDay.getDate();
    const startDay = firstDay.getDay();
    const days = [];

    // Empty cells
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} style={styles.miniCalDayEmpty} />);
    }

    // Days
    for (let d = 1; d <= daysCount; d++) {
      const isToday = d === today.getDate() && miniMonth === today.getMonth() && miniYear === today.getFullYear();
      days.push(
        <div
          key={d}
          style={{
            ...styles.miniCalDay,
            ...(isToday ? styles.miniCalDayToday : {}),
          }}
          onClick={() => handleMiniCalendarDayClick(d, miniMonth, miniYear)}
        >
          {d}
        </div>
      );
    }

    return days;
  };

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

      {/* Search and Filter Bar */}
      <div style={styles.searchFilterBar}>
        <div style={styles.searchBox}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={styles.clearButton}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <select
          value={filterColor}
          onChange={(e) => setFilterColor(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Colors</option>
          {eventColors.map(color => (
            <option key={color.value} value={color.value}>{color.label}</option>
          ))}
        </select>

        <select
          value={filterAttendee}
          onChange={(e) => setFilterAttendee(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Attendees</option>
          {users.map(user => (
            <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
          ))}
        </select>

        {tags.length > 0 && (
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">All Tags</option>
            {tags.map(tag => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
        )}

        {(searchQuery || filterColor || filterAttendee || filterTag) && (
          <button
            onClick={() => {
              setSearchQuery('');
              setFilterColor('');
              setFilterAttendee('');
              setFilterTag('');
            }}
            style={styles.clearFiltersButton}
          >
            Clear Filters
          </button>
        )}
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

      {/* Main Layout with Sidebar */}
      <div style={isMobileOrTablet ? styles.mainLayoutMobile : styles.mainLayout}>
        {/* Left Sidebar - Mini Calendar & Today's Agenda */}
        {!isMobileOrTablet && (
          <div style={styles.sidebar}>
            {/* Mini Calendar Navigation */}
            <div style={styles.miniCalContainer}>
              <div style={styles.miniCalHeader}>
                <button onClick={previousMonth} style={styles.miniCalNavBtn}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span style={styles.miniCalTitle}>{monthNames[month].substring(0, 3)} {year}</span>
                <button onClick={nextMonth} style={styles.miniCalNavBtn}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
              <div style={styles.miniCalGrid}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <div key={`header-${i}`} style={styles.miniCalDayHeader}>{d}</div>
                ))}
                {renderMiniCalendar(month, year)}
              </div>
            </div>

            {/* Today's Agenda */}
            <div style={styles.agendaContainer}>
              <h3 style={styles.agendaTitle}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Today's Agenda
              </h3>

              {todaysItems.events.length === 0 && todaysItems.tasks.length === 0 ? (
                <p style={styles.agendaEmpty}>No events or tasks today</p>
              ) : (
                <div style={styles.agendaList}>
                  {/* Today's Events */}
                  {todaysItems.events.map(event => (
                    <div
                      key={event.id}
                      style={{
                        ...styles.agendaItem,
                        borderLeftColor: event.color,
                      }}
                      onClick={() => setSelectedEvent(event)}
                    >
                      <div style={styles.agendaItemTime}>
                        {event.isAllDay ? 'All Day' : event.startTime || 'No time'}
                        {event.isRecurring && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2" style={{ marginLeft: '4px' }}>
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          </svg>
                        )}
                      </div>
                      <div style={styles.agendaItemTitle}>{event.title}</div>
                    </div>
                  ))}

                  {/* Today's Tasks (red with initials) */}
                  {todaysItems.tasks.map(task => (
                    <div
                      key={task.id}
                      style={{
                        ...styles.agendaItem,
                        borderLeftColor: theme.colors.primary,
                      }}
                      onClick={() => setSelectedTask(task)}
                    >
                      <div style={styles.agendaItemTime}>
                        {task.dueTime || 'No time'}
                        {task.isRecurring && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2" style={{ marginLeft: '4px' }}>
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          </svg>
                        )}
                      </div>
                      <div style={styles.agendaItemTitle}>
                        {getTaskInitials(task) && (
                          <span style={{ ...styles.taskInitials, marginRight: '6px', backgroundColor: theme.colors.primary }}>{getTaskInitials(task)}</span>
                        )}
                        {task.title}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

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
                    ...(dragOverDay === day ? styles.calendarDayDragOver : {}),
                  }}
                  onClick={() => handleDayClick(day)}
                  onDragOver={(e) => handleDragOver(e, day)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, day)}
                >
                  <div style={styles.dayHeader2}>
                    <div style={{
                      ...styles.dayNumber,
                      ...(isToday ? styles.dayNumberToday : {}),
                    }}>
                      {day}
                    </div>
                    {/* Quick Add Button */}
                    <button
                      style={styles.quickAddBtn}
                      onClick={(e) => handleQuickAddClick(day, e)}
                      title="Quick add event"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>

                  {/* Quick Add Input */}
                  {quickAddDay === day && (
                    <form onSubmit={handleQuickAddSubmit} style={styles.quickAddForm}>
                      <input
                        ref={quickAddInputRef}
                        type="text"
                        placeholder="Add event..."
                        value={quickAddTitle}
                        onChange={(e) => setQuickAddTitle(e.target.value)}
                        onKeyDown={handleQuickAddKeyDown}
                        onBlur={() => {
                          if (!quickAddTitle.trim()) {
                            setQuickAddDay(null);
                          }
                        }}
                        style={styles.quickAddInput}
                      />
                    </form>
                  )}

                  <div style={styles.itemsList}>
                    {/* Events first (colored left border) */}
                    {eventsForDay.slice(0, maxVisible).map(event => (
                      <div
                        key={event.id}
                        style={{
                          ...styles.eventItem,
                          borderLeftColor: event.color,
                          opacity: draggedEvent?.id === event.id ? 0.5 : 1,
                          cursor: isAdmin ? 'grab' : 'pointer',
                          WebkitUserSelect: 'none',
                          userSelect: 'none',
                        }}
                        onClick={(e) => {
                          // Only trigger click if not dragging
                          if (!draggedEvent) {
                            handleEventClick(event, e);
                          }
                        }}
                        title={isAdmin ? `${event.title} (drag to reschedule)` : event.title}
                        draggable={isAdmin}
                        onDragStart={(e) => {
                          if (isAdmin) {
                            e.stopPropagation();
                            handleDragStart(e, event);
                          }
                        }}
                        onDragEnd={handleDragEnd}
                        onMouseDown={(e) => {
                          // Prevent text selection during drag
                          if (isAdmin) {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {event.isRecurring && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2" style={styles.recurringIcon}>
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          </svg>
                        )}
                        <span style={styles.itemTitle}>{event.title}</span>
                      </div>
                    ))}

                    {/* Tasks (red left border with user initials) */}
                    {tasksForDay.slice(0, Math.max(0, maxVisible - eventsForDay.length)).map(task => (
                      <div
                        key={task.id}
                        style={{
                          ...styles.taskItem,
                          borderLeftColor: theme.colors.primary,
                        }}
                        onClick={(e) => handleTaskClick(task, e)}
                        title={task.title}
                      >
                        {task.isRecurring && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2" style={styles.recurringIcon}>
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          </svg>
                        )}
                        {getTaskInitials(task) && (
                          <span style={styles.taskInitials}>{getTaskInitials(task)}</span>
                        )}
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
          /* Week View with Time Slots */
          <div style={styles.weekViewContainer}>
            {/* Day headers for week view */}
            <div style={styles.weekHeaderRow}>
              <div style={styles.timeColumnHeader} />
              {weekDates.map((date, index) => {
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const isCurrentDay = date.toDateString() === today.toDateString();

                return (
                  <div
                    key={index}
                    style={{
                      ...styles.weekDayHeader,
                      ...(isCurrentDay ? styles.weekDayHeaderToday : {}),
                    }}
                  >
                    <span style={styles.weekDayName}>{dayNames[date.getDay()]}</span>
                    <span style={{
                      ...styles.weekDayNumber,
                      ...(isCurrentDay ? styles.weekDayNumberToday : {}),
                    }}>
                      {date.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* All-day events row */}
            <div style={styles.allDayRow}>
              <div style={styles.allDayLabel}>All Day</div>
              {weekDates.map((date, index) => {
                const allDayEvents = filteredEvents.filter(event => {
                  if (!event.isAllDay) return false;
                  const eventStart = new Date(event.startDate);
                  const eventEnd = event.endDate ? new Date(event.endDate) : eventStart;
                  eventStart.setHours(0, 0, 0, 0);
                  eventEnd.setHours(0, 0, 0, 0);
                  const checkDate = new Date(date);
                  checkDate.setHours(0, 0, 0, 0);
                  return checkDate >= eventStart && checkDate <= eventEnd;
                });

                return (
                  <div key={index} style={styles.allDayCell}>
                    {allDayEvents.map(event => (
                      <div
                        key={event.id}
                        style={{
                          ...styles.allDayEvent,
                          backgroundColor: event.color,
                        }}
                        onClick={() => setSelectedEvent(event)}
                      >
                        {event.isRecurring && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.recurringIcon}>
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          </svg>
                        )}
                        {event.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Time slots grid */}
            <div style={styles.weekTimeGrid}>
              {/* Time column */}
              <div style={styles.timeColumn}>
                {timeSlots.map(slot => (
                  <div key={slot.hour} style={styles.timeSlotLabel}>
                    {slot.label}
                  </div>
                ))}
              </div>

              {/* Day columns with time-positioned events */}
              {weekDates.map((date, dayIndex) => {
                const dateStr = date.toISOString().split('T')[0];

                // Get timed events for this day
                const dayEvents = filteredEvents.filter(event => {
                  if (event.isAllDay) return false;
                  const eventStartDate = new Date(event.startDate);
                  const eventEndDate = event.endDate ? new Date(event.endDate) : eventStartDate;
                  eventStartDate.setHours(0, 0, 0, 0);
                  eventEndDate.setHours(0, 0, 0, 0);
                  const checkDate = new Date(date);
                  checkDate.setHours(0, 0, 0, 0);
                  return checkDate >= eventStartDate && checkDate <= eventEndDate;
                });

                // Get timed tasks for this day
                const dayTasks = jobTasks.filter(task => {
                  if (task.status === 'archived' || task.status === 'draft') return false;
                  const taskDate = new Date(task.scheduledDate);
                  return taskDate.toDateString() === date.toDateString();
                });

                return (
                  <div
                    key={dayIndex}
                    style={styles.weekDayColumn}
                    onClick={() => {
                      setSelectedDate(dateStr);
                      setEditingEvent(null);
                      setShowEventForm(true);
                    }}
                  >
                    {/* Hour lines */}
                    {timeSlots.map(slot => (
                      <div key={slot.hour} style={styles.hourSlot} />
                    ))}

                    {/* Floating events container (no specific time) */}
                    <div style={styles.floatingItemsContainer}>
                      {dayEvents.filter(e => !getEventPosition(e)).map(event => (
                        <div
                          key={event.id}
                          style={{
                            ...styles.weekEventFloating,
                            backgroundColor: event.color,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                          }}
                        >
                          {event.isRecurring && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.recurringIcon}>
                              <polyline points="23 4 23 10 17 10" />
                              <polyline points="1 20 1 14 7 14" />
                              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                          )}
                          {event.title}
                        </div>
                      ))}
                      {dayTasks.filter(t => !getTaskPosition(t)).map(task => (
                        <div
                          key={task.id}
                          style={{
                            ...styles.weekTaskFloating,
                            borderLeftColor: theme.colors.primary,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTask(task);
                          }}
                        >
                          {task.isRecurring && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2" style={styles.recurringIcon}>
                              <polyline points="23 4 23 10 17 10" />
                              <polyline points="1 20 1 14 7 14" />
                              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                          )}
                          {getTaskInitials(task) && (
                            <span style={{ ...styles.taskInitials, marginRight: '4px' }}>{getTaskInitials(task)}</span>
                          )}
                          {task.title}
                        </div>
                      ))}
                    </div>

                    {/* Positioned events (with specific time) */}
                    {dayEvents.filter(e => getEventPosition(e)).map(event => {
                      const pos = getEventPosition(event)!;
                      return (
                        <div
                          key={event.id}
                          style={{
                            ...styles.weekEventPositioned,
                            backgroundColor: event.color,
                            top: `${pos.top}px`,
                            height: `${pos.height}px`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                          }}
                        >
                          <span style={styles.weekEventTime}>{event.startTime}</span>
                          <span style={styles.weekEventTitle}>{event.title}</span>
                          {event.isRecurring && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 'auto' }}>
                              <polyline points="23 4 23 10 17 10" />
                              <polyline points="1 20 1 14 7 14" />
                              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                          )}
                        </div>
                      );
                    })}

                    {/* Positioned tasks (with specific time) */}
                    {dayTasks.filter(t => getTaskPosition(t)).map(task => {
                      const pos = getTaskPosition(task)!;
                      return (
                        <div
                          key={task.id}
                          style={{
                            ...styles.weekTaskPositioned,
                            borderLeftColor: theme.colors.primary,
                            top: `${pos.top}px`,
                            height: `${pos.height}px`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTask(task);
                          }}
                        >
                          <span style={styles.weekTaskTime}>{task.dueTime}</span>
                          {getTaskInitials(task) && (
                            <span style={{ ...styles.taskInitials, marginRight: '4px' }}>{getTaskInitials(task)}</span>
                          )}
                          <span style={styles.weekTaskTitle}>{task.title}</span>
                          {task.isRecurring && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2" style={{ marginLeft: 'auto' }}>
                              <polyline points="23 4 23 10 17 10" />
                              <polyline points="1 20 1 14 7 14" />
                              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendColor, backgroundColor: '#3B82F6' }} />
          <span style={styles.legendText}>Events</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendColor, backgroundColor: theme.colors.primary }} />
          <span style={styles.legendText}>Tasks</span>
        </div>
        <div style={styles.legendItem}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span style={styles.legendText}>Recurring</span>
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
    textAlign: 'left',
  },
  titleMobile: {
    ...theme.typography.h1Mobile,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    textAlign: 'left',
  },
  subtitle: {
    ...theme.typography.subtitle,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
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
  calendarDayDragOver: {
    backgroundColor: 'rgba(239, 35, 60, 0.1)',
    border: `2px dashed ${theme.colors.primary}`,
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
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.sm,
    borderLeft: '3px solid',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  taskItem: {
    padding: '4px 8px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.sm,
    borderLeft: '3px solid',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  taskInitials: {
    fontSize: '9px',
    fontWeight: 700,
    color: '#FFFFFF',
    backgroundColor: theme.colors.primary,
    padding: '1px 4px',
    borderRadius: '3px',
    flexShrink: 0,
  },
  itemTitle: {
    fontSize: '11px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
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

  // Search and Filter Bar
  searchFilterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    flex: '1 1 200px',
    maxWidth: '300px',
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    color: theme.colors.textPrimary,
  },
  clearButton: {
    padding: '4px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: theme.colors.textSecondary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSelect: {
    padding: '8px 12px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    color: theme.colors.textPrimary,
    cursor: 'pointer',
    outline: 'none',
    minWidth: '130px',
  },
  clearFiltersButton: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.primary}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.primary,
    cursor: 'pointer',
  },

  // Main Layout
  mainLayout: {
    display: 'grid',
    gridTemplateColumns: '260px 1fr',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  mainLayoutMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },

  // Sidebar
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
  },

  // Mini Calendar
  miniCalContainer: {
    backgroundColor: theme.colors.backgroundLight,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    padding: '12px',
  },
  miniCalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  miniCalTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  miniCalNavBtn: {
    padding: '4px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: theme.colors.textSecondary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.sm,
  },
  miniCalGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '2px',
  },
  miniCalDayHeader: {
    textAlign: 'center',
    fontSize: '10px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    padding: '4px',
  },
  miniCalDay: {
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
    padding: '6px 4px',
    cursor: 'pointer',
    borderRadius: theme.borderRadius.sm,
    transition: 'background-color 0.2s',
  },
  miniCalDayToday: {
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
  },
  miniCalDayEmpty: {
    padding: '6px 4px',
  },

  // Today's Agenda
  agendaContainer: {
    backgroundColor: theme.colors.backgroundLight,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    padding: '12px',
    flex: 1,
    overflow: 'hidden',
  },
  agendaTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  agendaEmpty: {
    fontSize: '13px',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    padding: '20px 0',
  },
  agendaList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '300px',
    overflowY: 'auto',
  },
  agendaItem: {
    padding: '8px 10px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.sm,
    borderLeft: '3px solid',
    cursor: 'pointer',
  },
  agendaItemTime: {
    fontSize: '10px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    display: 'flex',
    alignItems: 'center',
    marginBottom: '2px',
  },
  agendaItemTitle: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  // Day Header with Quick Add
  dayHeader2: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  quickAddBtn: {
    padding: '2px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: theme.colors.textSecondary,
    opacity: 0.5,
    transition: 'opacity 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.sm,
  },
  quickAddForm: {
    marginBottom: '8px',
  },
  quickAddInput: {
    width: '100%',
    padding: '6px 8px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.primary}`,
    borderRadius: theme.borderRadius.sm,
    fontSize: '11px',
    color: theme.colors.textPrimary,
    outline: 'none',
  },

  // Recurring Icon
  recurringIcon: {
    flexShrink: 0,
    marginRight: '4px',
  },

  // Week View with Time Slots
  weekViewContainer: {
    display: 'flex',
    flexDirection: 'column',
  },
  weekHeaderRow: {
    display: 'grid',
    gridTemplateColumns: '60px repeat(7, 1fr)',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  timeColumnHeader: {
    backgroundColor: theme.colors.bg.tertiary,
  },
  allDayRow: {
    display: 'grid',
    gridTemplateColumns: '60px repeat(7, 1fr)',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    minHeight: '40px',
  },
  allDayLabel: {
    padding: '8px',
    fontSize: '10px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.bg.tertiary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  allDayCell: {
    padding: '4px',
    backgroundColor: theme.colors.bg.secondary,
    borderRight: `1px solid ${theme.colors.bdr.primary}`,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    alignItems: 'flex-start',
  },
  allDayEvent: {
    padding: '2px 6px',
    borderRadius: theme.borderRadius.sm,
    fontSize: '10px',
    fontWeight: 500,
    color: '#FFFFFF',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
    display: 'flex',
    alignItems: 'center',
  },
  weekTimeGrid: {
    display: 'grid',
    gridTemplateColumns: '60px repeat(7, 1fr)',
    maxHeight: '600px',
    overflowY: 'auto',
  },
  timeColumn: {
    backgroundColor: theme.colors.bg.tertiary,
  },
  timeSlotLabel: {
    height: '60px',
    padding: '4px 8px',
    fontSize: '10px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    display: 'flex',
    alignItems: 'flex-start',
  },
  weekDayColumn: {
    position: 'relative',
    backgroundColor: theme.colors.bg.secondary,
    borderRight: `1px solid ${theme.colors.bdr.primary}`,
    cursor: 'pointer',
  },
  hourSlot: {
    height: '60px',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  weekEventPositioned: {
    position: 'absolute',
    left: '2px',
    right: '2px',
    padding: '4px 6px',
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    overflow: 'hidden',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  weekEventFloating: {
    position: 'relative',
    margin: '2px',
    padding: '4px 6px',
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 500,
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
  },
  weekTaskPositioned: {
    position: 'absolute',
    left: '2px',
    right: '2px',
    padding: '4px 6px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.sm,
    borderLeft: '3px solid',
    cursor: 'pointer',
    overflow: 'hidden',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  weekTaskFloating: {
    padding: '4px 6px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.sm,
    borderLeft: '3px solid',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
    display: 'flex',
    alignItems: 'center',
  },
  floatingItemsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '2px',
    zIndex: 2,
  },
};

export default CalendarPage;
