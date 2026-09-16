import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMobileMenu } from '../contexts/MobileMenuContext';
import { usePortalAdmin } from '../contexts/PortalAdminContext';
import { useTheme, useThemeColors } from '../contexts/ThemeContext';
import { useTaskCounts, TaskCounts } from '../hooks/useTaskCounts';
import { theme } from '../theme';

/**
 * One tab. Either a route (`path`) or an action (`onPress`); the "More" tab
 * is the only action, and it opens the same sheet as the hamburger.
 */
interface NavTab {
  key: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  onPress?: () => void;
  /** Count shown as a pill on the icon. Hidden when zero. */
  badge?: number;
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const icons = {
  home: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  tasks: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  jobTasks: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 4v16" />
      <path d="M12 9h5" />
      <path d="M12 13h5" />
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
  attendance: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M8 13l2.5 2.5L16 10" />
    </svg>
  ),
  // A megaphone, not the house the header uses for Portal: on this bar it
  // shares a row with Home's house, and two houses would read as one page.
  portal: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 11l18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
  more: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  ),
};

/**
 * Five slots, chosen by role.
 *
 * A team member's day on a phone is: what am I doing, when, log my hours,
 * look something up. Someone who holds a class adds two things to that, and
 * both happen in the studio with a phone in one hand: the register at the top
 * of every lesson, and posting to that class's families afterwards. Management
 * does all of it too — the owner and the studio manager each carry a full
 * teaching load — plus everyone else's tasks.
 *
 * Five is as many as a phone holds. "Attendance" at 11px is 65px wide in the
 * iPhone system font (68px bold, as the current tab). A fifth of a 375pt
 * iPhone leaves 71px under the icon; a sixth leaves 58px, and the label is
 * cut off on most iPhones. So Attendance and Portal are traded in, not added
 * on:
 *
 *   management   Home · Job Tasks · Attendance · Portal · More
 *   teaches      Home · Tasks     · Attendance · Portal · Hours
 *   neither      Home · Tasks     · Calendar   · Hours  · SOPs
 *
 * Management keeps Job Tasks, whose badge counts everyone's overdue including
 * their own, and More; My Tasks and Calendar move into the sheet. A teacher
 * keeps Hours — logging time is the thing an employee does on a phone — and
 * Calendar and SOPs move into the sheet they already had. Every page pushed
 * off a bar is also a tile in the dashboard's shortcuts, so it stays one tap
 * from Home. Attendance takes the middle slot on both, under the thumb.
 *
 * `teaches` mirrors can_edit_portal() — does this person hold ANY class — and
 * is deliberately not "is a team member". A team member with no classes has no
 * register to take and no class to post to, so both tabs would be permanent
 * dead ends: they keep exactly the bar they had, and still have no sheet.
 * Management does not wait for it. can_edit_portal() is true for every admin,
 * and reading the async answer would redraw the admin bar a beat after load.
 */
const tabsFor = (isAdmin: boolean, teaches: boolean, counts: TaskCounts, onMore: () => void): NavTab[] => {
  const home: NavTab = { key: 'home', path: '/dashboard', label: 'Home', icon: icons.home };
  const myTasks: NavTab = { key: 'my-tasks', path: '/my-tasks', label: 'Tasks', icon: icons.tasks, badge: counts.myOverdue };
  const attendance: NavTab = { key: 'attendance', path: '/attendance', label: 'Attendance', icon: icons.attendance };
  // "Portal", not "Portal Manager": a fifth of a 375px bar fits the one word.
  const portal: NavTab = { key: 'portal', path: '/portal-admin', label: 'Portal', icon: icons.portal };
  // Hours Input, not the /hours schedule: logging time is the thing an
  // employee does on a phone.
  const hours: NavTab = { key: 'hours', path: '/hours-input', label: 'Hours', icon: icons.hours };

  if (isAdmin) {
    return [
      home,
      { key: 'job-tasks', path: '/job-tasks', label: 'Job Tasks', icon: icons.jobTasks, badge: counts.allOverdue },
      attendance,
      portal,
      { key: 'more', label: 'More', icon: icons.more, onPress: onMore },
    ];
  }
  if (teaches) return [home, myTasks, attendance, portal, hours];
  return [
    home,
    myTasks,
    { key: 'calendar', path: '/calendar', label: 'Calendar', icon: icons.calendar },
    hours,
    { key: 'sop', path: '/sop', label: 'SOPs', icon: icons.sop },
  ];
};

const NO_COUNTS: TaskCounts = { myOverdue: 0, allOverdue: 0 };
const noop = () => {};

/**
 * The destinations the bar already covers for this role. The header's menu
 * sheet reads this so it can offer only what is NOT down here — for a team
 * member without a class that is nothing, and the sheet is never drawn.
 * Derived from the same list the bar renders, so the two cannot drift.
 */
export const bottomNavPathsFor = (isAdmin: boolean, teaches = false): readonly string[] =>
  tabsFor(isAdmin, teaches, NO_COUNTS, noop).flatMap(tab => (tab.path ? [tab.path] : []));

/**
 * The count pill on a tab icon. Electric pink is the one accent the brand
 * allows, and an overdue count is exactly the kind of thing it is for.
 * Caps at 99+ so the pill never widens past the icon.
 */
export const CountBadge: React.FC<{ count: number; label: string }> = ({ count, label }) => {
  if (count <= 0) return null;
  return (
    <span
      role="status"
      aria-label={`${count} ${label}`}
      data-testid="count-badge"
      style={{
        position: 'absolute',
        top: '-6px',
        right: '-10px',
        minWidth: '16px',
        height: '16px',
        padding: '0 4px',
        borderRadius: '8px',
        backgroundColor: theme.colors.primary,
        // Brand pink is identical in both modes, so white is always readable.
        color: '#FFFFFF',
        fontSize: '10px',
        fontWeight: 700,
        lineHeight: '16px',
        textAlign: 'center',
        fontFamily: theme.fonts.mono,
        boxSizing: 'border-box',
        pointerEvents: 'none',
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
};

const BottomNavigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const menu = useMobileMenu();
  const counts = useTaskCounts();
  // Mirrors can_edit_portal(): admin, or holds at least one class.
  const { canEdit: teaches } = usePortalAdmin();

  const tabs = tabsFor(isAdmin, teaches, counts, menu.toggle);

  const isActive = (tab: NavTab) => {
    if (!tab.path) return menu.isOpen;
    if (tab.path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname === tab.path || location.pathname.startsWith(tab.path + '/');
  };

  return (
    <nav
      data-bottom-nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.bg.secondary,
        borderTop: `1px solid ${colors.bdr.primary}`,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        // Below Navigation's stacking context (position: sticky, z-index: 100),
        // not above it. The mobile menu sheet and the user menu live *inside*
        // Navigation, so their own z-indexes are only ever compared with each
        // other — against this bar the whole context is judged as one layer.
        // At 1000 the bar therefore painted over the bottom of the open menu
        // sheet and swallowed taps on its last row. Still above page content,
        // which sets no z-index at all.
        zIndex: 90,
        boxShadow: isDark ? '0 -4px 20px rgba(0, 0, 0, 0.5)' : '0 -4px 20px rgba(0, 0, 0, 0.1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '60px',
          maxWidth: '500px',
          margin: '0 auto',
        }}
      >
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <button
              key={tab.key}
              onClick={() => (tab.onPress ? tab.onPress() : navigate(tab.path!))}
              aria-label={tab.label}
              aria-current={tab.path && active ? 'page' : undefined}
              aria-expanded={tab.onPress ? menu.isOpen : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                // Five equal columns that divide whatever width the phone has.
                // These were minWidth:64px + 12px side padding, so the bar had
                // a floor of ~461px and ran off the right edge of every screen
                // narrower than that — which is every phone.
                flex: '1 1 0',
                minWidth: 0,
                padding: '8px 2px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: active ? theme.colors.primary : colors.txt.tertiary,
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
            >
              {/* Active indicator dot */}
              {active && (
                <div
                  style={{
                    position: 'absolute',
                    top: '2px',
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    backgroundColor: theme.colors.primary,
                  }}
                />
              )}
              <span
                style={{
                  display: 'flex',
                  position: 'relative',
                  transform: active ? 'scale(1.1)' : 'scale(1)',
                  transition: 'transform 0.2s ease',
                }}
              >
                {tab.icon}
                {/* Sits on the icon's top-right corner so the label underneath
                    keeps its width — the label must never be what widens the
                    column. */}
                {tab.badge !== undefined && <CountBadge count={tab.badge} label="overdue" />}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: active ? 700 : 500,
                  letterSpacing: '0.3px',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavigation;
