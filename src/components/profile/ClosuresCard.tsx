import React, { useEffect, useMemo, useState } from 'react';
import { theme } from '../../theme';
import { Card } from '../ui';
import { ProfileCardProps } from '../../lib/profileCards';
import {
  StudioClosure,
  closureDateLabel,
  daysUntil,
  isUpcoming,
  loadStudioClosures,
  seasonEndLabel,
} from '../../lib/studioClosures';
import SeasonRibbon from './SeasonRibbon';
import { useHousehold } from './useHousehold';

/**
 * When the studio is shut, and when the season ends.
 *
 * THE TWO QUESTIONS THE FRONT DESK ANSWERS MOST
 *
 * Both answers were already in the database and neither was on any screen a
 * parent could reach. "Are you open over Christmas" is a fortnight's closure
 * this season; "when does the season finish" is one date every family asks
 * about once and then asks again.
 *
 * ONLY WHAT IS STILL AHEAD
 *
 * A closure that has finished is history, and a card of history is a card
 * nobody reads twice. One that is UNDER WAY stays, because "we are closed this
 * week" is the single most useful thing this card can say — see LOOKBACK_DAYS
 * in lib/studioClosures.
 *
 * IT COSTS ONE QUERY, WHICH IS ONE MORE THAN THE CARDS AROUND IT
 *
 * Season end rides on the household read the rest of the dashboard already
 * shares, but the closures live in portal_events, which nothing on this page
 * loads. That is a real cost and it buys the answer to a question that is
 * currently a phone call to the front desk.
 *
 * WHAT THIS CARD DOES NOT DO, AND MUST NOT BE READ AS DOING
 *
 * It does not change the schedule. "Your classes" and the calendar export
 * still project straight through these dates, because they subtract closures
 * from portal_class_sessions and the studio records them in the calendar
 * instead — see the header of lib/studioClosures. So a family can currently
 * read "closed 21 Dec – 3 Jan" here and a class date inside that range above.
 * Surfacing the closure is strictly better than the silence it replaces, and
 * the projection is the next fix, not this one.
 */

const MAX_SHOWN = 3;

const Row: React.FC<{ closure: StudioClosure; now: Date; first: boolean }> = ({
  closure,
  now,
  first,
}) => {
  const days = daysUntil(closure, now);
  // "in 11 weeks" is a unit nobody plans in; past about a month the date is
  // the useful thing and the countdown is noise.
  const note = days < 0 ? 'On now' : days === 0 ? 'Starts today' : days <= 14 ? `In ${days} day${days === 1 ? '' : 's'}` : null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
      padding: `${theme.spacing.sm} 0`,
      borderTop: first ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
    }}>
      {/* minWidth:0 with overflowWrap, both: a flex item will not shrink below
          its content's min-content width, and a title like "Closed for
          Thanksgiving Holiday" has to be allowed to break. */}
      <span style={{ minWidth: 0, flex: '1 1 160px' }}>
        <span style={{
          ...theme.typography.body,
          fontFamily: theme.fonts.primary,
          fontWeight: 600,
          color: theme.colors.txt.primary,
          overflowWrap: 'anywhere',
        }}>
          {closure.title}
        </span>
      </span>

      <span style={{
        ...theme.typography.bodySmall,
        fontFamily: theme.fonts.mono,
        color: theme.colors.txt.secondary,
        whiteSpace: 'nowrap',
      }}>
        {closureDateLabel(closure)}
      </span>

      {note && (
        <span style={{
          ...theme.typography.captionSmall,
          fontFamily: theme.fonts.primary,
          color: days < 0 ? theme.colors.status.warning : theme.colors.txt.tertiary,
          whiteSpace: 'nowrap',
        }}>
          {note}
        </span>
      )}
    </div>
  );
};

const ClosuresCard: React.FC<ProfileCardProps> = ({ ctx }) => {
  const { data } = useHousehold(ctx.source);
  const [closures, setClosures] = useState<StudioClosure[] | null>(null);

  // A stable clock for the whole render, so a row cannot say "In 1 day" while
  // the one beside it has already ticked over.
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let cancelled = false;
    loadStudioClosures(now).then(({ closures: next }) => {
      // A failed read leaves this null and the card renders nothing. The other
      // cards on this page already announce a broken connection; a second
      // notice about the holiday list is noise.
      if (!cancelled) setClosures(next);
    });
    return () => { cancelled = true; };
  }, [now]);

  // The family's own last day, not the studio's: a household whose classes all
  // finish in March should not be told the building is open until June.
  const season = useMemo(() => {
    const rows = (data?.perStudent ?? []).flatMap(p => p.current);
    const ends = rows.map(r => r.klass.seasonEnd).filter((v): v is string => !!v);
    const starts = rows.map(r => r.klass.seasonStart).filter((v): v is string => !!v);
    return {
      // The family's own last day, not the studio's: a household whose classes
      // all finish in March should not be told the building is open until June.
      end: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null,
      start: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null,
    };
  }, [data]);

  const seasonEnd = season.end;

  // The list is what is still ahead; the ribbon is the whole season, including
  // closures already behind us — a Christmas notch has to stay on the bar in
  // March or the picture loses its shape as the year goes on.
  const shown = (closures ?? []).filter(c => isUpcoming(c, now)).slice(0, MAX_SHOWN);

  // Nothing to say, so nothing is said. A card headed "Closures" with "none
  // scheduled" under it is a card that makes a promise about a calendar the
  // studio has not finished filling in.
  if (!shown.length && !seasonEnd) return null;

  return (
    <Card>
      <h3 style={{
        ...theme.typography.h3,
        fontFamily: theme.fonts.display,
        color: theme.colors.txt.primary,
        margin: `0 0 ${theme.spacing.sm}`,
      }}>
        Closures &amp; season
      </h3>

      {shown.map((closure, index) => (
        <Row key={`${closure.title}-${closure.firstDay}`} closure={closure} now={now} first={index === 0} />
      ))}

      {seasonEnd && (
        <p style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          margin: `${theme.spacing.sm} 0 0`,
          paddingTop: shown.length ? theme.spacing.sm : 0,
          borderTop: shown.length ? `1px solid ${theme.colors.bdr.primary}` : 'none',
        }}>
          Your classes run to <strong style={{ color: theme.colors.txt.secondary }}>{seasonEndLabel(seasonEnd)}</strong>.
        </p>
      )}

      {/* Needs both ends and is silent without them, rather than inventing a
          start date and drawing a bar that means nothing. */}
      {season.start && season.end && (
        <SeasonRibbon
          seasonStart={season.start}
          seasonEnd={season.end}
          closures={closures ?? []}
          now={now}
        />
      )}
    </Card>
  );
};

export default ClosuresCard;
