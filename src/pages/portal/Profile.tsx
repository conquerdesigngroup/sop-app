import React from 'react';
import { Navigate } from 'react-router-dom';
import { theme } from '../../theme';
import PortalLayout from '../../components/portal/PortalLayout';
import { portalRoutes } from '../../lib/portal';
import { DEMO_ALLOWED, usePortalCards } from '../../components/profile/usePortalCards';

/**
 * The account page (§5.1).
 *
 * IT RENDERS THE REGISTRY AND NOTHING ELSE
 *
 * There is no feature logic below — no attendance query, no avatar state, no
 * knowledge of what a card contains. That is the whole design: the next thing
 * to land on this page adds a file and a registry entry, and this file is not
 * touched. If you find yourself editing it to add a card, the registry is the
 * thing to edit instead.
 *
 * WHAT THIS PAGE IS NOT, ANY MORE
 *
 * It used to be the signed-in home: identity AND what's on next AND attendance
 * AND updates AND files, with the account controls at the bottom of a long
 * scroll. All of that now opens on /portal, where a family lands, and this page
 * keeps what a parent comes here on purpose to change — who they are, their
 * password, their notifications. See the surface split in lib/profileCards.
 *
 * It costs no household read as a result. Nothing here asks who the dancers
 * are, so nothing here waits for the answer.
 */
const Profile: React.FC = () => {
  const { loading, hasSession, cards, ctx, identity } = usePortalCards('account');

  if (loading) return <PortalLayout title="Profile" backTo={portalRoutes.home}><div /></PortalLayout>;

  // A real deployment sends a signed-out visitor to the login. Locally the demo
  // stands in, so the page is reviewable without a client account existing yet.
  if (!hasSession && !DEMO_ALLOWED) {
    return <Navigate to="/portal/login" state={{ from: '/portal/profile' }} replace />;
  }

  return (
    <PortalLayout
      title="Profile"
      subtitle="Your details, your password and what we notify you about."
      backTo={portalRoutes.home}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
        maxWidth: '560px',
      }}>
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
    </PortalLayout>
  );
};

export default Profile;
