import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../../theme';
import { ProgramSlug, dayName, formatTime, portalRoutes } from '../../lib/portal';
import {
  TIME_BANDS, TimeBand, durationLabel, groupByDay, timeBandOf,
} from '../../lib/portalClasses';
import type { PortalClass, PortalClassCategory } from '../../types';

/**
 * One day of the schedule, as a timeline.
 *
 * WHY NOT THE CARDS
 *
 * The desktop card is ~150px tall, so twenty of them is three thousand pixels
 * for one day and the whole week is twenty-two phone screens. This row is
 * ~72px: the time moves into a fixed left rail, the badges become a coloured
 * spine, and the class gets the width instead of a box around it. Same
 * information, less than half the height, and the eye can run down the times
 * without re-finding them on every card.
 *
 * THE SPINE
 *
 * A 3px rule in the program's colour — crimson All-Stars, blue Academy, amber
 * TNT — replaces the category badge on every single row. On a phone a day is
 * mostly one or two programs, so the badge was repeating itself twenty times;
 * the spine says the same thing without spending a line on it.
 *
 * The colours are literal hex from theme.colors.primary and status.*, which do
 * not change between light and dark mode. A mode-aware token here would need
 * two different spines to stay legible on two different grounds.
 */

const SPINE: Record<PortalClassCategory, string> = {
  allstars: theme.colors.primary,
  academy: theme.colors.status.info,
  tnt: theme.colors.status.warning,
};

const BAND_LABEL: Record<TimeBand, string> =
  TIME_BANDS.reduce((acc, b) => ({ ...acc, [b.value]: b.label }), {} as Record<TimeBand, string>);

// ------------------------------------------------------------------ row

const Row: React.FC<{ klass: PortalClass; slug: ProgramSlug }> = ({ klass: c, slug }) => {
  const [pressed, setPressed] = useState(false);

  const start = formatTime(c.startTime);
  const meta = [c.instructorName, c.location].filter(Boolean).join(' · ');
  const tail = [c.style, c.level ? `Level ${c.level}` : null].filter(Boolean).join(' · ');

  return (
    <Link
      to={portalRoutes.classDetail(slug, c.id)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onTouchCancel={() => setPressed(false)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: '10px',
        padding: '11px 12px',
        textDecoration: 'none',
        backgroundColor: pressed ? theme.colors.bg.tertiary : 'transparent',
        transition: 'background-color 0.12s ease',
        minWidth: 0,
      }}
    >
      {/* Fixed rail. Fixed so every time in the day starts at the same x and
          the column reads as a column; 58px is "12:00 PM" at 12px mono. */}
      <div style={{ width: '58px', flexShrink: 0, paddingTop: '1px' }}>
        <div
          style={{
            fontFamily: theme.fonts.mono,
            fontSize: '12.5px',
            fontWeight: 600,
            lineHeight: 1.25,
            color: theme.colors.txt.primary,
          }}
        >
          {start ?? '—'}
        </div>
        {durationLabel(c) && (
          <div
            style={{
              fontFamily: theme.fonts.mono,
              fontSize: '10.5px',
              lineHeight: 1.3,
              color: theme.colors.txt.tertiary,
            }}
          >
            {durationLabel(c)}
          </div>
        )}
      </div>

      <div
        aria-hidden="true"
        style={{
          width: '3px',
          flexShrink: 0,
          borderRadius: '2px',
          backgroundColor: SPINE[c.category],
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            ...theme.typography.h3,
            fontSize: '14.5px',
            lineHeight: 1.25,
            color: theme.colors.txt.primary,
            // A class name has no natural break point and several are long
            // ("Jr/Teen Turns & Jumps 2"), so say the cell may break anywhere
            // rather than letting it push the row open.
            overflowWrap: 'anywhere',
          }}
        >
          {c.name}
        </div>

        {meta && (
          <div
            style={{
              ...theme.typography.caption,
              fontFamily: theme.fonts.primary,
              fontSize: '12px',
              lineHeight: 1.35,
              color: theme.colors.txt.secondary,
              marginTop: '2px',
              overflowWrap: 'anywhere',
            }}
          >
            {meta}
          </div>
        )}

        {tail && (
          <div
            style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.mono,
              fontSize: '10.5px',
              color: theme.colors.txt.tertiary,
              marginTop: '3px',
            }}
          >
            {tail}
          </div>
        )}
      </div>

      <svg
        width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
        style={{ flexShrink: 0, alignSelf: 'center' }}
      >
        <path
          d="M9 18l6-6-6-6"
          style={{ stroke: theme.colors.txt.tertiary }}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
};

// ------------------------------------------------------------------ headings

const SectionHeading: React.FC<{ text: string; count?: number; sticky?: boolean }> = ({
  text, count, sticky = false,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: '8px',
      padding: '10px 12px 8px',
      backgroundColor: theme.colors.bg.primary,
      ...(sticky
        ? {
            position: 'sticky',
            // Under the day strip, which is itself under the header. Both
            // offsets come from --portal-header-h so they cannot drift apart.
            top: 'calc(var(--portal-header-h, 56px) + 60px)',
            zIndex: 80,
          }
        : {}),
    }}
  >
    <span
      style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.mono,
        fontSize: '10.5px',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: theme.colors.txt.tertiary,
      }}
    >
      {text}
    </span>
    {count !== undefined && (
      <span
        style={{
          fontFamily: theme.fonts.mono,
          fontSize: '10.5px',
          color: theme.colors.txt.tertiary,
          opacity: 0.75,
        }}
      >
        {count}
      </span>
    )}
  </div>
);

const Divider = () => (
  <div
    aria-hidden="true"
    style={{
      height: '1px',
      // Inset to the start of the text, not the card edge — the standard list
      // divider, and it keeps the time rail reading as one column.
      margin: '0 12px 0 80px',
      backgroundColor: theme.colors.bdr.primary,
    }}
  />
);

/** Rows in one bordered block with hairline dividers, rather than N cards. */
const Block: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      backgroundColor: theme.colors.bg.secondary,
      border: `1px solid ${theme.colors.bdr.primary}`,
      borderRadius: theme.borderRadius.lg,
      overflow: 'hidden',
    }}
  >
    {children}
  </div>
);

const withDividers = (nodes: React.ReactNode[]): React.ReactNode[] =>
  nodes.flatMap((node, i) => (i === 0 ? [node] : [<Divider key={`d${i}`} />, node]));

// ------------------------------------------------------------------ timeline

interface Props {
  classes: PortalClass[];
  slug: ProgramSlug;
  /** True in "All" mode: group by weekday instead of by time of day. */
  byDay: boolean;
}

const ClassTimeline: React.FC<Props> = ({ classes, slug, byDay }) => {
  if (byDay) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {groupByDay(classes).map(group => (
          <section key={group.day === null ? 'none' : group.day}>
            <SectionHeading
              text={dayName(group.day) ?? 'No set day'}
              count={group.classes.length}
              sticky
            />
            <Block>
              {withDividers(group.classes.map(c => <Row key={c.id} klass={c} slug={slug} />))}
            </Block>
          </section>
        ))}
      </div>
    );
  }

  // One day, split into afternoon and evening. Twenty undifferentiated rows is
  // a wall; two runs of ten with a label on each is a schedule.
  const bands = TIME_BANDS
    .map(b => ({ band: b.value, items: classes.filter(c => timeBandOf(c.startTime) === b.value) }))
    .filter(g => g.items.length > 0);

  const unbanded = classes.filter(c => timeBandOf(c.startTime) === null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {bands.map(({ band, items }) => (
        <section key={band}>
          {/* Only worth a heading when there is more than one — a lone
              "EVENING" over the whole day says nothing. */}
          {bands.length > 1 && <SectionHeading text={BAND_LABEL[band]} count={items.length} />}
          <Block>{withDividers(items.map(c => <Row key={c.id} klass={c} slug={slug} />))}</Block>
        </section>
      ))}

      {unbanded.length > 0 && (
        <section>
          <SectionHeading text="No set time" count={unbanded.length} />
          <Block>{withDividers(unbanded.map(c => <Row key={c.id} klass={c} slug={slug} />))}</Block>
        </section>
      )}
    </div>
  );
};

export default ClassTimeline;
