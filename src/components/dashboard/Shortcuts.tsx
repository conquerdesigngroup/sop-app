import React from 'react';
import { NavigateFunction } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAdmin } from '../../contexts/PortalAdminContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useTaskCounts } from '../../hooks/useTaskCounts';
import { theme } from '../../theme';
import { CountBadge } from '../BottomNavigation';

/**
 * The dashboard's grid of big buttons: the pages each person actually uses,
 * one tap from Home.
 *
 * WHY THIS EXISTS
 *
 * The bottom bar has five slots, and giving teachers Attendance and Portal
 * there pushed pages off it — Calendar and SOPs for a teacher, My Tasks and
 * Calendar for management. This grid is where they land, so nothing that left
 * the bar is ever more than Home and one tap away. It also covers the desktop,
 * where there is no bar and the header is a row of small text links.
 *
 * Chosen on the same test the bar uses, so the two cannot disagree about who
 * teaches:
 *
 *   holds a class, or management
 *       Take attendance · Portal manager · Log hours · My tasks · Calendar · SOPs
 *   neither
 *       Log hours · My tasks · Calendar · SOPs · My profile · Settings
 *
 * SIX, IN THREES
 *
 * On a phone the grid is three across, whatever the width. Four across left a
 * 320px phone 54px for each label, and "attendance" is 60px at this size — it
 * broke as "attendanc-e". Three leaves 79px. Six tiles is then two whole rows
 * for everyone, which is why someone with no class gets their profile and
 * settings rather than a lone tile on a second row.
 */

export interface Shortcut {
  key: string;
  label: string;
  icon: React.ReactNode;
  to: string;
  /** Overdue count, drawn as the bar's own badge. Hidden when zero. */
  badge?: number;
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// The same shapes as the bottom bar and the quick-add sheet, so a page looks
// like itself wherever it is offered.
const icons = {
  attendance: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M8 13l2.5 2.5L16 10" />
    </svg>
  ),
  portal: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 11l18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
  tasks: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  calendar: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  hours: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M21.2 15.9A9 9 0 1 1 15.9 2.8" />
      <polyline points="12 7 12 12 15 14" />
      <line x1="19" y1="3" x2="19" y2="9" />
      <line x1="16" y1="6" x2="22" y2="6" />
    </svg>
  ),
  sop: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  profile: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  settings: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

export const shortcutsFor = (isAdmin: boolean, teaches: boolean, myOverdue: number): Shortcut[] => {
  const hours: Shortcut = { key: 'hours', label: 'Log hours', icon: icons.hours, to: '/hours-input' };
  const myTasks: Shortcut = { key: 'my-tasks', label: 'My tasks', icon: icons.tasks, to: '/my-tasks', badge: myOverdue };
  const calendar: Shortcut = { key: 'calendar', label: 'Calendar', icon: icons.calendar, to: '/calendar' };
  const sops: Shortcut = { key: 'sop', label: 'SOPs', icon: icons.sop, to: '/sop' };

  // Management does not wait for the portal check, for the bar's reason:
  // can_edit_portal() is true for every admin.
  if (isAdmin || teaches) {
    return [
      { key: 'attendance', label: 'Take attendance', icon: icons.attendance, to: '/attendance' },
      { key: 'portal', label: 'Portal manager', icon: icons.portal, to: '/portal-admin' },
      hours,
      myTasks,
      calendar,
      sops,
    ];
  }
  return [
    hours,
    myTasks,
    calendar,
    sops,
    { key: 'profile', label: 'My profile', icon: icons.profile, to: '/profile' },
    { key: 'settings', label: 'Settings', icon: icons.settings, to: '/settings' },
  ];
};

const Shortcuts: React.FC<{ navigate: NavigateFunction }> = ({ navigate }) => {
  const { isAdmin } = useAuth();
  // Mirrors can_edit_portal(), exactly as the bottom bar reads it.
  const { canEdit: teaches } = usePortalAdmin();
  const { myOverdue } = useTaskCounts();
  const { isMobileOrTablet } = useResponsive();

  const shortcuts = shortcutsFor(isAdmin, teaches, myOverdue);

  // Three across on a phone (see SIX, IN THREES); one row on a laptop.
  const columns = isMobileOrTablet ? 3 : shortcuts.length;

  return (
    <section aria-label="Shortcuts" style={{ marginBottom: theme.spacing.lg }}>
      {/* A label in the sheet's section style, deliberately not an h2: index.css
          forces every h2 to 22px on a phone, !important, over any inline size.
          The section's own name is what a screen reader announces. */}
      <div
        aria-hidden="true"
        style={{
          fontFamily: theme.fonts.mono,
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: theme.colors.txt.tertiary,
          margin: '0 0 8px',
        }}
      >
        Shortcuts
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: isMobileOrTablet ? '8px' : '12px',
      }}>
        {shortcuts.map(shortcut => (
          <button
            key={shortcut.key}
            type="button"
            onClick={() => navigate(shortcut.to)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '8px',
              minWidth: 0,
              minHeight: '88px',
              padding: '12px 4px 10px',
              backgroundColor: theme.colors.bg.secondary,
              border: `2px solid ${theme.colors.bdr.primary}`,
              borderRadius: theme.borderRadius.lg,
              cursor: 'pointer',
              color: theme.colors.txt.primary,
              fontFamily: theme.fonts.primary,
            }}
          >
            <span style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: theme.borderRadius.md,
              backgroundColor: theme.colors.bg.tertiary,
              color: theme.colors.primary,
              flexShrink: 0,
            }}>
              {shortcut.icon}
              {shortcut.badge !== undefined && <CountBadge count={shortcut.badge} label="overdue" />}
            </span>
            <span style={{
              fontSize: '12px',
              fontWeight: 600,
              lineHeight: 1.25,
              textAlign: 'center',
              maxWidth: '100%',
              overflowWrap: 'anywhere',
            }}>
              {shortcut.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default Shortcuts;
