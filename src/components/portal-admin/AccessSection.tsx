import React, { useCallback, useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Input, Badge, Divider } from '../ui';
import { CustomCheckbox } from '../CustomCheckbox';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { usePortalAdmin, describeWriteError } from '../../contexts/PortalAdminContext';
import { PortalProgram } from '../../types';

/**
 * The studio access code for one program. Admin-only, enforced inside
 * set_portal_code() itself because the table it writes to is unreachable by
 * every role — there is no policy to enforce it with.
 *
 * WHAT THIS SCREEN CANNOT DO
 *
 * Show the current code. It is stored as a bcrypt hash in a table with no
 * grants; the browser can set one and can ask whether one exists, and that is
 * the whole surface. If nobody remembers it, the fix is to set a new one.
 *
 * WHY "NO CODE SET" IS CALLED OUT SO LOUDLY
 *
 * verify_portal_code() fails closed: a program with requires_code = true and no
 * code row rejects every attempt, including the right one. That is the correct
 * failure — better a locked section than a silently open one — but it looks
 * from the outside like a broken portal, so the screen says it plainly.
 */

const AccessSection: React.FC<{ program: PortalProgram }> = ({ program }) => {
  const { setAccessCode, setRequiresCode, programHasCode } = usePortalAdmin();
  const { success, error: toastError } = useToast();
  const { confirm, confirmDialog } = useConfirm();

  // null while unknown — either v11 is not applied yet or the check failed.
  const [hasCode, setHasCode] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [code, setCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const refreshStatus = useCallback(async () => {
    setChecking(true);
    setHasCode(await programHasCode(program.slug));
    setChecking(false);
  }, [program.slug, programHasCode]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const handleSetCode = async () => {
    if (code.trim().length < 4) {
      setFormError('The code needs at least 4 characters.');
      return;
    }
    if (code !== confirmCode) {
      setFormError('The two codes do not match.');
      return;
    }

    setSaving(true);
    try {
      await setAccessCode(program.slug, code.trim());
      setCode('');
      setConfirmCode('');
      setFormError('');
      success(`New code set for ${program.name}. Everyone will need it next time they clear the gate.`);
      refreshStatus();
    } catch (e) {
      setFormError(describeWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleGate = async (requiresCode: boolean) => {
    if (!requiresCode) {
      const ok = await confirm({
        title: `Open ${program.name} to anyone?`,
        message:
          'Everything in this section becomes visible to anyone with the link, with no code. ' +
          'That is fine for schedules and announcements — it is not fine for anything private.',
        confirmLabel: 'Open it',
        variant: 'warning',
      });
      if (!ok) return;
    }

    try {
      await setRequiresCode(program.id, requiresCode);
      success(requiresCode ? 'A code is now required.' : 'This section is open to anyone with the link.');
    } catch (e) {
      toastError(describeWriteError(e));
    }
  };

  const gateStatus = (): { text: string; variant: 'success' | 'warning' | 'danger' | 'default' } => {
    if (!program.requiresCode) return { text: 'Open — no code needed', variant: 'warning' };
    if (checking) return { text: 'Checking…', variant: 'default' };
    if (hasCode === true) return { text: 'Gated — a code is set', variant: 'success' };
    if (hasCode === false) return { text: 'Gated — no code set, nobody can get in', variant: 'danger' };
    return { text: 'Gated — code status unknown', variant: 'default' };
  };

  const status = gateStatus();

  const paragraph: React.CSSProperties = {
    ...theme.typography.bodySmall,
    fontFamily: theme.fonts.primary,
    color: theme.colors.txt.secondary,
    margin: '0 0 12px',
  };

  return (
    <>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <h3 style={{ ...theme.typography.h3, color: theme.colors.txt.primary, margin: 0 }}>
            {program.name}
          </h3>
          <Badge variant={status.variant} size="sm">{status.text}</Badge>
        </div>

        <CustomCheckbox
          checked={program.requiresCode}
          onChange={handleToggleGate}
          label="Ask for a code before showing this section"
        />

        {program.requiresCode && hasCode === false && (
          <p style={{ ...paragraph, color: theme.colors.status.error, marginTop: '12px' }}>
            This section is currently unreachable: it asks for a code and none has been set.
            Set one below, or untick the box above to open it.
          </p>
        )}

        {hasCode === null && !checking && program.requiresCode && (
          <p style={{ ...paragraph, color: theme.colors.txt.tertiary, marginTop: '12px' }}>
            Whether a code has been set cannot be checked until the v11 migration is applied.
            Setting a new one below works either way.
          </p>
        )}

        <Divider margin="md" />

        <p style={paragraph}>
          Codes are stored hashed and cannot be read back — not here, not by anyone. Setting a new
          one replaces the old one immediately, and every family will need it the next time they
          open the portal on a new device.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '360px' }}>
          <Input
            label="New code"
            type="text"
            autoComplete="off"
            value={code}
            placeholder="At least 4 characters"
            onChange={e => setCode(e.target.value)}
          />
          <Input
            label="Type it again"
            type="text"
            autoComplete="off"
            value={confirmCode}
            onChange={e => setConfirmCode(e.target.value)}
          />

          {formError && (
            <p style={{
              ...theme.typography.bodySmall,
              fontFamily: theme.fonts.primary,
              color: theme.colors.status.error,
              margin: 0,
            }}>
              {formError}
            </p>
          )}

          <div>
            <Button variant="primary" onClick={handleSetCode} loading={saving}>
              {hasCode ? 'Replace the code' : 'Set the code'}
            </Button>
          </div>
        </div>
      </Card>

      <Card style={{ marginTop: '16px' }}>
        <h3 style={{ ...theme.typography.h3, color: theme.colors.txt.primary, margin: '0 0 12px' }}>
          What belongs in the portal
        </h3>
        <p style={paragraph}>
          The code is a convenience, not a lock. Portal content is readable without an account by
          design — that is what lets a parent open a link without signing in — so the code keeps
          the section tidy rather than secret.
        </p>
        <p style={{ ...paragraph, margin: 0 }}>
          Schedules, announcements, policies, costume lists and event dates: fine. Student names,
          contact details, medical notes and anything to do with payment: never.
        </p>
      </Card>

      {confirmDialog}
    </>
  );
};

export default AccessSection;
