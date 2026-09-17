import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { theme } from '../../theme';
import { Card } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import SegmentedControl from '../../components/profile/SegmentedControl';
import { isProgramSlug, portalRoutes } from '../../lib/portal';
import {
  DressCodeGroup,
  PolicyItem,
  STUDIO_DRESS_CODE,
  STUDIO_POLICIES,
  policyRuns,
} from '../../lib/studioPolicies';
import { usePortal } from '../../contexts/PortalContext';

/**
 * The studio's rules and policies, read inside the app.
 *
 * The contract exists as a PDF and this page deliberately is not a link to it.
 * See the header of lib/studioPolicies.ts for why: a PDF on a phone leaves the
 * app, leaves the back button, and arrives zoomed for paper.
 *
 * TWO DOORS, ONE PAGE
 *
 * /portal/policies is the family dashboard's, and /portal/:program/policies is
 * the one inside a section. The words are identical — both sections sign the
 * same contract — so the difference is only where the reader came from, and
 * the page follows them back: from a section it keeps that section's tab bar
 * and its back chevron returns to the section overview; from the dashboard
 * there is no section to keep, and back means the dashboard.
 *
 * Which is why the slug is read here rather than through useProgramPage. That
 * hook asserts the slug is valid because ProgramGate has already checked it,
 * and on the dashboard route there is no slug at all — the assertion would be
 * a lie and `portalRoutes.program(undefined)` a link to "/portal/undefined".
 *
 * Nothing here is fetched. The words ship with the build, so this page has no
 * loading state, no error state and nothing to register with RefreshContext —
 * it is the one portal page that is already complete the moment it mounts.
 */

/**
 * One policy: a bold lead-in and its paragraph, as a <dt>/<dd> pair.
 *
 * A description list rather than a stack of divs because that is what this
 * actually is — eleven terms and their definitions — and it is the difference
 * between a screen reader announcing "Tuition Payments, description, All
 * payments will be…" and reading twenty-two unlabelled paragraphs in a row.
 */
const Policy: React.FC<{ item: PolicyItem; first: boolean }> = ({ item, first }) => (
  <div
    style={{
      // A hairline between entries, never above the first one. 1px is the
      // subtle-divider weight (CLAUDE.md); the 2px is Card's own edge.
      borderTop: first ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
      paddingTop: first ? 0 : theme.spacing.md,
      marginTop: first ? 0 : theme.spacing.md,
    }}
  >
    <dt
      style={{
        ...theme.typography.body,
        fontFamily: theme.fonts.primary,
        fontWeight: 700,
        color: theme.colors.txt.primary,
        margin: `0 0 ${theme.spacing.xs}`,
      }}
    >
      {item.term}
    </dt>
    <dd
      style={{
        ...theme.typography.body,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.secondary,
        // <dd> carries a 40px indent by default, which on a 320px phone is an
        // eighth of the screen spent on nothing.
        margin: 0,
      }}
    >
      {policyRuns(item.body).map((run, i) =>
        run.strong ? (
          <strong key={i} style={{ color: theme.colors.txt.primary, fontWeight: 700 }}>
            {run.text}
          </strong>
        ) : (
          <React.Fragment key={i}>{run.text}</React.Fragment>
        )
      )}
    </dd>
  </div>
);

/** A shared section heading: mono, uppercase, overridden off the display face. */
const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2
    style={{
      ...theme.typography.captionSmall,
      fontFamily: theme.fonts.mono,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: theme.colors.txt.tertiary,
      margin: `0 0 ${theme.spacing.sm}`,
    }}
  >
    {children}
  </h2>
);

/**
 * One group's rules: Hair, Attire, Shoes, then the packet's own
 * what-not-to-bring and tips pages where it prints them.
 *
 * The style label sits on its own line above its rule rather than inline. A
 * style is not a sentence — "Acro / Jazz / Contemporary" is 26 characters, and
 * on a 320px phone an inline label pushes its rule into a two-word ragged
 * column beside it. Stacked, both get the full width.
 */
const DressCodeBody: React.FC<{ group: DressCodeGroup }> = ({ group }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
    {group.blocks.map(block => (
      <Card key={block.heading} padding="lg">
        <h3
          style={{
            ...theme.typography.h3Mobile,
            color: theme.colors.txt.primary,
            margin: `0 0 ${theme.spacing.sm}`,
          }}
        >
          {block.heading}
        </h3>

        <dl style={{ margin: 0 }}>
          {block.rules.map((rule, i) => (
            <div
              key={rule.label ?? i}
              style={{
                borderTop: i === 0 ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
                paddingTop: i === 0 ? 0 : theme.spacing.sm,
                marginTop: i === 0 ? 0 : theme.spacing.sm,
              }}
            >
              {rule.label && (
                <dt
                  style={{
                    ...theme.typography.captionSmall,
                    fontFamily: theme.fonts.mono,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: theme.colors.primary,
                    margin: `0 0 ${theme.spacing.xs}`,
                    // A style list is arbitrary text of arbitrary length, and
                    // the pair of these is what CLAUDE.md's third rule asks for
                    // — one without the other still overflows.
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {rule.label}
                </dt>
              )}
              <dd
                style={{
                  ...theme.typography.body,
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.txt.secondary,
                  margin: 0,
                }}
              >
                {rule.text}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    ))}

    {group.avoid && (
      <Card padding="lg">
        <h3
          style={{
            ...theme.typography.h3Mobile,
            color: theme.colors.txt.primary,
            margin: `0 0 ${theme.spacing.sm}`,
          }}
        >
          {group.avoid.heading}
        </h3>
        <dl style={{ margin: 0 }}>
          {group.avoid.items.map((item, i) => (
            <Policy key={item.term} item={item} first={i === 0} />
          ))}
        </dl>
      </Card>
    )}

    {group.tips && (
      <Card padding="lg">
        <h3
          style={{
            ...theme.typography.h3Mobile,
            color: theme.colors.txt.primary,
            margin: `0 0 ${theme.spacing.sm}`,
          }}
        >
          Tips for parents
        </h3>
        {/* Numbered in the packet and numbered here: an <ol> says "five of
            these" to a screen reader without the page having to count. */}
        <ol
          style={{
            ...theme.typography.body,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.secondary,
            margin: 0,
            paddingLeft: '1.2em',
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.sm,
          }}
        >
          {group.tips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ol>
      </Card>
    )}
  </div>
);

const ProgramPolicies: React.FC = () => {
  const { program: param } = useParams<{ program: string }>();
  const { getProgramBySlug } = usePortal();

  // Undefined on /portal/policies, which is the dashboard's route and has no
  // :program segment at all. Validated rather than trusted even where the gate
  // has already done it, because an unchecked value would reach a route builder.
  const slug = isProgramSlug(param) ? param : undefined;
  const program = slug ? getProgramBySlug(slug) : undefined;

  /**
   * The dress-code group lives in the URL, not in component state.
   *
   * Three reasons, and the third is the one that decided it. A teacher can send
   * a parent the rules for their dancer rather than the rules for everyone.
   * Reloading, or coming back from the class page, does not silently drop the
   * reader back on the two-year-olds. And it is the only way this section can
   * be audited: `npm run audit:mobile` cannot click, so a group behind a click
   * is a layout nobody has ever measured — which is exactly what the viewer's
   * `?view=` routes exist for, and this follows them.
   *
   * Deliberately NOT remembered in localStorage. A household can have dancers
   * in more than one band, and a control that silently reopens on last time's
   * choice is how a parent reads the wrong rules without noticing they chose
   * anything. An address bar showing `?group=male` is a choice you can see.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const group = STUDIO_DRESS_CODE.groups.find(g => g.id === searchParams.get('group'))
    ?? STUDIO_DRESS_CODE.groups[0];

  const setGroupId = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('group', id);
    // Replace: picking a group is not a place you should have to press Back
    // through to leave the page.
    setSearchParams(next, { replace: true });
  };

  return (
    <PortalLayout
      title="Rules & Policies"
      // Named so the reader can tell which of the two doors they came through,
      // and — on the dashboard's copy — that these rules are the whole studio's
      // rather than one section's.
      subtitle={program?.name ?? 'Dancing Images Dance Center'}
      backTo={slug ? portalRoutes.program(slug) : portalRoutes.home}
      slug={slug}
    >
      <div
        style={{
          maxWidth: '720px',
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.lg,
        }}
      >
        <Card>
          <p
            style={{
              ...theme.typography.body,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.secondary,
              margin: 0,
            }}
          >
            {STUDIO_POLICIES.intro}
          </p>
        </Card>

        {STUDIO_POLICIES.sections.map(section => (
          <section key={section.heading}>
            {/* Overridden off the global Kanit display face, same as the
                dashboard's "The studio": at this size the italic uppercase
                headline face is a shout above a paragraph it only labels. */}
            <SectionHeading>{section.heading}</SectionHeading>

            <Card padding="lg">
              <dl style={{ margin: 0 }}>
                {section.items.map((item, i) => (
                  <Policy key={item.term} item={item} first={i === 0} />
                ))}
              </dl>
            </Card>

            {section.callout && (
              /* The contract prints this line on its own, in red, after the
                 fees — the one sentence the studio wants read twice. Kanit
                 italic uppercase and a primary border is what that box looks
                 like here; it is an accent on one line, which keeps the pink
                 well inside the ~5% the brand allows. */
              <div
                style={{
                  marginTop: theme.spacing.sm,
                  padding: theme.spacing.md,
                  borderRadius: theme.borderRadius.lg,
                  border: `2px solid ${theme.colors.primary}`,
                  backgroundColor: theme.colors.bg.secondary,
                }}
              >
                <p
                  style={{
                    ...theme.typography.h3Mobile,
                    color: theme.colors.primary,
                    margin: 0,
                  }}
                >
                  {section.callout}
                </p>
              </div>
            )}
          </section>
        ))}

        {/* The dress code, after the contract rather than inside it: the
            contract's own "Dress code" line says to ask your teacher, and this
            is the answer to that question, at the length the answer needs. */}
        <section>
          <SectionHeading>{STUDIO_DRESS_CODE.title}</SectionHeading>

          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            <div>
              <p
                style={{
                  ...theme.typography.body,
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.txt.secondary,
                  margin: `0 0 ${theme.spacing.sm}`,
                }}
              >
                {STUDIO_DRESS_CODE.intro}
              </p>

              <SegmentedControl
                options={STUDIO_DRESS_CODE.groups.map(g => ({ value: g.id, label: g.label }))}
                value={group.id}
                onChange={setGroupId}
                ariaLabel="Dress code group"
              />

              {/* Under the control, not inside a chip. The age range is what
                  tells a parent they have picked the right one, and it is too
                  long to sit in a pill three-across on a phone. */}
              <p
                style={{
                  ...theme.typography.captionSmall,
                  fontFamily: theme.fonts.mono,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: theme.colors.txt.tertiary,
                  margin: `${theme.spacing.sm} 0 0`,
                }}
              >
                {group.who}
              </p>
            </div>

            <DressCodeBody group={group} />
          </div>
        </section>

        <p
          style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.tertiary,
            margin: 0,
          }}
        >
          {STUDIO_POLICIES.source} The dress code is from the DIDC Dress Code packet.
        </p>
      </div>
    </PortalLayout>
  );
};

export default ProgramPolicies;
