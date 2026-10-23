import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { theme } from '../../theme';
import { useRefreshable } from '../../contexts/RefreshContext';
import { Button, Card, SearchInput, Spinner, EmptyState } from '../ui';
import { STATUS_COLORS } from '../../lib/attendanceColors';
import { studioToday } from '../../lib/studioDate';
import { SessionStatus } from '../../types/attendance';
import {
  ClassOption,
  RecordRow,
  RosterDancer,
  loadCurrentRoster,
  loadRecords,
} from '../../lib/attendanceRecords';
import {
  DancerHistory,
  DateRange,
  byDancer,
  bySession,
  customRange,
  matchesDancer,
  tally,
} from './attendanceExport';
import {
  ExportButtons,
  MarkPill,
  RangeChoice,
  RangePicker,
  TallyStrip,
  clockTime,
  shortDay,
  weekdayName,
} from './RecordsControls';
import { useAttendanceExport } from './useAttendanceExport';

/**
 * One class, over time.
 *
 * Opened from the records list. It answers the two questions the office asks
 * about a single class — "who is in it and how is each of them doing" and "what
 * happened on the 13th" — and exports exactly the dates that are ticked.
 *
 * WHY THE ROSTER COMES FROM ENROLMENTS AS WELL AS RECORDS
 *
 * The records only hold dancers who had a session inside the range. A child who
 * joined this week, or a range with no sessions in it, would make a full class
 * look empty. So the current roster is loaded alongside, and anyone in the
 * records who has since left is still shown — marked as having left — because
 * their absences are still part of the class's history.
 *
 * WHY DATES ARE UNTICKED RATHER THAN TICKED
 *
 * Every date starts included, so the export matches what is on screen until
 * someone deliberately removes a date. A list that started empty would export
 * nothing the first time anyone tried it.
 */

type FixRow = {
  classId: string; className: string; sessionId: string;
  sessionDate: string; sessionStatus: SessionStatus; sessionNote?: string | null;
};

interface Props {
  klass: ClassOption;
  initial: RangeChoice;
  onBack: () => void;
  onFix: (row: FixRow) => void;
  generatedBy?: string;
  /** Bumped by the page when a session was fixed, so the history re-reads it. */
  refreshToken?: number;
  backLabel?: string;
  /** Exports are an admin tool; a teacher opens this to fill dates in. */
  canExport?: boolean;
  initialView?: 'dancers' | 'dates';
}

interface DancerLine extends Omit<DancerHistory, 'tally'> {
  tally: DancerHistory['tally'] | null;
  onRoster: boolean;
}

const ClassHistory: React.FC<Props> = ({
  klass, initial, onBack, onFix, generatedBy, refreshToken,
  backLabel = '← Back to records', canExport = true, initialView = 'dancers',
}) => {
  const today = useMemo(() => studioToday(), []);
  const [choice, setChoice] = useState<RangeChoice>(initial);
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [roster, setRoster] = useState<RosterDancer[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'dancers' | 'dates'>(initialView);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [openDancer, setOpenDancer] = useState<string | null>(null);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const { delivery, exportCSV, exportPDF } = useAttendanceExport(generatedBy);

  // Stale-response guard: chips can be tapped faster than a range loads.
  const request = useRef(0);

  const load = useCallback(async (silent = false) => {
    const mine = ++request.current;
    if (!silent) setLoading(true);
    const [records, current] = await Promise.all([
      loadRecords({ from: choice.range.from, to: choice.range.to, classIds: [klass.id] }),
      loadCurrentRoster(klass.id, today),
    ]);
    if (mine !== request.current) return;
    setRows(records.rows);
    setTruncated(records.truncated);
    setRoster(current.rows);
    const failed = records.error ?? current.error;
    setError(failed);
    setLoading(false);
    if (failed) throw new Error(failed);
  }, [choice.range.from, choice.range.to, klass.id, today]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => { if (refreshToken) load(true).catch(() => {}); }, [refreshToken]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = useCallback(() => load(true), [load]);
  useRefreshable(reload, true);

  // A new range is a new list of dates; ticks from the old one mean nothing.
  useEffect(() => { setExcluded(new Set()); setOpenSession(null); }, [choice.range.from, choice.range.to]);

  const sessions = useMemo(() => bySession(rows), [rows]);
  const included = useMemo(() => rows.filter(r => !excluded.has(r.sessionId)), [rows, excluded]);
  const exportRows = useMemo(() => included.filter(r => matchesDancer(r, search)), [included, search]);
  const totals = useMemo(() => tally(exportRows), [exportRows]);
  const includedCount = sessions.length - sessions.filter(s => excluded.has(s.sessionId)).length;

  const dancers = useMemo<DancerLine[]>(() => {
    const onRoster = new Set(roster.map(d => d.studentId));
    const history = byDancer(included);
    const seen = new Set(history.map(d => d.studentId));
    const lines: DancerLine[] = [
      ...history.map(d => ({ ...d, onRoster: onRoster.has(d.studentId) })),
      ...roster.filter(d => !seen.has(d.studentId)).map(d => ({ ...d, rows: [], tally: null, onRoster: true })),
    ];
    return lines
      .filter(d => matchesDancer(d, search))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }, [included, roster, search]);

  /**
   * The range the FILE is about: the ticked dates, not the range typed in.
   * "Everything so far" has no real start, and a range with dates unticked is
   * no longer the range on the chips.
   */
  const exportMeta = useMemo(() => {
    const dates = Array.from(new Set(exportRows.map(r => r.sessionDate))).sort();
    let range: DateRange = choice.range;
    if (dates.length > 0 && (choice.key === 'to-date' || includedCount < sessions.length)) {
      range = customRange(dates[0], dates[dates.length - 1]);
      if (includedCount < sessions.length) {
        range = { ...range, label: `${range.label} · ${includedCount} of ${sessions.length} class dates` };
      }
    }
    const who = search.trim();
    return { range, subject: who ? `${klass.name} - ${who}` : klass.name };
  }, [exportRows, choice, includedCount, sessions.length, search, klass.name]);

  const toggleDate = (id: string) => setExcluded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const teachers = rows[0]?.teachers;
  const meta = [weekdayName(klass.dayOfWeek) === 'No set day' ? null : `${weekdayName(klass.dayOfWeek)}s`, clockTime(klass.startTime), teachers]
    .filter(Boolean).join(' · ');

  const rowButton: React.CSSProperties = {
    width: '100%', minHeight: 44, display: 'flex', flexWrap: 'wrap',
    gap: theme.spacing.sm, alignItems: 'center', justifyContent: 'space-between',
    background: 'transparent', border: 'none', padding: 0, font: 'inherit',
    fontFamily: theme.fonts.primary, color: theme.colors.txt.primary,
    cursor: 'pointer', textAlign: 'left',
  };

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack}>{backLabel}</Button>

      <div style={{ margin: `${theme.spacing.sm} 0 ${theme.spacing.md}` }}>
        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: theme.colors.txt.primary, overflowWrap: 'anywhere' }}>
          {klass.name}
        </div>
        {meta && (
          <div style={{ fontSize: '0.85rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>{meta}</div>
        )}
      </div>

      <Card padding="md" style={{ marginBottom: theme.spacing.md }}>
        <RangePicker value={choice} onChange={setChoice} today={today} extra={[{ key: 'to-date', label: 'All so far' }]} />
      </Card>

      {truncated && (
        <Card padding="md" style={{ borderColor: theme.colors.status.error, marginBottom: theme.spacing.md }}>
          <div role="alert" style={{ color: theme.colors.txt.primary, fontWeight: 700 }}>
            Too many records to show or export at once
          </div>
          <div style={{ fontSize: '0.85rem', color: theme.colors.txt.tertiary, marginTop: 4 }}>
            This is only part of the range. Pick a shorter one before exporting.
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
      ) : (
        <>
          <Card padding="md" style={{ marginBottom: theme.spacing.md }}>
            <div style={{ fontWeight: 700, color: theme.colors.txt.primary, marginBottom: theme.spacing.sm, overflowWrap: 'anywhere' }}>
              {sessions.length === 0
                ? 'No class dates in this range'
                : canExport
                  ? `${includedCount} of ${sessions.length} class ${sessions.length === 1 ? 'date' : 'dates'} included`
                  : `${sessions.length} class ${sessions.length === 1 ? 'date' : 'dates'}`}
              {search.trim() && ` · dancers matching “${search.trim()}”`}
            </div>
            <TallyStrip t={totals} />
            {canExport && (
              <ExportButtons
                delivery={delivery}
                disabled={exportRows.length === 0}
                onCSV={() => exportCSV(exportRows, exportMeta)}
                onPDF={() => exportPDF(exportRows, exportMeta, truncated)}
              />
            )}
          </Card>

          <SearchInput
            placeholder="Find a dancer in this class"
            aria-label="Find a dancer in this class"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onClear={() => setSearch('')}
          />

          <div role="tablist" aria-label="Class history views" style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, margin: `${theme.spacing.md} 0` }}>
            {(['dancers', 'dates'] as const).map(key => (
              <Button
                key={key}
                role="tab"
                aria-selected={view === key}
                size="sm"
                variant={view === key ? 'primary' : 'secondary'}
                onClick={() => setView(key)}
              >
                {key === 'dancers' ? `Dancers (${dancers.length})` : `Dates (${sessions.length})`}
              </Button>
            ))}
          </div>

          {view === 'dancers' ? (
            dancers.length === 0 ? (
              <EmptyState
                title={search.trim() ? 'No dancer by that name' : 'Nobody on this roster'}
                description={search.trim() ? 'Check the spelling, or clear the search.' : 'No one is enrolled, and no one was in this range.'}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
                {dancers.map(d => {
                  const open = openDancer === d.studentId;
                  const t = d.tally;
                  const misses = t ? t.absent + t.sick : 0;
                  return (
                    <Card key={d.studentId} padding="md">
                      <button
                        type="button"
                        aria-expanded={open}
                        disabled={d.rows.length === 0}
                        onClick={() => setOpenDancer(open ? null : d.studentId)}
                        style={{ ...rowButton, cursor: d.rows.length === 0 ? 'default' : 'pointer' }}
                      >
                        <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 700, overflowWrap: 'anywhere' }}>
                            {d.lastName}, {d.firstName}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.8rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>
                            {!d.onRoster
                              ? 'No longer in this class'
                              : d.rows.length === 0
                                ? 'No class dates in this range'
                                : `${d.rows.length} ${d.rows.length === 1 ? 'date' : 'dates'}`}
                            {misses > 0 && (
                              <span style={{ color: STATUS_COLORS.absent, fontWeight: 700 }}>
                                {` · ${misses} missed`}
                              </span>
                            )}
                            {t && t.unmarked > 0 && ` · ${t.unmarked} not marked`}
                          </span>
                        </span>
                        <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: theme.colors.txt.secondary }}>
                          {t && t.percent !== null ? `${t.attended}/${t.counted} · ${t.percent}%` : '—'}
                        </span>
                      </button>

                      {open && (
                        <div style={{ marginTop: theme.spacing.sm }}>
                          {d.rows.map(r => (
                            <div
                              key={r.sessionId}
                              style={{
                                display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm,
                                justifyContent: 'space-between', alignItems: 'center',
                                padding: '6px 0', borderTop: `1px solid ${theme.colors.bdr.primary}`,
                              }}
                            >
                              <span style={{ flex: '1 1 110px', minWidth: 0, color: theme.colors.txt.secondary }}>
                                {shortDay(r.sessionDate)}
                              </span>
                              <MarkPill row={r} />
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )
          ) : sessions.length === 0 ? (
            <EmptyState title="No class dates in this range" description="Try a wider range, or All so far." />
          ) : (
            <>
              {canExport && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.sm }}>
                  <Button size="sm" variant="ghost" onClick={() => setExcluded(new Set())}>Tick all dates</Button>
                  <Button size="sm" variant="ghost" onClick={() => setExcluded(new Set(sessions.map(s => s.sessionId)))}>Untick all</Button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
                {sessions.map(s => {
                  const ticked = !excluded.has(s.sessionId);
                  const open = openSession === s.sessionId;
                  const shown = s.rows
                    .filter(r => matchesDancer(r, search))
                    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
                  return (
                    <Card key={s.sessionId} padding="md" style={{ opacity: ticked ? 1 : 0.6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                        {canExport && <label
                          aria-label={`Include ${shortDay(s.sessionDate)} in the export`}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, cursor: 'pointer', flex: '0 0 auto' }}
                        >
                          <input
                            type="checkbox"
                            checked={ticked}
                            onChange={() => toggleDate(s.sessionId)}
                            style={{ width: 20, height: 20, accentColor: theme.colors.primary }}
                          />
                        </label>}
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenSession(open ? null : s.sessionId)}
                          style={{ ...rowButton, flex: '1 1 auto', minWidth: 0, width: 'auto' }}
                        >
                          <span style={{ flex: '1 1 120px', minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 700, overflowWrap: 'anywhere' }}>
                              {shortDay(s.sessionDate)}
                            </span>
                            <span style={{ display: 'block', fontSize: '0.8rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>
                              {s.sessionStatus !== 'held'
                                ? (s.sessionNote || (s.sessionStatus === 'cancelled' ? 'Cancelled' : 'Studio closed'))
                                : s.tally.unmarked > 0
                                  ? <span style={{ color: theme.colors.status.warning, fontWeight: 700 }}>{s.tally.unmarked} not marked</span>
                                  : `${s.rows.length} on roster`}
                            </span>
                          </span>
                          <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: theme.colors.txt.secondary }}>
                            {s.tally.percent === null ? '—' : `${s.tally.attended}/${s.tally.counted} · ${s.tally.percent}%`}
                          </span>
                        </button>
                      </div>

                      {open && (
                        <div style={{ marginTop: theme.spacing.sm }}>
                          {shown.length === 0 && (
                            <div style={{ color: theme.colors.txt.tertiary, fontSize: '0.85rem' }}>No dancer matches the search.</div>
                          )}
                          {shown.map(r => (
                            <div
                              key={r.studentId}
                              style={{
                                display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm,
                                justifyContent: 'space-between', alignItems: 'center',
                                padding: '6px 0', borderTop: `1px solid ${theme.colors.bdr.primary}`,
                              }}
                            >
                              <span style={{ flex: '1 1 140px', minWidth: 0, overflowWrap: 'anywhere' }}>
                                {r.lastName}, {r.firstName}
                              </span>
                              <MarkPill row={r} />
                            </div>
                          ))}
                          <Button
                            variant="secondary"
                            size="sm"
                            style={{ marginTop: theme.spacing.sm }}
                            onClick={() => onFix({
                              classId: klass.id, className: klass.name, sessionId: s.sessionId,
                              sessionDate: s.sessionDate, sessionStatus: s.sessionStatus, sessionNote: s.sessionNote,
                            })}
                          >
                            {s.tally.unmarked > 0 ? 'Take attendance' : 'Fix attendance'}
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ClassHistory;
