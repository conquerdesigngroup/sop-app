import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../../theme';
import { Button, Card, Divider } from '../ui';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { ProfileCardProps } from '../../lib/profileCards';

/**
 * Email, password and the way out (§5.1).
 *
 * SIGN-OUT MOVED HERE, IT DID NOT GET COPIED HERE
 *
 * §5.1 says to move the existing sign-out to the profile. This card links to
 * /portal/account for the password change rather than reimplementing it,
 * because that page already carries the current-password check and the audit
 * logging, and a second copy of an auth flow is a second thing to get wrong.
 * What lives here is the shortcut a family actually looks for.
 */
const AccountCard: React.FC<ProfileCardProps> = ({ email }) => {
  const navigate = useNavigate();
  const { hasSession, signOut } = usePortalAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate('/portal/login', { replace: true });
  };

  return (
    <Card>
      <h3 style={{
        ...theme.typography.h3,
        fontFamily: theme.fonts.display,
        color: theme.colors.txt.primary,
        margin: `0 0 ${theme.spacing.sm}`,
      }}>
        Account
      </h3>

      <p style={{
        ...theme.typography.bodySmall,
        fontFamily: theme.fonts.mono,
        color: theme.colors.txt.tertiary,
        margin: 0,
        overflowWrap: 'anywhere',
      }}>
        {email}
      </p>

      <p style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.tertiary,
        margin: `${theme.spacing.xs} 0 0`,
      }}>
        The studio owns email addresses — ask the front desk to change yours.
      </p>

      <Divider />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <Button variant="outline" size="sm" onClick={() => navigate('/portal/account')}>
          Change password
        </Button>
        {hasSession && (
          <Button variant="secondary" size="sm" loading={signingOut} onClick={handleSignOut}>
            Sign out
          </Button>
        )}
      </div>
    </Card>
  );
};

export default AccountCard;
