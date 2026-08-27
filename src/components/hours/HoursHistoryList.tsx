import React from 'react';
import { WorkHoursEntry, WorkHoursStatus } from '../../types';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { Badge, Button, EmptyState } from '../ui';
import { formatDateShort, formatTime12, formatHours } from './hoursUtils';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_META: Record<WorkHoursStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Pending', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Needs fixing', variant: 'danger' },
};

interface HoursHistoryListProps {
  entries: WorkHoursEntry[];
  getCategoryName: (categoryId?: string | null) => string | undefined;
  /** Shown above the time range — used by the admin drilldown. */
  getEmployeeName?: (employeeId: string) => string;
  onEdit?: (entry: WorkHoursEntry) => void;
  onDelete?: (entry: WorkHoursEntry) => void;
  /**
   * Let edit/delete reach an APPROVED entry. Off by default, and only the
   * super-admin team panel turns it on.
   *
   * The employee-facing default is not squeamishness, it is what RLS actually
   * allows: work_hours_update permits an employee to write only their own
   * 'pending' or 'rejected' rows, so offering Edit on an approved one would be
   * a button the database refuses. A super admin has no such restriction, and
   * correcting an approved entry is a supported path — work_hours_freeze_pay
   * re-multiplies the corrected hours against the SAME frozen rate_snapshot
   * rather than looking the rate up again, so settled history cannot shift
   * under a rate that changed after approval.
   *
   * pendingSync stays locked regardless: that row has no database id yet, so
   * any write would address nothing.
   */
  allowEditingApproved?: boolean;
  onApprove?: (entry: WorkHoursEntry) => void;
  onReject?: (entry: WorkHoursEntry) => void;
  /**
   * Optional money line under the hours.
   *
   * Only ever supplied by the admin panel. Employee-facing renders omit it,
   * and the underlying tables are admin-only by RLS anyway, so there is no
   * path by which an employee sees a figure here.
   */
  getPayLabel?: (entry: WorkHoursEntry) => { text: string; muted?: boolean; warn?: boolean } | undefined;
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * Approved entries are read-only for the employee who logged them — the
 * RLS policy in migration v7 only permits writes to 'pending' and
 * 'rejected' rows. Hiding the buttons keeps the UI honest about that
 * rather than offering an action the database will refuse.
 *
 * A queued entry is locked for a different reason: it has no row yet, so
 * its id is a client-side string and every write would address nothing.
 */
const isLocked = (entry: WorkHoursEntry) =>
  entry.status === 'approved' || Boolean(entry.pendingSync);

const HoursHistoryList: React.FC<HoursHistoryListProps> = ({
  entries,
  getCategoryName,
  getEmployeeName,
  onEdit,
  onDelete,
  allowEditingApproved = false,
  onApprove,
  onReject,
  getPayLabel,
  emptyTitle = 'No hours logged yet',
  emptyDescription = 'Entries you log will appear here, newest first.',
}) => {
  const { isMobileOrTablet } = useResponsive();

  if (entries.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div style={{
      border: `1px solid ${theme.colors.bdr.primary}`,
      borderRadius: theme.borderRadius.lg,
      overflow: 'hidden',
      backgroundColor: theme.colors.bg.secondary,
    }}>
      {entries.map((entry, i) => {
        const category = getCategoryName(entry.categoryId);
        const status = STATUS_META[entry.status] ?? STATUS_META.pending;
        const locked = isLocked(entry);
        const writable = allowEditingApproved ? !entry.pendingSync : !locked;
        const canEdit = Boolean(onEdit) && writable;
        const canDelete = Boolean(onDelete) && writable;
        // A locked row still renders the column — otherwise the "Locked"
        // note below has nowhere to go and the row silently loses its
        // buttons with no explanation of why.
        const wouldHaveActions = Boolean(onEdit) || Boolean(onDelete);
        // A queued row has no database row to act on, so the admin controls
        // are withheld too — not just the employee's edit and delete.
        const canReview = !entry.pendingSync;
        const showActions =
          canEdit || canDelete ||
          (canReview && (Boolean(onApprove) || Boolean(onReject))) ||
          (locked && wouldHaveActions);

        return (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              flexDirection: isMobileOrTablet ? 'column' : 'row',
              gap: theme.spacing.md,
              padding: theme.spacing.md,
              borderTop: i === 0 ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
              alignItems: isMobileOrTablet ? 'stretch' : 'center',
            }}
          >
            {/* ---- Date / time / category / note ---- */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.sm,
                flexWrap: 'wrap',
                marginBottom: '2px',
              }}>
                <span style={{
                  fontFamily: theme.fonts.mono,
                  fontSize: '13px',
                  color: theme.colors.txt.tertiary,
                }}>
                  {formatDateShort(entry.workDate)}
                </span>
                {entry.pendingSync
                  ? <Badge variant="info" size="sm">Saved on this device</Badge>
                  : <Badge variant={status.variant} size="sm">{status.label}</Badge>}
                {getEmployeeName && (
                  <span style={{
                    fontSize: '13px',
                    color: theme.colors.txt.tertiary,
                    fontFamily: theme.fonts.primary,
                  }}>
                    {getEmployeeName(entry.employeeId)}
                  </span>
                )}
              </div>

              <div style={{
                fontSize: '15px',
                fontWeight: 600,
                color: theme.colors.txt.primary,
                fontFamily: theme.fonts.primary,
              }}>
                {formatTime12(entry.startTime)} – {formatTime12(entry.endTime)}
                {category && (
                  <span style={{ color: theme.colors.primary }}>{`  ·  ${category}`}</span>
                )}
              </div>

              {entry.breakMinutes > 0 && (
                <div style={{
                  fontSize: '12px',
                  color: theme.colors.txt.tertiary,
                  fontFamily: theme.fonts.primary,
                }}>
                  less {entry.breakMinutes} min break
                </div>
              )}

              {entry.notes && (
                <div style={{
                  fontSize: '13px',
                  color: theme.colors.txt.secondary,
                  fontFamily: theme.fonts.primary,
                  marginTop: '2px',
                  wordBreak: 'break-word',
                }}>
                  {entry.notes}
                </div>
              )}

              {entry.pendingSync && (
                <div style={{
                  fontSize: '13px',
                  color: theme.colors.txt.tertiary,
                  fontFamily: theme.fonts.primary,
                  marginTop: theme.spacing.xs,
                }}>
                  Waiting for a connection &mdash; it will submit itself.
                </div>
              )}

              {entry.status === 'rejected' && entry.rejectionReason && (
                <div style={{
                  fontSize: '13px',
                  color: theme.colors.status.error,
                  fontFamily: theme.fonts.primary,
                  marginTop: theme.spacing.xs,
                }}>
                  Sent back: {entry.rejectionReason}
                </div>
              )}
            </div>

            {/* ---- Hours ---- */}
            <div style={{
              minWidth: '92px',
              textAlign: isMobileOrTablet ? 'left' : 'right',
            }}>
              <div style={{
                fontFamily: theme.fonts.mono,
                fontSize: '18px',
                fontWeight: 700,
                color: theme.colors.txt.primary,
              }}>
                {formatHours(entry.totalHours)}
              </div>
              {(() => {
                const pay = getPayLabel?.(entry);
                if (!pay) return null;
                return (
                  <div style={{
                    fontFamily: theme.fonts.mono,
                    fontSize: '12px',
                    color: pay.warn
                      ? theme.colors.status.warning
                      : pay.muted
                        ? theme.colors.txt.tertiary
                        : theme.colors.txt.secondary,
                  }}>
                    {pay.text}
                  </div>
                );
              })()}
            </div>

            {/* ---- Actions ---- */}
            {showActions && (
              <div style={{
                display: 'flex',
                gap: theme.spacing.sm,
                flexShrink: 0,
                flexWrap: 'wrap',
              }}>
                {canReview && onApprove && entry.status !== 'approved' && (
                  <Button size="sm" variant="outline" onClick={() => onApprove(entry)}>
                    Approve
                  </Button>
                )}
                {canReview && onReject && entry.status !== 'rejected' && (
                  <Button size="sm" variant="ghost" onClick={() => onReject(entry)}>
                    Send back
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" variant="ghost" onClick={() => onEdit!(entry)}>
                    Edit
                  </Button>
                )}
                {canDelete && (
                  <Button size="sm" variant="ghost" onClick={() => onDelete!(entry)}>
                    Delete
                  </Button>
                )}
                {locked && !writable && !onApprove && !onReject && (
                  <span style={{
                    fontSize: '12px',
                    color: theme.colors.txt.tertiary,
                    fontFamily: theme.fonts.primary,
                    alignSelf: 'center',
                  }}>
                    {entry.pendingSync ? 'Not sent yet' : 'Locked'}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default HoursHistoryList;
