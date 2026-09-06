import React from 'react';
import { theme } from '../../theme';

/**
 * A row of big numbers.
 *
 * WHY FLEX AND NOT A GRID
 *
 * A grid with `repeat(auto-fit, minmax(…, 1fr))` wraps correctly but leaves the
 * odd tile alone in a half-empty row, which on a phone is where two of three of
 * these land. Flex wraps the same way and then lets the stranded tile GROW to
 * fill its row, so three tiles read as two small and one wide rather than as a
 * gap. No breakpoint, no media query, and no arrangement in which a tile can
 * overflow: the basis is a suggestion, not a minimum, and `minWidth: 0` lets a
 * long label break rather than push.
 *
 * THE BASIS IS 120 BECAUSE 96 LANDED EXACTLY ON THE BOUNDARY
 *
 * A card on a 375px phone leaves about 300px inside its padding, and three
 * 96px tiles plus two gaps is 304 — so they very nearly fitted, squeezed into
 * one row, and every label broke raggedly across three lines ("of 25 so /
 * far"). 120 puts three tiles decisively over a phone's width and comfortably
 * inside the 720px column on a laptop, which is the arrangement each was
 * designed for.
 *
 * TEXT IS NOT SHRUNK TO FIT
 *
 * `overflowWrap: 'anywhere'` on the label together with `minWidth: 0` on the
 * tile — one without the other still overflows on a 320px screen, which is the
 * failure CLAUDE.md documents. A label is arbitrary studio text and there is no
 * width at which it is guaranteed to break on its own.
 */

export interface Stat {
  key: string;
  /** The headline. An em dash is a legitimate value — see SeasonStatsCard. */
  value: string;
  /** What the number is. Lower case: it is a sentence fragment, not a heading. */
  label: string;
  /** An optional qualifier, e.g. "of 38 so far". */
  note?: string;
}

export const StatTiles: React.FC<{ stats: Stat[] }> = ({ stats }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
    {stats.map(stat => (
      <div
        key={stat.key}
        style={{
          flex: '1 1 120px',
          minWidth: 0,
          background: theme.colors.bg.tertiary,
          border: `1px solid ${theme.colors.bdr.primary}`,
          borderRadius: theme.borderRadius.md,
          padding: `${theme.spacing.sm} ${theme.spacing.sm}`,
        }}
      >
        <div
          /* index.css's count-up: a short fade and rise on mount, frozen under
             prefers-reduced-motion like every other animation in this app. */
          className="stat-number"
          style={{
            fontFamily: theme.fonts.display,
            fontSize: '28px',
            lineHeight: 1.05,
            color: theme.colors.txt.primary,
            marginBottom: '4px',
          }}
        >
          {stat.value}
        </div>

        <div style={{
          ...theme.typography.captionSmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.secondary,
          overflowWrap: 'anywhere',
        }}>
          {stat.label}
        </div>

        {stat.note && (
          <div style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            marginTop: '2px',
            overflowWrap: 'anywhere',
          }}>
            {stat.note}
          </div>
        )}
      </div>
    ))}
  </div>
);

export default StatTiles;
