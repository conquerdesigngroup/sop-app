import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import PortalLayout from '../../components/portal/PortalLayout';
import { Button, Card, Input } from '../../components/ui';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { portalRoutes } from '../../lib/portal';

/**
 * The family sign-in door. Phone-first — this page is overwhelmingly opened
 * from a home-screen icon.
 *
 * Forgot-password lives inline rather than on its own route: it is one field,
 * and the answer is always the same sentence whether or not the address has an
 * account, because "no such account" is a client-list oracle we do not offer.
 *
 * A correct password on an unverified address routes to the signup page's code
 * step instead of failing — that is the one case GoTrue distinguishes for us,
 * and it only does so AFTER the password matched, so it reveals nothing.
 */
const PortalLogin: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobileOrTablet } = useResponsive();
  const { hasSession, loading, signIn, requestReset } = usePortalAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [showReset, setShowReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

  const from = (location.state as { from?: string } | null)?.from;

  // Already signed in (or the session check just finished saying so): the
  // login form is not for them.
  if (!loading && hasSession) {
    return <Navigate to={from ?? portalRoutes.home} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError('');

    const result = await signIn(email, password);
    setBusy(false);

    if (result.ok) {
      navigate(from ?? portalRoutes.home, { replace: true });
      return;
    }
    if (result.needsVerification) {
      navigate('/portal/signup', {
        state: { step: 'verify', email: email.trim().toLowerCase(), resend: true },
      });
      return;
    }
    setError(result.error ?? 'Could not sign you in.');
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setResetError('Enter your email above first.');
      return;
    }
    setBusy(true);
    setResetError('');
    const result = await requestReset(email);
    setBusy(false);
    if (!result.ok) {
      setResetError(result.error ?? 'Please try again in a minute.');
      return;
    }
    setResetSent(true);
  };

  const inputFontFix = isMobileOrTablet ? { fontSize: '16px' } : undefined;

  return (
    <PortalLayout
      title="Sign in"
      subtitle="Your family account for schedules, info and class files."
      backTo={portalRoutes.chooser}
    >
      <Card style={{ maxWidth: '440px' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              disabled={busy}
              style={inputFontFix}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              error={error || undefined}
              disabled={busy}
              style={inputFontFix}
            />
            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={busy && !showReset}
              disabled={!email.trim() || !password}
            >
              Sign in
            </Button>
          </div>
        </form>

        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!showReset ? (
            <button
              type="button"
              onClick={() => setShowReset(true)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
                ...theme.typography.bodySmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.tertiary,
                textDecoration: 'underline',
              }}
            >
              Forgot your password?
            </button>
          ) : resetSent ? (
            <p style={{
              ...theme.typography.bodySmall,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.secondary,
              margin: 0,
            }}>
              If that address has an account, a reset link is on its way. Check
              your inbox (and spam folder).
            </p>
          ) : (
            <form onSubmit={handleReset}>
              <p style={{
                ...theme.typography.bodySmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.secondary,
                margin: '0 0 10px',
              }}>
                We’ll email a reset link to the address above.
              </p>
              {resetError && (
                <p style={{
                  ...theme.typography.bodySmall,
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.status.error,
                  margin: '0 0 10px',
                }}>
                  {resetError}
                </p>
              )}
              <Button type="submit" variant="outline" size="sm" loading={busy && showReset}>
                Email me a reset link
              </Button>
            </form>
          )}
        </div>
      </Card>

      <p style={{
        ...theme.typography.body,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.secondary,
        margin: '20px 0 0',
        maxWidth: '440px',
      }}>
        New here?{' '}
        <Link to="/portal/signup" style={{ color: theme.colors.primary, fontWeight: 600 }}>
          Create your family account
        </Link>
        {' '}— available to families enrolled at the studio.
      </p>
    </PortalLayout>
  );
};

export default PortalLogin;
