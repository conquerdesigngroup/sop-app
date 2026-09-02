import React, { useEffect, useState } from 'react';
import { NavigateFunction } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTask } from '../../contexts/TaskContext';
import { useWorkHours } from '../../contexts/WorkHoursContext';
import { useActivityLog, ActivityLog } from '../../contexts/ActivityLogContext';
import { useResponsive } from '../../hooks/useResponsive';
import { isTaskOverdue } from '../../hooks/useTaskCounts';
import { theme } from '../../theme';

/**
 * The three things a manager opens the dashboard to find out, above the
 * fold: who is behind, whose hours are waiting on them, and what just
 * happened. Each row goes to the page where it can be acted on.
 *
 * Hours and activity are super-admin only — the Team Hours review lives
 * behind isSuperAdmin, and the activity RPC refuses anyone below it.
 */

const card: React.CSSProperties = {
  backgroundColor: theme.colors.bg.secondary,
  border: `2px solid ${theme.colors.bdr.primary}`,
  borderRadius: theme.borderRadius.lg,
  padding: '16px',
  minWidth: 0,
};

const header: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '10px',
  gap: '8px',
};

const title: React.CSSProperties = {
  fontSize: '17px',
  fontWeight: 700,
  color: theme.colors.txt.primary,
  margin: 0,
};

const linkBtn: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: theme.colors.primary,
  backgroundColor: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '4px 0',
  whiteSpace: 'nowrap',
};

const row: React.CSSProperties = {
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
};

const empty: React.CSSProperties = {
  fontSize: '14px',
  color: theme.colors.txt.tertiary,
  padding: '8px',
  margin: 0,
};

const pill = (color: string): React.CSSProperties => ({
  marginLeft: 'auto',
  minWidth: '24px',
  padding: '0 8px',
  height: '22px',
  lineHeight: '22px',
  borderRadius: '11px',
  backgroundColor: color,
  color: '#FFFFFF',
  fontFamily: theme.fonts.mono,
  fontSize: '12px',
  fontWeight: 700,
  textAlign: 'center',
  flexShrink: 0,
});

const relative = (iso: string): string => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

const AdminAttention: React.FC<{ navigate: NavigateFunction }> = ({ navigate }) => {
  const { users, isSuperAdmin } = useAuth();
  const { jobTasks } = useTask();
  const { workHours } = useWorkHours();
  const { fetchPage } = useActivityLog();
  const { isMobileOrTablet } = useResponsive();
  const [recent, setRecent] = useState<ActivityLog[] | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    fetchPage({}, null, 6)
      .then(rows => { if (!cancelled) setRecent(rows); })
      .catch(() => { if (!cancelled) setRecent([]); });
    return () => { cancelled = true; };
  }, [isSuperAdmin, fetchPage]);

  // Overdue, grouped by who holds it. A task with two people counts for
  // both — each of them is behind on it.
  const overdueByPerson = (() => {
    const counts = new Map<string, number>();
    let unassigned = 0;
    for (const task of jobTasks) {
      if (!isTaskOverdue(task)) continue;
      if (!task.assignedTo?.length) { unassigned++; continue; }
      for (const id of task.assignedTo) counts.set(id, (counts.get(id) || 0) + 1);
    }
    const rows = Array.from(counts.entries())
      .map(([id, count]) => {
        const u = users.find(x => x.id === id);
        return { id, name: u ? `${u.firstName} ${u.lastName}` : 'Former team member', count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    return { rows, unassigned };
  })();

  const pendingHours = (() => {
    const counts = new Map<string, number>();
    for (const entry of workHours) {
      if (entry.status !== 'pending' || entry.pendingSync) continue;
      counts.set(entry.employeeId, (counts.get(entry.employeeId) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, count]) => {
        const u = users.find(x => x.id === id);
        return { id, name: u ? `${u.firstName} ${u.lastName}` : 'Former team member', count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  })();

  const totalPendingHours = pendingHours.reduce((n, r) => n + r.count, 0);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobileOrTablet ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: theme.spacing.md,
      marginBottom: theme.spacing.lg,
    }}>
      <section style={card} aria-label="Overdue by person">
        <div style={header}>
          <h3 style={title}>Overdue by person</h3>
          <button style={linkBtn} onClick={() => navigate('/job-tasks', { state: { filterStatus: 'overdue' } })}>All overdue</button>
        </div>
        {overdueByPerson.rows.length === 0 && overdueByPerson.unassigned === 0 ? (
          <p style={empty}>Nothing overdue. Nice.</p>
        ) : (
          <div>
            {overdueByPerson.rows.map(r => (
              <button key={r.id} style={row} onClick={() => navigate('/job-tasks', { state: { search: r.name, filterStatus: 'overdue' } })}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={pill(theme.colors.status.error)}>{r.count}</span>
              </button>
            ))}
            {overdueByPerson.unassigned > 0 && (
              <button style={{ ...row, color: theme.colors.txt.secondary }} onClick={() => navigate('/job-tasks', { state: { filterStatus: 'overdue' } })}>
                <span style={{ flex: 1 }}>Nobody assigned</span>
                <span style={pill(theme.colors.status.warning)}>{overdueByPerson.unassigned}</span>
              </button>
            )}
          </div>
        )}
      </section>

      {isSuperAdmin && (
        <section style={card} aria-label="Hours awaiting review">
          <div style={header}>
            <h3 style={title}>Hours awaiting review</h3>
            <button style={linkBtn} onClick={() => navigate('/hours-input', { state: { tab: 'team' } })}>Review</button>
          </div>
          {pendingHours.length === 0 ? (
            <p style={empty}>No hours waiting on you.</p>
          ) : (
            <div>
              <p style={{ ...empty, paddingTop: 0, paddingBottom: '4px' }}>
                {totalPendingHours} entr{totalPendingHours === 1 ? 'y' : 'ies'} to approve
              </p>
              {pendingHours.map(r => (
                <button key={r.id} style={row} onClick={() => navigate('/hours-input', { state: { tab: 'team' } })}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={pill(theme.colors.status.warning)}>{r.count}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {isSuperAdmin && (
        <section style={card} aria-label="Latest activity">
          <div style={header}>
            <h3 style={title}>Latest activity</h3>
            <button style={linkBtn} onClick={() => navigate('/activity-log')}>Full log</button>
          </div>
          {recent === null ? (
            <p style={empty}>Loading…</p>
          ) : recent.length === 0 ? (
            <p style={empty}>Nothing logged yet.</p>
          ) : (
            <div>
              {recent.map(log => (
                <button key={log.id} style={row} onClick={() => navigate('/activity-log')}>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <strong>{log.user_name || log.user_email || 'System'}</strong>
                      {' '}{log.action.replace(/_/g, ' ')}
                    </span>
                    {log.entity_title && (
                      <span style={{ fontSize: '12px', color: theme.colors.txt.tertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.entity_title}
                      </span>
                    )}
                  </span>
                  <span style={{ fontFamily: theme.fonts.mono, fontSize: '12px', color: theme.colors.txt.tertiary, flexShrink: 0 }}>
                    {relative(log.created_at)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default AdminAttention;
