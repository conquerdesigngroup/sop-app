import React, { useState } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { usePortal } from '../../contexts/PortalContext';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { CLIENT_AUTH_ENABLED, CLIENT_AUTH_REQUIRED } from '../../lib/clientAuth';
import { isProgramSlug, portalRoutes } from '../../lib/portal';
import PortalLayout from '../../components/portal/PortalLayout';
import { Button, Card, Input, Spinner } from '../../components/ui';

/**
 * Access gate for a program section. Rendered as a layout route, so every page
 * under /portal/:program passes through it exactly once.
 *
 * WHAT THIS IS AND IS NOT
 *
 * The code is checked by verify_portal_code(), a SECURITY DEFINER function that
 * compares against a bcrypt hash in a table with no grants and no RLS policy.
 * The hash never reaches the browser and a wrong guess learns nothing.
 *
 * It is still a soft gate. Portal content is readable by the `anon` role,
 * because a portal with no login has to be. So this stops casual browsing, not
 * a determined person with the anon key — which is exactly what the studio's
 * existing website portal does. Nothing private belongs in portal content; see
 * the v9 migration header.
 *
 * Clearing the gate is remembered per device in localStorage so a parent who
 * installs the app to their home screen is not asked every launch.
 */
const ProgramGate: React.FC = () => {
  const { program: slug } = useParams<{ program: string }>();
  const location = useLocation();
  const { isMobileOrTablet } = useResponsive();
  const { programs, loading, error, getProgramBySlug, hasAccess, verifyCode } = usePortal();
  const portalAuth = usePortalAuth();

  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);

  // Validated against the known set, never trusted from the URL — it becomes a
  // query filter downstream.
  if (!isProgramSlug(slug)) {
    return <Navigate to={portalRoutes.home} replace />;
  }

  if (loading) {
    return (
      <PortalLayout title="Parent Portal" backTo={portalRoutes.home}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <Spinner size={32} color={theme.colors.primary} />
        </div>
      </PortalLayout>
    );
  }

  if (error) {
    return (
      <PortalLayout title="Parent Portal" backTo={portalRoutes.home}>
        <Card style={{ maxWidth: '560px' }}>
          <p style={{
            ...theme.typography.body,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.secondary,
            margin: 0,
          }}>
            {error}
          </p>
        </Card>
      </PortalLayout>
    );
  }

  const program = getProgramBySlug(slug);

  // The slug is valid but the database has no active row for it — deactivated,
  // or renamed without updating PROGRAM_SLUGS.
  if (programs.length > 0 && !program) {
    return <Navigate to={portalRoutes.home} replace />;
  }

  // FULL LAUNCH (REQUIRED): the gate is a real login rather than a shared code.
  // Any signed-in account passes; nobody else does; the access-code path is
  // gone. Pairs with the v30 migration closing the anon door.
  if (CLIENT_AUTH_REQUIRED) {
    if (portalAuth.loading) {
      return (
        <PortalLayout title={program?.name ?? 'Parent Portal'} backTo={portalRoutes.home}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <Spinner size={32} color={theme.colors.primary} />
          </div>
        </PortalLayout>
      );
    }
    if (!portalAuth.hasSession) {
      return <Navigate to="/portal/login" state={{ from: location.pathname }} replace />;
    }
    return <Outlet />;
  }

  // PARALLEL TEST (ENABLED, not REQUIRED): a signed-in tester skips the studio
  // code, which is how the new login gets exercised as a real access mechanism
  // — while every real family still uses the code exactly as before. Not gated
  // on portalAuth.loading on purpose: a real client will never be signed in, so
  // making them wait on a session check before the code form appears would tax
  // the majority for the few who test. A logged-in tester reaching a program by
  // deep link may see the code form for one frame before the session resolves;
  // reaching it from the portal home (the normal path) they will not.
  if (CLIENT_AUTH_ENABLED && portalAuth.hasSession) {
    return <Outlet />;
  }

  if (hasAccess(slug)) {
    return <Outlet />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setChecking(true);
    setFailed(false);
    const ok = await verifyCode(slug, code.trim());
    setChecking(false);

    if (!ok) {
      setFailed(true);
      setCode('');
      return;
    }
    // hasAccess flips on the next render — no navigation needed, the Outlet
    // simply takes over.
  };

  return (
    <PortalLayout
      title={program?.name ?? 'Parent Portal'}
      subtitle="Enter the studio code to see schedules, info and documents."
      backTo={portalRoutes.home}
    >
      <Card style={{ maxWidth: '440px' }}>
        <form onSubmit={handleSubmit}>
          <Input
            label="Studio code"
            value={code}
            onChange={e => {
              setCode(e.target.value);
              setFailed(false);
            }}
            error={failed ? 'That code is not right. Check with the front desk.' : undefined}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={checking}
            // 16px minimum on mobile or iOS zooms the whole page on focus.
            style={isMobileOrTablet ? { fontSize: '16px' } : undefined}
          />

          <div style={{ marginTop: '20px' }}>
            <Button type="submit" variant="primary" fullWidth loading={checking} disabled={!code.trim()}>
              Enter
            </Button>
          </div>
        </form>

        <p style={{
          ...theme.typography.caption,
          fontFamily: theme.fonts.mono,
          color: theme.colors.txt.tertiary,
          margin: '20px 0 0',
        }}>
          Need the code? Ask us at the front desk.
        </p>
      </Card>
    </PortalLayout>
  );
};

export default ProgramGate;
