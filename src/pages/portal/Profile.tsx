import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { theme } from '../../theme';
import PortalLayout from '../../components/portal/PortalLayout';
import SegmentedControl from '../../components/profile/SegmentedControl';
import { portalRoutes } from '../../lib/portal';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { ATTENDANCE_LIVE, AttendanceSource } from '../../lib/attendanceQueries';
import { FIXTURE_SCENARIOS, FixtureScenario } from '../../lib/attendanceFixture';
import { ProfileContext, UNLOCKABLES_ENABLED, orderedCards } from '../../lib/profileCards';

/**
 * The profile page (§5.1).
 *
 * IT RENDERS THE REGISTRY AND NOTHING ELSE
 *
 * There is no feature logic below — no attendance query, no avatar state, no
 * knowledge of what a card contains. That is the whole design: the next feature
 * to land on the profile adds a file and a registry entry, and this file is not
 * touched. If you find yourself editing it to add a card, the registry is the
 * thing to edit instead.
 *
 * THE DEMO SWITCHER
 *
 * The v32 attendance tables do not exist yet, so the cards read the in-repo
 * seed fixture. While that is true the page offers a scenario picker, because
 * the states that actually matter here — no children linked, no classes, a
 * class that has not met — are the ones a real account cannot easily be put
 * into, and a state nobody can look at is a state nobody designs. It disappears
 * the moment REACT_APP_ATTENDANCE_LIVE is set, and it is never registered in a
 * production build without a session (see the redirect below).
 */

const DEMO_ALLOWED = !ATTENDANCE_LIVE && process.env.NODE_ENV !== 'production';

const Profile: React.FC = () => {
  const { loading, hasSession, isStaff, profile } = usePortalAuth();
  const [scenario, setScenario] = useState<FixtureScenario>('guardian');

  const source: AttendanceSource = useMemo(
    () => (ATTENDANCE_LIVE ? { source: 'live' } : { source: 'fixture', scenario }),
    [scenario],
  );

  const ctx: ProfileContext = useMemo(() => ({
    // A student login sees only itself. The fixture carries that distinction so
    // the switcher-less student view can be reviewed before real logins exist.
    memberType: scenario === 'student' ? 'student' : 'guardian',
    isStaff: !!isStaff,
    source,
    flags: { unlockables: UNLOCKABLES_ENABLED },
  }), [scenario, isStaff, source]);

  const cards = useMemo(() => orderedCards(ctx), [ctx]);

  if (loading) return <PortalLayout title="Profile" backTo={portalRoutes.home}><div /></PortalLayout>;

  // A real deployment sends a signed-out visitor to the login, exactly as
  // /portal/account does. Locally the demo stands in, so the page is reviewable
  // without a client account existing yet.
  if (!hasSession && !DEMO_ALLOWED) {
    return <Navigate to="/portal/login" state={{ from: '/portal/profile' }} replace />;
  }

  const demo = !hasSession && DEMO_ALLOWED;

  return (
    <PortalLayout title="Profile" backTo={portalRoutes.home}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
        maxWidth: '560px',
      }}>
        {!ATTENDANCE_LIVE && (
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
              Demo data · no attendance tables yet
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

        {cards.map(card => {
          const Component = card.component;
          return (
            <Component
              key={card.id}
              ctx={ctx}
              firstName={profile?.firstName ?? (demo ? 'Rosa' : '')}
              lastName={profile?.lastName ?? (demo ? 'Alvarez' : '')}
              email={profile?.email ?? (demo ? 'alvarez.family@example.com' : '')}
            />
          );
        })}
      </div>
    </PortalLayout>
  );
};

export default Profile;
