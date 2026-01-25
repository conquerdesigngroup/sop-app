/**
 * Google Calendar Connection Component
 * Displays connection status and allows connecting/disconnecting Google Calendar
 */

import React from 'react';
import { theme } from '../theme';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';

interface GoogleCalendarConnectProps {
  compact?: boolean;
}

const GoogleCalendarConnect: React.FC<GoogleCalendarConnectProps> = ({ compact = false }) => {
  const { isConnected, isLoading, userInfo, connect, disconnect } = useGoogleCalendar();

  if (isLoading) {
    return (
      <div style={compact ? styles.compactContainer : styles.container}>
        <div style={styles.loadingSpinner} />
        <span style={styles.loadingText}>Checking connection...</span>
      </div>
    );
  }

  if (isConnected && userInfo) {
    return (
      <div style={compact ? styles.compactContainer : styles.container}>
        <div style={styles.connectedSection}>
          <div style={styles.connectedHeader}>
            <div style={styles.googleIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </div>
            <div style={styles.connectedInfo}>
              <span style={styles.connectedLabel}>Google Calendar Connected</span>
              <span style={styles.connectedEmail}>{userInfo.email}</span>
            </div>
            <div style={styles.connectedBadge}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          {!compact && (
            <p style={styles.connectedDescription}>
              Your events and tasks will sync automatically with your Google Calendar.
            </p>
          )}
          <button onClick={disconnect} style={styles.disconnectButton} className="btn-hover">
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={compact ? styles.compactContainer : styles.container}>
      <div style={styles.disconnectedSection}>
        <div style={styles.disconnectedHeader}>
          <div style={styles.googleIconLarge}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke={theme.colors.textMuted} strokeWidth="1.5" fill="none"/>
              <line x1="16" y1="2" x2="16" y2="6" stroke={theme.colors.textMuted} strokeWidth="1.5"/>
              <line x1="8" y1="2" x2="8" y2="6" stroke={theme.colors.textMuted} strokeWidth="1.5"/>
              <line x1="3" y1="10" x2="21" y2="10" stroke={theme.colors.textMuted} strokeWidth="1.5"/>
            </svg>
          </div>
          {!compact && (
            <div style={styles.disconnectedInfo}>
              <h3 style={styles.disconnectedTitle}>Connect Google Calendar</h3>
              <p style={styles.disconnectedDescription}>
                Sync your events and tasks with Google Calendar for seamless scheduling across all your devices.
              </p>
            </div>
          )}
        </div>
        <button onClick={connect} style={styles.connectButton} className="btn-hover btn-secondary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Connect with Google
        </button>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.borderRadius.lg,
    padding: '24px',
    border: `1px solid ${theme.colors.border}`,
  },
  compactContainer: {
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.borderRadius.md,
    padding: '16px',
    border: `1px solid ${theme.colors.border}`,
  },
  loadingSpinner: {
    width: '20px',
    height: '20px',
    border: `2px solid ${theme.colors.border}`,
    borderTopColor: theme.colors.primary,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    display: 'inline-block',
    marginRight: '12px',
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: '14px',
  },
  connectedSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  connectedHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  googleIcon: {
    width: '40px',
    height: '40px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectedInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  connectedLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  connectedEmail: {
    fontSize: '13px',
    color: theme.colors.textSecondary,
  },
  connectedBadge: {
    width: '24px',
    height: '24px',
    backgroundColor: theme.colors.status.success,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#FFFFFF',
  },
  connectedDescription: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
    margin: 0,
  },
  disconnectButton: {
    alignSelf: 'flex-start',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.bdr.secondary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.secondary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  disconnectedSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  disconnectedHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
  },
  googleIconLarge: {
    width: '56px',
    height: '56px',
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  disconnectedInfo: {
    flex: 1,
  },
  disconnectedTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    margin: '0 0 8px 0',
  },
  disconnectedDescription: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
    margin: 0,
  },
  connectButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: 600,
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.secondary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

export default GoogleCalendarConnect;
