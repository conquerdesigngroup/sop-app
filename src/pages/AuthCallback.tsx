/**
 * OAuth Callback Page
 * Handles the redirect from Google OAuth
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { theme } from '../theme';
import { exchangeCodeForTokens } from '../services/googleCalendar';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        setErrorMessage(error === 'access_denied'
          ? 'Access was denied. Please try again and grant the necessary permissions.'
          : `Authentication error: ${error}`
        );
        return;
      }

      if (!code) {
        setStatus('error');
        setErrorMessage('No authorization code received from Google.');
        return;
      }

      // Two OAuth journeys end here and they are not interchangeable.
      //
      //   'studio' — the Calendar page's Connect Google. The code is sent to
      //              the google-oauth function, which keeps the refresh token
      //              server-side so the app can write to Google unattended.
      //   anything else — the older per-user connect on Settings, whose tokens
      //              live in this browser's localStorage and act for one person.
      //
      // Sending a code down the wrong path does not fail loudly: it stores a
      // working connection in the wrong place, and the studio's Add Event
      // keeps reporting "Google is not connected" while Settings insists it is.
      let flow: string | null = null;
      try {
        flow = sessionStorage.getItem('didc_google_connect');
        sessionStorage.removeItem('didc_google_connect');
      } catch {
        /* Safari private mode; falls through to the per-user flow */
      }

      try {
        if (flow === 'studio') {
          if (!isSupabaseConfigured() || !supabase) {
            throw new Error('The app is not connected to its database.');
          }
          const { data, error: fnError } = await supabase.functions.invoke('google-oauth', {
            body: {
              action: 'connect',
              code,
              // Must be byte-identical to the one the authorization used, or
              // Google rejects the exchange with redirect_uri_mismatch.
              redirectUri: `${window.location.origin}/auth/callback`,
            },
          });
          if (fnError) {
            let message = fnError.message || 'Google refused the connection.';
            try {
              const payload = await (fnError as any).context?.json?.();
              if (payload?.error) {
                message = payload.description
                  ? `${payload.error} ${payload.description}`
                  : payload.error;
              }
            } catch { /* keep the generic message */ }
            throw new Error(message);
          }
          if (!data?.connected) throw new Error('Google did not complete the connection.');

          setStatus('success');
          setTimeout(() => navigate('/calendar', { replace: true }), 1200);
          return;
        }

        const tokens = await exchangeCodeForTokens(code);

        if (tokens) {
          setStatus('success');
          // Redirect to calendar page after short delay
          setTimeout(() => {
            navigate('/calendar', { replace: true });
          }, 1500);
        } else {
          setStatus('error');
          setErrorMessage('Failed to exchange authorization code for tokens.');
        }
      } catch (err: any) {
        setStatus('error');
        // The function's own sentence, when there is one — "Google did not
        // return a refresh token" tells the studio what to do next in a way
        // that "an unexpected error occurred" never will.
        setErrorMessage(err?.message || 'An unexpected error occurred during authentication.');
        console.error('Auth callback error:', err);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {status === 'loading' && (
          <>
            <div style={styles.spinner} />
            <h2 style={styles.title}>Connecting to Google Calendar</h2>
            <p style={styles.message}>Please wait while we complete the authentication...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={styles.successIcon}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.success} strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 style={styles.title}>Connected Successfully!</h2>
            <p style={styles.message}>Your Google Calendar has been connected. Redirecting...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={styles.errorIcon}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.error} strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2 style={styles.title}>Connection Failed</h2>
            <p style={styles.errorMessage}>{errorMessage}</p>
            <button
              onClick={() => navigate('/calendar', { replace: true })}
              style={styles.button}
            >
              Return to Calendar
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100dvh',
    backgroundColor: theme.colors.background,
    // index.html sets viewport-fit=cover, so the page deliberately runs under the
    // notch and the home indicator. index.css insets body left and right only,
    // and this page renders without Navigation — nothing else adds the top or
    // bottom. Without these the first element sits behind the clock.
    // Longhand throughout: mixing `padding` with `paddingTop` is the conflicting
    // -style warning this file already avoids further down.
    paddingTop: 'calc(20px + env(safe-area-inset-top))',
    paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
    paddingLeft: '20px',
    paddingRight: '20px',
  },
  card: {
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.borderRadius.lg,
    padding: '48px',
    textAlign: 'center',
    maxWidth: '400px',
    width: '100%',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: `4px solid ${theme.colors.border}`,
    borderTopColor: theme.colors.primary,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 24px',
  },
  successIcon: {
    marginBottom: '24px',
  },
  errorIcon: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    marginBottom: '12px',
  },
  message: {
    fontSize: '16px',
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
  },
  errorMessage: {
    fontSize: '16px',
    color: theme.colors.status.error,
    lineHeight: 1.5,
    marginBottom: '24px',
  },
  button: {
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
};

// Add keyframes for spinner animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default AuthCallback;
