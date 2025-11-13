import React from 'react';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  maxWidth?: string;
  padding?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  maxWidth = '1400px',
  padding = 'lg',
  className,
}) => {
  const { isMobileOrTablet } = useResponsive();

  const getPadding = () => {
    if (isMobileOrTablet) {
      return padding === 'sm' ? '12px' : padding === 'md' ? '16px' : '16px';
    }
    return padding === 'sm' ? '24px' : padding === 'md' ? '32px' : '40px';
  };

  const containerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth,
    margin: '0 auto',
    padding: getPadding(),
  };

  return (
    <div style={containerStyle} className={className}>
      {children}
    </div>
  );
};

interface ResponsiveGridProps {
  children: React.ReactNode;
  columns?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  gap?: string;
  minColumnWidth?: string;
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  columns = { mobile: 1, tablet: 2, desktop: 3 },
  gap = '20px',
  minColumnWidth,
}) => {
  const { isMobile, isTablet, isDesktop } = useResponsive();

  const getColumns = () => {
    if (minColumnWidth) {
      return `repeat(auto-fit, minmax(${minColumnWidth}, 1fr))`;
    }
    if (isMobile) return `repeat(${columns.mobile || 1}, 1fr)`;
    if (isTablet) return `repeat(${columns.tablet || 2}, 1fr)`;
    return `repeat(${columns.desktop || 3}, 1fr)`;
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: getColumns(),
    gap: isMobile ? '12px' : gap,
  };

  return <div style={gridStyle}>{children}</div>;
};

interface ResponsiveStackProps {
  children: React.ReactNode;
  direction?: 'horizontal' | 'vertical';
  gap?: string;
  alignItems?: string;
  justifyContent?: string;
  breakpoint?: 'mobile' | 'tablet';
}

export const ResponsiveStack: React.FC<ResponsiveStackProps> = ({
  children,
  direction = 'horizontal',
  gap = '16px',
  alignItems = 'stretch',
  justifyContent = 'flex-start',
  breakpoint = 'tablet',
}) => {
  const { isMobile, isMobileOrTablet } = useResponsive();

  const shouldStack = breakpoint === 'mobile' ? isMobile : isMobileOrTablet;

  const stackStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: shouldStack ? 'column' : direction === 'vertical' ? 'column' : 'row',
    gap: shouldStack ? '12px' : gap,
    alignItems,
    justifyContent,
  };

  return <div style={stackStyle}>{children}</div>;
};
