import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { Button, Card, Divider, Input } from '../ui';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { CLIENT_MIN_PASSWORD } from '../../lib/clientAuth';
import { ProfileCardProps } from '../../lib/profileCards';

/**
 * Email, password and the way out.
 *
 * ONE PAGE, NOT TWO
 *
 * There used to be a separate /portal/account page holding the same email, the
 * same sign-out and this password form, reached from its own "My Account" tile
 * — so the portal had two doors to the same room, and the profile's Account
 * card was a signpost to a page that mostly repeated it. The password form now
 * lives here and /portal/account redirects, so "profile" and "account" are the
 * same destination whichever way a parent arrives.
 *
 * The form still asks for the CURRENT password even though the session could
 * technically skip it. A phone left unlocked at the studio should not be enough
 * to take somebody's account over.
 *
 * Email changes are deliberately absent: the enrollment system owns addresses,
 * and the front desk moves accounts via Client Accounts (portal-admin's
 * client_set_email).
 */
const AccountCard: React.FC<ProfileCardProps> = ({ email }) => {
  const navigate = useNavigate();
  const { isMobileOrTablet } = useResponsive();
  const { hasSession, isClient, signOut, changePassword } = usePortalAuth();

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // 16px on a phone, because anything smaller makes iOS zoom the whole page in
  // when the field takes focus.
  const inputFontFix = isMobileOrTablet ? { fontSize: '16px' } : undefined;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaved(false);

    if (next.length < CLIENT_MIN_PASSWORD) {
      setError(`Password must be at least ${CLIENT_MIN_PASSWORD} characters`);
      return;
    }
    if (next !== confirm) {
      setError('New passwords do not match');
      return;
    }

    setBusy(true);
    const result = await changePassword(current, next);
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? 'Could not update your password.');
      return;
    }
    setCurrent('');
    setNext('');
    setConfirm('');
    setSaved(true);
    setOpen(false);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate('/portal/login', { replace: true });
  };

  return (
    <Card>
      <h3 style={{
        ...theme.typography.h3,
        fontFamily: theme.fonts.display,
        color: theme.colors.txt.primary,
        margin: `0 0 ${theme.spacing.sm}`,
      }}>
        Account
      </h3>

      <p style={{
        ...theme.typography.bodySmall,
        fontFamily: theme.fonts.mono,
        color: theme.colors.txt.tertiary,
        margin: 0,
        overflowWrap: 'anywhere',
      }}>
        {email}
      </p>

      <p style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.tertiary,
        margin: `${theme.spacing.xs} 0 0`,
      }}>
        The studio owns email addresses — ask the front desk to change yours.
      </p>

      {saved && (
        <p style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.status.success,
          margin: `${theme.spacing.sm} 0 0`,
        }}>
          Password updated.
        </p>
      )}

      <Divider />

      {/* Staff previewing the portal keep their own /profile for passwords;
          what they need here is the way out, which is the only sign-out the
          portal has. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {isClient && (
          <Button variant="outline" size="sm" onClick={() => setOpen(v => !v)}>
            {open ? 'Cancel' : 'Change password'}
          </Button>
        )}
        {hasSession && (
          <Button variant="secondary" size="sm" loading={signingOut} onClick={handleSignOut}>
            Sign out
          </Button>
        )}
      </div>

      {open && isClient && (
        <form onSubmit={handleChangePassword} style={{ marginTop: theme.spacing.md, maxWidth: '340px' }}>
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={e => setCurrent(e.target.value)}
            style={inputFontFix}
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={e => setNext(e.target.value)}
            style={inputFontFix}
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            style={inputFontFix}
          />

          {error && (
            <p style={{
              ...theme.typography.bodySmall,
              fontFamily: theme.fonts.primary,
              color: theme.colors.status.error,
              margin: `${theme.spacing.xs} 0 0`,
            }}>
              {error}
            </p>
          )}

          <div style={{ marginTop: theme.spacing.sm }}>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={busy}
              disabled={!current || !next || !confirm}
            >
              Update password
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
};

export default AccountCard;
