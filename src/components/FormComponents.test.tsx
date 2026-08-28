import React from 'react';
import { render, screen } from '@testing-library/react';
import { FormInput, FormTextarea } from './FormComponents';

/**
 * The legacy form fields, and the same trap Card had.
 *
 * These take their resting border from `theme.components.input.base` and used
 * to override only `borderColor` while `error` was set. Clearing the error
 * removed that longhand, the untouched `border` shorthand was left alone, and
 * border-color fell back to currentColor — which on these fields is the text
 * colour, chalk. A field went white the moment its validation error cleared.
 *
 * As with Card, jsdom drops any declaration containing var(), so the colours
 * themselves are invisible here. What is visible is the structural fix: with
 * the border locked inside a var()-carrying shorthand, jsdom reads borderWidth
 * as ''; with longhands it reads '2px'. That is the assertion.
 *
 * Run with: npx react-scripts test --testPathPattern FormComponents
 */

describe('FormInput border across the error cycle', () => {
  it('keeps the border intact when an error appears and clears', () => {
    const { rerender } = render(<FormInput value="" onChange={() => {}} />);
    const field = screen.getByRole('textbox') as HTMLInputElement;

    const check = (phase: string) => {
      expect(`${phase}:${field.style.borderWidth}`).toBe(`${phase}:2px`);
      expect(`${phase}:${field.style.borderStyle}`).toBe(`${phase}:solid`);
    };

    check('clean');
    rerender(<FormInput value="" onChange={() => {}} error="Required" />);
    check('erroring');
    // The regression: this is where the field used to turn chalk.
    rerender(<FormInput value="" onChange={() => {}} />);
    check('cleared');
  });

  it('never leaves the border shorthand as the only source of the colour', () => {
    render(<FormTextarea value="" onChange={() => {}} />);
    const field = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(field.style.borderWidth).toBe('2px');
    expect(field.style.borderStyle).toBe('solid');
  });
});
