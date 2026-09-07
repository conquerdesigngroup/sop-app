import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import PortalLayout from '../../components/portal/PortalLayout';
import { Button, Card, Input, Spinner } from '../../components/ui';
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
/**
 * One of the two doors, as a button with a plain sentence under it.
 *
 * The sentence is the point. "Log in" and "Sign up" are near-synonyms to a lot
 * of people, and a parent who picks wrong ends up at exactly the dead end this
 * screen exists to prevent. Naming what each one MEANS — I have an account /
 * I do not — is what makes the choice answerable.
 */
const DoorOption: React.FC<{ action: React.ReactNode; children: React.ReactNode }> = ({
  action,
  children,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {action}
    <p
      style={{
        ...theme.typography.bodySmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.tertiary,
        margin: 0,
        textAlign: 'center',
      }}
    >
      {children}
    </p>
  </div>
);

const ChooseDoor: React.FC<{ onLogIn: () => void }> = ({ onLogIn }) => {
  const navigate = useNavigate();
  return (
    <Card style={{ maxWidth: '440px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <DoorOption
          action={
            <Button variant="primary" size="lg" fullWidth onClick={onLogIn}>
              Log in
            </Button>
          }
        >
          I already made an account for this app.
        </DoorOption>

        <DoorOption
          action={
            <Button variant="outline" size="lg" fullWidth onClick={() => navigate('/portal/signup')}>
              Sign up
            </Button>
          }
        >
          It’s my first time — I need to make one.
        </DoorOption>

        {/* Said here as well as on the signup form itself. This is the one
            thing that silently fails: the roster was imported from Enrollio
            and is matched on the address, so a parent who signs up with a
            different email gets no code and no explanation — the signup
            endpoint answers identically either way, on purpose, so it cannot
            be used to test who attends the studio. */}
        <p
          style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.secondary,
            margin: 0,
            paddingTop: '4px',
            borderTop: `1px solid ${theme.colors.bdr.primary}`,
          }}
        >
          <strong>Signing up?</strong> Use the same email address as your{' '}
          <strong>Enrollio</strong> account — the one the studio already has for
          you. Any other address will not be recognised.
        </p>
      </div>
    </Card>
  );
};

const PortalLogin: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobileOrTablet } = useResponsive();
  const { hasSession, loading, signIn, requestReset } = usePortalAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // TWO DOORS, NAMED OUT LOUD.
  //
  // This page used to open straight onto an email + password form, with
  // "New here? Create your family account" as a sentence underneath it. A
  // parent who has never signed up does not read that sentence — they see two
  // boxes and start typing, and the form tells them their own email and a
  // password they just invented do not match. Observed in the first hours
  // after the login went live.
  //
  // So nobody is shown a form until they have said which of the two things
  // they are doing. The cost is one tap for a returning parent, and it is
  // close to free: a signed-in session redirects above this line, so the only
  // people who reach this screen are signed out — a new family, or somebody on
  // a new device.
  const [mode, setMode] = useState<'choose' | 'signin'>('choose');

  const [showReset, setShowReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

  const from = (location.state as { from?: string } | null)?.from;

  // Already signed in (or the session check just finished saying so): the
  // login form is not for them.
  if (!loading && hasSession) {
    return <Navigate to={from ?? portalRoutes.home} replace />;
  }

  // While the session check is in flight, show a spinner rather than the sign-in
  // form. Otherwise an already-signed-in visitor sees the form flash for an
  // instant before the redirect above fires.
  if (loading) {
    return (
      <PortalLayout title="Log in" backTo={portalRoutes.chooser}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <Spinner size={32} color={theme.colors.primary} />
        </div>
      </PortalLayout>
    );
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
      title={mode === 'choose' ? 'Parent Portal' : 'Log in'}
      subtitle={
        mode === 'choose'
          ? 'Schedules, class info and files for your dancer.'
          : 'The email and password you set up for this app.'
      }
      backTo={portalRoutes.chooser}
    >
      {mode === 'choose' ? (
        <ChooseDoor onLogIn={() => setMode('signin')} />
      ) : (
      <>
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
              Log in
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

      {/* Was "New here? Create your family account" — the sentence the
          chooser now replaces. It stays as a way BACK, for someone who tapped
          Log in and then realised they have never made an account. */}
      <p style={{
        ...theme.typography.body,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.secondary,
        margin: '20px 0 0',
        maxWidth: '440px',
      }}>
        Never made an account here?{' '}
        <Link to="/portal/signup" style={{ color: theme.colors.primary, fontWeight: 600 }}>
          Sign up instead
        </Link>
        .
      </p>
      </>
      )}
    </PortalLayout>
  );
};

export default PortalLogin;
