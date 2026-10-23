import React, { useCallback, useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Spinner, EmptyState } from '../ui';
import { useConfirm } from '../../hooks/useConfirm';
import { useToast } from '../../contexts/ToastContext';
import { useRefreshable } from '../../contexts/RefreshContext';
import {
  EvaluationClass,
  EvaluationDraft,
  RosterEntry,
  loadClassRoster,
  progressText,
  rosterProgress,
  saveEvaluation,
  toEvaluation,
} from '../../lib/evaluations';
import EvaluationForm from './EvaluationForm';

/**
 * One class, one round: the roster with each dancer's state, and the form for
 * whichever dancer is open.
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
  return { label: 'Draft', color: theme.colors.status.warning, fill: true };
};

const ClassSheet: React.FC<Props> = ({ klass, round, season = null, canSave, adminOverride = false, openStudentId, onBack }) => {
  const { confirm, confirmDialog } = useConfirm();
  const toast = useToast();
  const [rows, setRows] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(openStudentId ?? null);
  const [saving, setSaving] = useState(false);

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

  const save = async (entry: RosterEntry, draft: EvaluationDraft, submit: boolean) => {
    const firstSubmit = submit && entry.evaluation?.status !== 'submitted';
    if (firstSubmit) {
      const ok = await confirm({
        title: `Submit ${entry.firstName}'s evaluation?`,
        message: 'The family will be able to read it straight away. You can still edit it afterwards; edits stay visible.',
        confirmLabel: 'Submit',
        variant: 'info',
      });
      if (!ok) return;
    }

    setSaving(true);
    const { result, error: err } = await saveEvaluation({
      ...draft,
      studentId: entry.studentId,
      classId: klass.id,
      submit,
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
    toast.success(result.status === 'submitted' ? `${entry.firstName} submitted.` : 'Draft saved.');
    load(true).catch(() => {});
    if (!submit) return;
    setOpenId(null);
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
          onSave={(draft, submit) => save(open, draft, submit)}
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
