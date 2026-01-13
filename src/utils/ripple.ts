// Utility function to create a ripple effect on any button click
export const createRippleEffect = (event: React.MouseEvent<HTMLElement>) => {
  const button = event.currentTarget;
  const rect = button.getBoundingClientRect();

  // Ensure the button has the necessary styles
  const computedStyle = window.getComputedStyle(button);
  if (computedStyle.position === 'static') {
    button.style.position = 'relative';
  }
  if (computedStyle.overflow !== 'hidden') {
    button.style.overflow = 'hidden';
  }

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
    background: rgba(255, 255, 255, 0.35);
    border-radius: 50%;
    transform: scale(0);
    animation: ripple-effect 0.6s ease-out;
    pointer-events: none;
    z-index: 1;
  `;

  button.appendChild(ripple);

  setTimeout(() => {
    ripple.remove();
  }, 600);
};

// Higher-order function to wrap any onClick handler with ripple effect
export const withRipple = <T extends HTMLElement>(
  onClick?: (event: React.MouseEvent<T>) => void
) => {
  return (event: React.MouseEvent<T>) => {
    createRippleEffect(event as React.MouseEvent<HTMLElement>);
    onClick?.(event);
  };
};

export default createRippleEffect;
