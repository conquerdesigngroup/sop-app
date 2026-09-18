import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PortalSignUp from './PortalSignUp';

/**
 * A refused password on the password step.
 *
 * The code step promises "a code is on its way". When portal-signup refuses the
 * password itself, that promise is false, so the page has to stay where the
 * parent can change the password and say why.
 *
 * The router is mocked, as in every other test here: react-router-dom 7 names
 * a `main` file it does not ship, and this Jest cannot read its `exports`.
 */

const BREACHED = 'That password has appeared in a data breach. Please choose a different one.';

// A plain function rather than jest.fn: CRA's resetMocks wipes a jest.fn's
// implementation before every test.
let mockRegisterResult: { ok: boolean; error?: string } = { ok: true };

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
    register: () => Promise.resolve(mockRegisterResult),
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

const createAccount = async (password: string) => {
  render(<PortalSignUp />);
  fireEvent.change(screen.getByLabelText('Your first name'), { target: { value: 'Rosa' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rosa@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  // Retrying, not waitFor: the step change lands after a promise resolves.
  await screen.findByRole('button', { name: 'Create account' });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
};

it('stays on the password step and says why when the password is refused', async () => {
  mockRegisterResult = { ok: false, error: BREACHED };
  await createAccount('password1');

  expect(await screen.findByText(BREACHED)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Verify and log in' })).toBeNull();
});

it('moves on to the code step when the signup is accepted', async () => {
  mockRegisterResult = { ok: true };
  await createAccount('violet-marmot-tambourine');

  expect(await screen.findByRole('button', { name: 'Verify and log in' })).toBeInTheDocument();
});
