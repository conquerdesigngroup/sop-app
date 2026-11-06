import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, PageHeader, SearchInput, Select, EmptyState, PlusIcon } from '../components/ui';
import ShiftReportCard, { personName } from '../components/reports/ShiftReportCard';
import ShiftReportDetail from '../components/reports/ShiftReportDetail';
import ShiftReportForm, { ShiftReportFormValues } from '../components/reports/ShiftReportForm';
import { useAuth } from '../contexts/AuthContext';
import { useShiftReports } from '../contexts/ShiftReportContext';
import { useToast } from '../contexts/ToastContext';
import { useResponsive } from '../hooks/useResponsive';
import { theme } from '../theme';
import { DEFAULT_FILTER, ShiftReport, ShiftReportFilter, filterReports, isUnseenFor } from '../lib/shiftReports';

/**
 * Reports: every opening and closing shift report, newest first, for the
 * whole team to read and the general manager to track.
 *
 * Anyone on staff writes one with "Create new report", tags whoever needs to
 * see it, and talks about it in the chat under it. Admins and super admins
 * archive a report when it is dealt with; archived ones live in the Archive
 * page's Shift Reports tab, and admins can also reach them here with "Show
 * archived" because the Archive page itself is super-admin only.
 *
 * ?report=<id> opens one report directly — the dashboard's "tagged" card
 * links here that way — and ?new=1 opens Create new report.
 */
const ReportsPage: React.FC = () => {
  const { users, currentUser, isAdmin } = useAuth();
  const { reports, loading, error, createReport, updateReport } = useShiftReports();
  const { showToast } = useToast();
  const { isMobileOrTablet, isMobile } = useResponsive();
  const [params, setParams] = useSearchParams();

  const [filter, setFilter] = useState<ShiftReportFilter>(DEFAULT_FILTER);
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftReport | null>(null);

  const openId = params.get('report');
  const openReport = useMemo(() => reports.find(r => r.id === openId) || null, [reports, openId]);
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('report', id); else next.delete('report');
    setParams(next, { replace: !id });
  };

  // ?new=1, from the dashboard's Create new report button.
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setEditing(null);
    setFormOpen(true);
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

  // A link to a report that is archived lands on it in the archived list
  // rather than on a list it is not in.
  useEffect(() => {
    if (openReport?.archivedAt && isAdmin) setShowArchived(true);
  }, [openReport, isAdmin]);

  const nameOf = (id: string) => personName(users, id);
  const pool = reports.filter(r => (showArchived ? !!r.archivedAt : !r.archivedAt));
  const visible = filterReports(pool, filter, currentUser?.id, nameOf);
  const authors = Array.from(new Set(pool.map(r => r.authorId)))
    .map(id => ({ value: id, label: nameOf(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const unseenCount = reports.filter(r => !r.archivedAt && isUnseenFor(r, currentUser?.id)).length;
  const filtered = filter.shiftType !== 'all' || filter.authorId !== 'all' || filter.search.trim() !== '' || filter.taggedMe;

  const submit = async (values: ShiftReportFormValues) => {
    if (editing) {
      await updateReport(editing.id, values);
      showToast('Report updated', 'success');
    } else {
      await createReport(values);
      showToast(values.tagUserIds.length > 0
        ? `Report posted. ${values.tagUserIds.length} ${values.tagUserIds.length === 1 ? 'person' : 'people'} will see it on their dashboard.`
        : 'Report posted', 'success');
    }
  };

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    borderRadius: theme.borderRadius.full,
    border: `2px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
    backgroundColor: active ? theme.colors.primary : 'transparent',
    color: active ? '#FFFFFF' : theme.colors.txt.secondary,
    fontFamily: theme.fonts.primary,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  });

  return (
    <div style={{
      padding: isMobileOrTablet ? '16px' : '32px 40px',
      maxWidth: '1100px',
      margin: '0 auto',
    }}>
      <PageHeader
        title="Reports"
        subtitle={showArchived ? 'Archived shift reports' : 'Opening and closing shift reports from the team'}
        actions={
          <Button leftIcon={<PlusIcon />} onClick={() => { setEditing(null); setFormOpen(true); }}>
            Create new report
          </Button>
        }
      />

      {/* Filters. Every row here wraps: a centred or nowrap row of a
          variable number of items is how a chip ends up off-screen. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {(['all', 'opening', 'closing'] as const).map(t => (
            <button
              key={t}
              type="button"
              aria-pressed={filter.shiftType === t}
              onClick={() => setFilter(f => ({ ...f, shiftType: t }))}
              style={chip(filter.shiftType === t)}
            >
              {t === 'all' ? 'All' : t === 'opening' ? 'Opening' : 'Closing'}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={filter.taggedMe}
            onClick={() => setFilter(f => ({ ...f, taggedMe: !f.taggedMe }))}
            style={chip(filter.taggedMe)}
          >
            Tagged me{unseenCount > 0 ? ` (${unseenCount} new)` : ''}
          </button>
          {isAdmin && (
            <button
              type="button"
              aria-pressed={showArchived}
              onClick={() => setShowArchived(v => !v)}
              style={chip(showArchived)}
            >
              {showArchived ? 'Showing archived' : 'Show archived'}
            </button>
          )}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: '8px',
        }}>
          <SearchInput
            placeholder="Search reports…"
            value={filter.search}
            onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
            onClear={() => setFilter(f => ({ ...f, search: '' }))}
          />
          <Select
            aria-label="Written by"
            value={filter.authorId}
            onChange={e => setFilter(f => ({ ...f, authorId: e.target.value }))}
            options={[{ value: 'all', label: 'Everyone' }, ...authors]}
          />
        </div>
      </div>

      {loading ? (
        <p role="status" style={{ color: theme.colors.txt.tertiary }}>Loading reports…</p>
      ) : error ? (
        <EmptyState title="Reports aren't available" description={error} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={filtered ? 'No reports match' : showArchived ? 'Nothing archived yet' : 'No reports yet'}
          description={filtered
            ? 'Try a different filter or search.'
            : showArchived
              ? 'Reports an admin archives will show here.'
              : 'Tap Create new report at the end of your shift to post the first one.'}
          action={filtered
            ? <Button variant="secondary" onClick={() => setFilter(DEFAULT_FILTER)}>Clear filters</Button>
            : undefined}
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobileOrTablet ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))',
          gap: theme.spacing.md,
        }}>
          {visible.map(r => (
            <ShiftReportCard
              key={r.id}
              report={r}
              users={users}
              unseen={isUnseenFor(r, currentUser?.id)}
              onOpen={() => setOpen(r.id)}
            />
          ))}
        </div>
      )}

      <ShiftReportDetail
        report={openReport}
        onClose={() => setOpen(null)}
        onEdit={r => { setOpen(null); setEditing(r); setFormOpen(true); }}
      />

      <ShiftReportForm
        isOpen={formOpen}
        report={editing}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={submit}
      />
    </div>
  );
};

export default ReportsPage;
