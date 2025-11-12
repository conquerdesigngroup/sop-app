import React, { useState } from 'react';
import { theme } from '../theme';
import { SOP } from '../types';

interface SOPViewerProps {
  sop: SOP;
  onClose: () => void;
  embedded?: boolean; // When true, shows compact version for job detail page
}

const SOPViewer: React.FC<SOPViewerProps> = ({ sop, onClose, embedded = false }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const currentStep = sop.steps[currentStepIndex];
  const progress = ((completedSteps.size / sop.steps.length) * 100).toFixed(0);

  const toggleStepComplete = (index: number) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(index)) {
      newCompleted.delete(index);
    } else {
      newCompleted.add(index);
    }
    setCompletedSteps(newCompleted);
  };

  const nextStep = () => {
    if (currentStepIndex < sop.steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const prevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const goToStep = (index: number) => {
    setCurrentStepIndex(index);
  };

  if (embedded) {
    return (
      <div style={styles.embeddedContainer}>
        <div style={styles.embeddedHeader}>
          <h4 style={styles.embeddedTitle}>{sop.title}</h4>
          <div style={styles.embeddedProgress}>
            {completedSteps.size} / {sop.steps.length} completed
          </div>
        </div>
        <p style={styles.embeddedDescription}>{sop.description}</p>

        <div style={styles.embeddedStepList}>
          {sop.steps.map((step, index) => (
            <div
              key={step.id}
              style={{
                ...styles.embeddedStep,
                ...(completedSteps.has(index) ? styles.embeddedStepCompleted : {}),
              }}
            >
              <input
                type="checkbox"
                checked={completedSteps.has(index)}
                onChange={() => toggleStepComplete(index)}
                style={styles.embeddedCheckbox}
              />
              <div style={styles.embeddedStepContent}>
                <div style={styles.embeddedStepTitle}>
                  {index + 1}. {step.title}
                </div>
                <div style={styles.embeddedStepDescription}>{step.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <button onClick={onClose} style={styles.backButton}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div style={styles.category}>{sop.category}</div>
      </div>

      <div style={styles.header}>
        <h1 style={styles.title}>{sop.title}</h1>
        <p style={styles.description}>{sop.description}</p>

        {sop.imageUrl && (
          <div style={styles.coverImageContainer}>
            <img src={sop.imageUrl} alt={sop.title} style={styles.coverImage} />
          </div>
        )}

        {sop.tags && sop.tags.length > 0 && (
          <div style={styles.tags}>
            {sop.tags.map((tag, index) => (
              <span key={index} style={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={styles.progressSection}>
        <div style={styles.progressInfo}>
          <span style={styles.progressLabel}>Progress</span>
          <span style={styles.progressPercent}>{progress}%</span>
        </div>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${progress}%`,
            }}
          />
        </div>
        <div style={styles.progressText}>
          {completedSteps.size} of {sop.steps.length} steps completed
        </div>
      </div>

      <div style={styles.content}>
        <div style={styles.sidebar}>
          <h3 style={styles.sidebarTitle}>Steps</h3>
          {sop.steps.map((step, index) => (
            <div
              key={step.id}
              onClick={() => goToStep(index)}
              style={{
                ...styles.sidebarStep,
                ...(index === currentStepIndex ? styles.sidebarStepActive : {}),
              }}
            >
              <div
                style={{
                  ...styles.sidebarStepNumber,
                  ...(completedSteps.has(index) ? styles.sidebarStepNumberCompleted : {}),
                  ...(index === currentStepIndex ? styles.sidebarStepNumberActive : {}),
                }}
              >
                {completedSteps.has(index) ? '✓' : index + 1}
              </div>
              <div style={styles.sidebarStepTitle}>{step.title}</div>
            </div>
          ))}
        </div>

        <div style={styles.mainContent}>
          <div style={styles.stepCard}>
            <div style={styles.stepHeader}>
              <div style={styles.stepNumberLarge}>
                Step {currentStepIndex + 1} of {sop.steps.length}
              </div>
              <button
                onClick={() => toggleStepComplete(currentStepIndex)}
                style={{
                  ...styles.completeButton,
                  ...(completedSteps.has(currentStepIndex) ? styles.completeButtonActive : {}),
                }}
              >
                {completedSteps.has(currentStepIndex) ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Completed
                  </>
                ) : (
                  'Mark Complete'
                )}
              </button>
            </div>

            <h2 style={styles.stepTitle}>{currentStep.title}</h2>

            {currentStep.imageUrl && (
              <img src={currentStep.imageUrl} alt={currentStep.title} style={styles.stepImage} />
            )}

            <div style={styles.stepDescription}>
              {currentStep.description}
            </div>

            <div style={styles.navigation}>
              <button
                onClick={prevStep}
                disabled={currentStepIndex === 0}
                style={{
                  ...styles.navButton,
                  opacity: currentStepIndex === 0 ? 0.3 : 1,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Previous
              </button>
              <button
                onClick={nextStep}
                disabled={currentStepIndex === sop.steps.length - 1}
                style={{
                  ...styles.navButton,
                  ...styles.navButtonNext,
                  opacity: currentStepIndex === sop.steps.length - 1 ? 0.3 : 1,
                }}
              >
                Next
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '40px',
    maxWidth: '1400px',
    margin: '0 auto',
    minHeight: '100vh',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textSecondary,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  category: {
    fontSize: '12px',
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '6px 14px',
    backgroundColor: 'rgba(211, 222, 40, 0.1)',
    borderRadius: theme.borderRadius.full,
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '36px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: '12px',
  },
  description: {
    fontSize: '18px',
    color: theme.colors.textSecondary,
    lineHeight: '1.6',
    marginBottom: '16px',
  },
  coverImageContainer: {
    marginTop: '20px',
    marginBottom: '20px',
  },
  coverImage: {
    width: '100%',
    maxHeight: '400px',
    objectFit: 'cover',
    borderRadius: theme.borderRadius.lg,
    border: `2px solid ${theme.colors.border}`,
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tag: {
    fontSize: '13px',
    padding: '6px 12px',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    color: theme.colors.textSecondary,
    borderRadius: theme.borderRadius.full,
    fontWeight: '600',
  },
  progressSection: {
    marginBottom: '32px',
    padding: '20px',
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
  },
  progressInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  progressLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  progressPercent: {
    fontSize: '24px',
    fontWeight: '800',
    color: theme.colors.primary,
  },
  progressBar: {
    height: '12px',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
    marginBottom: '8px',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  content: {
    display: 'grid',
    gridTemplateColumns: '300px 1fr',
    gap: '32px',
  },
  sidebar: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '20px',
    height: 'fit-content',
    position: 'sticky',
    top: '20px',
  },
  sidebarTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: '16px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  sidebarStep: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    marginBottom: '8px',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  sidebarStepActive: {
    backgroundColor: theme.colors.background,
  },
  sidebarStepNumber: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '700',
    color: theme.colors.textSecondary,
    flexShrink: 0,
  },
  sidebarStepNumberCompleted: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    color: theme.colors.background,
  },
  sidebarStepNumberActive: {
    borderColor: theme.colors.primary,
    color: theme.colors.primary,
  },
  sidebarStepTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: theme.colors.textPrimary,
    lineHeight: '1.4',
  },
  mainContent: {
    flex: 1,
  },
  stepCard: {
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: '32px',
  },
  stepHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  stepNumberLarge: {
    fontSize: '14px',
    fontWeight: '700',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  completeButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textSecondary,
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  completeButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    color: theme.colors.background,
  },
  stepTitle: {
    fontSize: '28px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: '24px',
  },
  stepImage: {
    width: '100%',
    maxHeight: '400px',
    objectFit: 'contain',
    borderRadius: theme.borderRadius.md,
    border: `2px solid ${theme.colors.border}`,
    marginBottom: '24px',
  },
  stepDescription: {
    fontSize: '16px',
    color: theme.colors.textSecondary,
    lineHeight: '1.8',
    marginBottom: '24px',
    whiteSpace: 'pre-wrap',
  },
  navigation: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'space-between',
  },
  navButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '14px 24px',
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textSecondary,
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    flex: 1,
  },
  navButtonNext: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    color: theme.colors.background,
    justifyContent: 'center',
  },
  // Embedded styles
  embeddedContainer: {
    padding: '20px',
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    marginTop: '24px',
  },
  embeddedHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  embeddedTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    margin: 0,
  },
  embeddedProgress: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  embeddedDescription: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    marginBottom: '16px',
  },
  embeddedStepList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  embeddedStep: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    backgroundColor: theme.colors.background,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
  },
  embeddedStepCompleted: {
    opacity: 0.6,
  },
  embeddedCheckbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
    flexShrink: 0,
    marginTop: '2px',
  },
  embeddedStepContent: {
    flex: 1,
  },
  embeddedStepTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: '4px',
  },
  embeddedStepDescription: {
    fontSize: '13px',
    color: theme.colors.textSecondary,
    lineHeight: '1.6',
  },
};

export default SOPViewer;
