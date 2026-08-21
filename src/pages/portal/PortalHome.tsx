import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import PortalLayout from '../../components/portal/PortalLayout';
import { PROGRAMS, ENROLLIO_URL, portalRoutes } from '../../lib/portal';

/**
 * Parent portal home — the three compartments of the studio.
 *
 * Billing & Admin leaves the app entirely for Enrollio; the two dancer programs
 * stay here and sit behind the studio access code (v9).
 */

interface TileProps {
  label: string;
  description: string;
  /** Internal route. Mutually exclusive with `href`. */
  to?: string;
  /** External destination. Opens in a new tab. */
  href?: string;
}

const PortalTile: React.FC<TileProps> = ({ label, description, to, href }) => {
  const [active, setActive] = useState(false);
  const { isMobileOrTablet } = useResponsive();

  const interaction = {
    onMouseEnter: () => setActive(true),
    onMouseLeave: () => setActive(false),
    onFocus: () => setActive(true),
    onBlur: () => setActive(false),
  };

  // Mirrors Card's visual contract. Card itself is a bare <div> even when given
  // an onClick — no role, no tabIndex, no key handler — so navigation tiles use
  // real anchors instead and keep keyboard access, focus and middle-click.
  const style: React.CSSProperties = {
    backgroundColor: theme.colors.bg.secondary,
    border: `2px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.lg,
    padding: isMobileOrTablet ? '20px' : '24px',
    transition: 'border-color 0.2s ease, transform 0.2s ease',
    transform: active ? 'translateY(-2px)' : 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    textDecoration: 'none',
    textAlign: 'left',
    // Contains the visually-hidden "opens in a new tab" note below; without a
    // positioned ancestor it would resolve against the viewport.
    position: 'relative',
  };

  const body = (
    <>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            ...theme.typography.h3,
            color: theme.colors.txt.primary,
            marginBottom: '4px',
          }}
        >
          {label}
        </div>
        <div
          style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.tertiary,
          }}
        >
          {description}
        </div>
      </div>

      {href ? (
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
      ) : (
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
    </>
  );

  if (href) {
    return (
      /* rel="noopener noreferrer" is required alongside target="_blank":
         without noopener the opened page can reach back through window.opener
         and navigate this tab elsewhere. The destination is a login screen —
         exactly the thing worth impersonating. */
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

const PortalHome: React.FC = () => {
  return (
    <PortalLayout
      title="Parent Portal"
      subtitle="Pick your section to see schedules, updates and documents."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '720px' }}>
        <PortalTile
          label="Billing & Admin"
          description="Payments, registration and account details in Enrollio."
          href={ENROLLIO_URL}
        />

        {PROGRAMS.map(program => (
          <PortalTile
            key={program.slug}
            label={program.name}
            description={program.blurb}
            to={portalRoutes.program(program.slug)}
          />
        ))}
      </div>
    </PortalLayout>
  );
};

export default PortalHome;
