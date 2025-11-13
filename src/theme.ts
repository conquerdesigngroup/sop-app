// Theme constants for SOP App
export const theme = {
  colors: {
    // Accent colors - Crimson
    primary: '#EF233C',           // Crimson
    primaryHover: '#FF2E47',      // Lighter crimson
    primaryDark: '#D91F34',       // Darker crimson

    // Background colors
    bg: {
      primary: '#0D0D0D',        // Cod Gray
      secondary: '#1A1A1A',
      tertiary: '#242424',
      dark: '#000000',
    },

    // Text colors
    txt: {
      primary: '#F2F2F2',       // Concrete
      secondary: '#D0D0D0',     // Lighter gray
      tertiary: '#8B8B8B',      // Muted gray
    },

    // Status colors
    status: {
      success: '#4CAF50',
      warning: '#FFC107',
      error: '#EF233C',             // Crimson for errors
      info: '#2196F3',
    },

    // Border colors
    bdr: {
      primary: '#2A2A2A',
      secondary: '#3A3A3A',
    },

    // Legacy flat colors (for backward compatibility with existing SOP pages)
    background: '#0D0D0D',
    backgroundLight: '#1A1A1A',
    backgroundDark: '#000000',
    textPrimary: '#F2F2F2',
    textSecondary: '#D0D0D0',
    textMuted: '#8B8B8B',
    success: '#4CAF50',
    warning: '#FFC107',
    error: '#EF233C',
    info: '#2196F3',
    border: '#2A2A2A',
    cardBackground: '#1A1A1A',
    inputBackground: '#242424',
    shadow: 'rgba(0, 0, 0, 0.8)',
  },

  fonts: {
    primary: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
    mono: "'Roboto Mono', 'Courier New', monospace",
  },

  breakpoints: {
    mobile: '480px',
    tablet: '768px',
    desktop: '1024px',
    wide: '1440px',
  },

  // Responsive spacing - use these for adaptive layouts
  responsiveSpacing: {
    containerPadding: {
      mobile: '16px',
      tablet: '24px',
      desktop: '40px',
    },
    sectionGap: {
      mobile: '16px',
      tablet: '20px',
      desktop: '24px',
    },
    cardGap: {
      mobile: '12px',
      tablet: '16px',
      desktop: '20px',
    },
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },

  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },

  shadows: {
    sm: '0 2px 4px rgba(0, 0, 0, 0.5)',
    md: '0 4px 8px rgba(0, 0, 0, 0.6)',
    lg: '0 8px 16px rgba(0, 0, 0, 0.7)',
    xl: '0 12px 24px rgba(0, 0, 0, 0.8)',
  },
};

export type Theme = typeof theme;

// Responsive utility functions
export const responsive = {
  // Media query helpers
  mobile: `@media (max-width: ${theme.breakpoints.mobile})`,
  tablet: `@media (min-width: ${theme.breakpoints.mobile}) and (max-width: ${theme.breakpoints.tablet})`,
  desktop: `@media (min-width: ${theme.breakpoints.tablet})`,
  wide: `@media (min-width: ${theme.breakpoints.wide})`,

  // Mobile-first approach
  upToTablet: `@media (max-width: ${theme.breakpoints.tablet})`,
  upToDesktop: `@media (max-width: ${theme.breakpoints.desktop})`,

  // Touch device detection
  touch: '@media (hover: none) and (pointer: coarse)',

  // Helper to check if mobile
  isMobile: () => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < parseInt(theme.breakpoints.tablet);
  },

  // Helper to check if tablet
  isTablet: () => {
    if (typeof window === 'undefined') return false;
    const width = window.innerWidth;
    return width >= parseInt(theme.breakpoints.tablet) && width < parseInt(theme.breakpoints.desktop);
  },

  // Helper to get current breakpoint
  getCurrentBreakpoint: (): 'mobile' | 'tablet' | 'desktop' | 'wide' => {
    if (typeof window === 'undefined') return 'desktop';
    const width = window.innerWidth;
    if (width < parseInt(theme.breakpoints.mobile)) return 'mobile';
    if (width < parseInt(theme.breakpoints.tablet)) return 'tablet';
    if (width < parseInt(theme.breakpoints.desktop)) return 'desktop';
    return 'wide';
  },
};
