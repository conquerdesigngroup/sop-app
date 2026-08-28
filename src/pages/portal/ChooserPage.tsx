import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND_MARK, getThemeColors, theme } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';
import { portalRoutes } from '../../lib/portal';
import InstallAppGuide from '../../components/InstallAppGuide';
import ThemeToggle from '../../components/ThemeToggle';
import HalftoneField from '../../components/HalftoneField';

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

/**
 * The panel colour with an alpha, from the literal palette rather than the
 * `var()` token — see the theming note in CLAUDE.md, which is exactly why you
 * cannot just append '78' to theme.colors.bg.secondary.
 */
const translucentPanel = (mode: 'dark' | 'light', alpha: number) => {
  const hex = getThemeColors(mode).bg.secondary;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

interface TileProps {
  to: string;
  label: string;
  /** Drawn at 28px inside a 48/52px well. */
  icon: React.ReactNode;
  /** Marks the tile with the electric accent. Exactly one tile sets this. */
  accent?: boolean;
}

/**
 * A square, centre-stacked card: an icon over the name of the half it opens.
 *
 * It carried a line of description under the name — "Tasks, SOPs, hours and
 * scheduling" — which is a menu for a place you have not arrived at yet. The
 * two names answer the only question this screen asks, so the line came out
 * and the tile is down to the two things that make the choice.
 *
 * It used to be a wide left-aligned slab on desktop and a row with a chevron on
 * a phone — two different objects doing one job, and neither of them a shape.
 * Squares read as a matched pair of choices at a glance, which is the whole
 * point of this screen.
 *
 * minHeight rather than aspect-ratio. A fixed ratio derives the height from the
 * width and then lets the contents spill out of it when they do not fit, which
 * at 320px they very nearly do; minHeight gives the same square at every width
 * that matters and simply grows on the one that does not. A tile a few pixels
 * off square beats a description hanging out of the bottom of one.
 */
const ChooserTile: React.FC<TileProps> = ({ to, label, icon, accent = false }) => {
  const [active, setActive] = useState(false);
  const { isMobileOrTablet } = useResponsive();
  const { mode } = useTheme();
  const well = isMobileOrTablet ? '48px' : '52px';

  return (
    <Link
      to={to}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{
        // Card's visual contract, with one deliberate departure: the panel is
        // translucent and blurs what is behind it, so the halftone field passes
        // under the tiles instead of stopping dead at their edges. At 0.78 over
        // the void the text contrast is unchanged; the blur is over two small
        // boxes, not the page, so it costs almost nothing.
        backgroundColor: translucentPanel(mode, 0.78),
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        border: `2px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
        borderRadius: theme.borderRadius.lg,
        padding: isMobileOrTablet ? '16px 12px' : '24px 20px',
        transition: 'border-color 0.2s ease, transform 0.2s ease',
        transform: active ? 'translateY(-2px)' : 'none',

        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isMobileOrTablet ? '10px' : '16px',
        minHeight: isMobileOrTablet ? '158px' : '236px',
        // A grid item will not shrink below its content's min-content width
        // without this, and then the row overflows instead of the cell.
        minWidth: 0,

        textDecoration: 'none',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: well,
          height: well,
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

      <div
        style={{
          ...theme.typography.h3,
          fontSize: isMobileOrTablet ? '17px' : undefined,
          color: theme.colors.txt.primary,
          minWidth: 0,
          // Two words in a 138px cell at 320px. It breaks at the space on its
          // own; this covers the case where it cannot — see the
          // flex/min-content note in CLAUDE.md.
          overflowWrap: 'anywhere',
        }}
      >
        {label}
      </div>
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
  const { isMobileOrTablet } = useResponsive();

  return (
    <div
      style={{
        minHeight: '100dvh',
        // The field behind the content is fixed and sits at z-index -1. Making
        // this a stacking context is what puts it reliably above the page
        // background and below everything on the page, without every child
        // having to opt into a layer of its own.
        position: 'relative',
        isolation: 'isolate',
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
      <HalftoneField />

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
        {/* The same mark the app wears in its top-left corner, rather than a
            second wordmark that only this screen used. One mark for both modes
            — it carries its own black keyline, which is why there is no isDark
            ternary here and must not be one added. See BRAND_MARK in theme.ts.

            It is squatter than the wordmark it replaces (4.6:1 against 3.9:1),
            so the widths go up to keep the same presence at the top of the
            page. 400px on a 3x phone asks for 1200 device pixels against the
            file's 1468, so it is still drawn under its native size. */}
        <img
          src={BRAND_MARK}
          alt="Dancing Images Dance Center"
          style={{
            width: '100%',
            maxWidth: isMobileOrTablet ? '300px' : '440px',
            height: 'auto',
          }}
        />

        <ThemeToggle />
      </div>

      {/* Two equal columns at every width, not a row that stacks. Two squares
          side by side ARE the choice — stacking them turns one decision into a
          list you read top to bottom. 1fr twice rather than flex so the pair
          stays exactly equal whatever is written inside them. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: isMobileOrTablet ? '12px' : '20px',
          width: '100%',
          maxWidth: isMobileOrTablet ? '400px' : '520px',
        }}
      >
        {/* Both labels are two words of the same shape on purpose: they sit
            side by side at every width, and a one-word/two-word pair reads as
            two different components rather than one choice. */}
        <ChooserTile to="/login" label="Staff Portal" icon={StaffIcon} />
        <ChooserTile to={portalRoutes.home} label="Dancer Portal" icon={TeamIcon} accent />
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
