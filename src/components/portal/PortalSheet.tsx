import React, { useEffect, useState } from 'react';
import { theme } from '../../theme';

/**
 * A bottom sheet, for the phone.
 *
 * WHY NOT THE EXISTING Modal
 *
 * Modal is a centred dialog sized in fixed widths (400–900px). On a phone that
 * is a box floating in the middle of the screen with the page dimmed behind it,
 * and anything tall inside it fights the keyboard. A sheet anchored to the
 * bottom edge is what a phone expects, reaches the thumb, and can be dismissed
 * by tapping the part of the page still visible above it.
 *
 * MEASUREMENTS THAT MATTER
 *
 * `88dvh`, never `vh`. On iOS `100vh` is the height the page WOULD have if the
 * browser chrome collapsed, so a sheet capped in vh is taller than the screen
 * and its footer — the button that closes it — sits below the bottom edge.
 * See rule 1 in CLAUDE.md.
 *
 * The footer carries `env(safe-area-inset-bottom)` because the sheet sits over
 * the home indicator, which nothing else on the page does.
 *
 * The body scroll lock is what stops the page behind scrolling when a finger
 * runs off the end of the sheet's own list.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Pinned under the body, outside its scroll. Actions live here. */
  footer?: React.ReactNode;
  /**
   * Raise it above another layer. The default clears PortalBottomNav, which is
   * all a sheet opened from the page needs. A sheet opened from inside a Modal
   * needs more: Modal's overlay is 1100 too, so at the default the two are
   * separated only by which happens to render later in the tree.
   */
  zIndex?: number;
  children: React.ReactNode;
}

const PortalSheet: React.FC<Props> = ({
  isOpen, onClose, title, footer, zIndex = 1100, children,
}) => {
  // Two flags, not one. `mounted` keeps the panel in the tree for the slide-out;
  // `shown` drives the transform and is flipped a frame later so the browser
  // has an initial value to animate FROM. Setting both at once means the panel
  // is simply born at its final position and nothing moves.
  const [mounted, setMounted] = useState(isOpen);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);

    // Restore what was there rather than assuming 'visible' — another sheet or
    // a Modal may already own it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [isOpen, onClose]);

  if (!mounted) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        // Above PortalBottomNav, which is fixed at 1000. It has to be: the tab
        // bar sits exactly where this sheet's footer does, so at any lower
        // value the nav paints over "Clear all" and "Show 21 classes" and the
        // sheet has no visible way to close itself.
        zIndex,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {/* Hardcoded black rather than a theme token: this is a scrim over
          whatever is behind it, and it has to darken in light mode too. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          opacity: shown ? 1 : 0,
          transition: 'opacity 0.2s ease',
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'relative',
          maxHeight: '88dvh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: theme.colors.bg.secondary,
          borderTop: `1px solid ${theme.colors.bdr.primary}`,
          borderTopLeftRadius: theme.borderRadius.xl,
          borderTopRightRadius: theme.borderRadius.xl,
          transform: shown ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 16px 12px',
            borderBottom: `1px solid ${theme.colors.bdr.primary}`,
            flexShrink: 0,
          }}
        >
          {/* The grabber. Decorative — dragging is not wired up — but it is the
              thing that tells a thumb this panel came from the bottom edge. */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '6px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '36px',
              height: '4px',
              borderRadius: '2px',
              backgroundColor: theme.colors.bdr.secondary,
            }}
          />

          <h2
            style={{
              ...theme.typography.h3,
              fontSize: '16px',
              color: theme.colors.txt.primary,
              margin: '4px 0 0',
              flex: 1,
              minWidth: 0,
            }}
          >
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
            style={{
              width: '36px',
              height: '36px',
              marginTop: '4px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.borderRadius.full,
              border: 'none',
              backgroundColor: theme.colors.bg.tertiary,
              color: theme.colors.txt.secondary,
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {children}
        </div>

        {footer && (
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              gap: '10px',
              padding: '12px 16px',
              paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
              borderTop: `1px solid ${theme.colors.bdr.primary}`,
              backgroundColor: theme.colors.bg.secondary,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default PortalSheet;
