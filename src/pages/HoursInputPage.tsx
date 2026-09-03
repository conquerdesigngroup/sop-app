import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { WorkHoursEntry } from '../types';
import { theme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useWorkHours } from '../contexts/WorkHoursContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../hooks/useConfirm';
import { useResponsive } from '../hooks/useResponsive';
import { PageHeader, Card, Modal, Spinner } from '../components/ui';
import HoursEntryForm, { HoursFormValues } from '../components/hours/HoursEntryForm';
import HoursHistoryList from '../components/hours/HoursHistoryList';
import TeamHoursPanel from '../components/hours/TeamHoursPanel';
import {
  PeriodPreset,
  PERIOD_LABELS,
  resolvePeriod,
  inRange,
  sumHours,
  sumPayableHours,
  countDays,
  formatHours,
  formatDateShort,
} from '../components/hours/hoursUtils';

type Tab = 'mine' | 'team';

const MY_PERIODS: PeriodPreset[] = ['this-week', 'last-week', 'this-month', 'all'];

/**
 * Hours Input — payroll-shaped time entry.
 *
 * Employees log and review only their own hours. Admins get an extra tab
 * showing everyone, for running payroll by hand elsewhere.
 *
 * The privacy guarantee is not this component's doing: the RLS policies on
 * work_hours (migrations v6 and v7) mean a non-admin's query physically
 * cannot return another employee's rows. The filtering below is for
 * correctness of the totals, not for access control.
 *
 * Distinct from the older /hours page, which is about which DAYS someone is
 * scheduled. This one is about how many HOURS they worked.
 */
const HoursInputPage: React.FC = () => {
  const { currentUser, isAdmin, isSuperAdmin } = useAuth();
  const {
    workHours,
    workCategories,
    addWorkHours,
    updateWorkHours,
    deleteWorkHours,
    getWorkCategoryName,
    loading,
    loadError,
    hasV7Schema,
  } = useWorkHours();
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const { isMobileOrTablet } = useResponsive();

  const [tab, setTab] = useState<Tab>('mine');
  const location = useLocation();

  // Deep link from the dashboard's "hours awaiting review": land on the
  // team tab. Only honoured for a super admin, who is the only one it exists for.
  useEffect(() => {
    const state = location.state as { tab?: Tab } | null;
    if (state?.tab === 'team' && isSuperAdmin) {
      setTab('team');
      window.history.replaceState({}, document.title);
    }
  }, [location.state, isSuperAdmin]);
  // All time by default. Hours are reviewed far more often than they are
  // logged, and a week-shaped default hid every older entry behind a chip
  // nobody thought to press.
  const [period, setPeriod] = useState<PeriodPreset>('all');
  const [editing, setEditing] = useState<WorkHoursEntry | null>(null);

  const range = useMemo(() => resolvePeriod(period), [period]);

  const myEntries = useMemo(() => {
    if (!currentUser) return [];
    return workHours
      .filter(e => e.employeeId === currentUser.id)
      .sort((a, b) => {
        if (a.workDate !== b.workDate) return a.workDate < b.workDate ? 1 : -1;
        return a.startTime < b.startTime ? 1 : -1;
      });
  }, [workHours, currentUser]);

  const visibleEntries = useMemo(
    () => myEntries.filter(e => inRange(e, range)),
    [myEntries, range]
  );

  // Excludes rejected entries — see sumPayableHours. Anything sent back
  // does not count until it is corrected and returns to 'pending'.
  const periodTotal = sumPayableHours(visibleEntries);
  const periodDays = countDays(visibleEntries);
  const pendingTotal = sumHours(visibleEntries.filter(e => e.status === 'pending'));
  const rejectedTotal = sumHours(visibleEntries.filter(e => e.status === 'rejected'));

  // ---------------------------------------------------------------- actions

  const handleCreate = async (values: HoursFormValues) => {
    if (!currentUser) {
      showToast('You are not signed in', 'error');
      return;
    }

    try {
      const { queued } = await addWorkHours({
        employeeId: currentUser.id,
        workDate: values.workDate,
        startTime: values.startTime,
        endTime: values.endTime,
        breakMinutes: values.breakMinutes,
        // Recomputed server-side by the v7 trigger; sent so the optimistic
        // local row is not blank before the response lands.
        totalHours: 0,
        categoryId: values.categoryId || null,
        notes: values.notes.trim() || null,
      });
      showToast(
        queued
          ? 'Saved on this device — it will submit itself when you have signal'
          : 'Hours logged',
        queued ? 'info' : 'success'
      );
    } catch (error: any) {
      showToast(error?.message || 'Could not log these hours', 'error');
      // Rethrow so the form knows the save failed and keeps what was typed.
      throw error;
    }
  };

  const handleUpdate = async (values: HoursFormValues) => {
    if (!editing) return;

    try {
      await updateWorkHours(editing.id, {
        workDate: values.workDate,
        startTime: values.startTime,
        endTime: values.endTime,
        breakMinutes: values.breakMinutes,
        // null, not undefined: mapToSupabase omits undefined keys, so
        // undefined would make clearing a note or a category impossible.
        categoryId: values.categoryId || null,
        notes: values.notes.trim() || null,
        // Sending a rejected entry back to 'pending' is handled centrally
        // in updateWorkHours, which reads the current status from live
        // state rather than from this modal's snapshot.
      });
      showToast('Entry updated', 'success');
      setEditing(null);
    } catch (error: any) {
      showToast(error?.message || 'Could not update this entry', 'error');
      throw error;
    }
  };

  const handleDelete = async (entry: WorkHoursEntry) => {
    const confirmed = await confirm({
      title: 'Delete this entry?',
      message: `${formatDateShort(entry.workDate)} · ${formatHours(entry.totalHours)} hrs. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteWorkHours(entry.id);
      showToast('Entry deleted', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Could not delete this entry', 'error');
    }
  };

  // ---------------------------------------------------------------- render

  const tabButton = (id: Tab, label: string) => {
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          background: 'none',
          border: 'none',
          borderBottom: `2px solid ${active ? theme.colors.primary : 'transparent'}`,
          color: active ? theme.colors.txt.primary : theme.colors.txt.tertiary,
          fontSize: '15px',
          fontWeight: active ? 600 : 400,
          fontFamily: theme.fonts.primary,
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    );
  };

  const periodChip = (p: PeriodPreset) => {
    const active = period === p;
    return (
      <button
        key={p}
        type="button"
        onClick={() => setPeriod(p)}
        style={{
          padding: '6px 14px',
          borderRadius: theme.borderRadius.full,
          border: `1px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
          backgroundColor: active ? theme.colors.primary : 'transparent',
          color: active ? '#FFFFFF' : theme.colors.txt.secondary,
          fontSize: '13px',
          fontFamily: theme.fonts.primary,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {PERIOD_LABELS[p]}
      </button>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{
      padding: isMobileOrTablet ? '16px' : '40px',
      maxWidth: '1000px',
      margin: '0 auto',
      // `.App { text-align: center }` is leftover CRA boilerplate in App.css
      // and centres every label on the page. Other pages each undo it
      // locally; do the same rather than change the global rule.
      textAlign: 'left',
    }}>
      <PageHeader
        title="Hours Input"
        subtitle={
          tab === 'mine'
            ? 'Log the hours you worked. Only you and an admin can see them.'
            : 'Everyone’s logged hours, for running payroll.'
        }
      />

      {loadError && (
        <div style={{
          padding: theme.spacing.md,
          marginBottom: theme.spacing.lg,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.status.error}`,
          color: theme.colors.status.error,
          fontFamily: theme.fonts.primary,
          fontSize: '14px',
        }}>
          {loadError}
        </div>
      )}

      {isSuperAdmin && (
        <div style={{
          display: 'flex',
          gap: theme.spacing.sm,
          borderBottom: `1px solid ${theme.colors.bdr.primary}`,
          marginBottom: theme.spacing.lg,
        }}>
          {tabButton('mine', 'My Hours')}
          {tabButton('team', 'Team Hours')}
        </div>
      )}

      {tab === 'team' && isSuperAdmin ? (
        <TeamHoursPanel />
      ) : (
        <>
          {/* ---- Entry form ---- */}
          <Card style={{ marginBottom: theme.spacing.xl }}>
            <HoursEntryForm
              categories={workCategories}
              categoriesUnavailable={!hasV7Schema}
              onSubmit={handleCreate}
              resetOnSuccess
            />
          </Card>

          {/* ---- Period + totals ---- */}
          <div style={{
            display: 'flex',
            gap: theme.spacing.sm,
            flexWrap: 'wrap',
            marginBottom: theme.spacing.md,
          }}>
            {MY_PERIODS.map(periodChip)}
          </div>

          <Card style={{ marginBottom: theme.spacing.lg }}>
            <div style={{ display: 'flex', gap: theme.spacing.lg, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '110px' }}>
                <div style={{
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: theme.colors.txt.tertiary,
                  fontFamily: theme.fonts.mono,
                }}>
                  {PERIOD_LABELS[period]}
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  color: theme.colors.txt.primary,
                  fontFamily: theme.fonts.mono,
                }}>
                  {formatHours(periodTotal)} <span style={{ fontSize: '14px', fontWeight: 400 }}>hrs</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: '110px' }}>
                <div style={{
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: theme.colors.txt.tertiary,
                  fontFamily: theme.fonts.mono,
                }}>
                  Days worked
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  color: theme.colors.txt.primary,
                  fontFamily: theme.fonts.mono,
                }}>
                  {periodDays}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: '110px' }}>
                <div style={{
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: theme.colors.txt.tertiary,
                  fontFamily: theme.fonts.mono,
                }}>
                  Awaiting approval
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  color: theme.colors.txt.primary,
                  fontFamily: theme.fonts.mono,
                }}>
                  {formatHours(pendingTotal)}
                </div>
              </div>
              {rejectedTotal > 0 && (
                <div style={{ flex: 1, minWidth: '110px' }}>
                  <div style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: theme.colors.txt.tertiary,
                    fontFamily: theme.fonts.mono,
                  }}>
                    Sent back
                  </div>
                  <div style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    color: theme.colors.status.error,
                    fontFamily: theme.fonts.mono,
                  }}>
                    {formatHours(rejectedTotal)}
                  </div>
                </div>
              )}
            </div>
            {rejectedTotal > 0 && (
              <div style={{
                marginTop: theme.spacing.sm,
                fontSize: '12px',
                color: theme.colors.txt.tertiary,
                fontFamily: theme.fonts.primary,
              }}>
                Sent-back hours are not counted in your total until you fix and resave them.
              </div>
            )}
          </Card>

          {/* ---- History ---- */}
          <HoursHistoryList
            entries={visibleEntries}
            getCategoryName={getWorkCategoryName}
            onEdit={setEditing}
            onDelete={handleDelete}
            emptyTitle="Nothing logged for this period"
            emptyDescription="Use the form above to log the hours you worked."
          />
        </>
      )}

      {/* ---- Edit ---- */}
      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit entry"
        size="md"
      >
        {editing && (
          <HoursEntryForm
            categories={workCategories}
            categoriesUnavailable={!hasV7Schema}
            submitLabel="Save changes"
            initialValues={{
              workDate: editing.workDate,
              startTime: editing.startTime,
              endTime: editing.endTime,
              breakMinutes: editing.breakMinutes,
              categoryId: editing.categoryId || '',
              notes: editing.notes || '',
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      {confirmDialog}
    </div>
  );
};

export default HoursInputPage;
