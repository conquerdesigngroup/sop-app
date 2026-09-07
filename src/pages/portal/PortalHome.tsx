import React from 'react';
import { Navigate } from 'react-router-dom';
import { theme } from '../../theme';
import { Card } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import NavTile from '../../components/portal/NavTile';
import { TileSkeleton } from '../../components/portal/PortalSkeleton';
import SegmentedControl from '../../components/profile/SegmentedControl';
import { DEMO_ALLOWED, usePortalCards } from '../../components/profile/usePortalCards';
import { usePortal } from '../../contexts/PortalContext';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { useRefreshable } from '../../contexts/RefreshContext';
import { FIXTURE_SCENARIOS } from '../../lib/attendanceFixture';
import { CLIENT_AUTH_ENABLED, CLIENT_AUTH_REQUIRED } from '../../lib/clientAuth';
import { ENROLLIO_URL, portalRoutes, ProgramSlug } from '../../lib/portal';

/**
 * The parent portal home — the family's dashboard.
 *
 * WHAT CHANGED, AND WHY IT WAS WRONG BEFORE
 *
 * This page used to be four nav tiles and nothing else, while everything a
 * parent actually opens the app for — what is on next, who is dancing, this
 * week's updates, the files that need signing — sat one tap down behind a tile
 * labelled "My Profile", underneath an avatar builder. So the most-visited page
 * in the app answered no question at all, and the page that answered every
 * question was named after the one thing on it nobody visits.
 *
 * The two have swapped. This is the dashboard; /portal/profile is now the
 * account page. Neither page knows what a card contains — both render the
 * registry, filtered by surface. See lib/profileCards.
 *
 * ONE READ, NOT SEVEN
 *
 * Every card here resolves from the same cached household promise (see
 * useHousehold), so a dashboard with six cards on it makes the same three
 * queries the profile used to. The old comment on this page — that making every
 * family pay for a household read would be a poor trade for a single tile — was
 * right about the tile and is simply no longer the trade being made: the read
 * is now what the page is for.
 *
 * A STUDENT LOGIN SEES ONE DANCER
 *
 * Not enforced here, and deliberately not: `portal_household_members` pins a
 * student member to a single student_id, loadHouseholdSummary asks for only
 * that row, and RLS refuses the rest. The dashboard renders whatever comes
 * back.
 */

const icon = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * A glyph per program, keyed by SLUG rather than by name.
 *
 * Names live in portal_programs and the studio may rename a section without a
 * deploy; the slugs are typed constants that routes are already built from, so
 * they are the stable thing to key on. A slug added to the database before it
 * is added here falls back rather than rendering an empty box.
 */
const PROGRAM_ICON: Partial<Record<ProgramSlug, React.ReactNode>> = {
  // Star: the competition teams.
  allstars: icon('M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z'),
  // Mortarboard: the class program.
  academy: icon('M22 10L12 5 2 10l10 5 10-5z M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5'),
};

const PROGRAM_ICON_FALLBACK = icon('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10');

const PortalHome: React.FC = () => {
  const { programs, loading: programsLoading, error } = usePortal();
  const { loading: authLoading, hasSession } = usePortalAuth();
  const {
    cards,
    ctx,
    identity,
    showScenarioPicker,
    scenario,
    setScenario,
    refreshHousehold,
  } = usePortalCards('dashboard');

  /**
   * The household is a source the refresh button would otherwise lie about.
   *
   * Programs were registered (PortalContext) and the family's own data was not,
   * which mattered far less when this page was four static tiles. Now it is the
   * page a parent pulls down on. Enabled only where there is a session to read
   * a household for — a portal running on the access code alone has none.
   */
  useRefreshable(refreshHousehold, CLIENT_AUTH_ENABLED && hasSession);

  // FULL LAUNCH only: the whole portal sits behind the sign-in. In the parallel
  // TEST stage (ENABLED but not REQUIRED) this page renders normally for
  // everyone — real families see the program list with no login, exactly as
  // before — and a logged-in tester additionally gets their dashboard cards.
  if (CLIENT_AUTH_REQUIRED) {
    if (authLoading) {
      return (
        <PortalLayout title="Parent Portal">
          <div style={{ maxWidth: '720px' }}>
            <TileSkeleton count={3} withIcon={false} />
          </div>
        </PortalLayout>
      );
    }
    // DEMO_ALLOWED is false in any production build — NODE_ENV decides it, not
    // an env var — so a real family signed out still lands on the login. It is
    // here so the dashboard is reviewable locally under the launch flags: this
    // page now hosts the fixture cards, and the whole point of the fixture is
    // that a state nobody can look at is a state nobody designs. Profile.tsx
    // carried the same escape while it held these cards.
    if (!hasSession && !DEMO_ALLOWED) {
      return <Navigate to="/portal/login" replace />;
    }
  }

  const greeting = identity.firstName ? `Hi, ${identity.firstName}` : 'Parent Portal';

  return (
    <PortalLayout
      title={greeting}
      // Signed out, or a member of staff with no children here, there are no
      // dancers to promise — so the page says what it actually holds, which is
      // the sentence it carried before it was a dashboard.
      subtitle={cards.length
        ? 'Everything for your dancers, and the sections of the studio.'
        : 'Pick your section to see schedules, info and documents.'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '720px' }}>
        {showScenarioPicker && (
          <div style={{
            border: `1px dashed ${theme.colors.bdr.secondary}`,
            borderRadius: theme.borderRadius.lg,
            padding: theme.spacing.md,
            background: theme.colors.bg.secondary,
          }}>
            <p style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.mono,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: theme.colors.txt.tertiary,
              margin: `0 0 ${theme.spacing.xs}`,
            }}>
              Demo data · development build only
            </p>
            <SegmentedControl
              options={FIXTURE_SCENARIOS.map(s => ({ value: s.value, label: s.label }))}
              value={scenario}
              onChange={setScenario}
              ariaLabel="Demo scenario"
            />
            <p style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.tertiary,
              margin: `${theme.spacing.xs} 0 0`,
            }}>
              {FIXTURE_SCENARIOS.find(s => s.value === scenario)?.hint}
            </p>
          </div>
        )}

        {/* The three destinations, side by side, above everything.
            
            They were a vertical list at the FOOT of the page, which put the
            studio's own sections below a dashboard that can run to seven cards
            — so the one thing on this page that is pure navigation was the one
            thing you had to scroll to reach. Three across is the whole set in
            a single glance and about 100px of height instead of 400.

            A grid rather than a flex row, and `minmax(0, 1fr)` rather than
            `1fr`: a grid track's floor is min-content, so plain `1fr` refuses
            to shrink below the longest word in "Academy / TNT Dancers" and
            pushes the third tile off the right edge at 320px. This is the grid
            spelling of the `minWidth: 0` rule in CLAUDE.md, and it is paired
            with `overflowWrap` inside the tile for the same reason: one
            without the other still overflows. */}
        <nav aria-label="Studio sections">
          <h2 style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: theme.colors.txt.tertiary,
            margin: `0 0 ${theme.spacing.sm}`,
          }}>
            The studio
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: theme.spacing.sm,
            alignItems: 'stretch',
          }}>
            {/* Always available — Enrollio has its own login, so it is not
                gated and does not depend on the program fetch. */}
            <NavTile
              compact
              label="Billing & Admin"
              href={ENROLLIO_URL}
              icon={icon('M2 10h20 M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z')}
            />

            {/* Two tiles, not three: the Billing tile above is already
                rendered — it does not wait on the program fetch — so the
                skeleton stands in for exactly what is missing. */}
            {programsLoading && <TileSkeleton count={2} withIcon={false} />}

            {!programsLoading && !error && programs.map(program => (
              <NavTile
                compact
                key={program.id}
                label={program.name}
                to={portalRoutes.program(program.slug as ProgramSlug)}
                icon={PROGRAM_ICON[program.slug as ProgramSlug] ?? PROGRAM_ICON_FALLBACK}
              />
            ))}
          </div>

          {error && !programsLoading && (
            <div style={{ marginTop: theme.spacing.sm }}>
              <Card>
                <p style={{
                  ...theme.typography.body,
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.txt.secondary,
                  margin: 0,
                }}>
                  {error}
                </p>
              </Card>
            </div>
          )}
        </nav>

        {/* The family's own cards, below the three studio tiles.
            
            The tiles go first because they are fixed, tiny and the same every
            visit — a stable strip you aim at without reading. The cards below
            are what a parent came to read, starting with what is on next and
            what the studio has just announced. Each handles its own loading
            and empty states and renders nothing at all when there is nothing
            to say, so a member of staff with no children here sees the tiles
            above and no gap where a dashboard would be. */}
        {cards.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            {cards.map(card => {
              const Component = card.component;
              return (
                <Component
                  key={card.id}
                  ctx={ctx}
                  firstName={identity.firstName}
                  lastName={identity.lastName}
                  email={identity.email}
                />
              );
            })}
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default PortalHome;
