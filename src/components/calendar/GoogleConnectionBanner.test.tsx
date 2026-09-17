import React from 'react';
import { act, render, screen } from '@testing-library/react';
import GoogleConnectionBanner from './GoogleConnectionBanner';

/**
 * A warning keeps checking itself; a healthy connection is left alone.
 *
 * On 2026-09-17 the owner reconnected Google because this banner said the
 * connection was revoked, while every sync that morning had succeeded. The
 * server now clears a stale record on the next good sync — but the banner only
 * read the status once, on opening, so a stale warning would still have sat on
 * screen until a reload. Both halves are pinned: a showing warning re-reads
 * every minute, and a healthy one never polls.
 */

const mockRefresh = jest.fn();
const mockState: { connection: any } = { connection: { state: 'loading' } };

jest.mock('../../contexts/EventContext', () => ({
  useEvent: () => ({
    googleConnection: mockState.connection,
    refreshGoogleStatus: mockRefresh,
    beginGoogleConnect: () => Promise.resolve('https://accounts.google.com/'),
  }),
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ error: () => {} }),
}));

const ready = (status: Record<string, unknown>) => ({
  state: 'ready',
  status: { connected: true, email: 'info@didancecenter.com', lastError: null, ...status },
});

beforeEach(() => {
  jest.useFakeTimers();
  mockRefresh.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

it('re-checks every minute while it is telling someone to reconnect', () => {
  mockState.connection = ready({ lastError: 'invalid_grant' });
  render(<GoogleConnectionBanner />);

  expect(screen.getByText('Google needs reconnecting')).toBeInTheDocument();
  expect(mockRefresh).toHaveBeenCalledTimes(1);

  act(() => { jest.advanceTimersByTime(60 * 1000); });
  expect(mockRefresh).toHaveBeenCalledTimes(2);

  act(() => { jest.advanceTimersByTime(60 * 1000); });
  expect(mockRefresh).toHaveBeenCalledTimes(3);
});

it('keeps checking when it could not check at all', () => {
  mockState.connection = { state: 'failed', message: 'Network error.' };
  render(<GoogleConnectionBanner />);

  act(() => { jest.advanceTimersByTime(60 * 1000); });
  expect(mockRefresh).toHaveBeenCalledTimes(2);
});

it('does not poll a healthy connection', () => {
  mockState.connection = ready({});
  render(<GoogleConnectionBanner />);

  expect(screen.getByText(/Writing to Google as info@didancecenter.com/)).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(5 * 60 * 1000); });
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it('says a revoked connection stops the calendars updating, not only saving', () => {
  // The old sentence said reading was unaffected. Since v21 the sync reads
  // through the same connection, so a revoked one stops both.
  mockState.connection = ready({ lastError: 'invalid_grant' });
  render(<GoogleConnectionBanner />);

  expect(screen.getByText(/calendars stop updating/)).toBeInTheDocument();
});
