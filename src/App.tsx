import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ActivityLogProvider } from './contexts/ActivityLogContext';
import { DataProvider } from './contexts/DataProvider';
import ErrorBoundary from './components/ErrorBoundary';
import Navigation from './components/Navigation';
import { OfflineIndicator } from './components/OfflineIndicator';
import SessionExpiryModal from './components/SessionExpiryModal';
import { theme } from './theme';
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

// Page loading fallback - simple centered spinner
const PageLoadingFallback: React.FC = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    backgroundColor: theme.colors.background,
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

  return (
    <div className="App" style={{ backgroundColor: '#000000', minHeight: '100vh' }}>
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
      <ToastProvider>
        <AuthProvider>
          <ActivityLogProvider>
            <DataProvider>
              <Router>
                <AppContent />
              </Router>
            </DataProvider>
          </ActivityLogProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
