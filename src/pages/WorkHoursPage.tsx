import React, { useState, useMemo } from 'react';
import { theme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useWorkHours } from '../contexts/WorkHoursContext';
import { useResponsive } from '../hooks/useResponsive';
import { WorkDay } from '../types';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../hooks/useConfirm';

const WorkHoursPage: React.FC = () => {
  const { currentUser, users, isAdmin } = useAuth();
  // Deliberately only the work_days half of this context. Team Schedule shows
  // who is rostered on which day and nothing else — submitted hours belong to
  // Hours Input and must not leak back in here.
  const { workDays, addWorkDays, deleteWorkDay, getWorkDaysByDateRange } = useWorkHours();
  const { showToast } = useToast();
  const { isMobileOrTablet } = useResponsive();
  const { confirm, confirmDialog } = useConfirm();

  // Modal states
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Day detail panel state (for when clicking a marked day in schedule modal)
  const [selectedDayForDetail, setSelectedDayForDetail] = useState<string | null>(null);

  // Calendar day detail modal (for viewing a rostered day on the main calendar)
  const [calendarDetailModal, setCalendarDetailModal] = useState<{ employeeId: string; date: string } | null>(null);

  // Filter states
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<'week' | 'month' | 'all'>('week');
  const [viewMode, setViewMode] = useState<'schedule' | 'calendar'>('calendar');

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarViewMode, setCalendarViewMode] = useState<'day' | 'week' | 'month'>('month');

  // Schedule form states
  const [scheduleEmployee, setScheduleEmployee] = useState<string>(currentUser?.id || '');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [datesToRemove, setDatesToRemove] = useState<string[]>([]);
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [scheduleModalMonth, setScheduleModalMonth] = useState(new Date());
  const [recurringDays, setRecurringDays] = useState<number[]>([]); // 0=Sun, 1=Mon, etc.
  const [multiSelectRemoveMode, setMultiSelectRemoveMode] = useState(false); // Multi-select mode for removing days

  // Schedule templates
  const scheduleTemplates = [
    { label: 'Mon-Fri', days: [1, 2, 3, 4, 5] },
    { label: 'Mon-Sat', days: [1, 2, 3, 4, 5, 6] },
    { label: 'Weekends', days: [0, 6] },
    { label: 'MWF', days: [1, 3, 5] },
    { label: 'Tue-Thu', days: [2, 4] },
  ];

  // Form states

  // Calculate date range for work hours (includes today and some future for flexibility)
  const getDateRange = () => {
    const today = new Date();
    let startDate: string;
    let endDate: string;

    switch (filterDateRange) {
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString().split('T')[0];
        // Include a week ahead for recently scheduled work
        const weekAhead = new Date(today);
        weekAhead.setDate(weekAhead.getDate() + 7);
        endDate = weekAhead.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = monthAgo.toISOString().split('T')[0];
        // Include a month ahead
        const monthAhead = new Date(today);
        monthAhead.setMonth(monthAhead.getMonth() + 1);
        endDate = monthAhead.toISOString().split('T')[0];
        break;
      default:
        startDate = '2020-01-01';
        endDate = '2099-12-31';
    }
    return { startDate, endDate };
  };

  // Calculate date range for schedule (includes future)
  const getScheduleDateRange = () => {
    const today = new Date();
    let startDate: string;
    let endDate: string;

    switch (filterDateRange) {
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString().split('T')[0];
        const weekAhead = new Date(today);
        weekAhead.setDate(weekAhead.getDate() + 14);
        endDate = weekAhead.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = monthAgo.toISOString().split('T')[0];
        const monthAhead = new Date(today);
        monthAhead.setMonth(monthAhead.getMonth() + 1);
        endDate = monthAhead.toISOString().split('T')[0];
        break;
      default:
        startDate = '2020-01-01';
        endDate = '2099-12-31';
    }
    return { startDate, endDate };
  };


  // Filter work days (schedule view) - includes future dates
  const filteredWorkDays = useMemo(() => {
    const { startDate, endDate } = getScheduleDateRange();

    return workDays.filter(wd => {
      // Non-admins can only see their own entries
      if (!isAdmin && wd.employeeId !== currentUser?.id) return false;

      const matchesEmployee = filterEmployee === 'all' || wd.employeeId === filterEmployee;
      const matchesDate = filterDateRange === 'all' || (wd.workDate >= startDate && wd.workDate <= endDate);

      return matchesEmployee && matchesDate;
    }).sort((a, b) => new Date(a.workDate).getTime() - new Date(b.workDate).getTime()); // Sort ascending (upcoming first)
  }, [workDays, filterEmployee, filterDateRange, isAdmin, currentUser]);

  // Group work days by date for display
  const workDaysByDate = useMemo(() => {
    const grouped: { [date: string]: WorkDay[] } = {};
    filteredWorkDays.forEach(wd => {
      if (!grouped[wd.workDate]) {
        grouped[wd.workDate] = [];
      }
      grouped[wd.workDate].push(wd);
    });
    return grouped;
  }, [filteredWorkDays]);

  // Get next 14 days for quick date selection
  const getNextTwoWeeks = () => {
    const dates: string[] = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  };

  const nextTwoWeeks = getNextTwoWeeks();

  // Calendar helpers
  const getCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay(); // 0-6
    const daysInMonth = lastDay.getDate();

    const days: { date: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    // Previous month days
    const prevMonth = new Date(year, month, 0);
    const prevMonthDays = prevMonth.getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const date = new Date(year, month - 1, dayNum);
      days.push({
        date: date.toISOString().split('T')[0],
        dayNum,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      days.push({
        date: date.toISOString().split('T')[0],
        dayNum: i,
        isCurrentMonth: true,
      });
    }

    // Next month days to fill the grid
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date: date.toISOString().split('T')[0],
        dayNum: i,
        isCurrentMonth: false,
      });
    }

    return days;
  };

  const calendarDays = getCalendarDays();

  // Get work days for a specific date
  const getWorkDaysForDate = (date: string) => {
    return workDays.filter(wd => {
      if (!isAdmin && wd.employeeId !== currentUser?.id) return false;
      if (filterEmployee !== 'all' && wd.employeeId !== filterEmployee) return false;
      return wd.workDate === date;
    });
  };

  // Navigate calendar based on view mode
  const prevPeriod = () => {
    if (calendarViewMode === 'day') {
      setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1));
    } else if (calendarViewMode === 'week') {
      setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7));
    } else {
      setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    }
  };

  const nextPeriod = () => {
    if (calendarViewMode === 'day') {
      setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1));
    } else if (calendarViewMode === 'week') {
      setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7));
    } else {
      setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    }
  };

  const goToToday = () => {
    setCalendarMonth(new Date());
  };

  // Get week days for the current week
  const getWeekDays = () => {
    const current = new Date(calendarMonth);
    const dayOfWeek = current.getDay();
    const startOfWeek = new Date(current);
    startOfWeek.setDate(current.getDate() - dayOfWeek);

    const days: { date: string; dayNum: number; dayName: string; isToday: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const today = new Date();
      days.push({
        date: date.toISOString().split('T')[0],
        dayNum: date.getDate(),
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        isToday: date.toDateString() === today.toDateString(),
      });
    }
    return days;
  };

  const weekDays = getWeekDays();

  // Get calendar title based on view mode
  const getCalendarTitle = () => {
    if (calendarViewMode === 'day') {
      return calendarMonth.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } else if (calendarViewMode === 'week') {
      const start = weekDays[0];
      const end = weekDays[6];
      const startDate = new Date(start.date);
      const endDate = new Date(end.date);
      if (startDate.getMonth() === endDate.getMonth()) {
        return `${startDate.toLocaleDateString('en-US', { month: 'long' })} ${start.dayNum} - ${end.dayNum}, ${endDate.getFullYear()}`;
      }
      return `${startDate.toLocaleDateString('en-US', { month: 'short' })} ${start.dayNum} - ${endDate.toLocaleDateString('en-US', { month: 'short' })} ${end.dayNum}, ${endDate.getFullYear()}`;
    }
    return calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Get active employees
  const activeEmployees = useMemo(() => {
    return users.filter(u => u.isActive).sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );
  }, [users]);

  // Employee colors - distinct colors for each employee
  const employeeColors = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#6366F1', // Indigo
    '#14B8A6', // Teal
    '#EF4444', // Red
    '#84CC16', // Lime
    '#A855F7', // Violet
  ];

  // Get consistent color for a user based on their position in the sorted list
  const getUserColor = (userId: string) => {
    const sortedUsers = [...users].sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );
    const index = sortedUsers.findIndex(u => u.id === userId);
    return employeeColors[index % employeeColors.length];
  };

  // Get user name
  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? `${user.firstName} ${user.lastName}` : 'Unknown';
  };









  // Schedule modal handlers
  const resetScheduleForm = () => {
    setScheduleEmployee(currentUser?.id || '');
    setSelectedDates([]);
    setDatesToRemove([]);
    setScheduleNotes('');
    setScheduleModalMonth(new Date());
    setSelectedDayForDetail(null);
    setRecurringDays([]);
    setMultiSelectRemoveMode(false);
  };

  // Apply schedule template - selects all matching days in current month view
  const applyScheduleTemplate = (dayNumbers: number[]) => {
    const year = scheduleModalMonth.getFullYear();
    const month = scheduleModalMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const newDates: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeek = date.getDay();

      // Only add future dates that match the template and aren't already scheduled or selected
      if (dayNumbers.includes(dayOfWeek) &&
          date >= new Date(new Date().toISOString().split('T')[0]) &&
          !existingWorkDayDates.includes(dateStr) &&
          !selectedDates.includes(dateStr)) {
        newDates.push(dateStr);
      }
    }

    setSelectedDates(prev => Array.from(new Set([...prev, ...newDates])));
    setRecurringDays(dayNumbers);
    showToast(`Selected ${newDates.length} days`, 'success');
  };

  // Toggle recurring day
  const toggleRecurringDay = (dayNum: number) => {
    setRecurringDays(prev =>
      prev.includes(dayNum)
        ? prev.filter(d => d !== dayNum)
        : [...prev, dayNum]
    );
  };

  // Get existing work days for the selected employee
  const getExistingWorkDaysForEmployee = (employeeId: string) => {
    return workDays.filter(wd => wd.employeeId === employeeId && wd.status !== 'cancelled');
  };

  const existingWorkDayDates = useMemo(() => {
    if (!scheduleEmployee) return [];
    return getExistingWorkDaysForEmployee(scheduleEmployee).map(wd => wd.workDate);
  }, [scheduleEmployee, workDays]);



  // Get calendar days for the schedule modal
  const getScheduleModalCalendarDays = () => {
    const year = scheduleModalMonth.getFullYear();
    const month = scheduleModalMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days: { date: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0);
    const prevMonthDays = prevMonthLastDay.getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const date = new Date(year, month - 1, dayNum);
      days.push({
        date: date.toISOString().split('T')[0],
        dayNum,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      days.push({
        date: date.toISOString().split('T')[0],
        dayNum: i,
        isCurrentMonth: true,
      });
    }

    // Next month days to fill the grid (only add if needed to complete current row)
    const totalCells = Math.ceil(days.length / 7) * 7;
    const remaining = totalCells - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date: date.toISOString().split('T')[0],
        dayNum: i,
        isCurrentMonth: false,
      });
    }

    return days;
  };

  const scheduleModalDays = getScheduleModalCalendarDays();

  // Handle date click in schedule modal
  const handleDayClick = (date: string) => {
    const isExisting = existingWorkDayDates.includes(date);
    const isMarkedForRemoval = datesToRemove.includes(date);
    const isNewlySelected = selectedDates.includes(date);

    // Multi-select remove mode: toggle removal status on click
    if (multiSelectRemoveMode) {
      if (isMarkedForRemoval) {
        // Unmark for removal
        setDatesToRemove(prev => prev.filter(d => d !== date));
      } else if (isExisting) {
        // Mark existing day for removal
        setDatesToRemove(prev => [...prev, date]);
      }
      // Don't do anything for non-existing days in remove mode
      return;
    }

    // Normal mode behavior
    if (isExisting && !isMarkedForRemoval) {
      // Show detail panel for existing day
      setSelectedDayForDetail(date);
    } else if (isMarkedForRemoval) {
      // Unmark for removal
      setDatesToRemove(prev => prev.filter(d => d !== date));
    } else if (isNewlySelected) {
      // Show detail for newly selected day
      setSelectedDayForDetail(date);
    } else {
      // Use Set to ensure no duplicates
      setSelectedDates(prev => Array.from(new Set([...prev, date])));
      setSelectedDayForDetail(date);
    }
  };

  // Remove a day (mark existing for removal or remove from new selections)
  const handleRemoveDay = (date: string) => {
    const isExisting = existingWorkDayDates.includes(date);
    if (isExisting) {
      setDatesToRemove(prev => [...prev, date]);
    } else {
      setSelectedDates(prev => prev.filter(d => d !== date));
    }
    setSelectedDayForDetail(null);
  };

  // Close day detail panel
  const closeDayDetail = () => {
    setSelectedDayForDetail(null);
  };


  // Navigate schedule modal calendar
  const prevScheduleMonth = () => {
    setScheduleModalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextScheduleMonth = () => {
    setScheduleModalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleAddSchedule = async () => {
    if (!scheduleEmployee) {
      showToast('Please select an employee', 'error');
      return;
    }
    if (selectedDates.length === 0 && datesToRemove.length === 0) {
      showToast('Please select days to add or remove', 'error');
      return;
    }

    try {
      let addedCount = 0;
      let removedCount = 0;

      // Remove days marked for removal
      if (datesToRemove.length > 0) {
        const existingDays = getExistingWorkDaysForEmployee(scheduleEmployee);
        for (const date of datesToRemove) {
          const dayToRemove = existingDays.find(wd => wd.workDate === date);
          if (dayToRemove) {
            await deleteWorkDay(dayToRemove.id);
            removedCount++;
          }
        }
      }

      // Add new days - filter out any dates that already exist in the database
      if (selectedDates.length > 0) {
        // Get fresh list of existing dates for this employee to ensure we have current data
        const currentExistingDates = getExistingWorkDaysForEmployee(scheduleEmployee).map(wd => wd.workDate);

        // Filter out any dates that already exist in the database
        const datesToAdd = selectedDates.filter(date => !currentExistingDates.includes(date));

        if (datesToAdd.length > 0) {
          await addWorkDays(scheduleEmployee, datesToAdd, scheduleNotes || undefined);
          addedCount = datesToAdd.length;
        }

        // Log if any duplicates were skipped
        const skippedCount = selectedDates.length - datesToAdd.length;
        if (skippedCount > 0) {
          console.log(`Skipped ${skippedCount} dates that already exist in the database`);
        }
      }

      // Show appropriate message
      const messages: string[] = [];
      if (addedCount > 0) messages.push(`${addedCount} day${addedCount !== 1 ? 's' : ''} added`);
      if (removedCount > 0) messages.push(`${removedCount} day${removedCount !== 1 ? 's' : ''} removed`);
      showToast(messages.join(', '), 'success');

      setShowScheduleModal(false);
      resetScheduleForm();
      // Switch to calendar view to show the changes
      setViewMode('calendar');
    } catch (error: any) {
      console.error('Failed to update schedule:', error);
      showToast(`Failed to update schedule: ${error?.message || 'Unknown error'}`, 'error');
    }
  };

  const handleDeleteWorkDay = async (id: string) => {
    const confirmed = await confirm({
      title: 'Remove this working day?',
      message: 'The day will be removed from the schedule.',
      confirmLabel: 'Remove',
      variant: 'warning',
    });
    if (!confirmed) return;
    try {
      await deleteWorkDay(id);
      showToast('Working day removed', 'success');
    } catch (error) {
      console.error('Failed to remove working day:', error);
      showToast('Failed to remove working day', 'error');
    }
  };

  // Get day name
  const getDayName = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };


  return (
    <div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
      {/* Header */}
      <div style={isMobileOrTablet ? styles.headerMobile : styles.header}>
        <div>
          <h1 style={isMobileOrTablet ? styles.titleMobile : styles.title}>Team Schedule</h1>
          <p style={isMobileOrTablet ? styles.subtitleMobile : styles.subtitle}>
            {isAdmin ? 'Who is working which day' : 'The days you are scheduled to work'}
          </p>
        </div>
        <button
          onClick={() => { resetScheduleForm(); setShowScheduleModal(true); }}
          style={isMobileOrTablet ? styles.addButtonMobile : styles.addButton}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Manage Schedule
        </button>
      </div>

      {/* Filters */}
      <div style={isMobileOrTablet ? styles.filtersContainerMobile : styles.filtersContainer}>
        <div style={isMobileOrTablet ? styles.filtersRowMobile : styles.filtersRow}>
          {/* View Mode Toggle */}
          <div style={isMobileOrTablet ? styles.viewToggleMobile : styles.viewToggle}>
            <button
              onClick={() => setViewMode('schedule')}
              style={{
                ...styles.toggleButton,
                ...(isMobileOrTablet ? styles.toggleButtonMobile : {}),
                ...(viewMode === 'schedule' ? styles.toggleButtonActive : {}),
              }}
            >
              Schedule
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              style={{
                ...styles.toggleButton,
                ...(isMobileOrTablet ? styles.toggleButtonMobile : {}),
                ...(viewMode === 'calendar' ? styles.toggleButtonActive : {}),
              }}
            >
              Calendar
            </button>
          </div>

          {/* Date Range Filter */}
          <select
            value={filterDateRange}
            onChange={(e) => setFilterDateRange(e.target.value as 'week' | 'month' | 'all')}
            style={isMobileOrTablet ? styles.filterSelectMobile : styles.filterSelect}
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>

          {/* Employee Filter (Admin only) */}
          {isAdmin && (
            <select
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
              style={isMobileOrTablet ? styles.filterSelectMobile : styles.filterSelect}
            >
              <option value="all">All Employees</option>
              {activeEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </option>
              ))}
            </select>
          )}

        </div>
      </div>

      {/* Content */}
      {viewMode === 'schedule' ? (
        // Schedule View (Working Days)
        <div style={styles.listContainer}>
          {filteredWorkDays.length === 0 ? (
            <div style={styles.emptyState}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" style={{ stroke: theme.colors.txt.tertiary }} strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <h3>No scheduled days found</h3>
              <p>Click "Mark Days" to add working days</p>
            </div>
          ) : (
            Object.entries(workDaysByDate)
              .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
              .map(([date, days]) => (
                <div key={date} style={styles.scheduleDateGroup}>
                  <div style={styles.scheduleDateHeader}>
                    <span style={styles.scheduleDateTitle}>{formatDate(date)}</span>
                    <span style={styles.scheduleCount}>{days.length} {days.length === 1 ? 'person' : 'people'}</span>
                  </div>
                  <div style={styles.scheduleEmployeeList}>
                    {days.map(day => (
                      <div key={day.id} style={styles.scheduleEmployeeCard}>
                        <div style={styles.scheduleEmployeeInfo}>
                          <div style={styles.scheduleEmployeeName}>{getUserName(day.employeeId)}</div>
                          {day.notes && <div style={styles.scheduleNotes}>{day.notes}</div>}
                        </div>
                        <div style={styles.scheduleActions}>
                          <span style={{
                            ...styles.scheduleStatusBadge,
                            backgroundColor: day.status === 'confirmed' ? theme.colors.status.success :
                              day.status === 'cancelled' ? theme.colors.status.error : theme.colors.status.info
                          }}>
                            {day.status}
                          </span>
                          {(isAdmin || day.employeeId === currentUser?.id) && (
                            <button
                              onClick={() => handleDeleteWorkDay(day.id)}
                              style={styles.scheduleDeleteBtn}
                              title="Remove"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
          )}
        </div>
      ) : (
        // Calendar View
        <div style={isMobileOrTablet ? styles.calendarContainerMobile : styles.calendarContainer}>
          {/* Calendar View Mode Toggle */}
          <div style={styles.calendarViewToggle}>
            <button
              onClick={() => setCalendarViewMode('day')}
              style={{
                ...styles.calendarViewToggleBtn,
                ...(calendarViewMode === 'day' ? styles.calendarViewToggleBtnActive : {}),
              }}
            >
              Day
            </button>
            <button
              onClick={() => setCalendarViewMode('week')}
              style={{
                ...styles.calendarViewToggleBtn,
                ...(calendarViewMode === 'week' ? styles.calendarViewToggleBtnActive : {}),
              }}
            >
              Week
            </button>
            <button
              onClick={() => setCalendarViewMode('month')}
              style={{
                ...styles.calendarViewToggleBtn,
                ...(calendarViewMode === 'month' ? styles.calendarViewToggleBtnActive : {}),
              }}
            >
              Month
            </button>
          </div>

          {/* Calendar Header */}
          <div style={isMobileOrTablet ? styles.calendarHeaderMobile : styles.calendarHeader}>
            <button onClick={prevPeriod} style={isMobileOrTablet ? styles.calendarNavButtonMobile : styles.calendarNavButton}>
              <svg width={isMobileOrTablet ? "16" : "20"} height={isMobileOrTablet ? "16" : "20"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div style={isMobileOrTablet ? styles.calendarTitleMobile : styles.calendarTitle}>
              <h3 style={isMobileOrTablet ? styles.calendarMonthTitleMobile : styles.calendarMonthTitle}>
                {getCalendarTitle()}
              </h3>
              <button onClick={goToToday} style={styles.todayButton}>Today</button>
            </div>
            <button onClick={nextPeriod} style={isMobileOrTablet ? styles.calendarNavButtonMobile : styles.calendarNavButton}>
              <svg width={isMobileOrTablet ? "16" : "20"} height={isMobileOrTablet ? "16" : "20"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Day View */}
          {calendarViewMode === 'day' && (
            <div style={isMobileOrTablet ? styles.dayViewContainerMobile : styles.dayViewContainer}>
              {(() => {
                const dateStr = calendarMonth.toISOString().split('T')[0];
                const dayWorkDays = getWorkDaysForDate(dateStr);
                const isToday = dateStr === new Date().toISOString().split('T')[0];

                return (
                  <div style={{
                    ...(isMobileOrTablet ? styles.dayViewCardMobile : styles.dayViewCard),
                    borderColor: isToday ? theme.colors.primary : theme.colors.bdr.primary,
                  }}>
                    {dayWorkDays.length === 0 ? (
                      <div style={isMobileOrTablet ? styles.dayViewEmptyMobile : styles.dayViewEmpty}>
                        <svg width={isMobileOrTablet ? "40" : "48"} height={isMobileOrTablet ? "40" : "48"} viewBox="0 0 24 24" fill="none" style={{ stroke: theme.colors.txt.tertiary }} strokeWidth="1.5">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <p style={{ fontSize: isMobileOrTablet ? '14px' : '16px', margin: '12px 0 4px' }}>No one scheduled</p>
                        <span style={{ fontSize: isMobileOrTablet ? '12px' : '13px', color: theme.colors.txt.tertiary }}>
                          Use "Manage Schedule" to add employees to this day
                        </span>
                      </div>
                    ) : (
                      <div style={styles.dayViewEntries}>
                        {dayWorkDays.map(wd => {
                          return (
                            <div
                              key={wd.id}
                              onClick={() => setCalendarDetailModal({ employeeId: wd.employeeId, date: dateStr })}
                              style={{
                                ...styles.dayViewEntry,
                                borderLeft: `4px solid ${getUserColor(wd.employeeId)}`,
                              }}
                            >
                              <div style={styles.dayViewEntryHeader}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    backgroundColor: getUserColor(wd.employeeId),
                                  }} />
                                  <span style={styles.dayViewEntryName}>{getUserName(wd.employeeId)}</span>
                                </div>
                              </div>
                              {wd.notes && (
                                <div style={styles.dayViewEntryDetails}>
                                  <div style={styles.dayViewEntryTime}>{wd.notes}</div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Week View */}
          {calendarViewMode === 'week' && (
            <div style={isMobileOrTablet ? styles.weekViewContainerMobile : styles.weekViewContainer}>
              <div style={isMobileOrTablet ? styles.weekViewGridMobile : styles.weekViewGrid}>
                {weekDays.map((day, index) => {
                  const dayWorkDays = getWorkDaysForDate(day.date);
                  return (
                    <div key={index} style={{
                      ...(isMobileOrTablet ? styles.weekViewDayMobile : styles.weekViewDay),
                      ...(day.isToday ? styles.weekViewDayToday : {}),
                    }}>
                      <div style={isMobileOrTablet ? styles.weekViewDayHeaderMobile : styles.weekViewDayHeader}>
                        <span style={isMobileOrTablet ? styles.weekViewDayNameMobile : styles.weekViewDayName}>{day.dayName}</span>
                        <span style={{
                          ...(isMobileOrTablet ? styles.weekViewDayNumMobile : styles.weekViewDayNum),
                          ...(day.isToday ? styles.weekViewDayNumToday : {}),
                        }}>{day.dayNum}</span>
                      </div>
                      <div style={isMobileOrTablet ? styles.weekViewDayContentMobile : styles.weekViewDayContent}>
                        {dayWorkDays.length === 0 ? (
                          <div style={isMobileOrTablet ? styles.weekViewEmptyMobile : styles.weekViewEmpty}>
                            <span style={{ color: theme.colors.txt.tertiary, fontSize: isMobileOrTablet ? '10px' : '12px' }}>—</span>
                          </div>
                        ) : (
                          dayWorkDays.map(wd => {
                            return (
                              <div
                                key={wd.id}
                                onClick={() => setCalendarDetailModal({ employeeId: wd.employeeId, date: day.date })}
                                style={{
                                  ...(isMobileOrTablet ? styles.weekViewEntryMobile : styles.weekViewEntry),
                                  backgroundColor: getUserColor(wd.employeeId),
                                }}
                                title={wd.notes ? `${getUserName(wd.employeeId)} - ${wd.notes}` : getUserName(wd.employeeId)}
                              >
                                <span style={isMobileOrTablet ? styles.weekViewEntryNameMobile : styles.weekViewEntryName}>
                                  {isMobileOrTablet ? getUserName(wd.employeeId).split(' ')[0].charAt(0) + '.' : getUserName(wd.employeeId).split(' ')[0]}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Month View (original calendar grid) */}
          {calendarViewMode === 'month' && (
          <div style={styles.calendarGrid}>
            {/* Day Headers */}
            {(isMobileOrTablet ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).map((day, i) => (
              <div key={i} style={isMobileOrTablet ? styles.calendarDayHeaderMobile : styles.calendarDayHeader}>{day}</div>
            ))}

            {/* Calendar Days */}
            {calendarDays.map((day, index) => {
              const dayWorkDays = getWorkDaysForDate(day.date);
              const isToday = day.date === new Date().toISOString().split('T')[0];
              const hasWorkDays = dayWorkDays.length > 0;

              return (
                <div
                  key={index}
                  style={{
                    ...(isMobileOrTablet ? styles.calendarDayMobile : styles.calendarDay),
                    ...(day.isCurrentMonth ? {} : styles.calendarDayOtherMonth),
                    ...(isToday ? styles.calendarDayToday : {}),
                  }}
                >
                  <span style={{
                    ...styles.calendarDayNum,
                    ...(isToday ? styles.calendarDayNumToday : {}),
                  }}>
                    {day.dayNum}
                  </span>
                  {hasWorkDays && (
                    <div style={styles.calendarDayContent}>
                      {dayWorkDays.slice(0, isMobileOrTablet ? 2 : 3).map(wd => {
                        return (
                          <div
                            key={wd.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCalendarDetailModal({ employeeId: wd.employeeId, date: day.date });
                            }}
                            style={{
                              ...(isMobileOrTablet ? styles.calendarWorkDayMobile : styles.calendarWorkDay),
                              backgroundColor: getUserColor(wd.employeeId),
                              cursor: 'pointer',
                            }}
                            title={wd.notes ? `${getUserName(wd.employeeId)} - ${wd.notes}` : getUserName(wd.employeeId)}
                          >
                            {isMobileOrTablet ? getUserName(wd.employeeId).split(' ')[0].substring(0, 4) : getUserName(wd.employeeId).split(' ')[0]}
                          </div>
                        );
                      })}
                      {dayWorkDays.length > (isMobileOrTablet ? 2 : 3) && (
                        <div style={styles.calendarMoreIndicator}>
                          +{dayWorkDays.length - (isMobileOrTablet ? 2 : 3)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}

          {/* Employee Color Legend */}
          <div style={styles.calendarLegend}>
            {activeEmployees.slice(0, 6).map(emp => (
              <div key={emp.id} style={styles.legendItem}>
                <span style={{ ...styles.legendDot, backgroundColor: getUserColor(emp.id) }} />
                <span>{emp.firstName}</span>
              </div>
            ))}
            {activeEmployees.length > 6 && (
              <div style={styles.legendItem}>
                <span style={styles.legendMore}>+{activeEmployees.length - 6} more</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Schedule Modal (Mark Working Days) */}
      {showScheduleModal && (
        <div style={styles.modalOverlay} onClick={() => setShowScheduleModal(false)}>
          <div style={{ ...styles.modal, maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Manage Schedule</h2>
              <button onClick={() => setShowScheduleModal(false)} style={styles.closeButton}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={styles.modalContent}>
              {/* Employee Selection (Admin only) */}
              {isAdmin && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Employee</label>
                  <select
                    value={scheduleEmployee}
                    onChange={(e) => {
                      setScheduleEmployee(e.target.value);
                      setSelectedDates([]);
                      setDatesToRemove([]);
                    }}
                    style={styles.input}
                  >
                    <option value="">Select employee...</option>
                    {activeEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Quick Schedule Templates */}
              <div style={styles.scheduleTemplates}>
                <span style={styles.scheduleTemplatesLabel}>Quick select:</span>
                {scheduleTemplates.map((template, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applyScheduleTemplate(template.days)}
                    style={{
                      ...styles.scheduleTemplateBtn,
                      ...(JSON.stringify(recurringDays.sort()) === JSON.stringify(template.days.sort())
                        ? styles.scheduleTemplateBtnActive
                        : {}),
                    }}
                  >
                    {template.label}
                  </button>
                ))}
                {(selectedDates.length > 0 || recurringDays.length > 0) && !multiSelectRemoveMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDates([]);
                      setRecurringDays([]);
                      showToast('Selection cleared', 'success');
                    }}
                    style={styles.clearSelectionBtn}
                  >
                    Clear Selection
                  </button>
                )}
                {existingWorkDayDates.length > 0 && !multiSelectRemoveMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setMultiSelectRemoveMode(true);
                      setSelectedDayForDetail(null);
                      showToast('Multi-select mode: Click days to mark for removal', 'info');
                    }}
                    style={styles.multiSelectBtn}
                  >
                    Select Days to Remove
                  </button>
                )}
                {multiSelectRemoveMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setMultiSelectRemoveMode(false);
                      showToast('Multi-select mode disabled', 'success');
                    }}
                    style={styles.multiSelectActiveBtn}
                  >
                    ✓ Done Selecting ({datesToRemove.length})
                  </button>
                )}
                {datesToRemove.length > 0 && !multiSelectRemoveMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setDatesToRemove([]);
                      showToast('Removal undone', 'success');
                    }}
                    style={styles.undoRemovalBtn}
                  >
                    Undo Removal ({datesToRemove.length})
                  </button>
                )}
              </div>

              {/* Multi-select mode indicator */}
              {multiSelectRemoveMode && (
                <div style={styles.multiSelectIndicator}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  Click on scheduled days (green) to mark them for removal. Click "Done Selecting" when finished.
                </div>
              )}

              {/* Recurring Days Toggle */}
              <div style={styles.recurringDaysContainer}>
                <span style={styles.recurringDaysLabel}>Select by day of week:</span>
                <div style={styles.recurringDaysGrid}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        toggleRecurringDay(i);
                        // Also apply the selection
                        const newDays = recurringDays.includes(i)
                          ? recurringDays.filter(d => d !== i)
                          : [...recurringDays, i];
                        if (newDays.length > 0) {
                          applyScheduleTemplate(newDays);
                        }
                      }}
                      style={{
                        ...styles.recurringDayBtn,
                        ...(recurringDays.includes(i) ? styles.recurringDayBtnActive : {}),
                      }}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calendar Navigation */}
              <div style={styles.scheduleCalendarHeader}>
                <button onClick={prevScheduleMonth} style={styles.scheduleNavButton}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span style={styles.scheduleMonthTitle}>
                  {scheduleModalMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={nextScheduleMonth} style={styles.scheduleNavButton}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              {/* Calendar Grid */}
              <div style={styles.scheduleCalendarGrid}>
                {/* Day Headers */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} style={styles.scheduleCalendarDayHeader}>{day}</div>
                ))}

                {/* Calendar Days */}
                {scheduleModalDays.map((day, index) => {
                  const isExisting = existingWorkDayDates.includes(day.date);
                  const isMarkedForRemoval = datesToRemove.includes(day.date);
                  const isNewlySelected = selectedDates.includes(day.date);
                  const isToday = day.date === new Date().toISOString().split('T')[0];
                  const isPast = new Date(day.date) < new Date(new Date().toISOString().split('T')[0]);
                  const dayOfWeek = new Date(day.date + 'T00:00:00').getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const isSelected = selectedDayForDetail === day.date;

                  return (
                    <button
                      key={index}
                      onClick={() => day.isCurrentMonth && handleDayClick(day.date)}
                      disabled={!day.isCurrentMonth}
                      style={{
                        ...styles.scheduleCalendarDay,
                        ...(day.isCurrentMonth ? {} : styles.scheduleCalendarDayOther),
                        ...(isToday ? styles.scheduleCalendarDayToday : {}),
                        ...(isWeekend && day.isCurrentMonth ? styles.scheduleCalendarDayWeekend : {}),
                        ...(isExisting && !isMarkedForRemoval ? styles.scheduleCalendarDayExisting : {}),
                        ...(isMarkedForRemoval ? styles.scheduleCalendarDayRemove : {}),
                        ...(isNewlySelected ? styles.scheduleCalendarDayNew : {}),
                        ...(isPast && day.isCurrentMonth ? styles.scheduleCalendarDayPast : {}),
                        ...(isSelected ? styles.scheduleCalendarDaySelected : {}),
                      }}
                    >
                      <span style={styles.scheduleCalendarDayNum}>{day.dayNum}</span>
                      {isExisting && !isMarkedForRemoval && (
                        <span style={styles.scheduleDayIndicator}>●</span>
                      )}
                      {isMarkedForRemoval && (
                        <span style={styles.scheduleDayRemoveIndicator}>✕</span>
                      )}
                      {isNewlySelected && (
                        <span style={styles.scheduleDayNewIndicator}>+</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div style={styles.scheduleModalLegend}>
                <div style={styles.legendItem}>
                  <span style={{ ...styles.legendDot, backgroundColor: theme.colors.status.info }} />
                  <span>Scheduled</span>
                </div>
                <div style={styles.legendItem}>
                  <span style={{ ...styles.legendDot, backgroundColor: theme.colors.status.success }} />
                  <span>Add</span>
                </div>
                <div style={styles.legendItem}>
                  <span style={{ ...styles.legendDot, backgroundColor: theme.colors.status.error }} />
                  <span>Remove</span>
                </div>
              </div>

              {/* Day Detail Panel - Shows when clicking a scheduled/selected day */}
              {selectedDayForDetail && (
                <div style={styles.dayDetailPanel}>
                  <div style={styles.dayDetailHeader}>
                    <div>
                      <h4 style={styles.dayDetailTitle}>{formatDate(selectedDayForDetail)}</h4>
                      <span style={styles.dayDetailSubtitle}>
                        {existingWorkDayDates.includes(selectedDayForDetail) ? 'Scheduled Work Day' : 'New Work Day'}
                      </span>
                    </div>
                    <button onClick={closeDayDetail} style={styles.dayDetailClose}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <div style={styles.dayDetailActions}>
                    <button
                      onClick={() => handleRemoveDay(selectedDayForDetail)}
                      style={styles.dayDetailRemoveBtn}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      {existingWorkDayDates.includes(selectedDayForDetail) ? 'Remove Day' : 'Unselect Day'}
                    </button>
                  </div>
                </div>
              )}

              {/* Summary of Changes */}
              {(selectedDates.length > 0 || datesToRemove.length > 0) && (
                <div style={styles.changesSummary}>
                  {selectedDates.length > 0 && (
                    <span style={styles.addingSummary}>
                      +{selectedDates.length} day{selectedDates.length !== 1 ? 's' : ''} to add
                    </span>
                  )}
                  {datesToRemove.length > 0 && (
                    <span style={styles.removingSummary}>
                      -{datesToRemove.length} day{datesToRemove.length !== 1 ? 's' : ''} to remove
                    </span>
                  )}
                </div>
              )}

              {/* Notes */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Notes for new days (optional)</label>
                <input
                  type="text"
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  placeholder="e.g., Morning shift, Remote work..."
                  style={styles.input}
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button onClick={() => { setShowScheduleModal(false); resetScheduleForm(); }} style={styles.cancelButton}>
                Cancel
              </button>
              <button
                onClick={handleAddSchedule}
                style={{
                  ...styles.saveButton,
                  opacity: (selectedDates.length === 0 && datesToRemove.length === 0) ? 0.5 : 1,
                }}
                disabled={selectedDates.length === 0 && datesToRemove.length === 0}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Day Detail Modal */}
      {calendarDetailModal && (() => {
        const day = workDays.find(
          wd => wd.employeeId === calendarDetailModal.employeeId
            && wd.workDate === calendarDetailModal.date
            && wd.status !== 'cancelled'
        );
        return (
          <div style={styles.modalOverlay} onClick={() => setCalendarDetailModal(null)}>
            <div style={{ ...styles.modal, maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>{getUserName(calendarDetailModal.employeeId)}</h2>
                <button onClick={() => setCalendarDetailModal(null)} style={styles.closeButton}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div style={styles.modalContent}>
                <div style={styles.calendarDetailDate}>
                  {formatDate(calendarDetailModal.date)}
                </div>
                {day?.notes
                  ? <p style={styles.calendarDetailNote}>{day.notes}</p>
                  : <p style={styles.calendarDetailNoteEmpty}>Scheduled to work. No note for this day.</p>}
              </div>

              <div style={styles.modalFooter}>
                {isAdmin && day && (
                  <button
                    onClick={async () => {
                      // Reuse the one place that removes a working day, so the
                      // confirm copy and the toast stay identical everywhere.
                      await handleDeleteWorkDay(day.id);
                      setCalendarDetailModal(null);
                    }}
                    style={styles.deleteButton}
                  >
                    Remove from schedule
                  </button>
                )}
                <button onClick={() => setCalendarDetailModal(null)} style={styles.cancelButton}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {confirmDialog}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '40px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  containerMobile: {
    padding: '16px',
    maxWidth: '100%',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  headerMobile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    marginBottom: '20px',
    gap: '12px',
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.txt.primary,
    margin: 0,
  },
  titleMobile: {
    ...theme.typography.h1Mobile,
    color: theme.colors.txt.primary,
    margin: 0,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.txt.secondary,
    marginTop: '8px',
  },
  subtitleMobile: {
    ...theme.typography.body,
    color: theme.colors.txt.secondary,
    marginTop: '4px',
    fontSize: '13px',
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  addButtonMobile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: theme.colors.bg.tertiary,
    color: theme.colors.txt.primary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  filtersContainer: {
    backgroundColor: theme.colors.bg.secondary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.lg,
    padding: '20px',
    marginBottom: '24px',
  },
  filtersContainerMobile: {
    backgroundColor: theme.colors.bg.secondary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.lg,
    padding: '12px',
    marginBottom: '16px',
  },
  filtersRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
  },
  filtersRowMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    alignItems: 'stretch',
  },
  viewToggle: {
    display: 'flex',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    padding: '4px',
  },
  viewToggleMobile: {
    display: 'flex',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    padding: '3px',
    width: '100%',
  },
  toggleButton: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.txt.secondary,
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  toggleButtonMobile: {
    padding: '8px 8px',
    fontSize: '13px',
    flex: 1,
    textAlign: 'center',
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
  },
  filterSelect: {
    padding: '10px 16px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '14px',
    cursor: 'pointer',
    minWidth: '150px',
  },
  filterSelectMobile: {
    padding: '10px 12px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '14px',
    cursor: 'pointer',
    width: '100%',
  },
  listContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: theme.borderRadius.full,
    fontSize: '12px',
    fontWeight: 600,
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  deleteButton: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.status.error}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.status.error,
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  approveButton: {
    padding: '8px 16px',
    backgroundColor: theme.colors.status.success,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    color: '#FFFFFF',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  rejectButton: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.status.error}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.status.error,
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 24px',
    textAlign: 'center',
    color: theme.colors.txt.tertiary,
  },
  summaryContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))',
    gap: '20px',
  },
  summaryCard: {
    backgroundColor: theme.colors.bg.secondary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
  },
  summaryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
  },
  summaryName: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  summaryTotal: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  totalValue: {
    fontSize: '32px',
    fontWeight: 700,
    color: theme.colors.primary,
  },
  totalLabel: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
    textTransform: 'uppercase',
  },
  summaryStats: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: '16px',
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  statLabel: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
  },
  // Modal styles
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
    padding: '20px',
  },
  modal: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `2px solid ${theme.colors.bdr.primary}`,
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90dvh',
    overflow: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  modalTitle: {
    ...theme.typography.h3,
    color: theme.colors.txt.primary,
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: theme.colors.txt.secondary,
    cursor: 'pointer',
    padding: '4px',
  },
  modalContent: {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
  },
  input: {
    padding: '12px 16px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '15px',
    outline: 'none',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '20px 24px',
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  },
  cancelButton: {
    padding: '12px 24px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  saveButton: {
    padding: '12px 24px',
    backgroundColor: theme.colors.primary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    color: '#FFFFFF',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  // Schedule view styles
  scheduleDateGroup: {
    backgroundColor: theme.colors.bg.secondary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.lg,
    marginBottom: '16px',
    overflow: 'hidden',
  },
  scheduleDateHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    backgroundColor: theme.colors.bg.tertiary,
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  scheduleDateTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  scheduleCount: {
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
  },
  scheduleEmployeeList: {
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  scheduleEmployeeCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
  },
  scheduleEmployeeInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  scheduleEmployeeName: {
    fontSize: '15px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
  },
  scheduleNotes: {
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
  },
  scheduleActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  scheduleStatusBadge: {
    padding: '4px 10px',
    borderRadius: theme.borderRadius.full,
    fontSize: '11px',
    fontWeight: 600,
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  scheduleDeleteBtn: {
    background: 'none',
    border: 'none',
    color: theme.colors.txt.tertiary,
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Date picker grid styles
  dateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gap: '8px',
  },
  dateButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 8px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  dateButtonSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    color: '#FFFFFF',
  },
  dateButtonWeekend: {
    opacity: 0.6,
  },
  dateDayName: {
    fontSize: '11px',
    fontWeight: 500,
    color: 'inherit',
    textTransform: 'uppercase',
  },
  dateDayNum: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'inherit',
  },
  selectedCount: {
    marginTop: '12px',
    fontSize: '14px',
    color: theme.colors.primary,
    fontWeight: 500,
  },
  // Schedule Templates styles
  scheduleTemplates: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  scheduleTemplatesLabel: {
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
    marginRight: '4px',
  },
  scheduleTemplateBtn: {
    padding: '6px 12px',
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.secondary,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  scheduleTemplateBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    color: '#FFFFFF',
  },
  clearSelectionBtn: {
    padding: '6px 12px',
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.status.error}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.status.error,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  clearAllScheduledBtn: {
    padding: '6px 12px',
    backgroundColor: 'rgba(226, 20, 79, 0.1)',
    border: `1px solid ${theme.colors.status.error}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.status.error,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  undoRemovalBtn: {
    padding: '6px 12px',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    border: `1px solid ${theme.colors.status.info}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.status.info,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  multiSelectBtn: {
    padding: '6px 12px',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    border: `1px solid ${theme.colors.status.warning}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.status.warning,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  multiSelectActiveBtn: {
    padding: '6px 12px',
    backgroundColor: theme.colors.status.warning,
    border: `1px solid ${theme.colors.status.warning}`,
    borderRadius: theme.borderRadius.md,
    color: '#000000',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  multiSelectIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    border: `1px solid ${theme.colors.status.warning}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.status.warning,
    fontSize: '13px',
    marginBottom: '12px',
  },
  recurringDaysContainer: {
    padding: '12px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    marginBottom: '16px',
  },
  recurringDaysLabel: {
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
    marginBottom: '8px',
    display: 'block',
  },
  recurringDaysGrid: {
    display: 'flex',
    gap: '6px',
  },
  recurringDayBtn: {
    flex: 1,
    padding: '8px 4px',
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.txt.secondary,
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
  },
  recurringDayBtnActive: {
    backgroundColor: theme.colors.status.success,
    borderColor: theme.colors.status.success,
    color: '#FFFFFF',
  },
  // Schedule Modal Calendar styles
  scheduleCalendarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  scheduleNavButton: {
    background: 'none',
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.sm,
    padding: '8px',
    color: theme.colors.txt.primary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleMonthTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  scheduleCalendarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gap: '2px',
    marginBottom: '10px',
  },
  scheduleCalendarDayHeader: {
    padding: '4px 2px',
    textAlign: 'center',
    fontSize: '10px',
    fontWeight: 600,
    color: theme.colors.txt.tertiary,
    textTransform: 'uppercase',
  },
  scheduleCalendarDay: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid transparent`,
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    transition: 'all 0.15s',
    position: 'relative',
    padding: '6px 2px',
    minHeight: '36px',
    color: theme.colors.txt.primary,
  },
  scheduleCalendarDayOther: {
    opacity: 0.3,
    cursor: 'default',
  },
  scheduleCalendarDayToday: {
    borderColor: theme.colors.primary,
    borderWidth: '2px',
  },
  scheduleCalendarDayWeekend: {
    // Same as regular days - no different color
  },
  scheduleCalendarDayExisting: {
    backgroundColor: theme.colors.status.info,
    color: '#FFFFFF',
  },
  scheduleCalendarDayNew: {
    backgroundColor: theme.colors.status.success,
    color: '#FFFFFF',
  },
  scheduleCalendarDayRemove: {
    backgroundColor: theme.colors.status.error,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  scheduleCalendarDayPast: {
    opacity: 0.5,
  },
  scheduleCalendarDayNum: {
    fontSize: '13px',
    fontWeight: 500,
    // No colour: inherited from the tile. The unselected tile is txt.primary
    // and the status fills below each set their own '#FFFFFF', so pinning a
    // value here would be wrong on one of the two in every mode.
  },
  scheduleDayIndicator: {
    fontSize: '6px',
    marginTop: '1px',
  },
  scheduleDayNewIndicator: {
    fontSize: '10px',
    fontWeight: 700,
    marginTop: '1px',
  },
  scheduleDayRemoveIndicator: {
    fontSize: '8px',
    fontWeight: 700,
    marginTop: '1px',
  },
  scheduleCalendarDaySelected: {
    // Has to read against the neutral tile AND against the saturated status
    // fills. White worked on both only while the tile was charcoal; txt.primary
    // is the one value that contrasts with all of them in both modes.
    outline: `3px solid ${theme.colors.txt.primary}`,
    outlineOffset: '-3px',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
  },
  // Day Detail Panel styles
  dayDetailPanel: {
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    padding: '16px',
    marginBottom: '16px',
    border: `2px solid ${theme.colors.bdr.secondary}`,
  },
  dayDetailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  dayDetailTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    margin: 0,
  },
  dayDetailSubtitle: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
  },
  dayDetailClose: {
    background: 'none',
    border: 'none',
    color: theme.colors.txt.tertiary,
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDetailActions: {
    display: 'flex',
    gap: '12px',
  },
  dayDetailRemoveBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.status.error}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.status.error,
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  scheduleModalLegend: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
    marginBottom: '10px',
    paddingBottom: '10px',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    fontSize: '12px',
  },
  changesSummary: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    marginBottom: '16px',
    fontSize: '14px',
    fontWeight: 500,
  },
  addingSummary: {
    color: theme.colors.status.success,
  },
  removingSummary: {
    color: theme.colors.status.error,
  },
  // Calendar styles
  calendarContainer: {
    backgroundColor: theme.colors.bg.secondary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
  },
  calendarContainerMobile: {
    backgroundColor: theme.colors.bg.secondary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.lg,
    padding: '12px',
  },
  calendarViewToggle: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '16px',
    gap: '4px',
  },
  calendarViewToggleBtn: {
    padding: '6px 16px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.secondary,
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  calendarViewToggleBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    color: '#FFFFFF',
  },
  calendarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
  },
  calendarHeaderMobile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
    gap: '8px',
  },
  calendarNavButton: {
    background: 'none',
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    padding: '8px',
    color: theme.colors.txt.primary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarNavButtonMobile: {
    background: 'none',
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.sm,
    padding: '6px',
    color: theme.colors.txt.primary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  calendarTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  calendarTitleMobile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
    minWidth: 0,
  },
  calendarMonthTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    margin: 0,
  },
  calendarMonthTitleMobile: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    margin: 0,
  },
  todayButton: {
    padding: '6px 12px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.txt.secondary,
    fontSize: '13px',
    cursor: 'pointer',
  },
  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gap: '1px',
    backgroundColor: theme.colors.bdr.primary,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  calendarDayHeader: {
    backgroundColor: theme.colors.bg.tertiary,
    padding: '12px 8px',
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    textTransform: 'uppercase',
  },
  calendarDayHeaderMobile: {
    backgroundColor: theme.colors.bg.tertiary,
    padding: '8px 2px',
    textAlign: 'center',
    fontSize: '11px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    textTransform: 'uppercase',
  },
  calendarDay: {
    backgroundColor: theme.colors.bg.secondary,
    minHeight: '100px',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
  },
  calendarDayMobile: {
    backgroundColor: theme.colors.bg.secondary,
    minHeight: '70px',
    padding: '4px',
    display: 'flex',
    flexDirection: 'column',
  },
  calendarDayOtherMonth: {
    backgroundColor: theme.colors.bg.primary,
    opacity: 0.5,
  },
  calendarDayToday: {
    backgroundColor: theme.colors.bg.tertiary,
  },
  calendarDayNum: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.txt.secondary,
    marginBottom: '4px',
  },
  calendarDayNumToday: {
    color: theme.colors.primary,
    fontWeight: 700,
  },
  calendarDayContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
  },
  calendarWorkDay: {
    padding: '2px 6px',
    borderRadius: theme.borderRadius.sm,
    fontSize: '11px',
    fontWeight: 500,
    color: '#FFFFFF',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '4px',
  },
  calendarWorkDayMobile: {
    padding: '2px 3px',
    borderRadius: theme.borderRadius.sm,
    fontSize: '9px',
    fontWeight: 500,
    color: '#FFFFFF',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '2px',
  },
  calendarMoreIndicator: {
    fontSize: '10px',
    color: theme.colors.txt.tertiary,
    marginTop: '2px',
  },
  calendarLegend: {
    display: 'flex',
    justifyContent: 'center',
    // Six employee chips plus 24px gaps come to roughly 540px, and this box is
    // 333px on a phone. Overflow under justifyContent:'center' is split BOTH
    // ways, so the first chip sat at x=-45 — off the left edge, where there is
    // no scrolling left to reach it. A row that centres must be free to wrap.
    flexWrap: 'wrap',
    gap: '12px 24px',
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: theme.colors.txt.secondary,
  },
  legendDot: {
    width: '12px',
    height: '12px',
    borderRadius: theme.borderRadius.full,
  },
  legendMore: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
    fontStyle: 'italic',
  },
  // Day View styles
  dayViewContainer: {
    marginTop: '16px',
  },
  dayViewContainerMobile: {
    marginTop: '12px',
  },
  dayViewCard: {
    backgroundColor: theme.colors.bg.tertiary,
    // Longhands: the day view overrides borderColor for today, and a shorthand
    // here loses the resting colour the moment that override goes away.
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: theme.colors.bdr.primary,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
    minHeight: '200px',
  },
  dayViewCardMobile: {
    backgroundColor: theme.colors.bg.tertiary,
    // Longhands: the day view overrides borderColor for today, and a shorthand
    // here loses the resting colour the moment that override goes away.
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: theme.colors.bdr.primary,
    borderRadius: theme.borderRadius.lg,
    padding: '16px',
    minHeight: '150px',
  },
  dayViewEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    textAlign: 'center',
    color: theme.colors.txt.tertiary,
    borderRadius: theme.borderRadius.md,
  },
  dayViewEmptyMobile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    textAlign: 'center',
    color: theme.colors.txt.tertiary,
    borderRadius: theme.borderRadius.md,
  },
  dayViewEntries: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  dayViewEntry: {
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    padding: '16px',
    cursor: 'pointer',
  },
  dayViewEntryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  dayViewEntryName: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  dayViewEntryDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  dayViewEntryTime: {
    fontSize: '14px',
    color: theme.colors.txt.secondary,
  },
  // Week View styles
  weekViewContainer: {
    marginTop: '16px',
  },
  weekViewContainerMobile: {
    marginTop: '12px',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    paddingBottom: '8px',
  },
  weekViewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gap: '8px',
  },
  weekViewGridMobile: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(min(80px, 100%), 1fr))',
    gap: '6px',
    minWidth: '600px',
  },
  weekViewDay: {
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    minHeight: '280px',
    display: 'flex',
    flexDirection: 'column',
  },
  weekViewDayMobile: {
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    minHeight: '200px',
    display: 'flex',
    flexDirection: 'column',
  },
  weekViewDayToday: {
    borderColor: theme.colors.primary,
    borderWidth: '2px',
  },
  weekViewDayHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 8px',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  weekViewDayHeaderMobile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 4px',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  weekViewDayName: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.txt.tertiary,
    textTransform: 'uppercase',
  },
  weekViewDayNameMobile: {
    fontSize: '10px',
    fontWeight: 600,
    color: theme.colors.txt.tertiary,
    textTransform: 'uppercase',
  },
  weekViewDayNum: {
    fontSize: '24px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginTop: '4px',
  },
  weekViewDayNumMobile: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginTop: '2px',
  },
  weekViewDayNumToday: {
    color: theme.colors.primary,
  },
  weekViewDayContent: {
    flex: 1,
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    overflow: 'auto',
  },
  weekViewDayContentMobile: {
    flex: 1,
    padding: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    overflow: 'auto',
  },
  weekViewEmpty: {
    textAlign: 'center',
    color: theme.colors.txt.tertiary,
    fontSize: '13px',
    paddingTop: '20px',
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekViewEmptyMobile: {
    textAlign: 'center',
    color: theme.colors.txt.tertiary,
    fontSize: '11px',
    paddingTop: '16px',
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekViewAddBtn: {
    padding: '6px 12px',
    backgroundColor: theme.colors.bg.secondary,
    border: `1px dashed ${theme.colors.bdr.secondary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.tertiary,
    fontSize: '12px',
    fontWeight: 500,
  },
  weekViewAddBtnMobile: {
    padding: '4px 8px',
    backgroundColor: theme.colors.bg.secondary,
    border: `1px dashed ${theme.colors.bdr.secondary}`,
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.txt.tertiary,
    fontSize: '10px',
    fontWeight: 500,
  },
  weekViewEntry: {
    padding: '8px 10px',
    borderRadius: theme.borderRadius.md,
    fontSize: '13px',
    fontWeight: 500,
    color: '#FFFFFF',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  weekViewEntryMobile: {
    padding: '6px 8px',
    borderRadius: theme.borderRadius.sm,
    fontSize: '11px',
    fontWeight: 500,
    color: '#FFFFFF',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  weekViewEntryName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  weekViewEntryNameMobile: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    fontSize: '10px',
  },
  // Calendar Employee Detail Modal styles
  calendarDetailNote: {
    ...theme.typography.body,
    color: theme.colors.txt.secondary,
    margin: `${theme.spacing.md} 0 0`,
    wordBreak: 'break-word',
  },
  calendarDetailNoteEmpty: {
    ...theme.typography.body,
    color: theme.colors.txt.tertiary,
    fontStyle: 'italic',
    margin: `${theme.spacing.md} 0 0`,
  },
  calendarDetailDate: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    textAlign: 'center',
    padding: '12px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    marginBottom: '16px',
  },
};

export default WorkHoursPage;
