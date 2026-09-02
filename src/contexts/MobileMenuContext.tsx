import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Whether the mobile menu sheet is open.
 *
 * The sheet is rendered by Navigation, but two other things need to drive it:
 * the "More" tab on BottomNavigation opens it, and the quick-add button hides
 * itself while it is up. Neither is a child of Navigation, so the flag lives
 * here rather than in Navigation's own state.
 */
interface MobileMenuContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const MobileMenuContext = createContext<MobileMenuContextType | undefined>(undefined);

export const MobileMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(v => !v), []);
  const value = useMemo(() => ({ isOpen, open, close, toggle }), [isOpen, open, close, toggle]);
  return <MobileMenuContext.Provider value={value}>{children}</MobileMenuContext.Provider>;
};

export const useMobileMenu = (): MobileMenuContextType => {
  const context = useContext(MobileMenuContext);
  if (!context) {
    throw new Error('useMobileMenu must be used within a MobileMenuProvider');
  }
  return context;
};
