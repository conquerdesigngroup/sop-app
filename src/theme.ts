// Theme constants for SOP App
// Palettes follow the DIDC brand guide (public/brand/tokens.json):
// electric #E2144F (accent), void #0B0B0D (page bg), panel #161618 (cards),
// panel2 #1E1E21 (elevated), ink #111111, chalk #F4F4F5, smoke #9A9AA4.

// Light mode color palette (chalk surfaces, ink text)
export const lightColors = {
  bg: {
    primary: '#F4F4F5',      // Chalk — light surface
    secondary: '#FFFFFF',    // White cards
    tertiary: '#ECECEE',     // Input backgrounds
    dark: '#E4E4E7',         // Darker areas
  },
  txt: {
    primary: '#111111',      // Ink — brand black
    secondary: '#3F3F46',    // Secondary text
    tertiary: '#71717A',     // Muted text
  },
  bdr: {
    primary: '#E0E0E4',      // Standard borders
    secondary: '#CFCFD6',    // Hover borders
  },
  shadow: 'rgba(17, 17, 17, 0.1)',
  overlay: 'rgba(17, 17, 17, 0.5)',
};

// Dark mode color palette (brand default: void / panel / panel2)
export const darkColors = {
  bg: {
    primary: '#0B0B0D',      // Void — page background
    secondary: '#161618',    // Panel — card surface
    tertiary: '#1E1E21',     // Panel2 — elevated surface / inputs
    dark: '#000000',
  },
  txt: {
    primary: '#F4F4F5',      // Chalk
    secondary: '#C9C9D1',    // Between chalk and smoke
    tertiary: '#9A9AA4',     // Smoke — muted text
  },
  bdr: {
    primary: '#26262B',
    secondary: '#36363D',
  },
  shadow: 'rgba(0, 0, 0, 0.8)',
  overlay: 'rgba(0, 0, 0, 0.8)',
};

// Function to get theme colors based on mode
export const getThemeColors = (mode: 'dark' | 'light') => {
  return mode === 'light' ? lightColors : darkColors;
};

/**
 * Applies the palette for the given mode as CSS custom properties on <html>.
 * The static `theme` object below references these variables, so every
 * inline style using theme.colors.* re-themes instantly on mode change.
 * Called by ThemeProvider whenever the mode changes.
 */
export const applyThemeMode = (mode: 'dark' | 'light') => {
  const c = getThemeColors(mode);
  const root = document.documentElement;
  root.style.setProperty('--c-bg-primary', c.bg.primary);
  root.style.setProperty('--c-bg-secondary', c.bg.secondary);
  root.style.setProperty('--c-bg-tertiary', c.bg.tertiary);
  root.style.setProperty('--c-bg-dark', c.bg.dark);
  root.style.setProperty('--c-txt-primary', c.txt.primary);
  root.style.setProperty('--c-txt-secondary', c.txt.secondary);
  root.style.setProperty('--c-txt-tertiary', c.txt.tertiary);
  root.style.setProperty('--c-bdr-primary', c.bdr.primary);
  root.style.setProperty('--c-bdr-secondary', c.bdr.secondary);
  root.style.setProperty('--c-shadow', c.shadow);
  root.style.setProperty('--c-overlay', c.overlay);
  root.style.setProperty(
    '--c-hover-tint',
    mode === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)'
  );

  // Shadows are much softer in light mode
  const s = mode === 'light'
    ? { sm: '0.08', md: '0.10', lg: '0.12', xl: '0.16' }
    : { sm: '0.5', md: '0.6', lg: '0.7', xl: '0.8' };
  root.style.setProperty('--shadow-sm', `0 2px 4px rgba(0, 0, 0, ${s.sm})`);
  root.style.setProperty('--shadow-md', `0 4px 8px rgba(0, 0, 0, ${s.md})`);
  root.style.setProperty('--shadow-lg', `0 8px 16px rgba(0, 0, 0, ${s.lg})`);
  root.style.setProperty('--shadow-xl', `0 12px 24px rgba(0, 0, 0, ${s.xl})`);
};

export const theme = {
  colors: {
    // Accent colors - DIDC Electric
    // Brand rule: keep electric to ~5% of any view — accents, not fills.
    primary: '#E2144F',           // Electric
    primaryHover: '#FF2D6B',      // Electric2 — pink hover / tint
    primaryDark: '#C40E45',       // Pressed state (derived shade)

    // Background colors — CSS variables set by ThemeProvider (see applyThemeMode).
    // Fallbacks are the dark palette so anything rendered outside the provider still works.
    bg: {
      primary: 'var(--c-bg-primary, #0B0B0D)',
      secondary: 'var(--c-bg-secondary, #161618)',
      tertiary: 'var(--c-bg-tertiary, #1E1E21)',
      dark: 'var(--c-bg-dark, #000000)',
    },

    // Text colors
    txt: {
      primary: 'var(--c-txt-primary, #F4F4F5)',
      secondary: 'var(--c-txt-secondary, #C9C9D1)',
      tertiary: 'var(--c-txt-tertiary, #9A9AA4)',
    },

    // Status colors - expanded for consistency
    status: {
      success: '#10B981',          // Emerald green
      warning: '#F59E0B',          // Amber
      error: '#E2144F',            // Electric for errors (matches brand accent)
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
      primary: 'var(--c-bdr-primary, #26262B)',
      secondary: 'var(--c-bdr-secondary, #36363D)',
    },

    // Modal/backdrop overlay
    overlay: 'var(--c-overlay, rgba(0, 0, 0, 0.8))',

    // Legacy flat colors (for backward compatibility with existing SOP pages)
    background: 'var(--c-bg-primary, #0B0B0D)',
    backgroundLight: 'var(--c-bg-secondary, #161618)',
    backgroundDark: 'var(--c-bg-dark, #000000)',
    textPrimary: 'var(--c-txt-primary, #F4F4F5)',
    textSecondary: 'var(--c-txt-secondary, #C9C9D1)',
    textMuted: 'var(--c-txt-tertiary, #9A9AA4)',
    success: '#4CAF50',
    warning: '#FFC107',
    error: '#E2144F',
    info: '#2196F3',
    border: 'var(--c-bdr-primary, #26262B)',
    cardBackground: 'var(--c-bg-secondary, #161618)',
    inputBackground: 'var(--c-bg-tertiary, #1E1E21)',
    shadow: 'var(--c-shadow, rgba(0, 0, 0, 0.8))',
  },

  // DIDC brand fonts (loaded via Google Fonts link in public/index.html):
  // Kanit ExtraBold Italic = display/headlines (uppercase), Barlow = body/UI,
  // JetBrains Mono = specs/captions/tags.
  fonts: {
    display: "'Kanit', 'Barlow', -apple-system, sans-serif",
    primary: "'Barlow', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
    mono: "'JetBrains Mono', 'Roboto Mono', 'Courier New', monospace",
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
    sm: 'var(--shadow-sm, 0 2px 4px rgba(0, 0, 0, 0.5))',
    md: 'var(--shadow-md, 0 4px 8px rgba(0, 0, 0, 0.6))',
    lg: 'var(--shadow-lg, 0 8px 16px rgba(0, 0, 0, 0.7))',
    xl: 'var(--shadow-xl, 0 12px 24px rgba(0, 0, 0, 0.8))',
  },

  // Typography scale for consistency.
  // Headlines use the brand display face: Kanit ExtraBold Italic, uppercase.
  typography: {
    h1: {
      fontSize: '36px',
      fontWeight: 800,
      lineHeight: 1.2,
      fontFamily: "'Kanit', 'Barlow', sans-serif",
      fontStyle: 'italic' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.01em',
    },
    h1Mobile: {
      fontSize: '28px',
      fontWeight: 800,
      lineHeight: 1.2,
      fontFamily: "'Kanit', 'Barlow', sans-serif",
      fontStyle: 'italic' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.01em',
    },
    h2: {
      fontSize: '28px',
      fontWeight: 800,
      lineHeight: 1.3,
      fontFamily: "'Kanit', 'Barlow', sans-serif",
      fontStyle: 'italic' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.01em',
    },
    h2Mobile: {
      fontSize: '24px',
      fontWeight: 800,
      lineHeight: 1.3,
      fontFamily: "'Kanit', 'Barlow', sans-serif",
      fontStyle: 'italic' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.01em',
    },
    h3: {
      fontSize: '22px',
      fontWeight: 700,
      lineHeight: 1.4,
      fontFamily: "'Kanit', 'Barlow', sans-serif",
      fontStyle: 'italic' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.01em',
    },
    h3Mobile: {
      fontSize: '18px',
      fontWeight: 700,
      lineHeight: 1.4,
      fontFamily: "'Kanit', 'Barlow', sans-serif",
      fontStyle: 'italic' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.01em',
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
        border: '2px solid var(--c-bdr-primary, #26262B)',
        backgroundColor: 'var(--c-bg-tertiary, #1E1E21)',
        color: 'var(--c-txt-primary, #F4F4F5)',
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
        backgroundColor: 'var(--c-bg-secondary, #161618)',
        border: '2px solid var(--c-bdr-primary, #26262B)',
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
