import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { applyThemeMode, getThemeColors } from '../theme';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
  mode: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  isDark: boolean;
  isLight: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'sop_app_theme_mode';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize theme from localStorage or system preference
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
      // Check system preference
      if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
    }
    return 'dark'; // Default to dark
  });

  // Save theme preference to localStorage
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, mode);

    // Update CSS custom properties on document root — this is what re-themes
    // every inline style that references theme.colors.* (they resolve to var()s)
    const root = document.documentElement;
    root.setAttribute('data-theme', mode);
    applyThemeMode(mode);

    // Update body background
    const colors = getThemeColors(mode);
    document.body.style.backgroundColor = colors.bg.primary;
    document.body.style.color = colors.txt.primary;
  }, [mode]);

  const toggleTheme = useCallback(() => {
    setMode(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  const setTheme = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
  }, []);

  const value = useMemo(() => ({
    mode,
    toggleTheme,
    setTheme,
    isDark: mode === 'dark',
    isLight: mode === 'light',
  }), [mode, toggleTheme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Hook to get theme-aware colors
export const useThemeColors = () => {
  const { isDark } = useTheme();

  return useMemo(() => ({
    // Backgrounds
    bg: {
      primary: isDark ? '#0D0D0D' : '#F5F5F7',
      secondary: isDark ? '#1A1A1A' : '#FFFFFF',
      tertiary: isDark ? '#242424' : '#F0F0F2',
      dark: isDark ? '#000000' : '#E5E5E7',
    },
    // Text
    txt: {
      primary: isDark ? '#F2F2F2' : '#1A1A1A',
      secondary: isDark ? '#D0D0D0' : '#4A4A4A',
      tertiary: isDark ? '#8B8B8B' : '#6B6B6B',
    },
    // Borders
    bdr: {
      primary: isDark ? '#2A2A2A' : '#E0E0E2',
      secondary: isDark ? '#3A3A3A' : '#D0D0D2',
    },
    // Shadows
    shadow: isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.1)',
    // Modal overlay
    overlay: isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)',
  }), [isDark]);
};
