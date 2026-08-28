import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';
import { portalRoutes } from '../../lib/portal';
import InstallAppGuide from '../../components/InstallAppGuide';
import ThemeToggle from '../../components/ThemeToggle';

/**
 * The front door.
 *
 * Everything reaching the app at `/` lands here and picks a side: STAFF goes to
 * the employee login and the app as it has always been; DANCERS goes to the
 * parent portal, which needs no account.
 *
 * Shown on every visit, deliberately — no remembered choice. A household with a
 * dancer and a staff member shares devices, and a silent redirect into the wrong
 * half is worse than one tap.
 *
 * Both tiles are <Link>s, not Cards with onClick. Card renders a bare <div>: no
 * role, no tabIndex, no key handler, so it is unreachable by keyboard and
 * announced as nothing. These two controls are the only way into either half of
 * the product, and both are navigations, so an anchor is the honest element —
 * it also gets focus, middle-click and "open in new tab" for free. The styling
 * below mirrors Card's spec (bg.secondary, 2px bdr.primary, borderRadius.lg) so
 * it still reads as the same design system.
 */

interface TileProps {
  to: string;
  label: string;
  description: string;
  /** Drawn at 32px inside a 56px well. */
  icon: React.ReactNode;
  /** Marks the tile with the electric accent. Exactly one tile sets this. */
  accent?: boolean;
}

const ChooserTile: React.FC<TileProps> = ({ to, label, description, icon, accent = false }) => {
  const [active, setActive] = useState(false);
  const { isMobileOrTablet } = useResponsive();

  return (
    <Link
      to={to}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{
        // Card's visual contract.
        backgroundColor: theme.colors.bg.secondary,
        border: `2px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
        borderRadius: theme.borderRadius.lg,
        padding: isMobileOrTablet ? '24px 20px' : '32px 28px',
        transition: 'border-color 0.2s ease, transform 0.2s ease',
        transform: active ? 'translateY(-2px)' : 'none',

        flex: 1,
        display: 'flex',
        flexDirection: isMobileOrTablet ? 'row' : 'column',
        alignItems: isMobileOrTablet ? 'center' : 'flex-start',
        gap: isMobileOrTablet ? '16px' : '20px',
        minHeight: isMobileOrTablet ? 0 : '220px',

        textDecoration: 'none',
        textAlign: 'left',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          flexShrink: 0,
          borderRadius: theme.borderRadius.md,
          backgroundColor: accent ? theme.colors.primary : theme.colors.bg.tertiary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // On the crimson well the icon must be hardcoded white: the mode-aware
          // text tokens flip dark in light mode and vanish against the pink.
          color: accent ? '#FFFFFF' : theme.colors.txt.secondary,
        }}
      >
        {icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            ...theme.typography.h3,
            color: theme.colors.txt.primary,
            marginBottom: '6px',
          }}
        >
          {label}
        </div>
        <div
          style={{
            ...theme.typography.bodySmall,
            color: theme.colors.txt.tertiary,
            fontFamily: theme.fonts.primary,
          }}
        >
          {description}
        </div>
      </div>

      {isMobileOrTablet && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
          <path
            d="M9 18l6-6-6-6"
            style={{ stroke: theme.colors.txt.tertiary }}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </Link>
  );
};

const StaffIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M9 11a4 4 0 100-8 4 4 0 000 8zM3 21v-1a6 6 0 016-6M16 11l2 2 4-4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TeamIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChooserPage: React.FC = () => {
  const { isDark } = useTheme();
  const { isMobileOrTablet } = useResponsive();

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // .App { text-align: center } in App.css is CRA boilerplate that centres
        // every page. Undo it here, as CalendarPage and HoursInputPage do.
        textAlign: 'left',
        padding: isMobileOrTablet ? '24px 16px' : '40px',
        paddingTop: `calc(${isMobileOrTablet ? '24px' : '40px'} + env(safe-area-inset-top))`,
        paddingBottom: `calc(${isMobileOrTablet ? '24px' : '40px'} + env(safe-area-inset-bottom))`,
        gap: isMobileOrTablet ? '32px' : '48px',
      }}
    >
      {/* Logo and toggle are one group with their own tighter gap, rather than
          two children of the page. As siblings they would each take the page's
          32/48px gap, which reads as three unrelated things stacked up and
          pushes the tiles down a phone screen. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: isMobileOrTablet ? '20px' : '24px',
          width: '100%',
        }}
      >
        <img
          src={isDark ? '/brand/logos/didc-thrash-white.svg' : '/brand/logos/didc-thrash-pink.svg'}
          alt="Dancing Images Dance Center"
          style={{
            width: '100%',
            maxWidth: isMobileOrTablet ? '260px' : '380px',
            height: 'auto',
          }}
        />

        <ThemeToggle label="Appearance" />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: isMobileOrTablet ? 'column' : 'row',
          gap: '16px',
          width: '100%',
          maxWidth: isMobileOrTablet ? '440px' : '760px',
        }}
      >
        {/* Descriptions are kept to a similar length on purpose: at 375px these
            stack, and a one-line/three-line pair reads as two different
            components rather than one choice. */}
        <ChooserTile
          to="/login"
          label="Staff"
          description="Tasks, SOPs, hours and scheduling."
          icon={StaffIcon}
        />
        <ChooserTile
          to={portalRoutes.home}
          label="Dancers"
          description="Schedules, info and files."
          icon={TeamIcon}
          accent
        />
      </div>

      <InstallAppGuide />

      <p
        style={{
          ...theme.typography.caption,
          fontFamily: theme.fonts.mono,
          color: theme.colors.txt.tertiary,
          textAlign: 'center',
          margin: 0,
          maxWidth: '440px',
        }}
      >
        You are your only limit
      </p>
    </div>
  );
};

export default ChooserPage;
