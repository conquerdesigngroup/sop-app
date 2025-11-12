import React, { Component, ErrorInfo, ReactNode } from 'react';
import { theme } from '../theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.iconContainer}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.error} strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>

            <h1 style={styles.title}>Oops! Something went wrong</h1>

            <p style={styles.description}>
              We encountered an unexpected error. Don't worry, your data is safe.
            </p>

            {this.state.error && (
              <div style={styles.errorDetails}>
                <h3 style={styles.errorTitle}>Error Details:</h3>
                <pre style={styles.errorMessage}>
                  {this.state.error.toString()}
                </pre>
                {this.state.errorInfo && (
                  <details style={styles.stackTrace}>
                    <summary style={styles.stackTraceSummary}>
                      Stack Trace (for developers)
                    </summary>
                    <pre style={styles.stackTraceContent}>
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div style={styles.actions}>
              <button onClick={this.handleReset} style={styles.resetButton}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Return to Home
              </button>
              <button
                onClick={() => window.location.reload()}
                style={styles.reloadButton}
              >
                Reload Page
              </button>
            </div>

            <p style={styles.footer}>
              If this problem persists, please contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    padding: '20px',
  },
  card: {
    maxWidth: '600px',
    width: '100%',
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '40px',
    textAlign: 'center',
  },
  iconContainer: {
    marginBottom: '24px',
    display: 'flex',
    justifyContent: 'center',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: '16px',
  },
  description: {
    fontSize: '16px',
    color: theme.colors.textSecondary,
    marginBottom: '32px',
    lineHeight: '1.6',
  },
  errorDetails: {
    textAlign: 'left',
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    padding: '20px',
    marginBottom: '24px',
  },
  errorTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: '12px',
  },
  errorMessage: {
    fontSize: '13px',
    color: theme.colors.error,
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  },
  stackTrace: {
    marginTop: '16px',
  },
  stackTraceSummary: {
    fontSize: '13px',
    fontWeight: '600',
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    marginBottom: '8px',
  },
  stackTraceContent: {
    fontSize: '12px',
    color: theme.colors.textSecondary,
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '200px',
    overflow: 'auto',
    marginTop: '8px',
    padding: '12px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: theme.borderRadius.sm,
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  resetButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: '700',
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  reloadButton: {
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: '600',
    backgroundColor: 'transparent',
    color: theme.colors.textSecondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  footer: {
    fontSize: '13px',
    color: theme.colors.textSecondary,
    margin: 0,
  },
};

export default ErrorBoundary;
