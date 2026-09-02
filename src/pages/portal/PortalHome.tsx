import React from 'react';
import { Navigate } from 'react-router-dom';
import { theme } from '../../theme';
import { Card, Spinner } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import NavTile from '../../components/portal/NavTile';
import { usePortal } from '../../contexts/PortalContext';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
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
const PortalHome: React.FC = () => {
  const { programs, loading, error } = usePortal();
  const { loading: authLoading, hasSession, isClient, profile } = usePortalAuth();

  // FULL LAUNCH only: the whole portal sits behind the sign-in. In the parallel
  // TEST stage (ENABLED but not REQUIRED) this page renders normally for
  // everyone — real families see the program list with no login, exactly as
  // before — and a logged-in tester additionally gets the "My Account" tile
  // below.
  if (CLIENT_AUTH_REQUIRED) {
    if (authLoading) {
      return (
        <PortalLayout title="Parent Portal">
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <Spinner size={32} color={theme.colors.primary} />
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

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
            <Spinner size={28} color={theme.colors.primary} />
          </div>
        )}

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
      </div>
    </PortalLayout>
  );
};

export default PortalHome;
