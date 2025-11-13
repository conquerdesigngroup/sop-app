import { useState, useEffect } from 'react';
import { responsive } from '../theme';

type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide';

export const useResponsive = () => {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    responsive.getCurrentBreakpoint()
  );
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setBreakpoint(responsive.getCurrentBreakpoint());
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Call once to set initial values

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    breakpoint,
    windowWidth,
    isMobile: breakpoint === 'mobile',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop' || breakpoint === 'wide',
    isWide: breakpoint === 'wide',
    isMobileOrTablet: breakpoint === 'mobile' || breakpoint === 'tablet',
    isUpToTablet: windowWidth < 768,
    isUpToDesktop: windowWidth < 1024,
  };
};
