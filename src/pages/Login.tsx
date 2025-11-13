import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import { theme } from '../theme';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { isMobile, isMobileOrTablet } = useResponsive();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        navigate('/dashboard');
      } else {
        setError('Invalid email or password');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const fillAdminCredentials = () => {
    setEmail('admin@mediamaple.com');
    setPassword('admin123');
    setError('');
  };

  const fillTeamCredentials = () => {
    setEmail('john@mediamaple.com');
    setPassword('team123');
    setError('');
  };

  // Dynamic styles based on screen size
  const getStyles = () => {
    const baseStyles = styles;

    if (isMobile) {
      return {
        ...baseStyles,
        container: { ...baseStyles.container, ...styles.containerMobile },
        loginCard: { ...baseStyles.loginCard, ...styles.loginCardMobile },
        logo: { ...baseStyles.logo, ...styles.logoMobile },
        title: { ...baseStyles.title, ...styles.titleMobile },
        subtitle: { ...baseStyles.subtitle, ...styles.subtitleMobile },
        input: { ...baseStyles.input, ...styles.inputMobile },
        submitButton: { ...baseStyles.submitButton, ...styles.buttonMobile },
        demoButton: { ...baseStyles.demoButton, ...styles.buttonMobile },
        demoSection: { ...baseStyles.demoSection, ...styles.demoSectionMobile },
        demoButtons: { ...baseStyles.demoButtons, ...styles.demoButtonsMobile },
      };
    } else if (isMobileOrTablet) {
      return {
        ...baseStyles,
        loginCard: { ...baseStyles.loginCard, ...styles.loginCardTablet },
      };
    }

    return baseStyles;
  };

  const responsiveStyles = getStyles();

  return (
    <div style={responsiveStyles.container}>
      <div style={responsiveStyles.loginCard}>
        {/* Logo */}
        <div style={styles.logoContainer}>
          <img
            src="/mediamaple-logo-white.png"
            alt="MediaMaple"
            style={responsiveStyles.logo}
          />
        </div>

        {/* Title */}
        <h1 style={responsiveStyles.title}>Welcome Back</h1>
        <p style={responsiveStyles.subtitle}>Sign in to your account</p>

        {/* Error Message */}
        {error && (
          <div style={styles.errorBox}>
            <span style={styles.errorIcon}>⚠️</span>
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={responsiveStyles.input}
              disabled={isLoading}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={responsiveStyles.input}
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            style={isLoading ? { ...responsiveStyles.submitButton, ...styles.submitButtonDisabled } : responsiveStyles.submitButton}
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Demo Credentials */}
        <div style={responsiveStyles.demoSection}>
          <p style={styles.demoTitle}>Quick Login (Demo)</p>
          <div style={responsiveStyles.demoButtons}>
            <button
              onClick={fillAdminCredentials}
              style={responsiveStyles.demoButton}
              disabled={isLoading}
              className="demo-button"
            >
              Admin Login
            </button>
            <button
              onClick={fillTeamCredentials}
              style={responsiveStyles.demoButton}
              disabled={isLoading}
              className="demo-button"
            >
              Team Login
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <p style={styles.footerText}>
          MediaMaple Task Management System
        </p>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: `linear-gradient(135deg, ${theme.colors.bg.tertiary} 0%, ${theme.colors.bg.primary} 100%)`,
    padding: theme.spacing.md,
  },
  containerMobile: {
    padding: theme.spacing.sm,
    justifyContent: 'flex-start',
    paddingTop: theme.spacing.lg,
  },
  loginCard: {
    backgroundColor: theme.colors.bg.secondary,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xxl,
    width: '100%',
    maxWidth: '440px',
    boxShadow: theme.shadows.xl,
    border: `1px solid ${theme.colors.bdr.primary}`,
  },
  loginCardMobile: {
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    maxWidth: '100%',
  },
  loginCardTablet: {
    padding: theme.spacing.xl,
  },
  logoContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
  },
  logo: {
    height: '50px',
    width: 'auto',
  },
  logoMobile: {
    height: '40px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  titleMobile: {
    fontSize: '24px',
  },
  subtitle: {
    fontSize: '15px',
    color: theme.colors.txt.secondary,
    marginBottom: theme.spacing.xl,
    textAlign: 'center',
  },
  subtitleMobile: {
    fontSize: '14px',
    marginBottom: theme.spacing.lg,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 35, 60, 0.1)',
    border: `1px solid ${theme.colors.status.error}`,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    color: theme.colors.status.error,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  errorIcon: {
    fontSize: '18px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.lg,
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.txt.primary,
  },
  input: {
    width: '100%',
    padding: `${theme.spacing.md} ${theme.spacing.md}`,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    fontSize: '15px',
    transition: 'all 0.2s ease',
    outline: 'none',
    boxSizing: 'border-box',
  },
  inputMobile: {
    fontSize: '16px', // Prevents iOS zoom on focus
    padding: `${theme.spacing.md} ${theme.spacing.sm}`,
  },
  submitButton: {
    width: '100%',
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.txt.primary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginTop: theme.spacing.sm,
  },
  buttonMobile: {
    minHeight: '44px', // Touch-friendly minimum size
    fontSize: '16px',
    padding: `${theme.spacing.md} ${theme.spacing.md}`,
  },
  submitButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  demoSection: {
    marginTop: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  },
  demoSectionMobile: {
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  demoTitle: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  demoButtons: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: theme.spacing.sm,
  },
  demoButtonsMobile: {
    gridTemplateColumns: '1fr',
    gap: theme.spacing.xs,
  },
  demoButton: {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.secondary,
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  footer: {
    marginTop: theme.spacing.xl,
  },
  footerText: {
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
    textAlign: 'center',
  },
};

// Add hover states via CSS
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  input:focus {
    border-color: ${theme.colors.primary} !important;
  }
  button[type="submit"]:hover:not(:disabled) {
    background-color: #d41f36 !important;
    transform: translateY(-1px);
    box-shadow: ${theme.shadows.md};
  }
  button[type="submit"]:active:not(:disabled) {
    transform: translateY(0);
  }
  .demo-button:hover:not(:disabled) {
    background-color: ${theme.colors.bg.secondary} !important;
    border-color: ${theme.colors.primary} !important;
    color: ${theme.colors.primary} !important;
  }
`;
document.head.appendChild(styleSheet);

export default Login;
