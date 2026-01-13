import React, { useState } from 'react';
import { theme } from '../theme';
import { CalendarEvent, User } from '../types';
import { useResponsive } from '../hooks/useResponsive';

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isOpen || !event) return null;

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

  // Generate ICS content for calendar export
  const generateICSContent = () => {
    const formatICSDate = (dateStr: string, timeStr?: string) => {
      const date = new Date(dateStr);
      if (timeStr) {
        const [hours, minutes] = timeStr.split(':');
        date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      }
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const escapeICS = (text: string) => {
      return text.replace(/[,;\\]/g, '\\$&').replace(/\n/g, '\\n');
    };

    const startDateTime = event.isAllDay
      ? event.startDate.replace(/-/g, '')
      : formatICSDate(event.startDate, event.startTime);

    const endDateTime = event.isAllDay
      ? (event.endDate || event.startDate).replace(/-/g, '')
      : formatICSDate(event.endDate || event.startDate, event.endTime || event.startTime);

    const attendeeNames = getAttendeeNames();
    let description = event.description || '';
    if (attendeeNames.length > 0) {
      description += `\\n\\nAttendees: ${attendeeNames.join(', ')}`;
    }
    if (event.notes) {
      description += `\\n\\nNotes: ${event.notes}`;
    }

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SOP App//Calendar Event//EN',
      'BEGIN:VEVENT',
      `UID:${event.id}@sopapp`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      event.isAllDay ? `DTSTART;VALUE=DATE:${startDateTime}` : `DTSTART:${startDateTime}`,
      event.isAllDay ? `DTEND;VALUE=DATE:${endDateTime}` : `DTEND:${endDateTime}`,
      `SUMMARY:${escapeICS(event.title)}`,
      description ? `DESCRIPTION:${escapeICS(description)}` : '',
      event.location ? `LOCATION:${escapeICS(event.location)}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');

    return icsContent;
  };

  const downloadICSFile = () => {
    const icsContent = generateICSContent();
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDelete = () => {
    onDelete(event.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  const attendeeNames = getAttendeeNames();
  const recurrenceText = getRecurrenceText();

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
                <button onClick={downloadICSFile} style={styles.exportButton}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Export
                </button>
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
  exportButton: {
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
