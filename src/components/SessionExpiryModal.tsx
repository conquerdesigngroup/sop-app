import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../theme';

const SessionExpiryModal: React.FC = () => {
  const { sessionExpiryWarning, extendSession, logout } = useAuth();
  const [countdown, setCountdown] = useState(300); // 5 minutes in seconds

  useEffect(() => {
    if (!sessionExpiryWarning) {
      setCountdown(300);
      return;
    }

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionExpiryWarning]);

  if (!sessionExpiryWarning) return null;

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.iconContainer}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.warning} strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
        </div>

        <h2 style={styles.title}>Session Expiring Soon</h2>

        <p style={styles.message}>
          Your session will expire in <span style={styles.countdown}>{timeDisplay}</span> due to inactivity.
        </p>

        <p style={styles.subMessage}>
          Would you like to continue your session?
        </p>

        <div style={styles.buttonContainer}>
          <button
            onClick={logout}
            style={styles.logoutButton}
          >
            Log Out Now
          </button>
          <button
            onClick={extendSession}
            style={styles.extendButton}
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: theme.spacing.md,
  },
  modal: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xxl,
    maxWidth: '420px',
    width: '100%',
    textAlign: 'center',
    boxShadow: theme.shadows.xl,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  iconContainer: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: '22px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.md,
  },
  message: {
    fontSize: '15px',
    color: theme.colors.txt.secondary,
    marginBottom: theme.spacing.sm,
    lineHeight: 1.5,
  },
  countdown: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.status.warning,
  },
  subMessage: {
    fontSize: '14px',
    color: theme.colors.txt.tertiary,
    marginBottom: theme.spacing.xl,
  },
  buttonContainer: {
    display: 'flex',
    gap: theme.spacing.md,
    justifyContent: 'center',
  },
  logoutButton: {
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.secondary,
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  extendButton: {
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    backgroundColor: theme.colors.primary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};

export default SessionExpiryModal;
