import React, { useState } from 'react';
import { theme } from '../theme';
import {
  runAllIntegrityChecks,
  autoFixIssues,
  IntegrityCheckResult,
  IntegrityIssue,
} from '../services/dataIntegrityAgent';

const DataIntegrityPanel: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [result, setResult] = useState<IntegrityCheckResult | null>(null);
  const [lastFixResult, setLastFixResult] = useState<{ fixed: number; failed: number } | null>(null);

  const handleRunChecks = async () => {
    setIsRunning(true);
    setLastFixResult(null);
    try {
      const checkResult = await runAllIntegrityChecks();
      setResult(checkResult);
    } catch (err) {
      console.error('Error running integrity checks:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleAutoFix = async () => {
    if (!result) return;

    setIsFixing(true);
    try {
      const fixResult = await autoFixIssues(result.issues);
      setLastFixResult(fixResult);

      // Re-run checks after fixing
      const newResult = await runAllIntegrityChecks();
      setResult(newResult);
    } catch (err) {
      console.error('Error auto-fixing issues:', err);
    } finally {
      setIsFixing(false);
    }
  };

  const getIssueIcon = (type: IntegrityIssue['type']) => {
    switch (type) {
      case 'error':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.error} strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        );
      case 'warning':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.warning} strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case 'info':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.info} strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        );
    }
  };

  const getCategoryBadge = (category: IntegrityIssue['category']) => {
    const colors: Record<string, string> = {
      task: theme.colors.primary,
      sop: theme.colors.status.info,
      user: theme.colors.status.warning,
      system: theme.colors.status.error,
    };

    return (
      <span
        style={{
          ...styles.categoryBadge,
          backgroundColor: `${colors[category]}20`,
          color: colors[category],
        }}
      >
        {category.toUpperCase()}
      </span>
    );
  };

  const fixableCount = result?.issues.filter(i => i.autoFixable).length || 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.colors.primary} strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <div>
            <h3 style={styles.title}>Data Integrity Agent</h3>
            <p style={styles.subtitle}>Detect and fix data inconsistencies across the system</p>
          </div>
        </div>
        <button
          onClick={handleRunChecks}
          disabled={isRunning}
          style={{
            ...styles.primaryButton,
            opacity: isRunning ? 0.7 : 1,
          }}
        >
          {isRunning ? (
            <>
              <span style={styles.spinner} />
              Running Checks...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-9-9" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              Run All Checks
            </>
          )}
        </button>
      </div>

      {result && (
        <>
          {/* Summary */}
          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <span style={styles.summaryValue}>{result.checksRun.length}</span>
              <span style={styles.summaryLabel}>Checks Run</span>
            </div>
            <div style={{ ...styles.summaryCard, borderColor: theme.colors.status.error }}>
              <span style={{ ...styles.summaryValue, color: theme.colors.status.error }}>
                {result.errors}
              </span>
              <span style={styles.summaryLabel}>Errors</span>
            </div>
            <div style={{ ...styles.summaryCard, borderColor: theme.colors.status.warning }}>
              <span style={{ ...styles.summaryValue, color: theme.colors.status.warning }}>
                {result.warnings}
              </span>
              <span style={styles.summaryLabel}>Warnings</span>
            </div>
            <div style={{ ...styles.summaryCard, borderColor: theme.colors.status.success }}>
              <span style={{ ...styles.summaryValue, color: theme.colors.status.success }}>
                {result.duration}ms
              </span>
              <span style={styles.summaryLabel}>Duration</span>
            </div>
          </div>

          {/* Auto-fix button */}
          {fixableCount > 0 && (
            <div style={styles.fixSection}>
              <div style={styles.fixInfo}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.info} strokeWidth="2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                <span>{fixableCount} issue(s) can be automatically fixed</span>
              </div>
              <button
                onClick={handleAutoFix}
                disabled={isFixing}
                style={{
                  ...styles.fixButton,
                  opacity: isFixing ? 0.7 : 1,
                }}
              >
                {isFixing ? (
                  <>
                    <span style={styles.spinner} />
                    Fixing...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    Auto-Fix All
                  </>
                )}
              </button>
            </div>
          )}

          {/* Fix result message */}
          {lastFixResult && (
            <div style={styles.fixResultMessage}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.success} strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>
                Fixed {lastFixResult.fixed} issue(s)
                {lastFixResult.failed > 0 && `, ${lastFixResult.failed} failed`}
              </span>
            </div>
          )}

          {/* Issues list */}
          {result.issues.length === 0 ? (
            <div style={styles.noIssues}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.success} strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <h4>All Clear!</h4>
              <p>No data integrity issues detected.</p>
            </div>
          ) : (
            <div style={styles.issuesList}>
              <h4 style={styles.issuesTitle}>Issues Found ({result.issues.length})</h4>
              {result.issues.map((issue) => (
                <div key={issue.id} style={styles.issueCard}>
                  <div style={styles.issueHeader}>
                    {getIssueIcon(issue.type)}
                    <span style={styles.issueTitle}>{issue.title}</span>
                    {getCategoryBadge(issue.category)}
                    {issue.autoFixable && (
                      <span style={styles.autoFixBadge}>Auto-fixable</span>
                    )}
                  </div>
                  <p style={styles.issueDescription}>{issue.description}</p>
                  {issue.affectedRecords.length > 0 && (
                    <div style={styles.affectedRecords}>
                      <span style={styles.affectedLabel}>Affected:</span>
                      <span style={styles.affectedCount}>
                        {issue.affectedRecords.length} record(s)
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Last run info */}
          <div style={styles.lastRun}>
            Last checked: {new Date(result.timestamp).toLocaleString()}
          </div>
        </>
      )}

      {!result && !isRunning && (
        <div style={styles.emptyState}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h4>Run Integrity Checks</h4>
          <p>Click the button above to scan your data for inconsistencies and potential issues.</p>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.bdr.primary}`,
    padding: theme.spacing.lg,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.md,
    flexWrap: 'wrap' as const,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: theme.colors.txt.secondary,
    margin: `${theme.spacing.xs} 0 0 0`,
  },
  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
    backgroundColor: theme.colors.primary,
    color: '#fff',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  summaryCard: {
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    textAlign: 'center' as const,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  summaryValue: {
    display: 'block',
    fontSize: '24px',
    fontWeight: 700,
    color: theme.colors.txt.primary,
  },
  summaryLabel: {
    display: 'block',
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
    marginTop: theme.spacing.xs,
  },
  fixSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    border: `1px solid ${theme.colors.status.info}`,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    flexWrap: 'wrap' as const,
    gap: theme.spacing.md,
  },
  fixInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    color: theme.colors.status.info,
    fontSize: '14px',
  },
  fixButton: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    backgroundColor: theme.colors.status.success,
    color: '#fff',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  fixResultMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    border: `1px solid ${theme.colors.status.success}`,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    color: theme.colors.status.success,
    fontSize: '14px',
  },
  issuesList: {
    marginTop: theme.spacing.lg,
  },
  issuesTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
    marginBottom: theme.spacing.md,
  },
  issueCard: {
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  issueHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    flexWrap: 'wrap' as const,
  },
  issueTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    flex: 1,
  },
  categoryBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: theme.borderRadius.sm,
    textTransform: 'uppercase' as const,
  },
  autoFixBadge: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    color: theme.colors.status.success,
  },
  issueDescription: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
    margin: 0,
    lineHeight: '1.5',
  },
  affectedRecords: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    fontSize: '12px',
  },
  affectedLabel: {
    color: theme.colors.txt.tertiary,
  },
  affectedCount: {
    color: theme.colors.txt.secondary,
    fontWeight: 500,
  },
  noIssues: {
    textAlign: 'center' as const,
    padding: theme.spacing.xl,
    color: theme.colors.status.success,
  },
  lastRun: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
    textAlign: 'right' as const,
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: theme.spacing.xl,
    color: theme.colors.txt.tertiary,
  },
};

// Add keyframes for spinner animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
if (!document.head.querySelector('style[data-integrity-panel]')) {
  styleSheet.setAttribute('data-integrity-panel', 'true');
  document.head.appendChild(styleSheet);
}

export default DataIntegrityPanel;
