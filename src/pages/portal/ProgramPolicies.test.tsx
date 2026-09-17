import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ProgramPolicies from './ProgramPolicies';
import { STUDIO_DRESS_CODE, STUDIO_POLICIES, policyRuns } from '../../lib/studioPolicies';

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

/** Set by each test: the :program segment the route matched, if any. */
const route: { param?: string; search: string } = { param: 'allstars', search: '' };

/** What PortalLayout was handed — the two props that differ by door. */
const shell: { backTo?: string; slug?: string; subtitle?: string } = {};

/**
 * A working useSearchParams, not a stub: the dress-code group is URL state, so
 * a mock that swallowed the write would leave every group test asserting
 * against the default and passing for the wrong reason.
 */
jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  useParams: () => ({ program: route.param }),
  useSearchParams: () => {
    const [search, setSearch] = (jest.requireActual('react') as typeof import('react'))
      .useState(route.search);
    return [
      new URLSearchParams(search),
      (next: URLSearchParams) => {
        route.search = next.toString();
        setSearch(route.search);
      },
    ];
  },
}), { virtual: true });

jest.mock('../../contexts/PortalContext', () => ({
  usePortal: () => ({
    getProgramBySlug: (slug: string) =>
      slug === 'allstars' ? { id: 'prog-allstars', slug, name: 'All-Stars' } : undefined,
  }),
}));

jest.mock('../../components/portal/PortalLayout', () => ({
  __esModule: true,
  default: (p: any) => {
    shell.backTo = p.backTo;
    shell.slug = p.slug;
    shell.subtitle = p.subtitle;
    return (
      <div>
        <h1>{p.title}</h1>
        {p.subtitle && <p>{p.subtitle}</p>}
        {p.children}
      </div>
    );
  },
}));

beforeEach(() => {
  route.param = 'allstars';
  route.search = '';
});

const allItems = STUDIO_POLICIES.sections.flatMap(s => s.items);

/**
 * How many <dt>s a dress-code group contributes: one per labelled rule, plus
 * its what-not-to-bring items. Computed rather than written down, so adding a
 * rule to the packet does not fail a test for the wrong reason.
 */
const dressTermsIn = (id: string) => {
  const group = STUDIO_DRESS_CODE.groups.find(g => g.id === id)!;
  return group.blocks.flatMap(b => b.rules).filter(r => r.label).length
    + (group.avoid?.items.length ?? 0);
};

/** The group the page opens on — the packet's own first section. */
const DEFAULT_GROUP = STUDIO_DRESS_CODE.groups[0];
const pick = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));

describe('ProgramPolicies', () => {
  it('renders every policy in the contract', () => {
    render(<ProgramPolicies />);

    expect(screen.getAllByRole('term'))
      .toHaveLength(allItems.length + dressTermsIn(DEFAULT_GROUP.id));
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

describe('the two doors', () => {
  it('keeps the section, and its back chevron, when entered from one', () => {
    render(<ProgramPolicies />);

    expect(shell.slug).toBe('allstars');
    expect(shell.backTo).toBe('/portal/allstars');
    expect(shell.subtitle).toBe('All-Stars');
  });

  it('sends the dashboard copy back to the dashboard, with no section tab bar', () => {
    route.param = undefined;
    render(<ProgramPolicies />);

    // The bug this pins: a slug asserted rather than checked would build
    // "/portal/undefined" here and show a tab bar for a section the reader
    // never opened.
    expect(shell.slug).toBeUndefined();
    expect(shell.backTo).toBe('/portal');
    expect(shell.subtitle).toBe('Dancing Images Dance Center');
  });

  it('shows the same policies through either door', () => {
    route.param = undefined;
    render(<ProgramPolicies />);

    expect(screen.getAllByRole('term'))
      .toHaveLength(allItems.length + dressTermsIn(DEFAULT_GROUP.id));
  });

  it('refuses a :program segment that is not a real section', () => {
    // Reachable by typing a URL. It must not become a slug — the same rule
    // ProgramGate applies, held here because this page is also mounted where
    // that gate is not.
    route.param = 'not-a-section';
    render(<ProgramPolicies />);

    expect(shell.slug).toBeUndefined();
    expect(shell.backTo).toBe('/portal');
  });
});

describe('the dress code', () => {
  it('opens on the packet\'s first group and says who it covers', () => {
    render(<ProgramPolicies />);

    expect(screen.getByRole('button', { name: DEFAULT_GROUP.label })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(DEFAULT_GROUP.who)).toBeInTheDocument();
    DEFAULT_GROUP.blocks.forEach(block => {
      expect(screen.getByRole('heading', { name: block.heading })).toBeInTheDocument();
    });
  });

  it('swaps the rules when the group changes, including the ones that differ by a word', () => {
    render(<ProgramPolicies />);

    // The reason the group is a control and not three stacked headings. Ballet
    // attire is "pink tights" for the little ones and "black leotard and pink
    // tights" for juniors — a difference a reader skims straight past when both
    // are on the page at once.
    expect(screen.getByText('Solid colored leotard. Skirt/Tutu is optional. Pink tights.')).toBeInTheDocument();
    expect(screen.queryByText('Black leotard and pink tights.')).not.toBeInTheDocument();

    pick('Junior & Teen');

    expect(screen.getByText('Black leotard and pink tights.')).toBeInTheDocument();
    expect(screen.queryByText('Solid colored leotard. Skirt/Tutu is optional. Pink tights.')).not.toBeInTheDocument();
    expect(screen.getByText('7 to 18 year olds')).toBeInTheDocument();
  });

  it('opens the group named in the URL, so a link can point at one', () => {
    route.search = 'group=male';
    render(<ProgramPolicies />);

    expect(screen.getByRole('button', { name: 'Male students' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Black ballet shoes.')).toBeInTheDocument();
  });

  it('falls back to the first group when the URL names one that does not exist', () => {
    // Typed, or an old link after the packet is reorganised. It must not render
    // an empty dress code.
    route.search = 'group=nonsense';
    render(<ProgramPolicies />);

    expect(screen.getByRole('button', { name: DEFAULT_GROUP.label })).toHaveAttribute('aria-pressed', 'true');
  });

  it('invents no tips for the section the packet prints none for', () => {
    render(<ProgramPolicies />);
    expect(screen.getByRole('heading', { name: 'Tips for parents' })).toBeInTheDocument();

    pick('Male students');

    // The packet has no tips page and no what-not-to-wear page for male
    // students. Neither may appear, and nothing may be borrowed from the
    // sections that do have them.
    expect(screen.queryByRole('heading', { name: 'Tips for parents' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /what not to/i })).not.toBeInTheDocument();
    expect(screen.getByText('Black ballet shoes.')).toBeInTheDocument();
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
