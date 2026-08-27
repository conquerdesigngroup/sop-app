import React, { useMemo, useState } from 'react';
import { theme } from '../../theme';
import { Button, Modal, Input, Select, Textarea } from '../ui';
import { useEvent, EventDraft } from '../../contexts/EventContext';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { CalendarEvent } from '../../types';

/**
 * Create, edit or delete a studio calendar event.
 *
 * WHAT IT IS ACTUALLY EDITING
 *
 * Google. Nothing here writes calendar_events — saveEvent goes through the
 * staff-calendar-push function, which calls Google first and records the row
 * only once Google has accepted it. That ordering is the whole reason the
 * editor could come back: a row written locally would be deleted again by the
 * next sync's prune, so the old build's Add Event button was a button that
 * quietly undid itself.
 *
 * WHICH CALENDAR
 *
 * Required, and deliberately has no default when creating. The three calendars
 * are read by different people — Studio dates reach Academy parents, All-Stars
 * reaches the competition team — so guessing on the studio's behalf puts a
 * date in front of the wrong families. Picking is one tap; unpicking a mistake
 * is a phone call.
 *
 * The calendar cannot be changed on an existing event: Google has no "move to
 * another calendar" on an event, it is a delete and a re-create, and doing
 * that silently behind an innocuous dropdown would lose the event's id and
 * anything attached to it.
 */

interface EventEditorProps {
  open: boolean;
  onClose: () => void;
  /** Editing an existing Google event, or undefined to create. */
  event?: CalendarEvent | null;
  /** Pre-fill when creating from a day cell. */
  defaultDate?: string;
}

const todayKey = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const Checkbox: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
  <label style={{
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: disabled ? 'default' : 'pointer',
    ...theme.typography.body,
    fontFamily: theme.fonts.primary,
    color: theme.colors.txt.primary,
  }}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      style={{ width: '18px', height: '18px', accentColor: theme.colors.primary }}
    />
    {label}
  </label>
);

const EventEditor: React.FC<EventEditorProps> = ({ open, onClose, event, defaultDate }) => {
  const { sources, saveEvent, removeEvent } = useEvent();
  const { success: showSuccess, error: showError } = useToast();
  // The hook hands back both the asker and the dialog element; the element
  // has to be rendered or the promise never settles.
  const { confirm, confirmDialog } = useConfirm();

  const isEdit = Boolean(event);
  const [busy, setBusy] = useState(false);

  // Keyed remount by the caller means this initialiser runs per open, so a
  // half-typed event does not survive into the next one.
  const [draft, setDraft] = useState<EventDraft>(() => ({
    calendarId: event?.googleCalendarId ?? '',
    title: event?.title ?? '',
    description: event?.description ?? '',
    location: event?.location ?? '',
    startDate: event?.startDate ?? defaultDate ?? todayKey(),
    startTime: event?.startTime ?? '',
    endDate: event?.endDate ?? '',
    endTime: event?.endTime ?? '',
    isAllDay: event?.isAllDay ?? true,
  }));

  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  const calendarOptions = useMemo(
    () => sources.filter(s => s.isEnabled).map(s => ({ value: s.googleCalendarId, label: s.label })),
    [sources]
  );

  const chosen = sources.find(s => s.googleCalendarId === draft.calendarId);

  const handleSave = async () => {
    setBusy(true);
    try {
      await saveEvent(draft, event ?? undefined);
      showSuccess(isEdit ? 'Event updated in Google Calendar' : 'Event added to Google Calendar');
      onClose();
    } catch (e: any) {
      // Everything reachable here is worth reading: the mapper's "the end has
      // to come after its start", or Google's own refusal.
      showError(e?.message || 'Could not save the event.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    const ok = await confirm({
      title: 'Delete this event?',
      message: `"${event.title}" will be removed from the ${chosen?.label ?? 'studio'} calendar in Google. Anyone subscribed to it will lose the date too.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await removeEvent(event);
      showSuccess('Event deleted from Google Calendar');
      onClose();
    } catch (e: any) {
      showError(e?.message || 'Could not delete the event.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {confirmDialog}
      <Modal
      isOpen={open}
      onClose={busy ? () => {} : onClose}
      title={isEdit ? 'Edit event' : 'New event'}
      size="md"
      footer={
        <div style={{
          display: 'flex',
          // Wraps, because three buttons plus a gap do not fit 288px of modal
          // on a 320px phone and a centred row would push Delete off the left.
          flexWrap: 'wrap',
          gap: '10px',
          justifyContent: 'flex-end',
          width: '100%',
        }}>
          {isEdit && (
            <Button variant="danger" onClick={handleDelete} disabled={busy}
              style={{ marginRight: 'auto' }}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} loading={busy}>
            {isEdit ? 'Save' : 'Add event'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <Select
            label="Calendar"
            options={calendarOptions}
            placeholder="Pick a calendar"
            value={draft.calendarId}
            disabled={isEdit || busy}
            onChange={e => set('calendarId', e.target.value)}
            fullWidth
          />
          {chosen && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px',
            }}>
              <span style={{
                width: '10px', height: '10px', borderRadius: theme.borderRadius.full,
                background: chosen.color, flexShrink: 0,
              }} />
              <span style={{
                ...theme.typography.caption,
                fontFamily: theme.fonts.mono,
                color: theme.colors.txt.tertiary,
              }}>
                {isEdit
                  ? 'A calendar cannot be changed after the event is created'
                  : `Goes on the ${chosen.label} calendar`}
              </span>
            </div>
          )}
        </div>

        <Input
          label="Title"
          value={draft.title}
          disabled={busy}
          placeholder="Parent viewing week"
          onChange={e => set('title', e.target.value)}
          fullWidth
        />

        <Checkbox
          checked={draft.isAllDay}
          disabled={busy}
          onChange={v => set('isAllDay', v)}
          label="All day"
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ flex: '1 1 140px', minWidth: 0 }}>
            <Input
              label="Starts"
              type="date"
              value={draft.startDate}
              disabled={busy}
              onChange={e => set('startDate', e.target.value)}
              fullWidth
            />
          </div>
          {!draft.isAllDay && (
            <div style={{ flex: '1 1 120px', minWidth: 0 }}>
              <Input
                label="Time"
                type="time"
                value={draft.startTime || ''}
                disabled={busy}
                onChange={e => set('startTime', e.target.value)}
                fullWidth
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ flex: '1 1 140px', minWidth: 0 }}>
            <Input
              label="Ends"
              type="date"
              value={draft.endDate || ''}
              disabled={busy}
              onChange={e => set('endDate', e.target.value)}
              fullWidth
            />
          </div>
          {!draft.isAllDay && (
            <div style={{ flex: '1 1 120px', minWidth: 0 }}>
              <Input
                label="Time"
                type="time"
                value={draft.endTime || ''}
                disabled={busy}
                onChange={e => set('endTime', e.target.value)}
                fullWidth
              />
            </div>
          )}
        </div>

        <p style={{
          ...theme.typography.caption,
          fontFamily: theme.fonts.mono,
          color: theme.colors.txt.tertiary,
          margin: '-6px 0 0',
        }}>
          {draft.isAllDay
            ? 'Leave the end blank for a single day. For a run of days, set the LAST day it covers.'
            : 'Leave the end blank and it runs an hour.'}
        </p>

        <Input
          label="Location"
          value={draft.location}
          disabled={busy}
          placeholder="Studio A"
          onChange={e => set('location', e.target.value)}
          fullWidth
        />

        <Textarea
          label="Details"
          value={draft.description}
          disabled={busy}
          rows={3}
          placeholder="Anything parents or staff need to know"
          onChange={e => set('description', e.target.value)}
          fullWidth
        />
      </div>
      </Modal>
    </>
  );
};

export default EventEditor;
