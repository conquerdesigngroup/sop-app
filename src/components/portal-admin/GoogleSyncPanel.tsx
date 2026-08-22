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
 * Point a program's calendar at a Google calendar, and see what the sync did.
 *
 * Admin-only, like the table behind it. The actual work happens in the
 * portal-calendar-sync Edge Function on a schedule; the button here runs the
 * same function immediately, which is what you want after changing a setting or
 * while working out why an event has not appeared.
 *
 * WHAT THE STATUS LINE IS FOR
 *
 * A sync that stops working fails silently by nature — the calendar simply
 * stops changing, which looks exactly like a quiet week. last_status and
 * last_run_at are the only way to tell those apart from inside the app, so they
 * are shown whether or not anything is wrong.
 */

const emptyDraft = (programId: string): CalendarSourceInput => ({
  programId,
  googleCalendarId: '',
  isEnabled: true,
  daysBack: 30,
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

const GoogleSyncPanel: React.FC<{ program: PortalProgram; onSynced: () => void }> = ({
  program, onSynced,
}) => {
  const {
    fetchCalendarSource, saveCalendarSource, removeCalendarSource, runCalendarSync,
  } = usePortalAdmin();
  const { success, error: toastError, warning } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const { isMobileOrTablet } = useResponsive();

  const [source, setSource] = useState<PortalCalendarSource | null>(null);
  const [draft, setDraft] = useState<CalendarSourceInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await fetchCalendarSource(program.id);
      setSource(row);
      setDraft(row ? toDraft(row) : null);
    } catch (e) {
      console.error('Could not load the calendar source:', e);
    } finally {
      setLoading(false);
    }
  }, [program.id, fetchCalendarSource]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.googleCalendarId.trim()) {
      setFormError('Paste the Calendar ID from Google Calendar → Settings → Integrate calendar.');
      return;
    }

    setSaving(true);
    try {
      await saveCalendarSource(draft);
      success('Calendar settings saved.');
      setFormError('');
      setExpanded(false);
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
      const failed = results.find(r => r.error);
      if (failed) {
        toastError(failed.error!);
      } else if (results.length === 0) {
        warning('Nothing ran — the calendar is saved but switched off.');
      } else {
        const r = results[0];
        success(`Synced. ${r.upserted ?? 0} event(s) written, ${r.removed ?? 0} removed.`);
      }
      await load();
      onSynced();
    } catch (e) {
      toastError(describeWriteError(e));
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: 'Disconnect this Google calendar?',
      message:
        'Events already imported stay on the portal calendar — they just stop updating. ' +
        'Delete them from the list below if you do not want them there.',
      confirmLabel: 'Disconnect',
      variant: 'warning',
    });
    if (!ok) return;

    try {
      await removeCalendarSource(program.id);
      success('Google calendar disconnected.');
      await load();
    } catch (e) {
      toastError(describeWriteError(e));
    }
  };

  const statusBadge = () => {
    if (!source) return null;
    if (!source.isEnabled) return <Badge variant="default" size="sm">Paused</Badge>;
    if (source.lastStatus === 'error') return <Badge variant="danger" size="sm">Last run failed</Badge>;
    if (source.lastStatus === 'ok') return <Badge variant="success" size="sm">Syncing</Badge>;
    return <Badge variant="warning" size="sm">Never run</Badge>;
  };

  const caption: React.CSSProperties = {
    ...theme.typography.captionSmall,
    fontFamily: theme.fonts.mono,
    color: theme.colors.txt.tertiary,
    margin: 0,
  };

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
          marginBottom: source || expanded ? '12px' : 0,
        }}>
          <h3 style={{ ...theme.typography.h3, color: theme.colors.txt.primary, margin: 0 }}>
            Google calendar
          </h3>
          {statusBadge()}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {source && (
              <Button variant="outline" size="sm" onClick={handleSync} loading={syncing}>
                Sync now
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFormError('');
                setDraft(source ? toDraft(source) : emptyDraft(program.id));
                setExpanded(v => !v);
              }}
            >
              {expanded ? 'Close' : source ? 'Settings' : 'Connect a calendar'}
            </Button>
          </div>
        </div>

        {source && !expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <p style={caption}>{source.googleCalendarId}</p>
            <p style={caption}>
              Last run {whenText(source.lastRunAt)}
              {source.lastStatus === 'ok' && source.lastUpserted !== null &&
                ` · ${source.lastUpserted} written, ${source.lastRemoved ?? 0} removed`}
            </p>
            {source.lastStatus === 'error' && source.lastMessage && (
              <p style={{
                ...theme.typography.bodySmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.status.error,
                margin: '4px 0 0',
              }}>
                {source.lastMessage}
              </p>
            )}
          </div>
        )}

        {!source && !expanded && (
          <p style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.tertiary,
            margin: 0,
          }}>
            Not connected. Events on this calendar are the ones added by hand below.
          </p>
        )}

        {expanded && draft && (
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
              {source && (
                <Button variant="ghost" onClick={handleDisconnect}>Disconnect</Button>
              )}
            </div>
          </div>
        )}
      </Card>

      {confirmDialog}
    </>
  );
};

export default GoogleSyncPanel;
