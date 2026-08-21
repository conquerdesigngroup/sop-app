import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';

/**
 * A large navigation tile, used on the portal home and each program overview.
 *
 * Not built on Card. Card renders a bare <div> even when given an onClick — no
 * role, no tabIndex, no key handler — so a Card used as navigation is invisible
 * to the keyboard and announced as nothing. These are real anchors, styled to
 * Card's spec (bg.secondary, 2px bdr.primary, borderRadius.lg), which also
 * gives middle-click and "open in new tab" for free.
 */

interface NavTileProps {
  label: string;
  description?: string;
  /** Internal route. Mutually exclusive with `href`. */
  to?: string;
  /** External destination. Opens in a new tab with the usual protections. */
  href?: string;
  icon?: React.ReactNode;
  /** Right-hand text, e.g. a count. */
  meta?: string;
}

const NavTile: React.FC<NavTileProps> = ({ label, description, to, href, icon, meta }) => {
  const [active, setActive] = useState(false);
  const { isMobileOrTablet } = useResponsive();

  const interaction = {
    onMouseEnter: () => setActive(true),
    onMouseLeave: () => setActive(false),
    onFocus: () => setActive(true),
    onBlur: () => setActive(false),
  };

  const style: React.CSSProperties = {
    backgroundColor: theme.colors.bg.secondary,
    border: `2px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.lg,
    padding: isMobileOrTablet ? '18px' : '22px',
    transition: 'border-color 0.2s ease, transform 0.2s ease',
    transform: active ? 'translateY(-2px)' : 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    textDecoration: 'none',
    textAlign: 'left',
    position: 'relative',
  };

  const chevron = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
      <path
        d="M9 18l6-6-6-6"
        style={{ stroke: theme.colors.txt.tertiary }}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const external = (
    /* Box-with-arrow: the conventional "opens in a new tab" affordance. */
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
      <path
        d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"
        style={{ stroke: theme.colors.txt.tertiary }}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const body = (
    <>
      {icon && (
        <span
          style={{
            width: '40px',
            height: '40px',
            flexShrink: 0,
            borderRadius: theme.borderRadius.md,
            backgroundColor: theme.colors.bg.tertiary,
            color: theme.colors.txt.secondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
      )}

      <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
        <span
          style={{
            ...theme.typography.h3,
            color: theme.colors.txt.primary,
            display: 'block',
            marginBottom: description ? '4px' : 0,
          }}
        >
          {label}
        </span>
        {description && (
          <span
            style={{
              ...theme.typography.bodySmall,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.tertiary,
              display: 'block',
            }}
          >
            {description}
          </span>
        )}
      </span>

      {meta && (
        <span
          style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            flexShrink: 0,
          }}
        >
          {meta}
        </span>
      )}

      {href ? external : chevron}
    </>
  );

  if (href) {
    return (
      /* rel="noopener noreferrer" is required alongside target="_blank": without
         noopener the opened page can reach back through window.opener and
         navigate this tab elsewhere. */
      <a href={href} target="_blank" rel="noopener noreferrer" style={style} {...interaction}>
        {body}
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          (opens in a new tab)
        </span>
      </a>
    );
  }

  return (
    <Link to={to!} style={style} {...interaction}>
      {body}
    </Link>
  );
};

export default NavTile;
