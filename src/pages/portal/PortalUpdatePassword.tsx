import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../../theme';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import PortalLayout from '../../components/portal/PortalLayout';
import { Button, Card, Input, Spinner } from '../../components/ui';
import { logActivity } from '../../lib/activityLog';
import { CLIENT_MIN_PASSWORD } from '../../lib/clientAuth';
import { portalRoutes } from '../../lib/portal';

/**
 * Where a CLIENT password-reset email lands (/portal/update-password).
 *
 * The staff twin is src/pages/ResetPassword.tsx and the mechanics are
 * identical — detectSessionInUrl consumes the recovery token during client
 * construction, so this component only waits for the resulting session. The
 * differences are the shell (portal chrome, not the staff card), the password
 * floor (clients are 10, staff 8) and where success lands (/portal).
 *
 * This URL must be on Supabase's Auth → URL Configuration → Redirect URLs
 * allow-list or the email link falls back to the Site URL and never gets here.
 */

type Status = 'checking' | 'ready' | 'no_session' | 'saving' | 'done';

const PortalUpdatePassword: React.FC = () => {
  const navigate = useNavigate();

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
    // double-invokes effects, and the client parses the URL during
    // construction. So check directly as well.
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

    if (password.length < CLIENT_MIN_PASSWORD) {
      setError(`Password must be at least ${CLIENT_MIN_PASSWORD} characters`);
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
      details: { surface: 'portal', via: 'reset_link' },
    });

    setStatus('done');
    // updateUser leaves them signed in; straight into the portal.
    setTimeout(() => navigate(portalRoutes.home, { replace: true }), 1200);
  };

  const bodyText: React.CSSProperties = {
    ...theme.typography.body,
    fontFamily: theme.fonts.primary,
    color: theme.colors.txt.secondary,
  };

  return (
    <PortalLayout title="New password" backTo="/portal/login">
      <Card style={{ maxWidth: '440px' }}>
        {status === 'checking' && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
            <Spinner size={28} color={theme.colors.primary} />
          </div>
        )}

        {status === 'no_session' && (
          <>
            <p style={{ ...bodyText, margin: '0 0 20px' }}>
              This password reset link is no longer valid. They expire after a
              short time and can only be used once. Request a new one from the
              sign-in page.
            </p>
            <Button variant="primary" fullWidth onClick={() => navigate('/portal/login', { replace: true })}>
              Back to sign in
            </Button>
          </>
        )}

        {status === 'done' && (
          <p style={{ ...bodyText, margin: 0 }}>
            Password updated. Taking you to the portal…
          </p>
        )}

        {(status === 'ready' || status === 'saving') && (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{
                ...theme.typography.bodySmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.tertiary,
                margin: 0,
              }}>
                At least {CLIENT_MIN_PASSWORD} characters.
              </p>
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
        )}
      </Card>
    </PortalLayout>
  );
};

export default PortalUpdatePassword;
