import React from 'react';
import { theme } from '../../theme';
import { Card, Spinner } from '../ui';
import { AVATAR_PALETTE, initialsFrom } from '../../lib/avatarPalette';
import { overallPercent, studentLabel } from '../../lib/attendanceQueries';
import { clockTime, relativeDay } from '../../lib/upcomingClasses';
import { FIXTURE_TODAY } from '../../lib/attendanceFixture';
import { ProfileCardProps } from '../../lib/profileCards';
import ProfileAvatar from './ProfileAvatar';
import { useHousehold } from './useHousehold';

/**
 * Every dancer in the household on one screen.
 *
 * WHO THIS IS FOR
 *
 * Not the one-child family — for them this card says nothing the attendance
 * card does not, so it does not render at all. It is for the parent with three
 * kids in six classes, whose alternative is tapping through a switcher three
 * times to build a picture in their head. The registry's `visible` predicate is
 * what makes "does not render at all" cheap: no card, no query.
 *
 * COLOUR IS IDENTITY, NOT STATUS
 *
 * Each child keeps one colour, derived from their id so it never changes
 * between sessions. It is a way to find your kid in a list at a glance —
 * deliberately not a rating, which is the same reason the attendance bars are
 * coloured by dance style rather than by percentage.
 */

/** Stable per child, and stable across reloads: a hash of the id, not an index. */
const paletteFor = (studentId: string) => {
  let hash = 0;
  for (let i = 0; i < studentId.length; i += 1) {
    hash = (hash * 31 + studentId.charCodeAt(i)) % 100000;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
};

const HouseholdCard: React.FC<ProfileCardProps> = ({ ctx }) => {
  const { data, loading } = useHousehold(ctx.source);
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

  // Renders nothing on failure as well as for a one-child household. That is
  // deliberate and not a swallowed error: Up next and Attendance both sit above
  // this card and both announce the failure with a retry. A third copy of the
  // same message would be noise, and this card makes no claim when it is absent.
  if (!data || data.error || data.students.length < 2) return null;

  return (
    <Card>
      <h3 style={{
        ...theme.typography.h3,
        fontFamily: theme.fonts.display,
        color: theme.colors.txt.primary,
        margin: `0 0 ${theme.spacing.md}`,
      }}>
        Your dancers
      </h3>

      {data.perStudent.map(({ student, current }, index) => {
        const palette = paletteFor(student.id);
        const overall = overallPercent(current);
        const next = data.upcoming.find(u => u.student.id === student.id);

        return (
          <div
            key={student.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: `${theme.spacing.sm} 0`,
              borderTop: index === 0 ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
            }}
          >
            <ProfileAvatar
              config={{
                mode: 'initials',
                initials: initialsFrom(student.firstName, student.lastName),
                iconKey: 'star',
                paletteKey: palette.key,
              }}
              fallbackInitials={initialsFrom(student.firstName, student.lastName)}
              size={40}
            />

            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{
                ...theme.typography.body,
                fontFamily: theme.fonts.primary,
                fontWeight: 600,
                color: theme.colors.txt.primary,
                margin: '0 0 2px',
                overflowWrap: 'break-word',
              }}>
                {studentLabel(student)}
              </p>
              <p style={{
                ...theme.typography.captionSmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.tertiary,
                margin: 0,
                overflowWrap: 'anywhere',
              }}>
                {current.length === 0
                  ? 'No classes this season'
                  : next
                    // No "next" prefix: relativeDay already returns "Tonight"
                    // / "Tomorrow" / a weekday, and "next Tonight" is nonsense.
                    // Lowercasing it to fit the sentence turned Tuesday into a
                    // common noun, which is worse than the slightly terser line.
                    ? `${current.length} ${current.length === 1 ? 'class' : 'classes'} · ${relativeDay(next.startsAt, now)} ${clockTime(next.startsAt)}`
                    : `${current.length} ${current.length === 1 ? 'class' : 'classes'}`}
              </p>
            </div>

            {/* Raw numbers under the percentage here too — the same reason as on
                the attendance card: a bare percentage cannot be checked. */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{
                ...theme.typography.body,
                fontFamily: theme.fonts.mono,
                fontWeight: 700,
                color: overall.percent === null ? theme.colors.txt.tertiary : theme.colors.txt.primary,
                margin: 0,
              }}>
                {overall.percent === null ? '—' : `${overall.percent}%`}
              </p>
              <p style={{
                ...theme.typography.captionSmall,
                fontFamily: theme.fonts.mono,
                color: theme.colors.txt.tertiary,
                margin: 0,
              }}>
                {overall.counted === 0 ? 'no sessions' : `${overall.attended} of ${overall.counted}`}
              </p>
            </div>
          </div>
        );
      })}
    </Card>
  );
};

export default HouseholdCard;
