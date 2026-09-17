import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SubscribeSheet from './SubscribeSheet';

/**
 * The subscribe sheet, now that every link belongs to an account (v56).
 *
 * The link has to be in hand BEFORE a row is tapped: the rows open windows and
 * hand webcal:// to the OS, and doing that after an await is what iOS blocks.
 * So the sheet asks for the account's token as it opens, and three things have
 * to hold while it does — each has a test:
 *
 * 1. Until the token arrives the rows are disabled and a sentence says why. A
 *    tap then does nothing at all, rather than opening a link with no token.
 * 2. A failure says so and offers Try again, instead of buttons that stay dead.
 * 3. Once it arrives, a tap opens the account's own link, synchronously.
 */

const TOKEN = 'fedcba9876543210'.repeat(4);

const mockRpc = jest.fn();
const mockOpen = jest.fn();
const mockCopy = jest.fn();

jest.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

jest.mock('../../lib/calendarTarget', () => ({
  openCalendarUrl: (url: string) => mockOpen(url),
}));

jest.mock('../../utils/calendarExport', () => ({
  copyCalendarLink: (url: string) => mockCopy(url),
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: () => {}, error: () => {} }),
}));

jest.mock('../../contexts/RefreshContext', () => ({
  useRefreshable: () => {},
}));

// The sheet's own chrome — drag handle, portal, focus trap — is not what is
// under test, and drags in hooks this file has no reason to stand up.
jest.mock('./PortalSheet', () => ({
  __esModule: true,
  default: (p: any) => (p.isOpen ? <div role="dialog">{p.children}</div> : null),
}));

const ORIGINAL_URL = process.env.REACT_APP_SUPABASE_URL;

const renderSheet = (isOpen = true) =>
  render(
    <SubscribeSheet isOpen={isOpen} onClose={() => {}} slug="allstars" programName="All-Star Dancers" />,
  );

const googleRow = () => screen.getByRole('button', { name: /Google Calendar/ });

beforeEach(() => {
  process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co';
  mockCopy.mockResolvedValue(true);
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.REACT_APP_SUPABASE_URL;
  else process.env.REACT_APP_SUPABASE_URL = ORIGINAL_URL;
});

it('keeps every row shut, and says why, until the link has arrived', async () => {
  let answer!: (value: unknown) => void;
  mockRpc.mockReturnValue(new Promise(resolve => { answer = resolve; }));

  renderSheet();

  expect(screen.getByRole('status')).toHaveTextContent('Getting your calendar link');
  expect(googleRow()).toBeDisabled();
  fireEvent.click(googleRow());
  expect(mockOpen).not.toHaveBeenCalled();

  await act(async () => { answer({ data: TOKEN, error: null }); });

  expect(googleRow()).not.toBeDisabled();
  expect(screen.queryByText('Getting your calendar link…')).not.toBeInTheDocument();
});

it("opens the account's own link, inside the tap", async () => {
  mockRpc.mockResolvedValue({ data: TOKEN, error: null });
  renderSheet();

  await waitFor(() => expect(googleRow()).not.toBeDisabled());
  fireEvent.click(googleRow());

  expect(mockRpc).toHaveBeenCalledWith('portal_calendar_token');
  expect(mockOpen).toHaveBeenCalledTimes(1);
  const opened = mockOpen.mock.calls[0][0] as string;
  expect(opened).toContain(encodeURIComponent(`/portal-calendar-feed/${TOKEN}/allstars.ics`));
  expect(opened).not.toContain('program%3D');
});

it('copies the same personal link', async () => {
  mockRpc.mockResolvedValue({ data: TOKEN, error: null });
  renderSheet();

  await waitFor(() => expect(screen.getByRole('button', { name: /Copy the link/ })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: /Copy the link/ }));

  await waitFor(() => expect(mockCopy).toHaveBeenCalledWith(
    `https://example.supabase.co/functions/v1/portal-calendar-feed/${TOKEN}/allstars.ics`,
  ));
});

it('says so when the link cannot be fetched, and tries again on request', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
  renderSheet();

  expect(await screen.findByText(/Couldn't get your calendar link/)).toBeInTheDocument();
  expect(googleRow()).toBeDisabled();

  mockRpc.mockResolvedValueOnce({ data: TOKEN, error: null });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

  await waitFor(() => expect(googleRow()).not.toBeDisabled());
  expect(screen.queryByText(/Couldn't get your calendar link/)).not.toBeInTheDocument();
  expect(mockRpc).toHaveBeenCalledTimes(2);
});

it('does not ask for a link while the sheet is closed', () => {
  mockRpc.mockResolvedValue({ data: TOKEN, error: null });
  renderSheet(false);

  expect(mockRpc).not.toHaveBeenCalled();
});

it('tells the parent the link is theirs', async () => {
  mockRpc.mockResolvedValue({ data: TOKEN, error: null });
  renderSheet();

  expect(await screen.findByText(/personal to your account/)).toBeInTheDocument();
});
