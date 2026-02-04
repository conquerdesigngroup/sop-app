import React, { useState, useMemo } from 'react';
import { theme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useWorkHours, calculateTotalHours } from '../contexts/WorkHoursContext';
import { useResponsive } from '../hooks/useResponsive';
import { WorkHoursEntry, WorkDay } from '../types';
import { useToast } from '../contexts/ToastContext';

const WorkHoursPage: React.FC = () => {
  const { currentUser, users, isAdmin } = useAuth();
  const {
    workHours, addWorkHours, updateWorkHours, deleteWorkHours,
    approveWorkHours, rejectWorkHours, getAllWorkHoursSummaries,
    workDays, addWorkDays, deleteWorkDay, getWorkDaysByDateRange
  } = useWorkHours();
  const { showToast } = useToast();
  const { isMobileOrTablet } = useResponsive();

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WorkHoursEntry | null>(null);

  // Filter states
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<'week' | 'month' | 'all'>('week');
  const [viewMode, setViewMode] = useState<'list' | 'summary' | 'schedule' | 'calendar'>('list');

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Schedule form states
  const [scheduleEmployee, setScheduleEmployee] = useState<string>(currentUser?.id || '');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [scheduleNotes, setScheduleNotes] = useState('');

  // Form states
  const [formEmployee, setFormEmployee] = useState<string>(currentUser?.id || '');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('17:00');
  const [formBreakMinutes, setFormBreakMinutes] = useState(30);
  const [formNotes, setFormNotes] = useState('');

  // Calculate date range for work hours (past)
  const getDateRange = () => {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    let startDate: string;

    switch (filterDateRange) {
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = monthAgo.toISOString().split('T')[0];
        break;
      default:
        startDate = '2020-01-01';
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

  // Filter work hours
  const filteredWorkHours = useMemo(() => {
    const { startDate, endDate } = getDateRange();

    return workHours.filter(wh => {
      // Non-admins can only see their own entries
      if (!isAdmin && wh.employeeId !== currentUser?.id) return false;

      const matchesEmployee = filterEmployee === 'all' || wh.employeeId === filterEmployee;
      const matchesStatus = filterStatus === 'all' || wh.status === filterStatus;
      const matchesDate = filterDateRange === 'all' || (wh.workDate >= startDate && wh.workDate <= endDate);

      return matchesEmployee && matchesStatus && matchesDate;
    }).sort((a, b) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime());
  }, [workHours, filterEmployee, filterStatus, filterDateRange, isAdmin, currentUser]);

  // Get summaries
  const summaries = useMemo(() => {
    const { startDate, endDate } = getDateRange();
    return getAllWorkHoursSummaries(startDate, endDate);
  }, [getAllWorkHoursSummaries, filterDateRange]);

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

  // Navigate calendar
  const prevMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCalendarMonth(new Date());
  };

  // Get active employees
  const activeEmployees = useMemo(() => {
    return users.filter(u => u.isActive).sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );
  }, [users]);

  // Get user name
  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? `${user.firstName} ${user.lastName}` : 'Unknown';
  };

  // Reset form
  const resetForm = () => {
    setFormEmployee(currentUser?.id || '');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormStartTime('09:00');
    setFormEndTime('17:00');
    setFormBreakMinutes(30);
    setFormNotes('');
    setEditingEntry(null);
  };

  // Open edit modal
  const openEditModal = (entry: WorkHoursEntry) => {
    setEditingEntry(entry);
    setFormEmployee(entry.employeeId);
    setFormDate(entry.workDate);
    setFormStartTime(entry.startTime);
    setFormEndTime(entry.endTime);
    setFormBreakMinutes(entry.breakMinutes);
    setFormNotes(entry.notes || '');
    setShowAddModal(true);
  };

  // Handle save
  const handleSave = async () => {
    if (!formEmployee || !formDate || !formStartTime || !formEndTime) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    // Validate times
    if (formStartTime >= formEndTime) {
      showToast('End time must be after start time', 'error');
      return;
    }

    const entryData = {
      employeeId: formEmployee,
      workDate: formDate,
      startTime: formStartTime,
      endTime: formEndTime,
      breakMinutes: formBreakMinutes,
      totalHours: calculateTotalHours(formStartTime, formEndTime, formBreakMinutes),
      notes: formNotes || undefined,
    };

    try {
      if (editingEntry) {
        await updateWorkHours(editingEntry.id, entryData);
        showToast('Work hours updated', 'success');
      } else {
        await addWorkHours(entryData);
        showToast('Work hours added', 'success');
      }
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      showToast('Failed to save work hours', 'error');
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this entry?')) {
      await deleteWorkHours(id);
      showToast('Work hours deleted', 'success');
    }
  };

  // Handle approve/reject
  const handleApprove = async (id: string) => {
    await approveWorkHours(id);
    showToast('Work hours approved', 'success');
  };

  const handleReject = async (id: string) => {
    await rejectWorkHours(id);
    showToast('Work hours rejected', 'error');
  };

  // Schedule modal handlers
  const resetScheduleForm = () => {
    setScheduleEmployee(currentUser?.id || '');
    setSelectedDates([]);
    setScheduleNotes('');
  };

  const toggleDateSelection = (date: string) => {
    setSelectedDates(prev =>
      prev.includes(date)
        ? prev.filter(d => d !== date)
        : [...prev, date]
    );
  };

  const handleAddSchedule = async () => {
    if (!scheduleEmployee) {
      showToast('Please select an employee', 'error');
      return;
    }
    if (selectedDates.length === 0) {
      showToast('Please select at least one day', 'error');
      return;
    }

    try {
      console.log('Adding work days for employee:', scheduleEmployee, 'dates:', selectedDates);
      await addWorkDays(scheduleEmployee, selectedDates, scheduleNotes || undefined);
      showToast(`${selectedDates.length} working day(s) added`, 'success');
      setShowScheduleModal(false);
      resetScheduleForm();
      // Switch to calendar view to show the added days
      setViewMode('calendar');
    } catch (error: any) {
      console.error('Failed to add working days:', error);
      showToast(`Failed to add working days: ${error?.message || 'Unknown error'}`, 'error');
    }
  };

  const handleDeleteWorkDay = async (id: string) => {
    if (window.confirm('Remove this working day?')) {
      await deleteWorkDay(id);
      showToast('Working day removed', 'success');
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

  // Format time
  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return theme.colors.status.success;
      case 'rejected': return theme.colors.status.error;
      default: return theme.colors.status.warning;
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={isMobileOrTablet ? styles.titleMobile : styles.title}>Work Hours</h1>
          <p style={styles.subtitle}>
            {isAdmin ? 'Manage team schedules and work hours' : 'Track your work hours'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => { resetScheduleForm(); setShowScheduleModal(true); }}
            style={styles.secondaryButton}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Mark Days
          </button>
          <button
            onClick={() => { resetForm(); setShowAddModal(true); }}
            style={styles.addButton}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Hours
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filtersContainer}>
        <div style={styles.filtersRow}>
          {/* View Mode Toggle */}
          <div style={styles.viewToggle}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                ...styles.toggleButton,
                ...(viewMode === 'list' ? styles.toggleButtonActive : {}),
              }}
            >
              Hours
            </button>
            <button
              onClick={() => setViewMode('schedule')}
              style={{
                ...styles.toggleButton,
                ...(viewMode === 'schedule' ? styles.toggleButtonActive : {}),
              }}
            >
              Schedule
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              style={{
                ...styles.toggleButton,
                ...(viewMode === 'calendar' ? styles.toggleButtonActive : {}),
              }}
            >
              Calendar
            </button>
            <button
              onClick={() => setViewMode('summary')}
              style={{
                ...styles.toggleButton,
                ...(viewMode === 'summary' ? styles.toggleButtonActive : {}),
              }}
            >
              Summary
            </button>
          </div>

          {/* Date Range Filter */}
          <select
            value={filterDateRange}
            onChange={(e) => setFilterDateRange(e.target.value as 'week' | 'month' | 'all')}
            style={styles.filterSelect}
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
              style={styles.filterSelect}
            >
              <option value="all">All Employees</option>
              {activeEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </option>
              ))}
            </select>
          )}

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <div style={styles.listContainer}>
          {filteredWorkHours.length === 0 ? (
            <div style={styles.emptyState}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <h3>No work hours found</h3>
              <p>Add your first work hours entry to get started</p>
            </div>
          ) : (
            filteredWorkHours.map(entry => (
              <div key={entry.id} style={styles.entryCard}>
                <div style={styles.entryHeader}>
                  <div style={styles.entryDate}>{formatDate(entry.workDate)}</div>
                  <span style={{ ...styles.statusBadge, backgroundColor: getStatusColor(entry.status) }}>
                    {entry.status}
                  </span>
                </div>

                <div style={styles.entryContent}>
                  <div style={styles.entryInfo}>
                    {isAdmin && (
                      <div style={styles.employeeName}>{getUserName(entry.employeeId)}</div>
                    )}
                    <div style={styles.timeRange}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                    </div>
                    {entry.breakMinutes > 0 && (
                      <div style={styles.breakInfo}>
                        Break: {entry.breakMinutes} min
                      </div>
                    )}
                  </div>

                  <div style={styles.hoursDisplay}>
                    <span style={styles.hoursValue}>{entry.totalHours}</span>
                    <span style={styles.hoursLabel}>hours</span>
                  </div>
                </div>

                {entry.notes && (
                  <div style={styles.notesSection}>
                    <span style={styles.notesLabel}>Notes:</span> {entry.notes}
                  </div>
                )}

                <div style={styles.entryActions}>
                  {/* Edit/Delete buttons */}
                  {(isAdmin || entry.employeeId === currentUser?.id) && entry.status === 'pending' && (
                    <>
                      <button onClick={() => openEditModal(entry)} style={styles.actionButton}>
                        Edit
                      </button>
                      <button onClick={() => handleDelete(entry.id)} style={styles.deleteButton}>
                        Delete
                      </button>
                    </>
                  )}

                  {/* Approve/Reject buttons (Admin only) */}
                  {isAdmin && entry.status === 'pending' && (
                    <>
                      <button onClick={() => handleApprove(entry.id)} style={styles.approveButton}>
                        Approve
                      </button>
                      <button onClick={() => handleReject(entry.id)} style={styles.rejectButton}>
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : viewMode === 'schedule' ? (
        // Schedule View (Working Days)
        <div style={styles.listContainer}>
          {filteredWorkDays.length === 0 ? (
            <div style={styles.emptyState}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="1.5">
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
      ) : viewMode === 'calendar' ? (
        // Calendar View
        <div style={styles.calendarContainer}>
          {/* Calendar Header */}
          <div style={styles.calendarHeader}>
            <button onClick={prevMonth} style={styles.calendarNavButton}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div style={styles.calendarTitle}>
              <h3 style={styles.calendarMonthTitle}>
                {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h3>
              <button onClick={goToToday} style={styles.todayButton}>Today</button>
            </div>
            <button onClick={nextMonth} style={styles.calendarNavButton}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Calendar Grid */}
          <div style={styles.calendarGrid}>
            {/* Day Headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} style={styles.calendarDayHeader}>{day}</div>
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
                    ...styles.calendarDay,
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
                      {dayWorkDays.slice(0, 3).map(wd => (
                        <div
                          key={wd.id}
                          style={{
                            ...styles.calendarWorkDay,
                            backgroundColor: wd.status === 'confirmed' ? theme.colors.status.success :
                              wd.status === 'cancelled' ? theme.colors.status.error : theme.colors.status.info,
                          }}
                          title={`${getUserName(wd.employeeId)}${wd.notes ? ` - ${wd.notes}` : ''}`}
                        >
                          {getUserName(wd.employeeId).split(' ')[0]}
                        </div>
                      ))}
                      {dayWorkDays.length > 3 && (
                        <div style={styles.calendarMoreIndicator}>
                          +{dayWorkDays.length - 3} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={styles.calendarLegend}>
            <div style={styles.legendItem}>
              <span style={{ ...styles.legendDot, backgroundColor: theme.colors.status.info }} />
              <span>Scheduled</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.legendDot, backgroundColor: theme.colors.status.success }} />
              <span>Confirmed</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.legendDot, backgroundColor: theme.colors.status.error }} />
              <span>Cancelled</span>
            </div>
          </div>
        </div>
      ) : (
        // Summary View
        <div style={styles.summaryContainer}>
          {summaries.length === 0 ? (
            <div style={styles.emptyState}>
              <h3>No data for this period</h3>
            </div>
          ) : (
            summaries.map(summary => (
              <div key={summary.employeeId} style={styles.summaryCard}>
                <div style={styles.summaryHeader}>
                  <div style={styles.summaryName}>{summary.employeeName}</div>
                  <div style={styles.summaryTotal}>
                    <span style={styles.totalValue}>{summary.totalHours}</span>
                    <span style={styles.totalLabel}>total hours</span>
                  </div>
                </div>
                <div style={styles.summaryStats}>
                  <div style={styles.statItem}>
                    <span style={styles.statValue}>{summary.daysWorked}</span>
                    <span style={styles.statLabel}>days</span>
                  </div>
                  <div style={styles.statItem}>
                    <span style={{ ...styles.statValue, color: theme.colors.status.success }}>{summary.approvedHours}</span>
                    <span style={styles.statLabel}>approved</span>
                  </div>
                  <div style={styles.statItem}>
                    <span style={{ ...styles.statValue, color: theme.colors.status.warning }}>{summary.pendingHours}</span>
                    <span style={styles.statLabel}>pending</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{editingEntry ? 'Edit Work Hours' : 'Add Work Hours'}</h2>
              <button onClick={() => setShowAddModal(false)} style={styles.closeButton}>
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
                    value={formEmployee}
                    onChange={(e) => setFormEmployee(e.target.value)}
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

              {/* Date */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  style={styles.input}
                />
              </div>

              {/* Time Row */}
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Start Time</label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>End Time</label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              {/* Break */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Break (minutes)</label>
                <input
                  type="number"
                  value={formBreakMinutes}
                  onChange={(e) => setFormBreakMinutes(Number(e.target.value))}
                  min={0}
                  max={120}
                  style={styles.input}
                />
              </div>

              {/* Calculated Hours Preview */}
              <div style={styles.hoursPreview}>
                <span>Total Hours:</span>
                <span style={styles.hoursPreviewValue}>
                  {calculateTotalHours(formStartTime, formEndTime, formBreakMinutes)}
                </span>
              </div>

              {/* Notes */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Notes (optional)</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Add any notes about this shift..."
                  style={styles.textarea}
                  rows={3}
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button onClick={() => setShowAddModal(false)} style={styles.cancelButton}>
                Cancel
              </button>
              <button onClick={handleSave} style={styles.saveButton}>
                {editingEntry ? 'Update' : 'Add Hours'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal (Mark Working Days) */}
      {showScheduleModal && (
        <div style={styles.modalOverlay} onClick={() => setShowScheduleModal(false)}>
          <div style={{ ...styles.modal, maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Mark Working Days</h2>
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
                    onChange={(e) => setScheduleEmployee(e.target.value)}
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

              {/* Date Selection */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Select Days (next 2 weeks)</label>
                <div style={styles.dateGrid}>
                  {nextTwoWeeks.map(date => {
                    const isSelected = selectedDates.includes(date);
                    const dayName = getDayName(date);
                    const dayNum = new Date(date + 'T00:00:00').getDate();
                    const isWeekend = ['Sat', 'Sun'].includes(dayName);

                    return (
                      <button
                        key={date}
                        onClick={() => toggleDateSelection(date)}
                        style={{
                          ...styles.dateButton,
                          ...(isSelected ? styles.dateButtonSelected : {}),
                          ...(isWeekend && !isSelected ? styles.dateButtonWeekend : {}),
                        }}
                      >
                        <span style={styles.dateDayName}>{dayName}</span>
                        <span style={styles.dateDayNum}>{dayNum}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedDates.length > 0 && (
                  <div style={styles.selectedCount}>
                    {selectedDates.length} day{selectedDates.length !== 1 ? 's' : ''} selected
                  </div>
                )}
              </div>

              {/* Notes */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Notes (optional)</label>
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
              <button onClick={() => setShowScheduleModal(false)} style={styles.cancelButton}>
                Cancel
              </button>
              <button onClick={handleAddSchedule} style={styles.saveButton}>
                Add {selectedDates.length > 0 ? `${selectedDates.length} Day${selectedDates.length !== 1 ? 's' : ''}` : 'Days'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '40px',
    maxWidth: '1200px',
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
  filtersRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
  },
  viewToggle: {
    display: 'flex',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    padding: '4px',
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
  listContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  entryCard: {
    backgroundColor: theme.colors.bg.secondary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.lg,
    padding: '20px',
  },
  entryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  entryDate: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: theme.borderRadius.full,
    fontSize: '12px',
    fontWeight: 600,
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  entryContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  employeeName: {
    fontSize: '15px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: '4px',
  },
  timeRange: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: theme.colors.txt.secondary,
  },
  breakInfo: {
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
  },
  hoursDisplay: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: theme.colors.bg.tertiary,
    padding: '12px 20px',
    borderRadius: theme.borderRadius.md,
  },
  hoursValue: {
    fontSize: '28px',
    fontWeight: 700,
    color: theme.colors.primary,
  },
  hoursLabel: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
    textTransform: 'uppercase',
  },
  notesSection: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    color: theme.colors.txt.secondary,
  },
  notesLabel: {
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  entryActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  },
  actionButton: {
    padding: '8px 16px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
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
    maxHeight: '90vh',
    overflow: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
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
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
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
  textarea: {
    padding: '12px 16px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '15px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  hoursPreview: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    color: theme.colors.txt.secondary,
  },
  hoursPreviewValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: theme.colors.primary,
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
    gridTemplateColumns: 'repeat(7, 1fr)',
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
  // Calendar styles
  calendarContainer: {
    backgroundColor: theme.colors.bg.secondary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
  },
  calendarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
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
  calendarTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  calendarMonthTitle: {
    fontSize: '20px',
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
    gridTemplateColumns: 'repeat(7, 1fr)',
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
  calendarDay: {
    backgroundColor: theme.colors.bg.secondary,
    minHeight: '100px',
    padding: '8px',
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
  },
  calendarMoreIndicator: {
    fontSize: '10px',
    color: theme.colors.txt.tertiary,
    marginTop: '2px',
  },
  calendarLegend: {
    display: 'flex',
    justifyContent: 'center',
    gap: '24px',
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
};

export default WorkHoursPage;
