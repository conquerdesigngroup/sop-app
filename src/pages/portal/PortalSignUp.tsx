import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import PortalLayout from '../../components/portal/PortalLayout';
import { Button, Card, Input, PasswordInput } from '../../components/ui';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { portalCheckEmail, CLIENT_MIN_PASSWORD } from '../../lib/clientAuth';
import { portalRoutes } from '../../lib/portal';

/**
 * Family account creation, in three steps: who you are → a password → the
 * 6-digit code from your inbox.
 *
 * THE COPY NEVER ANSWERS "AM I ON THE ROSTER"
 *
 * portal-signup returns the same 200 { ok: true } whatever the roster says —
 * deliberately, so nobody can use signup to test which families attend the
 * studio. This page honours that: after registering it says "if your email is
 * on our roster, a code is on its way" and moves to the code step regardless.
 * A parent who was not on file simply never receives a code, and the message
 * tells them what to do about it (check the email they enrolled with, or ask
 * the front desk).
 *
 * The verify step is also the landing spot for sign-ins that discover an
 * unverified address (PortalLogin navigates here with state.step='verify'),
 * so the ONE code screen serves both paths.
 */

type Step = 'details' | 'password' | 'verify';

/**
 * Must be >= Supabase's smtp_max_frequency, which is 60 on this project.
 *
 * It was 30, and that is a silent dead end rather than a cosmetic mismatch.
 * GoTrue refuses a second email to the same address inside its minimum
 * interval, and portal-signup answers 200 { ok: true } whatever happened —
 * the enumeration contract, and the right call — so a parent who tapped
 * "Send a new code" at 31 seconds got a fresh countdown, no error, and no
 * email. They then wait for something that was never sent.
 *
 * Raise the Supabase setting and this may come down again. Not the other way
 * round: the button must never re-enable before the server will act on it.
 */
const RESEND_COOLDOWN_S = 60;

const PortalSignUp: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobileOrTablet } = useResponsive();
  const { hasSession, loading, register, resendCode, verifyCode } = usePortalAuth();

  const entry = (location.state as { step?: Step; email?: string; resend?: boolean } | null) ?? null;

  const [step, setStep] = useState<Step>(entry?.step === 'verify' ? 'verify' : 'details');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(entry?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Arriving from a sign-in that found an unverified address: send a fresh
  // code once, because their original one is minutes-to-days old. Guarded by a
  // ref so a StrictMode double-mount cannot send two.
  const autoResent = useRef(false);
  useEffect(() => {
    if (entry?.resend && entry.email && !autoResent.current) {
      autoResent.current = true;
      void resendCode(entry.email);
      setCooldown(RESEND_COOLDOWN_S);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!loading && hasSession) {
    return <Navigate to={portalRoutes.home} replace />;
  }

  const inputFontFix = isMobileOrTablet ? { fontSize: '16px' } : undefined;

  const bodyText: React.CSSProperties = {
    ...theme.typography.bodySmall,
    fontFamily: theme.fonts.primary,
    color: theme.colors.txt.secondary,
  };

  // -------------------------------------------------------------- handlers

  const submitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!firstName.trim() || !cleanEmail) return;
    setBusy(true);
    setError('');
    // UX-only ping; the register step re-checks everything server-side and
    // the response never says whether the email matched.
    await portalCheckEmail(cleanEmail);
    setBusy(false);
    setStep('password');
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < CLIENT_MIN_PASSWORD) {
      setError(`Password must be at least ${CLIENT_MIN_PASSWORD} characters`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setBusy(true);
    const accepted = await register({
      email: email.trim().toLowerCase(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });
    setBusy(false);

    if (!accepted) {
      setError('Something went wrong on our side. Please try again in a moment.');
      return;
    }
    setCooldown(RESEND_COOLDOWN_S);
    setStep('verify');
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.trim();
    if (token.length < 6) return;
    setBusy(true);
    setError('');
    const result = await verifyCode(email, token);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'That code did not work.');
      return;
    }
    navigate(portalRoutes.home, { replace: true });
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN_S);
    await resendCode(email);
  };

  // --------------------------------------------------------------- render

  return (
    <PortalLayout
      title="Create account"
      subtitle="For families enrolled at the studio."
      backTo="/portal/login"
    >
      <Card style={{ maxWidth: '440px' }}>
        {step === 'details' && (
          <form onSubmit={submitDetails}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ ...bodyText, margin: 0 }}>
                Use the same email address as your <strong>Enrollio</strong>
                {' '}account — the one the studio already has for you. That is how
                we know it’s you.
              </p>
              {/* Stated as a consequence, not a rule. "Use your Enrollio email"
                  reads as a preference; "another address will not work" is the
                  thing that stops a parent typing their newer Gmail. It cannot
                  be enforced in the answer — every response to this form is
                  identical by design — so it has to be said in advance. */}
              <p style={{ ...bodyText, margin: 0, color: theme.colors.txt.tertiary }}>
                A different address will not be recognised, and no code will
                arrive. If you are not sure which one it is, ask at the front
                desk.
              </p>
              <Input
                label="Your first name"
                autoComplete="given-name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                disabled={busy}
                style={inputFontFix}
              />
              <Input
                label="Your last name"
                autoComplete="family-name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                disabled={busy}
                style={inputFontFix}
              />
              {/* Repeats the paragraph above, inside the field where the
                  mistake actually gets made — a parent who skimmed the copy
                  meets it again with their thumb on the keyboard.
                  SUPPLEMENTARY ONLY: a placeholder vanishes the moment they
                  type and is low-contrast by definition, so it can never be
                  the only place this is said. Kept short because placeholders
                  clip rather than wrap, and this field is about 290px on a
                  375px phone. */}
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                placeholder="Same as your Enrollio email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={busy}
                style={inputFontFix}
              />
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={busy}
                disabled={!firstName.trim() || !email.trim()}
              >
                Continue
              </Button>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={submitPassword}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ ...bodyText, margin: 0 }}>
                Choose a password for <strong>{email.trim().toLowerCase()}</strong>.
                At least {CLIENT_MIN_PASSWORD} characters.
              </p>
              <PasswordInput
                label="Password"
                autoComplete="new-password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                disabled={busy}
                style={inputFontFix}
              />
              <PasswordInput
                label="Confirm password"
                autoComplete="new-password"
                value={confirm}
                onChange={e => { setConfirm(e.target.value); setError(''); }}
                error={error || undefined}
                disabled={busy}
                style={inputFontFix}
              />
              <Button type="submit" variant="primary" fullWidth loading={busy}>
                Create account
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep('details')} disabled={busy}>
                Back
              </Button>
            </div>
          </form>
        )}

        {step === 'verify' && (
          <form onSubmit={submitCode}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ ...bodyText, margin: 0 }}>
                If <strong>{email.trim().toLowerCase()}</strong> is on our roster,
                a 6-digit code is on its way to it. Enter the code to finish.
              </p>
              {/* Promoted out of the muted tertiary line it used to be. On a
                  brand-new sending domain this is the single most likely thing
                  to go wrong, and a parent who does not find the email assumes
                  the app is broken rather than that their mail app filed it. */}
              <p style={{ ...bodyText, margin: 0 }}>
                <strong>Check your spam or junk folder.</strong> The code often
                lands there the first time. On a phone, look under{' '}
                <strong>All Mail</strong> or <strong>Junk</strong> as well as
                your inbox.
              </p>
              {/* There is no clock on this screen and there should not appear
                  to be one. mailer_otp_exp is 3600, so the code is good for a
                  full hour; the only countdown here is the resend cooldown,
                  and parents were reading it as a deadline to type against. */}
              <p style={{ ...bodyText, margin: 0, color: theme.colors.txt.tertiary }}>
                There is no rush — the code works for a whole hour, so you can
                go and find the email and come back. Still nothing? Make sure
                this is your Enrollio address, or ask us at the front desk.
              </p>
              <Input
                label="Code from your email"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                error={error || undefined}
                disabled={busy}
                style={{ ...inputFontFix, letterSpacing: '0.25em', fontFamily: theme.fonts.mono }}
              />
              <Button type="submit" variant="primary" fullWidth loading={busy} disabled={code.trim().length < 6}>
                Verify and log in
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleResend} disabled={cooldown > 0 || busy}>
                {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
              </Button>
            </div>
          </form>
        )}
      </Card>

      <p style={{
        ...theme.typography.body,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.secondary,
        margin: '20px 0 0',
        maxWidth: '440px',
      }}>
        Already have an account?{' '}
        <Link to="/portal/login" style={{ color: theme.colors.primary, fontWeight: 600 }}>
          Log in
        </Link>
      </p>
    </PortalLayout>
  );
};

export default PortalSignUp;
