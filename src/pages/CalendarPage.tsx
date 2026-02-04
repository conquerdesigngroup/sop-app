import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { theme } from '../theme';
import { useEvent } from '../contexts/EventContext';
import { useTask } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { useWorkHours } from '../contexts/WorkHoursContext';
import { useResponsive } from '../hooks/useResponsive';
import { CalendarEvent, JobTask, WorkHoursEntry } from '../types';
import EventFormModal from '../components/EventFormModal';
import EventDetailModal from '../components/EventDetailModal';
import CalendarTaskModal from '../components/CalendarTaskModal';

// View type for calendar filtering
type CalendarViewType = 'all' | 'events' | 'tasks' | 'hours';

const CalendarPage: React.FC = () => {
  const { events, addEvent, updateEvent, deleteEvent, tags } = useEvent();
  const { jobTasks } = useTask();
  const { workHours } = useWorkHours();
  const { users, currentUser } = useAuth();
  const { isMobileOrTablet } = useResponsive();
  const location = useLocation();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [selectedDayDate, setSelectedDayDate] = useState<Date>(new Date());

  // Modal states
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedTask, setSelectedTask] = useState<JobTask | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);

  // Handle incoming state from navigation (e.g., from Dashboard day click)
  useEffect(() => {
    if (location.state) {
      const state = location.state as { openEventForm?: boolean; selectedDate?: string };
      if (state.openEventForm) {
        setSelectedDate(state.selectedDate);
        setEditingEvent(null);
        setShowEventForm(true);
        // Navigate to the selected date's month
        if (state.selectedDate) {
          const date = new Date(state.selectedDate);
          setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
        }
      }
      // Clear the state to prevent re-opening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Quick Add states
  const [quickAddDay, setQuickAddDay] = useState<number | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterColor, setFilterColor] = useState<string | ''>('');
  const [filterAttendee, setFilterAttendee] = useState<string | ''>('');
  const [filterTag, setFilterTag] = useState<string | ''>('');
  const [calendarViewType, setCalendarViewType] = useState<CalendarViewType>('all');
  const [selectedWorkHours, setSelectedWorkHours] = useState<WorkHoursEntry | null>(null);

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

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todaysWorkHours = workHours.filter(wh => wh.workDate === todayStr).sort((a, b) => {
      return (a.startTime || '').localeCompare(b.startTime || '');
    });

    return { events: todaysEvents, tasks: todaysTasks, workHours: todaysWorkHours };
  }, [events, jobTasks, workHours, today]);

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

  // Get work hours for a specific date
  const getWorkHoursForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return workHours.filter(wh => wh.workDate === dateStr);
  };

  // Get user name from ID
  const getUserName = (userId: string): string => {
    const user = users.find(u => u.id === userId);
    return user ? `${user.firstName} ${user.lastName}` : 'Unknown';
  };

  // Format hours display (e.g., "8h 30m")
  const formatHoursDisplay = (hours: number): string => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  // Navigation
  const previousMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToToday = () => {
    setCurrentMonth(new Date());
    setSelectedDayDate(new Date());
  };

  // Day view navigation
  const previousDay = () => {
    const prevDay = new Date(selectedDayDate);
    prevDay.setDate(prevDay.getDate() - 1);
    setSelectedDayDate(prevDay);
    setCurrentMonth(new Date(prevDay.getFullYear(), prevDay.getMonth(), 1));
  };
  const nextDay = () => {
    const nextDayDate = new Date(selectedDayDate);
    nextDayDate.setDate(nextDayDate.getDate() + 1);
    setSelectedDayDate(nextDayDate);
    setCurrentMonth(new Date(nextDayDate.getFullYear(), nextDayDate.getMonth(), 1));
  };
  const goToTodayDay = () => {
    setSelectedDayDate(new Date());
    setCurrentMonth(new Date());
  };

  // Event handlers
  const handleAddEvent = () => {
    setEditingEvent(null);
    setSelectedDate(undefined);
    setShowEventForm(true);
  };

  const handleDayClick = (day: number) => {
    // Navigate to day view for that specific day
    const clickedDate = new Date(year, month, day);
    setSelectedDayDate(clickedDate);
    setViewMode('day');
  };

  // Add event on a specific day (from day view)
  const handleAddEventOnDay = (date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

      {/* View Type Toggle - Events, Tasks, Hours, All */}
      <div style={styles.viewTypeToggle}>
        <button
          onClick={() => setCalendarViewType('all')}
          style={calendarViewType === 'all' ? styles.viewTypeButtonActive : styles.viewTypeButton}
        >
          All
        </button>
        <button
          onClick={() => setCalendarViewType('events')}
          style={calendarViewType === 'events' ? styles.viewTypeButtonActive : styles.viewTypeButton}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Events
        </button>
        <button
          onClick={() => setCalendarViewType('tasks')}
          style={calendarViewType === 'tasks' ? styles.viewTypeButtonActive : styles.viewTypeButton}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          Tasks
        </button>
        <button
          onClick={() => setCalendarViewType('hours')}
          style={calendarViewType === 'hours' ? styles.viewTypeButtonActive : styles.viewTypeButton}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Hours
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
          <button
            onClick={() => {
              setSelectedDayDate(new Date());
              setViewMode('day');
            }}
            style={viewMode === 'day' ? styles.viewButtonActive : styles.viewButton}
          >
            Day
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

              {todaysItems.events.length === 0 && todaysItems.tasks.length === 0 && todaysItems.workHours.length === 0 ? (
                <p style={styles.agendaEmpty}>No events, tasks, or work hours today</p>
              ) : (
                <div style={styles.agendaList}>
                  {/* Today's Events */}
                  {(calendarViewType === 'all' || calendarViewType === 'events') && todaysItems.events.map(event => (
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
                  {(calendarViewType === 'all' || calendarViewType === 'tasks') && todaysItems.tasks.map(task => (
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

                  {/* Today's Work Hours (green) */}
                  {(calendarViewType === 'all' || calendarViewType === 'hours') && todaysItems.workHours.map(wh => (
                    <div
                      key={wh.id}
                      style={{
                        ...styles.agendaItem,
                        borderLeftColor: '#10B981',
                      }}
                      onClick={() => setSelectedWorkHours(wh)}
                    >
                      <div style={styles.agendaItemTime}>
                        {wh.startTime} - {wh.endTime}
                      </div>
                      <div style={styles.agendaItemTitle}>
                        <span style={{ ...styles.taskInitials, marginRight: '6px', backgroundColor: '#10B981' }}>
                          {getUserInitials(wh.employeeId)}
                        </span>
                        {formatHoursDisplay(wh.totalHours)}
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
        {viewMode === 'day' ? (
          /* Day View */
          <div style={styles.dayViewContainer}>
            {/* Day Header with Navigation */}
            <div style={styles.dayViewHeader}>
              <div style={styles.dayNavControls}>
                <button onClick={previousDay} style={styles.navButton}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button onClick={goToTodayDay} style={styles.todayButton}>
                  Today
                </button>
                <button onClick={nextDay} style={styles.navButton}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
              <div style={styles.dayViewTitle}>
                <span style={styles.dayViewDayName}>
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][selectedDayDate.getDay()]}
                </span>
                <span style={styles.dayViewDate}>
                  {monthNames[selectedDayDate.getMonth()]} {selectedDayDate.getDate()}, {selectedDayDate.getFullYear()}
                </span>
              </div>
              <button
                onClick={() => handleAddEventOnDay(selectedDayDate)}
                style={styles.dayAddEventBtn}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Event
              </button>
            </div>

            {/* All-day events section */}
            {(() => {
              const dayAllDayEvents = filteredEvents.filter(event => {
                if (!event.isAllDay) return false;
                const eventStart = new Date(event.startDate);
                const eventEnd = event.endDate ? new Date(event.endDate) : eventStart;
                eventStart.setHours(0, 0, 0, 0);
                eventEnd.setHours(0, 0, 0, 0);
                const checkDate = new Date(selectedDayDate);
                checkDate.setHours(0, 0, 0, 0);
                return checkDate >= eventStart && checkDate <= eventEnd;
              });

              return dayAllDayEvents.length > 0 && (
                <div style={styles.dayAllDaySection}>
                  <div style={styles.dayAllDayLabel}>All Day</div>
                  <div style={styles.dayAllDayEvents}>
                    {dayAllDayEvents.map(event => (
                      <div
                        key={event.id}
                        style={{
                          ...styles.dayAllDayEvent,
                          backgroundColor: event.color,
                        }}
                        onClick={() => setSelectedEvent(event)}
                      >
                        {event.isRecurring && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px', flexShrink: 0 }}>
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          </svg>
                        )}
                        <span style={styles.dayAllDayEventTitle}>{event.title}</span>
                        {event.attendees.length > 0 && (
                          <span style={styles.dayEventAttendees}>
                            {event.attendees.slice(0, 3).map(id => getUserInitials(id)).join(', ')}
                            {event.attendees.length > 3 && ` +${event.attendees.length - 3}`}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Time grid */}
            <div style={styles.dayTimeGrid}>
              {/* Time column */}
              <div style={styles.dayTimeColumn}>
                {timeSlots.map(slot => (
                  <div key={slot.hour} style={styles.dayTimeSlotLabel}>
                    {slot.label}
                  </div>
                ))}
              </div>

              {/* Events/Tasks column */}
              <div style={styles.dayEventsColumn}>
                {/* Hour lines */}
                {timeSlots.map(slot => (
                  <div key={slot.hour} style={styles.dayHourSlot}>
                    <div style={styles.dayHourLine} />
                  </div>
                ))}

                {/* Positioned events */}
                {(() => {
                  const dayEvents = filteredEvents.filter(event => {
                    if (event.isAllDay) return false;
                    const eventStartDate = new Date(event.startDate);
                    const eventEndDate = event.endDate ? new Date(event.endDate) : eventStartDate;
                    eventStartDate.setHours(0, 0, 0, 0);
                    eventEndDate.setHours(0, 0, 0, 0);
                    const checkDate = new Date(selectedDayDate);
                    checkDate.setHours(0, 0, 0, 0);
                    return checkDate >= eventStartDate && checkDate <= eventEndDate;
                  });

                  return dayEvents.map(event => {
                    const pos = getEventPosition(event);
                    if (!pos) {
                      // No specific time - render at top
                      return (
                        <div
                          key={event.id}
                          style={{
                            ...styles.dayEventNoTime,
                            backgroundColor: event.color,
                          }}
                          onClick={() => setSelectedEvent(event)}
                        >
                          {event.isRecurring && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px', flexShrink: 0 }}>
                              <polyline points="23 4 23 10 17 10" />
                              <polyline points="1 20 1 14 7 14" />
                              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                          )}
                          <span style={styles.dayEventTitle}>{event.title}</span>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={event.id}
                        style={{
                          ...styles.dayEventPositioned,
                          backgroundColor: event.color,
                          top: `${pos.top}px`,
                          height: `${pos.height}px`,
                        }}
                        onClick={() => setSelectedEvent(event)}
                      >
                        <div style={styles.dayEventHeader}>
                          <span style={styles.dayEventTime}>
                            {event.startTime}{event.endTime && ` - ${event.endTime}`}
                          </span>
                          {event.isRecurring && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="23 4 23 10 17 10" />
                              <polyline points="1 20 1 14 7 14" />
                              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                          )}
                        </div>
                        <span style={styles.dayEventTitleLarge}>{event.title}</span>
                        {event.description && pos.height > 60 && (
                          <span style={styles.dayEventDescription}>{event.description}</span>
                        )}
                        {event.attendees.length > 0 && pos.height > 80 && (
                          <div style={styles.dayEventAttendeesRow}>
                            {event.attendees.slice(0, 5).map(id => (
                              <span key={id} style={styles.dayEventAttendeeBadge}>{getUserInitials(id)}</span>
                            ))}
                            {event.attendees.length > 5 && (
                              <span style={styles.dayEventAttendeeMore}>+{event.attendees.length - 5}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}

                {/* Positioned tasks */}
                {(() => {
                  const dayTasks = jobTasks.filter(task => {
                    if (task.status === 'archived' || task.status === 'draft') return false;
                    const taskDate = new Date(task.scheduledDate);
                    return taskDate.toDateString() === selectedDayDate.toDateString();
                  });

                  return dayTasks.map(task => {
                    const pos = getTaskPosition(task);
                    if (!pos) {
                      // No specific time - render at top
                      return (
                        <div
                          key={task.id}
                          style={styles.dayTaskNoTime}
                          onClick={() => setSelectedTask(task)}
                        >
                          {task.isRecurring && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2" style={{ marginRight: '6px', flexShrink: 0 }}>
                              <polyline points="23 4 23 10 17 10" />
                              <polyline points="1 20 1 14 7 14" />
                              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                          )}
                          {getTaskInitials(task) && (
                            <span style={{ ...styles.taskInitials, marginRight: '8px' }}>{getTaskInitials(task)}</span>
                          )}
                          <span style={styles.dayTaskTitle}>{task.title}</span>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={task.id}
                        style={{
                          ...styles.dayTaskPositioned,
                          top: `${pos.top}px`,
                          height: `${pos.height}px`,
                        }}
                        onClick={() => setSelectedTask(task)}
                      >
                        <div style={styles.dayTaskHeader}>
                          <span style={styles.dayTaskTime}>{task.dueTime}</span>
                          {task.isRecurring && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2">
                              <polyline points="23 4 23 10 17 10" />
                              <polyline points="1 20 1 14 7 14" />
                              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                          )}
                        </div>
                        <div style={styles.dayTaskTitleRow}>
                          {getTaskInitials(task) && (
                            <span style={{ ...styles.taskInitials, marginRight: '8px' }}>{getTaskInitials(task)}</span>
                          )}
                          <span style={styles.dayTaskTitleLarge}>{task.title}</span>
                        </div>
                        {task.estimatedDuration && pos.height > 50 && (
                          <span style={styles.dayTaskDuration}>{task.estimatedDuration} min</span>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        ) : viewMode === 'month' ? (
          <div style={isMobileOrTablet ? styles.calendarMobile : styles.calendar}>
            {/* Day headers */}
            {(isMobileOrTablet ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).map((day, idx) => (
              <div key={idx} style={isMobileOrTablet ? styles.dayHeaderMobile : styles.dayHeader}>{day}</div>
            ))}

            {/* Empty cells before first day */}
            {Array.from({ length: startingDayOfWeek }).map((_, index) => (
              <div key={`empty-${index}`} style={isMobileOrTablet ? styles.calendarDayEmptyMobile : styles.calendarDayEmpty} />
            ))}

            {/* Days of month */}
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const eventsForDay = (calendarViewType === 'all' || calendarViewType === 'events') ? getEventsForDate(day) : [];
              const tasksForDay = (calendarViewType === 'all' || calendarViewType === 'tasks') ? getTasksForDate(day) : [];
              const workHoursForDay = (calendarViewType === 'all' || calendarViewType === 'hours') ? getWorkHoursForDate(day) : [];
              const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
              const totalItems = eventsForDay.length + tasksForDay.length + workHoursForDay.length;
              const maxVisible = isMobileOrTablet ? 2 : 3;
              let visibleCount = 0;

              return (
                <CalendarDayCell
                  key={day}
                  isToday={isToday}
                  isMobileOrTablet={isMobileOrTablet}
                  onClick={() => handleDayClick(day)}
                >
                  <div style={isMobileOrTablet ? styles.dayHeader2Mobile : styles.dayHeader2}>
                    <div style={{
                      ...(isMobileOrTablet ? styles.dayNumberMobile : styles.dayNumber),
                      ...(isToday ? (isMobileOrTablet ? styles.dayNumberTodayMobile : styles.dayNumberToday) : {}),
                    }}>
                      {day}
                    </div>
                    {/* Quick Add Button - hide on mobile */}
                    {!isMobileOrTablet && (
                      <button
                        style={styles.quickAddBtn}
                        onClick={(e) => handleQuickAddClick(day, e)}
                        title="Quick add event"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Quick Add Input - desktop only */}
                  {!isMobileOrTablet && quickAddDay === day && (
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

                  <div style={isMobileOrTablet ? styles.itemsListMobile : styles.itemsList}>
                    {/* Events first (colored left border) */}
                    {eventsForDay.slice(0, maxVisible).map(event => {
                      visibleCount++;
                      return (
                        <div
                          key={event.id}
                          style={{
                            ...(isMobileOrTablet ? styles.eventItemMobile : styles.eventItem),
                            borderLeftColor: event.color,
                          }}
                          onClick={(e) => handleEventClick(event, e)}
                          title={event.title}
                        >
                          {!isMobileOrTablet && event.isRecurring && (
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2" style={styles.recurringIcon}>
                              <polyline points="23 4 23 10 17 10" />
                              <polyline points="1 20 1 14 7 14" />
                              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                          )}
                          <span style={isMobileOrTablet ? styles.itemTitleMobile : styles.itemTitle}>{event.title}</span>
                        </div>
                      );
                    })}

                    {/* Tasks (red left border with user initials) */}
                    {tasksForDay.slice(0, Math.max(0, maxVisible - eventsForDay.length)).map(task => {
                      visibleCount++;
                      return (
                        <div
                          key={task.id}
                          style={{
                            ...(isMobileOrTablet ? styles.taskItemMobile : styles.taskItem),
                            borderLeftColor: theme.colors.primary,
                          }}
                          onClick={(e) => handleTaskClick(task, e)}
                          title={task.title}
                        >
                          {!isMobileOrTablet && task.isRecurring && (
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textSecondary} strokeWidth="2" style={styles.recurringIcon}>
                              <polyline points="23 4 23 10 17 10" />
                              <polyline points="1 20 1 14 7 14" />
                              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                          )}
                          {getTaskInitials(task) && (
                            <span style={isMobileOrTablet ? styles.taskInitialsMobile : styles.taskInitials}>{getTaskInitials(task)}</span>
                          )}
                          <span style={isMobileOrTablet ? styles.itemTitleMobile : styles.itemTitle}>{task.title}</span>
                        </div>
                      );
                    })}

                    {/* Work Hours (green left border) */}
                    {workHoursForDay.slice(0, Math.max(0, maxVisible - eventsForDay.length - tasksForDay.length)).map(wh => {
                      visibleCount++;
                      return (
                        <div
                          key={wh.id}
                          style={{
                            ...(isMobileOrTablet ? styles.eventItemMobile : styles.eventItem),
                            borderLeftColor: '#10B981',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedWorkHours(wh);
                          }}
                          title={`${getUserName(wh.employeeId)}: ${formatHoursDisplay(wh.totalHours)}`}
                        >
                          <span style={isMobileOrTablet ? styles.taskInitialsMobile : { ...styles.taskInitials, backgroundColor: '#10B981' }}>
                            {getUserInitials(wh.employeeId)}
                          </span>
                          <span style={isMobileOrTablet ? styles.itemTitleMobile : styles.itemTitle}>
                            {formatHoursDisplay(wh.totalHours)}
                          </span>
                        </div>
                      );
                    })}

                    {/* More indicator */}
                    {totalItems > maxVisible && (
                      <div style={isMobileOrTablet ? styles.moreIndicatorMobile : styles.moreIndicator}>
                        +{totalItems - maxVisible} more
                      </div>
                    )}
                  </div>
                </CalendarDayCell>
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
          <div style={{ ...styles.legendColor, backgroundColor: '#10B981' }} />
          <span style={styles.legendText}>Work Hours</span>
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

      {/* Work Hours Detail Modal */}
      {selectedWorkHours && (
        <div style={styles.modalOverlay} onClick={() => setSelectedWorkHours(null)}>
          <div style={styles.workHoursModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.workHoursModalHeader}>
              <div style={styles.workHoursModalTitle}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Work Hours
              </div>
              <button style={styles.workHoursModalClose} onClick={() => setSelectedWorkHours(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div style={styles.workHoursModalContent}>
              <div style={styles.workHoursModalRow}>
                <span style={styles.workHoursModalLabel}>Employee</span>
                <span style={styles.workHoursModalValue}>{getUserName(selectedWorkHours.employeeId)}</span>
              </div>
              <div style={styles.workHoursModalRow}>
                <span style={styles.workHoursModalLabel}>Date</span>
                <span style={styles.workHoursModalValue}>
                  {new Date(selectedWorkHours.workDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>
              <div style={styles.workHoursModalRow}>
                <span style={styles.workHoursModalLabel}>Time</span>
                <span style={styles.workHoursModalValue}>{selectedWorkHours.startTime} - {selectedWorkHours.endTime}</span>
              </div>
              <div style={styles.workHoursModalRow}>
                <span style={styles.workHoursModalLabel}>Break</span>
                <span style={styles.workHoursModalValue}>{selectedWorkHours.breakMinutes} minutes</span>
              </div>
              <div style={styles.workHoursModalRow}>
                <span style={styles.workHoursModalLabel}>Total Hours</span>
                <span style={{ ...styles.workHoursModalValue, fontWeight: 700, color: '#10B981' }}>
                  {formatHoursDisplay(selectedWorkHours.totalHours)}
                </span>
              </div>
              <div style={styles.workHoursModalRow}>
                <span style={styles.workHoursModalLabel}>Status</span>
                <span style={{
                  ...styles.workHoursStatusBadge,
                  backgroundColor: selectedWorkHours.status === 'approved' ? 'rgba(16, 185, 129, 0.2)' :
                                   selectedWorkHours.status === 'rejected' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: selectedWorkHours.status === 'approved' ? '#10B981' :
                         selectedWorkHours.status === 'rejected' ? '#EF4444' : '#F59E0B',
                }}>
                  {selectedWorkHours.status.charAt(0).toUpperCase() + selectedWorkHours.status.slice(1)}
                </span>
              </div>
              {selectedWorkHours.notes && (
                <div style={styles.workHoursModalRow}>
                  <span style={styles.workHoursModalLabel}>Notes</span>
                  <span style={styles.workHoursModalValue}>{selectedWorkHours.notes}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.pageLayout.headerMargin.desktop,
    gap: theme.spacing.lg,
  },
  headerMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
    marginBottom: theme.pageLayout.headerMargin.mobile,
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
  viewTypeToggle: {
    display: 'flex',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    border: `1px solid ${theme.colors.bdr.primary}`,
    marginBottom: theme.spacing.md,
    flexWrap: 'wrap',
  },
  viewTypeButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  viewTypeButtonActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 16px',
    backgroundColor: theme.colors.primary,
    border: 'none',
    fontSize: '13px',
    fontWeight: 600,
    color: '#FFFFFF',
    cursor: 'pointer',
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
  calendarMobile: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
  },
  dayHeader: {
    textAlign: 'center' as const,
    fontSize: '13px',
    fontWeight: 700,
    color: theme.colors.txt.secondary,
    padding: '12px 4px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    backgroundColor: theme.colors.bg.tertiary,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    borderRight: `1px solid ${theme.colors.bdr.primary}`,
  },
  dayHeaderMobile: {
    textAlign: 'center' as const,
    fontSize: '11px',
    fontWeight: 700,
    color: theme.colors.txt.secondary,
    padding: '10px 2px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    backgroundColor: theme.colors.bg.tertiary,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    borderRight: `1px solid ${theme.colors.bdr.primary}`,
  },
  calendarDay: {
    height: '110px',
    padding: '6px',
    backgroundColor: theme.colors.bg.secondary,
    borderRight: `1px solid ${theme.colors.bdr.primary}`,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  calendarDayMobile: {
    height: '80px',
    padding: '4px',
    backgroundColor: theme.colors.bg.secondary,
    borderRight: `1px solid ${theme.colors.bdr.primary}`,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  calendarDayEmpty: {
    height: '110px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRight: `1px solid ${theme.colors.bdr.primary}`,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  calendarDayEmptyMobile: {
    height: '80px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRight: `1px solid ${theme.colors.bdr.primary}`,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  calendarDayToday: {
    backgroundColor: theme.colors.bg.primary,
  },
  calendarDayHover: {
    backgroundColor: '#2a2a2a',
    cursor: 'pointer',
  },
  dayNumber: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
  },
  dayNumberMobile: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
  },
  dayNumberToday: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    borderRadius: '50%',
    fontSize: '12px',
  },
  dayNumberTodayMobile: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    borderRadius: '50%',
    fontSize: '10px',
  },
  itemsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    flex: 1,
    overflow: 'hidden',
    marginTop: '4px',
  },
  itemsListMobile: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
    flex: 1,
    overflow: 'hidden',
    marginTop: '2px',
  },
  eventItem: {
    padding: '3px 6px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.sm,
    borderLeft: '3px solid',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    flexShrink: 0,
  },
  eventItemMobile: {
    padding: '2px 4px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: '3px',
    borderLeft: '2px solid',
    cursor: 'pointer',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  taskItem: {
    padding: '3px 6px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.sm,
    borderLeft: '3px solid',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    flexShrink: 0,
  },
  taskItemMobile: {
    padding: '2px 4px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: '3px',
    borderLeft: '2px solid',
    cursor: 'pointer',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  taskInitials: {
    fontSize: '8px',
    fontWeight: 700,
    color: '#FFFFFF',
    backgroundColor: theme.colors.primary,
    padding: '1px 3px',
    borderRadius: '2px',
    flexShrink: 0,
  },
  taskInitialsMobile: {
    fontSize: '7px',
    fontWeight: 700,
    color: '#FFFFFF',
    backgroundColor: theme.colors.primary,
    padding: '0px 2px',
    borderRadius: '2px',
    flexShrink: 0,
  },
  itemTitle: {
    fontSize: '10px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
    lineHeight: 1.3,
  },
  itemTitleMobile: {
    fontSize: '8px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
    lineHeight: 1.2,
  },
  moreIndicator: {
    fontSize: '9px',
    color: theme.colors.txt.secondary,
    fontWeight: 600,
    padding: '1px 4px',
  },
  moreIndicatorMobile: {
    fontSize: '8px',
    color: theme.colors.txt.secondary,
    fontWeight: 600,
    padding: '1px 2px',
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
    flexShrink: 0,
  },
  dayHeader2Mobile: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  },
  quickAddBtn: {
    padding: '2px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: theme.colors.textSecondary,
    opacity: 0.4,
    transition: 'opacity 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.sm,
  },
  quickAddBtnMobile: {
    padding: '1px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: theme.colors.textSecondary,
    opacity: 0.4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '2px',
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

  // Day View Styles
  dayViewContainer: {
    display: 'flex',
    flexDirection: 'column',
  },
  dayViewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    backgroundColor: theme.colors.bg.tertiary,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    gap: '16px',
    flexWrap: 'wrap',
  },
  dayNavControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dayViewTitle: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  dayViewDayName: {
    fontSize: '14px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  dayViewDate: {
    fontSize: '20px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  dayAddEventBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: theme.colors.primary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: 600,
    color: '#FFFFFF',
    cursor: 'pointer',
  },
  dayAllDaySection: {
    display: 'flex',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    minHeight: '50px',
  },
  dayAllDayLabel: {
    width: '80px',
    padding: '12px',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.bg.tertiary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRight: `1px solid ${theme.colors.bdr.primary}`,
  },
  dayAllDayEvents: {
    flex: 1,
    padding: '8px 12px',
    backgroundColor: theme.colors.bg.secondary,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
  },
  dayAllDayEvent: {
    padding: '8px 12px',
    borderRadius: theme.borderRadius.sm,
    fontSize: '13px',
    fontWeight: 500,
    color: '#FFFFFF',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    maxWidth: '300px',
  },
  dayAllDayEventTitle: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dayEventAttendees: {
    fontSize: '11px',
    opacity: 0.8,
    marginLeft: '8px',
  },
  dayTimeGrid: {
    display: 'grid',
    gridTemplateColumns: '80px 1fr',
    maxHeight: '700px',
    overflowY: 'auto',
  },
  dayTimeColumn: {
    backgroundColor: theme.colors.bg.tertiary,
  },
  dayTimeSlotLabel: {
    height: '60px',
    padding: '4px 12px',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    borderRight: `1px solid ${theme.colors.bdr.primary}`,
    display: 'flex',
    alignItems: 'flex-start',
  },
  dayEventsColumn: {
    position: 'relative',
    backgroundColor: theme.colors.bg.secondary,
  },
  dayHourSlot: {
    height: '60px',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    position: 'relative',
  },
  dayHourLine: {
    position: 'absolute',
    top: '30px',
    left: 0,
    right: 0,
    height: '1px',
    backgroundColor: `${theme.colors.bdr.primary}50`,
  },
  dayEventPositioned: {
    position: 'absolute',
    left: '8px',
    right: '8px',
    padding: '8px 12px',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    overflow: 'hidden',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  },
  dayEventNoTime: {
    position: 'relative',
    margin: '8px',
    padding: '8px 12px',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  },
  dayEventHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayEventTime: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.9)',
  },
  dayEventTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#FFFFFF',
  },
  dayEventTitleLarge: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#FFFFFF',
  },
  dayEventDescription: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.8)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dayEventAttendeesRow: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
    marginTop: '4px',
  },
  dayEventAttendeeBadge: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  dayEventAttendeeMore: {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.8)',
  },
  dayTaskPositioned: {
    position: 'absolute',
    left: '8px',
    right: '8px',
    padding: '8px 12px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    borderLeft: `4px solid ${theme.colors.primary}`,
    cursor: 'pointer',
    overflow: 'hidden',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  },
  dayTaskNoTime: {
    position: 'relative',
    margin: '8px',
    padding: '8px 12px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    borderLeft: `4px solid ${theme.colors.primary}`,
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  },
  dayTaskHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayTaskTime: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  dayTaskTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
  },
  dayTaskTitleRow: {
    display: 'flex',
    alignItems: 'center',
  },
  dayTaskTitleLarge: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  dayTaskDuration: {
    fontSize: '11px',
    color: theme.colors.textSecondary,
    marginTop: '2px',
  },
  // Work Hours Modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  workHoursModal: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.bdr.primary}`,
    maxWidth: '400px',
    width: '90%',
    boxShadow: theme.shadows.xl,
  },
  workHoursModalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  workHoursModalTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '18px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  workHoursModalClose: {
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
  workHoursModalContent: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  workHoursModalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  workHoursModalLabel: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
  },
  workHoursModalValue: {
    fontSize: '14px',
    color: theme.colors.textPrimary,
    fontWeight: 500,
  },
  workHoursStatusBadge: {
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
  },
};

// Calendar Day Component with hover effect (defined after styles)
const CalendarDayCell: React.FC<{
  isToday: boolean;
  isMobileOrTablet: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ isToday, isMobileOrTablet, onClick, children }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{
        ...(isMobileOrTablet ? styles.calendarDayMobile : styles.calendarDay),
        ...(isToday ? styles.calendarDayToday : {}),
        ...(isHovered && !isToday ? styles.calendarDayHover : {}),
      }}
    >
      {children}
    </div>
  );
};

export default CalendarPage;
