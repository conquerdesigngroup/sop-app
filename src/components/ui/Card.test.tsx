import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card } from './index';

/**
 * The hover cycle, which is the only way this bug ever showed itself.
 *
 * A card that has never been hovered looked correct, so a static render proved
 * nothing. The white ring appeared on mouse-OUT: the component set the `border`
 * shorthand and added `borderColor` only while hovered, so React removed that
 * longhand on the way out and left the unchanged shorthand alone. Clearing
 * border-color does not restore the shorthand's colour — it falls back to the
 * CSS initial value, `currentColor`, which on these cards is chalk.
 *
 * WHAT THESE CAN AND CANNOT SEE
 *
 * Not the colour. The theme tokens are `var(--c-bdr-primary, #26262B)` and
 * jsdom's CSSOM drops any declaration containing var() — it reads back as ''
 * for the fixed code and the broken code alike, so asserting on it would pass
 * either way. The colour behaviour was measured in a real browser instead.
 *
 * What they CAN see is the structural fix, and it is enough: a shorthand
 * carrying a var() is dropped whole, taking borderWidth and borderStyle with
 * it, so those read '' under the old code and '2px'/'solid' under the new one.
 * Pinning them pins "this component sets longhands", which is the actual fix.
 *
 * Run with: npx react-scripts test --testPathPattern Card
 */

const cardEl = () => screen.getByTestId('card-child').parentElement as HTMLElement;

const renderHoverCard = () =>
  render(
    <Card hover onClick={() => {}}>
      <span data-testid="card-child">Fall Session Begins</span>
    </Card>
  );

describe('Card hover', () => {
  it('keeps the border intact across the whole hover cycle', () => {
    renderHoverCard();
    const el = cardEl();

    // '' here means the declaration was dropped — which is what happened when
    // the width and style were locked inside a shorthand carrying a var().
    const check = (phase: string) => {
      expect(`${phase}:${el.style.borderWidth}`).toBe(`${phase}:2px`);
      expect(`${phase}:${el.style.borderStyle}`).toBe(`${phase}:solid`);
    };

    check('rest');
    fireEvent.mouseEnter(el);
    check('hovered');
    fireEvent.mouseLeave(el);
    check('left');
  });

  it('keeps transform present in both states rather than removing it', () => {
    // The same class of trap: a property that exists in one state and vanishes
    // in the other is written as '' on the way out.
    renderHoverCard();
    const el = cardEl();

    expect(el.style.transform).toBe('none');
    fireEvent.mouseEnter(el);
    expect(el.style.transform).toBe('translateY(-2px)');
    fireEvent.mouseLeave(el);
    expect(el.style.transform).toBe('none');
  });

  it('does not move a card that was not asked to hover', () => {
    render(
      <Card>
        <span data-testid="card-child">Static</span>
      </Card>
    );
    const el = cardEl();

    fireEvent.mouseEnter(el);
    expect(el.style.transform).toBe('none');
    expect(el.style.borderWidth).toBe('2px');
  });
});

/**
 * The CSS mechanism itself, with literal colours so jsdom can actually see it.
 *
 * This is the six lines the bug reduces to. It is here because the React tests
 * above cannot show the colour, and without this the reason for the fix is
 * only a comment.
 */
describe('the shorthand/longhand trap', () => {
  it('loses the shorthand colour when the longhand is cleared', () => {
    const el = document.createElement('div');
    el.style.border = '2px solid rgb(38, 38, 43)';
    expect(el.style.borderColor).toBe('rgb(38, 38, 43)');

    el.style.borderColor = 'rgb(54, 54, 61)';   // React, on mouse-enter
    expect(el.style.borderColor).toBe('rgb(54, 54, 61)');

    el.style.borderColor = '';                   // React, on mouse-leave
    // Not back to rgb(38,38,43) — the declaration is simply gone, and a border
    // with no colour paints in currentColor.
    expect(el.style.borderColor).toBe('');
  });

  it('survives the same cycle when the resting colour is a longhand', () => {
    const el = document.createElement('div');
    el.style.borderWidth = '2px';
    el.style.borderStyle = 'solid';
    el.style.borderColor = 'rgb(38, 38, 43)';

    el.style.borderColor = 'rgb(54, 54, 61)';
    el.style.borderColor = 'rgb(38, 38, 43)';    // written, not removed
    expect(el.style.borderColor).toBe('rgb(38, 38, 43)');
  });
});
