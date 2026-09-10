import React from 'react';
import { theme } from '../../theme';
import { StudioClosure } from '../../lib/studioClosures';

/**
 * The season as one bar: where it starts, where it ends, where today is, and
 * every date the studio is shut bitten out of it.
 *
 * WHY A PICTURE EARNS ITS PLACE HERE
 *
 * The card above it is a list of dates, and a list of dates answers "when is
 * the Christmas break" but not "how much of the year is left after it". The
 * shape does: a fortnight missing from December is a visible bite, and the
 * three months between it and the end are a visible run. That is the question
 * a parent is actually asking when they ask about the season.
 *
 * NO PERCENTAGE, DELIBERATELY
 *
 * "3% through" is the obvious label and it is the wrong one — on the second
 * week of September it reads as a countdown barely started, which is
 * discouraging and is not what anybody wanted to know. The marker says where
 * today is without scoring it.
 *
 * PERCENTAGES, NOT AN SVG
 *
 * The bar has to survive 320px to a desktop card, and an SVG scaled with
 * preserveAspectRatio="none" distorts its own stroke widths — a 2px marker
 * becomes 5px on a wide screen. Absolutely positioned children in a relative
 * box scale exactly, and a notch is then a plain div.
 *
 * IT IS ONE IMAGE TO A SCREEN READER
 *
 * A row of unlabelled divs is noise read aloud, so the whole thing carries a
 * single sentence and its parts are hidden.
 */

const DAY_MS = 86400000;

/** 'YYYY-MM-DD' -> local Date. `new Date(key)` parses as UTC and slips a day. */
const fromKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key: string): string => {
  const d = fromKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

interface SeasonRibbonProps {
  /** 'YYYY-MM-DD'. */
  seasonStart: string;
  seasonEnd: string;
  closures: StudioClosure[];
  now: Date;
}

const BAR_HEIGHT = 10;
const MARKER_HEIGHT = 18;

const SeasonRibbon: React.FC<SeasonRibbonProps> = ({ seasonStart, seasonEnd, closures, now }) => {
  const start = fromKey(seasonStart).getTime();
  const end = fromKey(seasonEnd).getTime();
  const span = end - start;

  // A season that does not move is not a bar. Guards a bad import rather than
  // dividing by zero and painting NaN% across the card.
  if (!(span > 0)) return null;

  const pct = (t: number) => Math.max(0, Math.min(100, ((t - start) / span) * 100));

  const todayPct = pct(fromKey(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  ).getTime());

  const inSeason = closures.filter(c => {
    const a = fromKey(c.firstDay).getTime();
    const b = fromKey(c.lastDay).getTime();
    return b >= start && a <= end;
  });

  const label = [
    `Season from ${monthLabel(seasonStart)} to ${monthLabel(seasonEnd)}.`,
    inSeason.length
      ? `${inSeason.length} closure${inSeason.length === 1 ? '' : 's'}: ${inSeason.map(c => c.title).join(', ')}.`
      : 'No closures scheduled.',
  ].join(' ');

  return (
    <div style={{ marginTop: theme.spacing.md }}>
      <div
        role="img"
        aria-label={label}
        style={{ position: 'relative', height: `${MARKER_HEIGHT}px` }}
      >
        {/* The season. overflow hidden so a closure at either end is clipped
            to the bar's rounded corner instead of overhanging it. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${(MARKER_HEIGHT - BAR_HEIGHT) / 2}px`,
            height: `${BAR_HEIGHT}px`,
            borderRadius: theme.borderRadius.full,
            // bdr.secondary, not bg.tertiary. The tertiary background is eight
            // values off the card it sits on and the bar simply did not read
            // as an object — measured on the contact sheet before this. The
            // three levels have to be plainly separable, because the whole
            // point of the picture is the DARK notches cut out of the track.
            backgroundColor: theme.colors.bdr.secondary,
            overflow: 'hidden',
          }}
        >
          {/* Elapsed. A sliver in September and most of the bar by May, which
              is the point — it is the only part that changes on its own. */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${todayPct}%`,
            // Opacity rather than an alpha suffix: these tokens are CSS
            // variables and `${token}70` does not parse (CLAUDE.md).
            backgroundColor: theme.colors.txt.tertiary,
            opacity: 0.45,
          }} />

          {inSeason.map(closure => {
            const a = pct(fromKey(closure.firstDay).getTime());
            const b = pct(fromKey(closure.lastDay).getTime() + DAY_MS);
            return (
              <div
                key={`${closure.title}-${closure.firstDay}`}
                title={closure.title}
                style={{
                  position: 'absolute',
                  left: `${a}%`,
                  width: `${Math.max(b - a, 0)}%`,
                  // A single closed day is a third of one percent — about a
                  // pixel on a phone, which is nothing. The floor is what
                  // makes Memorial Day visible beside a fortnight at
                  // Christmas without pretending it is as long.
                  minWidth: '3px',
                  top: 0,
                  bottom: 0,
                  // The page's own background, so a closure reads as a gap cut
                  // out of the season rather than a third colour on it.
                  backgroundColor: theme.colors.bg.primary,
                }}
              />
            );
          })}
        </div>

        {/* Today. The one piece of electric on this card, and the whole reason
            the bar is worth looking at. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${todayPct}%`,
            top: 0,
            height: `${MARKER_HEIGHT}px`,
            width: '2px',
            // Pulled back by its own width so the line sits ON the date rather
            // than a marker's width past it — visible at either extreme, where
            // 0% and 100% would otherwise hang off the end.
            transform: 'translateX(-1px)',
            backgroundColor: theme.colors.primary,
            borderRadius: theme.borderRadius.full,
          }}
        />
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        marginTop: '6px',
      }}>
        {[monthLabel(seasonStart), monthLabel(seasonEnd)].map((text, i) => (
          <span key={text + i} style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            whiteSpace: 'nowrap',
          }}>
            {text}
          </span>
        ))}
      </div>
    </div>
  );
};

export default SeasonRibbon;
