import React, { useCallback, useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Input, Badge, Divider, Spinner } from '../ui';
import { CustomCheckbox } from '../CustomCheckbox';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { useResponsive } from '../../hooks/useResponsive';
import { usePortalAdmin, describeWriteError, CalendarSourceInput } from '../../contexts/PortalAdminContext';
import { PortalCalendarSource, PortalProgram } from '../../types';
import { FieldPair } from './shared';

/**
 * Point a program's calendar at one or more Google calendars, and see what each
 * sync did.
 *
 * Admin-only, like the table behind it. The actual work happens in the
 * portal-calendar-sync Edge Function on a schedule; the button here runs the
 * same function immediately, which is what you want after changing a setting or
 * while working out why an event has not appeared.
 *
 * MORE THAN ONE CALENDAR  (v23)
 *
 * All-Star families need the Studio calendar as well as the All-Stars one — a
 * competition is on one, the day the building is shut is on the other, and a
 * parent should not have to know which. So this is a list, not a single row.
 *
 * A calendar may feed several programs (Studio feeds both academy and
 * All-Stars). Since v23 that produces one portal_events row per program rather
 * than one row that the two syncs drag back and forth between them.
 *
 * WHAT THE STATUS LINE IS FOR
 *
 * A sync that stops working fails silently by nature — the calendar simply
 * stops changing, which looks exactly like a quiet week. last_status and
 * last_run_at are the only way to tell those apart from inside the app, so they
 * are shown whether or not anything is wrong. Per calendar: one failing source
 * among three healthy ones is the case that most needs saying out loud.
 */

/** Sentinel for "the form is open on a calendar that does not exist yet". */
const NEW = '__new__';

const emptyDraft = (programId: string): CalendarSourceInput => ({
  programId,
  googleCalendarId: '',
  isEnabled: true,
  daysBack: 60,
  daysAhead: 365,
  publishImported: true,
});

const toDraft = (s: PortalCalendarSource): CalendarSourceInput => ({
  programId: s.programId,
  googleCalendarId: s.googleCalendarId,
  isEnabled: s.isEnabled,
  daysBack: s.daysBack,
  daysAhead: s.daysAhead,
  publishImported: s.publishImported,
});

const whenText = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString() : 'never';

const statusBadge = (s: PortalCalendarSource) => {
  if (!s.isEnabled) return <Badge variant="default" size="sm">Paused</Badge>;
  if (s.lastStatus === 'error') return <Badge variant="danger" size="sm">Last run failed</Badge>;
  if (s.lastStatus === 'ok') return <Badge variant="success" size="sm">Syncing</Badge>;
  return <Badge variant="warning" size="sm">Never run</Badge>;
};

const GoogleSyncPanel: React.FC<{ program: PortalProgram; onSynced: () => void }> = ({
  program, onSynced,
}) => {
  const {
    fetchCalendarSources, saveCalendarSource, removeCalendarSource, runCalendarSync,
  } = usePortalAdmin();
  const { success, error: toastError, warning } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const { isMobileOrTablet } = useResponsive();

  const [sources, setSources] = useState<PortalCalendarSource[]>([]);
  const [draft, setDraft] = useState<CalendarSourceInput | null>(null);
  /** The google_calendar_id being edited, or NEW while adding. */
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSources(await fetchCalendarSources(program.id));
    } catch (e) {
      console.error('Could not load the calendar sources:', e);
    } finally {
      setLoading(false);
    }
  }, [program.id, fetchCalendarSources]);

  useEffect(() => { load(); }, [load]);

  const closeForm = () => {
    setEditing(null);
    setDraft(null);
    setFormError('');
  };

  const openNew = () => {
    setFormError('');
    setDraft(emptyDraft(program.id));
    setEditing(NEW);
  };

  const openEdit = (s: PortalCalendarSource) => {
    setFormError('');
    setDraft(toDraft(s));
    setEditing(s.googleCalendarId);
  };

  const handleSave = async () => {
    if (!draft) return;
    const id = draft.googleCalendarId.trim();
    if (!id) {
      setFormError('Paste the Calendar ID from Google Calendar → Settings → Integrate calendar.');
      return;
    }
    // Adding a calendar the program already reads would silently overwrite that
    // calendar's window settings from a form the admin thinks is a new one.
    const clash = sources.some(s => s.googleCalendarId === id && s.googleCalendarId !== editing);
    if (clash) {
      setFormError('This program already reads that calendar.');
      return;
    }

    setSaving(true);
    try {
      await saveCalendarSource(draft, editing === NEW ? undefined : editing ?? undefined);
      success('Calendar settings saved.');
      closeForm();
      await load();
    } catch (e) {
      setFormError(describeWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const results = await runCalendarSync(program.id);
      const failed = results.filter(r => r.error);

      if (results.length === 0) {
        warning('Nothing ran — every calendar for this program is switched off.');
      } else if (failed.length === results.length) {
        toastError(failed[0].error!);
      } else {
        // Totalled across calendars. Per-calendar detail lands on the rows
        // below, which is a better place to read it than a toast.
        const written = results.reduce((n, r) => n + (r.upserted ?? 0), 0);
        const removed = results.reduce((n, r) => n + (r.removed ?? 0), 0);
        const ran = results.length - failed.length;
        const scope = results.length > 1 ? ` across ${ran} of ${results.length} calendars` : '';
        success(`Synced${scope}. ${written} event(s) written, ${removed} removed.`);
        if (failed.length) toastError(failed[0].error!);
      }

      await load();
      onSynced();
    } catch (e) {
      toastError(describeWriteError(e));
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async (s: PortalCalendarSource) => {
    const ok = await confirm({
      title: 'Disconnect this Google calendar?',
      message:
        'Events already imported from it stay on the portal calendar — they just stop ' +
        'updating. Delete them from the list below if you do not want them there. ' +
        'Any other calendar this program reads is unaffected.',
      confirmLabel: 'Disconnect',
      variant: 'warning',
    });
    if (!ok) return;

    try {
      await removeCalendarSource(program.id, s.googleCalendarId);
      success('Google calendar disconnected.');
      if (editing === s.googleCalendarId) closeForm();
      await load();
    } catch (e) {
      toastError(describeWriteError(e));
    }
  };

  const caption: React.CSSProperties = {
    ...theme.typography.captionSmall,
    fontFamily: theme.fonts.mono,
    color: theme.colors.txt.tertiary,
    margin: 0,
    // A Google calendar id is a 64-character hash and an @domain. Without this
    // it is the widest thing on the page and pushes the card off a phone.
    minWidth: 0,
    overflowWrap: 'anywhere',
  };

  const form = draft && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Divider margin="sm" />

      <Input
        label="Calendar ID"
        value={draft.googleCalendarId}
        placeholder="studio-events@group.calendar.google.com"
        helperText="Google Calendar → the calendar → Settings and sharing → Integrate calendar."
        onChange={e => setDraft({ ...draft, googleCalendarId: e.target.value })}
      />

      <p style={{
        ...theme.typography.bodySmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.secondary,
        margin: 0,
      }}>
        Share that calendar with the sync's service account address, with "See all event
        details". Without it Google answers "not found" no matter what is typed here.
      </p>

      <FieldPair stack={isMobileOrTablet}>
        <Input
          label="Days back"
          type="number"
          value={String(draft.daysBack)}
          helperText="How much history to mirror."
          onChange={e => setDraft({ ...draft, daysBack: Number(e.target.value) || 0 })}
        />
        <Input
          label="Days ahead"
          type="number"
          value={String(draft.daysAhead)}
          helperText="365 covers a full season."
          onChange={e => setDraft({ ...draft, daysAhead: Number(e.target.value) || 1 })}
        />
      </FieldPair>

      <CustomCheckbox
        checked={draft.isEnabled}
        onChange={isEnabled => setDraft({ ...draft, isEnabled })}
        label="Keep this calendar in sync"
      />
      <CustomCheckbox
        checked={draft.publishImported}
        onChange={publishImported => setDraft({ ...draft, publishImported })}
        label="Publish imported events straight away"
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

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={handleSave} loading={saving}>Save</Button>
        <Button variant="ghost" onClick={closeForm}>Cancel</Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px' }}>
          <Spinner size={20} color={theme.colors.primary} />
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card style={{ marginBottom: '16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          marginBottom: sources.length || editing ? '12px' : 0,
        }}>
          <h3 style={{ ...theme.typography.h3, color: theme.colors.txt.primary, margin: 0 }}>
            {sources.length > 1 ? 'Google calendars' : 'Google calendar'}
          </h3>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {sources.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleSync} loading={syncing}>
                {sources.length > 1 ? 'Sync all' : 'Sync now'}
              </Button>
            )}
            {editing !== NEW && (
              <Button variant="ghost" size="sm" onClick={openNew}>
                {sources.length ? 'Add a calendar' : 'Connect a calendar'}
              </Button>
            )}
          </div>
        </div>

        {sources.length === 0 && editing !== NEW && (
          <p style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.tertiary,
            margin: 0,
          }}>
            Not connected. Events on this calendar are the ones added by hand below.
          </p>
        )}

        {sources.map((s, i) => (
          <div key={s.googleCalendarId}>
            {i > 0 && <Divider margin="sm" />}
            <div style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {statusBadge(s)}
                </div>
                <p style={caption}>{s.googleCalendarId}</p>
                <p style={caption}>
                  Last run {whenText(s.lastRunAt)}
                  {s.lastStatus === 'ok' && s.lastUpserted !== null &&
                    ` · ${s.lastUpserted} written, ${s.lastRemoved ?? 0} removed`}
                </p>
                {s.lastStatus === 'error' && s.lastMessage && (
                  <p style={{
                    ...theme.typography.bodySmall,
                    fontFamily: theme.fonts.primary,
                    color: theme.colors.status.error,
                    margin: '4px 0 0',
                    overflowWrap: 'anywhere',
                  }}>
                    {s.lastMessage}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => (editing === s.googleCalendarId ? closeForm() : openEdit(s))}
                >
                  {editing === s.googleCalendarId ? 'Close' : 'Settings'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDisconnect(s)}>
                  Disconnect
                </Button>
              </div>
            </div>

            {editing === s.googleCalendarId && form}
          </div>
        ))}

        {editing === NEW && (
          <>
            {sources.length > 0 && <Divider margin="sm" />}
            {form}
          </>
        )}
      </Card>

      {confirmDialog}
    </>
  );
};

export default GoogleSyncPanel;
