import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import LegalPage from './LegalPage';
import { LEGAL_DOCS } from '../lib/legalDocs';
import { LEGAL_PATHS } from '../lib/legal';

/**
 * The Privacy Policy and Terms of Use page.
 *
 * Every section in the data reaches the screen with its own anchor, and the
 * chevron does the right thing in the one case that is easy to get wrong: a
 * page opened in a new tab from the signup form, with no history behind it.
 *
 * The router is mocked, as in every other test here: react-router-dom 7 names
 * a `main` file it does not ship, and this Jest cannot read its `exports`.
 */

const nav: { key: string; hash: string; calls: Array<string | number> } = {
  key: 'default',
  hash: '',
  calls: [],
};

jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  useNavigate: () => (to: string | number) => { nav.calls.push(to); },
  useLocation: () => ({ key: nav.key, hash: nav.hash, pathname: '/privacy' }),
}), { virtual: true });

jest.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: true, isMobileOrTablet: true }),
}));

beforeEach(() => {
  nav.key = 'default';
  nav.hash = '';
  nav.calls = [];
  // Neither exists in jsdom; the page calls both.
  window.scrollTo = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

describe.each(Object.values(LEGAL_DOCS))('$title', doc => {
  it('renders the title, the effective date and every section under its anchor', () => {
    const { container } = render(<LegalPage doc={doc.id} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(doc.title);
    expect(screen.getByText(/^Effective \w+ \d{1,2}, \d{4}$/)).toBeInTheDocument();

    doc.sections.forEach(section => {
      const el = container.querySelector(`section#${section.id}`);
      expect(el).not.toBeNull();
      expect(within(el as HTMLElement).getByRole('heading', { level: 2 })).toHaveTextContent(section.heading);
    });
  });

  it('lists every section in the contents, pointing at its anchor', () => {
    render(<LegalPage doc={doc.id} />);
    const contents = within(screen.getByRole('navigation', { name: 'Contents' })).getAllByRole('link');
    expect(contents.map(a => a.getAttribute('href'))).toEqual(doc.sections.map(s => `#${s.id}`));
  });

  it('links across to the other document', () => {
    render(<LegalPage doc={doc.id} />);
    const other = doc.id === 'privacy' ? LEGAL_PATHS.terms : LEGAL_PATHS.privacy;
    expect(screen.getAllByRole('link').some(a => a.getAttribute('href') === other)).toBe(true);
  });
});

it('scrolls to a section from the contents without following the link', () => {
  render(<LegalPage doc="privacy" />);
  const link = within(screen.getByRole('navigation', { name: 'Contents' })).getAllByRole('link')[2];

  // fireEvent returns false when the handler called preventDefault — i.e. no
  // history entry per section stacked in front of the Back chevron.
  expect(fireEvent.click(link)).toBe(false);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});

it('goes home from a page opened in a new tab, which has nothing to go back to', () => {
  nav.key = 'default';
  render(<LegalPage doc="terms" />);
  fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  expect(nav.calls).toEqual(['/']);
});

it('goes back when there is somewhere in the app to go back to', () => {
  nav.key = 'k3y';
  render(<LegalPage doc="terms" />);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(nav.calls).toEqual([-1]);
});
