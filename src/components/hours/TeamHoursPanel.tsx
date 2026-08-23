import React, { useCallback, useMemo, useState } from 'react';
import { WorkHoursEntry } from '../../types';
import { theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkHours } from '../../contexts/WorkHoursContext';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { useResponsive } from '../../hooks/useResponsive';
import { Button, Card, Input, Badge, EmptyState, Modal, Textarea } from '../ui';
import HoursHistoryList from './HoursHistoryList';
import WorkCategoryManager from './WorkCategoryManager';
import PayRatesManager from './PayRatesManager';
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
  formatTime12,
  toCSV,
  downloadCSV,
  todayISO,
} from './hoursUtils';

const PRESETS: PeriodPreset[] = ['this-week', 'last-week', 'this-month', 'last-month', 'all'];

const money = (n: number) =>
  `$${(Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface EmployeeRollup {
  employeeId: string;
  name: string;
  email: string;
  entries: WorkHoursEntry[];
  /** Approved + pending. Excludes rejected — see sumPayableHours. */
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  days: number;
  /** Frozen pay for approved entries. Authoritative — this is what is owed. */
  approvedPay: number;
  /** Pending hours priced at today's rates. An estimate, not a commitment. */
  estimatedPendingPay: number;
  /** Approved entries that had no rate configured, so were frozen at $0.00. */
  missingRateCount: number;
}

/**
 * Admin-only view of everyone's logged hours, for running payroll by hand
 * elsewhere. Read-heavy: pick a period, see per-employee totals, drill into
 * an individual's entries, approve to lock them, export a CSV.
 */
const TeamHoursPanel: React.FC = () => {
  const { users, currentUser } = useAuth();
  const {
    workHours, getWorkCategoryName, approveWorkHours, rejectWorkHours, hasV7Schema,
    getEmployeePayRate, getPayForEntry,
  } = useWorkHours();
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const { isMobileOrTablet } = useResponsive();

  const [preset, setPreset] = useState<PeriodPreset>('this-week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [showRates, setShowRates] = useState(false);
  const [rejecting, setRejecting] = useState<WorkHoursEntry | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Both filled AND the right way round. The min/max attributes on the two
  // date inputs only mark a typed value :invalid — they do not block it —
  // and a reversed range makes inRange false for every entry, showing 0.00
  // for the whole team as if nobody had logged anything.
  const rangeReversed = Boolean(customStart && customEnd && customStart > customEnd);
  const usingCustom = Boolean(customStart && customEnd) && !rangeReversed;

  const range = useMemo(() => {
    if (usingCustom) {
      return { start: customStart, end: customEnd, label: `${formatDateShort(customStart)} – ${formatDateShort(customEnd)}` };
    }
    return resolvePeriod(preset);
  }, [usingCustom, customStart, customEnd, preset]);

  /**
   * Pay figures for one employee's entries.
   *
   * Approved pay comes from the frozen snapshot, never from today's rate —
   * that is the point of freezing it. Pending pay is priced at the current
   * rate and is only ever shown as an estimate.
   */
  const payFor = useCallback((entries: WorkHoursEntry[], employeeId: string) => {
    let approvedPay = 0;
    let estimatedPendingPay = 0;
    let missingRateCount = 0;

    entries.forEach(e => {
      if (e.status === 'approved') {
        const frozen = getPayForEntry(e.id);
        approvedPay += frozen?.payAmount ?? 0;
        if (frozen?.rateMissing) missingRateCount += 1;
      } else if (e.status === 'pending') {
        const rate = getEmployeePayRate(employeeId, e.categoryId);
        estimatedPendingPay += (e.totalHours || 0) * (rate ?? 0);
      }
    });

    return {
      approvedPay: Math.round(approvedPay * 100) / 100,
      estimatedPendingPay: Math.round(estimatedPendingPay * 100) / 100,
      missingRateCount,
    };
  }, [getPayForEntry, getEmployeePayRate]);

  const rollups = useMemo<EmployeeRollup[]>(() => {
    const inPeriod = workHours.filter(e => inRange(e, range));

    // Everyone active gets a row, including people with nothing logged —
    // an empty row is the signal that someone has not filed their hours.
    const rows = users
      .filter(u => u.isActive)
      .map(u => {
        const entries = inPeriod
          .filter(e => e.employeeId === u.id)
          .sort((a, b) => (a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : 0));

        return {
          employeeId: u.id,
          name: `${u.firstName} ${u.lastName}`.trim() || u.email,
          email: u.email,
          entries,
          total: sumPayableHours(entries),
          approved: sumHours(entries.filter(e => e.status === 'approved')),
          pending: sumHours(entries.filter(e => e.status === 'pending')),
          rejected: sumHours(entries.filter(e => e.status === 'rejected')),
          days: countDays(entries),
          ...payFor(entries, u.id),
        };
      });

    // Entries whose employee_id matches no active profile — usually a
    // deactivated account, or a row written under a mismatched id. They
    // would otherwise vanish from payroll entirely.
    const known = new Set(rows.map(r => r.employeeId));
    const orphans = inPeriod.filter(e => !known.has(e.employeeId));
    if (orphans.length > 0) {
      const byId = new Map<string, WorkHoursEntry[]>();
      orphans.forEach(e => byId.set(e.employeeId, [...(byId.get(e.employeeId) || []), e]));
      byId.forEach((entries, employeeId) => {
        const user = users.find(u => u.id === employeeId);
        rows.push({
          employeeId,
          name: user ? `${user.firstName} ${user.lastName} (inactive)` : 'Unknown employee',
          email: user?.email || employeeId,
          entries,
          total: sumPayableHours(entries),
          approved: sumHours(entries.filter(e => e.status === 'approved')),
          pending: sumHours(entries.filter(e => e.status === 'pending')),
          rejected: sumHours(entries.filter(e => e.status === 'rejected')),
          days: countDays(entries),
          ...payFor(entries, employeeId),
        });
      });
    }

    return rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [workHours, users, range, payFor]);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const teamTotal = useMemo(() => round2(rollups.reduce((s, r) => s + r.total, 0)), [rollups]);
  const approvedTotal = useMemo(() => round2(rollups.reduce((s, r) => s + r.approved, 0)), [rollups]);
  const pendingTotal = useMemo(() => round2(rollups.reduce((s, r) => s + r.pending, 0)), [rollups]);
  const rejectedTotal = useMemo(() => round2(rollups.reduce((s, r) => s + r.rejected, 0)), [rollups]);
  const approvedPayTotal = useMemo(() => round2(rollups.reduce((s, r) => s + r.approvedPay, 0)), [rollups]);
  const estPendingPayTotal = useMemo(() => round2(rollups.reduce((s, r) => s + r.estimatedPendingPay, 0)), [rollups]);
  const missingRateTotal = useMemo(() => rollups.reduce((s, r) => s + r.missingRateCount, 0), [rollups]);

  const employeeName = (id: string) =>
    rollups.find(r => r.employeeId === id)?.name || 'Unknown';

  // ---------------------------------------------------------------- actions

  const handleApprove = async (entry: WorkHoursEntry) => {
    const rate = getEmployeePayRate(entry.employeeId, entry.categoryId);
    const category = getWorkCategoryName(entry.categoryId);

    // Spell out the money before locking it in — approval freezes the rate,
    // and a missing one silently freezes at $0.00.
    const payLine = rate === undefined
      ? `\n\nNo rate is set for ${category ? `“${category}”` : 'this category'}, so this will lock at $0.00. Set it under “Pay rates” first if that is not what you want.`
      : `\n\nLocks in ${money(rate)}/hr = ${money((entry.totalHours || 0) * rate)}.`;

    const confirmed = await confirm({
      title: 'Approve these hours?',
      message:
        `${formatDateShort(entry.workDate)} · ${formatHours(entry.totalHours)} hrs. ` +
        'Once approved the employee can no longer edit or delete this entry.' +
        payLine,
      confirmLabel: 'Approve',
      variant: rate === undefined ? 'warning' : 'info',
    });
    if (!confirmed) return;

    try {
      await approveWorkHours(entry.id);
      showToast('Approved and locked', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Could not approve', 'error');
    }
  };

  const submitRejection = async () => {
    if (!rejecting || busy) return;
    setBusy(true);
    try {
      await rejectWorkHours(rejecting.id, rejectReason);
      showToast('Sent back for correction', 'success');
      setRejecting(null);
      setRejectReason('');
    } catch (error: any) {
      showToast(error?.message || 'Could not send back', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () => {
    const rows: (string | number)[][] = [
      ['Employee', 'Email', 'Date', 'Time In', 'Time Out', 'Break (min)', 'Hours', 'Category', 'Status', 'Rate', 'Amount', 'Note'],
    ];

    rollups.forEach(r => {
      r.entries.forEach(e => {
        const frozen = getPayForEntry(e.id);
        const liveRate = getEmployeePayRate(r.employeeId, e.categoryId);

        // Approved rows carry the frozen figures — those are what is owed.
        // Anything else is priced at today's rate and marked "(est.)" so a
        // pending line is never mistaken for a settled one.
        const rate = e.status === 'approved' ? frozen?.rateSnapshot : liveRate;
        const amount = e.status === 'approved'
          ? frozen?.payAmount
          : (e.status === 'pending' ? (e.totalHours || 0) * (liveRate ?? 0) : undefined);
        const suffix = e.status === 'approved' ? '' : ' (est.)';

        rows.push([
          r.name,
          r.email,
          e.workDate,
          formatTime12(e.startTime),
          formatTime12(e.endTime),
          e.breakMinutes || 0,
          formatHours(e.totalHours),
          getWorkCategoryName(e.categoryId) || '',
          e.status,
          rate === undefined ? 'no rate set' : rate.toFixed(2),
          amount === undefined ? '' : amount.toFixed(2) + suffix,
          e.notes || '',
        ]);
      });
    });

    if (rows.length === 1) {
      showToast('Nothing to export for this period', 'warning');
      return;
    }

    const entryCount = rows.length - 1;

    // Break the footer out by status. A single TOTAL would either silently
    // include rejected hours (and risk overpaying) or silently drop them
    // (and look like the rows do not add up). Showing all three lines makes
    // the arithmetic checkable at a glance.
    rows.push([]);
    rows.push(['TOTAL HOURS TO PAY (approved + pending)', '', '', '', '', '', formatHours(teamTotal), '', '', '', '', '']);
    rows.push(['  of which approved', '', '', '', '', '', formatHours(approvedTotal), '', '', '', '', '']);
    rows.push(['  of which pending', '', '', '', '', '', formatHours(pendingTotal), '', '', '', '', '']);
    if (rejectedTotal > 0) {
      rows.push(['REJECTED (not included above)', '', '', '', '', '', formatHours(rejectedTotal), '', '', '', '', '']);
    }
    rows.push([]);
    rows.push(['APPROVED PAY (owed)', '', '', '', '', '', '', '', '', '', approvedPayTotal.toFixed(2), '']);
    rows.push(['ESTIMATED PENDING PAY (not yet approved)', '', '', '', '', '', '', '', '', '', estPendingPayTotal.toFixed(2), '']);
    if (missingRateTotal > 0) {
      rows.push([`WARNING: ${missingRateTotal} approved entr${missingRateTotal === 1 ? 'y' : 'ies'} had no rate set and were locked at 0.00`, '', '', '', '', '', '', '', '', '', '', '']);
    }

    downloadCSV(`hours_${range.start}_to_${range.end}.csv`, toCSV(rows));
    showToast(`Exported ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`, 'success');
  };

  // ---------------------------------------------------------------- render

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
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
      {label}
    </button>
  );

  const stat = (label: string, value: string) => (
    <div style={{ flex: 1, minWidth: '120px' }}>
      <div style={{
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: theme.colors.txt.tertiary,
        fontFamily: theme.fonts.mono,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '24px',
        fontWeight: 700,
        color: theme.colors.txt.primary,
        fontFamily: theme.fonts.mono,
      }}>
        {value}
      </div>
    </div>
  );

  return (
    <>
      {/* ---- Period ---- */}
      <Card style={{ marginBottom: theme.spacing.lg }}>
        <div style={{
          display: 'flex',
          gap: theme.spacing.sm,
          flexWrap: 'wrap',
          marginBottom: theme.spacing.md,
        }}>
          {PRESETS.map(p =>
            chip(PERIOD_LABELS[p], !usingCustom && preset === p, () => {
              setPreset(p);
              setCustomStart('');
              setCustomEnd('');
            })
          )}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobileOrTablet ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr) auto',
          gap: theme.spacing.md,
          alignItems: 'end',
        }}>
          <Input
            type="date"
            label="From"
            value={customStart}
            max={customEnd || todayISO()}
            onChange={e => setCustomStart(e.target.value)}
          />
          <Input
            type="date"
            label="To"
            value={customEnd}
            min={customStart || undefined}
            onChange={e => setCustomEnd(e.target.value)}
          />
          {(usingCustom || rangeReversed) && (
            <Button
              variant="ghost"
              onClick={() => {
                setCustomStart('');
                setCustomEnd('');
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {rangeReversed && (
          <div style={{
            marginTop: theme.spacing.sm,
            fontSize: '13px',
            color: theme.colors.status.error,
            fontFamily: theme.fonts.primary,
          }}>
            “From” is after “To”. Showing {PERIOD_LABELS[preset].toLowerCase()} until that is fixed.
          </div>
        )}
      </Card>

      {/* ---- Totals ---- */}
      <Card style={{ marginBottom: theme.spacing.lg }}>
        <div style={{
          display: 'flex',
          gap: theme.spacing.lg,
          flexWrap: 'wrap',
          marginBottom: theme.spacing.md,
        }}>
          {stat('Approved pay', money(approvedPayTotal))}
          {stat('Est. pending pay', money(estPendingPayTotal))}
          {stat('Hours to pay', formatHours(teamTotal))}
          {stat('Approved hrs', formatHours(approvedTotal))}
          {stat('Pending hrs', formatHours(pendingTotal))}
          {rejectedTotal > 0 && stat('Rejected hrs', formatHours(rejectedTotal))}
        </div>

        <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={handleExport}>Export CSV</Button>
          {hasV7Schema && (
            <>
              <Button variant="outline" onClick={() => setShowRates(true)}>Pay rates</Button>
              <Button variant="outline" onClick={() => setShowCategories(true)}>Manage categories</Button>
            </>
          )}
        </div>

        {missingRateTotal > 0 && (
          <div style={{
            marginTop: theme.spacing.sm,
            fontSize: '13px',
            color: theme.colors.status.warning,
            fontFamily: theme.fonts.primary,
          }}>
            {missingRateTotal} approved {missingRateTotal === 1 ? 'entry was' : 'entries were'} locked
            at $0.00 because no rate was set for that person and category. Set the
            rate under “Pay rates”, then send the entry back and re-approve it to
            re-price.
          </div>
        )}

        {!hasV7Schema && (
          <div style={{
            marginTop: theme.spacing.sm,
            fontSize: '13px',
            color: theme.colors.status.warning,
            fontFamily: theme.fonts.primary,
          }}>
            Work categories are unavailable — migration v7 has not been run on this
            database yet. Hours still log and export correctly without them.
          </div>
        )}

        <div style={{
          marginTop: theme.spacing.sm,
          fontSize: '12px',
          color: theme.colors.txt.tertiary,
          fontFamily: theme.fonts.primary,
        }}>
          Showing {range.label.toLowerCase()}
          {!usingCustom && preset !== 'all' && ` (${formatDateShort(range.start)} – ${formatDateShort(range.end)})`}
          {rejectedTotal > 0 && ' · rejected hours are excluded from “to pay”'}
        </div>
      </Card>

      {/* ---- Per-employee ---- */}
      {rollups.length === 0 ? (
        <EmptyState
          title="No employees yet"
          description="Add team members under Admin → Team and their logged hours will show up here."
        />
      ) : (
        rollups.map(r => {
          const expanded = expandedId === r.employeeId;
          return (
            <Card key={r.employeeId} style={{ marginBottom: theme.spacing.md }} padding="none">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : r.employeeId)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing.md,
                  padding: theme.spacing.md,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: theme.colors.txt.primary,
                    fontFamily: theme.fonts.primary,
                  }}>
                    {r.name}
                    {r.employeeId === currentUser?.id && (
                      <span style={{ color: theme.colors.txt.tertiary, fontWeight: 400 }}> (you)</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: theme.colors.txt.tertiary,
                    fontFamily: theme.fonts.primary,
                  }}>
                    {r.entries.length === 0
                      ? 'Nothing logged this period'
                      : `${r.entries.length} ${r.entries.length === 1 ? 'entry' : 'entries'} · ${r.days} ${r.days === 1 ? 'day' : 'days'}`}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
                  {r.pending > 0 && (
                    <Badge variant="warning" size="sm">{formatHours(r.pending)} pending</Badge>
                  )}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontFamily: theme.fonts.mono,
                      fontSize: '20px',
                      fontWeight: 700,
                      color: r.approvedPay > 0 ? theme.colors.txt.primary : theme.colors.txt.tertiary,
                    }}>
                      {money(r.approvedPay)}
                    </div>
                    <div style={{
                      fontFamily: theme.fonts.mono,
                      fontSize: '12px',
                      color: theme.colors.txt.tertiary,
                    }}>
                      {formatHours(r.total)} hrs
                      {r.estimatedPendingPay > 0 && ` · ${money(r.estimatedPendingPay)} est.`}
                    </div>
                  </div>
                  <span style={{
                    color: theme.colors.txt.tertiary,
                    fontSize: '12px',
                    transform: expanded ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.15s',
                  }}>
                    ▼
                  </span>
                </div>
              </button>

              {expanded && (
                <div style={{ padding: `0 ${theme.spacing.md} ${theme.spacing.md}` }}>
                  <HoursHistoryList
                    entries={r.entries}
                    getCategoryName={getWorkCategoryName}
                    getPayLabel={entry => {
                      if (entry.status === 'approved') {
                        const frozen = getPayForEntry(entry.id);
                        if (!frozen) return undefined;
                        return frozen.rateMissing
                          ? { text: '$0.00 · no rate', warn: true }
                          : { text: `${money(frozen.payAmount)} @ ${money(frozen.rateSnapshot)}/hr` };
                      }
                      if (entry.status === 'pending') {
                        const rate = getEmployeePayRate(r.employeeId, entry.categoryId);
                        if (rate === undefined) return { text: 'no rate set', warn: true };
                        return { text: `${money((entry.totalHours || 0) * rate)} est.`, muted: true };
                      }
                      return undefined;
                    }}
                    onApprove={handleApprove}
                    onReject={entry => {
                      setRejecting(entry);
                      setRejectReason('');
                    }}
                    emptyTitle="Nothing logged this period"
                    emptyDescription={`${r.name} has not entered any hours between ${formatDateShort(range.start)} and ${formatDateShort(range.end)}.`}
                  />
                </div>
              )}
            </Card>
          );
        })
      )}

      {/* ---- Send-back reason ---- */}
      <Modal
        isOpen={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Send this entry back"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="primary" onClick={submitRejection} loading={busy}>Send back</Button>
          </>
        }
      >
        {rejecting && (
          <p style={{
            fontSize: '14px',
            color: theme.colors.txt.secondary,
            fontFamily: theme.fonts.primary,
            marginTop: 0,
          }}>
            {employeeName(rejecting.employeeId)} · {formatDateShort(rejecting.workDate)} ·{' '}
            {formatHours(rejecting.totalHours)} hrs
          </p>
        )}
        <Textarea
          label="What needs fixing? (optional)"
          placeholder="e.g. Times look like a double entry for Tuesday"
          rows={3}
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
        />
        <p style={{
          fontSize: '12px',
          color: theme.colors.txt.tertiary,
          fontFamily: theme.fonts.primary,
          marginBottom: 0,
        }}>
          They will see this on the entry and can edit it, which puts it back in your pending list.
        </p>
      </Modal>

      <WorkCategoryManager isOpen={showCategories} onClose={() => setShowCategories(false)} />
      <PayRatesManager isOpen={showRates} onClose={() => setShowRates(false)} />
      {confirmDialog}
    </>
  );
};

export default TeamHoursPanel;
