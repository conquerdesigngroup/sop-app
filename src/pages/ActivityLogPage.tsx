import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../contexts/ToastContext';
import { useActivityLog, ActivityLog, LogFilters } from '../contexts/ActivityLogContext';
import { logActivity as writeLog } from '../lib/activityLog';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  Select,
  Spinner,
} from '../components/ui';

/**
 * Super-admin overwatch (AUDIT-LOG-SPEC.md §6). The bar it is built to: pick
 * any person, any document, any day, and get the answer in under three clicks.
 *
 *  - Filters live in the URL, so a filtered view is a LINK an admin can send
 *    to another admin.
 *  - Clicking an actor is drill-down one: everything that person ever did.
 *    ?entity= deep-links the other direction (a document's history).
 *  - Pagination is keyset (see ActivityLogContext) — scrolling a live log
 *    never repeats or skips a row.
 *  - Export warns before producing a file, because the file is full of
 *    families' and students' names, and the export itself is logged.
 */

// ---------------------------------------------------------------- sentences

/**
 * action → plain-English template. One map, not strings sprinkled through the
 * component; {entity} is the row's entity_title. Anything unmapped falls back
 * to the snake_case humanised, so a brand-new action is readable before
 * anyone remembers to add it here.
 */
const SENTENCES: Record<string, string> = {
  user_login: 'signed in',
  user_signed_in: 'signed in',
  user_logout: 'signed out',
  user_signed_out: 'signed out',
  user_sign_in_failed: 'failed to sign in',
  user_created: 'created the account {entity}',
  user_updated: 'updated the account {entity}',
  user_deleted: 'removed the account {entity}',
  user_role_changed: 'changed the role of {entity}',
  user_password_changed: 'changed the password for {entity}',
  user_password_reset_requested: 'requested a password reset',
  user_email_changed: 'changed the email for {entity}',
  user_activated: 'reactivated the account {entity}',
  user_deactivated: 'disabled the account {entity}',
  client_signed_up: 'created their family account',
  client_signup_rejected: 'had a sign-up attempt rejected',
  client_email_verified: 'verified their email address',
  client_otp_resent: 'was sent a new sign-up code',
  client_email_verify_failed: 'entered a wrong or expired sign-up code',
  roster_imported: 'imported the roster {entity}',
  roster_row_deactivated: 'deactivated the roster row for {entity}',
  roster_row_reactivated: 'reactivated the roster row for {entity}',
  roster_row_unlinked: 'unlinked the roster row for {entity}',
  portal_admin_denied: 'was refused portal-admin access',
  admin_users_denied: 'was refused account-admin access',
  calendar_push_denied: 'was refused studio-calendar access',
  admin_viewed_activity_log: 'opened the activity log',
  activity_log_exported: 'exported the activity log',
  sop_created: 'created the SOP {entity}',
  sop_updated: 'updated the SOP {entity}',
  sop_deleted: 'deleted the SOP {entity}',
  sop_published: 'published the SOP {entity}',
  sop_archived: 'archived the SOP {entity}',
  sop_restored: 'restored the SOP {entity}',
  sop_imported: 'imported the SOP {entity}',
  task_created: 'created the task {entity}',
  task_updated: 'updated the task {entity}',
  task_deleted: 'deleted the task {entity}',
  task_assigned: 'assigned the task {entity}',
  task_completed: 'completed the task {entity}',
  task_started: 'started the task {entity}',
  job_created: 'created the job {entity}',
  job_updated: 'updated the job {entity}',
  job_completed: 'completed the job {entity}',
  job_deleted: 'deleted the job {entity}',
  template_created: 'created the template {entity}',
  template_updated: 'updated the template {entity}',
  template_deleted: 'deleted the template {entity}',
  document_uploaded: 'uploaded {entity}',
  document_updated: 'updated the document {entity}',
  document_published: 'published {entity}',
  document_unpublished: 'unpublished {entity}',
  document_deleted: 'deleted {entity}',
  document_downloaded: 'downloaded {entity}',
  class_created: 'created the class {entity}',
  class_updated: 'updated the class {entity}',
  class_deleted: 'deleted the class {entity}',
  update_posted: 'posted the update {entity}',
  update_updated: 'edited the update {entity}',
  update_deleted: 'deleted the update {entity}',
  event_created: 'created the event {entity}',
  event_updated: 'updated the event {entity}',
  event_deleted: 'deleted the event {entity}',
  work_hours_submitted: 'submitted hours for {entity}',
  work_hours_updated: 'edited the hours entry for {entity}',
  work_hours_deleted: 'deleted the hours entry for {entity}',
  work_hours_approved: 'approved the hours for {entity}',
  work_hours_rejected: 'rejected the hours for {entity}',
  pay_rate_changed: 'changed a pay rate',
  portal_gate_toggled: 'changed whether {entity} needs an access code',
  portal_code_changed: 'changed the access code for {entity}',
};

const humanise = (s: string) => s.replace(/_/g, ' ');

const sentenceFor = (log: ActivityLog): React.ReactNode => {
  const template = SENTENCES[log.action];
  const entity = log.entity_title;
  if (!template) {
    return <>{humanise(log.action)}{entity ? <> — <strong>{entity}</strong></> : null}</>;
  }
  if (!template.includes('{entity}')) return <>{template}</>;
  const [before, after] = template.split('{entity}');
  return <>{before}<strong>{entity ?? '(untitled)'}</strong>{after}</>;
};

// ---------------------------------------------------------------- dates

const startOfLocalDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

/** ISO range for a preset; custom reads the date inputs. `to` is exclusive. */
const rangeFor = (preset: string, fromDate: string, toDate: string): { from?: string; to?: string } => {
  switch (preset) {
    case 'today': return { from: startOfLocalDay().toISOString() };
    case '7d': return { from: daysAgo(7).toISOString() };
    case '30d': return { from: daysAgo(30).toISOString() };
    case 'custom': {
      const out: { from?: string; to?: string } = {};
      if (fromDate) out.from = new Date(`${fromDate}T00:00:00`).toISOString();
      if (toDate) {
        const end = new Date(`${toDate}T00:00:00`);
        end.setDate(end.getDate() + 1);
        out.to = end.toISOString();
      }
      return out;
    }
    default: return {};
  }
};

// ---------------------------------------------------------------- views

interface SavedView { name: string; params: string }

const BUILTIN_VIEWS: SavedView[] = [
  { name: 'Failed sign-ins (7d)', params: 'preset=7d&result=failure&action=user_sign_in_failed' },
  { name: 'Client activity (24h)', params: 'preset=today&kind=client' },
  { name: 'Account changes (30d)', params: 'preset=30d&type=user' },
];

const VIEWS_KEY = 'didc_activity_saved_views';

const loadSavedViews = (): SavedView[] => {
  try {
    return JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]');
  } catch { return []; }
};

// ---------------------------------------------------------------- page

const EXPORT_CAP = 10000;

/**
 * Where a row's entity lives in the app, if it lives anywhere.
 *
 * The union in ActivityLogContext lists nine entity types; the call sites
 * actually write eleven (work_hours, event, update and program are logged
 * straight through lib/activityLog). Matched on the string, not the union,
 * so a row is never left without its link because of a type nobody updated.
 */
const entityDestination = (log: ActivityLog): { path: string; state?: Record<string, string>; label: string } | null => {
  const id = log.entity_id;
  switch (log.entity_type) {
    case 'task':
      return id ? { path: '/job-tasks', state: { openTaskId: id }, label: 'Open task' } : { path: '/job-tasks', label: 'Job Tasks' };
    case 'template':
      return { path: '/task-library', label: 'Task Library' };
    case 'sop':
      return id ? { path: '/sop', state: { openSopId: id }, label: 'Open SOP' } : { path: '/sop', label: 'SOPs' };
    case 'user':
      return { path: '/team', state: log.entity_title ? { searchTerm: log.entity_title } : undefined, label: 'Open in Team' };
    case 'work_hours':
      return { path: '/hours-input', label: 'Hours Input' };
    case 'event':
      return { path: '/calendar', label: 'Calendar' };
    case 'class':
    case 'document':
    case 'update':
    case 'program':
      return { path: '/portal-admin', label: 'Portal Manager' };
    default:
      return null;
  }
};

const ActivityLogPage: React.FC = () => {
  const navigate = useNavigate();
  const { isMobileOrTablet } = useResponsive();
  const { confirm, confirmDialog } = useConfirm();
  const { success, error: toastError } = useToast();
  const {
    logs, loading, hasMore, error, facets,
    fetchLogs, fetchMoreLogs, fetchPage, refreshFacets,
  } = useActivityLog();

  const [params, setParams] = useSearchParams();
  const [savedViews, setSavedViews] = useState<SavedView[]>(loadSavedViews);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const preset = params.get('preset') ?? '7d';
  const fromDate = params.get('from') ?? '';
  const toDate = params.get('to') ?? '';
  const kind = params.get('kind') ?? '';
  const action = params.get('action') ?? '';
  const entityType = params.get('type') ?? '';
  const actor = params.get('actor') ?? '';
  const result = params.get('result') ?? '';
  const entityId = params.get('entity') ?? '';
  const q = params.get('q') ?? '';

  const filters: LogFilters = useMemo(() => {
    const range = rangeFor(preset, fromDate, toDate);
    return {
      ...range,
      actorKinds: kind ? [kind] : undefined,
      actions: action ? [action] : undefined,
      entityTypes: entityType ? [entityType] : undefined,
      actorIds: actor ? [actor] : undefined,
      result: result === 'failure' ? 'failure' : undefined,
      entityId: entityId || undefined,
      search: q || undefined,
    };
  }, [preset, fromDate, toDate, kind, action, entityType, actor, result, entityId, q]);

  // Search is debounced; everything else refetches immediately.
  useEffect(() => {
    const t = setTimeout(() => { fetchLogs(filters); }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchLogs, filters, q]);

  // Facets follow the date range only — they exist to populate the dropdowns
  // with values that actually occur in the window.
  useEffect(() => {
    refreshFacets(filters.from, filters.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshFacets, filters.from, filters.to]);

  // Watching the watchers: opening this page is itself an event, once per visit.
  const viewLogged = useRef(false);
  useEffect(() => {
    if (!viewLogged.current) {
      viewLogged.current = true;
      void writeLog({ action: 'admin_viewed_activity_log', entityType: 'system' });
    }
  }, []);

  const setParam = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }, [params, setParams]);

  const clearAll = () => setParams(new URLSearchParams(), { replace: true });

  // ------------------------------------------------------------- export

  const runExport = async () => {
    const ok = await confirm({
      title: 'Export this view to CSV?',
      message: 'The file will contain client and student names. Handle it like the record it is — no shared drives, no email attachments. The export itself is logged.',
      confirmLabel: 'Export',
    });
    if (!ok) return;

    setExporting(true);
    try {
      const all: ActivityLog[] = [];
      let cursor: { ts: string; id: string } | null = null;
      while (all.length < EXPORT_CAP) {
        const page: ActivityLog[] = await fetchPage(filters, cursor, 200);
        all.push(...page);
        if (page.length < 200) break;
        const last = page[page.length - 1];
        cursor = { ts: last.created_at, id: last.id };
      }
      const rows = all.slice(0, EXPORT_CAP);

      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [
        ['time', 'actor', 'email', 'kind', 'role', 'action', 'result', 'entity_type', 'entity_id', 'entity_title', 'details'].join(','),
        ...rows.map(r => [
          esc(r.created_at), esc(r.user_name), esc(r.user_email), esc(r.actor_kind), esc(r.actor_role),
          esc(r.action), esc(r.result), esc(r.entity_type), esc(r.entity_id), esc(r.entity_title),
          esc(JSON.stringify(r.details ?? {})),
        ].join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      void writeLog({
        action: 'activity_log_exported',
        entityType: 'system',
        details: { rows: rows.length, truncated: all.length >= EXPORT_CAP, filters: params.toString() || 'none' },
      });
      success(`Exported ${rows.length} rows${all.length >= EXPORT_CAP ? ' (capped at 10,000)' : ''}`);
    } catch (e: any) {
      toastError(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const saveCurrentView = () => {
    const name = window.prompt('Name this view:');
    if (!name?.trim()) return;
    const next = [...savedViews, { name: name.trim(), params: params.toString() }];
    setSavedViews(next);
    try { localStorage.setItem(VIEWS_KEY, JSON.stringify(next)); } catch { /* convenience only */ }
  };

  const removeSavedView = (name: string) => {
    const next = savedViews.filter(v => v.name !== name);
    setSavedViews(next);
    try { localStorage.setItem(VIEWS_KEY, JSON.stringify(next)); } catch { /* convenience only */ }
  };

  // ------------------------------------------------------------- render

  const kindBadge = (k: string) =>
    k === 'client' ? <Badge variant="info" size="sm">Client</Badge>
      : k === 'system' ? <Badge variant="default" size="sm">System</Badge>
        : <Badge variant="primary" size="sm">Staff</Badge>;

  const actorOptions = useMemo(() => {
    const list = facets?.actors ?? [];
    const group = (want: string, label: string) =>
      list.filter(a => a.kind === want).map(a => ({
        value: a.id,
        label: `${label} · ${a.name || a.email || a.id} (${a.count})`,
      }));
    return [
      { value: '', label: 'Everyone' },
      ...group('staff', 'Staff'),
      ...group('client', 'Client'),
      ...group('system', 'System'),
    ];
  }, [facets]);

  const actionOptions = useMemo(() => [
    { value: '', label: 'Every action' },
    ...(facets?.actions ?? []).map(a => ({ value: a.action, label: `${humanise(a.action)} (${a.count})` })),
  ], [facets]);

  const typeOptions = useMemo(() => [
    { value: '', label: 'Every entity' },
    ...(facets?.entity_types ?? []).map(t => ({ value: t.entity_type, label: `${t.entity_type} (${t.count})` })),
  ], [facets]);

  // Day separators
  const byDay = useMemo(() => {
    const groups: { day: string; rows: ActivityLog[] }[] = [];
    logs.forEach(log => {
      const day = new Date(log.created_at).toLocaleDateString(undefined, {
        weekday: 'long', month: 'short', day: 'numeric',
      });
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.rows.push(log);
      else groups.push({ day, rows: [log] });
    });
    return groups;
  }, [logs]);

  const filtersActive = params.toString().length > 0;

  return (
    <div style={{ padding: isMobileOrTablet ? '16px' : '40px', maxWidth: '1100px', margin: '0 auto' }}>
      {confirmDialog}
      <PageHeader
        title="Activity Log"
        subtitle="Every action, every account — staff, clients and the system itself"
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" onClick={saveCurrentView} disabled={!filtersActive}>
              Save view
            </Button>
            <Button variant="outline" size="sm" loading={exporting} onClick={runExport}>
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Saved views */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0 0 12px' }}>
        {[...BUILTIN_VIEWS, ...savedViews].map(v => (
          <span key={v.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Button
              variant={params.toString() === v.params ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setParams(new URLSearchParams(v.params), { replace: true })}
            >
              {v.name}
            </Button>
            {savedViews.includes(v) && (
              <button
                onClick={() => removeSavedView(v.name)}
                aria-label={`Delete saved view ${v.name}`}
                style={{ background: 'none', border: 'none', color: theme.colors.txt.tertiary, cursor: 'pointer', padding: '2px' }}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>

      {/* Filter bar — sticky below the app header, wraps on phones. */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        backgroundColor: theme.colors.bg.primary,
        padding: '8px 0 12px',
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}>
        <div style={{ flex: '0 1 160px', minWidth: '140px' }}>
          <Select options={PRESETS} value={preset} onChange={e => setParam('preset', e.target.value)} />
        </div>
        {preset === 'custom' && (
          <>
            <input
              type="date"
              value={fromDate}
              onChange={e => setParam('from', e.target.value)}
              style={{
                padding: '10px', borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.bdr.primary}`,
                backgroundColor: theme.colors.bg.tertiary, color: theme.colors.txt.primary,
                fontFamily: theme.fonts.primary, fontSize: '14px',
              }}
            />
            <input
              type="date"
              value={toDate}
              onChange={e => setParam('to', e.target.value)}
              style={{
                padding: '10px', borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.bdr.primary}`,
                backgroundColor: theme.colors.bg.tertiary, color: theme.colors.txt.primary,
                fontFamily: theme.fonts.primary, fontSize: '14px',
              }}
            />
          </>
        )}
        <div style={{ flex: '0 1 150px', minWidth: '130px' }}>
          <Select
            options={[
              { value: '', label: 'Everyone' },
              { value: 'staff', label: 'Staff only' },
              { value: 'client', label: 'Clients only' },
              { value: 'system', label: 'System only' },
            ]}
            value={kind}
            onChange={e => setParam('kind', e.target.value)}
          />
        </div>
        <div style={{ flex: '1 1 190px', minWidth: '160px' }}>
          <Select options={actorOptions} value={actor} onChange={e => setParam('actor', e.target.value)} />
        </div>
        <div style={{ flex: '1 1 190px', minWidth: '160px' }}>
          <Select options={actionOptions} value={action} onChange={e => setParam('action', e.target.value)} />
        </div>
        <div style={{ flex: '0 1 150px', minWidth: '130px' }}>
          <Select options={typeOptions} value={entityType} onChange={e => setParam('type', e.target.value)} />
        </div>
        <Button
          variant={result === 'failure' ? 'danger' : 'outline'}
          size="sm"
          onClick={() => setParam('result', result === 'failure' ? '' : 'failure')}
        >
          Failures only
        </Button>
        <div style={{ flex: '1 1 200px', minWidth: '170px' }}>
          <SearchInput
            placeholder="Search names, emails, titles…"
            value={q}
            onChange={e => setParam('q', e.target.value)}
            onClear={() => setParam('q', '')}
          />
        </div>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearAll}>Clear</Button>
        )}
      </div>

      {entityId && (
        <p style={{
          ...theme.typography.bodySmall, fontFamily: theme.fonts.mono,
          color: theme.colors.txt.tertiary, margin: '0 0 12px', overflowWrap: 'anywhere',
        }}>
          Showing the history of entity <strong>{entityId}</strong> —{' '}
          <button
            onClick={() => setParam('entity', '')}
            style={{ background: 'none', border: 'none', color: theme.colors.primary, cursor: 'pointer', padding: 0, font: 'inherit' }}
          >
            show everything
          </button>
        </p>
      )}

      {/* Results */}
      {error && (
        <Card><p style={{ ...theme.typography.body, fontFamily: theme.fonts.primary, color: theme.colors.status.error, margin: 0 }}>{error}</p></Card>
      )}

      {!error && logs.length === 0 && !loading && (
        <EmptyState title="Nothing here" description="No activity matches these filters." />
      )}

      {byDay.map(group => (
        <div key={group.day}>
          <p style={{
            ...theme.typography.caption,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: '20px 0 8px',
          }}>
            {group.day}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {group.rows.map(log => {
              const isOpen = expanded === log.id;
              const failed = log.result === 'failure';
              return (
                <Card
                  key={log.id}
                  padding="sm"
                  style={failed ? { borderColor: theme.colors.status.error } : undefined}
                >
                  <div
                    onClick={() => setExpanded(isOpen ? null : log.id)}
                    style={{ cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}
                  >
                    <span style={{ ...theme.typography.caption, fontFamily: theme.fonts.mono, color: theme.colors.txt.tertiary, whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    {kindBadge(log.actor_kind)}
                    {failed && <Badge variant="danger" size="sm">failed</Badge>}
                    <span style={{
                      ...theme.typography.bodySmall,
                      fontFamily: theme.fonts.primary,
                      color: theme.colors.txt.secondary,
                      minWidth: 0,
                      overflowWrap: 'anywhere',
                      flex: '1 1 200px',
                    }}>
                      <button
                        onClick={e => { e.stopPropagation(); setParam('actor', log.user_id); }}
                        title="Everything this person has done"
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          color: theme.colors.txt.primary, fontWeight: 600, font: 'inherit',
                        }}
                      >
                        {log.user_name || log.user_email || log.user_id}
                      </button>
                      {' '}{sentenceFor(log)}
                    </span>
                  </div>

                  {isOpen && (
                    <div style={{
                      marginTop: '10px',
                      paddingTop: '10px',
                      borderTop: `1px solid ${theme.colors.bdr.primary}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <pre style={{
                          margin: 0,
                          padding: '10px',
                          backgroundColor: theme.colors.bg.tertiary,
                          borderRadius: theme.borderRadius.md,
                          fontFamily: theme.fonts.mono,
                          fontSize: '12px',
                          color: theme.colors.txt.secondary,
                          overflowX: 'auto',
                        }}>
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                      <span style={{ ...theme.typography.caption, fontFamily: theme.fonts.mono, color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>
                        {log.actor_role && `role ${log.actor_role} · `}
                        {log.entity_id && (
                          <>
                            entity{' '}
                            <button
                              onClick={() => setParam('entity', log.entity_id!)}
                              title="Everything that happened to this entity"
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: theme.colors.primary, font: 'inherit' }}
                            >
                              {log.entity_id}
                            </button>
                            {' · '}
                          </>
                        )}
                        {(() => {
                          // The row says what happened; this takes you to the
                          // thing it happened to, so you can act on it.
                          const target = entityDestination(log);
                          return target ? (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(target.path, { state: target.state }); }}
                                title={target.label}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: theme.colors.primary, font: 'inherit', fontWeight: 700 }}
                              >
                                {target.label} ↗
                              </button>
                              {' · '}
                            </>
                          ) : null;
                        })()}
                        {log.request_id && `request ${log.request_id} · `}
                        {log.ip_address && `ip ${log.ip_address} · `}
                        {log.user_agent ?? ''}
                      </span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
          <Spinner size={28} color={theme.colors.primary} />
        </div>
      )}

      {!loading && hasMore && (
        <div style={{ marginTop: '16px' }}>
          <Button variant="outline" fullWidth onClick={fetchMoreLogs}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
};

export default ActivityLogPage;
