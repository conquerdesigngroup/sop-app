import React, { useState } from 'react';
import { theme } from '../theme';
import { CalendarEvent, User } from '../types';
import { useResponsive } from '../hooks/useResponsive';
import { useEvent } from '../contexts/EventContext';
import { useToast } from '../contexts/ToastContext';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import {
  generateGoogleCalendarUrl,
  generateICSForEvent,
  downloadICS,
  openGoogleCalendar,
  copyCalendarLink,
} from '../utils/calendarExport';

interface EventDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: CalendarEvent | null;
  users: User[];
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
}

const EventDetailModal: React.FC<EventDetailModalProps> = ({
  isOpen,
  onClose,
  event,
  users,
  onEdit,
  onDelete,
}) => {
  const { isMobileOrTablet } = useResponsive();
  const { tags: allTags } = useEvent();
  const { showToast } = useToast();
  const { isConnected: isGoogleConnected, syncEventToGoogle } = useGoogleCalendar();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCalendarMenu, setShowCalendarMenu] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  if (!isOpen || !event) return null;

  // Get tag names for display
  const getTagNames = () => {
    if (!event.tags || event.tags.length === 0) return [];
    return event.tags
      .map(tagId => allTags.find(t => t.id === tagId))
      .filter(Boolean)
      .map(t => t!.name);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getAttendeeNames = () => {
    return event.attendees
      .map(id => users.find(u => u.id === id))
      .filter(Boolean)
      .map(u => `${u!.firstName} ${u!.lastName}`);
  };

  const getReminderText = () => {
    if (!event.reminders || event.reminders.length === 0) return 'None';
    const time = event.reminders[0].time;
    if (time < 60) return `${time} minutes before`;
    if (time < 1440) return `${time / 60} hour${time / 60 > 1 ? 's' : ''} before`;
    return `${time / 1440} day${time / 1440 > 1 ? 's' : ''} before`;
  };

  const getRecurrenceText = () => {
    if (!event.isRecurring || !event.recurrencePattern) return null;
    const pattern = event.recurrencePattern;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let text = '';
    switch (pattern.frequency) {
      case 'daily':
        text = 'Repeats daily';
        break;
      case 'weekly':
        if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
          const days = pattern.daysOfWeek.map(d => dayNames[d]).join(', ');
          text = `Repeats weekly on ${days}`;
        } else {
          text = 'Repeats weekly';
        }
        break;
      case 'monthly':
        text = 'Repeats monthly';
        break;
    }

    if (pattern.endDate) {
      text += ` until ${formatDate(pattern.endDate)}`;
    }

    return text;
  };

  // Calendar export handlers
  const handleAddToGoogleCalendar = () => {
    const url = generateGoogleCalendarUrl(event);
    openGoogleCalendar(url);
    setShowCalendarMenu(false);
    showToast('Opening Google Calendar...', 'success');
  };

  const handleDownloadICS = () => {
    const icsContent = generateICSForEvent(event);
    const filename = event.title.replace(/[^a-zA-Z0-9]/g, '_');
    downloadICS(icsContent, filename);
    setShowCalendarMenu(false);
    showToast('Calendar file downloaded', 'success');
  };

  const handleCopyCalendarLink = async () => {
    const url = generateGoogleCalendarUrl(event);
    const success = await copyCalendarLink(url);
    setShowCalendarMenu(false);
    if (success) {
      showToast('Calendar link copied to clipboard', 'success');
    } else {
      showToast('Failed to copy link', 'error');
    }
  };

  const handleSyncToGoogleCalendar = async () => {
    if (!isGoogleConnected) {
      showToast('Please connect your Google Calendar in Settings first', 'info');
      setShowCalendarMenu(false);
      return;
    }

    setIsSyncing(true);
    try {
      const success = await syncEventToGoogle(event);
      setShowCalendarMenu(false);
      if (success) {
        showToast('Event synced to Google Calendar!', 'success');
      } else {
        showToast('Failed to sync event', 'error');
      }
    } catch (error) {
      showToast('Error syncing to Google Calendar', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = () => {
    onDelete(event.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  const attendeeNames = getAttendeeNames();
  const recurrenceText = getRecurrenceText();
  const tagNames = getTagNames();

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={isMobileOrTablet ? styles.modalMobile : styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with color bar */}
        <div style={{ ...styles.colorBar, backgroundColor: event.color }} />

        <div style={styles.header}>
          <div style={styles.headerContent}>
            <h2 style={styles.title}>{event.title}</h2>
            {event.isAllDay && (
              <span style={styles.allDayBadge}>All Day</span>
            )}
          </div>
          <button onClick={onClose} style={styles.closeButton}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Date & Time */}
          <div style={styles.infoRow}>
            <div style={styles.iconWrapper}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div style={styles.infoContent}>
              <div style={styles.dateText}>{formatDate(event.startDate)}</div>
              {!event.isAllDay && event.startTime && (
                <div style={styles.timeText}>
                  {formatTime(event.startTime)}
                  {event.endTime && ` - ${formatTime(event.endTime)}`}
                </div>
              )}
              {event.endDate && event.endDate !== event.startDate && (
                <div style={styles.endDateText}>
                  to {formatDate(event.endDate)}
                </div>
              )}
            </div>
          </div>

          {/* Recurrence */}
          {recurrenceText && (
            <div style={styles.infoRow}>
              <div style={styles.iconWrapper}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </div>
              <div style={styles.infoContent}>
                <div style={styles.infoText}>{recurrenceText}</div>
              </div>
            </div>
          )}

          {/* Location */}
          {event.location && (
            <div style={styles.infoRow}>
              <div style={styles.iconWrapper}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div style={styles.infoContent}>
                <div style={styles.infoText}>{event.location}</div>
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div style={styles.infoRow}>
              <div style={styles.iconWrapper}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="17" y1="10" x2="3" y2="10" />
                  <line x1="21" y1="6" x2="3" y2="6" />
                  <line x1="21" y1="14" x2="3" y2="14" />
                  <line x1="17" y1="18" x2="3" y2="18" />
                </svg>
              </div>
              <div style={styles.infoContent}>
                <div style={styles.descriptionText}>{event.description}</div>
              </div>
            </div>
          )}

          {/* Attendees */}
          {attendeeNames.length > 0 && (
            <div style={styles.infoRow}>
              <div style={styles.iconWrapper}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div style={styles.infoContent}>
                <div style={styles.attendeesContainer}>
                  {attendeeNames.map((name, index) => (
                    <span key={index} style={styles.attendeeTag}>{name}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tags */}
          {tagNames.length > 0 && (
            <div style={styles.infoRow}>
              <div style={styles.iconWrapper}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
              </div>
              <div style={styles.infoContent}>
                <div style={styles.tagsContainer}>
                  {tagNames.map((name, index) => (
                    <span key={index} style={styles.tagBadge}>{name}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Reminder */}
          <div style={styles.infoRow}>
            <div style={styles.iconWrapper}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div style={styles.infoContent}>
              <div style={styles.infoText}>{getReminderText()}</div>
            </div>
          </div>

          {/* Notes */}
          {event.notes && (
            <div style={styles.infoRow}>
              <div style={styles.iconWrapper}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <div style={styles.infoContent}>
                <div style={styles.notesText}>{event.notes}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          {showDeleteConfirm ? (
            <div style={styles.deleteConfirm}>
              <span style={styles.deleteConfirmText}>Delete this event?</span>
              <button onClick={() => setShowDeleteConfirm(false)} style={styles.cancelDeleteButton}>
                Cancel
              </button>
              <button onClick={handleDelete} style={styles.confirmDeleteButton}>
                Delete
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => setShowDeleteConfirm(true)} style={styles.deleteButton}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Delete
              </button>
              <div style={styles.rightButtons}>
                {/* Add to Calendar Dropdown */}
                <div style={styles.calendarDropdownContainer}>
                  <button
                    onClick={() => setShowCalendarMenu(!showCalendarMenu)}
                    style={styles.calendarButton}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                      <line x1="12" y1="14" x2="12" y2="18" />
                      <line x1="10" y1="16" x2="14" y2="16" />
                    </svg>
                    Add to Calendar
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '4px' }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {showCalendarMenu && (
                    <div style={styles.calendarDropdown}>
                      {isGoogleConnected && (
                        <button
                          onClick={handleSyncToGoogleCalendar}
                          style={styles.calendarMenuItem}
                          disabled={isSyncing}
                        >
                          {isSyncing ? (
                            <div style={styles.syncSpinner} />
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.success} strokeWidth="2">
                              <polyline points="17 1 21 5 17 9" />
                              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                              <polyline points="7 23 3 19 7 15" />
                              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                            </svg>
                          )}
                          {isSyncing ? 'Syncing...' : 'Sync to My Calendar'}
                        </button>
                      )}
                      <button onClick={handleAddToGoogleCalendar} style={styles.calendarMenuItem}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Open in Google Calendar
                      </button>
                      <button onClick={handleDownloadICS} style={styles.calendarMenuItem}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download .ics File
                      </button>
                      <button onClick={handleCopyCalendarLink} style={styles.calendarMenuItem}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        Copy Link
                      </button>
                    </div>
                  )}
                </div>
                <button onClick={() => onEdit(event)} style={styles.editButton}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
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
    backgroundColor: theme.colors.backgroundLight,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalMobile: {
    backgroundColor: theme.colors.backgroundLight,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    width: '100%',
    maxWidth: '100%',
    maxHeight: '95vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  colorBar: {
    height: '8px',
    width: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '20px 24px',
    borderBottom: `2px solid ${theme.colors.border}`,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    margin: 0,
    marginBottom: '8px',
  },
  allDayBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.full,
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: theme.colors.textMuted,
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.sm,
    transition: 'all 0.2s',
    marginLeft: '16px',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
  },
  infoRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '20px',
  },
  iconWrapper: {
    flexShrink: 0,
    width: '24px',
    display: 'flex',
    justifyContent: 'center',
    color: theme.colors.textMuted,
  },
  infoContent: {
    flex: 1,
  },
  dateText: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  timeText: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    marginTop: '4px',
  },
  endDateText: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    marginTop: '4px',
  },
  infoText: {
    fontSize: '15px',
    color: theme.colors.textPrimary,
  },
  descriptionText: {
    fontSize: '15px',
    color: theme.colors.textSecondary,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  notesText: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  attendeesContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  attendeeTag: {
    padding: '6px 12px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.full,
    fontSize: '13px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tagBadge: {
    padding: '5px 10px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.full,
    fontSize: '12px',
    fontWeight: 500,
    color: theme.colors.textSecondary,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderTop: `2px solid ${theme.colors.border}`,
  },
  deleteButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.status.error}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.status.error,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  rightButtons: {
    display: 'flex',
    gap: '12px',
  },
  calendarDropdownContainer: {
    position: 'relative',
  },
  calendarButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  calendarDropdown: {
    position: 'absolute',
    bottom: '100%',
    right: 0,
    marginBottom: '8px',
    backgroundColor: theme.colors.backgroundLight,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.3)',
    minWidth: '200px',
    zIndex: 10,
    overflow: 'hidden',
  },
  calendarMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '12px 16px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.colors.textPrimary,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.2s',
  },
  syncSpinner: {
    width: '16px',
    height: '16px',
    border: `2px solid ${theme.colors.border}`,
    borderTopColor: theme.colors.status.success,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  editButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: theme.colors.primary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    color: '#FFFFFF',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  deleteConfirm: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
  },
  deleteConfirmText: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  cancelDeleteButton: {
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
  },
  confirmDeleteButton: {
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: theme.colors.status.error,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    color: '#FFFFFF',
    cursor: 'pointer',
  },
};

export default EventDetailModal;
