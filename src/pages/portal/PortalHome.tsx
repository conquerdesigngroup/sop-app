import React from 'react';
import { theme } from '../../theme';
import { Card, Spinner } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import NavTile from '../../components/portal/NavTile';
import { usePortal } from '../../contexts/PortalContext';
import { ENROLLIO_URL, portalRoutes, ProgramSlug } from '../../lib/portal';

/**
 * Parent portal home — the three compartments of the studio.
 *
 * Billing & Admin leaves the app for Enrollio; the two dancer programs stay
 * here behind the studio access code. Program names come from the database, so
 * renaming a section does not need a deploy.
 */
const PortalHome: React.FC = () => {
  const { programs, loading, error } = usePortal();

  return (
    <PortalLayout
      title="Parent Portal"
      subtitle="Pick your section to see schedules, updates and documents."
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
      </div>
    </PortalLayout>
  );
};

export default PortalHome;
