import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PortalHome from './PortalHome';
import { PortalProgram } from '../../types';

/**
 * The row of section tiles at the top of the dashboard.
 *
 * It draws whatever sections the database lists for this account, and since
 * v55 that is both for an All-Star family and Academy/TNT alone for everyone
 * else. Two things are pinned: a family outside All-Stars gets no All-Star
 * tile, and the row closes up around the tiles it has rather than keeping an
 * empty third slot where the All-Star one would have been.
 *
 * The router is mocked, as in every other test here: react-router-dom 7 names
 * a `main` file it does not ship, and this Jest cannot read its `exports`.
 */

const mockPortal: { programs: PortalProgram[]; loading: boolean } = { programs: [], loading: false };

const navigated: string[] = [];

jest.mock('react-router-dom', () => ({
  Navigate: () => null,
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  useNavigate: () => (to: string) => { navigated.push(to); },
}), { virtual: true });

jest.mock('../../lib/clientAuth', () => ({
  CLIENT_AUTH_REQUIRED: true,
  CLIENT_AUTH_ENABLED: true,
}));

jest.mock('../../contexts/PortalContext', () => ({
  usePortal: () => ({ programs: mockPortal.programs, loading: mockPortal.loading, error: null }),
}));

jest.mock('../../contexts/PortalAuthContext', () => ({
  usePortalAuth: () => ({ loading: false, hasSession: true }),
}));

jest.mock('../../contexts/RefreshContext', () => ({
  useRefreshable: () => {},
}));

jest.mock('../../components/profile/usePortalCards', () => ({
  DEMO_ALLOWED: false,
  usePortalCards: () => ({
    cards: [],
    ctx: {},
    identity: { firstName: 'Rosa', lastName: 'Alvarez', email: 'rosa@example.com' },
    showScenarioPicker: false,
    scenario: 'guardian',
    setScenario: () => {},
    refreshHousehold: () => Promise.resolve(),
  }),
}));

jest.mock('../../components/portal/PortalLayout', () => ({
  __esModule: true,
  default: (p: any) => <div>{p.children}</div>,
}));

jest.mock('../../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: true, isMobileOrTablet: true }),
}));

const section = (slug: PortalProgram['slug'], name: string, sortOrder: number): PortalProgram => ({
  id: `prog-${slug}`,
  slug,
  name,
  blurb: '',
  requiresCode: false,
  sortOrder,
  isActive: true,
  heroPath: null,
  heroAlt: '',
});

const ALL_STARS = section('allstars', 'All-Star Dancers', 1);
const ACADEMY = section('academy', 'Academy / TNT Dancers', 2);

const renderHome = () => render(<PortalHome />);

/** The grid under the "The studio" heading. */
const tileRow = (): HTMLElement => {
  const nav = screen.getByRole('navigation', { name: 'Studio sections' });
  return nav.querySelector('div') as HTMLElement;
};

beforeEach(() => {
  mockPortal.loading = false;
  navigated.length = 0;
});

it('gives a family outside All-Stars no All-Star tile, and no gap where it was', () => {
  mockPortal.programs = [ACADEMY];
  renderHome();

  const nav = screen.getByRole('navigation', { name: 'Studio sections' });
  expect(within(nav).queryByText('All-Star Dancers')).not.toBeInTheDocument();
  expect(within(nav).getByText('Academy / TNT Dancers')).toBeInTheDocument();
  expect(within(nav).getByText('Billing & Admin')).toBeInTheDocument();
  expect(tileRow().style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
});

it('gives an All-Star family both sections, three across', () => {
  mockPortal.programs = [ALL_STARS, ACADEMY];
  renderHome();

  const nav = screen.getByRole('navigation', { name: 'Studio sections' });
  expect(within(nav).getByText('All-Star Dancers')).toBeInTheDocument();
  expect(within(nav).getByText('Academy / TNT Dancers')).toBeInTheDocument();
  expect(tileRow().style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
});

it('offers the studio rules to every family, section or no section', () => {
  // Outside the "Studio sections" nav on purpose: the rules are the studio's,
  // not a section's, and a family who has never opened one still needs them.
  // Before this the button existed only on the two section overviews, which
  // put the contract behind a section a reader might not have.
  mockPortal.programs = [ACADEMY];
  renderHome();

  const button = screen.getByRole('button', { name: /studio rules & policies/i });
  const nav = screen.getByRole('navigation', { name: 'Studio sections' });
  expect(nav).not.toContainElement(button);

  fireEvent.click(button);
  expect(navigated).toEqual(['/portal/policies']);
});

it('keeps the rules reachable for a family with no dashboard cards at all', () => {
  // A member of staff, or a family whose cards are all empty. The cards block
  // renders nothing in that state, and the button must not go with it.
  mockPortal.programs = [];
  renderHome();

  expect(screen.getByRole('button', { name: /studio rules & policies/i })).toBeInTheDocument();
});
