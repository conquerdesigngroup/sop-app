import React, { useState, useRef, useCallback, useEffect } from 'react';
import { theme } from '../theme';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
  pullThreshold?: number;
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  disabled = false,
  pullThreshold = 80,
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing) return;

    const container = containerRef.current;
    if (!container) return;

    // Only start pull if at top of scroll
    if (container.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling || disabled || isRefreshing) return;

    currentY.current = e.touches[0].clientY;
    const distance = Math.max(0, currentY.current - startY.current);

    // Apply resistance - pull gets harder as you go
    const resistedDistance = Math.min(pullThreshold * 1.5, distance * 0.5);
    setPullDistance(resistedDistance);

    // Prevent default scroll when pulling
    if (distance > 0) {
      e.preventDefault();
    }
  }, [isPulling, disabled, isRefreshing, pullThreshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || disabled) return;

    setIsPulling(false);

    if (pullDistance >= pullThreshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(pullThreshold * 0.6); // Hold at indicator position

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isPulling, disabled, pullDistance, pullThreshold, isRefreshing, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const pullProgress = Math.min(1, pullDistance / pullThreshold);
  const shouldTrigger = pullProgress >= 1;

  return (
    <div
      ref={containerRef}
      style={styles.container}
    >
      {/* Pull indicator */}
      <div
        style={{
          ...styles.indicatorWrapper,
          height: pullDistance,
          opacity: pullProgress,
        }}
      >
        <div
          style={{
            ...styles.indicator,
            transform: isRefreshing
              ? 'rotate(0deg)'
              : `rotate(${pullProgress * 180}deg)`,
          }}
        >
          {isRefreshing ? (
            <svg
              className="pull-refresh-spinner"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.colors.primary}
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke={shouldTrigger ? theme.colors.primary : theme.colors.txt.tertiary}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          )}
        </div>
        <span
          style={{
            ...styles.indicatorText,
            color: shouldTrigger ? theme.colors.primary : theme.colors.txt.tertiary,
          }}
        >
          {isRefreshing ? 'Refreshing...' : shouldTrigger ? 'Release to refresh' : 'Pull to refresh'}
        </span>
      </div>

      {/* Content with transform */}
      <div
        style={{
          ...styles.content,
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: 'relative',
    overflow: 'auto',
    height: '100%',
    WebkitOverflowScrolling: 'touch',
  },
  indicatorWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    overflow: 'hidden',
    zIndex: 10,
  },
  indicator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.1s ease-out',
  },
  indicatorText: {
    fontSize: '12px',
    fontWeight: 500,
    transition: 'color 0.2s ease',
  },
  content: {
    minHeight: '100%',
  },
};

export default PullToRefresh;
