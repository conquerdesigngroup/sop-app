import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotificationsCard from './NotificationsCard';
import { DEFAULT_PORTAL_PREFS } from '../../lib/portalNotifications';
import { ProfileContext } from '../../lib/profileCards';

/**
 * The states a parent can actually land in, and the tap that must not fire
 * twice.
 *
 * THE IPHONE CASE IS THE DEFAULT CASE
 *
 * Web Push does not reach iPhone Safari unless the site is on the Home Screen,
 * and most of these families are on iPhones. A card that rendered a switch
 * there would render a switch that cannot work, with nothing said about why —
 * so 'needs-install' asserts the guide is offered and the switch is NOT.
 * Same for 'blocked', which no amount of tapping inside the app can fix.
 *
 * THE SECOND TAP
 *
 * Turning notifications on is a permission prompt, a function call and two
 * round trips. `disabled` only lands on the next render, so a second tap can
 * arrive first — which is a second permission prompt and a duplicate
 * subscription. The busy ref is what stops it and the test below is what pins
 * it (same rule as DocumentList's download button).
 */

const mockPushSupport = jest.fn();
const mockHasSubscription = jest.fn();
const mockEnablePush = jest.fn();
const mockDisablePush = jest.fn();
const mockRead = jest.fn();
const mockWrite = jest.fn();

jest.mock('../../lib/push', () => ({
  pushSupport: () => mockPushSupport(),
  hasPushSubscription: () => mockHasSubscription(),
  enablePush: (...a: unknown[]) => mockEnablePush(...a),
  disablePush: (...a: unknown[]) => mockDisablePush(...a),
}));

jest.mock('../../lib/portalNotifications', () => ({
  ...jest.requireActual('../../lib/portalNotifications'),
  readPortalPrefs: (...a: unknown[]) => mockRead(...a),
  writePortalPrefs: (...a: unknown[]) => mockWrite(...a),
}));

jest.mock('../../contexts/PortalAuthContext', () => ({
  usePortalAuth: () => ({ profile: { id: 'user-1' } }),
}));

jest.mock('../../contexts/RefreshContext', () => ({
  useRefreshable: () => undefined,
}));

// Pulls in Modal and the whole install flow; the card's job is only to offer it.
jest.mock('../InstallAppGuide', () => () => <div data-testid="install-guide" />);

const ctx: ProfileContext = {
  memberType: 'guardian',
  isStaff: false,
  source: { source: 'live' },
  flags: { unlockables: false },
};

const renderCard = () =>
  render(<NotificationsCard ctx={ctx} firstName="Rosa" lastName="Alvarez" email="r@example.com" />);

const master = () => screen.getByRole('switch', { name: /notifications on this device/i });

beforeEach(() => {
  jest.clearAllMocks();
  mockPushSupport.mockReturnValue('ok');
  mockHasSubscription.mockResolvedValue(true);
  mockRead.mockResolvedValue({ prefs: { ...DEFAULT_PORTAL_PREFS }, error: null });
  mockWrite.mockResolvedValue({ error: null });
  mockEnablePush.mockResolvedValue(undefined);
  mockDisablePush.mockResolvedValue(undefined);
});

describe('the states that are not a switch', () => {
  it('offers the install guide on an iPhone that is not on the home screen', async () => {
    mockPushSupport.mockReturnValue('needs-install');
    renderCard();

    expect(await screen.findByTestId('install-guide')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('explains a blocked permission instead of offering a dead switch', async () => {
    mockPushSupport.mockReturnValue('blocked');
    renderCard();

    expect(await screen.findByText(/blocked for this site/i)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('says so when the browser cannot do push at all', async () => {
    mockPushSupport.mockReturnValue('unsupported');
    renderCard();

    expect(await screen.findByText(/cannot receive notifications/i)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('shows a retry rather than a broken switch when preferences will not load', async () => {
    mockRead.mockResolvedValue({ prefs: DEFAULT_PORTAL_PREFS, error: 'Could not load your notification settings.' });
    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

describe('the switch', () => {
  it('is on, with the categories, when this device is subscribed', async () => {
    renderCard();

    await waitFor(() => expect(master()).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('switch', { name: /just for your family/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /studio announcements/i })).toBeInTheDocument();
  });

  it('hides the categories while the device is unsubscribed', async () => {
    mockHasSubscription.mockResolvedValue(false);
    renderCard();

    await waitFor(() => expect(master()).toHaveAttribute('aria-checked', 'false'));
    expect(screen.queryByRole('switch', { name: /just for your family/i })).not.toBeInTheDocument();
  });

  it('starts nothing on a second tap', async () => {
    mockHasSubscription.mockResolvedValue(false);
    // Held open so both taps land inside the same busy window.
    mockEnablePush.mockImplementation(() => new Promise(() => {}));
    renderCard();

    await waitFor(() => expect(master()).toHaveAttribute('aria-checked', 'false'));
    fireEvent.click(master());
    fireEvent.click(master());

    expect(mockEnablePush).toHaveBeenCalledTimes(1);
  });

  it('says what happened in words, not only by moving the dot', async () => {
    mockHasSubscription.mockResolvedValue(false);
    renderCard();

    await waitFor(() => expect(master()).toHaveAttribute('aria-checked', 'false'));
    fireEvent.click(master());

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/on for this device/i));
  });

  it('reports a failure instead of leaving the switch looking successful', async () => {
    mockHasSubscription.mockResolvedValue(false);
    mockEnablePush.mockRejectedValue(new Error('Notifications were not allowed.'));
    renderCard();

    await waitFor(() => expect(master()).toHaveAttribute('aria-checked', 'false'));
    fireEvent.click(master());

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/were not allowed/i));
    await waitFor(() => expect(master()).toHaveAttribute('aria-checked', 'false'));
  });
});

describe('the category switches', () => {
  it('writes only the key that changed', async () => {
    renderCard();

    const files = await screen.findByRole('switch', { name: /new photos and files/i });
    expect(files).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(files);

    await waitFor(() => expect(mockWrite).toHaveBeenCalledWith('user-1', { newFiles: true }));
  });

  it('puts the switch back when the write fails', async () => {
    mockWrite.mockResolvedValue({ error: 'Could not save that. Check your connection and try again.' });
    renderCard();

    const notes = await screen.findByRole('switch', { name: /just for your family/i });
    expect(notes).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(notes);

    // Optimistic while in flight, then restored — the parent must not be left
    // believing they turned something off that is still on.
    await waitFor(() => expect(notes).toHaveAttribute('aria-checked', 'true'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/could not save/i));
  });
});
