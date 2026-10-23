import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useRefreshable } from '../../contexts/RefreshContext';
import { Button, Card, SearchInput, Spinner, EmptyState } from '../ui';
import { SessionStatus } from '../../types/attendance';
import { studioToday } from '../../lib/studioDate';
import {
  ClassOption,
  RecordRow,
  TeacherOption,
  loadClassOptions,
  loadRecords,
  loadTeacherOptions,
} from '../../lib/attendanceRecords';
import { matchesDancer, tally } from './attendanceExport';
import ClassPicker, { ALL_CLASSES, ClassSelection, describeSelection } from './ClassPicker';
import ClassHistory from './ClassHistory';
import { ExportButtons, MarkPill, RangeChoice, RangePicker, TallyStrip, choose, shortDay } from './RecordsControls';
import { useAttendanceExport } from './useAttendanceExport';

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
 * WHAT THE FILTERS ARE
 *
 * Any date range (quick picks or two dates), and any set of classes — all of
 * them, my own, a weekday's worth, a teacher's, or a hand-ticked list. The
 * dancer search is applied on screen rather than refetched, so typing a name
 * does not re-read a month of records once per letter.
 *
 * TWO WAYS TO READ IT
 *
 * By date, grouped by session like the PDF — the unit that gets looked up and
 * fixed. Or by class, where tapping a class opens its history: the roster, each
 * dancer's record, and the dates to tick for an export of just that class.
 */

type FixRow = {
  classId: string; className: string; sessionId: string;
  sessionDate: string; sessionStatus: SessionStatus; sessionNote?: string | null;
};

interface Props {
  /** Opens a session for marking. The page owns the roster sheet. */
  onFix: (row: FixRow) => void;
  generatedBy?: string;
  /** Bumped by the page after a session was fixed, so the lists re-read it. */
  refreshToken?: number;
}

const RecordsTab: React.FC<Props> = ({ onFix, generatedBy, refreshToken }) => {
  const { currentUser } = useAuth();
  const today = useMemo(() => studioToday(), []);

  const [choice, setChoice] = useState<RangeChoice>(() => choose('this-week', today));
  const [selection, setSelection] = useState<ClassSelection>(ALL_CLASSES);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [student, setStudent] = useState('');
  const [view, setView] = useState<'date' | 'class'>('date');
  const [historyFor, setHistoryFor] = useState<ClassOption | null>(null);

  const [rows, setRows] = useState<RecordRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const { delivery, exportCSV, exportPDF } = useAttendanceExport(generatedBy);

  const range = choice.range;

  useEffect(() => {
    loadClassOptions().then(r => setClasses(r.rows));
    loadTeacherOptions().then(r => setTeachers(r.rows));
  }, []);

  const myClassIds = useMemo(
    () => teachers.find(t => t.id === currentUser?.id)?.classIds ?? [],
    [teachers, currentUser?.id],
  );

  // Stale-response guard: a quick pick tapped twice must not let the slower
  // of the two answers land last.
  const request = useRef(0);

  const load = useCallback(async (silent = false) => {
    const mine = ++request.current;
    if (!silent) setLoading(true);
    const result = await loadRecords({
      from: range.from,
      to: range.to,
      classIds: selection.ids ?? undefined,
    });
    if (mine !== request.current) return;
    setRows(result.rows);
    setTruncated(result.truncated);
    setError(result.error);
    setLoading(false);
    if (result.error) throw new Error(result.error);
  }, [range.from, range.to, selection.ids]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => { if (refreshToken) load(true).catch(() => {}); }, [refreshToken]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = useCallback(() => load(true), [load]);
  useRefreshable(reload, true);

  const shown = useMemo(() => rows.filter(r => matchesDancer(r, student)), [rows, student]);
  const totals = useMemo(() => tally(shown), [shown]);

  /** date + class, in the order a person looks them up. */
  const groups = useMemo(() => {
    const m = new Map<string, RecordRow[]>();
    shown.forEach(r => {
      const key = `${r.sessionDate}|${r.classId}`;
      const list = m.get(key) ?? [];
      list.push(r);
      m.set(key, list);
    });
    return Array.from(m.entries());
  }, [shown]);

  /** One entry per class, alphabetical, for the by-class view. */
  const classGroups = useMemo(() => {
    const m = new Map<string, RecordRow[]>();
    shown.forEach(r => {
      const list = m.get(r.classId) ?? [];
      list.push(r);
      m.set(r.classId, list);
    });
    return Array.from(m.values()).sort((a, b) => a[0].className.localeCompare(b[0].className));
  }, [shown]);

  const selectionName = describeSelection(selection, classes);

  /** What the file is about, when the filters have narrowed it to one thing. */
  const subject = useMemo(() => {
    const who = student.trim();
    const what = selection.ids === null ? undefined : selectionName;
    if (who && what) return `${what} - ${who}`;
    return who || what;
  }, [student, selection.ids, selectionName]);

  const optionFor = (classId: string, name: string): ClassOption =>
    classes.find(c => c.id === classId) ?? { id: classId, name, dayOfWeek: null, startTime: null };

  if (historyFor) {
    return (
      <ClassHistory
        klass={historyFor}
        initial={choice}
        onBack={() => setHistoryFor(null)}
        onFix={onFix}
        generatedBy={generatedBy}
        refreshToken={refreshToken}
      />
    );
  }

  return (
    <div>
      <Card padding="md" style={{ marginBottom: theme.spacing.md }}>
        <RangePicker value={choice} onChange={setChoice} today={today} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center', marginTop: theme.spacing.md }}>
          <Button variant="secondary" onClick={() => setPickerOpen(true)} aria-haspopup="dialog">
            Classes: {selectionName}
          </Button>
          {selection.ids !== null && (
            <Button variant="ghost" size="sm" onClick={() => setSelection(ALL_CLASSES)}>Show all classes</Button>
          )}
        </div>

        <div style={{ marginTop: theme.spacing.sm }}>
          <SearchInput
            placeholder="Find a dancer"
            aria-label="Find a dancer"
            value={student}
            onChange={e => setStudent(e.target.value)}
            onClear={() => setStudent('')}
          />
        </div>
      </Card>

      <ClassPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        classes={classes}
        teachers={teachers}
        myClassIds={myClassIds}
        value={selection}
        onApply={setSelection}
      />

      {truncated && (
        <Card padding="md" style={{ borderColor: theme.colors.status.error, marginBottom: theme.spacing.md }}>
          <div role="alert" style={{ color: theme.colors.txt.primary, fontWeight: 700 }}>
            Too many records to show or export at once
          </div>
          <div style={{ fontSize: '0.85rem', color: theme.colors.txt.tertiary, marginTop: 4 }}>
            This is only part of the range. Pick a shorter range or fewer classes before exporting —
            an export from here would look complete and be missing dancers.
          </div>
        </Card>
      )}

      {!loading && !error && shown.length > 0 && (
        <Card padding="md" style={{ marginBottom: theme.spacing.md }}>
          <TallyStrip t={totals} />
          <ExportButtons
            delivery={delivery}
            onCSV={() => exportCSV(shown, { range, subject })}
            onPDF={() => exportPDF(shown, { range, subject }, truncated)}
          />
        </Card>
      )}

      {!loading && !error && shown.length > 0 && (
        <div role="tablist" aria-label="Group records" style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.md }}>
          {(['date', 'class'] as const).map(key => (
            <Button
              key={key}
              role="tab"
              aria-selected={view === key}
              size="sm"
              variant={view === key ? 'primary' : 'secondary'}
              onClick={() => setView(key)}
            >
              {key === 'date' ? 'By date' : `By class (${classGroups.length})`}
            </Button>
          ))}
        </div>
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
          title={student.trim() && rows.length > 0 ? 'No dancer by that name' : 'No records in this range'}
          description={student.trim() && rows.length > 0
            ? 'Nobody in these classes and dates matches the search.'
            : 'Nothing was scheduled, or the filters exclude everything. Try a wider period.'}
        />
      ) : view === 'class' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
          {classGroups.map(classRows => {
            const head = classRows[0];
            const t = tally(classRows);
            const dates = new Set(classRows.map(r => r.sessionId)).size;
            return (
              <Card key={head.classId} hover padding="md" onClick={() => setHistoryFor(optionFor(head.classId, head.className))}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, color: theme.colors.txt.primary, overflowWrap: 'anywhere' }}>
                      {head.className}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.8rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>
                      {dates} {dates === 1 ? 'date' : 'dates'}{head.teachers ? ` · ${head.teachers}` : ''}
                      {t.unmarked > 0 && (
                        <span style={{ color: theme.colors.status.warning, fontWeight: 700 }}>{` · ${t.unmarked} not marked`}</span>
                      )}
                    </span>
                  </span>
                  <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: theme.colors.txt.secondary }}>
                    {t.percent === null ? '—' : `${t.attended}/${t.counted} · ${t.percent}%`}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
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
                      {shortDay(head.sessionDate)}{head.teachers ? ` · ${head.teachers}` : ''}
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
                        <MarkPill row={r} />
                      </div>
                    ))}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onFix({
                          classId: head.classId,
                          className: head.className,
                          sessionId: head.sessionId,
                          sessionDate: head.sessionDate,
                          sessionStatus: head.sessionStatus,
                          sessionNote: head.sessionNote,
                        })}
                      >
                        {/* This group's own tally, not the page's — a filled class
                            inside a mostly-empty range still reads "Fix". */}
                        {t.unmarked > 0 ? 'Take attendance' : 'Fix attendance'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setHistoryFor(optionFor(head.classId, head.className))}>
                        Class history
                      </Button>
                    </div>
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

export default RecordsTab;
