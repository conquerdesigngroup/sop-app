import React from 'react';
import { theme } from '../theme';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Dark / light switch.
 *
 * Two segments rather than one icon that flips. A single icon has to answer
 * "does the sun mean it IS light, or that pressing it MAKES it light" and it
 * cannot — half the people who meet it guess wrong. Two segments with the
 * current one lit says the state and the choice at the same time, and gives
 * each option its own hit target.
 *
 * Real <button>s with aria-pressed, not a styled div: this is the only control
 * on the front door besides the two tiles, and it has to be reachable by
 * keyboard and announceable.
 *
 * Preference lands in localStorage via ThemeProvider, so setting it here holds
 * for the staff app and the parent portal both — which is why the front door is
 * enough and every page does not need its own copy.
 */

const SunIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
    <path
      d="M12 1.5v2.2M12 20.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M1.5 12h2.2M20.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const MoonIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface SegmentProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

const Segment: React.FC<SegmentProps> = ({ label, icon, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={label}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '34px',
      height: '30px',
      padding: 0,
      border: 'none',
      cursor: 'pointer',
      borderRadius: theme.borderRadius.full,
      backgroundColor: active ? theme.colors.primary : 'transparent',
      // Hardcoded on the crimson: the mode-aware text tokens flip dark in light
      // mode and would vanish against the pink.
      color: active ? '#FFFFFF' : theme.colors.txt.tertiary,
      transition: 'background-color 0.2s ease, color 0.2s ease',
    }}
  >
    {icon}
  </button>
);

const ThemeToggle: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const { isDark, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Colour theme"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        padding: '3px',
        borderRadius: theme.borderRadius.full,
        backgroundColor: theme.colors.bg.tertiary,
        border: `1px solid ${theme.colors.bdr.primary}`,
        ...style,
      }}
    >
      <Segment
        label="Light mode"
        icon={SunIcon}
        active={!isDark}
        onClick={() => setTheme('light')}
      />
      <Segment
        label="Dark mode"
        icon={MoonIcon}
        active={isDark}
        onClick={() => setTheme('dark')}
      />
    </div>
  );
};

export default ThemeToggle;
