# Responsive Design System Guide

## Overview

This guide explains how to use the responsive design system implemented in your SOP App to ensure optimal display across all devices (mobile, tablet, desktop).

## Breakpoints

The app uses the following breakpoints defined in `src/theme.ts`:

- **Mobile**: < 480px
- **Tablet**: 480px - 768px
- **Desktop**: 768px - 1024px
- **Wide**: > 1024px

## Core Components

### 1. useResponsive Hook

The primary way to handle responsive behavior in components.

```tsx
import { useResponsive } from '../hooks/useResponsive';

const MyComponent = () => {
  const {
    isMobile,
    isTablet,
    isDesktop,
    isMobileOrTablet,
    windowWidth,
    breakpoint
  } = useResponsive();

  return (
    <div style={isMobileOrTablet ? mobileStyles : desktopStyles}>
      {/* Your content */}
    </div>
  );
};
```

### 2. Responsive Container Components

Pre-built components for common responsive patterns:

#### ResponsiveContainer
Provides consistent padding and max-width across breakpoints.

```tsx
import { ResponsiveContainer } from '../components/ResponsiveContainer';

<ResponsiveContainer maxWidth="1400px" padding="lg">
  {/* Your content */}
</ResponsiveContainer>
```

#### ResponsiveGrid
Automatic grid layout that adapts to screen size.

```tsx
import { ResponsiveGrid } from '../components/ResponsiveContainer';

<ResponsiveGrid
  columns={{ mobile: 1, tablet: 2, desktop: 3 }}
  gap="20px"
>
  {items.map(item => <Card key={item.id} {...item} />)}
</ResponsiveGrid>
```

#### ResponsiveStack
Stacks elements vertically on mobile, horizontally on desktop.

```tsx
import { ResponsiveStack } from '../components/ResponsiveContainer';

<ResponsiveStack direction="horizontal" gap="16px">
  <Button>Cancel</Button>
  <Button>Submit</Button>
</ResponsiveStack>
```

## CSS Utility Classes

Global responsive classes available in `src/index.css`:

- `.hide-mobile` - Hidden on screens < 768px
- `.hide-desktop` - Hidden on screens > 768px
- `.container-responsive` - Responsive container with auto padding
- `.grid-responsive-1` - 1 column on mobile, auto-fit on desktop
- `.grid-responsive-2` - 1 column on mobile, larger min-width on desktop

## Responsive Spacing

Use theme-based spacing that adapts to screen size:

```tsx
import { theme } from '../theme';

const styles = {
  container: {
    padding: theme.responsiveSpacing.containerPadding.desktop, // Use in inline styles
  }
};

// Or use the responsive hook
const { isMobileOrTablet } = useResponsive();
const padding = isMobileOrTablet
  ? theme.responsiveSpacing.containerPadding.mobile
  : theme.responsiveSpacing.containerPadding.desktop;
```

## Best Practices

### 1. Mobile-First Approach

Always design for mobile first, then enhance for larger screens:

```tsx
// Good ✅
const styles = {
  container: {
    padding: '16px',  // Mobile default
    ...(isDesktop && { padding: '40px' })  // Desktop enhancement
  }
};

// Avoid ❌
const styles = {
  container: {
    padding: '40px',  // Desktop default
    ...(isMobile && { padding: '16px' })  // Mobile override
  }
};
```

### 2. Touch Targets

Ensure interactive elements are at least 44x44px on mobile:

```tsx
const buttonStyles = {
  padding: '12px 24px',
  minHeight: '44px',
  minWidth: '44px',
};
```

### 3. Text Sizing

Use relative units or responsive scaling:

```tsx
const styles = {
  title: {
    fontSize: isMobileOrTablet ? '24px' : '36px',
    fontWeight: '800',
  }
};
```

### 4. Grid Layouts

Use responsive grid patterns that collapse on mobile:

```tsx
const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: isMobileOrTablet
      ? '1fr'  // Single column on mobile
      : 'repeat(auto-fit, minmax(300px, 1fr))',  // Auto-fit on desktop
    gap: isMobileOrTablet ? '12px' : '24px',
  }
};
```

### 5. Navigation

- Use hamburger menu for mobile (see `Navigation.tsx`)
- Keep logo centered on mobile
- Show full nav on desktop

### 6. Forms

- Full-width inputs on mobile
- Use 16px font size minimum to prevent iOS zoom
- Stack form fields vertically on mobile

```tsx
const inputStyles = {
  width: '100%',
  fontSize: '16px',  // Prevents zoom on iOS
  padding: '12px',
};
```

## Component-Specific Patterns

### Navigation Component

The navigation uses conditional rendering for mobile vs desktop:

```tsx
{isMobileOrTablet && (
  // Mobile hamburger menu
  <MobileNav />
)}

{!isMobileOrTablet && (
  // Desktop horizontal nav
  <DesktopNav />
)}
```

### Dashboard Component

Uses separate style objects for mobile and desktop:

```tsx
const styles = {
  container: {
    padding: '40px',
    maxWidth: '1400px',
  },
  containerMobile: {
    padding: '16px',
    maxWidth: '100%',
  },
};

// Apply conditionally
<div style={isMobileOrTablet ? styles.containerMobile : styles.container}>
```

## Testing Responsive Layouts

### Browser DevTools

1. Open Chrome/Firefox DevTools (F12)
2. Click the device toolbar icon (Ctrl/Cmd + Shift + M)
3. Test common devices:
   - iPhone 12/13 (390px)
   - iPad (768px)
   - Desktop (1920px)

### Real Devices

- Test on actual mobile devices when possible
- Pay attention to touch interactions
- Check landscape orientation

## Common Responsive Issues & Solutions

### Issue: Horizontal Scrollbar on Mobile

**Solution**: Ensure containers don't exceed viewport width
```css
body {
  overflow-x: hidden;
}

* {
  box-sizing: border-box;
}
```

### Issue: Text Too Small on Mobile

**Solution**: Use responsive font sizes
```tsx
fontSize: isMobileOrTablet ? '14px' : '16px'
```

### Issue: Buttons Too Small on Touch Devices

**Solution**: Minimum 44px touch targets
```tsx
minHeight: '44px',
minWidth: '44px',
```

### Issue: Images Breaking Layout

**Solution**: Use max-width
```tsx
img {
  maxWidth: '100%',
  height: 'auto',
}
```

## Migrating Existing Components

To make an existing component responsive:

1. Import `useResponsive` hook
2. Create mobile-specific styles
3. Conditionally apply styles based on breakpoint
4. Test on multiple screen sizes

### Example Migration

**Before:**
```tsx
const Component = () => (
  <div style={{ padding: '40px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
    {/* content */}
  </div>
);
```

**After:**
```tsx
const Component = () => {
  const { isMobileOrTablet } = useResponsive();

  return (
    <div style={{
      padding: isMobileOrTablet ? '16px' : '40px',
      display: 'grid',
      gridTemplateColumns: isMobileOrTablet ? '1fr' : '1fr 1fr 1fr',
    }}>
      {/* content */}
    </div>
  );
};
```

## Resources

- [Navigation Component](src/components/Navigation.tsx) - Example of mobile hamburger menu
- [Dashboard Component](src/pages/Dashboard.tsx) - Example of responsive grid layouts
- [Theme File](src/theme.ts) - Breakpoints and responsive utilities
- [useResponsive Hook](src/hooks/useResponsive.ts) - Core responsive logic

## Next Steps

1. Update remaining page components (SOPPage, TemplatesPage, etc.)
2. Test all forms on mobile devices
3. Optimize images for mobile bandwidth
4. Add loading states for better mobile UX
5. Consider implementing lazy loading for improved performance
