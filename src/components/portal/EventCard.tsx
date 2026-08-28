import React from 'react';
import { theme } from '../../theme';
import { Button, Modal, CalendarIcon } from '../ui';
import { formatEventDate, describeEventWhen } from '../../lib/portal';
import { PortalEvent } from '../../types';
import { useAddToCalendar } from './useAddToCalendar';
import {
  AttachmentList,
  useAttachments,
} from '../calendar/EventAttachments';

/**
 * One event, opened from either calendar view.
 *
 * The list already shows title, time and location, so this exists for what it
 * cannot: the description in full rather than clipped, whatever the studio has
 * attached to the event, and a labelled "Add to my calendar" rather than the
 * row's bare icon.
 *
 * Attachments are fetched on open rather than with the calendar. A term is
 * dozens of events and almost none get opened; one small query on tap beats a
 * join nobody reads. RLS decides what comes back — a file on the Staff
 * calendar is not readable here at all, whatever this asks for.
 */

interface EventCardProps {
  event: PortalEvent | null;
  onClose: () => void;
}

const Line: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: '14px' }}>
    <div style={{
      ...theme.typography.captionSmall,
      fontFamily: theme.fonts.mono,
      color: theme.colors.txt.tertiary,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      marginBottom: '4px',
    }}>
      {label}
    </div>
    <div style={{
      ...theme.typography.body,
      fontFamily: theme.fonts.primary,
      color: theme.colors.txt.primary,
      minWidth: 0,
      overflowWrap: 'anywhere',
    }}>
      {children}
    </div>
  </div>
);

const EventCard: React.FC<EventCardProps> = ({ event, onClose }) => {
  const { add, busyId } = useAddToCalendar();
  const { items: attachments } = useAttachments(
    event?.googleCalendarId, event?.googleEventId
  );

  // Hooks first, then bail: an early return above these would change the hook
  // order between renders.
  if (!event) return null;

  const fullDate = formatEventDate(event.startsAt, event.isAllDay, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={event.title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            leftIcon={<CalendarIcon size={16} />}
            loading={busyId === event.id}
            onClick={() => add(event)}
          >
            Add to my calendar
          </Button>
        </>
      }
    >
      <Line label="When">
        {fullDate}
        <div style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.mono,
          color: theme.colors.txt.secondary,
          marginTop: '2px',
        }}>
          {describeEventWhen(event.startsAt, event.endsAt, event.isAllDay)}
        </div>
      </Line>

      {event.location && <Line label="Where">{event.location}</Line>}

      {attachments.length > 0 && (
        <Line label={attachments.length === 1 ? 'Attached' : 'Attached'}>
          <AttachmentList items={attachments} />
        </Line>
      )}

      {event.description && (
        <Line label="Details">
          <span style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.secondary,
            whiteSpace: 'pre-wrap',
          }}>
            {event.description}
          </span>
        </Line>
      )}
    </Modal>
  );
};

export default EventCard;
