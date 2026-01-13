import React from 'react';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';

type EmptyStateVariant = 'sops' | 'tasks' | 'templates' | 'team' | 'search' | 'generic';

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  variant = 'generic',
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}) => {
  const { isMobileOrTablet } = useResponsive();
  const config = getVariantConfig(variant);

  return (
    <div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
      <div style={styles.iconWrapper}>
        {config.icon}
      </div>
      <h3 style={isMobileOrTablet ? styles.titleMobile : styles.title}>
        {title || config.title}
      </h3>
      <p style={isMobileOrTablet ? styles.descriptionMobile : styles.description}>
        {description || config.description}
      </p>
      <div style={styles.actions}>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            style={isMobileOrTablet ? styles.primaryButtonMobile : styles.primaryButton}
          >
            {config.actionIcon}
            {actionLabel}
          </button>
        )}
        {secondaryActionLabel && onSecondaryAction && (
          <button
            onClick={onSecondaryAction}
            style={styles.secondaryButton}
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>
    </div>
  );
};

const getVariantConfig = (variant: EmptyStateVariant) => {
  switch (variant) {
    case 'sops':
      return {
        title: 'No SOPs Yet',
        description: 'Create your first Standard Operating Procedure to help your team work more efficiently.',
        icon: (
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        ),
        actionIcon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        ),
      };
    case 'tasks':
      return {
        title: 'No Tasks Assigned',
        description: 'You\'re all caught up! Check back later for new tasks or ask your admin to assign some.',
        icon: (
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        ),
        actionIcon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        ),
      };
    case 'templates':
      return {
        title: 'No Templates Yet',
        description: 'Create reusable templates to quickly generate SOPs with predefined steps.',
        icon: (
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
        ),
        actionIcon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        ),
      };
    case 'team':
      return {
        title: 'No Team Members',
        description: 'Add team members to assign tasks and collaborate on SOPs.',
        icon: (
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
        actionIcon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
        ),
      };
    case 'search':
      return {
        title: 'No Results Found',
        description: 'Try adjusting your search or filters to find what you\'re looking for.',
        icon: (
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        ),
        actionIcon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ),
      };
    default:
      return {
        title: 'Nothing Here',
        description: 'There\'s nothing to display at the moment.',
        icon: (
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={theme.colors.txt.tertiary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="9" x2="15" y2="15" />
            <line x1="15" y1="9" x2="9" y2="15" />
          </svg>
        ),
        actionIcon: null,
      };
  }
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 40px',
    textAlign: 'center',
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `2px dashed ${theme.colors.bdr.secondary}`,
  },
  containerMobile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
    textAlign: 'center',
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.md,
    border: `2px dashed ${theme.colors.bdr.secondary}`,
  },
  iconWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    backgroundColor: theme.colors.bg.tertiary,
    marginBottom: theme.spacing.lg,
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.sm,
  },
  titleMobile: {
    ...theme.typography.h3Mobile,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.sm,
  },
  description: {
    ...theme.typography.body,
    color: theme.colors.txt.tertiary,
    maxWidth: '400px',
    marginBottom: theme.spacing.xl,
  },
  descriptionMobile: {
    ...theme.typography.bodySmall,
    color: theme.colors.txt.tertiary,
    maxWidth: '300px',
    marginBottom: theme.spacing.lg,
  },
  actions: {
    display: 'flex',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  primaryButton: {
    ...theme.components.button.base,
    ...theme.components.button.sizes.md,
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
  },
  primaryButtonMobile: {
    ...theme.components.button.base,
    ...theme.components.button.sizes.md,
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    width: '100%',
  },
  secondaryButton: {
    ...theme.components.button.base,
    ...theme.components.button.sizes.md,
    backgroundColor: 'transparent',
    color: theme.colors.txt.secondary,
    border: `2px solid ${theme.colors.bdr.secondary}`,
  },
};

export default EmptyState;
