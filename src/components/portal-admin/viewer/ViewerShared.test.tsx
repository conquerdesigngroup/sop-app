import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ViewerRow } from './ViewerShared';

/**
 * ViewerRow is every row of every list in the Portal Viewer, so a mistake in it
 * is a mistake three hundred times over.
 */
describe('ViewerRow', () => {
  it('fires its handler once per tap, not twice', () => {
    // It used to fire twice: onClick was passed to the Card (a plain
    // <div onClick>) AND to the button inside it, so a tap ran the handler and
    // then bubbled. Opening a household is idempotent so nothing looked wrong —
    // which is exactly why this needs a test rather than an eye.
    const onClick = jest.fn();
    render(<ViewerRow label="Open the Kettenbrinks" onClick={onClick}><span>Kettenbrink</span></ViewerRow>);

    fireEvent.click(screen.getByRole('button', { name: 'Open the Kettenbrinks' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('exposes exactly one control, so keyboard users tab through rows once', () => {
    const { container } = render(
      <ViewerRow label="Open the Kettenbrinks" onClick={() => {}}><span>Kettenbrink</span></ViewerRow>
    );
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });

  it('names the row for a screen reader rather than leaving it to the contents', () => {
    render(<ViewerRow label="Open the Kettenbrinks" onClick={() => {}}><span>Kettenbrink</span></ViewerRow>);
    expect(screen.getByLabelText('Open the Kettenbrinks')).toBeInTheDocument();
  });
});
