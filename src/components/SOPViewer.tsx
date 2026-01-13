import React, { useState } from 'react';
import { theme } from '../theme';
import { SOP } from '../types';
import { useResponsive } from '../hooks/useResponsive';
import { CustomCheckbox } from './CustomCheckbox';

interface SOPViewerProps {
  sop: SOP;
  onClose: () => void;
  embedded?: boolean; // When true, shows compact version for job detail page
}

const SOPViewer: React.FC<SOPViewerProps> = ({ sop, onClose, embedded = false }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const { isMobileOrTablet } = useResponsive();

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
      <div style={isMobileOrTablet ? styles.embeddedContainerMobile : styles.embeddedContainer}>
        <div style={styles.embeddedHeader}>
          <h4 style={isMobileOrTablet ? styles.embeddedTitleMobile : styles.embeddedTitle}>{sop.title}</h4>
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
                ...(isMobileOrTablet ? styles.embeddedStepMobile : styles.embeddedStep),
                ...(completedSteps.has(index) ? styles.embeddedStepCompleted : {}),
              }}
            >
              <CustomCheckbox
                checked={completedSteps.has(index)}
                onChange={() => toggleStepComplete(index)}
                label=""
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
    <div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
      <div style={isMobileOrTablet ? styles.topBarMobile : styles.topBar}>
        <button onClick={onClose} style={isMobileOrTablet ? styles.backButtonMobile : styles.backButton}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {!isMobileOrTablet && 'Back'}
        </button>
        <div style={isMobileOrTablet ? styles.categoryMobile : styles.category}>{sop.category}</div>
      </div>

      <div style={isMobileOrTablet ? styles.headerMobile : styles.header}>
        <h1 style={isMobileOrTablet ? styles.titleMobile : styles.title}>{sop.title}</h1>
        <p style={isMobileOrTablet ? styles.descriptionMobile : styles.description}>{sop.description}</p>

        {sop.imageUrl && (
          <div style={styles.coverImageContainer}>
            <img src={sop.imageUrl} alt={sop.title} style={isMobileOrTablet ? styles.coverImageMobile : styles.coverImage} />
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

      <div style={isMobileOrTablet ? styles.progressSectionMobile : styles.progressSection}>
        <div style={styles.progressInfo}>
          <span style={styles.progressLabel}>Progress</span>
          <span style={isMobileOrTablet ? styles.progressPercentMobile : styles.progressPercent}>{progress}%</span>
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

      <div style={isMobileOrTablet ? styles.contentMobile : styles.content}>
        {!isMobileOrTablet && (
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
        )}

        <div style={styles.mainContent}>
          <div style={isMobileOrTablet ? styles.stepCardMobile : styles.stepCard}>
            <div style={isMobileOrTablet ? styles.stepHeaderMobile : styles.stepHeader}>
              <div style={styles.stepNumberLarge}>
                Step {currentStepIndex + 1} of {sop.steps.length}
              </div>
              <button
                onClick={() => toggleStepComplete(currentStepIndex)}
                style={{
                  ...(isMobileOrTablet ? styles.completeButtonMobile : styles.completeButton),
                  ...(completedSteps.has(currentStepIndex) ? styles.completeButtonActive : {}),
                }}
              >
                {completedSteps.has(currentStepIndex) ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {!isMobileOrTablet && 'Completed'}
                  </>
                ) : (
                  <>
                    {isMobileOrTablet ? 'Complete' : 'Mark Complete'}
                  </>
                )}
              </button>
            </div>

            <h2 style={isMobileOrTablet ? styles.stepTitleMobile : styles.stepTitle}>{currentStep.title}</h2>

            {currentStep.imageUrl && (
              <img src={currentStep.imageUrl} alt={currentStep.title} style={isMobileOrTablet ? styles.stepImageMobile : styles.stepImage} />
            )}

            <div style={isMobileOrTablet ? styles.stepDescriptionMobile : styles.stepDescription}>
              {currentStep.description}
            </div>

            <div style={isMobileOrTablet ? styles.navigationMobile : styles.navigation}>
              <button
                onClick={prevStep}
                disabled={currentStepIndex === 0}
                style={{
                  ...(isMobileOrTablet ? styles.navButtonMobile : styles.navButton),
                  opacity: currentStepIndex === 0 ? 0.3 : 1,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                {!isMobileOrTablet && 'Previous'}
              </button>
              <button
                onClick={nextStep}
                disabled={currentStepIndex === sop.steps.length - 1}
                style={{
                  ...(isMobileOrTablet ? styles.navButtonMobile : styles.navButton),
                  ...(isMobileOrTablet ? styles.navButtonNextMobile : styles.navButtonNext),
                  opacity: currentStepIndex === sop.steps.length - 1 ? 0.3 : 1,
                }}
              >
                {!isMobileOrTablet && 'Next'}
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
  containerMobile: {
    padding: '0',
    maxWidth: '100%',
    margin: '0',
    minHeight: '100vh',
    position: 'fixed',
    top: '60px', // Add space for the navigation header
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background,
    overflowY: 'auto',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  topBarMobile: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    backgroundColor: theme.colors.cardBackground,
    borderBottom: `2px solid ${theme.colors.border}`,
    position: 'sticky',
    top: 0,
    zIndex: 10,
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
  backButtonMobile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '44px',
    minHeight: '44px',
    padding: '10px',
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textSecondary,
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
  categoryMobile: {
    fontSize: '11px',
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '4px 10px',
    backgroundColor: 'rgba(211, 222, 40, 0.1)',
    borderRadius: theme.borderRadius.full,
  },
  header: {
    marginBottom: '32px',
  },
  headerMobile: {
    padding: '16px',
    marginBottom: '0',
  },
  title: {
    fontSize: '36px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: '12px',
  },
  titleMobile: {
    fontSize: '24px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: '8px',
    lineHeight: '1.2',
  },
  description: {
    fontSize: '18px',
    color: theme.colors.textSecondary,
    lineHeight: '1.6',
    marginBottom: '16px',
  },
  descriptionMobile: {
    fontSize: '15px',
    color: theme.colors.textSecondary,
    lineHeight: '1.5',
    marginBottom: '12px',
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
  coverImageMobile: {
    width: '100%',
    maxHeight: '250px',
    objectFit: 'cover',
    borderRadius: theme.borderRadius.md,
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
  progressSectionMobile: {
    marginBottom: '0',
    padding: '16px',
    backgroundColor: theme.colors.cardBackground,
    borderBottom: `2px solid ${theme.colors.border}`,
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
  progressPercentMobile: {
    fontSize: '20px',
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
  contentMobile: {
    display: 'flex',
    flexDirection: 'column',
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
  stepCardMobile: {
    backgroundColor: theme.colors.cardBackground,
    borderTop: `2px solid ${theme.colors.border}`,
    padding: '16px',
    minHeight: 'calc(100vh - 200px)',
  },
  stepHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  stepHeaderMobile: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    gap: '8px',
    flexWrap: 'wrap',
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
  completeButtonMobile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 16px',
    minHeight: '44px',
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.textSecondary,
    fontSize: '13px',
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
  stepTitleMobile: {
    fontSize: '20px',
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: '16px',
    lineHeight: '1.3',
  },
  stepImage: {
    width: '100%',
    maxHeight: '400px',
    objectFit: 'contain',
    borderRadius: theme.borderRadius.md,
    border: `2px solid ${theme.colors.border}`,
    marginBottom: '24px',
  },
  stepImageMobile: {
    width: '100%',
    maxWidth: '100%',
    height: 'auto',
    objectFit: 'contain',
    borderRadius: theme.borderRadius.md,
    border: `2px solid ${theme.colors.border}`,
    marginBottom: '16px',
  },
  stepDescription: {
    fontSize: '16px',
    color: theme.colors.textSecondary,
    lineHeight: '1.8',
    marginBottom: '24px',
    whiteSpace: 'pre-wrap',
  },
  stepDescriptionMobile: {
    fontSize: '15px',
    color: theme.colors.textSecondary,
    lineHeight: '1.6',
    marginBottom: '20px',
    whiteSpace: 'pre-wrap',
  },
  navigation: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'space-between',
  },
  navigationMobile: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
    position: 'sticky',
    bottom: 0,
    backgroundColor: theme.colors.cardBackground,
    padding: '16px',
    marginLeft: '-16px',
    marginRight: '-16px',
    marginBottom: '-16px',
    borderTop: `2px solid ${theme.colors.border}`,
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
  navButtonMobile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px',
    minHeight: '44px',
    minWidth: '44px',
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
  navButtonNextMobile: {
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
  embeddedContainerMobile: {
    padding: '16px',
    backgroundColor: theme.colors.cardBackground,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    marginTop: '16px',
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
  embeddedTitleMobile: {
    fontSize: '16px',
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
  embeddedStepMobile: {
    display: 'flex',
    gap: '10px',
    padding: '10px',
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
  embeddedCheckboxMobile: {
    width: '24px',
    height: '24px',
    cursor: 'pointer',
    flexShrink: 0,
    marginTop: '0px',
    minWidth: '24px',
    minHeight: '24px',
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
