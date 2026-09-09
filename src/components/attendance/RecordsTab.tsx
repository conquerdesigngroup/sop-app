import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { useRefreshable } from '../../contexts/RefreshContext';
import { Button, Card, Select, Input, Spinner, EmptyState } from '../ui';
import { STATUS_COLORS } from '../../lib/attendanceColors';
import { SessionStatus } from '../../types/attendance';
import { studioToday } from '../../lib/studioDate';
import { shareOrDownloadCSV, shareOrDownloadFile } from '../hours/hoursUtils';
import {
  ClassOption,
  RecordRow,
  TeacherOption,
  loadClassOptions,
  loadRecords,
  loadTeacherOptions,
} from '../../lib/attendanceRecords';
import {
  RangePreset,
  buildAttendanceCSV,
  reasonLabel,
  resolveRange,
  statusLabel,
  tally,
} from './attendanceExport';

/**
 * Every attendance record, for admins and super admins.
 *
 * WHY THE FILTERS ARE THE EXPORT SELECTION
 *
 * The first draft had an Export dialog with its own range, class and teacher
 * pickers — a second set of controls that could disagree with the ones on
 * screen. Someone filters to one teacher, hits Export, and gets the whole
 * studio because the dialog defaulted to it. Here the buttons export exactly
 * what is displayed, which is also the only thing anybody meant.
 *
 * GROUPED BY SESSION, LIKE THE PDF
 *
 * Nobody reads attendance front to back; they look up a class on a date. That
 * is also the unit that gets fixed, so each group carries the button that
 * reopens it for backfill.
 */

interface Props {
  /** Opens a session for marking. The page owns the roster sheet. */
  onFix: (row: {
    classId: string; className: string; sessionId: string;
    sessionDate: string; sessionStatus: SessionStatus;
  }) => void;
  generatedBy?: string;
}

type Delivery = { kind: 'idle' } | { kind: 'busy'; what: string } | { kind: 'done'; message: string } | { kind: 'error'; message: string };

const RecordsTab: React.FC<Props> = ({ onFix, generatedBy }) => {
  const { isMobileOrTablet } = useResponsive();

  const [preset, setPreset] = useState<RangePreset>('week');
  const [anchor, setAnchor] = useState(studioToday());
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [student, setStudent] = useState('');

  const [rows, setRows] = useState<RecordRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<Delivery>({ kind: 'idle' });

  const range = useMemo(() => resolveRange(preset, anchor), [preset, anchor]);

  useEffect(() => {
    loadClassOptions().then(r => setClasses(r.rows));
    loadTeacherOptions().then(r => setTeachers(r.rows));
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const result = await loadRecords({
      from: range.from,
      to: range.to,
      classId: classId || undefined,
      teacherId: teacherId || undefined,
      student: student || undefined,
    });
    setRows(result.rows);
    setTruncated(result.truncated);
    setError(result.error);
    setLoading(false);
    if (result.error) throw new Error(result.error);
  }, [range.from, range.to, classId, teacherId, student]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  const reload = useCallback(() => load(true), [load]);
  useRefreshable(reload, true);

  const totals = useMemo(() => tally(rows), [rows]);

  /** date + class, in the order a person looks them up. */
  const groups = useMemo(() => {
    const m = new Map<string, RecordRow[]>();
    rows.forEach(r => {
      const key = `${r.sessionDate}|${r.classId}`;
      const list = m.get(key) ?? [];
      list.push(r);
      m.set(key, list);
    });
    return Array.from(m.entries());
  }, [rows]);

  /** What the file is about, when the filters have narrowed it to one thing. */
  const subject = useMemo(() => {
    if (student.trim()) return student.trim();
    if (classId) return classes.find(c => c.id === classId)?.name;
    if (teacherId) return teachers.find(t => t.id === teacherId)?.name;
    return undefined;
  }, [student, classId, teacherId, classes, teachers]);

  const exportCSV = async () => {
    setDelivery({ kind: 'busy', what: 'Building the CSV…' });
    try {
      const { csv, filename, rowCount } = buildAttendanceCSV(rows, { range, subject });
      const how = await shareOrDownloadCSV(filename, csv);
      setDelivery(how === 'cancelled'
        ? { kind: 'idle' }
        : { kind: 'done', message: `${rowCount} rows ${how === 'shared' ? 'shared' : 'downloaded'}.` });
    } catch (e: any) {
      setDelivery({ kind: 'error', message: e?.message || 'Could not build that export.' });
    }
  };

  const exportPDF = async () => {
    setDelivery({ kind: 'busy', what: 'Building the PDF…' });
    try {
      // Dynamic: jsPDF is a large chunk and must not load for anyone who only
      // ever looks at this screen.
      const { buildAttendancePDF } = await import('./attendancePdf');
      const { blob, filename, rowCount } = await buildAttendancePDF(rows, {
        range, subject, generatedBy, truncated,
      });
      const how = await shareOrDownloadFile(filename, blob, 'application/pdf');
      setDelivery(how === 'cancelled'
        ? { kind: 'idle' }
        : { kind: 'done', message: `${rowCount} rows ${how === 'shared' ? 'shared' : 'downloaded'}.` });
    } catch (e: any) {
      setDelivery({ kind: 'error', message: e?.message || 'Could not build that export.' });
    }
  };

  const busy = delivery.kind === 'busy';
  const filtersWide = isMobileOrTablet ? '1 1 100%' : '1 1 200px';

  return (
    <div>
      <Card padding="md" style={{ marginBottom: theme.spacing.md }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <div style={{ flex: filtersWide, minWidth: 0 }}>
            <Select
              label="Period"
              value={preset}
              onChange={e => setPreset(e.target.value as RangePreset)}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
            />
          </div>
          <div style={{ flex: filtersWide, minWidth: 0 }}>
            <Input label="Date in that period" type="date" value={anchor} onChange={e => setAnchor(e.target.value)} />
          </div>
          <div style={{ flex: filtersWide, minWidth: 0 }}>
            <Select
              label="Teacher"
              value={teacherId}
              onChange={e => setTeacherId(e.target.value)}
              options={[{ value: '', label: 'All teachers' }, ...teachers.map(t => ({ value: t.id, label: t.name }))]}
            />
          </div>
          <div style={{ flex: filtersWide, minWidth: 0 }}>
            <Select
              label="Class"
              value={classId}
              onChange={e => setClassId(e.target.value)}
              options={[{ value: '', label: 'All classes' }, ...classes.map(c => ({ value: c.id, label: c.name }))]}
            />
          </div>
          <div style={{ flex: filtersWide, minWidth: 0 }}>
            <Input label="Dancer" placeholder="Search by name" value={student} onChange={e => setStudent(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: theme.spacing.sm, fontSize: '0.85rem', color: theme.colors.txt.tertiary }}>
          {range.label}
        </div>
      </Card>

      {truncated && (
        <Card padding="md" style={{ borderColor: theme.colors.status.error, marginBottom: theme.spacing.md }}>
          <div role="alert" style={{ color: theme.colors.txt.primary, fontWeight: 700 }}>
            Too many records to show or export at once
          </div>
          <div style={{ fontSize: '0.85rem', color: theme.colors.txt.tertiary, marginTop: 4 }}>
            This is only part of the range. Narrow it to a week, a class or a teacher before exporting —
            an export from here would look complete and be missing dancers.
          </div>
        </Card>
      )}

      {!loading && !error && rows.length > 0 && (
        <Card padding="md" style={{ marginBottom: theme.spacing.md }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Tally label="Present" n={totals.present} color={STATUS_COLORS.present} />
            <Tally label="Absent" n={totals.absent} color={STATUS_COLORS.absent} />
            <Tally label="Late" n={totals.late} color={STATUS_COLORS.late} />
            <Tally label="Excused" n={totals.excused} color={STATUS_COLORS.excused} />
            <Tally label="Sick" n={totals.sick} color={STATUS_COLORS.sick} />
            <Tally label="Not marked" n={totals.unmarked} color={theme.colors.txt.tertiary} />
          </div>
          <div style={{ marginTop: theme.spacing.sm, color: theme.colors.txt.secondary, fontSize: '0.9rem' }}>
            {totals.percent === null
              ? 'Nothing in this range counts yet.'
              : `${totals.attended} of ${totals.counted} counted attendances — ${totals.percent}%`}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
            <Button variant="secondary" onClick={exportCSV} disabled={busy}>Export CSV</Button>
            <Button variant="secondary" onClick={exportPDF} disabled={busy}>Export PDF</Button>
          </div>

          <div
            role="status"
            aria-live="polite"
            style={{
              minHeight: 20,
              marginTop: theme.spacing.xs,
              fontSize: '0.85rem',
              fontWeight: 600,
              overflowWrap: 'anywhere',
              color: delivery.kind === 'error' ? theme.colors.status.error : theme.colors.txt.tertiary,
            }}
          >
            {delivery.kind === 'busy' && delivery.what}
            {delivery.kind === 'done' && delivery.message}
            {delivery.kind === 'error' && delivery.message}
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}><Spinner /></div>
      ) : error ? (
        <Card>
          <div role="alert" style={{ color: theme.colors.txt.primary }}>
            {error}
            <div style={{ marginTop: theme.spacing.md }}>
              <Button variant="secondary" onClick={() => { load().catch(() => {}); }}>Try again</Button>
            </div>
          </div>
        </Card>
      ) : groups.length === 0 ? (
        <EmptyState
          title="No records in this range"
          description="Nothing was scheduled, or the filters exclude everything. Try a wider period."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
          {groups.map(([key, groupRows]) => {
            const head = groupRows[0];
            const t = tally(groupRows);
            const open = openGroup === key;

            return (
              <Card key={key} padding="md">
                <button
                  type="button"
                  onClick={() => setOpenGroup(open ? null : key)}
                  aria-expanded={open}
                  style={{
                    width: '100%', minHeight: 44, display: 'flex', flexWrap: 'wrap',
                    gap: theme.spacing.sm, alignItems: 'center', justifyContent: 'space-between',
                    background: 'transparent', border: 'none', padding: 0, font: 'inherit',
                    fontFamily: theme.fonts.primary, color: theme.colors.txt.primary,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, overflowWrap: 'anywhere' }}>
                      {head.className}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.8rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>
                      {head.sessionDate}{head.teachers ? ` · ${head.teachers}` : ''}
                      {head.sessionStatus !== 'held' ? ` · ${head.sessionStatus}` : ''}
                    </span>
                  </span>
                  <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: theme.colors.txt.secondary }}>
                    {t.percent === null ? `${groupRows.length} on roster` : `${t.attended}/${t.counted} · ${t.percent}%`}
                  </span>
                </button>

                {open && (
                  <div style={{ marginTop: theme.spacing.sm }}>
                    {groupRows.map(r => (
                      <div
                        key={r.studentId}
                        style={{
                          display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm,
                          justifyContent: 'space-between', alignItems: 'center',
                          padding: `6px 0`,
                          borderTop: `1px solid ${theme.colors.bdr.primary}`,
                        }}
                      >
                        <span style={{ flex: '1 1 140px', minWidth: 0, overflowWrap: 'anywhere' }}>
                          {r.lastName}, {r.firstName}
                        </span>
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, alignItems: 'center' }}>
                          {reasonLabel(r) && (
                            <span style={{ fontSize: '0.75rem', color: theme.colors.txt.tertiary }}>
                              {reasonLabel(r)}
                            </span>
                          )}
                          <span style={{
                            padding: `2px ${theme.spacing.sm}`,
                            borderRadius: theme.borderRadius.full,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            background: r.status ? STATUS_COLORS[r.status] : 'transparent',
                            border: r.status ? 'none' : `1px dashed ${theme.colors.bdr.secondary}`,
                            color: r.status ? '#FFFFFF' : theme.colors.txt.tertiary,
                          }}>
                            {statusLabel(r)}
                          </span>
                        </span>
                      </div>
                    ))}

                    <Button
                      variant="secondary"
                      size="sm"
                      style={{ marginTop: theme.spacing.sm }}
                      onClick={() => onFix({
                        classId: head.classId,
                        className: head.className,
                        sessionId: head.sessionId,
                        sessionDate: head.sessionDate,
                        sessionStatus: head.sessionStatus,
                      })}
                    >
                      {/* This group's own tally, not the page's — a filled class
                          inside a mostly-empty range still reads "Fix". */}
                      {t.unmarked > 0 ? 'Take attendance' : 'Fix attendance'}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Tally: React.FC<{ label: string; n: number; color: string }> = ({ label, n, color }) => (
  <div style={{ flex: '1 1 90px', minWidth: 0 }}>
    <div style={{ fontSize: '1.3rem', fontWeight: 800, color }}>{n}</div>
    <div style={{ fontSize: '0.75rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>{label}</div>
  </div>
);

export default RecordsTab;
