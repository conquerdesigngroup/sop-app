import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../theme';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';
import { useResponsive } from '../hooks/useResponsive';
import { Button, Card, Input, Spinner } from '../components/ui';

/**
 * Where a password-reset email lands.
 *
 * The link carries a recovery token. The Supabase client is configured with
 * detectSessionInUrl: true, so it consumes that token on load and emits
 * PASSWORD_RECOVERY — at which point there is a real (if narrow) session and
 * updateUser({ password }) will work.
 *
 * The token can arrive two ways depending on the project's auth flow: in the
 * URL fragment (implicit) or as ?code= (PKCE). Both are handled by the client
 * itself; this component only waits for the resulting session, which is why it
 * listens for the event AND polls getSession() once rather than parsing the URL.
 *
 * Reaching here without a valid token is normal — an expired link, or someone
 * opening the URL directly — and says so instead of showing a form that cannot
 * work.
 */

type Status = 'checking' | 'ready' | 'no_session' | 'saving' | 'done';

const MIN_PASSWORD = 8;

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const { isMobileOrTablet } = useResponsive();

  const [status, setStatus] = useState<Status>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setStatus('no_session');
      return;
    }

    let settled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        settled = true;
        setStatus('ready');
      }
    });

    // The event may already have fired before this effect ran — StrictMode
    // double-invokes effects in development, and the client parses the URL
    // during construction. So check directly as well.
    supabase.auth.getSession().then(({ data }: any) => {
      if (settled) return;
      settled = true;
      setStatus(data?.session ? 'ready' : 'no_session');
    });

    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setStatus('saving');
    const { data, error: updateErr } = await supabase.auth.updateUser({ password });

    if (updateErr) {
      setError(updateErr.message || 'Could not update your password');
      setStatus('ready');
      return;
    }

    void logActivity({
      action: 'user_password_changed',
      entityType: 'user',
      entityId: data?.user?.id,
      details: { surface: 'staff', via: 'reset_link' },
    });

    setStatus('done');
    // Straight to the dashboard: updateUser leaves them signed in, so bouncing
    // them to /login only to sign in again would be theatre.
    setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
  };

  const shell = (children: React.ReactNode) => (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // See Login.tsx: viewport-fit=cover means the top and bottom insets are
        // this page's own responsibility.
        paddingTop: `calc(${isMobileOrTablet ? '24px' : '40px'} + env(safe-area-inset-top))`,
        paddingBottom: `calc(${isMobileOrTablet ? '24px' : '40px'} + env(safe-area-inset-bottom))`,
        paddingLeft: isMobileOrTablet ? '16px' : '40px',
        paddingRight: isMobileOrTablet ? '16px' : '40px',
        textAlign: 'left',
      }}
    >
      <div style={{ width: '100%', maxWidth: '420px' }}>{children}</div>
    </div>
  );

  if (status === 'checking') {
    return shell(
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <Spinner size={32} color={theme.colors.primary} />
      </div>
    );
  }

  if (status === 'no_session') {
    return shell(
      <Card>
        <h1 style={{ ...theme.typography.h3, color: theme.colors.txt.primary, margin: '0 0 12px' }}>
          Link expired
        </h1>
        <p
          style={{
            ...theme.typography.body,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.secondary,
            margin: '0 0 24px',
          }}
        >
          This password reset link is no longer valid. They expire after a short
          time and can only be used once. Request a new one from the sign-in page.
        </p>
        <Button variant="primary" fullWidth onClick={() => navigate('/login', { replace: true })}>
          Back to sign in
        </Button>
      </Card>
    );
  }

  if (status === 'done') {
    return shell(
      <Card>
        <h1 style={{ ...theme.typography.h3, color: theme.colors.txt.primary, margin: '0 0 12px' }}>
          Password updated
        </h1>
        <p
          style={{
            ...theme.typography.body,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.secondary,
            margin: 0,
          }}
        >
          Taking you to your dashboard…
        </p>
      </Card>
    );
  }

  return shell(
    <Card>
      <h1 style={{ ...theme.typography.h3, color: theme.colors.txt.primary, margin: '0 0 8px' }}>
        Set a new password
      </h1>
      <p
        style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          margin: '0 0 24px',
        }}
      >
        At least {MIN_PASSWORD} characters.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={status === 'saving'}
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            error={error || undefined}
            disabled={status === 'saving'}
          />
          <Button type="submit" variant="primary" fullWidth loading={status === 'saving'}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default ResetPassword;
