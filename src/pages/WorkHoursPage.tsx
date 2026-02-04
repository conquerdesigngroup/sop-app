import React, { useState, useMemo } from 'react';
import { theme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useWorkHours, calculateTotalHours } from '../contexts/WorkHoursContext';
import { useResponsive } from '../hooks/useResponsive';
import { WorkHoursEntry, User } from '../types';
import { useToast } from '../contexts/ToastContext';

// Generate unique ID
const generateId = () => `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const WorkHoursPage: React.FC = () => {
  const { currentUser, users, isAdmin } = useAuth();
  const { workHours, addWorkHours, updateWorkHours, deleteWorkHours, approveWorkHours, rejectWorkHours, getAllWorkHoursSummaries } = useWorkHours();
  const { showToast } = useToast();
  const { isMobileOrTablet } = useResponsive();

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WorkHoursEntry | null>(null);

  // Filter states
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<'week' | 'month' | 'all'>('week');
  const [viewMode, setViewMode] = useState<'list' | 'summary'>('list');

  // Form states
  const [formEmployee, setFormEmployee] = useState<string>(currentUser?.id || '');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('17:00');
  const [formBreakMinutes, setFormBreakMinutes] = useState(30);
  const [formNotes, setFormNotes] = useState('');

  // Calculate date range
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
              List
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
};

export default WorkHoursPage;
