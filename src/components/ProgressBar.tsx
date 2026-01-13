import React, { useEffect, useState } from 'react';
import { theme } from '../theme';

type ProgressVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';
type ProgressSize = 'sm' | 'md' | 'lg';

interface ProgressBarProps {
  value: number; // 0-100
  variant?: ProgressVariant;
  size?: ProgressSize;
  showLabel?: boolean;
  labelPosition?: 'inside' | 'outside' | 'top';
  animated?: boolean;
  striped?: boolean;
  label?: string;
  className?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  variant = 'default',
  size = 'md',
  showLabel = false,
  labelPosition = 'outside',
  animated = true,
  striped = false,
  label,
  className,
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  // Animate the progress bar on mount and value change
  useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => {
        setDisplayValue(Math.min(100, Math.max(0, value)));
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setDisplayValue(Math.min(100, Math.max(0, value)));
    }
  }, [value, animated]);

  const getVariantColor = () => {
    switch (variant) {
      case 'success':
        return theme.colors.status.success;
      case 'warning':
        return theme.colors.status.warning;
      case 'danger':
        return theme.colors.status.error;
      case 'info':
        return theme.colors.status.info;
      default:
        return theme.colors.primary;
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return { height: '6px', fontSize: '10px' };
      case 'lg':
        return { height: '16px', fontSize: '13px' };
      default:
        return { height: '10px', fontSize: '12px' };
    }
  };

  const color = getVariantColor();
  const sizeStyles = getSizeStyles();
  const displayLabel = label || `${Math.round(displayValue)}%`;

  return (
    <div className={className} style={styles.container}>
      {showLabel && labelPosition === 'top' && (
        <div style={styles.topLabel}>
          <span style={{ ...styles.labelText, fontSize: sizeStyles.fontSize }}>
            {displayLabel}
          </span>
        </div>
      )}

      <div style={styles.wrapper}>
        <div
          style={{
            ...styles.track,
            height: sizeStyles.height,
          }}
        >
          <div
            style={{
              ...styles.fill,
              width: `${displayValue}%`,
              backgroundColor: color,
              height: sizeStyles.height,
              ...(striped ? {
                backgroundImage: `linear-gradient(
                  45deg,
                  rgba(255, 255, 255, 0.15) 25%,
                  transparent 25%,
                  transparent 50%,
                  rgba(255, 255, 255, 0.15) 50%,
                  rgba(255, 255, 255, 0.15) 75%,
                  transparent 75%,
                  transparent
                )`,
                backgroundSize: '1rem 1rem',
              } : {}),
            }}
          >
            {showLabel && labelPosition === 'inside' && size === 'lg' && displayValue > 15 && (
              <span style={{ ...styles.insideLabel, fontSize: sizeStyles.fontSize }}>
                {displayLabel}
              </span>
            )}
          </div>
        </div>

        {showLabel && labelPosition === 'outside' && (
          <span style={{ ...styles.outsideLabel, fontSize: sizeStyles.fontSize }}>
            {displayLabel}
          </span>
        )}
      </div>

      <style>{`
        @keyframes progress-stripes {
          from { background-position: 1rem 0; }
          to { background-position: 0 0; }
        }
      `}</style>
    </div>
  );
};

// Circular Progress variant
interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  variant?: ProgressVariant;
  showLabel?: boolean;
  animated?: boolean;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  size = 60,
  strokeWidth = 6,
  variant = 'default',
  showLabel = true,
  animated = true,
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => {
        setDisplayValue(Math.min(100, Math.max(0, value)));
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setDisplayValue(Math.min(100, Math.max(0, value)));
    }
  }, [value, animated]);

  const getVariantColor = () => {
    switch (variant) {
      case 'success':
        return theme.colors.status.success;
      case 'warning':
        return theme.colors.status.warning;
      case 'danger':
        return theme.colors.status.error;
      case 'info':
        return theme.colors.status.info;
      default:
        return theme.colors.primary;
    }
  };

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (displayValue / 100) * circumference;
  const color = getVariantColor();

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.colors.bg.tertiary}
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: animated ? 'stroke-dashoffset 0.5s ease-out' : 'none',
          }}
        />
      </svg>
      {showLabel && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: size * 0.25,
            fontWeight: 700,
            color: theme.colors.txt.primary,
          }}
        >
          {Math.round(displayValue)}%
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100%',
  },
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  track: {
    flex: 1,
    backgroundColor: theme.colors.bg.tertiary,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: theme.borderRadius.full,
    transition: 'width 0.5s ease-out',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  topLabel: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: '4px',
  },
  labelText: {
    color: theme.colors.txt.secondary,
    fontWeight: 600,
  },
  outsideLabel: {
    color: theme.colors.txt.secondary,
    fontWeight: 600,
    minWidth: '40px',
    textAlign: 'right',
  },
  insideLabel: {
    color: '#FFFFFF',
    fontWeight: 600,
    paddingRight: '8px',
  },
};

export default ProgressBar;
