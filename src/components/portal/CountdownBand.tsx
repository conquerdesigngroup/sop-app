import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../../theme';
import { daysBetweenIso } from '../../lib/studioDate';
import { eventDayKey, formatEventDate, formatEventTime } from '../../lib/portal';
import { PortalEvent } from '../../types';

/**
 * The next thing on the calendar, with the number of days on it.
 *
 * WHY THIS IS NOT JUST ANOTHER CARD
 *
 * It was one — same border, same padding, same type as the announcement above
 * it and the three nav tiles below it, distinguished only by a small grey word
 * reading "Coming up". So the one item on the page with a deadline attached
 * looked exactly like the four items that do not, and the question a parent
 * actually arrives with — how long have I got — was left for them to work out
 * from a date.
 *
 * A number in the display face answers it before anything is read. Everything
 * else on the band is the same information as before; only the arithmetic is
 * new.
 *
 * THE DAY COUNT IS THE STUDIO'S, NOT THE READER'S
 *
 * "Three days until the recital" is a fact about the studio's calendar, so it
 * resolves in the studio's timezone — the argument in lib/studioDate.ts, and
 * the same rule the task badges and the push digest already follow. Resolving
 * it locally would make the same recital four days away for a grandparent
 * watching from Chicago at 10pm.
 *
 * daysBetweenIso is anchored at UTC, so no DST hour can leak in and turn a
 * seven-day gap into 6.96 rounded down to six.
 *
 * A RUNNING EVENT IS NOT A NEGATIVE NUMBER
 *
 * Competition weekends span days. On the Saturday of a Friday–Sunday event the
 * difference from the start is −1, which would render as "-1 days" or, worse,
 * be filtered out as past. It says ON NOW instead, and the page keeps showing
 * it until its LAST day is behind us — which is the same rule ProgramHome
 * already uses to decide the event is still coming up.
 */

interface CountdownBandProps {
  event: PortalEvent;
  /** Today at the studio, YYYY-MM-DD. Passed in so the page has one clock. */
  today: string;
  /** Where the band goes when tapped. */
  to: string;
}

/** All-day events read in UTC, timed events in local time — see lib/portal.ts. */
const describeWhen = (event: PortalEvent): string => {
  const date = formatEventDate(event.startsAt, event.isAllDay, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  return event.isAllDay ? date : `${date} · ${formatEventTime(event.startsAt, false)}`;
};

/**
 * What the left block says. Exported so it can be tested without a router.
 *
 * A word wherever a number would be worse: "0 days" is not how anyone says
 * today, and a countdown that has to be read as a quantity has already lost to
 * the date it replaced. `unit` is null for those, which is also what tells the
 * band to set the block smaller — see the comment at the render.
 */
export const countdownLabel = (
  today: string,
  event: Pick<PortalEvent, 'startsAt' | 'endsAt' | 'isAllDay'>,
): { headline: string; unit: string | null } => {
  const days = daysBetweenIso(today, eventDayKey(event.startsAt, event.isAllDay));

  if (days > 1) return { headline: String(days), unit: 'days' };
  if (days === 1) return { headline: 'Tmrw', unit: null };
  if (days === 0) return { headline: 'Today', unit: null };

  // Started before today. It is only on this page at all because its LAST day
  // has not passed — ProgramHome filters on exactly that — so it is running,
  // not overdue, and a negative number would be nonsense.
  return { headline: 'On now', unit: null };
};

const CountdownBand: React.FC<CountdownBandProps> = ({ event, today, to }) => {
  const [active, setActive] = useState(false);
  const { headline, unit } = countdownLabel(today, event);

  return (
    <Link
      to={to}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        backgroundColor: theme.colors.bg.secondary,
        border: `2px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
        // The one place on this page worth spending the accent: a 3px rule on
        // the item with a deadline. Everything else stays neutral, which is
        // what keeps this readable as "look here" rather than as decoration.
        borderLeft: `3px solid ${theme.colors.primary}`,
        borderRadius: theme.borderRadius.lg,
        padding: '16px 18px',
        textDecoration: 'none',
        transition: 'border-color 0.2s ease, transform 0.2s ease',
        transform: active ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Fixed width, so the title beside it starts in the same place whether
          the count is "3" or "Today" — a block that resizes with its content
          makes the whole band twitch as the days come down. */}
      <span style={{ width: '68px', flexShrink: 0, textAlign: 'left' }}>
        <span style={{
          display: 'block',
          fontFamily: theme.fonts.display,
          // Words are set smaller than digits: "Today" at 38px is wider than
          // the block and would either clip or force the band taller.
          fontSize: unit ? '38px' : '20px',
          lineHeight: 1,
          color: theme.colors.txt.primary,
        }}>
          {headline}
        </span>
        {unit && (
          <span style={{
            display: 'block',
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: theme.colors.txt.tertiary,
            marginTop: '4px',
          }}>
            {unit}
          </span>
        )}
      </span>

      {/* minWidth:0 AND overflowWrap: an event title is arbitrary studio text
          with no guaranteed break, and on a 320px phone this column is about
          150px wide. One without the other still overflows. */}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block',
          ...theme.typography.captionSmall,
          fontFamily: theme.fonts.mono,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: theme.colors.txt.tertiary,
          marginBottom: '4px',
        }}>
          Coming up
        </span>

        <span style={{
          display: 'block',
          ...theme.typography.h3,
          color: theme.colors.txt.primary,
          marginBottom: '4px',
          overflowWrap: 'anywhere',
        }}>
          {event.title}
        </span>

        <span style={{
          display: 'block',
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.secondary,
          overflowWrap: 'anywhere',
        }}>
          {describeWhen(event)}
          {event.location ? ` · ${event.location}` : ''}
        </span>
      </span>

      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
        <path
          d="M9 18l6-6-6-6"
          style={{ stroke: theme.colors.txt.tertiary }}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
};

export default CountdownBand;
