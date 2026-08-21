import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { theme } from '../../theme';
import { ProgramSlug, portalRoutes } from '../../lib/portal';

/**
 * Bottom tab bar for a program section.
 *
 * Deliberately separate from the staff BottomNavigation rather than a
 * generalisation of it: that one is gated on isAuthenticated, hard-codes five
 * staff routes, and uses imperative navigate() calls. These are <Link>s so a
 * parent can long-press to open a tab, and so keyboard focus works at all.
 *
 * Only rendered on mobile and tablet; the desktop layout puts the same
 * destinations in the page body.
 */

interface Props {
  slug: ProgramSlug;
}

interface Item {
  label: string;
  to: string;
  icon: React.ReactNode;
  /** Matched as a prefix so a class detail page still highlights Classes. */
  match: string;
  /** Overview is the section root and must match exactly, or it is always active. */
  exact?: boolean;
}

const icon = (d: string) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PortalBottomNav: React.FC<Props> = ({ slug }) => {
  const { pathname } = useLocation();

  const items: Item[] = [
    {
      label: 'Overview',
      to: portalRoutes.program(slug),
      match: portalRoutes.program(slug),
      exact: true,
      icon: icon('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10'),
    },
    {
      label: 'Classes',
      to: portalRoutes.classes(slug),
      match: portalRoutes.classes(slug),
      icon: icon('M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87'),
    },
    {
      label: 'Updates',
      to: portalRoutes.updates(slug),
      match: portalRoutes.updates(slug),
      icon: icon('M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0'),
    },
    {
      label: 'Files',
      to: portalRoutes.documents(slug),
      match: portalRoutes.documents(slug),
      icon: icon('M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7'),
    },
    {
      label: 'Calendar',
      to: portalRoutes.calendar(slug),
      match: portalRoutes.calendar(slug),
      icon: icon('M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z M16 2v4 M8 2v4 M3 10h18'),
    },
  ];

  return (
    <nav
      aria-label="Portal sections"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        backgroundColor: theme.colors.bg.secondary,
        borderTop: `1px solid ${theme.colors.bdr.primary}`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div
        style={{
          maxWidth: '560px',
          margin: '0 auto',
          height: '60px',
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        {items.map(item => {
          const active = item.exact
            ? pathname === item.match
            : pathname.startsWith(item.match);

          return (
            <Link
              key={item.label}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                textDecoration: 'none',
                color: active ? theme.colors.primary : theme.colors.txt.tertiary,
                transition: 'color 0.15s ease',
              }}
            >
              {item.icon}
              <span
                style={{
                  fontFamily: theme.fonts.primary,
                  fontSize: '11px',
                  fontWeight: active ? 700 : 500,
                  letterSpacing: '0.01em',
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default PortalBottomNav;
