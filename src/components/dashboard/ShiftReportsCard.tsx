import React from 'react';
import { NavigateFunction } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useShiftReports } from '../../contexts/ShiftReportContext';
import { theme } from '../../theme';
import { Button } from '../ui';
import { SHIFT_TYPE_LABEL, formatTimestamp, unseenTaggedReports } from '../../lib/shiftReports';
import { personName } from '../reports/ShiftReportCard';

/**
 * The dashboard's way into shift reports, on both dashboards.
 *
 * Its first job is the alert: every report someone tagged you on that you
 * have not opened yet, one tap from Home, in the brand accent so it reads as
 * something waiting for you. Opening the report clears it (v77's
 * mark_shift_report_seen), here and on the header badge at once, because both
 * read the same ShiftReportContext.
 *
 * Its second is the button that writes one, so the end-of-shift report is one
 * tap from Home for everybody — the shortcut grid's six tiles are already
 * spoken for by pages that must stay one tap away (see Shortcuts.tsx).
 */
const ShiftReportsCard: React.FC<{ navigate: NavigateFunction }> = ({ navigate }) => {
  const { users, currentUser } = useAuth();
  const { reports, error } = useShiftReports();

  // The table is not there yet (v77 not applied): say nothing rather than
  // offering a button that leads to an error.
  if (error) return null;

  const waiting = unseenTaggedReports(reports, currentUser?.id);

  return (
    <section
      className="glass-panel"
      aria-label="Shift reports"
      style={{
        backgroundColor: theme.colors.bg.secondary,
        border: `2px solid ${waiting.length > 0 ? theme.colors.primary : theme.colors.bdr.primary}`,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.lg,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: theme.colors.txt.primary }}>
            {waiting.length > 0
              ? `Tagged on ${waiting.length} report${waiting.length === 1 ? '' : 's'}`
              : 'Shift reports'}
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: theme.colors.txt.tertiary }}>
            {waiting.length > 0 ? 'Open each one to read it and clear this alert.' : 'Opening or closing your shift? Leave a report for the team.'}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <Button size="sm" variant="secondary" onClick={() => navigate('/reports')}>All reports</Button>
          <Button size="sm" variant="primary" onClick={() => navigate('/reports?new=1')}>Create new report</Button>
        </div>
      </div>

      {waiting.length > 0 && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {waiting.slice(0, 5).map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate(`/reports?report=${r.id}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '9px 8px',
                background: 'none',
                border: 'none',
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
                textAlign: 'left',
                color: theme.colors.txt.primary,
                fontFamily: theme.fonts.primary,
                fontSize: '14px',
              }}
            >
              <span aria-hidden="true" style={{
                width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, backgroundColor: theme.colors.primary,
              }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <strong>{personName(users, r.authorId)}</strong> · {SHIFT_TYPE_LABEL[r.shiftType]} report
              </span>
              <span style={{ fontFamily: theme.fonts.mono, fontSize: '12px', color: theme.colors.txt.tertiary, flexShrink: 0 }}>
                {formatTimestamp(r.createdAt)}
              </span>
            </button>
          ))}
          {waiting.length > 5 && (
            <Button size="sm" variant="ghost" onClick={() => navigate('/reports')}>
              {waiting.length - 5} more
            </Button>
          )}
        </div>
      )}
    </section>
  );
};

export default ShiftReportsCard;
