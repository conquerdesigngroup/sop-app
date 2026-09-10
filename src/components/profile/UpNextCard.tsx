import React, { useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Card, Spinner } from '../ui';
import { classAccent } from '../../lib/attendanceColors';
import { studentLabel } from '../../lib/attendanceQueries';
import { UpcomingClass, clockTime, relativeDay, liveProgress } from '../../lib/upcomingClasses';
import { FIXTURE_TODAY } from '../../lib/attendanceFixture';
import { ProfileCardProps } from '../../lib/profileCards';
import CardError from './CardError';
import { useHousehold } from './useHousehold';

/**
 * What is on next, across every child in the household.
 *
 * THIS IS THE MOST-READ THING ON THE PAGE
 *
 * Attendance answers "did they go?", which a parent wonders about roughly once
 * a month. This answers "where do they need to be?", which is asked three times
 * a week, usually in a car, usually late. So it sits above attendance, leads
 * with the time rather than the class name, and says the room out loud.
 *
 * MERGED, NOT GROUPED BY CHILD
 *
 * A family with three dancers is not asking for three schedules. They are
 * asking who needs to be out of the door first. One chronological list answers
 * that; three per-child lists make the parent do the merge themselves.
 *
 * WHAT TO BRING LIVES HERE, NOT ON A CARD OF ITS OWN
 *
 * Ballet shoes and a hair bun are only ever needed in the twenty minutes before
 * a specific class. A standalone "what to bring" card would be read once in
 * March and never again; attached to tonight's class it is read every time it
 * matters.
 */

const PinIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path
      d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 13a3 3 0 100-6 3 3 0 000 6z"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

const Meta: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    ...theme.typography.captionSmall,
    fontFamily: theme.fonts.primary,
    color: theme.colors.txt.tertiary,
  }}>
    {children}
  </span>
);

/** The imminent one, given room to breathe. */
const Headline: React.FC<{ item: UpcomingClass; showWho: boolean; now: Date }> = ({ item, showWho, now }) => {
  const accent = classAccent(item.klass);
  const progress = liveProgress(item, now);

  return (
    <div style={{
      borderLeft: `3px solid ${accent}`,
      paddingLeft: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    }}>
      <p style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.mono,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: accent,
        margin: '0 0 2px',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '6px',
      }}>
        {progress === null ? (
          <>
            {relativeDay(item.startsAt, now)} · {clockTime(item.startsAt)}
            {item.endsAt ? ` – ${clockTime(item.endsAt)}` : ''}
          </>
        ) : (
          <>
            {/* The dot is decoration; the words are the state. Reduced motion
                freezes the dot solid, and this line still says On now. */}
            <span
              className="live-dot"
              aria-hidden="true"
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: theme.colors.status.success,
                flexShrink: 0,
              }}
            />
            On now{item.endsAt ? ` · ends ${clockTime(item.endsAt)}` : ''}
          </>
        )}
      </p>

      {progress !== null && (
        <div
          aria-hidden="true"
          style={{
            height: '2px',
            borderRadius: theme.borderRadius.full,
            backgroundColor: theme.colors.bdr.primary,
            overflow: 'hidden',
            margin: '0 0 6px',
          }}
        >
          <div style={{
            width: `${Math.round(progress * 100)}%`,
            height: '100%',
            backgroundColor: accent,
            // Matches AttendanceProgress, so the two bars on this page move
            // the same way rather than each having their own idea.
            transition: 'width 240ms ease',
          }} />
        </div>
      )}

      <p style={{
        ...theme.typography.h3,
        fontFamily: theme.fonts.display,
        color: theme.colors.txt.primary,
        margin: '0 0 4px',
        overflowWrap: 'break-word',
      }}>
        {item.klass.name}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.xs }}>
        {showWho && <Meta>{studentLabel(item.student)}</Meta>}
        {item.klass.location && <Meta><PinIcon />{item.klass.location}</Meta>}
        {item.klass.instructorName && <Meta>with {item.klass.instructorName}</Meta>}
      </div>

      {/* Null means the studio never filled it in — say nothing rather than
          implying nothing is needed. An empty array would mean the opposite. */}
      {item.klass.whatToBring && item.klass.whatToBring.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
          <span style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            alignSelf: 'center',
          }}>
            BRING
          </span>
          {item.klass.whatToBring.map(thing => (
            <span
              key={thing}
              style={{
                ...theme.typography.captionSmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.secondary,
                border: `1px solid ${theme.colors.bdr.primary}`,
                borderRadius: theme.borderRadius.full,
                padding: '3px 10px',
              }}
            >
              {thing}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

/** Everything after the first, compressed to one line each. */
const Row: React.FC<{ item: UpcomingClass; showWho: boolean; now: Date }> = ({ item, showWho, now }) => (
  <div style={{
    display: 'flex',
    alignItems: 'baseline',
    gap: theme.spacing.sm,
    padding: '8px 0',
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  }}>
    <span style={{
      ...theme.typography.captionSmall,
      fontFamily: theme.fonts.mono,
      color: theme.colors.txt.tertiary,
      flexShrink: 0,
      minWidth: '84px',
    }}>
      {relativeDay(item.startsAt, now)}
    </span>

    <span style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}>
      <span style={{
        ...theme.typography.bodySmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.primary,
      }}>
        {item.klass.name}
      </span>
      {showWho && (
        <span style={{
          ...theme.typography.captionSmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
        }}>
          {' · '}{studentLabel(item.student)}
        </span>
      )}
    </span>

    <span style={{
      ...theme.typography.captionSmall,
      fontFamily: theme.fonts.mono,
      color: theme.colors.txt.tertiary,
      flexShrink: 0,
    }}>
      {clockTime(item.startsAt)}
    </span>
  </div>
);

/** How long before a class starts the card begins watching the clock. */
const WATCH_FROM_MS = 2 * 60 * 60 * 1000;
/** How often it re-reads it once inside that window. */
const TICK_MS = 30 * 1000;

const UpNextCard: React.FC<ProfileCardProps> = ({ ctx }) => {
  const { data, loading, error, reload } = useHousehold(ctx.source);
  const [tick, setTick] = useState(0);

  const isFixture = ctx.source.source === 'fixture';

  // The fixture's season is fixed in 2026 so the demo stays stable; live data
  // is measured against the real clock. `tick` is what re-reads it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = React.useMemo(() => (isFixture ? FIXTURE_TODAY : new Date()), [isFixture, tick]);

  const first = data?.upcoming?.[0];
  const startMs = first ? first.startsAt.getTime() : null;
  const endMs = first?.endsAt ? first.endsAt.getTime() : null;

  /**
   * A clock, but only while there is something for it to change.
   *
   * "On now" and the bar under it are only true for the length of one class,
   * so an interval running all day would re-render this card ~2,800 times to
   * be useful for sixty minutes of them. Instead: nothing at all until two
   * hours before the class, a single timeout to wake up at that point, then a
   * tick every thirty seconds, and a full stop once the class has ended.
   *
   * The fixture never ticks. Its "today" is pinned so the demo stays stable,
   * and a clock that moves against a frozen date would drift the demo out of
   * shape rather than keep it honest.
   */
  useEffect(() => {
    if (isFixture || startMs === null) return undefined;

    const nowMs = Date.now();
    const opens = startMs - WATCH_FROM_MS;
    // A minute past the end, so the last tick lands after "On now" is false
    // and the card settles on the next class rather than on a stale bar.
    const closes = (endMs ?? startMs) + 60 * 1000;

    if (nowMs > closes) return undefined;

    if (nowMs < opens) {
      // setTimeout saturates past ~24.8 days and would fire immediately, which
      // would spin. Clamped, so a class next week wakes up once and re-checks.
      const wait = Math.min(opens - nowMs, 2 ** 31 - 1);
      const timer = setTimeout(() => setTick(t => t + 1), wait);
      return () => clearTimeout(timer);
    }

    const timer = setInterval(() => setTick(t => t + 1), TICK_MS);
    return () => clearInterval(timer);
    // `tick` is a dependency on purpose: each tick re-evaluates the window, so
    // the interval stops itself once the class is over instead of running for
    // as long as the dashboard is open.
  }, [isFixture, startMs, endMs, tick]);

  if (loading) {
    return (
      <Card>
        <div style={{ display: 'flex', justifyContent: 'center', padding: theme.spacing.lg }}>
          <Spinner size={20} color={theme.colors.primary} />
        </div>
      </Card>
    );
  }

  const upcoming = data?.upcoming ?? [];
  const showWho = (data?.students.length ?? 0) > 1;

  return (
    <Card>
      <h3 style={{
        ...theme.typography.h3,
        fontFamily: theme.fonts.display,
        color: theme.colors.txt.primary,
        margin: `0 0 ${theme.spacing.md}`,
      }}>
        Up next
      </h3>

      {error ? (
        // "Nothing scheduled" is a statement about this family's week. It must
        // never be what a failed request looks like.
        <CardError message={error} onRetry={reload} />
      ) : upcoming.length === 0 ? (
        <p style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          margin: 0,
          maxWidth: '46ch',
        }}>
          Nothing scheduled. Classes appear here as soon as the season starts —
          there is nothing you need to do.
        </p>
      ) : (
        <>
          <Headline item={upcoming[0]} showWho={showWho} now={now} />
          {upcoming.slice(1).map(item => (
            <Row key={`${item.klass.id}-${item.date}-${item.student.id}`} item={item} showWho={showWho} now={now} />
          ))}
        </>
      )}
    </Card>
  );
};

export default UpNextCard;
