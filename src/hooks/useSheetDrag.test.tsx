import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useSheetDrag } from './useSheetDrag';

/**
 * The gesture is the whole feature, so these drive it through a real element
 * rather than poking the hook: pointer capture, `touch-action` and the
 * transform all live on DOM nodes.
 *
 * jsdom gives every element an offsetHeight of 0, which is exactly the case
 * the `||` fallback in dismiss() exists for — so the slide-out here parks at
 * window.innerHeight (768) instead.
 */
const Harness: React.FC<{
  onDismiss: () => void;
  reducedMotion?: boolean;
  isOpen?: boolean;
}> = ({ onDismiss, reducedMotion = false, isOpen = true }) => {
  const drag = useSheetDrag({ isOpen, onDismiss, reducedMotion });
  return (
    <div data-testid="sheet" ref={drag.sheetRef} style={drag.sheetStyle}>
      <div data-testid="handle" {...drag.handleProps} style={drag.handleProps.style} />
    </div>
  );
};

const handle = () => screen.getByTestId('handle');
const sheet = () => screen.getByTestId('sheet');

/**
 * jsdom has no PointerEvent, and fireEvent.pointerDown then falls back to a
 * bare Event that drops clientY on the floor — every drag reads as NaN and
 * every assertion about the transform passes for the wrong reason. A
 * MouseEvent named `pointerdown` carries the coordinates and still routes to
 * React's onPointerDown; pointerId and pointerType go on as expandos, which is
 * where the synthetic event reads them from anyway.
 */
const pointer = (
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  init: { clientY?: number; button?: number; pointerType?: string } = {}
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY: init.clientY ?? 0,
    button: init.button ?? 0,
  }) as MouseEvent & { pointerId: number; pointerType: string };
  event.pointerId = 1;
  event.pointerType = init.pointerType ?? 'touch';
  fireEvent(handle(), event);
};

const down = (clientY: number) => pointer('pointerdown', { clientY });
const move = (clientY: number) => pointer('pointermove', { clientY });
const up = (clientY: number) => pointer('pointerup', { clientY });

/** Real elapsed time, so the hook's velocity has something to measure. */
const pause = (ms: number) => act(() => new Promise(r => { setTimeout(r, ms); }));

// A test that fails before its own cleanup would otherwise leave fake timers
// armed for the next one, where an await on a real setTimeout never resolves.
afterEach(() => { jest.useRealTimers(); });

describe('useSheetDrag', () => {
  it('follows the finger down and drops the transition while it is down', () => {
    render(<Harness onDismiss={jest.fn()} />);

    down(100);
    move(160);

    expect(sheet()).toHaveStyle({ transform: 'translateY(60px)' });
    expect(sheet().style.transition).toBe('none');
  });

  it('holds at rest when dragged up — a bottom sheet has no room above it', () => {
    render(<Harness onDismiss={jest.fn()} />);

    down(300);
    move(220);

    expect(sheet().style.transform).toBe('');
  });

  it('springs back and stays open when the drag falls short', () => {
    const onDismiss = jest.fn();
    render(<Harness onDismiss={onDismiss} />);

    down(100);
    move(150);   // 50px, under the 96px threshold
    up(150);

    expect(onDismiss).not.toHaveBeenCalled();
    expect(sheet().style.transform).toBe('');
    expect(sheet().style.transition).not.toBe('none');
  });

  it('dismisses on a long drag, carrying the motion before it closes', () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    render(<Harness onDismiss={onDismiss} />);

    down(100);
    move(220);   // 120px, past the threshold
    up(220);

    // Still open, still moving — the sheet does not blink out mid-throw.
    expect(onDismiss).not.toHaveBeenCalled();
    expect(sheet()).toHaveStyle({ transform: 'translateY(768px)' });

    act(() => { jest.advanceTimersByTime(180); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses on a short fast flick that would otherwise spring back', async () => {
    const onDismiss = jest.fn();
    render(<Harness onDismiss={onDismiss} />);

    down(100);
    move(110);
    await pause(20);
    move(150);   // 40px in ~20ms = 2 px/ms. Only 50px of travel in total.
    up(150);

    expect(onDismiss).not.toHaveBeenCalled();          // the slide-out runs first
    expect(sheet()).toHaveStyle({ transform: 'translateY(768px)' });
  });

  it('treats a slow 50px drag as a scroll that changed its mind, not a flick', async () => {
    const onDismiss = jest.fn();
    render(<Harness onDismiss={onDismiss} />);

    down(100);
    move(120);
    await pause(200);
    move(150);   // same distance, a tenth of the speed
    up(150);

    expect(onDismiss).not.toHaveBeenCalled();
    expect(sheet().style.transform).toBe('');
  });

  it('closes immediately under reduced motion rather than animating to nowhere', () => {
    const onDismiss = jest.fn();
    render(<Harness onDismiss={onDismiss} reducedMotion />);

    down(100);
    move(220);
    up(220);

    // index.css collapses the transition to 0.01ms, so a timed slide-out would
    // leave the sheet sitting there already gone.
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(sheet().style.transform).toBe('');
  });

  it('reopens at rest after a drag closed it', () => {
    const { rerender } = render(<Harness onDismiss={jest.fn()} reducedMotion />);

    down(100);
    move(220);
    up(220);

    rerender(<Harness onDismiss={jest.fn()} reducedMotion isOpen={false} />);
    rerender(<Harness onDismiss={jest.fn()} reducedMotion isOpen />);

    // The hook outlives the sheet; without the reset it would come back parked
    // off the bottom of the screen.
    expect(sheet().style.transform).toBe('');
  });

  it('lets go when the gesture is cancelled out from under it', () => {
    const onDismiss = jest.fn();
    render(<Harness onDismiss={onDismiss} />);

    down(100);
    move(220);
    pointer('pointercancel');

    expect(onDismiss).not.toHaveBeenCalled();
    expect(sheet().style.transform).toBe('');
  });

  it('claims the touch so the page underneath cannot scroll with it', () => {
    render(<Harness onDismiss={jest.fn()} />);
    // The property, not toHaveStyle: jsdom's cssstyle drops touch-action when
    // it serialises the attribute, so the matcher reads it as unset.
    expect(handle().style.touchAction).toBe('none');
  });

  it('ignores a right-click drag', () => {
    const onDismiss = jest.fn();
    render(<Harness onDismiss={onDismiss} />);

    pointer('pointerdown', { clientY: 100, pointerType: 'mouse', button: 2 });
    move(220);
    up(220);

    expect(onDismiss).not.toHaveBeenCalled();
    expect(sheet().style.transform).toBe('');
  });
});
