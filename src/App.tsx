import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SOPProvider } from './contexts/SOPContext';
import { TaskProvider } from './contexts/TaskContext';
import { ToastProvider } from './contexts/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import Navigation from './components/Navigation';
import { OfflineIndicator } from './components/OfflineIndicator';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SOPPage from './pages/SOPPage';
import TemplatesPage from './pages/TemplatesPage';
import TaskLibraryPage from './pages/TaskLibraryPage';
import JobTasksPage from './pages/JobTasksPage';
import MyTasksPage from './pages/MyTasksPage';
import TeamManagementPage from './pages/TeamManagementPage';
import './App.css';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactElement; adminOnly?: boolean }> = ({
  children,
  adminOnly = false,
}) => {
  const { isAuthenticated, isAdmin } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// Public Route Component (redirect to dashboard if already logged in)
const PublicRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// App Content (needs to be inside AuthProvider to use useAuth)
const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="App" style={{ backgroundColor: '#000000', minHeight: '100vh' }}>
      {isAuthenticated && <Navigation />}
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
            <ProtectedRoute adminOnly>
              <SOPPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/templates"
          element={
            <ProtectedRoute adminOnly>
              <TemplatesPage />
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
          path="/job-tasks"
          element={
            <ProtectedRoute adminOnly>
              <JobTasksPage />
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
      </Routes>
      <OfflineIndicator />
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <SOPProvider>
            <TaskProvider>
              <Router>
                <AppContent />
              </Router>
            </TaskProvider>
          </SOPProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
