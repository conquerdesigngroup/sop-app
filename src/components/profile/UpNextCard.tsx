import React from 'react';
import { theme } from '../../theme';
import { Card, Spinner } from '../ui';
import { classAccent } from '../../lib/attendanceColors';
import { studentLabel } from '../../lib/attendanceQueries';
import { UpcomingClass, clockTime, relativeDay } from '../../lib/upcomingClasses';
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
      }}>
        {relativeDay(item.startsAt, now)} · {clockTime(item.startsAt)}
        {item.endsAt ? ` – ${clockTime(item.endsAt)}` : ''}
      </p>

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

const UpNextCard: React.FC<ProfileCardProps> = ({ ctx }) => {
  const { data, loading, error, reload } = useHousehold(ctx.source);

  // The fixture's season is fixed in 2026 so the demo stays stable; live data
  // is measured against the real clock.
  const now = ctx.source.source === 'fixture' ? FIXTURE_TODAY : new Date();

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
