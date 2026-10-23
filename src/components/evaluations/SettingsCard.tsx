import React, { useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Input, Toggle } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { EvaluationSettings, saveEvaluationSettings } from '../../lib/evaluations';

/**
 * The admin switch: open or closed, and the name of the round.
 *
 * It says, in plain words, what each state means to a teacher and to a
 * family — because "enabled" on its own invites the wrong guess that closing
 * evaluations hides them from parents. It does not; submitted ones stay
 * readable. Closing only stops teachers saving.
 *
 * RENAMING MID-ROUND STARTS A NEW BUCKET. Rows are keyed on the round name, so
 * a rename does not carry drafts across — it leaves them under the old name
 * and opens an empty one. The card says so before the save, and confirms it.
 */

interface Props {
  settings: EvaluationSettings;
  onChange: (next: EvaluationSettings) => void;
}

const SettingsCard: React.FC<Props> = ({ settings, onChange }) => {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [round, setRound] = useState(settings.round);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setRound(settings.round); }, [settings.round]);

  const apply = async (enabled: boolean, nextRound: string | null) => {
    setBusy(true);
    const { settings: saved, error } = await saveEvaluationSettings(enabled, nextRound);
    setBusy(false);
    if (error || !saved) {
      toast.error(error || 'Could not save the settings.');
      return;
    }
    onChange(saved);
    toast.success(saved.enabled ? `Evaluations are open for "${saved.round}".` : 'Evaluations are closed to teachers.');
  };

  const saveRound = async () => {
    const trimmed = round.trim();
    if (!trimmed) {
      toast.error('Name the round first.');
      return;
    }
    if (settings.round && trimmed !== settings.round) {
      const ok = await confirm({
        title: 'Rename the round?',
        message: `Evaluations already saved under "${settings.round}" stay there. "${trimmed}" starts with every dancer blank. Rename only if this is genuinely a new round.`,
        confirmLabel: 'Rename',
        variant: 'warning',
      });
      if (!ok) return;
    }
    await apply(settings.enabled, trimmed);
  };

  const toggle = async (next: boolean) => {
    const typed = round.trim();
    if (next && !settings.round.trim() && !typed) {
      toast.error('Name the round before opening evaluations.');
      return;
    }
    // A typed-but-unsaved name rides along with the switch — but a RENAME
    // gets the same confirmation Save name gives, because flipping the switch
    // must not quietly start a new bucket.
    const renaming = Boolean(settings.round) && typed && typed !== settings.round;
    if (renaming) {
      const ok = await confirm({
        title: 'Rename the round as well?',
        message: `The name box says "${typed}" but the open round is "${settings.round}". Evaluations already saved stay under the old name; "${typed}" starts blank.`,
        confirmLabel: `Rename and ${next ? 'open' : 'close'}`,
        cancelLabel: `Keep "${settings.round}"`,
        variant: 'warning',
      });
      if (!ok) {
        setRound(settings.round);
        await apply(next, null);
        return;
      }
    }
    await apply(next, typed !== settings.round ? typed || null : null);
  };

  const dirty = round.trim() !== settings.round;

  return (
    <Card>
      <h3 style={{ ...theme.typography.h3, fontFamily: theme.fonts.display, color: theme.colors.txt.primary, margin: `0 0 ${theme.spacing.sm}` }}>
        Evaluation round
      </h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <Input
            label="Round name"
            value={round}
            onChange={e => setRound(e.target.value.slice(0, 80))}
            placeholder='e.g. "Fall midterm"'
            disabled={busy}
          />
        </div>
        <Button variant="secondary" onClick={saveRound} disabled={busy || !dirty} loading={busy && dirty}>
          Save name
        </Button>
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
        gap: theme.spacing.sm, marginTop: theme.spacing.md,
        padding: theme.spacing.sm, borderRadius: theme.borderRadius.md,
        border: `1px solid ${settings.enabled ? theme.colors.status.success : theme.colors.bdr.primary}`,
      }}>
        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
          <div id="eval-switch-label" style={{ fontWeight: 700, color: theme.colors.txt.primary }}>
            {settings.enabled ? 'Open — teachers can save and submit' : 'Closed — teachers cannot save'}
          </div>
          <div id="eval-switch-hint" style={{ fontSize: '0.8rem', color: theme.colors.txt.tertiary }}>
            Families can read anything already submitted either way. Admins can always edit, and those edits are logged.
          </div>
        </div>
        <Toggle
          checked={settings.enabled}
          onChange={toggle}
          disabled={busy}
          labelledBy="eval-switch-label"
          describedBy="eval-switch-hint"
        />
      </div>
      {confirmDialog}
    </Card>
  );
};

export default SettingsCard;
