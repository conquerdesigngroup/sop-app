import React, { forwardRef, useCallback } from 'react';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { CustomCheckbox } from './CustomCheckbox';

// Ripple effect hook
const useRipple = () => {
  const createRipple = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    const ripple = document.createElement('span');
    ripple.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      transform: scale(0);
      animation: ripple-effect 0.6s ease-out;
      pointer-events: none;
    `;

    button.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 600);
  }, []);

  return createRipple;
};

// ============================================
// FormInput Component
// ============================================
interface FormInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(({
  label,
  error,
  helperText,
  fullWidth = true,
  size = 'md',
  disabled,
  className,
  style,
  ...props
}, ref) => {
  const { isMobileOrTablet } = useResponsive();

  const inputStyle: React.CSSProperties = {
    ...theme.components.input.base,
    ...(isMobileOrTablet ? theme.components.input.mobile : {}),
    ...(size === 'sm' ? { padding: '8px 12px', fontSize: '14px' } : {}),
    ...(size === 'lg' ? { padding: '16px 20px', fontSize: '16px' } : {}),
    ...(error ? { borderColor: theme.colors.status.error } : {}),
    ...(disabled ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
    ...style,
  };

  return (
    <div style={{ ...styles.inputGroup, width: fullWidth ? '100%' : 'auto' }}>
      {label && <label style={styles.label}>{label}</label>}
      <input
        ref={ref}
        style={inputStyle}
        disabled={disabled}
        className={`form-input ${className || ''}`}
        {...props}
      />
      {error && <span style={styles.errorText}>{error}</span>}
      {helperText && !error && <span style={styles.helperText}>{helperText}</span>}
    </div>
  );
});

FormInput.displayName = 'FormInput';

// ============================================
// FormTextarea Component
// ============================================
interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  showCharCount?: boolean;
  maxLength?: number;
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(({
  label,
  error,
  helperText,
  fullWidth = true,
  showCharCount = false,
  maxLength,
  disabled,
  value,
  className,
  style,
  ...props
}, ref) => {
  const { isMobileOrTablet } = useResponsive();
  const charCount = typeof value === 'string' ? value.length : 0;

  const textareaStyle: React.CSSProperties = {
    ...theme.components.input.base,
    ...(isMobileOrTablet ? theme.components.input.mobile : {}),
    minHeight: '100px',
    resize: 'vertical',
    ...(error ? { borderColor: theme.colors.status.error } : {}),
    ...(disabled ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
    ...style,
  };

  return (
    <div style={{ ...styles.inputGroup, width: fullWidth ? '100%' : 'auto' }}>
      {label && <label style={styles.label}>{label}</label>}
      <textarea
        ref={ref}
        style={textareaStyle}
        disabled={disabled}
        value={value}
        maxLength={maxLength}
        className={`form-textarea ${className || ''}`}
        {...props}
      />
      <div style={styles.textareaFooter}>
        {error && <span style={styles.errorText}>{error}</span>}
        {helperText && !error && <span style={styles.helperText}>{helperText}</span>}
        {showCharCount && maxLength && (
          <span style={styles.charCount}>
            {charCount}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
});

FormTextarea.displayName = 'FormTextarea';

// ============================================
// FormSelect Component
// ============================================
interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface FormSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  options: SelectOption[];
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(({
  label,
  error,
  helperText,
  fullWidth = true,
  options,
  placeholder,
  size = 'md',
  disabled,
  className,
  style,
  ...props
}, ref) => {
  const { isMobileOrTablet } = useResponsive();

  const selectStyle: React.CSSProperties = {
    ...theme.components.input.base,
    ...(isMobileOrTablet ? theme.components.input.mobile : {}),
    ...(size === 'sm' ? { padding: '8px 12px', fontSize: '14px' } : {}),
    ...(size === 'lg' ? { padding: '16px 20px', fontSize: '16px' } : {}),
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23D0D0D0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 16px center',
    paddingRight: '44px',
    cursor: 'pointer',
    ...(error ? { borderColor: theme.colors.status.error } : {}),
    ...(disabled ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
    ...style,
  };

  return (
    <div style={{ ...styles.inputGroup, width: fullWidth ? '100%' : 'auto' }}>
      {label && <label style={styles.label}>{label}</label>}
      <select
        ref={ref}
        style={selectStyle}
        disabled={disabled}
        className={`form-select ${className || ''}`}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span style={styles.errorText}>{error}</span>}
      {helperText && !error && <span style={styles.helperText}>{helperText}</span>}
    </div>
  );
});

FormSelect.displayName = 'FormSelect';

// ============================================
// FormButton Component
// ============================================
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface FormButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const FormButton = forwardRef<HTMLButtonElement, FormButtonProps>(({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  leftIcon,
  rightIcon,
  disabled,
  children,
  className,
  style,
  onClick,
  ...props
}, ref) => {
  const createRipple = useRipple();

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: theme.colors.primary,
          color: '#FFFFFF',
          border: 'none',
        };
      case 'secondary':
        return {
          backgroundColor: theme.colors.bg.tertiary,
          color: theme.colors.txt.primary,
          border: `2px solid ${theme.colors.bdr.primary}`,
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: theme.colors.primary,
          border: `2px solid ${theme.colors.primary}`,
        };
      case 'danger':
        return {
          backgroundColor: theme.colors.status.error,
          color: '#FFFFFF',
          border: 'none',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: theme.colors.txt.secondary,
          border: 'none',
        };
      default:
        return {};
    }
  };

  const buttonStyle: React.CSSProperties = {
    ...theme.components.button.base,
    ...theme.components.button.sizes[size],
    ...getVariantStyles(),
    position: 'relative',
    overflow: 'hidden',
    ...(fullWidth ? { width: '100%' } : {}),
    ...(disabled || loading ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
    ...style,
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !loading) {
      createRipple(e);
    }
    onClick?.(e);
  };

  return (
    <button
      ref={ref}
      style={buttonStyle}
      disabled={disabled || loading}
      className={`form-button form-button-${variant} btn-hover ${variant === 'primary' ? 'btn-primary' : ''} ${className || ''}`}
      onClick={handleClick}
      {...props}
    >
      {loading ? (
        <>
          <LoadingSpinner />
          <span>{children}</span>
        </>
      ) : (
        <>
          {leftIcon && <span style={styles.buttonIcon}>{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && <span style={styles.buttonIcon}>{rightIcon}</span>}
        </>
      )}
    </button>
  );
});

FormButton.displayName = 'FormButton';

// ============================================
// FormCheckbox Component
// ============================================
interface FormCheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label: string;
  error?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export const FormCheckbox = forwardRef<HTMLInputElement, FormCheckboxProps>(({
  label,
  error,
  disabled,
  checked = false,
  onChange,
  className,
  style,
  ...props
}, ref) => {
  const handleChange = (newChecked: boolean) => {
    if (onChange) {
      onChange(newChecked);
    }
  };

  return (
    <div style={styles.checkboxContainer}>
      <CustomCheckbox
        checked={checked}
        onChange={handleChange}
        label={label}
        disabled={disabled}
        style={style}
      />
      {error && <span style={styles.errorText}>{error}</span>}
    </div>
  );
});

FormCheckbox.displayName = 'FormCheckbox';

// ============================================
// FormGroup Component (for grouping form fields)
// ============================================
interface FormGroupProps {
  children: React.ReactNode;
  direction?: 'row' | 'column';
  gap?: string;
  style?: React.CSSProperties;
}

export const FormGroup: React.FC<FormGroupProps> = ({
  children,
  direction = 'column',
  gap = theme.spacing.lg,
  style,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: direction,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ============================================
// Loading Spinner Component
// ============================================
const LoadingSpinner: React.FC = () => (
  <svg
    style={styles.spinner}
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
  </svg>
);

// ============================================
// Styles
// ============================================
const styles: { [key: string]: React.CSSProperties } = {
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
  errorText: {
    fontSize: '13px',
    color: theme.colors.status.error,
    marginTop: '4px',
  },
  helperText: {
    fontSize: '13px',
    color: theme.colors.txt.tertiary,
    marginTop: '4px',
  },
  textareaFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCount: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
    marginLeft: 'auto',
  },
  checkboxContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
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
  buttonIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    animation: 'spin 1s linear infinite',
  },
};

// Export all components
export default {
  FormInput,
  FormTextarea,
  FormSelect,
  FormButton,
  FormCheckbox,
  FormGroup,
};
