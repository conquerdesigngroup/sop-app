import React, { useState } from 'react';
import { theme } from '../theme';

interface CustomCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export const CustomCheckbox: React.FC<CustomCheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  style,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onChange(e.target.checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLLabelElement>) => {
    if (e.key === ' ' && !disabled) {
      e.preventDefault();
      onChange(!checked);
    }
  };

  // Calculate dynamic styles based on state
  const getCheckboxStyle = (): React.CSSProperties => {
    let borderColor = theme.colors.bdr.secondary; // #3A3A3A
    let backgroundColor = 'transparent';

    if (checked) {
      borderColor = theme.colors.primary; // #EF233C
      backgroundColor = theme.colors.primary;

      if (isHovered && !disabled) {
        backgroundColor = theme.colors.primaryHover; // #FF2E47
        borderColor = theme.colors.primaryHover;
      }
    } else if (isHovered && !disabled) {
      borderColor = '#4A4A4A'; // Lighter border on hover
    }

    return {
      position: 'relative',
      width: '18px',
      height: '18px',
      border: `2px solid ${borderColor}`,
      borderRadius: '4px',
      backgroundColor,
      transition: 'all 200ms ease-in-out',
      flexShrink: 0,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      outline: isFocused && !disabled ? `2px solid rgba(239, 35, 60, 0.3)` : 'none',
      outlineOffset: '2px',
    };
  };

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        ...style,
      }}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={handleKeyDown}
    >
      {/* Native checkbox (hidden but functional for accessibility) */}
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{
          position: 'absolute',
          opacity: 0,
          width: 0,
          height: 0,
          pointerEvents: 'none',
        }}
        aria-label={label}
      />

      {/* Custom visual checkbox */}
      <span style={getCheckboxStyle()}>
        {checked && (
          <svg
            viewBox="0 0 16 16"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '12px',
              height: '12px',
              pointerEvents: 'none',
            }}
          >
            <path
              d="M13 3L6 11L3 8"
              stroke="#FFFFFF"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>

      {/* Label text */}
      {label && (
        <span
          style={{
            marginLeft: '8px',
            color: disabled ? theme.colors.txt.secondary : theme.colors.txt.primary,
            fontSize: '14px',
            lineHeight: '18px',
          }}
        >
          {label}
        </span>
      )}
    </label>
  );
};

export default CustomCheckbox;
