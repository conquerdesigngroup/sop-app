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
 */
const isLocked = (entry: WorkHoursEntry) => entry.status === 'approved';

const HoursHistoryList: React.FC<HoursHistoryListProps> = ({
  entries,
  getCategoryName,
  getEmployeeName,
  onEdit,
  onDelete,
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
        const canEdit = Boolean(onEdit) && !locked;
        const canDelete = Boolean(onDelete) && !locked;
        // A locked row still renders the column — otherwise the "Locked"
        // note below has nowhere to go and the row silently loses its
        // buttons with no explanation of why.
        const wouldHaveActions = Boolean(onEdit) || Boolean(onDelete);
        const showActions = canEdit || canDelete || Boolean(onApprove) || Boolean(onReject) || (locked && wouldHaveActions);

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
                <Badge variant={status.variant} size="sm">{status.label}</Badge>
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
                {onApprove && entry.status !== 'approved' && (
                  <Button size="sm" variant="outline" onClick={() => onApprove(entry)}>
                    Approve
                  </Button>
                )}
                {onReject && entry.status !== 'rejected' && (
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
                {locked && !onApprove && !onReject && (
                  <span style={{
                    fontSize: '12px',
                    color: theme.colors.txt.tertiary,
                    fontFamily: theme.fonts.primary,
                    alignSelf: 'center',
                  }}>
                    Locked
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
