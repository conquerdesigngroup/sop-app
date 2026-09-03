import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMobileMenu } from '../contexts/MobileMenuContext';
import { useThemeColors } from '../contexts/ThemeContext';
import { theme } from '../theme';

/**
 * The floating "+" above the bottom bar, for management on a phone.
 *
 * WHY THIS EXISTS
 *
 * Creating anything used to mean navigating to the page first, then finding
 * its button under the header, the stats and the filter row. On a phone that
 * is three or four screens of scrolling before the thing you opened the app
 * to do. Each action here lands on the page with its editor already open,
 * using the same `location.state` flags those pages already honour for the
 * dashboard's day-click and the task library's Use Template.
 *
 * Management only. A team member has one thing to create (their hours) and
 * a permanent tab for it.
 */

interface QuickAction {
  key: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  go: (navigate: ReturnType<typeof useNavigate>) => void;
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const ACTIONS: QuickAction[] = [
  {
    key: 'job-task',
    label: 'New job task',
    hint: 'Assign work to someone',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    go: navigate => navigate('/job-tasks', { state: { openCreateModal: true } }),
  },
  {
    key: 'sop',
    label: 'New SOP',
    hint: 'Write a procedure',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    ),
    go: navigate => navigate('/sop', { state: { openForm: true } }),
  },
  {
    key: 'event',
    label: 'New calendar event',
    hint: 'Goes to Google Calendar too',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="12" y1="14" x2="12" y2="18" />
        <line x1="10" y1="16" x2="14" y2="16" />
      </svg>
    ),
    go: navigate => navigate('/calendar', { state: { openEventForm: true } }),
  },
  {
    key: 'hours',
    label: 'Log hours',
    hint: 'Your own time, for payroll',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
        <path d="M21.2 15.9A9 9 0 1 1 15.9 2.8" />
        <polyline points="12 7 12 12 15 14" />
        <line x1="19" y1="3" x2="19" y2="9" />
        <line x1="16" y1="6" x2="22" y2="6" />
      </svg>
    ),
    go: navigate => navigate('/hours-input'),
  },
];

const QuickAddButton: React.FC = () => {
  const { isAdmin } = useAuth();
  const menu = useMobileMenu();
  const navigate = useNavigate();
  const location = useLocation();
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);

  // A new page means the action landed; close so the sheet is not still up
  // over the editor it opened.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!isAdmin) return null;
  // The menu sheet covers the bottom of the screen; a second button poking
  // out from under it is noise.
  if (menu.isOpen) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Quick add"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-quick-add
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          right: '16px',
          // Above the 60px bottom bar and its safe-area padding.
          bottom: 'calc(60px + env(safe-area-inset-bottom, 0px) + 16px)',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          border: 'none',
          backgroundColor: theme.colors.primary,
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
          // Above the bottom bar (90) and page content; below Navigation's
          // sticky header (100) so the menu sheet's backdrop covers it.
          zIndex: 95,
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" {...stroke} strokeWidth={2.5}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {open && (
        <>
          <div
            className="modal-backdrop backdrop-blur-sm"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.colors.overlay,
              // Above the header (100) as well as the bar: this is a modal
              // surface and nothing should show through it.
              zIndex: 101,
            }}
          />
          <div
            role="dialog"
            aria-label="Quick add"
            className="bottom-sheet-enter"
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 102,
              backgroundColor: colors.bg.secondary,
              borderTop: `2px solid ${colors.bdr.secondary}`,
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.5)',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
              maxHeight: '70dvh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.bdr.secondary }} />
            </div>
            <div style={{
              padding: '6px 20px 8px',
              fontFamily: theme.fonts.mono,
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.txt.tertiary,
            }}>
              Quick add
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', padding: '0 12px' }}>
              {ACTIONS.map(action => (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    action.go(navigate);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    width: '100%',
                    padding: '14px 12px',
                    background: 'none',
                    border: 'none',
                    borderRadius: theme.borderRadius.md,
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: colors.txt.primary,
                  }}
                >
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '40px',
                    height: '40px',
                    borderRadius: theme.borderRadius.md,
                    backgroundColor: colors.bg.tertiary,
                    color: theme.colors.primary,
                    flexShrink: 0,
                  }}>
                    {action.icon}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span style={{ fontSize: '16px', fontWeight: 600 }}>{action.label}</span>
                    <span style={{ fontSize: '13px', color: colors.txt.tertiary }}>{action.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default QuickAddButton;
