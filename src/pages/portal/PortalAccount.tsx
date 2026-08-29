import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import PortalLayout from '../../components/portal/PortalLayout';
import { Button, Card, Divider, Input, Spinner } from '../../components/ui';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { CLIENT_MIN_PASSWORD } from '../../lib/clientAuth';
import { portalRoutes } from '../../lib/portal';

/**
 * A client's own account page: who they are signed in as, an in-app password
 * change, and the way out.
 *
 * The password change asks for the CURRENT password even though the session
 * could technically skip it — a phone left unlocked at the studio should not
 * be enough to take over the account. Email changes are deliberately absent:
 * the enrollment system owns addresses, and the front desk moves accounts via
 * Client Accounts (see portal-admin's client_set_email).
 */
const PortalAccount: React.FC = () => {
  const navigate = useNavigate();
  const { isMobileOrTablet } = useResponsive();
  const { loading, hasSession, isClient, profile, signOut, changePassword } = usePortalAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (loading) {
    return (
      <PortalLayout title="My account" backTo={portalRoutes.home}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <Spinner size={32} color={theme.colors.primary} />
        </div>
      </PortalLayout>
    );
  }

  if (!hasSession) {
    return <Navigate to="/portal/login" state={{ from: '/portal/account' }} replace />;
  }

  // Staff previewing the portal manage their account on the staff side.
  if (!isClient) {
    return <Navigate to={portalRoutes.home} replace />;
  }

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
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate('/portal/login', { replace: true });
  };

  const inputFontFix = isMobileOrTablet ? { fontSize: '16px' } : undefined;
  const name = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim();

  return (
    <PortalLayout title="My account" backTo={portalRoutes.home}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '440px' }}>
        <Card>
          {name && (
            <p style={{
              ...theme.typography.body,
              fontFamily: theme.fonts.primary,
              fontWeight: 600,
              color: theme.colors.txt.primary,
              margin: '0 0 4px',
            }}>
              {name}
            </p>
          )}
          <p style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            margin: 0,
            overflowWrap: 'anywhere',
          }}>
            {profile?.email}
          </p>

          <Divider />

          <p style={{
            ...theme.typography.caption,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.tertiary,
            margin: 0,
          }}>
            Need to change your email? It comes from the studio’s enrollment
            records — ask us at the front desk and we’ll move your account over.
          </p>
        </Card>

        <Card>
          <h2 style={{ ...theme.typography.h3, color: theme.colors.txt.primary, margin: '0 0 16px' }}>
            Change password
          </h2>
          <form onSubmit={handleChangePassword}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Input
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={e => { setCurrent(e.target.value); setError(''); setSaved(false); }}
                disabled={busy}
                style={inputFontFix}
              />
              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={e => { setNext(e.target.value); setError(''); setSaved(false); }}
                disabled={busy}
                style={inputFontFix}
              />
              <Input
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={e => { setConfirm(e.target.value); setError(''); setSaved(false); }}
                error={error || undefined}
                disabled={busy}
                style={inputFontFix}
              />
              {saved && (
                <p style={{
                  ...theme.typography.bodySmall,
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.status.success,
                  margin: 0,
                }}>
                  Password updated.
                </p>
              )}
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={busy}
                disabled={!current || !next || !confirm}
              >
                Update password
              </Button>
            </div>
          </form>
        </Card>

        <Button variant="outline" fullWidth loading={signingOut} onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    </PortalLayout>
  );
};

export default PortalAccount;
