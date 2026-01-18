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

    // Status colors - expanded for consistency
    status: {
      success: '#10B981',          // Emerald green
      warning: '#F59E0B',          // Amber
      error: '#EF233C',            // Crimson for errors
      info: '#3B82F6',             // Blue
      pending: '#F59E0B',          // Amber (same as warning)
      inProgress: '#3B82F6',       // Blue (same as info)
      completed: '#10B981',        // Green (same as success)
      overdue: '#EF4444',          // Red
      draft: '#F59E0B',            // Amber
      published: '#10B981',        // Green
      archived: '#6B7280',         // Gray
    },

    // Role colors
    role: {
      admin: '#8B5CF6',            // Purple
      team: '#3B82F6',             // Blue
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

  // Typography scale for consistency
  typography: {
    h1: {
      fontSize: '36px',
      fontWeight: 800,
      lineHeight: 1.2,
    },
    h1Mobile: {
      fontSize: '28px',
      fontWeight: 800,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '28px',
      fontWeight: 700,
      lineHeight: 1.3,
    },
    h2Mobile: {
      fontSize: '24px',
      fontWeight: 700,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '22px',
      fontWeight: 700,
      lineHeight: 1.4,
    },
    h3Mobile: {
      fontSize: '18px',
      fontWeight: 700,
      lineHeight: 1.4,
    },
    subtitle: {
      fontSize: '16px',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    body: {
      fontSize: '15px',
      fontWeight: 400,
      lineHeight: 1.6,
    },
    bodySmall: {
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '13px',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    captionSmall: {
      fontSize: '12px',
      fontWeight: 500,
      lineHeight: 1.4,
    },
  },

  // Page layout constants for consistency across all pages
  pageLayout: {
    maxWidth: '1400px',
    containerPadding: {
      desktop: '40px',
      mobile: '16px',
    },
    headerMargin: {
      desktop: '32px',
      mobile: '24px',
    },
    sectionMargin: {
      desktop: '24px',
      mobile: '16px',
    },
    cardPadding: {
      desktop: '24px',
      mobile: '16px',
    },
    filterGap: {
      desktop: '16px',
      mobile: '12px',
    },
  },

  // Component style presets for consistency
  components: {
    // Button presets
    button: {
      base: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontWeight: 600,
        fontSize: '15px',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        border: 'none',
        outline: 'none',
      },
      sizes: {
        sm: {
          padding: '8px 16px',
          fontSize: '13px',
          minHeight: '36px',
        },
        md: {
          padding: '12px 20px',
          fontSize: '15px',
          minHeight: '44px',
        },
        lg: {
          padding: '14px 28px',
          fontSize: '16px',
          minHeight: '48px',
        },
      },
    },
    // Input presets
    input: {
      base: {
        width: '100%',
        padding: '12px 16px',
        fontSize: '15px',
        fontWeight: 400,
        borderRadius: '8px',
        border: '2px solid #2A2A2A',
        backgroundColor: '#242424',
        color: '#F2F2F2',
        outline: 'none',
        transition: 'border-color 0.2s ease',
      },
      mobile: {
        fontSize: '16px', // Prevents iOS zoom
        padding: '14px 16px',
      },
    },
    // Card presets
    card: {
      base: {
        backgroundColor: '#1A1A1A',
        border: '2px solid #2A2A2A',
        borderRadius: '12px',
        padding: '24px',
      },
      mobile: {
        padding: '16px',
        borderRadius: '8px',
      },
    },
    // Badge presets
    badge: {
      base: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 12px',
        fontSize: '12px',
        fontWeight: 600,
        borderRadius: '9999px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
      },
    },
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
