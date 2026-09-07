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

        {/* The family's own cards, above the navigation. A parent opening this
            on the way out of the house is asking "where do they need to be",
            not "which section of the studio". Each card handles its own
            loading and empty states, and renders nothing at all when there is
            nothing to say — so a member of staff with no children here, or a
            family whose import has not run, sees the tiles below and no gap. */}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h2 style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: theme.colors.txt.tertiary,
            margin: 0,
          }}>
            The studio
          </h2>

          {/* Always available — Enrollio has its own login, so it is not gated
              and does not depend on the program fetch. */}
          <NavTile
            label="Billing & Admin"
            description="Payments, registration and account details in Enrollio."
            href={ENROLLIO_URL}
          />

          {/* Two tiles, not three: the Billing tile above is already rendered —
              it does not wait on the program fetch — so the skeleton stands in
              for exactly what is missing. */}
          {programsLoading && <TileSkeleton count={2} withIcon={false} />}

          {error && !programsLoading && (
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
          )}

          {!programsLoading && !error && programs.map(program => (
            <NavTile
              key={program.id}
              label={program.name}
              description={program.blurb}
              to={portalRoutes.program(program.slug as ProgramSlug)}
            />
          ))}
        </div>
      </div>
    </PortalLayout>
  );
};

export default PortalHome;
