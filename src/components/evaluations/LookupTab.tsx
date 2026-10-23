import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Input, Modal, SearchInput, Select, Spinner, Toggle } from '../ui';
import { useRefreshable } from '../../contexts/RefreshContext';
import { shareOrDownloadFile } from '../hours/hoursUtils';
import {
  EvaluationClass,
  EvaluationSettings,
  ExportFilters,
  ExportResult,
  ExportRow,
  StudentHit,
  loadAllClasses,
  loadExport,
  missingNotice,
  searchStudents,
  snapshotOfExport,
} from '../../lib/evaluations';
import ClassSheet from './ClassSheet';
import SnapshotCard from './SnapshotCard';
import { ZipCancelled, ZipProgress } from './evaluationZip';

/**
 * Admin lookup and export.
 *
 * Find a class or a dancer, read the snapshot cards, edit through the same
 * sheet a teacher uses (the function lets an admin write any round), export
 * one as a PDF or many as a ZIP of folders.
 *
 * BEFORE ANY ZIP RUNS, THE ADMIN IS TOLD WHAT IS MISSING. admin_evaluation_export
 * returns the summary and the content in one call, so the notice ("12 of 15
 * submitted, missing: …") is about exactly the file that would be built. The
 * admin can continue anyway — the point is to know, not to be stopped.
 *
 * A BIG EXPORT IS A SLOW TAP (CLAUDE.md). The button disables itself and a
 * busy ref ignores a second tap; a determinate bar names the dancer being
 * drawn; Cancel works between documents; and it ends in words that say what
 * happened. PDFs are built one at a time (evaluationZip.ts).
 */

type Mode = 'class' | 'dancer';

type Delivery =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'notice'; result: ExportResult; layout: 'class' | 'dancer'; label: string }
  | { kind: 'building'; progress: ZipProgress }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

interface Props {
  settings: EvaluationSettings;
}

const LookupTab: React.FC<Props> = ({ settings }) => {
  const [mode, setMode] = useState<Mode>('class');
  const [classes, setClasses] = useState<EvaluationClass[]>([]);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [classId, setClassId] = useState('');
  const [round, setRound] = useState(settings.round);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [openClass, setOpenClass] = useState<{ klass: EvaluationClass; studentId?: string } | null>(null);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dancer, setDancer] = useState<StudentHit | null>(null);
  const [dancerRows, setDancerRows] = useState<ExportRow[] | null>(null);
  const [dancerError, setDancerError] = useState<string | null>(null);

  const [delivery, setDelivery] = useState<Delivery>({ kind: 'idle' });
  const busyRef = useRef(false);
  const cancelRef = useRef(false);
  // Guards the dancer read against a stale response (CLAUDE.md: a fetch keyed
  // on typed state needs a request counter) — typing a round name fires one
  // read per settled value, and only the latest may land.
  const dancerSeq = useRef(0);

  useEffect(() => { setRound(settings.round); }, [settings.round]);

  const loadClasses = useCallback(async () => {
    const { classes: list, error } = await loadAllClasses();
    setClasses(list);
    setClassesError(error);
    if (error) throw new Error(error);
  }, []);
  useEffect(() => { loadClasses().catch(() => {}); }, [loadClasses]);
  useRefreshable(loadClasses, true);

  const selected = classes.find(c => c.id === classId) ?? null;
  const roundTrimmed = round.trim();
  // The round field is read after it settles, not on every keystroke.
  const [roundSettled, setRoundSettled] = useState(roundTrimmed);
  useEffect(() => {
    const t = setTimeout(() => setRoundSettled(roundTrimmed), 300);
    return () => clearTimeout(t);
  }, [roundTrimmed]);

  // ---- dancer search
  useEffect(() => {
    if (mode !== 'dancer') return;
    const q = query.trim();
    if (q.length < 2) { setHits([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { rows, error } = await searchStudents(q);
      if (!cancelled) { setHits(rows); setSearchError(error); setSearching(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, mode]);

  const loadDancer = useCallback(async (silent = false) => {
    if (!dancer) return;
    const seq = ++dancerSeq.current;
    if (!silent) setDancerRows(null);
    const { result, error } = await loadExport({ studentIds: [dancer.id], round: roundSettled || null, includeDrafts: true });
    if (seq !== dancerSeq.current) return;
    setDancerError(error);
    setDancerRows(result?.evaluations ?? []);
    if (error) throw new Error(error);
  }, [dancer, roundSettled]);
  useEffect(() => { loadDancer().catch(() => {}); }, [loadDancer]);
  const reloadDancer = useCallback(() => loadDancer(true), [loadDancer]);
  useRefreshable(reloadDancer, Boolean(dancer));

  // ---- exports
  const check = async (filters: ExportFilters, layout: 'class' | 'dancer', label: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setDelivery({ kind: 'checking' });
    const { result, error } = await loadExport({ ...filters, round: roundTrimmed || null, includeDrafts });
    busyRef.current = false;
    if (error || !result) {
      setDelivery({ kind: 'error', message: error || 'Could not check that export.' });
      return;
    }
    setDelivery({ kind: 'notice', result, layout, label });
  };

  const build = async (rows: ExportRow[], layout: 'class' | 'dancer', label: string) => {
    if (busyRef.current) return;
    if (rows.length === 0) {
      setDelivery({ kind: 'error', message: 'There is nothing submitted to export yet.' });
      return;
    }
    busyRef.current = true;
    cancelRef.current = false;
    setDelivery({ kind: 'building', progress: { done: 0, total: rows.length, current: 'Starting…' } });
    try {
      const { buildEvaluationZip } = await import('./evaluationZip');
      const { blob, filename, count } = await buildEvaluationZip(
        rows, layout, label,
        p => setDelivery({ kind: 'building', progress: p }),
        () => cancelRef.current,
      );
      const how = await shareOrDownloadFile(filename, blob, 'application/zip');
      setDelivery(how === 'cancelled'
        ? { kind: 'idle' }
        : { kind: 'done', message: `${count} ${count === 1 ? 'evaluation' : 'evaluations'} ${how === 'shared' ? 'shared' : 'downloaded'} as ${filename}.` });
    } catch (e: any) {
      setDelivery(e instanceof ZipCancelled
        ? { kind: 'done', message: 'Export cancelled. Nothing was saved.' }
        : { kind: 'error', message: e?.message || 'Could not build that export. Try again.' });
    } finally {
      busyRef.current = false;
    }
  };

  const onePdf = async (row: ExportRow) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setDelivery({ kind: 'building', progress: { done: 0, total: 1, current: `${row.firstName} ${row.lastName}` } });
    try {
      const { buildEvaluationPDF } = await import('./evaluationPdf');
      const { blob, filename } = await buildEvaluationPDF(snapshotOfExport(row));
      const how = await shareOrDownloadFile(filename, blob, 'application/pdf');
      setDelivery(how === 'cancelled' ? { kind: 'idle' } : { kind: 'done', message: `${filename} ${how === 'shared' ? 'shared' : 'downloaded'}.` });
    } catch (e: any) {
      setDelivery({ kind: 'error', message: e?.message || 'Could not build that PDF.' });
    } finally {
      busyRef.current = false;
    }
  };

  const busy = delivery.kind === 'checking' || delivery.kind === 'building';

  // ---- an open class sheet replaces the tab. The class's OWN season (ClassSheet
  // falls back to klass.season): that is what the teacher's screen reads and
  // what the function writes, so an admin edit lands in the same bucket.
  if (openClass) {
    return (
      <ClassSheet
        klass={openClass.klass}
        round={roundTrimmed || settings.round}
        canSave
        adminOverride
        openStudentId={openClass.studentId}
        onBack={() => { setOpenClass(null); loadDancer(true).catch(() => {}); }}
      />
    );
  }

  const pill = (on: boolean) => ({
    minHeight: 40,
    padding: `0 ${theme.spacing.md}`,
    borderRadius: theme.borderRadius.full,
    border: `2px solid ${on ? theme.colors.primary : theme.colors.bdr.primary}`,
    background: on ? theme.colors.primary : 'transparent',
    color: on ? '#FFFFFF' : theme.colors.txt.secondary,
    fontFamily: theme.fonts.primary,
    fontWeight: 700,
    cursor: 'pointer',
  } as React.CSSProperties);

  return (
    <div>
      <Card padding="md" style={{ marginBottom: theme.spacing.md }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.md }}>
          <button type="button" style={pill(mode === 'class')} onClick={() => setMode('class')}>By class</button>
          <button type="button" style={pill(mode === 'dancer')} onClick={() => setMode('dancer')}>By dancer</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <Input
              label="Round"
              value={round}
              onChange={e => setRound(e.target.value)}
              placeholder={settings.round || 'Round name'}
              disabled={busy}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44 }}>
            <span id="drafts-label" style={{ fontSize: '0.85rem', color: theme.colors.txt.secondary }}>Include drafts in exports</span>
            <Toggle checked={includeDrafts} onChange={setIncludeDrafts} disabled={busy} labelledBy="drafts-label" />
          </div>
        </div>
        {!roundTrimmed && (
          <p style={{ margin: `${theme.spacing.sm} 0 0`, fontSize: '0.8rem', color: theme.colors.status.warning }}>
            No round is named. Type one above, or name the open round on the Settings tab.
          </p>
        )}
      </Card>

      {mode === 'class' ? (
        <Card padding="md" style={{ marginBottom: theme.spacing.md }}>
          {classesError ? (
            <div role="alert" style={{ color: theme.colors.txt.primary }}>{classesError}</div>
          ) : (
            <>
              <Select
                label="Class"
                value={classId}
                onChange={e => setClassId(e.target.value)}
                placeholder="Choose a class"
                options={classes.map(c => ({ value: c.id, label: c.name }))}
                disabled={busy}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                <Button
                  variant="primary"
                  disabled={!selected || !roundTrimmed || busy}
                  onClick={() => selected && setOpenClass({ klass: selected })}
                >
                  Open roster
                </Button>
                <Button
                  variant="secondary"
                  disabled={!selected || !roundTrimmed || busy}
                  onClick={() => selected && check({ classIds: [selected.id] }, 'class', selected.name)}
                >
                  Export this class (ZIP)
                </Button>
                <Button
                  variant="outline"
                  disabled={classes.length === 0 || !roundTrimmed || busy}
                  onClick={() => check({ classIds: classes.map(c => c.id) }, 'class', `all-classes-${roundTrimmed}`)}
                >
                  Export every class (ZIP)
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : (
        <Card padding="md" style={{ marginBottom: theme.spacing.md }}>
          <SearchInput
            placeholder="Dancer's first or last name"
            value={query}
            onChange={e => { setQuery(e.target.value); setDancer(null); }}
            onClear={() => { setQuery(''); setHits([]); setDancer(null); }}
            disabled={busy}
          />
          {!dancer && query.trim().length >= 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: theme.spacing.sm }}>
              {searching ? (
                <div style={{ padding: theme.spacing.sm }}><Spinner size={18} /></div>
              ) : searchError ? (
                <span role="alert" style={{ fontSize: '0.85rem', color: theme.colors.txt.primary }}>{searchError}</span>
              ) : hits.length === 0 ? (
                <span style={{ fontSize: '0.85rem', color: theme.colors.txt.tertiary }}>No active dancer matches.</span>
              ) : hits.map(h => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setDancer(h)}
                  style={{
                    minHeight: 44, textAlign: 'left', padding: `0 ${theme.spacing.sm}`,
                    background: 'transparent', border: `1px solid ${theme.colors.bdr.primary}`,
                    borderRadius: theme.borderRadius.md, font: 'inherit', fontFamily: theme.fonts.primary,
                    color: theme.colors.txt.primary, cursor: 'pointer', overflowWrap: 'anywhere',
                  }}
                >
                  {h.lastName}, {h.firstName}
                </button>
              ))}
            </div>
          )}

          {dancer && (
            <div style={{ marginTop: theme.spacing.md }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: theme.colors.txt.primary, overflowWrap: 'anywhere' }}>
                  {dancer.firstName} {dancer.lastName}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || !dancerRows || dancerRows.length === 0}
                  onClick={() => check({ studentIds: [dancer.id] }, 'dancer', `${dancer.lastName}-${dancer.firstName}`)}
                >
                  Export all (ZIP)
                </Button>
              </div>

              {dancerError ? (
                <div role="alert" style={{ color: theme.colors.txt.primary, marginTop: theme.spacing.sm }}>{dancerError}</div>
              ) : dancerRows === null ? (
                <div style={{ padding: theme.spacing.md, textAlign: 'center' }}><Spinner /></div>
              ) : dancerRows.length === 0 ? (
                <p style={{ fontSize: '0.9rem', color: theme.colors.txt.tertiary }}>
                  Nothing saved for this dancer in {roundTrimmed ? `"${roundTrimmed}"` : 'this round'} yet.
                  {' '}Open one of their classes from the By class view to start one.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                  {dancerRows.map(row => {
                    const klass = classes.find(c => c.id === row.classId);
                    return (
                      <div key={row.evaluationId} style={{ border: `1px solid ${theme.colors.bdr.primary}`, borderRadius: theme.borderRadius.md, padding: theme.spacing.sm }}>
                        <SnapshotCard snapshot={snapshotOfExport(row)} showName={false} />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => onePdf(row)}>PDF</Button>
                          {klass && (
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpenClass({ klass, studentId: row.studentId })}>
                              Edit
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ---- delivery state: always in words, never a spinner alone */}
      {delivery.kind === 'checking' && (
        <Card padding="md">
          <div role="status" aria-live="polite" style={{ color: theme.colors.txt.secondary }}>Checking what is filled out…</div>
        </Card>
      )}
      {delivery.kind === 'building' && (
        <Card padding="md">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={delivery.progress.total}
            aria-valuenow={delivery.progress.done}
            style={{ height: 8, borderRadius: 4, background: theme.colors.bg.tertiary, overflow: 'hidden' }}
          >
            <div style={{
              height: '100%',
              width: `${delivery.progress.total ? Math.round((delivery.progress.done / delivery.progress.total) * 100) : 0}%`,
              background: theme.colors.primary,
              transition: 'width 0.2s',
            }} />
          </div>
          <div role="status" aria-live="polite" style={{ marginTop: theme.spacing.sm, color: theme.colors.txt.secondary, fontSize: '0.9rem' }}>
            Building {delivery.progress.done + 1 > delivery.progress.total ? delivery.progress.total : delivery.progress.done + 1} of {delivery.progress.total} — {delivery.progress.current}. Keep this page open.
          </div>
          {delivery.progress.total > 1 && (
            <div style={{ marginTop: theme.spacing.sm }}>
              <Button variant="secondary" size="sm" onClick={() => { cancelRef.current = true; }}>Cancel</Button>
            </div>
          )}
        </Card>
      )}
      {delivery.kind === 'done' && (
        <Card padding="md">
          <div role="status" aria-live="polite" style={{ color: theme.colors.txt.primary }}>{delivery.message}</div>
        </Card>
      )}
      {delivery.kind === 'error' && (
        <Card padding="md">
          <div role="alert" style={{ color: theme.colors.status.error }}>{delivery.message}</div>
        </Card>
      )}

      {/* ---- the pre-export notice */}
      <Modal
        isOpen={delivery.kind === 'notice'}
        onClose={() => setDelivery({ kind: 'idle' })}
        title="Before this export runs"
        size="md"
        footer={delivery.kind === 'notice' ? (
          <>
            <Button variant="secondary" onClick={() => setDelivery({ kind: 'idle' })}>Not yet</Button>
            <Button
              variant="primary"
              disabled={delivery.result.evaluations.length === 0}
              onClick={() => build(delivery.result.evaluations, delivery.layout, delivery.label)}
            >
              Export {delivery.result.evaluations.length} anyway
            </Button>
          </>
        ) : null}
      >
        {delivery.kind === 'notice' && (() => {
          const notice = missingNotice(delivery.result.summary);
          return (
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: theme.colors.txt.primary }}>{notice.headline}</p>
              {notice.lines.length > 0 && (
                <ul style={{ margin: `${theme.spacing.sm} 0 0`, paddingLeft: '1.2em', color: theme.colors.txt.secondary, fontSize: '0.9rem' }}>
                  {notice.lines.map(line => <li key={line} style={{ overflowWrap: 'anywhere' }}>{line}</li>)}
                </ul>
              )}
              <p style={{ margin: `${theme.spacing.md} 0 0`, fontSize: '0.85rem', color: theme.colors.txt.tertiary }}>
                The ZIP will hold {delivery.result.evaluations.length} PDF{delivery.result.evaluations.length === 1 ? '' : 's'}
                {includeDrafts ? ', drafts included and marked.' : '. Drafts are left out.'}
              </p>
            </div>
          );
        })()}
      </Modal>

    </div>
  );
};

export default LookupTab;
