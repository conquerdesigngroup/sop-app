import React, { useState, useRef, useCallback, useEffect } from 'react';
import { theme } from '../theme';
import { useThemeColors } from '../contexts/ThemeContext';

interface SwipeAction {
  icon: React.ReactNode;
  color: string;
  label: string;
  onAction: () => void;
}

interface SwipeableListItemProps {
  children: React.ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  disabled?: boolean;
  threshold?: number;
}

export const SwipeableListItem: React.FC<SwipeableListItemProps> = ({
  children,
  leftAction,
  rightAction,
  onSwipeLeft,
  onSwipeRight,
  disabled = false,
  threshold = 80,
}) => {
  const colors = useThemeColors();
  const containerRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const startY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = e.touches[0].clientX;
    isHorizontalSwipe.current = null;
    setIsDragging(true);
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || disabled) return;

    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = touchX - startX.current;
    const diffY = touchY - startY.current;

    // Determine if this is a horizontal or vertical swipe on first significant movement
    if (isHorizontalSwipe.current === null && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
      isHorizontalSwipe.current = Math.abs(diffX) > Math.abs(diffY);
    }

    // Only handle horizontal swipes
    if (isHorizontalSwipe.current !== true) return;

    currentX.current = touchX;

    // Calculate new position with resistance
    let newTranslate = diffX;

    // Apply resistance and limits based on available actions
    if (newTranslate > 0 && leftAction) {
      // Swiping right (revealing left action)
      newTranslate = Math.min(newTranslate * 0.5, threshold * 1.2);
    } else if (newTranslate < 0 && rightAction) {
      // Swiping left (revealing right action)
      newTranslate = Math.max(newTranslate * 0.5, -threshold * 1.2);
    } else {
      // No action available in this direction
      newTranslate = 0;
    }

    setTranslateX(newTranslate);

    // Prevent page scroll when swiping horizontally
    if (Math.abs(diffX) > 10) {
      e.preventDefault();
    }
  }, [isDragging, disabled, leftAction, rightAction, threshold]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    isHorizontalSwipe.current = null;

    // Check if threshold was crossed
    if (translateX > threshold && leftAction) {
      // Trigger left action (swipe right)
      leftAction.onAction();
      onSwipeRight?.();
    } else if (translateX < -threshold && rightAction) {
      // Trigger right action (swipe left)
      rightAction.onAction();
      onSwipeLeft?.();
    }

    // Animate back to center
    setTranslateX(0);
  }, [isDragging, translateX, threshold, leftAction, rightAction, onSwipeLeft, onSwipeRight]);

  // Calculate action reveal percentage
  const leftProgress = Math.min(1, Math.max(0, translateX / threshold));
  const rightProgress = Math.min(1, Math.max(0, -translateX / threshold));

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: theme.borderRadius.md,
        touchAction: 'pan-y',
      }}
    >
      {/* Left action background (shown when swiping right) */}
      {leftAction && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: Math.max(translateX, 0),
            backgroundColor: leftAction.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingLeft: '20px',
            opacity: leftProgress,
            transition: isDragging ? 'none' : 'all 0.3s ease-out',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              color: '#FFFFFF',
              transform: `scale(${0.5 + leftProgress * 0.5})`,
              transition: isDragging ? 'none' : 'transform 0.3s ease-out',
            }}
          >
            {leftAction.icon}
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{leftAction.label}</span>
          </div>
        </div>
      )}

      {/* Right action background (shown when swiping left) */}
      {rightAction && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: Math.max(-translateX, 0),
            backgroundColor: rightAction.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: '20px',
            opacity: rightProgress,
            transition: isDragging ? 'none' : 'all 0.3s ease-out',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              color: '#FFFFFF',
              transform: `scale(${0.5 + rightProgress * 0.5})`,
              transition: isDragging ? 'none' : 'transform 0.3s ease-out',
            }}
          >
            {rightAction.icon}
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{rightAction.label}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease-out',
          backgroundColor: colors.bg.secondary,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
};

// Preset action icons
export const SwipeIcons = {
  complete: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  delete: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  edit: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  archive: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8v13H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </svg>
  ),
  undo: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  ),
};

// Helper function to create common swipe actions
export const createSwipeAction = {
  complete: (onAction: () => void): SwipeAction => ({
    icon: SwipeIcons.complete,
    color: theme.colors.status.success,
    label: 'Complete',
    onAction,
  }),
  delete: (onAction: () => void): SwipeAction => ({
    icon: SwipeIcons.delete,
    color: theme.colors.status.error,
    label: 'Delete',
    onAction,
  }),
  edit: (onAction: () => void): SwipeAction => ({
    icon: SwipeIcons.edit,
    color: theme.colors.status.info,
    label: 'Edit',
    onAction,
  }),
  archive: (onAction: () => void): SwipeAction => ({
    icon: SwipeIcons.archive,
    color: theme.colors.status.warning,
    label: 'Archive',
    onAction,
  }),
  undo: (onAction: () => void): SwipeAction => ({
    icon: SwipeIcons.undo,
    color: theme.colors.status.info,
    label: 'Undo',
    onAction,
  }),
};

export default SwipeableListItem;
