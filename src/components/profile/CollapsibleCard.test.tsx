import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CollapsibleCard from './CollapsibleCard';

/**
 * A collapsible card that forgets is not a collapsible card.
 *
 * The dashboard ships two of these shut by default — Attendance and Add to
 * your calendar — which is only defensible if opening one sticks. A parent who
 * opens Attendance, checks it, comes back tomorrow and finds it shut again has
 * been given a toy, and will stop using it.
 *
 * The rest is the disclosure contract: a real button, aria-expanded either
 * way, and aria-controls only while there is something for it to point at.
 */

const setup = (props: Partial<React.ComponentProps<typeof CollapsibleCard>> = {}) =>
  render(
    <CollapsibleCard id="attendance" title="Attendance" {...props}>
      <p>the body</p>
    </CollapsibleCard>,
  );

const header = () => screen.getByRole('button', { name: /attendance/i });

beforeEach(() => window.localStorage.clear());

test('starts shut, and the body is not rendered at all', () => {
  setup();
  expect(header()).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('the body')).not.toBeInTheDocument();
});

test('opens on click and puts the body on the page', () => {
  setup();
  fireEvent.click(header());
  expect(header()).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('the body')).toBeInTheDocument();
});

test('remembers being opened, so tomorrow it is still open', async () => {
  const first = setup();
  fireEvent.click(header());
  first.unmount();

  // A fresh mount, as if the parent came back the next day.
  setup();
  await waitFor(() => expect(header()).toHaveAttribute('aria-expanded', 'true'));
  expect(screen.getByText('the body')).toBeInTheDocument();
});

test('remembers being closed, and does not fall back to the default', async () => {
  const first = setup({ defaultOpen: true });
  fireEvent.click(header());
  first.unmount();

  setup({ defaultOpen: true });
  await waitFor(() => expect(header()).toHaveAttribute('aria-expanded', 'false'));
});

test('keeps one card’s choice out of another’s', async () => {
  const first = setup({ id: 'attendance' });
  fireEvent.click(header());
  first.unmount();

  render(
    <CollapsibleCard id="calendar" title="Add to your calendar">
      <p>calendar body</p>
    </CollapsibleCard>,
  );
  const other = screen.getByRole('button', { name: /add to your calendar/i });
  await waitFor(() => expect(other).toHaveAttribute('aria-expanded', 'false'));
});

test('never points aria-controls at an element that is not there', () => {
  setup();
  // Shut: the region is unmounted, so there must be nothing to resolve.
  expect(header()).not.toHaveAttribute('aria-controls');

  fireEvent.click(header());
  const id = header().getAttribute('aria-controls');
  expect(id).toBeTruthy();
  expect(document.getElementById(id!)).toBeInTheDocument();
});

test('shows section controls only while open', () => {
  setup({ headerRight: <span>period picker</span> });
  expect(screen.queryByText('period picker')).not.toBeInTheDocument();

  fireEvent.click(header());
  expect(screen.getByText('period picker')).toBeInTheDocument();
});

test('survives a browser that refuses localStorage', () => {
  const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('site data blocked');
  });
  const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('site data blocked');
  });

  // A private window throws on the access itself, not merely on the value.
  // The card must still open and close; only the remembering is lost.
  expect(() => setup()).not.toThrow();
  fireEvent.click(header());
  expect(header()).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('the body')).toBeInTheDocument();

  getItem.mockRestore();
  setItem.mockRestore();
});
