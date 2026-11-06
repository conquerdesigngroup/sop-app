import React from 'react';
import { Badge } from '../ui';
import StaffAvatar from '../StaffAvatar';
import { theme } from '../../theme';
import { User } from '../../types';
import {
  ShiftReport,
  SHIFT_TYPE_LABEL,
  formatShiftDate,
  formatTimestamp,
} from '../../lib/shiftReports';

export const personName = (users: User[], id: string): string => {
  const u = users.find(x => x.id === id);
  if (u) return `${u.firstName} ${u.lastName}`.trim();
  // An empty list means the team has not loaded yet, not that everyone left.
  return users.length === 0 ? 'Team member' : 'Former team member';
};

interface Props {
  report: ShiftReport;
  users: User[];
  /** The viewer is tagged and has not opened it. */
  unseen?: boolean;
  onOpen: () => void;
}

/**
 * One report in a list. The whole card is the button, so it is one tap on a
 * phone; the body is clamped to four lines and the detail shows the rest.
 */
const ShiftReportCard: React.FC<Props> = ({ report, users, unseen, onOpen }) => {
  const author = users.find(u => u.id === report.authorId);
  const edited = report.updatedAt && report.updatedAt.slice(0, 16) !== report.createdAt.slice(0, 16);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${SHIFT_TYPE_LABEL[report.shiftType]} report by ${personName(users, report.authorId)}, ${formatShiftDate(report.shiftDate)}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '100%',
        minWidth: 0,
        textAlign: 'left',
        padding: theme.spacing.md,
        backgroundColor: theme.colors.bg.secondary,
        border: `2px solid ${unseen ? theme.colors.primary : theme.colors.bdr.primary}`,
        borderRadius: theme.borderRadius.lg,
        color: theme.colors.txt.primary,
        fontFamily: theme.fonts.primary,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', minWidth: 0 }}>
        <StaffAvatar firstName={author?.firstName} lastName={author?.lastName} avatarPath={author?.avatarPath} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '15px', overflowWrap: 'anywhere' }}>
            {personName(users, report.authorId)}
          </div>
          <div style={{ fontSize: '12px', color: theme.colors.txt.tertiary, fontFamily: theme.fonts.mono }}>
            {formatTimestamp(report.createdAt)}{edited ? ' · edited' : ''}
          </div>
        </div>
      </div>

      {/* Type and date on their own row, so a long name beside them on a
          320px phone never squeezes the timestamp onto three lines. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 8px' }}>
        <Badge variant={report.shiftType === 'opening' ? 'info' : 'warning'} size="sm">
          {SHIFT_TYPE_LABEL[report.shiftType]}
        </Badge>
        <span style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.txt.secondary }}>
          {formatShiftDate(report.shiftDate)}
        </span>
        {unseen && <Badge variant="primary" size="sm">New</Badge>}
      </div>

      <p style={{
        margin: 0,
        fontSize: '14px',
        lineHeight: 1.5,
        color: theme.colors.txt.secondary,
        whiteSpace: 'pre-line',
        overflowWrap: 'anywhere',
        display: '-webkit-box',
        WebkitLineClamp: 4,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {report.body}
      </p>

      {(report.tags.length > 0 || report.commentCount > 0) && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px 12px',
          fontSize: '12px',
          color: theme.colors.txt.tertiary,
        }}>
          {report.tags.length > 0 && (
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              Tagged: {report.tags.map(t => personName(users, t.userId)).join(', ')}
            </span>
          )}
          {report.commentCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {report.commentCount} message{report.commentCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}
    </button>
  );
};

export default ShiftReportCard;
