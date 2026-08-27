import React, { useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Button } from '../ui';
import { useEvent } from '../../contexts/EventContext';
import { useToast } from '../../contexts/ToastContext';

/**
 * Whether the app can write to Google, and how to fix it when it cannot.
 *
 * WHY THIS IS VISIBLE RATHER THAN A SETTING BURIED SOMEWHERE
 *
 * Reading Google needs no credential at all — the sync pulls public iCal
 * feeds. Writing needs the studio's OAuth grant, and that grant can go away on
 * its own: revoking the app under Google Account → Security kills it, and so
 * does changing that account's password.
 *
 * When it does, every save fails. Without something on the page saying so, the
 * failure looks like the app being broken rather than a connection needing
 * five seconds of attention, and the calendar is exactly the kind of thing
 * somebody quietly stops trusting instead of reporting.
 *
 * So it renders when it has something to say and gets out of the way when it
 * does not: a healthy connection shows one muted line, not a banner.
 */

const GoogleConnectionBanner: React.FC = () => {
  const { googleConnection, refreshGoogleStatus, beginGoogleConnect } = useEvent();
  const { error: showError } = useToast();
  const [starting, setStarting] = useState(false);

  useEffect(() => { refreshGoogleStatus(); }, [refreshGoogleStatus]);

  const handleConnect = async () => {
    setStarting(true);
    try {
      const url = await beginGoogleConnect();
      // Which flow /auth/callback is about to be handling. Two live OAuth
      // journeys share that one route: this one, which stores a refresh token
      // for the whole studio, and the older per-user connect on Settings that
      // keeps tokens in the visitor's own localStorage. Same redirect URI,
      // completely different destination for the code.
      //
      // sessionStorage rather than the `state` parameter, for now: state is
      // the standard place for this and also gives CSRF protection, but it
      // means a round trip through the Edge Function to set. The `connect`
      // action requires an admin JWT regardless, which is the real gate.
      try { sessionStorage.setItem('didc_google_connect', 'studio'); } catch { /* Safari private */ }
      // A full navigation rather than a popup: Google blocks its consent screen
      // in a lot of popup contexts, and a blocked popup is a button that looks
      // broken. AuthCallback brings them back here.
      window.location.href = url;
    } catch (e: any) {
      showError(e?.message || 'Could not start the Google connection.');
      setStarting(false);
    }
  };

  // Still asking. Saying nothing beats a banner that flashes "not connected"
  // for half a second on every page load.
  if (googleConnection.state === 'loading') return null;

  // A team member. They do not manage this, so there is nothing to tell them.
  if (googleConnection.state === 'forbidden') return null;

  // Could not even ask. This used to render as nothing, which is how an admin
  // ended up hunting for a Connect button and finding the wrong one.
  if (googleConnection.state === 'failed') {
    return (
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px',
        padding: theme.spacing.md, marginBottom: theme.spacing.md,
        background: theme.colors.bg.secondary,
        border: `2px solid ${theme.colors.status.error}`,
        borderRadius: theme.borderRadius.lg,
      }}>
        <div style={{ flex: '1 1 240px', minWidth: 0, overflowWrap: 'anywhere' }}>
          <div style={{
            ...theme.typography.body, fontFamily: theme.fonts.primary,
            fontWeight: 600, color: theme.colors.txt.primary, marginBottom: '4px',
          }}>
            Could not check the Google connection
          </div>
          <div style={{
            ...theme.typography.bodySmall, fontFamily: theme.fonts.primary,
            color: theme.colors.txt.secondary,
          }}>
            {googleConnection.message} Reading the calendar still works; adding
            and editing events may not.
          </div>
        </div>
        <Button variant="secondary" onClick={() => refreshGoogleStatus()}>Try again</Button>
      </div>
    );
  }

  const googleStatus = googleConnection.status;
  const healthy = googleStatus.connected && !googleStatus.lastError;

  if (healthy) {
    return (
      <div style={{
        ...theme.typography.caption,
        fontFamily: theme.fonts.mono,
        color: theme.colors.txt.tertiary,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
        margin: '0 0 16px',
      }}>
        <span style={{
          width: '8px', height: '8px', borderRadius: theme.borderRadius.full,
          background: theme.colors.status.success, flexShrink: 0,
        }} />
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          Writing to Google as {googleStatus.email ?? 'the studio account'}
        </span>
      </div>
    );
  }

  const revoked = Boolean(googleStatus.lastError);

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '12px',
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      background: theme.colors.bg.secondary,
      border: `2px solid ${revoked ? theme.colors.status.warning : theme.colors.bdr.primary}`,
      borderRadius: theme.borderRadius.lg,
    }}>
      <div style={{ flex: '1 1 240px', minWidth: 0, overflowWrap: 'anywhere' }}>
        <div style={{
          ...theme.typography.body,
          fontFamily: theme.fonts.primary,
          fontWeight: 600,
          color: theme.colors.txt.primary,
          marginBottom: '4px',
        }}>
          {revoked ? 'Google needs reconnecting' : 'Connect Google to add events'}
        </div>
        <div style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.secondary,
        }}>
          {revoked
            ? 'The studio’s connection was revoked or expired, so saving an event will fail until it is reconnected. Reading the calendar is unaffected.'
            : 'The calendar can be read without this. Adding, editing and deleting events needs the studio Google account connected once.'}
        </div>
      </div>

      <Button variant="primary" onClick={handleConnect} loading={starting}>
        {revoked ? 'Reconnect Google' : 'Connect Google'}
      </Button>
    </div>
  );
};

export default GoogleConnectionBanner;
