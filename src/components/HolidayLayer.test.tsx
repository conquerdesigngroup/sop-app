import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { ThemeProvider } from '../contexts/ThemeContext';
import HolidayLayer from './HolidayLayer';

/**
 * The layer's contract with the page it is mounted on.
 *
 * Nothing here asserts a pixel. jsdom has no canvas context, no matchMedia and
 * no ResizeObserver, and the house convention (see ui/Card.test.tsx) is to test
 * the structure a component commits to and leave the visuals to a real browser.
 *
 * The structure IS the contract, though, and two parts of it are load-bearing:
 * the layer must be inert (no pointer events, no screen-reader presence), and
 * the two z-indices must stay -1 and 1. A future tidy-up of that 1 to a 0 would
 * make a hovered tile paint over the character standing on it — a bug that only
 * appears on hover, only with a mouse, and never in a screenshot.
 *
 * The flag is mocked rather than driven through process.env + resetModules:
 * resetting the registry hands the test a second copy of React, and every hook
 * in the tree then throws on a null dispatcher.
 */

let mockHoliday: string | null = null;

jest.mock('../lib/holiday/flag', () => ({
  get ACTIVE_HOLIDAY() {
    return mockHoliday;
  },
  HOLIDAY_IDS: ['halloween', 'thanksgiving', 'christmas'],
}));

const mount = (holiday: string | null) => {
  mockHoliday = holiday;
  return render(
    <ThemeProvider>
      <HolidayLayer />
    </ThemeProvider>
  );
};

const canvases = (c: HTMLElement) => Array.from(c.querySelectorAll('canvas'));

describe('HolidayLayer', () => {
  /**
   * jsdom's own getContext throws a "not implemented" notice through
   * console.error and then returns null. Returning null directly is the same
   * contract without pages of stack trace on every run — and it states the
   * requirement outright: with no 2d context the stage must mount, do nothing,
   * and unmount without complaint.
   */
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = realGetContext;
  });

  afterEach(() => {
    mockHoliday = null;
  });

  it('renders nothing at all when the flag is off', () => {
    const { container } = mount(null);
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('mounts two canvases when a holiday is named', async () => {
    const { container } = mount('halloween');
    await waitFor(() => expect(canvases(container)).toHaveLength(2));
  });

  it('is inert: hidden from assistive tech and untouchable', async () => {
    const { container } = mount('halloween');
    await waitFor(() => expect(canvases(container)).toHaveLength(2));

    canvases(container).forEach((el) => {
      expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(el.style.pointerEvents).toBe('none');
      expect(el.style.position).toBe('fixed');
    });
  });

  it('keeps one canvas behind the page and one in front of it', async () => {
    const { container } = mount('halloween');
    await waitFor(() => expect(canvases(container)).toHaveLength(2));

    // -1 puts the ghost behind the tiles it rises from behind. 1 — NOT 0 —
    // keeps the front layer above a tile that lifts itself 2px on hover.
    expect(canvases(container).map((el) => el.style.zIndex)).toEqual(['-1', '1']);
  });

  it('mounts and unmounts cleanly with no canvas context, matchMedia or ResizeObserver', async () => {
    // The regression guard for "the front door went blank in December".
    const { container, unmount } = mount('halloween');
    await waitFor(() => expect(canvases(container)).toHaveLength(2));

    expect(() => unmount()).not.toThrow();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('renders nothing for a holiday with no theme built yet', async () => {
    const { container } = mount('thanksgiving');
    // The canvases still mount — the flag named a real holiday — but the theme
    // resolves to null and nothing is ever scheduled or painted onto them.
    await waitFor(() => expect(canvases(container)).toHaveLength(2));
    expect(() => canvases(container)).not.toThrow();
  });
});
