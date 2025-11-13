import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';

const Navigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout, isAdmin } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const { isMobileOrTablet } = useResponsive();

  // Close mobile menu when route changes
  useEffect(() => {
    setShowMobileMenu(false);
    setShowUserMenu(false);
  }, [location.pathname]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowUserMenu(false);
    };
    if (showUserMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showUserMenu]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Navigation items filtered by role
  const getNavItems = () => {
    const allItems = [
      {
        path: '/dashboard',
        label: 'Dashboard',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        ),
        adminOnly: false,
      },
      {
        path: '/my-tasks',
        label: 'My Tasks',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        ),
        adminOnly: false,
      },
      {
        path: '/sop',
        label: 'SOPs',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <line x1="10" y1="9" x2="8" y2="9" />
          </svg>
        ),
        adminOnly: true,
      },
      {
        path: '/templates',
        label: 'Templates',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
        ),
        adminOnly: true,
      },
      {
        path: '/task-library',
        label: 'Task Library',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
        ),
        adminOnly: true,
      },
      {
        path: '/job-tasks',
        label: 'Job Tasks',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        ),
        adminOnly: true,
      },
      {
        path: '/team',
        label: 'Team',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
        adminOnly: true,
      },
    ];

    return allItems.filter(item => !item.adminOnly || isAdmin);
  };

  const navItems = getNavItems();

  return (
    <nav style={styles.nav}>
      <div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
        {/* Mobile/Tablet Layout */}
        {isMobileOrTablet && (
          <>
            {/* Hamburger Menu Button */}
            <button
              style={styles.hamburger}
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              aria-label="Toggle menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {showMobileMenu ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>

            {/* Center Logo */}
            <div style={styles.centerLogoMobile}>
              <img
                src="/logo.png"
                alt="MediaMaple Logo"
                style={styles.logoImageMobile}
              />
            </div>

            {/* User Avatar (Mobile) */}
            <div
              style={styles.userAvatarMobile}
              onClick={(e) => {
                e.stopPropagation();
                setShowUserMenu(!showUserMenu);
              }}
            >
              {currentUser?.firstName.charAt(0)}{currentUser?.lastName.charAt(0)}
            </div>

            {/* Mobile Menu Overlay */}
            {showMobileMenu && (
              <>
                <div style={styles.mobileOverlay} onClick={() => setShowMobileMenu(false)} />
                <div style={styles.mobileMenu}>
                  <div style={styles.mobileMenuContent}>
                    {navItems.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        style={{
                          ...styles.mobileNavLink,
                          ...(location.pathname === item.path ? styles.mobileNavLinkActive : {}),
                        }}
                      >
                        <span style={styles.navIcon}>{item.icon}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* User Menu (Mobile) */}
            {showUserMenu && (
              <div style={styles.userMenuMobile}>
                <div style={styles.userInfoMobile}>
                  <div style={styles.userNameMobile}>
                    {currentUser?.firstName} {currentUser?.lastName}
                  </div>
                  <div style={styles.userRoleMobile}>
                    {currentUser?.role === 'admin' ? 'Admin' : 'Team Member'}
                  </div>
                </div>
                <div style={styles.menuDivider} />
                <div style={styles.userMenuItem}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Profile
                </div>
                <div style={styles.userMenuItem}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v6m0 6v6m5.2-13.2l-4.2 4.2m0 6l4.2 4.2M1 12h6m6 0h6m-13.2 5.2l4.2-4.2m0-6l-4.2-4.2" />
                  </svg>
                  Settings
                </div>
                <div style={styles.menuDivider} />
                <div
                  style={styles.userMenuItemLogout}
                  onClick={handleLogout}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Logout
                </div>
              </div>
            )}
          </>
        )}

        {/* Desktop Layout */}
        {!isMobileOrTablet && (
          <>
            <div style={styles.navLinks}>
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  style={{
                    ...styles.navLink,
                    ...(location.pathname === item.path ? styles.navLinkActive : {}),
                  }}
                >
                  <span style={styles.navIcon}>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>

            <div style={styles.centerLogo}>
              <img
                src="/logo.png"
                alt="MediaMaple Logo"
                style={styles.logoImage}
              />
            </div>

            <div style={styles.userSection}>
              <div
                style={styles.userButton}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUserMenu(!showUserMenu);
                }}
              >
                <div style={styles.userAvatar}>
                  {currentUser?.firstName.charAt(0)}{currentUser?.lastName.charAt(0)}
                </div>
                <div style={styles.userInfo}>
                  <div style={styles.userName}>
                    {currentUser?.firstName} {currentUser?.lastName}
                  </div>
                  <div style={styles.userRole}>
                    {currentUser?.role === 'admin' ? 'Admin' : 'Team Member'}
                  </div>
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{
                    transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {showUserMenu && (
                <div style={styles.userMenu}>
                  <div style={styles.userMenuItem}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    Profile
                  </div>
                  <div style={styles.userMenuItem}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 1v6m0 6v6m5.2-13.2l-4.2 4.2m0 6l4.2 4.2M1 12h6m6 0h6m-13.2 5.2l4.2-4.2m0-6l-4.2-4.2" />
                    </svg>
                    Settings
                  </div>
                  <div style={styles.menuDivider} />
                  <div
                    style={styles.userMenuItemLogout}
                    onClick={handleLogout}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Logout
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </nav>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  nav: {
    backgroundColor: theme.colors.cardBackground,
    borderBottom: `2px solid ${theme.colors.border}`,
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: theme.shadows.md,
    width: '100%',
  },
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '16px 40px',
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: '20px',
  },
  containerMobile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    position: 'relative',
    width: '100%',
    maxWidth: '100vw',
  },
  hamburger: {
    background: 'none',
    border: 'none',
    color: theme.colors.txt.primary,
    cursor: 'pointer',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    transition: 'background-color 0.2s',
  },
  centerLogoMobile: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
  },
  logoImageMobile: {
    height: '32px',
    width: 'auto',
    objectFit: 'contain',
  },
  userAvatarMobile: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    color: theme.colors.txt.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    border: `2px solid ${theme.colors.bdr.primary}`,
  },
  mobileOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    zIndex: 998,
    backdropFilter: 'blur(2px)',
  },
  mobileMenu: {
    position: 'fixed',
    top: '60px',
    left: 0,
    bottom: 0,
    width: '280px',
    maxWidth: '80vw',
    backgroundColor: theme.colors.bg.secondary,
    borderRight: `2px solid ${theme.colors.bdr.primary}`,
    zIndex: 999,
    overflowY: 'auto',
    boxShadow: theme.shadows.xl,
    WebkitOverflowScrolling: 'touch',
  },
  mobileMenuContent: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  mobileNavLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    fontSize: '16px',
    fontWeight: '600',
    color: theme.colors.txt.secondary,
    textDecoration: 'none',
    borderRadius: theme.borderRadius.md,
    transition: 'all 0.2s',
    border: `2px solid transparent`,
  },
  mobileNavLinkActive: {
    backgroundColor: theme.colors.primary,
    color: theme.colors.txt.primary,
    border: `2px solid ${theme.colors.primary}`,
  },
  userMenuMobile: {
    position: 'absolute',
    top: '100%',
    right: '16px',
    marginTop: '8px',
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    boxShadow: theme.shadows.lg,
    minWidth: '250px',
    overflow: 'hidden',
    zIndex: 1000,
  },
  userInfoMobile: {
    padding: '16px',
    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
  },
  userNameMobile: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
    marginBottom: '4px',
  },
  userRoleMobile: {
    fontSize: '13px',
    color: theme.colors.txt.secondary,
  },
  navLinks: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-start',
  },
  centerLogo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    height: '40px',
    width: 'auto',
    objectFit: 'contain',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    fontSize: '15px',
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textDecoration: 'none',
    borderRadius: theme.borderRadius.md,
    transition: 'all 0.2s',
    border: `2px solid transparent`,
  },
  navLinkActive: {
    backgroundColor: theme.colors.primary,
    color: theme.colors.background,
    border: `2px solid ${theme.colors.primary}`,
  },
  navIcon: {
    fontSize: '18px',
  },
  userSection: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
  },
  userButton: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    backgroundColor: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  userAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: theme.colors.primary,
    color: theme.colors.txt.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 600,
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  userName: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.primary,
  },
  userRole: {
    fontSize: '12px',
    color: theme.colors.txt.secondary,
  },
  userMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.bg.secondary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    boxShadow: theme.shadows.lg,
    minWidth: '200px',
    overflow: 'hidden',
    zIndex: 1000,
  },
  userMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    color: theme.colors.txt.secondary,
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  userMenuItemLogout: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    color: theme.colors.status.error,
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  menuDivider: {
    height: '1px',
    backgroundColor: theme.colors.bdr.primary,
    margin: `${theme.spacing.xs} 0`,
  },
};

export default Navigation;
