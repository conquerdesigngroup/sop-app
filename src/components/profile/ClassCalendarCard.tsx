import React from 'react';
import { theme } from '../../theme';
import { Button, Card, Spinner } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { classAccent } from '../../lib/attendanceColors';
import { studentLabel } from '../../lib/attendanceQueries';
import {
  UpcomingClass,
  buildSeriesIcs,
  clockTime,
  downloadIcs,
  googleSeriesUrl,
} from '../../lib/upcomingClasses';
import { ProfileCardProps } from '../../lib/profileCards';
import { useHousehold } from './useHousehold';

/**
 * Put my children's classes in my own calendar.
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

const ClassCalendarCard: React.FC<ProfileCardProps> = ({ ctx }) => {
  const toast = useToast();
  const { data, loading } = useHousehold(ctx.source);

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

  return (
    <Card>
      <h3 style={{
        ...theme.typography.h3,
        fontFamily: theme.fonts.display,
        color: theme.colors.txt.primary,
        margin: `0 0 ${theme.spacing.xs}`,
      }}>
        Add to your calendar
      </h3>

      <p style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.tertiary,
        margin: `0 0 ${theme.spacing.md}`,
        maxWidth: '46ch',
      }}>
        Adds the weekly class through to the end of the season. Dates the studio
        has already closed are left out.
      </p>

      {series.map((item, index) => (
        <div
          key={`${item.klass.id}-${item.student.id}`}
          style={{
            padding: `${theme.spacing.sm} 0`,
            borderTop: index === 0 ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.xs }}>
            <span
              aria-hidden="true"
              style={{
                width: '8px',
                height: '8px',
                borderRadius: theme.borderRadius.full,
                background: classAccent(item.klass),
                flexShrink: 0,
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
              <span style={{
                ...theme.typography.captionSmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.tertiary,
                display: 'block',
              }}>
                {showWho ? `${studentLabel(item.student)} · ` : ''}
                weekly, {clockTime(item.startsAt)}
              </span>
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            <Button variant="outline" size="sm" leftIcon={<CalendarGlyph />} onClick={() => addGoogle(item)}>
              Google
            </Button>
            <Button variant="ghost" size="sm" onClick={() => addFile(item)}>
              Apple / other
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
};

export default ClassCalendarCard;
