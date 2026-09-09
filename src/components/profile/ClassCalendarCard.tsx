import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { theme } from '../../theme';
import { Button, Card, Spinner } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { classAccent } from '../../lib/attendanceColors';
import { studentLabel } from '../../lib/attendanceQueries';
import { dayName, portalRoutes, programSlugForCategory } from '../../lib/portal';
import {
  UpcomingClass,
  buildSeriesIcs,
  clockTime,
  downloadIcs,
  googleSeriesUrl,
  nextDateLabel,
} from '../../lib/upcomingClasses';
import { FIXTURE_TODAY } from '../../lib/attendanceFixture';
import { ProfileCardProps } from '../../lib/profileCards';
import { useHousehold } from './useHousehold';
import CollapsibleCard from './CollapsibleCard';

/**
 * Every class my children are in: open it, or put it in my own calendar.
 *
 * THE ROSTER FIRST, THE EXPORT SECOND
 *
 * This started as a calendar card and the calendar is now the smaller half of
 * it. A family's enrolments are the one list the dashboard can state exactly —
 * "Ava is in these four, Leo is in these two" — and the schedule pages, which
 * list the whole studio, cannot. So each row is a way through to the class's
 * own page, the same page the All-Star and Academy schedules link to, reached
 * without first knowing which section the class is filed under.
 *
 * The section is derived from the class's category (see
 * programSlugForCategory). The enrolment view carries a category and no
 * program id, and adding one would mean a migration to a view every family
 * reads — for a link that the categories already answer.
 *
 * THE WHOLE SEASON, NOT THE NEXT LESSON
 *
 * A weekly class added one week at a time is fourteen taps now and fourteen
 * deletions when the class moves. One recurring event is what a calendar is
 * for, so both routes here emit an RRULE that runs to the end of the season —
 * `buildSeriesIcs` for anything reading .ics, and Google's `recur` parameter
 * for the majority who are on Google.
 *
 * Known closures ride along as EXDATEs. A studio that has already marked the
 * mid-season shutdown should not still be putting forty families in the car,
 * and the session table already knows which dates those are.
 *
 * WHY NOT REUSE useAddToCalendar
 *
 * It is the right tool for a one-off studio event and speaks PortalEvent, which
 * has no notion of recurrence — a class series cannot be expressed in it
 * without inventing a field on a shared type that only this card would set.
 * The occurrence-to-PortalEvent bridge still lives in upcomingClasses, so a
 * future "add just this week" button is a one-line change.
 */

const CalendarGlyph: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path
      d="M8 2v4 M16 2v4 M3 10h18 M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

const ChevronGlyph: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The dot, the name and the when — the part of a row that identifies the class.
 *
 * Shared between the linked and unlinked forms so the two cannot drift apart
 * visually. A class whose category names no section is not a link: there is
 * nowhere honest to send the tap, and a link that lands on "class not found"
 * is worse than a line of text.
 */
const ClassLine: React.FC<{
  item: UpcomingClass;
  showWho: boolean;
  linked: boolean;
  now: Date;
}> = ({ item, showWho, linked, now }) => {
  const day = dayName(item.klass.dayOfWeek);
  // "Mondays, 4:00 PM". `dayOfWeek` is never null on a row that got this far —
  // nextPerClass cannot project an occurrence without one — but the type allows
  // it, and "weekly" is the honest fallback rather than a blank.
  const recurrence = `${day ? `${day}s` : 'weekly'}, ${clockTime(item.startsAt)}`;

  return (
    <>
      <span
        aria-hidden="true"
        style={{
          width: '8px',
          height: '8px',
          borderRadius: theme.borderRadius.full,
          background: classAccent(item.klass),
          flexShrink: 0,
          // The dot used to centre against a two-line row and now sits beside a
          // three-line one, where centred reads as floating. Aligned to the name
          // it labels instead; 6px is the cap height of bodySmall.
          alignSelf: 'flex-start',
          marginTop: '6px',
        }}
      />
      <span style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}>
        <span style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          fontWeight: 600,
          color: theme.colors.txt.primary,
        }}>
          {item.klass.name}
        </span>

        {/* The recurrence. "weekly" on its own was true and useless — a parent
            who cannot see WHICH day cannot check the row against their week, so
            five classes at four different times read as an unsorted list. */}
        <span style={{
          ...theme.typography.captionSmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          display: 'block',
        }}>
          {showWho ? `${studentLabel(item.student)} · ` : ''}{recurrence}
        </span>

        {/* And the date it actually lands on next, which is what the class page
            was being opened for. It is the projection the row is sorted by, so
            the order is legible from the rows themselves — and it already has
            the studio's known closures subtracted, which a parent counting
            Mondays forward on their own calendar does not. */}
        <span style={{
          ...theme.typography.captionSmall,
          fontFamily: theme.fonts.mono,
          color: theme.colors.txt.secondary,
          display: 'block',
          marginTop: '2px',
        }}>
          Next {nextDateLabel(item.startsAt, now)}
        </span>
      </span>
      {linked && (
        <span aria-hidden="true" style={{
          color: theme.colors.txt.tertiary,
          display: 'flex',
          alignSelf: 'center',
        }}>
          <ChevronGlyph />
        </span>
      )}
    </>
  );
};

const ClassCalendarCard: React.FC<ProfileCardProps> = ({ ctx }) => {
  // Recorded on each class link so the class page's back arrow returns to the
  // dashboard. Without it the page fell back to /portal/<slug>/classes — a
  // program page a parent who tapped a class here had never opened.
  const { pathname } = useLocation();
  const toast = useToast();
  const { data, loading } = useHousehold(ctx.source);
  // The fixture's dates are seeded around FIXTURE_TODAY, so a demo read against
  // the wall clock would date every row months out. Same pairing as UpNextCard.
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

  const series = data?.series ?? [];
  if (series.length === 0) return null;

  const showWho = (data?.students.length ?? 0) > 1;

  const addGoogle = (item: UpcomingClass) => {
    window.open(googleSeriesUrl(item), '_blank', 'noopener,noreferrer');
    toast.info('Opening Google Calendar — press Save there to keep it.');
  };

  const addFile = (item: UpcomingClass) => {
    try {
      const ics = buildSeriesIcs(item, data?.cancelledByClass[item.klass.id] ?? []);
      downloadIcs(`${item.klass.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`, ics);
      toast.success('Calendar file saved — open it to add the classes.');
    } catch (err) {
      console.error('Class series .ics failed:', err);
      toast.error('Could not create the calendar file.');
    }
  };

  /**
   * Shut by default (see CollapsibleCard). Even as a roster this is the
   * longest card on the dashboard — six classes is six names and twelve
   * buttons — and it answers a question ("which classes are we in, and where
   * is that one's page") that a parent asks deliberately, not on the way past.
   * "Up next" is what they see without opening anything.
   */
  return (
    <CollapsibleCard id="calendar" title="Your classes">
      <p style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.tertiary,
        margin: `0 0 ${theme.spacing.md}`,
        maxWidth: '46ch',
      }}>
        Tap a class for its details, updates and files. Adding to a calendar
        takes the weekly class through to the end of the season, leaving out
        dates the studio has already closed.
      </p>

      {series.map((item, index) => {
        const slug = programSlugForCategory(item.klass.category);

        /* The buttons cannot live inside the anchor — a button nested in a
           link is invalid and swallows its own clicks — so the class line is
           the link and they sit under it, exactly as the schedule rows do. */
        return (
          <div
            key={`${item.klass.id}-${item.student.id}`}
            style={{
              padding: `${theme.spacing.sm} 0`,
              borderTop: index === 0 ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
            }}
          >
            {slug ? (
              <Link
                to={portalRoutes.classDetail(slug, item.klass.id)}
                state={{ backTo: pathname }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  // Two lines of text is already close to a thumb's worth; the
                  // padding takes it past 44px without moving the row apart,
                  // because the margin below gives it back.
                  padding: `${theme.spacing.xs} 0`,
                  margin: `0 0 ${theme.spacing.xs}`,
                  textDecoration: 'none',
                  minWidth: 0,
                }}
              >
                <ClassLine item={item} showWho={showWho} linked now={now} />
              </Link>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.sm,
                marginBottom: theme.spacing.xs,
                minWidth: 0,
              }}>
                <ClassLine item={item} showWho={showWho} linked={false} now={now} />
              </div>
            )}

            {/* Named per class. Five rows of "Google" is five identical
                buttons to anyone reading the page rather than looking at it. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<CalendarGlyph />}
                onClick={() => addGoogle(item)}
                aria-label={`Add ${item.klass.name} to Google Calendar`}
              >
                Google
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => addFile(item)}
                aria-label={`Download ${item.klass.name} for Apple or another calendar`}
              >
                Apple / other
              </Button>
            </div>
          </div>
        );
      })}
    </CollapsibleCard>
  );
};

export default ClassCalendarCard;
