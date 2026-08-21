import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { theme } from '../../theme';
import { Card } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import { getProgram, portalRoutes } from '../../lib/portal';

/**
 * A single program's portal section — All-Stars or Academy/TNT.
 *
 * Phase 1 renders the section frame and an honest placeholder. Phase 2 replaces
 * the body with the access-code gate and the four content areas (classes,
 * updates, documents, calendar) once the v9 tables exist.
 */
const ProgramHome: React.FC = () => {
  const { program: slug } = useParams<{ program: string }>();
  const program = getProgram(slug);

  // The slug reaches the database as a filter value in Phase 2, so it is
  // validated against the known set rather than trusted from the URL.
  if (!program) {
    return <Navigate to={portalRoutes.home} replace />;
  }

  return (
    <PortalLayout title={program.name} subtitle={program.blurb} backTo={portalRoutes.home}>
      <Card style={{ maxWidth: '720px' }}>
        <div
          style={{
            ...theme.typography.h3,
            color: theme.colors.txt.primary,
            marginBottom: '8px',
          }}
        >
          Coming soon
        </div>
        <p
          style={{
            ...theme.typography.body,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.secondary,
            margin: '0 0 16px',
          }}
        >
          Class schedules, teacher updates, downloads and the {program.name} calendar
          are being set up here. In the meantime, payments and registration are in
          Billing &amp; Admin.
        </p>
        <p
          style={{
            ...theme.typography.caption,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            margin: 0,
          }}
        >
          Questions? Ask us at the front desk.
        </p>
      </Card>
    </PortalLayout>
  );
};

export default ProgramHome;
