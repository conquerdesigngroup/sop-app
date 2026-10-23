import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Spinner, EmptyState } from '../ui';
import { useConfirm } from '../../hooks/useConfirm';
import { useToast } from '../../contexts/ToastContext';
import { useRefreshable } from '../../contexts/RefreshContext';
import {
  EvaluationClass,
  EvaluationDraft,
  RosterEntry,
  draftOf,
  isComplete,
  loadClassRoster,
  planSubmitAll,
  progressText,
  rosterProgress,
  saveEvaluation,
  submitAllSummary,
  toEvaluation,
} from '../../lib/evaluations';
import EvaluationForm from './EvaluationForm';

/**
 * One class, one round: the roster with each dancer's state, the form for
 * whichever dancer is open, and SUBMIT ALL.
 *
 * The form saves drafts only. The class is sent to families from here, in one
 * go, once the teacher has been through everyone: Submit all sends every
 * complete draft and names, before it runs, the dancers it will leave behind.
 * Each dancer is one call to staff_save_evaluation, made one after another so
 * a dropped connection halfway leaves the first N submitted and the rest as
 * drafts — never a half-written row — and the bar can say which dancer it is
 * on (CLAUDE.md, slow taps).
 *
 * `season` and `round` are the bucket the saves land in. A teacher gets the
 * class's season and the open round and cannot change either; an admin on the
 * lookup tab can pass any pair, which the function allows for admins only.
 */

interface Props {
  klass: EvaluationClass;
  round: string;
  /** Admin override. Null means the class's own season. */
  season?: string | null;
  canSave: boolean;
  /** True when the caller is an admin writing outside the open round. */
  adminOverride?: boolean;
  /** Open this dancer's form straight away (the lookup's Edit button). */
  openStudentId?: string;
  onBack: () => void;
}

const stateOf = (e: RosterEntry): { label: string; color: string; fill: boolean } => {
  if (!e.evaluation) return { label: 'Not started', color: theme.colors.txt.tertiary, fill: false };
  if (e.evaluation.status === 'submitted') return { label: 'Submitted', color: theme.colors.status.success, fill: true };
  if (!isComplete(draftOf(e.evaluation))) return { label: 'Draft · incomplete', color: theme.colors.status.warning, fill: false };
  return { label: 'Ready', color: theme.colors.status.warning, fill: true };
};

interface SubmitProgress {
  done: number;
  total: number;
  current: string;
}

const ClassSheet: React.FC<Props> = ({ klass, round, season = null, canSave, adminOverride = false, openStudentId, onBack }) => {
  const { confirm, confirmDialog } = useConfirm();
  const toast = useToast();
  const [rows, setRows] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(openStudentId ?? null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState<SubmitProgress | null>(null);
  const [submitNote, setSubmitNote] = useState<string | null>(null);
  // A second tap can land between the first and the re-render that disables
  // the button (CLAUDE.md, slow taps).
  const busyRef = useRef(false);

  const effectiveSeason = season ?? klass.season;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { rows: fetched, error: err } = await loadClassRoster(klass.id, effectiveSeason, round);
    setRows(fetched);
    setError(err);
    setLoading(false);
    if (err) throw new Error(err);
  }, [klass.id, effectiveSeason, round]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  const reload = useCallback(() => load(true), [load]);
  useRefreshable(reload, true);

  const open = rows.find(r => r.studentId === openId) ?? null;
  const progress = rosterProgress(rows);
  const plan = planSubmitAll(rows);

  const applyRow = (entry: RosterEntry, draft: EvaluationDraft, result: { id: string; status: 'draft' | 'submitted'; season: string; round: string }) => {
    setRows(prev => prev.map(r => r.studentId !== entry.studentId ? r : {
      ...r,
      evaluation: toEvaluation({
        id: result.id, student_id: entry.studentId, class_id: klass.id,
        season: result.season, round: result.round,
        performance: draft.performance, attendance: draft.attendance, showmanship: draft.showmanship,
        comment: draft.comment, move_up: draft.moveUp, status: result.status,
        submitted_at: result.status === 'submitted' ? (r.evaluation?.submittedAt ?? new Date().toISOString()) : null,
      }),
    }));
  };

  /** The form's Save: a draft, or changes to an already-submitted row. Never submits. */
  const save = async (entry: RosterEntry, draft: EvaluationDraft) => {
    setSaving(true);
    const { result, error: err } = await saveEvaluation({
      ...draft,
      studentId: entry.studentId,
      classId: klass.id,
      submit: false,
      season: adminOverride ? effectiveSeason : null,
      round: adminOverride ? round : null,
    });
    setSaving(false);

    if (err || !result) {
      toast.error(err || 'Could not save.');
      throw new Error(err || 'Could not save.');
    }

    // Update the row in place so the list is right without a refetch; the
    // refetch follows silently to pick up the server's timestamps.
    applyRow(entry, draft, result);
    toast.success(result.status === 'submitted' ? `${entry.firstName}'s changes saved.` : `${entry.firstName} saved.`);
    load(true).catch(() => {});
    // Back to the roster: the next dancer is the next thing to do.
    setOpenId(null);
  };

  /** Submit every complete draft, one call each, in roster order. */
  const submitAll = async () => {
    if (busyRef.current || plan.ready.length === 0) return;
    const ok = await confirm({
      title: `Submit ${plan.ready.length} ${plan.ready.length === 1 ? 'evaluation' : 'evaluations'} to families?`,
      message: `${submitAllSummary(plan)} Families can read a submitted evaluation straight away. You can still edit one afterwards; edits stay visible.`,
      confirmLabel: 'Submit all',
      variant: 'info',
    });
    if (!ok) return;

    busyRef.current = true;
    setSubmitNote(null);
    const total = plan.ready.length;
    let sent = 0;
    const failed: string[] = [];

    for (let i = 0; i < plan.ready.length; i += 1) {
      const entry = plan.ready[i];
      setSubmitting({ done: i, total, current: `${entry.firstName} ${entry.lastName}` });
      const draft = draftOf(entry.evaluation);
      const { result, error: err } = await saveEvaluation({
        ...draft,
        studentId: entry.studentId,
        classId: klass.id,
        submit: true,
        season: adminOverride ? effectiveSeason : null,
        round: adminOverride ? round : null,
      });
      if (err || !result) {
        failed.push(`${entry.firstName} ${entry.lastName}`);
      } else {
        sent += 1;
        applyRow(entry, draft, result);
      }
    }

    setSubmitting(null);
    busyRef.current = false;
    load(true).catch(() => {});

    if (failed.length === 0) {
      setSubmitNote(`${sent} ${sent === 1 ? 'evaluation' : 'evaluations'} sent to families.`);
      toast.success(`${sent} submitted.`);
    } else {
      setSubmitNote(`${sent} sent. Could not submit ${failed.join(', ')} — they are still drafts. Check your connection and tap Submit all again.`);
      toast.error(`${failed.length} could not be submitted.`);
    }
  };

  if (open) {
    return (
      <Card>
        <EvaluationForm
          entry={open}
          className={klass.name}
          round={round}
          canSave={canSave}
          saving={saving}
          onSave={draft => save(open, draft)}
          onBack={() => setOpenId(null)}
        />
        {confirmDialog}
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center', marginBottom: theme.spacing.md }}>
        <Button variant="ghost" size="sm" onClick={onBack}>← Classes</Button>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '1.15rem', color: theme.colors.txt.primary, overflowWrap: 'anywhere' }}>
            {klass.name}
          </div>
          <div style={{ fontSize: '0.8rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>
            {[effectiveSeason, round, loading ? null : progressText(progress.submitted, progress.total)].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {/*
        Submit all. Above the list so it is found; disabled with the reason in
        words beside it rather than hidden, so a teacher knows what is left.
      */}
      {!loading && !error && rows.length > 0 && canSave && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing.sm,
          padding: theme.spacing.sm, marginBottom: theme.spacing.md,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${plan.ready.length > 0 ? theme.colors.status.success : theme.colors.bdr.primary}`,
        }}>
          <Button
            variant="primary"
            onClick={submitAll}
            disabled={plan.ready.length === 0 || submitting !== null}
            loading={submitting !== null}
          >
            {plan.ready.length > 0 ? `Submit all (${plan.ready.length})` : 'Submit all'}
          </Button>
          <span role="status" aria-live="polite" style={{ flex: '1 1 160px', minWidth: 0, fontSize: '0.85rem', color: theme.colors.txt.secondary, overflowWrap: 'anywhere' }}>
            {submitting
              ? `Submitting ${Math.min(submitting.done + 1, submitting.total)} of ${submitting.total} — ${submitting.current}. Keep this page open.`
              : submitNote ?? submitAllSummary(plan)}
          </span>
          {submitting && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={submitting.total}
              aria-valuenow={submitting.done}
              style={{ flex: '1 1 100%', height: 6, borderRadius: 3, background: theme.colors.bg.tertiary, overflow: 'hidden' }}
            >
              <div style={{ height: '100%', width: `${Math.round((submitting.done / submitting.total) * 100)}%`, background: theme.colors.primary, transition: 'width 0.2s' }} />
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}><Spinner /></div>
      ) : error ? (
        <div role="alert" style={{ color: theme.colors.txt.primary }}>
          {error}
          <div style={{ marginTop: theme.spacing.md }}>
            <Button variant="secondary" onClick={() => { load().catch(() => {}); }}>Try again</Button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Nobody on this roster" description="No dancer has an active enrollment in this class." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(r => {
            const s = stateOf(r);
            return (
              <button
                key={r.studentId}
                type="button"
                onClick={() => setOpenId(r.studentId)}
                disabled={submitting !== null}
                style={{
                  minHeight: 52,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing.sm,
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  background: 'transparent',
                  border: `1px solid ${theme.colors.bdr.primary}`,
                  borderRadius: theme.borderRadius.md,
                  font: 'inherit',
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.txt.primary,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ minWidth: 0, flex: '1 1 140px', fontWeight: 600, overflowWrap: 'anywhere' }}>
                  {r.lastName}, {r.firstName}
                </span>
                <span style={{
                  padding: `4px ${theme.spacing.sm}`,
                  borderRadius: theme.borderRadius.full,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  background: s.fill ? s.color : theme.colors.bg.tertiary,
                  color: s.fill ? '#FFFFFF' : s.color,
                }}>
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {confirmDialog}
    </Card>
  );
};

export default ClassSheet;
