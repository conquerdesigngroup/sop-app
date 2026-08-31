import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider, useTheme, useThemeColors } from './contexts/ThemeContext';
import { ActivityLogProvider } from './contexts/ActivityLogContext';
import { DataProvider } from './contexts/DataProvider';
import { DashboardSettingsProvider } from './contexts/DashboardSettingsContext';
import ErrorBoundary from './components/ErrorBoundary';
import Navigation from './components/Navigation';
import BottomNavigation from './components/BottomNavigation';
import { OfflineIndicator } from './components/OfflineIndicator';
import SessionExpiryModal from './components/SessionExpiryModal';
import { theme } from './theme';
import { useResponsive } from './hooks/useResponsive';
import { isPortalPath } from './lib/portal';
import { PortalProvider } from './contexts/PortalContext';
import { PortalAuthProvider } from './contexts/PortalAuthContext';
import { PortalAdminProvider } from './contexts/PortalAdminContext';
import { CLIENT_AUTH_ENABLED } from './lib/clientAuth';
import './App.css';

// Lazy load page components for code splitting
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SOPPage = lazy(() => import('./pages/SOPPage'));
const JobTasksPage = lazy(() => import('./pages/JobTasksPage'));
const TaskLibraryPage = lazy(() => import('./pages/TaskLibraryPage'));
const MyTasksPage = lazy(() => import('./pages/MyTasksPage'));
const TeamManagementPage = lazy(() => import('./pages/TeamManagementPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ArchivePage = lazy(() => import('./pages/ArchivePage'));
const ActivityLogPage = lazy(() => import('./pages/ActivityLogPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const WorkHoursPage = lazy(() => import('./pages/WorkHoursPage'));
const HoursInputPage = lazy(() => import('./pages/HoursInputPage'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

// Client-facing portal — public with the access-code gate; with
// REACT_APP_CLIENT_AUTH on, sits behind the family sign-in instead.
const ChooserPage = lazy(() => import('./pages/portal/ChooserPage'));
const PortalHome = lazy(() => import('./pages/portal/PortalHome'));
const ProgramGate = lazy(() => import('./pages/portal/ProgramGate'));
const ProgramHome = lazy(() => import('./pages/portal/ProgramHome'));
const ProgramClasses = lazy(() => import('./pages/portal/ProgramClasses'));
const ClassDetail = lazy(() => import('./pages/portal/ClassDetail'));
const ProgramUpdates = lazy(() => import('./pages/portal/ProgramUpdates'));
const ProgramCalendar = lazy(() => import('./pages/portal/ProgramCalendar'));

// Client login build. Only registered when the flag is on, so with it off the
// pages are not merely gated — the routes do not exist.
const PortalLogin = lazy(() => import('./pages/portal/PortalLogin'));
const PortalSignUp = lazy(() => import('./pages/portal/PortalSignUp'));
const PortalUpdatePassword = lazy(() => import('./pages/portal/PortalUpdatePassword'));
const PortalAccount = lazy(() => import('./pages/portal/PortalAccount'));
const PortalProfile = lazy(() => import('./pages/portal/Profile'));

// The staff side of the portal. Reachable by admins and by any employee holding
// a class, which is why its route is a plain ProtectedRoute — see the page.
const PortalManagerPage = lazy(() => import('./pages/portal-admin/PortalManagerPage'));
const ClientAccountsPage = lazy(() => import('./pages/portal-admin/ClientAccountsPage'));

// Page loading fallback - simple centered spinner.
// theme.colors resolve to CSS variables, so this is theme-aware automatically.
const PageLoadingFallback: React.FC = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60dvh',
    backgroundColor: theme.colors.bg.primary,
  }}>
    <div style={{
      width: '40px',
      height: '40px',
      border: `3px solid ${theme.colors.bg.tertiary}`,
      borderTopColor: theme.colors.primary,
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <style>{`
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

// Protected Route Component
const ProtectedRoute: React.FC<{
  children: React.ReactElement;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}> = ({
  children,
  adminOnly = false,
  superAdminOnly = false,
}) => {
  const { isAuthenticated, isAdmin, isSuperAdmin, loading } = useAuth();

  // Wait for auth to initialize before making redirect decisions
  if (loading) {
    return <PageLoadingFallback />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" />;
  }

  // The database already refuses these to anyone below super_admin — see v13.
  // Redirecting rather than rendering is so a plain admin gets their dashboard
  // instead of a screen that loads and then shows nothing, which reads as
  // broken rather than as "not yours".
  if (superAdminOnly && !isSuperAdmin) {
    return <Navigate to="/dashboard" />;
  }

  return children;
};

// Public Route Component (redirect to dashboard if already logged in)
const PublicRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  // Wait for auth to initialize before making redirect decisions
  if (loading) {
    return <PageLoadingFallback />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" />;
  }

  return children;
};

/**
 * Catch-all destination for unknown URLs.
 *
 * Waits for the session check before deciding, otherwise a signed-in user who
 * deep-links to a mistyped path gets bounced to the chooser during the brief
 * window where `isAuthenticated` is still false.
 */
const NotFoundRedirect: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <PageLoadingFallback />;
  }

  return <Navigate to={isAuthenticated ? '/dashboard' : '/'} replace />;
};

// App Content (needs to be inside AuthProvider to use useAuth)
const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { isMobileOrTablet } = useResponsive();
  const colors = useThemeColors();
  const { pathname } = useLocation();

  // The chooser and the parent portal carry their own chrome (PortalLayout).
  // Parents never trip this because staff nav is already gated on
  // isAuthenticated — it exists so a signed-in admin previewing the portal
  // doesn't get the staff header and bottom bar bleeding into it.
  const onPortal = isPortalPath(pathname);
  const showStaffChrome = isAuthenticated && !onPortal;

  return (
    <div
      className="App"
      style={{
        backgroundColor: colors.bg.primary,
        minHeight: '100dvh',
        // Add padding bottom for bottom nav on mobile
        paddingBottom: showStaffChrome && isMobileOrTablet ? '70px' : 0,
        transition: 'background-color 0.3s ease',
      }}
    >
      {showStaffChrome && <Navigation />}
      <Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Where password-reset emails land. Deliberately NOT a PublicRoute:
              the recovery token creates a session as it is consumed, so a
              PublicRoute guard would redirect to /dashboard before the person
              ever gets to set a new password. */}
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Front door. Public, and shown on every visit — no remembered side.
              Staff continue to /login; families go to /portal, no account. */}
          <Route path="/" element={<ChooserPage />} />

          {/* Parent portal. Public by design: these pages read only portal_*
              tables, which are the sole anon-readable surface in the schema.
              PortalProvider is mounted here rather than at the app root so a
              signed-out parent does not pay for the staff data contexts.
              PortalAuthProvider reads the (shared) Supabase session for the
              client-login build; with the flag off it is inert. */}
          <Route element={<PortalProvider><PortalAuthProvider><Outlet /></PortalAuthProvider></PortalProvider>}>
            <Route path="/portal" element={<PortalHome />} />

            {/* The profile is registered outside the CLIENT_AUTH block on
                purpose: it is the one portal page that has something to show
                before client logins are switched on, because its attendance
                cards read the in-repo seed fixture. The page itself sends a
                signed-out visitor to the login in a production build — see
                DEMO_ALLOWED there — so this route is not a way around the
                gate, only a way to review the cards before there is anything
                real behind them. */}
            <Route path="/portal/profile" element={<PortalProfile />} />

            {/* The client login build. Static segments, so they win over the
                /portal/:program matcher regardless of order — but they are
                only registered at all when the flag is on. */}
            {CLIENT_AUTH_ENABLED && (
              <>
                <Route path="/portal/login" element={<PortalLogin />} />
                <Route path="/portal/signup" element={<PortalSignUp />} />
                <Route path="/portal/update-password" element={<PortalUpdatePassword />} />
                <Route path="/portal/account" element={<PortalAccount />} />
              </>
            )}

            {/* ProgramGate is a layout route: it validates the :program slug
                and checks the access code once, then renders whichever child
                matched. Every page below is therefore gated without repeating
                the check in each of them. */}
            <Route path="/portal/:program" element={<ProgramGate />}>
              <Route index element={<ProgramHome />} />
              <Route path="classes" element={<ProgramClasses />} />
              <Route path="classes/:classId" element={<ClassDetail />} />
              <Route path="updates" element={<ProgramUpdates />} />
              {/* Files live inside the class they belong to now. Kept as a
                  redirect rather than deleted: a parent may have had the old
                  Documents page bookmarked or on their home screen. */}
              <Route path="documents" element={<Navigate to="../classes" replace />} />
              <Route path="calendar" element={<ProgramCalendar />} />
            </Route>
          </Route>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sop"
            element={
              <ProtectedRoute>
                <SOPPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/job-tasks"
            element={
              <ProtectedRoute adminOnly>
                <JobTasksPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/task-library"
            element={
              <ProtectedRoute adminOnly>
                <TaskLibraryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-tasks"
            element={
              <ProtectedRoute>
                <MyTasksPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/team"
            element={
              <ProtectedRoute adminOnly>
                <TeamManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/archive"
            element={
              <ProtectedRoute superAdminOnly>
                <ArchivePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/activity-log"
            element={
              <ProtectedRoute superAdminOnly>
                <ActivityLogPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <CalendarPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/alerts"
            element={
              <ProtectedRoute superAdminOnly>
                <AlertsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hours"
            element={
              <ProtectedRoute superAdminOnly>
                <WorkHoursPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hours-input"
            element={
              <ProtectedRoute>
                <HoursInputPage />
              </ProtectedRoute>
            }
          />
          {/* Not adminOnly: instructors with a per-class grant belong here too,
              and the page turns itself away if can_edit_portal() says no. */}
          <Route
            path="/portal-admin"
            element={
              <ProtectedRoute>
                <PortalManagerPage />
              </ProtectedRoute>
            }
          />
          {/* Family logins and the enrollment roster. Unlike the manager above
              this IS adminOnly: per-class instructors have no business in
              other families' account details. */}
          <Route
            path="/portal-admin/clients"
            element={
              <ProtectedRoute adminOnly>
                <ClientAccountsPage />
              </ProtectedRoute>
            }
          />
          {/* Catch-all. Staff land on the dashboard; everyone else lands on the
              chooser rather than being pushed at a staff login they have no
              account for — a mistyped portal URL is far more likely to be a
              parent than an employee. */}
          <Route path="*" element={<NotFoundRedirect />} />
        </Routes>
      </Suspense>
      {/* Bottom Navigation for Mobile */}
      {showStaffChrome && isMobileOrTablet && <BottomNavigation />}
      <OfflineIndicator />
      <SessionExpiryModal />
    </div>
  );
};

/**
 * App Component - Optimized Provider Structure
 *
 * Provider hierarchy (optimized from 7 levels to 4 levels):
 * 1. ErrorBoundary - Error handling wrapper
 * 2. ToastProvider - UI notifications (no data dependencies)
 * 3. AuthProvider - User authentication & session
 * 4. ActivityLogProvider - Audit trail (depends on Auth)
 * 5. DataProvider - All data contexts combined (SOP, Task, Job, Event)
 * 6. Router - Navigation
 *
 * Benefits:
 * - Reduced re-render cascades when one context updates
 * - Cleaner separation of concerns (Auth vs Data vs UI)
 * - Easier to maintain and test
 */
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <ActivityLogProvider>
              <DataProvider>
                <DashboardSettingsProvider>
                  {/* Above the Router because the nav asks it whether to show
                      the Portal entry. Every fetch inside is behind a session,
                      so a signed-out parent pays nothing for it. */}
                  <PortalAdminProvider>
                    <Router>
                      <AppContent />
                    </Router>
                  </PortalAdminProvider>
                </DashboardSettingsProvider>
              </DataProvider>
            </ActivityLogProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
