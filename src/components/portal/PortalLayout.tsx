import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { theme, BRAND_MARK } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { ProgramSlug, portalRoutes } from '../../lib/portal';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { CLIENT_AUTH_ENABLED } from '../../lib/clientAuth';
import { recordInstallPing } from '../../lib/displayMode';
import PortalBottomNav from './PortalBottomNav';

/**
 * Shell for every parent-portal page.
 *
 * The portal has its own chrome. The staff Navigation and BottomNavigation are
 * gated on `isAuthenticated`, so they stay hidden for parents on their own — but
 * a signed-in admin previewing the portal would otherwise see staff nav bleed
 * through, and App.tsx additionally suppresses it on /portal paths.
 *
 * Mobile-first: this is overwhelmingly opened on a phone, often from a home
 * screen icon, so the header is compact and the safe-area insets are honoured.
 * Those insets only resolve because `viewport-fit=cover` was added to
 * public/index.html — without it env(safe-area-inset-*) evaluates to 0.
 *
 * THE HEADER PUBLISHES ITS OWN HEIGHT
 *
 * It is `position: sticky; top: 0`, so anything else that wants to stick has to
 * stick BELOW it — and its height is not a constant: the safe-area inset is 0
 * in a browser tab and 47px on a notched phone in standalone mode, and it can
 * change without a reload when the app is rotated. A ResizeObserver writes the
 * measured height to `--portal-header-h` on the page root, and the class
 * schedule's day strip uses it for `top`. Hard-coding a number here means the
 * strip either floats a gap below the header or hides under it, and which one
 * you get depends on the device.
 */

interface PortalLayoutProps {
  /** Page title. Rendered in the Kanit display face, which uppercases it. */
  title: string;
  subtitle?: string;
  /**
   * Destination for the back chevron. Omit on the portal home, which is the
   * top of this section — the chooser is reachable from the logo instead.
   */
  backTo?: string;
  /**
   * Program this page belongs to. Shows the section tab bar on mobile.
   * Omitted on the portal home and on the access gate, neither of which has a
   * section to navigate within yet.
   */
  slug?: ProgramSlug;
  children: React.ReactNode;
}

const PortalLayout: React.FC<PortalLayoutProps> = ({ title, subtitle, backTo, slug, children }) => {
  const { isMobileOrTablet } = useResponsive();
  const showTabs = !!slug && isMobileOrTablet;
  // Any portal session gets a persistent way out. Gated on the flag so the
  // access-code-only portal (no sessions) shows nothing. hasSession is true for
  // a client and for staff previewing — both need to be able to sign out, and
  // The profile handles which is which: a client gets the full set of cards, a
  // staff member previewing the portal gets identity and the way out.
  const { hasSession } = usePortalAuth();
  const showAccount = CLIENT_AUTH_ENABLED && hasSession;

  const headerRef = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Anonymous, once per browser per day: is this a Home Screen app or a tab?
  //
  // It lives here rather than in index.tsx because the number that matters is
  // the PARENT install rate, and this shell wraps every parent-facing page and
  // nothing else. Counting staff sessions would dilute the very figure the
  // measurement exists to produce. See lib/displayMode.ts for why we need it —
  // iOS web push reaches installed apps only — and the v32 migration for how
  // little is stored.
  useEffect(() => {
    void recordInstallPing();
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    const root = rootRef.current;
    if (!header || !root) return;

    const publish = () => {
      root.style.setProperty('--portal-header-h', `${Math.round(header.getBoundingClientRect().height)}px`);
    };
    publish();

    // Not available in jsdom, and not worth a polyfill: the fallback in the
    // consumer's `top` covers a browser that never fires this.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        // Undo .App { text-align: center } from App.css.
        textAlign: 'left',
      }}
    >
      <header
        ref={headerRef}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backgroundColor: theme.colors.bg.primary,
          borderBottom: `2px solid ${theme.colors.bdr.primary}`,
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div
          style={{
            maxWidth: theme.pageLayout.maxWidth,
            margin: '0 auto',
            padding: isMobileOrTablet ? '12px 16px' : '16px 40px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {backTo && (
            <Link
              to={backTo}
              aria-label="Back"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                flexShrink: 0,
                marginLeft: '-8px',
                borderRadius: theme.borderRadius.md,
                color: theme.colors.txt.secondary,
                textDecoration: 'none',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M15 18l-6-6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          )}

          {/* The mark returns to the chooser, so a parent who picked the wrong
              side is never stranded. */}
          <Link to={portalRoutes.chooser} style={{ display: 'flex', flexShrink: 0 }} aria-label="DIDC home">
            <img
              src={BRAND_MARK}
              alt="Dancing Images Dance Center"
              style={{ height: '22px', width: 'auto' }}
            />
          </Link>

          {/* Right cluster: the section label and the account button. The
              cluster owns the marginLeft:auto so both sit at the right edge
              whether one or both are present. */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Orientation for sub-pages, where the h1 is a program name and
                nothing else says which half of the app you are in. Suppressed on
                the portal home, whose own h1 already reads "Parent Portal" —
                printing it twice just eats vertical space on a phone. */}
            {backTo && (
              <span
                style={{
                  ...theme.typography.captionSmall,
                  fontFamily: theme.fonts.mono,
                  color: theme.colors.txt.tertiary,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Parent Portal
              </span>
            )}

            {showAccount && (
              <Link
                // The profile is the signed-in home — identity, what's on next,
                // attendance, updates, files, and the Account card carrying the
                // email, password change and sign-out. /portal/account redirects
                // here, so this icon and the home tile lead to one place rather
                // than two doors onto the same room.
                to="/portal/profile"
                aria-label="My profile"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  flexShrink: 0,
                  marginRight: '-6px',
                  borderRadius: theme.borderRadius.full,
                  border: `1px solid ${theme.colors.bdr.primary}`,
                  color: theme.colors.txt.secondary,
                  textDecoration: 'none',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          width: '100%',
          maxWidth: theme.pageLayout.maxWidth,
          margin: '0 auto',
          padding: isMobileOrTablet ? '24px 16px' : '40px',
          // Clear the fixed tab bar (60px) when it is showing, otherwise the
          // last card sits underneath it and looks cut off.
          paddingBottom: showTabs
            ? `calc(84px + env(safe-area-inset-bottom))`
            : `calc(${isMobileOrTablet ? '24px' : '40px'} + env(safe-area-inset-bottom))`,
        }}
      >
        <div style={{ marginBottom: isMobileOrTablet ? '24px' : '32px' }}>
          <h1
            style={{
              ...(isMobileOrTablet ? theme.typography.h1Mobile : theme.typography.h1),
              color: theme.colors.txt.primary,
              margin: 0,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                ...theme.typography.subtitle,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.tertiary,
                margin: '8px 0 0',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {children}
      </main>

      {showTabs && <PortalBottomNav slug={slug!} />}
    </div>
  );
};

export default PortalLayout;
