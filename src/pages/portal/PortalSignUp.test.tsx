import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PortalSignUp from './PortalSignUp';
import { LEGAL_PATHS, LEGAL_VERSION } from '../../lib/legal';

/**
 * The agreement notice on the password step.
 *
 * Terms bind a family only if they were plainly shown at the moment of
 * agreeing, so what is pinned here is where the notice sits and what it does:
 * directly before Create account, links that open in a new tab (reading them
 * must not throw away the half-filled form), and the version that register()
 * sends on to the audit log.
 *
 * The router is mocked, as in every other test here: react-router-dom 7 names
 * a `main` file it does not ship, and this Jest cannot read its `exports`.
 */

// A plain recorder rather than jest.fn: CRA's resetMocks wipes a jest.fn's
// implementation before every test, and register must keep resolving true.
const mockRegistered: Array<Record<string, unknown>> = [];

jest.mock('react-router-dom', () => ({
  Navigate: () => null,
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  useNavigate: () => () => {},
  useLocation: () => ({ state: null }),
}), { virtual: true });

jest.mock('../../contexts/PortalAuthContext', () => ({
  usePortalAuth: () => ({
    hasSession: false,
    loading: false,
    register: (input: Record<string, unknown>) => {
      mockRegistered.push(input);
      return Promise.resolve(true);
    },
    resendCode: () => Promise.resolve(),
    verifyCode: () => Promise.resolve({ ok: true }),
  }),
}));

jest.mock('../../lib/clientAuth', () => ({
  CLIENT_MIN_PASSWORD: 6,
  portalCheckEmail: () => Promise.resolve(true),
}));

jest.mock('../../components/portal/PortalLayout', () => ({
  __esModule: true,
  default: (p: any) => <div>{p.children}</div>,
}));

jest.mock('../../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: true, isMobileOrTablet: true }),
}));

/** Through the details step to the password step, where the notice lives. */
const reachPasswordStep = async () => {
  render(<PortalSignUp />);
  fireEvent.change(screen.getByLabelText('Your first name'), { target: { value: 'Rosa' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rosa@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  // Retrying, not waitFor: the step change lands after a promise resolves.
  await screen.findByRole('button', { name: 'Create account' });
};

beforeEach(() => { mockRegistered.length = 0; });

it('shows no agreement on the details step, which creates nothing', () => {
  render(<PortalSignUp />);
  expect(screen.queryByText(/you agree to our/)).toBeNull();
});

it('puts the notice directly before Create account, with both documents opening in a new tab', async () => {
  await reachPasswordStep();

  const terms = screen.getByRole('link', { name: 'Terms of Use' });
  const privacy = screen.getByRole('link', { name: 'Privacy Policy' });
  expect(terms).toHaveAttribute('href', LEGAL_PATHS.terms);
  expect(privacy).toHaveAttribute('href', LEGAL_PATHS.privacy);
  [terms, privacy].forEach(a => {
    expect(a).toHaveAttribute('target', '_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
  });

  const notice = terms.closest('p') as HTMLElement;
  expect(notice).toHaveTextContent('By tapping Create account, you agree to our Terms of Use and acknowledge our Privacy Policy.');
  const button = screen.getByRole('button', { name: 'Create account' });
  expect(notice.nextElementSibling).toBe(button);
});

it('sends the version of the words it showed along with the signup', async () => {
  await reachPasswordStep();
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'dance123' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'dance123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

  // The code step follows a successful register; its arrival means it ran.
  await screen.findByRole('button', { name: 'Verify and log in' });
  expect(mockRegistered).toHaveLength(1);
  expect(mockRegistered[0]).toEqual(expect.objectContaining({
    email: 'rosa@example.com',
    acceptedTermsVersion: LEGAL_VERSION,
  }));
});
