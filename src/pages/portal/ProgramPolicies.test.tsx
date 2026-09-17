import React from 'react';
import { render, screen } from '@testing-library/react';
import ProgramPolicies from './ProgramPolicies';
import { STUDIO_POLICIES, policyRuns } from '../../lib/studioPolicies';

/**
 * The studio contract, rendered as app content.
 *
 * What is pinned here is the thing the page exists for: every policy in the
 * document reaches the screen, as text, with no file and no link off to one.
 * The wording itself is not asserted line by line — that would be a second
 * copy of the contract to keep in step with the first — but the count is, so
 * an item dropped from studioPolicies.ts by a bad merge fails here rather than
 * quietly leaving a family unaware of the late fee.
 *
 * The router is mocked, as in every other test here: react-router-dom 7 names
 * a `main` file it does not ship, and this Jest cannot read its `exports`.
 */

jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  useParams: () => ({ program: 'allstars' }),
}), { virtual: true });

jest.mock('../../contexts/PortalContext', () => ({
  usePortal: () => ({
    getProgramBySlug: () => ({ id: 'prog-allstars', slug: 'allstars', name: 'All-Stars' }),
  }),
}));

jest.mock('../../components/portal/PortalLayout', () => ({
  __esModule: true,
  default: (p: any) => (
    <div>
      <h1>{p.title}</h1>
      {p.subtitle && <p>{p.subtitle}</p>}
      {p.children}
    </div>
  ),
}));

const allItems = STUDIO_POLICIES.sections.flatMap(s => s.items);

describe('ProgramPolicies', () => {
  it('renders every policy in the contract', () => {
    render(<ProgramPolicies />);

    expect(screen.getAllByRole('term')).toHaveLength(allItems.length);
    allItems.forEach(item => {
      expect(screen.getByText(item.term)).toBeInTheDocument();
    });
  });

  it('prints the callout the contract sets apart', () => {
    render(<ProgramPolicies />);

    STUDIO_POLICIES.sections.forEach(section => {
      if (!section.callout) return;

      // getAllByText, not getByText: "No credits or refunds are given." is
      // deliberately on the page more than once — the contract states it
      // inside two policies AND again on its own. The one this test is about
      // is the standalone paragraph, so the match is narrowed to a <p> rather
      // than the <strong> runs inside a <dd>.
      const standalone = screen
        .getAllByText(section.callout)
        .filter(el => el.tagName === 'P');
      expect(standalone).toHaveLength(1);
    });
  });

  it('is text on the page, not a link to a file', () => {
    const { container } = render(<ProgramPolicies />);

    // The point of the page. A download, an <object>, an <iframe> or a link to
    // a .pdf would each be the thing this replaced.
    expect(container.querySelector('a[download]')).toBeNull();
    expect(container.querySelector('iframe, object, embed')).toBeNull();
    screen.queryAllByRole('link').forEach(a => {
      expect(a.getAttribute('href') ?? '').not.toMatch(/\.pdf$/i);
    });

    // And the body text really is on screen, not just the headings.
    expect(screen.getByText(/automatic withdrawal from a credit card/)).toBeInTheDocument();
  });
});

describe('policyRuns', () => {
  it('marks the phrases the contract prints in bold', () => {
    expect(policyRuns('plain **bold** plain')).toEqual([
      { text: 'plain ', strong: false },
      { text: 'bold', strong: true },
      { text: ' plain', strong: false },
    ]);
  });

  it('drops empty runs so a body opening in bold renders no stray span', () => {
    expect(policyRuns('**bold** after')).toEqual([
      { text: 'bold', strong: true },
      { text: ' after', strong: false },
    ]);
  });

  it('treats an unbalanced marker as text rather than markup', () => {
    // The guarantee that matters: this is a formatter, not a parser that can
    // be talked into producing an element.
    expect(policyRuns('a ** b').map(r => r.text).join('')).toBe('a  b');
  });
});
