import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
const AuthCallback = lazy(() => import('./pages/AuthCallback'));

// Page loading fallback - simple centered spinner (theme-aware)
const PageLoadingFallback: React.FC = () => {
  // Try to use theme context, fallback to dark colors if not available
  let bgColor = theme.colors.background;
  let borderColor = theme.colors.bg.tertiary;

  try {
    const themeContext = useThemeColors();
    if (themeContext) {
      bgColor = themeContext.bg.primary;
      borderColor = themeContext.bg.tertiary;
    }
  } catch {
    // Context not available yet, use defaults
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      backgroundColor: bgColor,
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: `3px solid ${borderColor}`,
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
};

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactElement; adminOnly?: boolean }> = ({
  children,
  adminOnly = false,
}) => {
  const { isAuthenticated, isAdmin, loading } = useAuth();

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

// App Content (needs to be inside AuthProvider to use useAuth)
const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { isMobileOrTablet } = useResponsive();
  const colors = useThemeColors();

  return (
    <div
      className="App"
      style={{
        backgroundColor: colors.bg.primary,
        minHeight: '100vh',
        // Add padding bottom for bottom nav on mobile
        paddingBottom: isAuthenticated && isMobileOrTablet ? '70px' : 0,
        transition: 'background-color 0.3s ease',
      }}
    >
      {isAuthenticated && <Navigation />}
      <Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
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
              <ProtectedRoute adminOnly>
                <ArchivePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/activity-log"
            element={
              <ProtectedRoute adminOnly>
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
              <ProtectedRoute>
                <AlertsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hours"
            element={
              <ProtectedRoute>
                <WorkHoursPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
      {/* Bottom Navigation for Mobile */}
      {isAuthenticated && isMobileOrTablet && <BottomNavigation />}
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
                  <Router>
                    <AppContent />
                  </Router>
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
