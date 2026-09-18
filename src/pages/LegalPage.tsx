import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BRAND_MARK, theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { Card, IconButton } from '../components/ui';
import { LEGAL_PATHS, LEGAL_VERSION, LegalBlock, LegalDocId, LegalInline, STUDIO_LEGAL } from '../lib/legal';
import { LEGAL_DOCS } from '../lib/legalDocs';

/**
 * The Privacy Policy and the Terms of Use — one page, two documents.
 *
 * NOT INSIDE PortalLayout
 *
 * Staff read these as well as families, and PortalLayout is the family shell:
 * it records a daily install ping on mount (which would count an employee
 * reading the terms as a family visit) and it needs the portal's auth provider
 * above it. So this page draws the same header itself — chevron, mark, a 2px
 * rule — and App.tsx keeps the staff chrome off it (isLegalPath), which is what
 * lets it own its notch padding without the staff header doubling it.
 *
 * It follows the Studio Rules page (ProgramPolicies) for everything below the
 * header: a 720px reading column, mono section labels rather than the Kanit
 * display face, and each section's text on a Card.
 *
 * Nothing is fetched. The words ship with the build, so there is no loading or
 * error state and nothing to register with RefreshContext.
 */

/** "2026-09-18" → "September 18, 2026", read as a calendar date rather than a UTC instant. */
const effectiveDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// Underlined in the text colour rather than the brand pink: a policy is mostly
// links and paragraphs, and pink on every one of them would blow well past the
// ~5% of a view the brand allows the accent.
const linkStyle: React.CSSProperties = {
  color: theme.colors.txt.primary,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
};

/** In-app paths go through the router; mailto: and the like are plain anchors. */
const Runs: React.FC<{ parts: LegalInline[] }> = ({ parts }) => (
  <>
    {parts.map((part, i) => {
      if (typeof part === 'string') return <React.Fragment key={i}>{part}</React.Fragment>;
      return part.href.startsWith('/') ? (
        <Link key={i} to={part.href} style={linkStyle}>{part.text}</Link>
      ) : (
        <a key={i} href={part.href} style={linkStyle}>{part.text}</a>
      );
    })}
  </>
);

// minWidth and overflowWrap together (CLAUDE.md's third rule): the contact
// address is one unbreakable word, and on a 320px phone it is wider than the
// Card's text box.
const bodyText: React.CSSProperties = {
  ...theme.typography.body,
  fontFamily: theme.fonts.primary,
  color: theme.colors.txt.secondary,
  margin: 0,
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const Block: React.FC<{ block: LegalBlock }> = ({ block }) =>
  block.kind === 'p' ? (
    <p style={bodyText}>
      <Runs parts={block.parts} />
    </p>
  ) : (
    <ul
      style={{
        ...bodyText,
        paddingLeft: '1.2em',
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.sm,
      }}
    >
      {block.items.map((item, i) => (
        <li key={i}>
          <Runs parts={item} />
        </li>
      ))}
    </ul>
  );

/** The Studio Rules page's section label: mono, uppercase, off the display face. */
const sectionHeading: React.CSSProperties = {
  ...theme.typography.captionSmall,
  fontFamily: theme.fonts.mono,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: theme.colors.txt.tertiary,
  margin: `0 0 ${theme.spacing.sm}`,
};

const LegalPage: React.FC<{ doc: LegalDocId }> = ({ doc: id }) => {
  const doc = LEGAL_DOCS[id];
  const other = LEGAL_DOCS[id === 'privacy' ? 'terms' : 'privacy'];
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobileOrTablet } = useResponsive();

  // The app has no scroll reset of its own, so moving between the two
  // documents would open the second one wherever the first was left. A link
  // to a section (/privacy#children) is honoured here too: the browser tried
  // to jump to it before this lazy page had rendered anything to jump to.
  useEffect(() => {
    const hash = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
    const target = hash ? document.getElementById(hash) : null;
    if (target) {
      target.scrollIntoView();
      return;
    }
    try {
      // 'instant', because index.css makes <html> scroll smoothly: arriving on
      // the Terms from the foot of the Privacy Policy should not animate the
      // whole length of the page on the way up.
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    } catch {
      // Older Safari rejects 'instant' outright.
      window.scrollTo(0, 0);
    }
    // Keyed on the document, not the hash: the contents list scrolls itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Scrolled rather than followed, so tapping through the contents does not
  // stack a history entry per section in front of the Back chevron. Smooth, or
  // not under reduced motion — index.css decides both.
  const jumpTo = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    const target = document.getElementById(sectionId);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ block: 'start' });
  };

  // "default" is the key of the entry a tab opened on. Signup opens these pages
  // in a new tab so a half-filled form survives, and from there there is
  // nothing to go back to — so the chevron goes to the front door instead.
  const canGoBack = location.key !== 'default';

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backgroundColor: theme.colors.bg.primary,
          borderBottom: `2px solid ${theme.colors.bdr.primary}`,
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div
          style={{
            maxWidth: theme.pageLayout.maxWidth,
            margin: '0 auto',
            padding: isMobileOrTablet ? '12px 16px' : '16px 40px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <IconButton
            aria-label={canGoBack ? 'Back' : 'Home'}
            onClick={() => (canGoBack ? navigate(-1) : navigate('/'))}
            style={{ width: '36px', height: '36px', flexShrink: 0, marginLeft: '-8px' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </IconButton>

          <Link to="/" style={{ display: 'flex', flexShrink: 0 }} aria-label="DIDC home">
            <img src={BRAND_MARK} alt="Dancing Images Dance Center" style={{ height: '22px', width: 'auto' }} />
          </Link>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          width: '100%',
          maxWidth: theme.pageLayout.maxWidth,
          margin: '0 auto',
          padding: isMobileOrTablet ? '24px 16px' : '40px',
          paddingBottom: `calc(${isMobileOrTablet ? '24px' : '40px'} + env(safe-area-inset-bottom))`,
        }}
      >
        <div style={{ maxWidth: '720px', display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
          <div>
            <h1
              style={{
                ...(isMobileOrTablet ? theme.typography.h1Mobile : theme.typography.h1),
                color: theme.colors.txt.primary,
                margin: 0,
              }}
            >
              {doc.title}
            </h1>
            <p
              style={{
                ...theme.typography.caption,
                fontFamily: theme.fonts.mono,
                color: theme.colors.txt.tertiary,
                margin: '8px 0 0',
              }}
            >
              Effective {effectiveDate(LEGAL_VERSION)}
            </p>
          </div>

          <Card>
            <p style={bodyText}>
              <Runs parts={doc.intro} />
            </p>
          </Card>

          <nav aria-label="Contents">
            <h2 style={sectionHeading}>Contents</h2>
            <ol
              style={{
                ...bodyText,
                paddingLeft: '1.4em',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {doc.sections.map(section => (
                <li key={section.id}>
                  <a href={`#${section.id}`} onClick={e => jumpTo(e, section.id)} style={linkStyle}>
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {doc.sections.map(section => (
            <section
              key={section.id}
              id={section.id}
              // Clears the sticky header (about 70px, plus the notch) with room
              // to spare when a section is scrolled to.
              style={{ scrollMarginTop: 'calc(88px + env(safe-area-inset-top))' }}
            >
              <h2 style={sectionHeading}>{section.heading}</h2>
              <Card padding="lg">
                <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                  {section.blocks.map((block, i) => (
                    <Block key={i} block={block} />
                  ))}
                </div>
              </Card>
            </section>
          ))}

          <p
            style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.tertiary,
              margin: 0,
              overflowWrap: 'anywhere',
            }}
          >
            {STUDIO_LEGAL.name} · See also our{' '}
            <Link to={LEGAL_PATHS[other.id]} style={linkStyle}>{other.title}</Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default LegalPage;
