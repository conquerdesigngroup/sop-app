import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';

/**
 * A navigation tile, used on the portal home and each program overview.
 *
 * TWO SHAPES
 *
 * The default is a full-width row: icon, label, description, chevron. `compact`
 * is the same tile turned into a square — icon over label, centred, no
 * description — so three of them fit across a phone. The dashboard uses compact
 * for the three studio destinations at the top of the page, where they are
 * navigation rather than reading, and the row form everywhere else.
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
  /**
   * Square, centred, icon-over-label. Drops `description` and `meta`, which do
   * not fit — pass them anyway and they are simply not rendered, so a caller
   * can flip this without rewriting the call.
   */
  compact?: boolean;
}

const NavTile: React.FC<NavTileProps> = ({ label, description, to, href, icon, meta, compact }) => {
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
    transition: 'border-color 0.2s ease, transform 0.2s ease',
    transform: active ? 'translateY(-2px)' : 'none',
    display: 'flex',
    textDecoration: 'none',
    position: 'relative',
    ...(compact
      ? {
          // Narrower side padding than the row form, because at 320px each of
          // three tiles has about 90px to work with and the label needs all of
          // it. justifyContent centres the stack vertically so tiles whose
          // labels wrap to different line counts still agree.
          padding: '14px 8px',
          flexDirection: 'column' as const,
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          textAlign: 'center' as const,
          minWidth: 0,
        }
      : {
          padding: isMobileOrTablet ? '18px' : '22px',
          alignItems: 'center',
          gap: '14px',
          textAlign: 'left' as const,
        }),
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

  /* Same affordance as `external`, sized for a compact tile's corner. */
  const externalSmall = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
      <path
        d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"
        style={{ stroke: theme.colors.txt.tertiary }}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const body = compact ? (
    <>
      {icon && (
        <span
          style={{
            width: '36px',
            height: '36px',
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

      {/* Program names come from portal_programs, so this label is arbitrary
          text of arbitrary length — "Academy / TNT Dancers" is already 21
          characters in a 90px box at 320px. minWidth:0 lets the box shrink
          below its content, overflowWrap breaks a word that still will not
          fit, and the two are only useful together (CLAUDE.md, rule 3). */}
      <span
        style={{
          ...theme.typography.h3,
          // 13px is what a 90px tile at 320px can carry; on a desktop the same
          // tile is 240px wide and 13px reads as an afterthought.
          fontSize: isMobileOrTablet ? '13px' : '16px',
          lineHeight: 1.25,
          color: theme.colors.txt.primary,
          display: 'block',
          minWidth: 0,
          overflowWrap: 'anywhere',
        }}
      >
        {label}
      </span>

      {href && (
        <span style={{ position: 'absolute', top: '6px', right: '6px', display: 'flex' }}>
          {externalSmall}
        </span>
      )}
    </>
  ) : (
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
