import React, { useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Button, Textarea, Toggle } from '../ui';
import {
  COMMENT_MAX,
  CRITERIA,
  Criterion,
  EvaluationDraft,
  RATINGS,
  Rating,
  RATING_LABELS,
  RosterEntry,
  draftOf,
  isComplete,
  prettyDate,
  sameDraft,
} from '../../lib/evaluations';

/**
 * The form for one dancer: three 1–5 controls, a comment, the move-up switch,
 * and Save draft / Submit.
 *
 * THE SAME FORM IN EVERY ROUND — that is the owner's spec, and it is why the
 * criteria are a constant and not a per-round configuration.
 *
 * A RATING IS FIVE BUTTONS, NOT A SLIDER OR A SELECT. On a phone a teacher is
 * filling in fifteen of these between classes; a tap on a number is one
 * gesture, and the five fit a 320px row at 44px each with room to spare. The
 * word under the chosen number is the only label that moves, so the row stays
 * the same height whichever is picked.
 *
 * SUBMITTED STAYS SUBMITTED. The function never reverts a submitted row to
 * draft, so once a dancer is submitted the draft button goes away and the only
 * action is "Save changes", which keeps it visible to the family.
 */

interface Props {
  entry: RosterEntry;
  className: string;
  /** The round the save will land in — shown so nobody fills in the wrong one. */
  round: string;
  /** False when the switch is off for this person; the form renders read-only. */
  canSave: boolean;
  saving: boolean;
  onSave: (draft: EvaluationDraft, submit: boolean) => Promise<void>;
  onBack: () => void;
}

const RatingRow: React.FC<{
  criterion: Criterion;
  value: Rating | null;
  disabled: boolean;
  onPick: (r: Rating) => void;
}> = ({ criterion, value, disabled, onPick }) => {
  const meta = CRITERIA.find(c => c.key === criterion)!;
  const groupId = `rating-${criterion}`;
  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <div id={groupId} style={{ fontWeight: 700, color: theme.colors.txt.primary }}>{meta.label}</div>
      <div style={{ fontSize: '0.8rem', color: theme.colors.txt.tertiary, marginBottom: theme.spacing.xs }}>{meta.hint}</div>
      <div role="group" aria-labelledby={groupId} style={{ display: 'flex', gap: 6 }}>
        {RATINGS.map(r => {
          const on = value === r;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={on}
              aria-label={`${r} – ${RATING_LABELS[r]}`}
              disabled={disabled}
              onClick={() => onPick(r)}
              style={{
                flex: '1 1 0',
                minWidth: 0,
                minHeight: 48,
                borderRadius: theme.borderRadius.md,
                border: `2px solid ${on ? theme.colors.primary : theme.colors.bdr.primary}`,
                background: on ? theme.colors.primary : theme.colors.bg.tertiary,
                // White on the crimson fill: mode-dependent tokens flip in light mode.
                color: on ? '#FFFFFF' : theme.colors.txt.primary,
                fontFamily: theme.fonts.primary,
                fontWeight: 800,
                fontSize: '1.1rem',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled && !on ? 0.6 : 1,
              }}
            >
              {r}
            </button>
          );
        })}
      </div>
      <div
        aria-live="polite"
        style={{ minHeight: 18, marginTop: 4, fontSize: '0.8rem', color: theme.colors.txt.secondary }}
      >
        {value ? RATING_LABELS[value] : 'Tap a number'}
      </div>
    </div>
  );
};

const EvaluationForm: React.FC<Props> = ({ entry, className, round, canSave, saving, onSave, onBack }) => {
  const saved = entry.evaluation;
  const [draft, setDraft] = useState<EvaluationDraft>(() => draftOf(saved));
  const [error, setError] = useState<string | null>(null);

  // A fresh dancer opened in the same sheet gets their own saved values.
  //
  // Keyed on the DANCER only, not on the saved row. The roster refetches
  // silently after every save and on pull-to-refresh, which hands this form a
  // new `evaluation` object each time — resetting on that would throw away
  // whatever the teacher has typed since. What they typed is the truth here
  // until they save it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(draftOf(entry.evaluation)); setError(null); }, [entry.studentId]);

  const submitted = saved?.status === 'submitted';
  const dirty = !sameDraft(draft, draftOf(saved));
  const complete = isComplete(draft);
  const disabled = !canSave || saving;

  const attempt = async (submit: boolean) => {
    setError(null);
    if (submit && !complete) {
      setError('Fill in all three ratings before submitting.');
      return;
    }
    try {
      await onSave(draft, submit);
    } catch (e: any) {
      setError(e?.message || 'Could not save. Check your connection and try again.');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center', marginBottom: theme.spacing.md }}>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={saving}>← Roster</Button>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '1.15rem', color: theme.colors.txt.primary, overflowWrap: 'anywhere' }}>
            {entry.firstName} {entry.lastName}
          </div>
          <div style={{ fontSize: '0.8rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>
            {className} · {round}
            {submitted && saved?.submittedAt ? ` · submitted ${prettyDate(saved.submittedAt)}` : saved ? ' · draft' : ''}
          </div>
        </div>
      </div>

      {!canSave && (
        <div role="status" style={{
          padding: theme.spacing.sm,
          marginBottom: theme.spacing.md,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.bdr.secondary}`,
          background: theme.colors.bg.tertiary,
          fontSize: '0.85rem',
          color: theme.colors.txt.secondary,
        }}>
          Evaluations are closed right now, so this is read-only.
        </div>
      )}

      {CRITERIA.map(c => (
        <RatingRow
          key={c.key}
          criterion={c.key}
          value={draft[c.key]}
          disabled={disabled}
          onPick={r => setDraft(d => ({ ...d, [c.key]: r }))}
        />
      ))}

      <Textarea
        label="Comments for the family"
        value={draft.comment}
        onChange={e => setDraft(d => ({ ...d, comment: e.target.value.slice(0, COMMENT_MAX) }))}
        rows={5}
        maxLength={COMMENT_MAX}
        disabled={disabled}
        placeholder="What went well this round, and what to work on next."
        helperText={`${draft.comment.length} / ${COMMENT_MAX}`}
      />

      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
        gap: theme.spacing.sm, margin: `${theme.spacing.md} 0`,
        padding: theme.spacing.sm, borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.bdr.primary}`,
      }}>
        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
          <div id="move-up-label" style={{ fontWeight: 700, color: theme.colors.txt.primary }}>Ready to move up</div>
          <div id="move-up-hint" style={{ fontSize: '0.8rem', color: theme.colors.txt.tertiary }}>
            Recommend the next class for next season.
          </div>
        </div>
        <Toggle
          checked={draft.moveUp}
          onChange={v => setDraft(d => ({ ...d, moveUp: v }))}
          disabled={disabled}
          labelledBy="move-up-label"
          describedBy="move-up-hint"
        />
      </div>

      {error && (
        <div role="alert" style={{ color: theme.colors.status.error, fontSize: '0.9rem', marginBottom: theme.spacing.sm }}>
          {error}
        </div>
      )}

      {canSave && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {submitted ? (
            <Button variant="primary" onClick={() => attempt(true)} disabled={saving || !dirty} loading={saving}>
              Save changes
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => attempt(false)} disabled={saving || !dirty} loading={saving}>
                Save draft
              </Button>
              <Button variant="primary" onClick={() => attempt(true)} disabled={saving || !complete} loading={saving}>
                Submit to family
              </Button>
            </>
          )}
        </div>
      )}
      <p style={{ marginTop: theme.spacing.sm, fontSize: '0.78rem', color: theme.colors.txt.tertiary }}>
        {submitted
          ? 'This evaluation is visible to the family. Changes you save are logged and stay visible.'
          : 'A draft is private to teachers and the office. Submit when it is ready for the family to read.'}
      </p>
    </div>
  );
};

export default EvaluationForm;
