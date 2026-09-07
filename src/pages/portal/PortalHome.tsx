import React from 'react';
import { Navigate } from 'react-router-dom';
import { theme } from '../../theme';
import { Card } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import NavTile from '../../components/portal/NavTile';
import { TileSkeleton } from '../../components/portal/PortalSkeleton';
import { usePortal } from '../../contexts/PortalContext';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { useHousehold } from '../../components/profile/useHousehold';
import { AttendanceSource } from '../../lib/attendanceQueries';
import { CLIENT_AUTH_ENABLED, CLIENT_AUTH_REQUIRED } from '../../lib/clientAuth';
import { ENROLLIO_URL, portalRoutes, ProgramSlug } from '../../lib/portal';

/**
 * Parent portal home — the three compartments of the studio.
 *
 * Billing & Admin leaves the app for Enrollio; the two dancer programs stay
 * here behind the studio access code — or, with client auth on, behind the
 * family sign-in. Program names come from the database, so renaming a section
 * does not need a deploy.
 */
/**
 * Live, always. This tile only ever renders for a signed-in member of staff,
 * and the question it asks — does this login have children at the studio — has
 * no fixture answer worth showing. Module scope so the cache key is stable.
 */
const LIVE_SOURCE: AttendanceSource = { source: 'live' };

/**
 * The "My Profile" tile for a member of staff who is ALSO a parent here.
 *
 * Its own component so the household read fires for STAFF ONLY. A client's
 * tile is unconditional (a client is a family by definition), and the portal
 * home is the most-visited page in the app — making every family pay three
 * sequential queries for a tile they already have would be a poor trade. The
 * read is the same cached promise the profile page uses, so a staff member who
 * follows this tile pays for it once, not twice.
 *
 * The predicate matches `showsAFamily` in profileCards (183d4b1): the
 * family view appears once there is demonstrably a family behind it, rather
 * than flashing and being taken away while the read lands. No household, no
 * tile — a teacher with no children at the studio sees the portal unchanged.
 */
const StaffFamilyTile: React.FC = () => {
  const household = useHousehold(LIVE_SOURCE);
  if ((household.data?.students.length ?? 0) === 0) return null;
  return (
    <NavTile
      label="My Profile"
      description="Your dancers, schedule and account."
      to="/portal/profile"
    />
  );
};

const PortalHome: React.FC = () => {
  const { programs, loading, error } = usePortal();
  const { loading: authLoading, hasSession, isClient, isStaff, profile } = usePortalAuth();

  // FULL LAUNCH only: the whole portal sits behind the sign-in. In the parallel
  // TEST stage (ENABLED but not REQUIRED) this page renders normally for
  // everyone — real families see the program list with no login, exactly as
  // before — and a logged-in tester additionally gets the "My Account" tile
  // below.
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
    if (!hasSession) {
      return <Navigate to="/portal/login" replace />;
    }
  }

  return (
    <PortalLayout
      title="Parent Portal"
      subtitle="Pick your section to see schedules, info and documents."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '720px' }}>
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
        {loading && <TileSkeleton count={2} withIcon={false} />}

        {error && !loading && (
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

        {!loading && !error && programs.map(program => (
          <NavTile
            key={program.id}
            label={program.name}
            description={program.blurb}
            to={portalRoutes.program(program.slug as ProgramSlug)}
          />
        ))}

        {/* One destination, not two. This tile used to point at
            /portal/account, which held the same email, the same sign-out and a
            password form that the profile's Account card already signposted —
            so the portal had two doors to the same room. Both now open the
            profile, which is where a family's dancers, schedule and attendance
            live as well. */}
        {CLIENT_AUTH_ENABLED && isClient && (
          <NavTile
            label="My Profile"
            description={profile?.email ?? 'Dancers, schedule and account.'}
            to="/portal/profile"
          />
        )}

        {/* The owner and several teachers have children at this studio. The
            profile page already serves them correctly — 183d4b1 named the
            household in the query so an admin gets their own family instead of
            all 388 students — but nothing in the portal linked to it, because
            this tile was `isClient` only. */}
        {CLIENT_AUTH_ENABLED && isStaff && <StaffFamilyTile />}
      </div>
    </PortalLayout>
  );
};

export default PortalHome;
