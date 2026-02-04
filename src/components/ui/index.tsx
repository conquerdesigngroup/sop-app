/**
 * SOP App - Unified UI Component Library
 * ========================================
 * USE THESE COMPONENTS FOR ALL UI ELEMENTS
 * This ensures consistent styling across the entire app.
 *
 * Components:
 * - Button: All buttons (primary, secondary, outline, danger, ghost)
 * - Card: Container cards with consistent borders/padding
 * - Input: Text inputs with optional icons
 * - SearchInput: Standardized search bars
 * - Select: Dropdown selects
 * - Textarea: Multi-line inputs
 * - Badge: Status badges and tags
 * - Modal: Consistent modal dialogs
 * - PageHeader: Page titles with actions
 * - Section: Content sections with titles
 * - Avatar: User avatars
 * - IconButton: Icon-only buttons
 * - Divider: Horizontal dividers
 * - EmptyState: Empty content placeholders
 */

import React, { forwardRef, useState, useEffect, useCallback } from 'react';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';

// ============================================
// BUTTON
// ============================================
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  leftIcon,
  rightIcon,
  disabled,
  children,
  style,
  ...props
}, ref) => {
  const getVariantStyles = (): React.CSSProperties => {
    const variants: Record<ButtonVariant, React.CSSProperties> = {
      primary: {
        backgroundColor: theme.colors.primary,
        color: '#FFFFFF',
        border: 'none',
      },
      secondary: {
        backgroundColor: theme.colors.bg.tertiary,
        color: theme.colors.txt.primary,
        border: `2px solid ${theme.colors.bdr.primary}`,
      },
      outline: {
        backgroundColor: 'transparent',
        color: theme.colors.primary,
        border: `2px solid ${theme.colors.primary}`,
      },
      danger: {
        backgroundColor: theme.colors.status.error,
        color: '#FFFFFF',
        border: 'none',
      },
      ghost: {
        backgroundColor: 'transparent',
        color: theme.colors.txt.secondary,
        border: 'none',
      },
      success: {
        backgroundColor: theme.colors.status.success,
        color: '#FFFFFF',
        border: 'none',
      },
    };
    return variants[variant];
  };

  const getSizeStyles = (): React.CSSProperties => {
    const sizes: Record<ButtonSize, React.CSSProperties> = {
      sm: { padding: '8px 16px', fontSize: '13px', minHeight: '36px' },
      md: { padding: '12px 20px', fontSize: '15px', minHeight: '44px' },
      lg: { padding: '14px 28px', fontSize: '16px', minHeight: '48px' },
    };
    return sizes[size];
  };

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 600,
    borderRadius: theme.borderRadius.md,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    outline: 'none',
    opacity: disabled || loading ? 0.6 : 1,
    width: fullWidth ? '100%' : 'auto',
    ...getSizeStyles(),
    ...getVariantStyles(),
    ...style,
  };

  return (
    <button ref={ref} style={buttonStyle} disabled={disabled || loading} {...props}>
      {loading ? (
        <Spinner size={16} />
      ) : leftIcon}
      {children && <span>{children}</span>}
      {!loading && rightIcon}
    </button>
  );
});

Button.displayName = 'Button';

// ============================================
// ICON BUTTON
// ============================================
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
  variant = 'ghost',
  size = 'md',
  children,
  disabled,
  style,
  ...props
}, ref) => {
  const getSizeStyles = (): React.CSSProperties => {
    const sizes = {
      sm: { width: '32px', height: '32px' },
      md: { width: '40px', height: '40px' },
      lg: { width: '48px', height: '48px' },
    };
    return sizes[size];
  };

  const getVariantStyles = (): React.CSSProperties => {
    const variants = {
      primary: { backgroundColor: theme.colors.primary, color: '#FFFFFF' },
      secondary: { backgroundColor: theme.colors.bg.tertiary, color: theme.colors.txt.primary, border: `1px solid ${theme.colors.bdr.primary}` },
      ghost: { backgroundColor: 'transparent', color: theme.colors.txt.secondary },
      danger: { backgroundColor: theme.colors.status.error, color: '#FFFFFF' },
    };
    return variants[variant];
  };

  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    opacity: disabled ? 0.6 : 1,
    ...getSizeStyles(),
    ...getVariantStyles(),
    ...style,
  };

  return (
    <button ref={ref} style={buttonStyle} disabled={disabled} {...props}>
      {children}
    </button>
  );
});

IconButton.displayName = 'IconButton';

// ============================================
// CARD
// ============================================
interface CardProps {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({
  children,
  padding = 'md',
  hover = false,
  onClick,
  style,
}) => {
  const { isMobileOrTablet } = useResponsive();
  const [isHovered, setIsHovered] = useState(false);

  const getPadding = () => {
    const paddings = {
      none: '0',
      sm: isMobileOrTablet ? '12px' : '16px',
      md: isMobileOrTablet ? '16px' : '24px',
      lg: isMobileOrTablet ? '20px' : '32px',
    };
    return paddings[padding];
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: theme.colors.bg.secondary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.lg,
    padding: getPadding(),
    transition: 'all 0.2s ease',
    cursor: onClick ? 'pointer' : 'default',
    ...(hover && isHovered ? {
      borderColor: theme.colors.bdr.secondary,
      transform: 'translateY(-2px)',
    } : {}),
    ...style,
  };

  return (
    <div
      style={cardStyle}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </div>
  );
};

// ============================================
// INPUT
// ============================================
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  size = 'md',
  fullWidth = true,
  disabled,
  style,
  ...props
}, ref) => {
  const { isMobileOrTablet } = useResponsive();

  const getSizeStyles = () => {
    const sizes = {
      sm: { padding: '8px 12px', fontSize: '14px' },
      md: { padding: '12px 16px', fontSize: '15px' },
      lg: { padding: '16px 20px', fontSize: '16px' },
    };
    return sizes[size];
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${error ? theme.colors.status.error : theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    outline: 'none',
    transition: 'border-color 0.2s ease',
    opacity: disabled ? 0.6 : 1,
    ...(isMobileOrTablet ? { fontSize: '16px' } : {}), // Prevent iOS zoom
    ...getSizeStyles(),
    ...(leftIcon ? { paddingLeft: '44px' } : {}),
    ...(rightIcon ? { paddingRight: '44px' } : {}),
    ...style,
  };

  return (
    <div style={{ width: fullWidth ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {label && <label style={labelStyle}>{label}</label>}
      <div style={{ position: 'relative' }}>
        {leftIcon && (
          <div style={{ ...iconContainerStyle, left: '14px' }}>{leftIcon}</div>
        )}
        <input ref={ref} style={inputStyle} disabled={disabled} {...props} />
        {rightIcon && (
          <div style={{ ...iconContainerStyle, right: '14px' }}>{rightIcon}</div>
        )}
      </div>
      {error && <span style={errorStyle}>{error}</span>}
      {helperText && !error && <span style={helperStyle}>{helperText}</span>}
    </div>
  );
});

Input.displayName = 'Input';

// ============================================
// SEARCH INPUT
// ============================================
interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  onClear?: () => void;
  size?: 'sm' | 'md';
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(({
  value,
  onClear,
  size = 'md',
  style,
  ...props
}, ref) => {
  const getSizeStyles = () => {
    return size === 'sm'
      ? { padding: '10px 12px 10px 40px', fontSize: '14px' }
      : { padding: '12px 16px 12px 44px', fontSize: '15px' };
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    outline: 'none',
    transition: 'border-color 0.2s ease',
    ...getSizeStyles(),
    ...style,
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'absolute', left: size === 'sm' ? '12px' : '14px', top: '50%', transform: 'translateY(-50%)', color: theme.colors.txt.tertiary }}>
        <SearchIcon size={size === 'sm' ? 16 : 18} />
      </div>
      <input ref={ref} style={inputStyle} value={value} {...props} />
      {value && onClear && (
        <button
          type="button"
          onClick={onClear}
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: theme.colors.txt.tertiary,
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
          }}
        >
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  );
});

SearchInput.displayName = 'SearchInput';

// ============================================
// SELECT
// ============================================
interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  options,
  placeholder,
  size = 'md',
  fullWidth = true,
  disabled,
  style,
  ...props
}, ref) => {
  const getSizeStyles = () => {
    const sizes = {
      sm: { padding: '8px 36px 8px 12px', fontSize: '14px' },
      md: { padding: '12px 40px 12px 16px', fontSize: '15px' },
      lg: { padding: '16px 44px 16px 20px', fontSize: '16px' },
    };
    return sizes[size];
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${error ? theme.colors.status.error : theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23D0D0D0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    opacity: disabled ? 0.6 : 1,
    ...getSizeStyles(),
    ...style,
  };

  return (
    <div style={{ width: fullWidth ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {label && <label style={labelStyle}>{label}</label>}
      <select ref={ref} style={selectStyle} disabled={disabled} {...props}>
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span style={errorStyle}>{error}</span>}
    </div>
  );
});

Select.displayName = 'Select';

// ============================================
// TEXTAREA
// ============================================
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  helperText,
  fullWidth = true,
  disabled,
  style,
  ...props
}, ref) => {
  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '100px',
    padding: '12px 16px',
    fontSize: '15px',
    backgroundColor: theme.colors.bg.tertiary,
    border: `2px solid ${error ? theme.colors.status.error : theme.colors.bdr.primary}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.txt.primary,
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    opacity: disabled ? 0.6 : 1,
    ...style,
  };

  return (
    <div style={{ width: fullWidth ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {label && <label style={labelStyle}>{label}</label>}
      <textarea ref={ref} style={textareaStyle} disabled={disabled} {...props} />
      {error && <span style={errorStyle}>{error}</span>}
      {helperText && !error && <span style={helperStyle}>{helperText}</span>}
    </div>
  );
});

Textarea.displayName = 'Textarea';

// ============================================
// BADGE
// ============================================
type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  style,
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    const variants: Record<BadgeVariant, React.CSSProperties> = {
      default: { backgroundColor: theme.colors.bg.tertiary, color: theme.colors.txt.secondary },
      primary: { backgroundColor: theme.colors.primary, color: '#FFFFFF' },
      success: { backgroundColor: theme.colors.status.success, color: '#FFFFFF' },
      warning: { backgroundColor: theme.colors.status.warning, color: '#000000' },
      danger: { backgroundColor: theme.colors.status.error, color: '#FFFFFF' },
      info: { backgroundColor: theme.colors.status.info, color: '#FFFFFF' },
    };
    return variants[variant];
  };

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: size === 'sm' ? '2px 8px' : '4px 12px',
    fontSize: size === 'sm' ? '11px' : '12px',
    fontWeight: 600,
    borderRadius: theme.borderRadius.full,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    ...getVariantStyles(),
    ...style,
  };

  return <span style={badgeStyle}>{children}</span>;
};

// ============================================
// MODAL
// ============================================
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  footer,
}) => {
  const { isMobileOrTablet } = useResponsive();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const getMaxWidth = () => {
    if (isMobileOrTablet) return '95%';
    const sizes = { sm: '400px', md: '560px', lg: '720px', xl: '900px' };
    return sizes[size];
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={{
          ...modalStyle,
          maxWidth: getMaxWidth(),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showCloseButton) && (
          <div style={modalHeaderStyle}>
            {title && <h2 style={modalTitleStyle}>{title}</h2>}
            {showCloseButton && (
              <IconButton variant="ghost" size="sm" onClick={onClose}>
                <CloseIcon size={20} />
              </IconButton>
            )}
          </div>
        )}
        <div style={modalContentStyle}>{children}</div>
        {footer && <div style={modalFooterStyle}>{footer}</div>}
      </div>
    </div>
  );
};

// ============================================
// PAGE HEADER
// ============================================
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  backButton?: {
    label: string;
    onClick: () => void;
  };
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  backButton,
}) => {
  const { isMobileOrTablet } = useResponsive();

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobileOrTablet ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: isMobileOrTablet ? 'flex-start' : 'center',
      gap: '16px',
      marginBottom: isMobileOrTablet ? '24px' : '32px',
    }}>
      <div>
        {backButton && (
          <button
            onClick={backButton.onClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              color: theme.colors.txt.secondary,
              fontSize: '14px',
              cursor: 'pointer',
              padding: 0,
              marginBottom: '12px',
            }}
          >
            <ChevronLeftIcon size={16} />
            {backButton.label}
          </button>
        )}
        <h1 style={{
          ...(isMobileOrTablet ? theme.typography.h1Mobile : theme.typography.h1),
          color: theme.colors.txt.primary,
          margin: 0,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            ...theme.typography.body,
            color: theme.colors.txt.secondary,
            marginTop: '8px',
            margin: 0,
          }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
};

// ============================================
// SECTION
// ============================================
interface SectionProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const Section: React.FC<SectionProps> = ({
  title,
  subtitle,
  actions,
  children,
  style,
}) => {
  return (
    <div style={{ marginBottom: '24px', ...style }}>
      {(title || actions) && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <div>
            {title && (
              <h3 style={{
                ...theme.typography.h3,
                color: theme.colors.txt.primary,
                margin: 0,
              }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p style={{
                ...theme.typography.bodySmall,
                color: theme.colors.txt.tertiary,
                marginTop: '4px',
                margin: 0,
              }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
};

// ============================================
// AVATAR
// ============================================
interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  style?: React.CSSProperties;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  src,
  size = 'md',
  style,
}) => {
  const getSize = () => {
    const sizes = { sm: 28, md: 36, lg: 44, xl: 56 };
    return sizes[size];
  };

  const getFontSize = () => {
    const sizes = { sm: '10px', md: '12px', lg: '14px', xl: '18px' };
    return sizes[size];
  };

  const getInitials = () => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };

  // Generate consistent color from name
  const getColor = () => {
    const colors = [
      theme.colors.primary,
      theme.colors.status.info,
      theme.colors.status.success,
      theme.colors.status.warning,
      '#9333EA',
      '#EC4899',
      '#F97316',
    ];
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  const dimension = getSize();

  const avatarStyle: React.CSSProperties = {
    width: dimension,
    height: dimension,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: src ? 'transparent' : getColor(),
    color: '#FFFFFF',
    fontSize: getFontSize(),
    fontWeight: 700,
    flexShrink: 0,
    overflow: 'hidden',
    ...style,
  };

  if (src) {
    return (
      <div style={avatarStyle}>
        <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  return <div style={avatarStyle}>{getInitials()}</div>;
};

// ============================================
// DIVIDER
// ============================================
interface DividerProps {
  margin?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
}

export const Divider: React.FC<DividerProps> = ({ margin = 'md', style }) => {
  const getMargin = () => {
    const margins = { sm: '12px 0', md: '20px 0', lg: '32px 0' };
    return margins[margin];
  };

  return (
    <hr
      style={{
        border: 'none',
        borderTop: `1px solid ${theme.colors.bdr.primary}`,
        margin: getMargin(),
        ...style,
      }}
    />
  );
};

// ============================================
// EMPTY STATE
// ============================================
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      textAlign: 'center',
    }}>
      {icon && (
        <div style={{ color: theme.colors.txt.tertiary, marginBottom: '16px' }}>
          {icon}
        </div>
      )}
      <h3 style={{
        ...theme.typography.h3,
        color: theme.colors.txt.primary,
        margin: 0,
        marginBottom: '8px',
      }}>
        {title}
      </h3>
      {description && (
        <p style={{
          ...theme.typography.body,
          color: theme.colors.txt.tertiary,
          margin: 0,
          maxWidth: '400px',
        }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: '24px' }}>{action}</div>}
    </div>
  );
};

// ============================================
// SPINNER
// ============================================
interface SpinnerProps {
  size?: number;
  color?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 20,
  color = 'currentColor',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={{ animation: 'spin 1s linear infinite' }}
  >
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
  </svg>
);

// ============================================
// ICONS (commonly used)
// ============================================
interface IconProps {
  size?: number;
  color?: string;
}

export const SearchIcon: React.FC<IconProps> = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const ChevronLeftIcon: React.FC<IconProps> = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

export const PlusIcon: React.FC<IconProps> = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const EditIcon: React.FC<IconProps> = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

export const TrashIcon: React.FC<IconProps> = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export const FilterIcon: React.FC<IconProps> = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

export const CalendarIcon: React.FC<IconProps> = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

// ============================================
// SHARED STYLES
// ============================================
const labelStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 500,
  color: theme.colors.txt.primary,
};

const errorStyle: React.CSSProperties = {
  fontSize: '13px',
  color: theme.colors.status.error,
};

const helperStyle: React.CSSProperties = {
  fontSize: '13px',
  color: theme.colors.txt.tertiary,
};

const iconContainerStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  color: theme.colors.txt.tertiary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '20px',
};

const modalStyle: React.CSSProperties = {
  backgroundColor: theme.colors.bg.secondary,
  border: `2px solid ${theme.colors.bdr.primary}`,
  borderRadius: theme.borderRadius.lg,
  width: '100%',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '20px 24px',
  borderBottom: `1px solid ${theme.colors.bdr.primary}`,
};

const modalTitleStyle: React.CSSProperties = {
  ...theme.typography.h3,
  color: theme.colors.txt.primary,
  margin: 0,
};

const modalContentStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '24px',
};

const modalFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  padding: '20px 24px',
  borderTop: `1px solid ${theme.colors.bdr.primary}`,
};

// Export everything
export default {
  Button,
  IconButton,
  Card,
  Input,
  SearchInput,
  Select,
  Textarea,
  Badge,
  Modal,
  PageHeader,
  Section,
  Avatar,
  Divider,
  EmptyState,
  Spinner,
};
