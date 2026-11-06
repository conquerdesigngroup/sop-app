import React, { useMemo, useRef, useState } from 'react';
import { JobTask } from '../types';
import { theme } from '../theme';
import { useTask } from '../contexts/TaskContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../hooks/useConfirm';
import { studioToday, shiftIsoDays } from '../lib/studioDate';
import {
  describeRecurrence,
  formatShortDate,
  nextOccurrence,
  seriesState,
  SeriesState,
} from '../lib/recurrence';
import { Badge, Button, Card, EmptyState, SearchInput, Select, PlusIcon, EditIcon, TrashIcon } from './ui';
import StaffAvatar from './StaffAvatar';

interface RecurringTasksTabProps {
  users: any[];
  onEdit: (series: JobTask) => void;
  onCreate: () => void;
}

const STATE_LABEL: Record<SeriesState, string> = {
  active: 'Active',
  upcoming: 'Starts soon',
  paused: 'Paused',
  ended: 'Ended',
};
const STATE_BADGE: Record<SeriesState, 'success' | 'info' | 'warning' | 'default'> = {
  active: 'success',
  upcoming: 'info',
  paused: 'warning',
  ended: 'default',
};
const STATE_ORDER: Record<SeriesState, number> = { active: 0, upcoming: 1, paused: 2, ended: 3 };

const formatTime = (hhmm?: string): string => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${suffix}`;
};

/**
 * The Recurring tab on Job Tasks: every repeating task, what it does, who it
 * is for, and the controls to change, pause, end or delete it. See
 * src/lib/recurrence.ts for how a series turns into day-by-day tasks.
 */
export const RecurringTasksTab: React.FC<RecurringTasksTabProps> = ({ users, onEdit, onCreate }) => {
  const { recurringSeries, jobTasks, updateRecurringSeries, deleteRecurringSeries } = useTask();
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | SeriesState>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false);

  const today = studioToday();
  const monthAgo = shiftIsoDays(today, -30);

  const rows = useMemo(() => {
    const byUser = new Map(users.map((u: any) => [u.id, u]));
    return recurringSeries
      .filter(s => s.status !== 'archived')
      .map(series => {
        const pattern = series.recurrencePattern;
        const state = seriesState(pattern, series.status, series.scheduledDate, today);
        const occurrences = jobTasks.filter(t => t.seriesId === series.id);
        const recent = occurrences.filter(t => t.scheduledDate >= monthAgo && t.scheduledDate < today);
        const upcomingOcc = occurrences
          .filter(t => t.scheduledDate >= today && t.status !== 'completed' && t.status !== 'archived')
          .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0];
        const next =
          state === 'active' || state === 'upcoming'
            ? upcomingOcc?.scheduledDate || (pattern ? nextOccurrence(pattern, series.scheduledDate, today) : null)
            : null;
        return {
          series,
          state,
          next: next && (!pattern?.endDate || next <= pattern.endDate) ? next : null,
          recentTotal: recent.length,
          recentDone: recent.filter(t => t.status === 'completed').length,
          assignees: series.assignedTo.map(id => byUser.get(id)).filter(Boolean),
        };
      })
      .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.series.title.localeCompare(b.series.title));
  }, [recurringSeries, jobTasks, users, today, monthAgo]);

  const visible = rows.filter(r => {
    if (stateFilter !== 'all' && r.state !== stateFilter && !(stateFilter === 'active' && r.state === 'upcoming')) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.series.title.toLowerCase().includes(q) ||
      r.assignees.some((u: any) => `${u.firstName} ${u.lastName}`.toLowerCase().includes(q))
    );
  });

  const counts = {
    active: rows.filter(r => r.state === 'active' || r.state === 'upcoming').length,
    paused: rows.filter(r => r.state === 'paused').length,
    ended: rows.filter(r => r.state === 'ended').length,
  };

  // One action at a time: a second tap while a save is in flight does nothing.
  const run = async (id: string, work: () => Promise<void>, done: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(id);
    try {
      await work();
      showToast(done, 'success');
    } catch (error) {
      console.error('Recurring task action failed:', error);
      showToast("That didn't save. Check your connection and try again.", 'error');
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  const pause = (s: JobTask) =>
    run(
      s.id,
      () => updateRecurringSeries(s.id, { recurrencePattern: { ...s.recurrencePattern!, paused: true } }, shiftIsoDays(today, 1)),
      `"${s.title}" paused. No new days will be added until you resume it.`
    );

  const resume = (s: JobTask) =>
    run(
      s.id,
      () => updateRecurringSeries(s.id, { recurrencePattern: { ...s.recurrencePattern!, paused: false } }, today),
      `"${s.title}" resumed`
    );

  const end = async (s: JobTask) => {
    const ok = await confirm({
      title: 'End this recurring task?',
      message:
        'It stops repeating after today. Days already done stay in the history, and days not yet started are removed.',
      confirmLabel: 'End it',
      variant: 'warning',
    });
    if (!ok) return;
    const endDate = s.scheduledDate > today ? shiftIsoDays(s.scheduledDate, -1) : today;
    await run(
      s.id,
      () => updateRecurringSeries(s.id, { recurrencePattern: { ...s.recurrencePattern!, endDate, paused: false } }, shiftIsoDays(today, 1)),
      `"${s.title}" ended`
    );
  };

  const restart = (s: JobTask) => {
    const { endDate, paused, ...rule } = s.recurrencePattern || { frequency: 'weekly' as const };
    void endDate; void paused;
    return run(
      s.id,
      () => updateRecurringSeries(s.id, { status: 'pending', recurrencePattern: rule }, today),
      `"${s.title}" is repeating again`
    );
  };

  const remove = async (s: JobTask) => {
    const ok = await confirm({
      title: 'Delete this recurring task?',
      message:
        'It stops repeating and is removed from this list. Days already started or done stay in the history. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    await run(s.id, () => deleteRecurringSeries(s.id), `"${s.title}" deleted`);
  };

  if (rows.length === 0) {
    return (
      <>
        <EmptyState
          title="No recurring tasks yet"
          description="Set up a task once and it shows up for the right people every day, week or month it's due."
          action={<Button leftIcon={<PlusIcon />} onClick={onCreate}>New recurring task</Button>}
        />
        {confirmDialog}
      </>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.toolbar}>
        <div style={styles.search}>
          <SearchInput
            placeholder="Search by task or person"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onClear={() => setSearch('')}
          />
        </div>
        <div style={styles.filter}>
          <Select
            aria-label="Show"
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value as 'all' | SeriesState)}
            options={[
              { value: 'all', label: `All (${rows.length})` },
              { value: 'active', label: `Active (${counts.active})` },
              { value: 'paused', label: `Paused (${counts.paused})` },
              { value: 'ended', label: `Ended (${counts.ended})` },
            ]}
          />
        </div>
        <Button leftIcon={<PlusIcon />} onClick={onCreate}>New recurring task</Button>
      </div>

      {visible.length === 0 ? (
        <p style={styles.none}>Nothing matches. Try a different search or filter.</p>
      ) : (
        <div style={styles.list}>
          {visible.map(({ series: s, state, next, recentDone, recentTotal, assignees }) => {
            const busy = busyId === s.id;
            const p = s.recurrencePattern;
            return (
              <Card key={s.id} padding="md">
                <div style={styles.cardHead}>
                  <h3 style={styles.title}>{s.title}</h3>
                  <Badge variant={STATE_BADGE[state]} size="sm">{STATE_LABEL[state]}</Badge>
                </div>

                <p style={styles.schedule}>
                  {describeRecurrence(p, s.scheduledDate)}
                  {s.dueTime ? `, due ${formatTime(s.dueTime)}` : ''}
                  {p?.endDate ? ` · until ${formatShortDate(p.endDate)}` : ''}
                </p>

                <dl style={styles.facts}>
                  <div style={styles.fact}>
                    <dt style={styles.factLabel}>Next</dt>
                    <dd style={styles.factValue}>
                      {next ? formatShortDate(next) : state === 'paused' ? 'Paused' : '—'}
                    </dd>
                  </div>
                  <div style={styles.fact}>
                    <dt style={styles.factLabel}>Last 30 days</dt>
                    <dd style={styles.factValue}>
                      {recentTotal === 0 ? 'No days yet' : `${recentDone} of ${recentTotal} done`}
                    </dd>
                  </div>
                  <div style={styles.fact}>
                    <dt style={styles.factLabel}>{state === 'upcoming' ? 'Starts' : 'Started'}</dt>
                    <dd style={styles.factValue}>{formatShortDate(s.scheduledDate)}</dd>
                  </div>
                </dl>

                <div style={styles.people}>
                  {assignees.length === 0 ? (
                    <span style={styles.factLabel}>Nobody assigned</span>
                  ) : (
                    assignees.map((u: any) => (
                      <span key={u.id} style={styles.person}>
                        <StaffAvatar firstName={u.firstName} lastName={u.lastName} avatarPath={u.avatarPath} size={22} />
                        {u.firstName} {u.lastName?.[0] ? `${u.lastName[0]}.` : ''}
                      </span>
                    ))
                  )}
                </div>

                <div style={styles.actions}>
                  <Button size="sm" variant="outline" leftIcon={<EditIcon size={16} />} disabled={busy} onClick={() => onEdit(s)}>
                    Edit
                  </Button>
                  {state === 'ended' ? (
                    <Button size="sm" variant="outline" disabled={busy} loading={busy} onClick={() => restart(s)}>
                      Restart
                    </Button>
                  ) : (
                    <>
                      {state === 'paused' ? (
                        <Button size="sm" variant="outline" disabled={busy} loading={busy} onClick={() => resume(s)}>
                          Resume
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={busy} loading={busy} onClick={() => pause(s)}>
                          Pause
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => end(s)}>
                        End
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" leftIcon={<TrashIcon size={16} />} disabled={busy} onClick={() => remove(s)}>
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {confirmDialog}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  wrap: { display: 'flex', flexDirection: 'column', gap: theme.spacing.lg },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  search: { flex: '1 1 220px', minWidth: 0 },
  filter: { flex: '0 1 180px', minWidth: 140 },
  none: { color: theme.colors.txt.tertiary, textAlign: 'center', padding: theme.spacing.xl },
  list: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))',
    gap: theme.spacing.md,
  },
  cardHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  title: {
    margin: 0,
    fontFamily: theme.fonts.primary,
    fontStyle: 'normal',
    textTransform: 'none',
    fontSize: '17px',
    fontWeight: 700,
    color: theme.colors.txt.primary,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  schedule: {
    margin: `${theme.spacing.xs} 0 ${theme.spacing.md}`,
    color: theme.colors.txt.secondary,
    fontSize: '14px',
    overflowWrap: 'anywhere',
  },
  facts: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: `${theme.spacing.sm} ${theme.spacing.lg}`,
    margin: `0 0 ${theme.spacing.md}`,
  },
  fact: { minWidth: 0 },
  factLabel: { fontSize: '12px', color: theme.colors.txt.tertiary, margin: 0 },
  factValue: { fontSize: '14px', color: theme.colors.txt.primary, margin: 0, fontWeight: 600 },
  people: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  person: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color: theme.colors.txt.secondary,
    padding: '2px 10px 2px 2px',
    borderRadius: theme.borderRadius.full,
    border: `1px solid ${theme.colors.bdr.primary}`,
    minWidth: 0,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
    paddingTop: theme.spacing.md,
  },
};

export default RecurringTasksTab;
