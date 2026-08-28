import React, { useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Input, Modal, Textarea, Badge, PlusIcon } from '../ui';
import { CustomCheckbox } from '../CustomCheckbox';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAdmin, describeWriteError } from '../../contexts/PortalAdminContext';
import { PortalClass, PortalEvent, PortalProgram } from '../../types';
import { formatEventDate, formatEventTime, startOfToday } from '../../lib/portal';
import {
  allDayToIso, timedToIso, isoToDateInput, isoToTimeInput, todayDateInput, localTimeZoneName,
} from '../../lib/portalAdmin';
import { useAdminList } from './useAdminList';
import GoogleSyncPanel from './GoogleSyncPanel';
import { ManagerList, ClassSelect, RowActions, RowMeta, PublishedBadge, audienceLabel, FieldPair, useAutoFocus } from './shared';

/**
 * The portal calendar — recitals, closures, competition weekends.
 *
 * THE ONE THING TO GET RIGHT HERE
 *
 * portal_events.starts_at is timestamptz and the two kinds of event are stored
 * in different frames, on purpose:
 *
 *   all-day  — UTC midnight, the convention iCal uses for a DATE. Read back
 *              with { timeZone: 'UTC' } so it stays on the day it was typed.
 *   timed    — a real instant from local wall-clock, so a 5pm rehearsal reads
 *              as 5pm to whoever opens it.
 *
 * Storing an all-day event from local midnight instead is what shifted "Studio
 * closed" to the previous day for every parent in California during phase 2. The
 * form therefore keeps date and time as separate strings and converts once, on
 * save, through allDayToIso/timedToIso — which are the exact inverses of the
 * formatters this list renders with.
 */

interface EventDraft {
  id?: string;
  classId: string | null;
  title: string;
  description: string;
  location: string;
  isAllDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  isPublished: boolean;
  source: 'manual' | 'google';
}

const newDraft = (classId: string | null): EventDraft => ({
  classId,
  title: '',
  description: '',
  location: '',
  isAllDay: true,
  startDate: todayDateInput(),
  startTime: '17:00',
  endDate: '',
  endTime: '',
  isPublished: true,
  source: 'manual',
});

const toDraft = (e: PortalEvent): EventDraft => ({
  id: e.id,
  classId: e.classId,
  title: e.title,
  description: e.description,
  location: e.location ?? '',
  isAllDay: e.isAllDay,
  startDate: isoToDateInput(e.startsAt, e.isAllDay),
  startTime: e.isAllDay ? '17:00' : isoToTimeInput(e.startsAt),
  endDate: e.endsAt ? isoToDateInput(e.endsAt, e.isAllDay) : '',
  endTime: e.endsAt && !e.isAllDay ? isoToTimeInput(e.endsAt) : '',
  isPublished: e.isPublished,
  source: e.source,
});

/** Same rendering the parent calendar uses, so the list is a real preview. */
const describeWhen = (e: PortalEvent): string => {
  const day = formatEventDate(e.startsAt, e.isAllDay, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  return e.isAllDay ? `${day} · All day` : `${day} · ${formatEventTime(e.startsAt, false)}`;
};

/**
 * `scope` narrows the section to one class and pins new events to it, exactly
 * as it does in UpdatesSection and DocumentsSection:
 *
 *   undefined            the whole program — the Calendar tab
 *   { classId: '<id>' }  one class only — the class workspace
 */
const EventsSection: React.FC<{
  program: PortalProgram;
  classes: PortalClass[];
  scope?: { classId: string };
}> = ({ program, classes, scope }) => {
  const { fetchEvents, saveEvent, deleteEvent, canEditClass, editableClassIds } = usePortalAdmin();
  const { isAdmin } = useAuth();
  const { success, error: toastError } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const { isMobileOrTablet } = useResponsive();

  const { data: events, loading, error, reload } = useAdminList<PortalEvent[]>(
    program.id, fetchEvents, []
  );

  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const focusRef = useAutoFocus(draft !== null);

  /**
   * What a new event is attached to before anybody picks.
   *
   * A scope pins it. Otherwise an admin starts studio-wide, and a teacher
   * starts on one of their own classes — but it has to be one in THIS program.
   * `editableClassIds[0]` was whichever class the grant query returned first
   * across every program, so an Academy teacher looking at the All-Star
   * calendar got a draft whose class is not in the dropdown: the picker shows
   * blank, and saving files the event under the All-Star program_id with an
   * Academy class_id. The wrong families see it and the right ones never do.
   */
  const defaultClassId = scope
    ? scope.classId
    : isAdmin
      ? null
      : (classes.find(c => editableClassIds.includes(c.id))?.id ?? null);

  // Inside a class, the list is that class's events and nothing else.
  const rows = scope ? events.filter(e => e.classId === scope.classId) : events;
  const today = startOfToday();

  const startNew = () => {
    setFormError('');
    setDraft(newDraft(defaultClassId));
  };

  const handleSave = async () => {
    if (!draft) return;

    if (!draft.title.trim()) {
      setFormError('Give the event a name.');
      return;
    }
    if (!draft.startDate) {
      setFormError('Pick a date.');
      return;
    }
    if (!draft.isAllDay && !draft.startTime) {
      setFormError('Pick a start time, or mark it as an all-day event.');
      return;
    }
    if (!canEditClass(draft.classId)) {
      setFormError('Pick one of your own classes. Studio-wide events are admin-only.');
      return;
    }

    const startsAt = draft.isAllDay
      ? allDayToIso(draft.startDate)
      : timedToIso(draft.startDate, draft.startTime);

    let endsAt: string | null = null;
    if (draft.isAllDay && draft.endDate) {
      endsAt = allDayToIso(draft.endDate);
    } else if (!draft.isAllDay && draft.endTime) {
      // An end time with no end date means "later the same day", which is what
      // almost every timed event is.
      endsAt = timedToIso(draft.endDate || draft.startDate, draft.endTime);
    }

    if (endsAt && new Date(endsAt) < new Date(startsAt)) {
      setFormError('The end is before the start.');
      return;
    }

    setSaving(true);
    try {
      await saveEvent({
        id: draft.id,
        programId: program.id,
        classId: draft.classId,
        title: draft.title,
        description: draft.description,
        startsAt,
        endsAt,
        isAllDay: draft.isAllDay,
        location: draft.location.trim() || null,
        isPublished: draft.isPublished,
      });
      success(draft.id ? 'Event updated.' : 'Event added.');
      setDraft(null);
      reload();
    } catch (e) {
      setFormError(describeWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: PortalEvent) => {
    const ok = await confirm({
      title: 'Delete this event?',
      message: `"${e.title}" will disappear from the portal calendar. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteEvent(e.id);
      success('Event deleted.');
      reload();
    } catch (err) {
      toastError(describeWriteError(err));
    }
  };

  const zone = localTimeZoneName();

  return (
    <>
      {isAdmin && <GoogleSyncPanel program={program} onSynced={reload} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <Button leftIcon={<PlusIcon />} onClick={startNew}>New event</Button>
      </div>

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={rows.length === 0}
        emptyTitle="Nothing on the calendar"
        emptyDescription="Recitals, competition weekends, studio closures and picture day all live here."
        emptyAction={<Button leftIcon={<PlusIcon />} onClick={startNew}>New event</Button>}
      >
        {rows.map(e => {
          const isPast = new Date(e.startsAt) < today;
          return (
            <Card key={e.id} style={isPast ? { opacity: 0.6 } : undefined}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <PublishedBadge published={e.isPublished} />
                    {isPast && <Badge variant="default" size="sm">Past</Badge>}
                    {e.source === 'google' && <Badge variant="info" size="sm">From Google</Badge>}
                  </div>

                  <h3 style={{
                    ...theme.typography.h3,
                    color: theme.colors.txt.primary,
                    margin: '0 0 6px',
                    wordBreak: 'break-word',
                  }}>
                    {e.title}
                  </h3>

                  <RowMeta>
                    <span>{describeWhen(e)}</span>
                    {e.location && <span>· {e.location}</span>}
                    <span>· {audienceLabel(e.classId, classes)}</span>
                  </RowMeta>
                </div>

                {/* Read is program-wide for staff; write is not. See
                    UpdatesSection for the same guard and why. */}
                {canEditClass(e.classId) && (
                  <RowActions
                    onEdit={() => { setFormError(''); setDraft(toDraft(e)); }}
                    onDelete={() => handleDelete(e)}
                    editLabel={`Edit ${e.title}`}
                    deleteLabel={`Delete ${e.title}`}
                    // Deleting an imported event is futile — the next sync
                    // re-adds it. Unticking "visible to parents" is the way to
                    // take one off the portal, and the sync preserves that.
                    canDelete={e.source !== 'google'}
                  />
                )}
              </div>
            </Card>
          );
        })}
      </ManagerList>

      <Modal
        isOpen={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit event' : 'New event'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>Save</Button>
          </>
        }
      >
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {draft.source === 'google' && (
              <p style={{
                ...theme.typography.bodySmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.status.warning,
                margin: 0,
              }}>
                This event came from a Google calendar. The title, dates, place and details are
                overwritten every time it syncs — change those in Google. Whether parents can see
                it is the one thing set here that sticks.
              </p>
            )}

            <Input
              ref={focusRef}
              label="Event"
              value={draft.title}
              placeholder="Spring recital"
              onChange={e => setDraft({ ...draft, title: e.target.value })}
            />

            <CustomCheckbox
              checked={draft.isAllDay}
              onChange={isAllDay => setDraft({ ...draft, isAllDay })}
              label="All day (no set time)"
            />

            <FieldPair stack={isMobileOrTablet}>
              <Input
                label="Date"
                type="date"
                value={draft.startDate}
                onChange={e => setDraft({ ...draft, startDate: e.target.value })}
              />
              {!draft.isAllDay && (
                <Input
                  label="Start time"
                  type="time"
                  value={draft.startTime}
                  onChange={e => setDraft({ ...draft, startTime: e.target.value })}
                />
              )}
            </FieldPair>

            <FieldPair stack={isMobileOrTablet}>
              <Input
                label={draft.isAllDay ? 'Last day (optional)' : 'End date (optional)'}
                type="date"
                value={draft.endDate}
                onChange={e => setDraft({ ...draft, endDate: e.target.value })}
              />
              {!draft.isAllDay && (
                <Input
                  label="End time (optional)"
                  type="time"
                  value={draft.endTime}
                  onChange={e => setDraft({ ...draft, endTime: e.target.value })}
                />
              )}
            </FieldPair>

            {!draft.isAllDay && (
              <p style={{
                ...theme.typography.captionSmall,
                fontFamily: theme.fonts.mono,
                color: theme.colors.txt.tertiary,
                margin: '-8px 0 0',
              }}>
                Times are entered in {zone} — this device's timezone.
              </p>
            )}

            <Input
              label="Where (optional)"
              value={draft.location}
              placeholder="Studio A"
              onChange={e => setDraft({ ...draft, location: e.target.value })}
            />

            <Textarea
              label="Details (optional)"
              value={draft.description}
              placeholder="Doors open at 6:30. Dancers arrive in costume."
              onChange={e => setDraft({ ...draft, description: e.target.value })}
            />

            {/* Redundant inside a scope — the heading already says whose
                calendar this is, and offering to move the event to another
                class from in here is a way to lose it. */}
            {!scope && (
              <ClassSelect
                classes={classes}
                value={draft.classId}
                onChange={classId => setDraft({ ...draft, classId })}
                allowStudioWide={isAdmin}
                editableClassIds={editableClassIds}
                isAdmin={isAdmin}
              />
            )}

            <CustomCheckbox
              checked={draft.isPublished}
              onChange={isPublished => setDraft({ ...draft, isPublished })}
              label="Visible to parents"
            />

            {formError && (
              <p style={{
                ...theme.typography.bodySmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.status.error,
                margin: 0,
              }}>
                {formError}
              </p>
            )}
          </div>
        )}
      </Modal>

      {confirmDialog}
    </>
  );
};

export default EventsSection;
