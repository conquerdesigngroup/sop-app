import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePortalAdmin } from '../contexts/PortalAdminContext';
import { useTheme, useThemeColors } from '../contexts/ThemeContext';
import { useMobileMenu } from '../contexts/MobileMenuContext';
import { theme, BRAND_MARK } from '../theme';
import RefreshButton from './RefreshButton';
import GlobalSearch from './GlobalSearch';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { roleLabel } from '../lib/roles';
import { portalRoutes } from '../lib/portal';
import { useResponsive } from '../hooks/useResponsive';
import { useTaskCounts } from '../hooks/useTaskCounts';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { bottomNavPathsFor } from './BottomNavigation';

// Icons
const icons = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  tasks: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  sop: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
  calendar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  alerts: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  team: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  archive: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8v13H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </svg>
  ),
  activity: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  ),
  hours: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  hoursInput: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.2 15.9A9 9 0 1 1 15.9 2.8" />
      <polyline points="12 7 12 12 15 14" />
      <line x1="19" y1="3" x2="19" y2="9" />
      <line x1="16" y1="6" x2="22" y2="6" />
    </svg>
  ),
  portal: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-6 9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M9 21v-6h6v6" />
    </svg>
  ),
  library: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M9 7h7" />
      <path d="M9 11h7" />
    </svg>
  ),
  search: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  ),
  chevronDown: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  admin: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  /** A count shown beside the label. Nothing is drawn for zero. */
  badge?: number;
}

interface NavGroup {
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
  badge?: number;
}

type NavElement = NavItem | NavGroup;

/**
 * A titled run of rows in the mobile sheet. Mirrors the desktop grouping —
 * the sheet used to be one flat list of up to twelve rows, so the pages a
 * super admin opens weekly sat below the fold under the ones everyone opens
 * daily, with nothing to say which was which.
 */
interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
  /** Collapsible sections start closed unless the current page is inside them. */
  collapsible?: boolean;
}

/** Where the sheet remembers whether Management was left open. */
const MANAGEMENT_OPEN_KEY = 'didc.nav.management-open';

const readManagementOpen = (): boolean | null => {
  try {
    const v = window.localStorage.getItem(MANAGEMENT_OPEN_KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
};

const writeManagementOpen = (open: boolean) => {
  try {
    window.localStorage.setItem(MANAGEMENT_OPEN_KEY, open ? '1' : '0');
  } catch {
    // Private mode or storage disabled: the toggle still works for this visit.
  }
};

const Navigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout, isAdmin, isSuperAdmin } = useAuth();
  // Shown by authoring rights rather than by role: an instructor holding a
  // class is a plain 'team' member, and gating this on isAdmin would hide the
  // portal manager from the people it was built for.
  const { canEdit: canEditPortal } = usePortalAdmin();
  const { isDark, toggleTheme } = useTheme();
  const colors = useThemeColors();
  // One mark for both modes — it carries its own keyline. See BRAND_MARK.
  const brandLogo = BRAND_MARK;

  // The phone header is hamburger | centred mark | right cluster, and the mark
  // is 147px wide at 32px tall. With the refresh button beside the avatar
  // (both 44px touch targets) the cluster reaches the mark at 320px — a
  // first-generation SE, or an iPad Slide Over pane. There the button steps
  // aside; pull-to-refresh still works, and the page is not worth a
  // squashed logo.
  const roomForRefresh = useMediaQuery('(min-width: 360px)', true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  // Shared with BottomNavigation's "More" tab and the quick-add button, so
  // the flag lives in a context rather than here.
  const { isOpen: showMobileMenu, close: closeMobileMenu, toggle: toggleMobileMenu } = useMobileMenu();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  // null means "never toggled": open if the current page is inside it.
  const [managementOpen, setManagementOpen] = useState<boolean | null>(readManagementOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  const { isMobileOrTablet, windowWidth } = useResponsive();
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const { myOverdue, allOverdue } = useTaskCounts();
  const reducedMotion = useReducedMotion();
  // Whichever control opened the menu that is currently showing, so Escape
  // can hand focus back to it instead of dropping it on the body.
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const rememberTrigger = (e: React.SyntheticEvent<HTMLElement>) => {
    lastTriggerRef.current = e.currentTarget;
  };

  // ⌘K / Ctrl+K opens search from any page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(v => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    closeMobileMenu();
    setShowUserMenu(false);
    setOpenDropdown(null);
  }, [location.pathname, closeMobileMenu]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if click is inside any dropdown container
      let clickedInsideDropdown = false;
      Object.values(dropdownRefs.current).forEach(ref => {
        if (ref && ref.contains(target)) {
          clickedInsideDropdown = true;
        }
      });

      // If clicked outside all dropdowns, close them
      if (!clickedInsideDropdown) {
        setOpenDropdown(null);
      }

      // Check if click is inside the user menu or user button
      const userMenu = document.querySelector('[data-user-menu]');
      const userButton = document.querySelector('[data-user-button]');
      if (userMenu?.contains(target) || userButton?.contains(target)) {
        return; // Don't close if clicking inside user menu area
      }

      setShowUserMenu(false);
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Escape closes whatever is open and returns focus to the control that
  // opened it. Before this the only way to dismiss a menu was to click
  // somewhere else, which a keyboard cannot do.
  useEffect(() => {
    if (!showMobileMenu && !showUserMenu && !openDropdown) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      closeMobileMenu();
      setShowUserMenu(false);
      setOpenDropdown(null);
      lastTriggerRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showMobileMenu, showUserMenu, openDropdown, closeMobileMenu]);

  const handleLogout = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowUserMenu(false);
    await logout();
    navigate('/login');
  };

  const isGroup = (item: NavElement): item is NavGroup => {
    return 'items' in item;
  };

  // Prefix match, so a sub-page keeps its parent lit: the Portal viewer and
  // Client Accounts live under /portal-admin and used to leave nothing in the
  // header highlighted. The trailing slash keeps /hours from claiming
  // /hours-input.
  const isPathActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const isGroupActive = (group: NavGroup) => group.items.some(item => isPathActive(item.path));

  // A dropdown holding one entry is a click that leads to one choice. A team
  // member's Tasks group is only My Tasks, so it is rendered as the link
  // itself.
  const collapseGroup = (group: NavGroup): NavElement =>
    group.items.length === 1 ? group.items[0] : group;

  // Build navigation structure with grouped items
  const getNavElements = (): NavElement[] => {
    const elements: NavElement[] = [
      { path: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
    ];

    // Tasks group. For management the group's own pill is everyone's overdue
    // count, which already includes their own.
    const tasksGroup: NavGroup = {
      label: 'Tasks',
      icon: icons.tasks,
      badge: isAdmin ? allOverdue : myOverdue,
      items: [
        { path: '/my-tasks', label: 'My Tasks', icon: icons.tasks, badge: myOverdue },
      ],
    };

    if (isAdmin) {
      tasksGroup.items.push({ path: '/job-tasks', label: 'Job Tasks', icon: icons.tasks, badge: allOverdue });
    }

    elements.push(collapseGroup(tasksGroup));
    elements.push({ path: '/sop', label: 'SOPs', icon: icons.sop });
    elements.push({ path: '/calendar', label: 'Calendar', icon: icons.calendar });
    // Hours Input stays open to everyone — it is where you log your OWN time.
    elements.push({ path: '/hours-input', label: 'Hours Input', icon: icons.hoursInput });

    if (canEditPortal) {
      elements.push({ path: '/portal-admin', label: 'Portal', icon: icons.portal });
    }

    // Admin group. Team stays for admins — they need the directory to assign
    // who may post to a class. Everything a super admin gets on top of that
    // lives in here too: everyone else's hours and the alert board built on
    // them (super admin only from v13; they were once offered to every
    // signed-in user), the audit log and the archive. Top-level they made
    // nine entries, which wrapped the header onto a second row on a 1280px
    // laptop; in the group the row holds at that width.
    //
    // Task Library has had a route and an adminOnly guard since the templates
    // feature shipped, and no menu entry anywhere: it was reachable only by
    // typing the URL or via the Library tab inside Job Tasks.
    if (isAdmin) {
      const adminItems: NavItem[] = [
        { path: '/team', label: 'Team', icon: icons.team },
        { path: '/task-library', label: 'Task Library', icon: icons.library },
      ];
      if (isSuperAdmin) {
        adminItems.push({ path: '/hours', label: 'Team Schedule', icon: icons.hours });
        adminItems.push({ path: '/alerts', label: 'Alerts', icon: icons.alerts, badge: allOverdue });
        adminItems.push({ path: '/activity-log', label: 'Activity Log', icon: icons.activity });
        adminItems.push({ path: '/archive', label: 'Archive', icon: icons.archive });
      }
      elements.push(collapseGroup({
        label: 'Admin',
        icon: icons.admin,
        items: adminItems,
        // Alerts is the only thing in here with a count; the closed group
        // still says when it needs a look.
        badge: isSuperAdmin ? allOverdue : undefined,
      }));
    }

    return elements;
  };

  // Sectioned list for the mobile sheet.
  //
  // Same pages as the desktop bar, grouped by how often they are opened
  // rather than by which desktop dropdown they fell into: the daily pages
  // first, the management pages under a heading that collapses, and the
  // portal manager on its own because it is a different product.
  const getMobileSections = (): NavSection[] => {
    const work: NavItem[] = [
      { path: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
      { path: '/my-tasks', label: 'My Tasks', icon: icons.tasks, badge: myOverdue },
    ];
    if (isAdmin) {
      work.push({ path: '/job-tasks', label: 'Job Tasks', icon: icons.tasks, badge: allOverdue });
    }
    work.push({ path: '/sop', label: 'SOPs', icon: icons.sop });
    work.push({ path: '/calendar', label: 'Calendar', icon: icons.calendar });
    work.push({ path: '/hours-input', label: 'Hours Input', icon: icons.hoursInput });

    const sections: NavSection[] = [{ key: 'work', label: 'Work', items: work }];

    if (isAdmin) {
      const management: NavItem[] = [
        { path: '/team', label: 'Team', icon: icons.team },
        { path: '/task-library', label: 'Task Library', icon: icons.library },
      ];
      if (isSuperAdmin) {
        management.push({ path: '/hours', label: 'Team Schedule', icon: icons.hours });
        management.push({ path: '/alerts', label: 'Alerts', icon: icons.alerts, badge: allOverdue });
        management.push({ path: '/activity-log', label: 'Activity Log', icon: icons.activity });
        management.push({ path: '/archive', label: 'Archive', icon: icons.archive });
      }
      sections.push({ key: 'management', label: 'Management', items: management, collapsible: true });
    }

    if (canEditPortal) {
      sections.push({
        key: 'portal',
        label: 'Parent Portal',
        items: [{ path: '/portal-admin', label: 'Portal Manager', icon: icons.portal }],
      });
    }

    return sections;
  };

  const navElements = getNavElements();
  // The sheet offers only what the bottom bar does not — the bar is chosen
  // by role, so what is left over is too. For a team member without a class
  // that is nothing, and the hamburger is not drawn at all: it used to open
  // a list of the same five pages already under their thumb.
  const barPaths = bottomNavPathsFor(isAdmin);
  const mobileSections = getMobileSections()
    .map(section => ({ ...section, items: section.items.filter(item => !barPaths.includes(item.path)) }))
    .filter(section => section.items.length > 0);
  const hasMoreItems = mobileSections.length > 0;

  const isSectionOpen = (section: NavSection) => {
    if (!section.collapsible) return true;
    if (managementOpen !== null) return managementOpen;
    return section.items.some(item => isPathActive(item.path));
  };

  const toggleSection = (section: NavSection) => {
    const next = !isSectionOpen(section);
    setManagementOpen(next);
    writeManagementOpen(next);
  };

  // Inverted on an active (pink) row, where a pink pill would vanish.
  const renderBadge = (count: number | undefined, onActive: boolean) =>
    count ? (
      <span
        aria-label={`${count} overdue`}
        style={{
          ...styles.countPill,
          backgroundColor: onActive ? '#FFFFFF' : theme.colors.primary,
          color: onActive ? theme.colors.primary : '#FFFFFF',
        }}
      >
        {count > 99 ? '99+' : count}
      </span>
    ) : null;

  // Escape returns focus here; the mobile and desktop variants render the
  // same entries, so they are built once and only the wrapper differs.
  const renderUserMenuItems = () => (
    <>
      <button
        type="button"
        style={{...styles.userMenuItem, color: colors.txt.secondary}}
        onClick={() => navigate('/profile')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        Profile
      </button>
      <button
        type="button"
        style={{...styles.userMenuItem, color: colors.txt.secondary}}
        onClick={() => navigate('/settings')}
      >
        <span style={styles.navIcon}>{React.cloneElement(icons.admin, { width: 16, height: 16 })}</span>
        Settings
      </button>
      <div style={{...styles.menuDivider, backgroundColor: colors.bdr.primary}} />
      <button
        type="button"
        style={{...styles.userMenuItem, color: colors.txt.secondary}}
        onClick={(e) => {
          e.stopPropagation();
          toggleTheme();
        }}
      >
        {isDark ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
        {isDark ? 'Light Mode' : 'Dark Mode'}
      </button>
      {/* Leaves the staff app entirely. This is its only home now — it used
          to be offered in the menu sheet as well, where it sat among pages
          it is not one of. */}
      <button
        type="button"
        style={{...styles.userMenuItem, color: colors.txt.secondary}}
        onClick={() => navigate(portalRoutes.chooser)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        Back to menu
      </button>
      <div style={{...styles.menuDivider, backgroundColor: colors.bdr.primary}} />
      <button
        type="button"
        style={styles.userMenuItemLogout}
        onClick={handleLogout}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Logout
      </button>
    </>
  );

  const toggleDropdown = (label: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenDropdown(openDropdown === label ? null : label);
  };

  const renderNavItem = (item: NavItem) => (
    <Link
      key={item.path}
      to={item.path}
      aria-current={isPathActive(item.path) ? 'page' : undefined}
      style={{
        ...styles.navLink,
        color: isPathActive(item.path) ? colors.txt.primary : colors.txt.secondary,
        ...(isPathActive(item.path) ? styles.navLinkActive : {}),
      }}
    >
      <span style={styles.navIcon}>{item.icon}</span>
      {item.label}
      {renderBadge(item.badge, isPathActive(item.path))}
    </Link>
  );

  const renderNavGroup = (group: NavGroup) => {
    const isActive = isGroupActive(group);
    const isOpen = openDropdown === group.label;

    return (
      <div
        key={group.label}
        ref={el => { dropdownRefs.current[group.label] = el; }}
        style={styles.dropdownContainer}
      >
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={isOpen}
          onClick={(e) => {
            rememberTrigger(e);
            toggleDropdown(group.label, e);
          }}
          style={{
            ...styles.navLink,
            ...styles.dropdownTrigger,
            color: isActive ? colors.txt.primary : colors.txt.secondary,
            ...(isActive ? styles.navLinkActive : {}),
          }}
        >
          <span style={styles.navIcon}>{group.icon}</span>
          {group.label}
          {renderBadge(group.badge, isActive)}
          <span style={{
            ...styles.chevron,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>
            {icons.chevronDown}
          </span>
        </button>

        {isOpen && (
          <div style={{...styles.dropdownMenu, backgroundColor: colors.bg.secondary, borderColor: colors.bdr.primary}}>
            {group.items.map(item => (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isPathActive(item.path) ? 'page' : undefined}
                style={{
                  ...styles.dropdownItem,
                  color: isPathActive(item.path) ? colors.txt.primary : colors.txt.secondary,
                  ...(isPathActive(item.path) ? styles.dropdownItemActive : {}),
                }}
              >
                <span style={styles.dropdownIcon}>{item.icon}</span>
                {item.label}
                {renderBadge(item.badge, isPathActive(item.path))}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  // One row of the mobile sheet.
  const renderSheetLink = (item: NavItem, index: number) => {
    const active = isPathActive(item.path);
    return (
      <Link
        key={item.path}
        to={item.path}
        aria-current={active ? 'page' : undefined}
        className={reducedMotion ? undefined : 'list-item-enter'}
        style={{
          ...styles.mobileNavLink,
          color: active ? colors.txt.primary : colors.txt.secondary,
          ...(active ? styles.mobileNavLinkActive : {}),
          // Capped, not index * 0.05s. An admin sees several
          // items, so the last one used to start half a second
          // after the sheet opened and finish at 0.8s — and
          // until each item's slide-in settles it still covers
          // part of the row below, so an early tap opens the
          // wrong page. 0.18s keeps the stagger legible while
          // making the whole list settle in about a third of
          // the time. Skipped entirely under reduced motion,
          // where the rows must start visible.
          ...(reducedMotion
            ? {}
            : { animationDelay: `${Math.min(index * 0.03, 0.18)}s`, opacity: 0 }),
        }}
      >
        <span style={styles.navIcon}>{item.icon}</span>
        {item.label}
        {item.badge ? (
          <span style={{ marginLeft: 'auto', display: 'flex' }}>{renderBadge(item.badge, active)}</span>
        ) : null}
        {active && (
          <span style={{...styles.activeIndicator, ...(item.badge ? { marginLeft: '8px' } : {})}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        )}
      </Link>
    );
  };

  // The phone header has room for one control on the left. When there is a
  // sheet, that is the hamburger and Search is the sheet's first row; when
  // there is not, Search takes the hamburger's place. Either way the right
  // cluster stays refresh + avatar, which is all the 147px mark leaves room
  // for on a 375px phone.
  const mobileSearchButton = (
    <button
      type="button"
      style={{...styles.hamburger, color: colors.txt.primary}}
      onClick={() => setSearchOpen(true)}
      aria-label="Search"
    >
      {icons.search}
    </button>
  );

  return (
    <>
    <nav style={{
      ...styles.nav,
      backgroundColor: colors.bg.secondary,
      borderBottomColor: colors.bdr.primary,
    }}>
      <div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
        {/* Mobile/Tablet Layout */}
        {isMobileOrTablet && (
          <>
            {/* Hamburger Menu Button. Only when the sheet would hold
                something the bottom bar does not; otherwise the slot goes
                to Search so the avatar stays on the right. */}
            {hasMoreItems ? (
            <button
              type="button"
              style={{...styles.hamburger, color: colors.txt.primary}}
              onClick={(e) => {
                rememberTrigger(e);
                toggleMobileMenu();
              }}
              aria-label={showMobileMenu ? 'Close menu' : 'More pages'}
              aria-expanded={showMobileMenu}
              aria-controls="staff-more-menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {showMobileMenu ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
            ) : (
              mobileSearchButton
            )}

            {/* Center Logo */}
            <Link to="/dashboard" style={styles.centerLogoMobile}>
              <img
                src={brandLogo}
                alt="Dancing Images Dance Center"
                style={styles.logoImageMobile}
              />
            </Link>

            {/* Right cluster: refresh, then the avatar. The logo is absolutely
                centred, so this cluster's width does not push it about. */}
            <div style={styles.rightClusterMobile}>
              {roomForRefresh && <RefreshButton size={36} />}

              {/* User Avatar (Mobile) */}
              <button
                type="button"
                data-user-button
                style={styles.userAvatarMobile}
                aria-label="Account menu"
                aria-haspopup="true"
                aria-expanded={showUserMenu}
                aria-controls="staff-user-menu"
                onClick={(e) => {
                  e.stopPropagation();
                  rememberTrigger(e);
                  setShowUserMenu(!showUserMenu);
                }}
              >
                {currentUser?.firstName.charAt(0)}{currentUser?.lastName.charAt(0)}
              </button>
            </div>

            {/* Mobile Menu Overlay */}
            {showMobileMenu && hasMoreItems && (
              <>
                <div
                  className="modal-backdrop backdrop-blur-sm"
                  style={styles.mobileOverlay}
                  onClick={closeMobileMenu}
                />
                <div
                  id="staff-more-menu"
                  role="dialog"
                  aria-modal="true"
                  aria-label="More pages"
                  className={reducedMotion ? undefined : 'bottom-sheet-enter'}
                  style={{...styles.mobileMenu, backgroundColor: colors.bg.secondary, borderTopColor: colors.bdr.secondary}}
                >
                  {/* Drag handle indicator */}
                  <div style={styles.dragHandle}>
                    <div style={{...styles.dragHandleBar, backgroundColor: colors.bdr.secondary}} />
                  </div>
                  <div style={styles.mobileMenuContent}>
                    {/* Search first: the header slot it would have taken is
                        the hamburger's whenever this sheet exists. */}
                    <button
                      type="button"
                      onClick={() => {
                        closeMobileMenu();
                        setSearchOpen(true);
                      }}
                      style={{...styles.mobileNavLink, ...styles.mobileSheetButton, color: colors.txt.secondary}}
                    >
                      <span style={styles.navIcon}>{icons.search}</span>
                      Search
                    </button>

                    {mobileSections.map((section, sectionIndex) => {
                      const open = isSectionOpen(section);
                      const sectionBadge = section.items.reduce((n, item) => n + (item.badge || 0), 0);
                      return (
                        <div key={section.key} style={sectionIndex > 0 ? styles.mobileSection : undefined}>
                          {section.collapsible ? (
                            <button
                              type="button"
                              onClick={() => toggleSection(section)}
                              aria-expanded={open}
                              style={{...styles.mobileSectionToggle, color: colors.txt.tertiary}}
                            >
                              <span style={styles.mobileSectionLabel}>{section.label}</span>
                              {/* Collapsed sections still say when something inside needs attention. */}
                              {!open && sectionBadge > 0 && renderBadge(sectionBadge, false)}
                              <span style={{
                                ...styles.chevron,
                                marginLeft: 'auto',
                                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                              }}>
                                {icons.chevronDown}
                              </span>
                            </button>
                          ) : (
                            <div style={{...styles.mobileSectionHeading, color: colors.txt.tertiary}}>
                              <span style={styles.mobileSectionLabel}>{section.label}</span>
                            </div>
                          )}
                          {open && section.items.map((item, index) => renderSheetLink(item, index))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* User Menu (Mobile) */}
            {showUserMenu && (
              <div id="staff-user-menu" data-user-menu className="modal-content" style={{...styles.userMenuMobile, backgroundColor: colors.bg.secondary, borderColor: colors.bdr.primary}}>
                <div style={{...styles.userInfoMobile, borderBottomColor: colors.bdr.primary}}>
                  <div style={{...styles.userNameMobile, color: colors.txt.primary}}>
                    {currentUser?.firstName} {currentUser?.lastName}
                  </div>
                  <div style={{...styles.userRoleMobile, color: colors.txt.secondary}}>
                    {roleLabel(currentUser?.role)}
                  </div>
                </div>
                <div style={{...styles.menuDivider, backgroundColor: colors.bdr.primary}} />
                {renderUserMenuItems()}
              </div>
            )}
          </>
        )}

        {/* Desktop Layout */}
        {!isMobileOrTablet && (
          <>
            {/* Left side: Logo + Nav Links */}
            <div style={styles.leftSection}>
              <Link to="/dashboard" style={styles.logoContainer}>
                <img
                  src={brandLogo}
                  alt="Dancing Images Dance Center"
                  style={styles.logoImage}
                />
              </Link>
              <div style={styles.navLinks}>
                {navElements.map((element) =>
                  isGroup(element)
                    ? renderNavGroup(element)
                    : renderNavItem(element)
                )}
              </div>
            </div>

            {/* Right side: User Section */}
            <div style={styles.userSection}>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                title="Search (⌘K)"
                style={{...styles.searchButton, color: colors.txt.secondary, borderColor: colors.bdr.primary, backgroundColor: colors.bg.tertiary}}
              >
                {icons.search}
                {/* The links wrap onto a second row below ~1280; the icon alone
                    costs nothing there, the label and shortcut only above. */}
                {windowWidth >= 1280 && <span>Search</span>}
                {windowWidth >= 1280 && <kbd style={{...styles.searchKbd, borderColor: colors.bdr.secondary}}>⌘K</kbd>}
              </button>
              <RefreshButton size={40} style={{ marginRight: theme.spacing.sm }} />
              <button
                type="button"
                data-user-button
                aria-haspopup="true"
                aria-expanded={showUserMenu}
                aria-controls="staff-user-menu"
                style={{...styles.userButton, backgroundColor: colors.bg.tertiary, borderColor: colors.bdr.primary}}
                onClick={(e) => {
                  e.stopPropagation();
                  rememberTrigger(e);
                  setShowUserMenu(!showUserMenu);
                }}
              >
                <div style={styles.userAvatar}>
                  {currentUser?.firstName.charAt(0)}{currentUser?.lastName.charAt(0)}
                </div>
                <div style={styles.userInfo}>
                  <div style={{...styles.userName, color: colors.txt.primary}}>
                    {currentUser?.firstName} {currentUser?.lastName}
                  </div>
                  <div style={{...styles.userRole, color: colors.txt.secondary}}>
                    {roleLabel(currentUser?.role)}
                  </div>
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={colors.txt.secondary}
                  strokeWidth="2"
                  style={{
                    transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showUserMenu && (
                <div id="staff-user-menu" data-user-menu className="modal-content" style={{...styles.userMenu, backgroundColor: colors.bg.secondary, borderColor: colors.bdr.primary}}>
                  {renderUserMenuItems()}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </nav>
    {/* Outside the <nav>: index.css forces every `nav button` transparent,
        which turned the highlighted result row white-on-white. */}
    <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  nav: {
    backgroundColor: theme.colors.cardBackground,
    borderBottom: `2px solid ${theme.colors.border}`,
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: theme.shadows.md,
    width: '100%',
    // This is the top-most element on every signed-in page, and index.html sets
    // viewport-fit=cover, so the page runs under the notch. Padding rather than
    // margin on purpose: the bar's own background then fills the status-bar
    // area and the links sit below it, instead of leaving a strip of page
    // showing through above a bar that starts too low.
    //
    // Only PortalLayout was doing this, which is why the parent portal looked
    // right on a phone and every staff screen did not.
    paddingTop: 'env(safe-area-inset-top)',
  },
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    // 24px rather than 40px. The desktop header needed a constant 1367px and
    // so ran off the right edge at every width below that — 1024, 1280 and
    // 1366 are all common laptops. This and the tighter link padding recover
    // about 100px, which is enough to keep one row down to 1280.
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '20px',
  },
  containerMobile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    position: 'relative',
    width: '100%',
    maxWidth: '100vw',
  },
  hamburger: {
    background: 'none',
    border: 'none',
    color: theme.colors.txt.primary,
    cursor: 'pointer',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    transition: 'background-color 0.2s',
    flexShrink: 0,
  },
  centerLogoMobile: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
  },
  logoImageMobile: {
    height: '32px',
    width: 'auto',
    objectFit: 'contain',
  },
  rightClusterMobile: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  searchButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    marginRight: '10px',
    border: '1px solid',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontFamily: theme.fonts.primary,
    fontSize: '13px',
    fontWeight: 600,
  },
  searchKbd: {
    fontFamily: theme.fonts.mono,
    fontSize: '10px',
    padding: '1px 5px',
    border: '1px solid',
    borderRadius: '4px',
    opacity: 0.8,
  },
  userAvatarMobile: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    padding: 0,
    border: `2px solid ${theme.colors.bdr.primary}`,
  },
  mobileOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.overlay,
    // Above BottomNavigation (1000): this is a modal surface, and the
    // persistent bottom bar must not show through its backdrop.
    zIndex: 1098,
  },
  mobileMenu: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.bg.secondary,
    borderTopLeftRadius: '20px',
    borderTopRightRadius: '20px',
    borderTop: `2px solid ${theme.colors.bdr.secondary}`,
    zIndex: 1099,
    overflowY: 'auto',
    boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.5)',
    WebkitOverflowScrolling: 'touch',
    maxHeight: '70dvh',
    paddingBottom: 'env(safe-area-inset-bottom, 20px)',
  },
  dragHandle: {
    display: 'flex',
    justifyContent: 'center',
    padding: '12px 0 8px 0',
  },
  dragHandleBar: {
    width: '36px',
    height: '4px',
    backgroundColor: theme.colors.bdr.secondary,
    borderRadius: '2px',
  },
  mobileMenuContent: {
    padding: '8px 16px 24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  mobileSection: {
    marginTop: '10px',
  },
  mobileSectionHeading: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 16px 4px',
  },
  mobileSectionToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '10px 16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  mobileSectionLabel: {
    fontFamily: theme.fonts.mono,
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  countPill: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '18px',
    height: '18px',
    padding: '0 5px',
    marginLeft: '2px',
    borderRadius: theme.borderRadius.full,
    fontSize: '11px',
    fontWeight: 700,
    lineHeight: 1,
    fontFamily: theme.fonts.mono,
    boxSizing: 'border-box',
  },
  activeIndicator: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
  },
  mobileNavLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    fontSize: '16px',
    fontWeight: '600',
    color: theme.colors.txt.secondary,
    textDecoration: 'none',
    borderRadius: theme.borderRadius.md,
    transition: 'all 0.2s',
    border: `2px solid transparent`,
  },
  // A row of the sheet that is a <button> rather than a <Link>: the resets
  // make it look like its neighbours.
  mobileSheetButton: {
    width: '100%',
    background: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  mobileNavLinkActive: {
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    border: `2px solid ${theme.colors.primary}`,
  },
  userMenuMobile: {
    position: 'absolute',
    top: '100%',
    right: '16px',
    marginTop: '8px',
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    boxShadow: theme.shadows.lg,
    minWidth: '250px',
    overflow: 'hidden',
    zIndex: 1100,
  },
  userInfoMobile: {
    padding: '16px',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  userNameMobile: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: '4px',
  },
  userRoleMobile: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    flex: 1,
    // Without this the group refuses to shrink below its content, so the links
    // could never wrap and the overflow was pushed onto the page instead.
    minWidth: 0,
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  navLinks: {
    display: 'flex',
    gap: '2px',
    rowGap: '4px',
    alignItems: 'center',
    // Wraps onto a second row below ~1280 instead of running off the page.
    // Deliberately not `overflow: auto`: the Tasks and Admin dropdowns are
    // absolutely positioned children and a scroll container would clip them.
    flexWrap: 'wrap',
    minWidth: 0,
  },
  logoImage: {
    height: '36px',
    width: 'auto',
    objectFit: 'contain',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 8px',
    fontSize: '14px',
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textDecoration: 'none',
    borderRadius: theme.borderRadius.md,
    transition: 'all 0.2s',
    border: `2px solid transparent`,
    whiteSpace: 'nowrap',
  },
  navLinkActive: {
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    border: `2px solid ${theme.colors.primary}`,
  },
  navIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Dropdown styles
  dropdownContainer: {
    position: 'relative',
  },
  dropdownTrigger: {
    cursor: 'pointer',
  },
  chevron: {
    display: 'flex',
    alignItems: 'center',
    marginLeft: '2px',
    transition: 'transform 0.2s',
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '8px',
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    boxShadow: theme.shadows.lg,
    minWidth: '180px',
    overflow: 'hidden',
    zIndex: 1100,
    padding: '6px',
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.txt.secondary,
    textDecoration: 'none',
    borderRadius: theme.borderRadius.sm,
    transition: 'all 0.15s',
  },
  dropdownItemActive: {
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
  },
  dropdownIcon: {
    display: 'flex',
    alignItems: 'center',
    opacity: 0.8,
  },

  userSection: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  userButton: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
    // It is a <button> now, so it is reachable by keyboard; these undo the
    // browser's own button styling.
    fontFamily: 'inherit',
    textAlign: 'left',
    color: 'inherit',
  },
  userAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 600,
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  userName: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  userRole: {
    fontSize: '11px',
    color: theme.colors.txt.secondary,
  },
  userMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    boxShadow: theme.shadows.lg,
    minWidth: '200px',
    overflow: 'hidden',
    zIndex: 1100,
  },
  // Real <button>s rather than divs, so Tab reaches them and Enter fires
  // them. The resets below make a button look like the row it replaced.
  userMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: '100%',
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    color: theme.colors.txt.secondary,
    fontSize: '14px',
    fontFamily: 'inherit',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  userMenuItemLogout: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: '100%',
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    color: theme.colors.status.error,
    fontSize: '14px',
    fontFamily: 'inherit',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  menuDivider: {
    height: '1px',
    backgroundColor: theme.colors.bdr.primary,
    margin: `${theme.spacing.xs} 0`,
  },
};

export default Navigation;
