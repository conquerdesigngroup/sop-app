import React from 'react';
import { render, screen } from '@testing-library/react';
import ProgramGate from './ProgramGate';
import { PortalProgram } from '../../types';

/**
 * Who gets through a section's gate, signed in.
 *
 * Since v55 the database lists the All-Star section only for an All-Star family
 * or staff, and the gate decides from that list: a section missing from it
 * sends the reader to their dashboard. That is the whole of what stops an
 * Academy/TNT family who follows an All-Star link — shared, bookmarked, or in
 * an old notification — from landing on an All-Star page with nothing on it.
 *
 * The router is mocked, as in every other test here: react-router-dom 7 names
 * a `main` file it does not ship, and this Jest cannot read its `exports`.
 */

const mockPortal: { programs: PortalProgram[]; slug: string } = { programs: [], slug: '' };

jest.mock('react-router-dom', () => ({
  Navigate: (p: { to: string }) => <p>sent to {p.to}</p>,
  Outlet: () => <p>section page</p>,
  useParams: () => ({ program: mockPortal.slug }),
  useLocation: () => ({ pathname: `/portal/${mockPortal.slug}` }),
}), { virtual: true });

jest.mock('../../lib/clientAuth', () => ({
  CLIENT_AUTH_REQUIRED: true,
  CLIENT_AUTH_ENABLED: true,
}));

jest.mock('../../contexts/PortalContext', () => ({
  usePortal: () => ({
    programs: mockPortal.programs,
    loading: false,
    error: null,
    getProgramBySlug: (slug: string) => mockPortal.programs.find(p => p.slug === slug),
    hasAccess: () => false,
    verifyCode: () => Promise.resolve(false),
  }),
}));

jest.mock('../../contexts/PortalAuthContext', () => ({
  usePortalAuth: () => ({ loading: false, hasSession: true }),
}));

jest.mock('../../components/portal/PortalLayout', () => ({
  __esModule: true,
  default: (p: any) => <div>{p.children}</div>,
}));

jest.mock('../../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobileOrTablet: true }),
}));

const section = (slug: PortalProgram['slug']): PortalProgram => ({
  id: `prog-${slug}`,
  slug,
  name: slug,
  blurb: '',
  requiresCode: false,
  sortOrder: 0,
  isActive: true,
  heroPath: null,
  heroAlt: '',
});

const open = (slug: string) => {
  mockPortal.slug = slug;
  return render(<ProgramGate />);
};

it('sends a family outside All-Stars from an All-Star link to their dashboard', () => {
  mockPortal.programs = [section('academy')];
  open('allstars');

  expect(screen.getByText('sent to /portal')).toBeInTheDocument();
  expect(screen.queryByText('section page')).not.toBeInTheDocument();
});

it('lets an All-Star family into the All-Star section', () => {
  mockPortal.programs = [section('allstars'), section('academy')];
  open('allstars');

  expect(screen.getByText('section page')).toBeInTheDocument();
});

it('lets every family into Academy / TNT', () => {
  mockPortal.programs = [section('academy')];
  open('academy');

  expect(screen.getByText('section page')).toBeInTheDocument();
});
