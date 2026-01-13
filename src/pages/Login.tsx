import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import { theme } from '../theme';
import { CustomCheckbox } from '../components/CustomCheckbox';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { isMobile, isMobileOrTablet } = useResponsive();

  // Load remembered email on mount
  useEffect(() => {
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        // Handle remember me
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }
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
            src="/logo.png"
            alt="Dancing Images"
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
            <div style={styles.passwordContainer}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ ...responsiveStyles.input, ...styles.passwordInput }}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={styles.passwordToggle}
                disabled={isLoading}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="password-toggle"
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Remember Me Checkbox */}
          <div style={styles.rememberMeContainer}>
            <CustomCheckbox
              checked={rememberMe}
              onChange={setRememberMe}
              label="Remember me"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            style={isLoading ? { ...responsiveStyles.submitButton, ...styles.submitButtonDisabled } : responsiveStyles.submitButton}
            disabled={isLoading}
          >
            {isLoading ? (
              <span style={styles.loadingContent}>
                <svg style={styles.spinner} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
                Signing in...
              </span>
            ) : 'Sign In'}
          </button>
        </form>

      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <p style={styles.footerText}>
          Dancing Images Task Management System
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
  passwordContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  passwordInput: {
    paddingRight: '48px',
  },
  passwordToggle: {
    position: 'absolute',
    right: '12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.txt.secondary,
    transition: 'color 0.2s ease',
  },
  rememberMeContainer: {
    display: 'flex',
    alignItems: 'center',
    marginTop: '-4px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    marginRight: '8px',
    accentColor: theme.colors.primary,
    cursor: 'pointer',
  },
  checkboxText: {
    fontSize: '14px',
    color: theme.colors.txt.secondary,
  },
  loadingContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  spinner: {
    animation: 'spin 1s linear infinite',
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
  footer: {
    marginTop: theme.spacing.xl,
  },
  footerText: {
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
    textAlign: 'center',
  },
};

// Add hover states and animations via CSS
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  input:focus {
    border-color: ${theme.colors.primary} !important;
  }
  button[type="submit"]:hover:not(:disabled) {
    background-color: ${theme.colors.primaryDark} !important;
    transform: translateY(-1px);
    box-shadow: ${theme.shadows.md};
  }
  button[type="submit"]:active:not(:disabled) {
    transform: translateY(0);
  }
  .password-toggle:hover {
    color: ${theme.colors.primary} !important;
  }
`;
document.head.appendChild(styleSheet);

export default Login;
