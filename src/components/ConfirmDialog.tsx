import React, { useEffect, useRef } from 'react';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';

type DialogVariant = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
  loading?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}) => {
  const { isMobileOrTablet } = useResponsive();
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap and escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    // Focus the confirm button when dialog opens
    setTimeout(() => confirmButtonRef.current?.focus(), 100);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: `${theme.colors.status.error}20`,
          iconColor: theme.colors.status.error,
          buttonBg: theme.colors.status.error,
          icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ),
        };
      case 'warning':
        return {
          iconBg: `${theme.colors.status.warning}20`,
          iconColor: theme.colors.status.warning,
          buttonBg: theme.colors.status.warning,
          icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ),
        };
      case 'info':
        return {
          iconBg: `${theme.colors.status.info}20`,
          iconColor: theme.colors.status.info,
          buttonBg: theme.colors.status.info,
          icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          ),
        };
    }
  };

  const variantStyles = getVariantStyles();

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        ref={dialogRef}
        style={isMobileOrTablet ? styles.dialogMobile : styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
      >
        {/* Icon */}
        <div
          style={{
            ...styles.iconWrapper,
            backgroundColor: variantStyles.iconBg,
            color: variantStyles.iconColor,
          }}
        >
          {variantStyles.icon}
        </div>

        {/* Title */}
        <h2 id="dialog-title" style={isMobileOrTablet ? styles.titleMobile : styles.title}>
          {title}
        </h2>

        {/* Message */}
        <p id="dialog-description" style={styles.message}>
          {message}
        </p>

        {/* Actions */}
        <div style={isMobileOrTablet ? styles.actionsMobile : styles.actions}>
          <button
            onClick={onClose}
            style={styles.cancelButton}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            style={{
              ...styles.confirmButton,
              backgroundColor: variantStyles.buttonBg,
              opacity: loading ? 0.7 : 1,
            }}
            disabled={loading}
          >
            {loading ? (
              <>
                <svg
                  style={styles.spinner}
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
                Processing...
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes spinDialog {
          to { transform: rotate(360deg); }
        }
      `}</style>
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
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: theme.spacing.lg,
    animation: 'fadeIn 0.2s ease-out',
  },
  dialog: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `2px solid ${theme.colors.bdr.primary}`,
    padding: '32px',
    maxWidth: '420px',
    width: '100%',
    textAlign: 'center',
    animation: 'slideUp 0.3s ease-out',
  },
  dialogMobile: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.md,
    border: `2px solid ${theme.colors.bdr.primary}`,
    padding: '24px',
    maxWidth: '100%',
    width: '100%',
    textAlign: 'center',
    animation: 'slideUp 0.3s ease-out',
  },
  iconWrapper: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '56px',
    height: '56px',
    borderRadius: '50%',
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
  message: {
    ...theme.typography.body,
    color: theme.colors.txt.secondary,
    marginBottom: theme.spacing.xl,
    lineHeight: 1.6,
  },
  actions: {
    display: 'flex',
    gap: theme.spacing.md,
    justifyContent: 'center',
  },
  actionsMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  cancelButton: {
    ...theme.components.button.base,
    ...theme.components.button.sizes.md,
    backgroundColor: 'transparent',
    color: theme.colors.txt.secondary,
    border: `2px solid ${theme.colors.bdr.secondary}`,
    flex: 1,
  },
  confirmButton: {
    ...theme.components.button.base,
    ...theme.components.button.sizes.md,
    color: '#FFFFFF',
    flex: 1,
  },
  spinner: {
    animation: 'spinDialog 0.8s linear infinite',
  },
};

export default ConfirmDialog;
