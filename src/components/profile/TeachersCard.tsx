import React, { useMemo } from 'react';
import { theme } from '../../theme';
import { Card } from '../ui';
import { ClassProgress } from '../../lib/attendanceQueries';
import { instructorKey, lookFor } from '../../lib/instructorLook';
import { splitInstructorNames } from '../../lib/instructorMatch';
import { ProfileCardProps } from '../../lib/profileCards';
import { usePortal } from '../../contexts/PortalContext';
import ProfileAvatar from './ProfileAvatar';
import { useHousehold } from './useHousehold';

/**
 * Who actually teaches this family, with the classes each of them takes.
 *
 * WHY IT COSTS NOTHING
 *
 * Every fact on this card is already on screen elsewhere and already paid for.
 * `instructor_name` has been in ENROLLMENT_COLUMNS since the attendance view
 * existed, so the shared household read carries it; the teacher marks come from
 * PortalContext, which fetches portal_instructor_looks once per portal session
 * for the schedule. This card issues no request of its own — it is a second
 * reading of data three other cards already hold.
 *
 * A NAME IS NOT A PERSON, AND THIS FIELD ROUTINELY HOLDS SEVERAL
 *
 * portal_classes.instructor_name is free text and often a list — "Chill Kerney,
 * Ky'ree Nevels", and on the Saturday production four of them. Splitting is not
 * optional cleanup: taking the whole string as one teacher gives that pair the
 * initials CN, which is not either of them but an invented third person,
 * printed next to their real names. splitInstructorNames is the same split
 * TeacherAvatar and the bulk-assign matcher already use.
 *
 * Grouped by instructorKey — normalizeName — for the same reason the looks
 * table is keyed that way: "Ky'Ree" and "Kyree" are one teacher with one
 * colour, not two rows that happen to look similar.
 *
 * NO PHOTOGRAPHS HERE
 *
 * Staff photographs exist now (lib/staffPhoto.ts) and are deliberately not on
 * this card. They live in a bucket readable only by is_active_staff(), because
 * the decision was staff-app-only. A parent-facing surface gets the mark, which
 * is what TeacherAvatar has always drawn.
 */

interface Teacher {
  /** normalizeName — the identity. */
  key: string;
  /** The spelling the schedule uses, which is what a parent will recognise. */
  name: string;
  classNames: string[];
}

const collectTeachers = (enrollments: ClassProgress[]): Teacher[] => {
  const byKey = new Map<string, Teacher>();

  enrollments.forEach(row => {
    splitInstructorNames(row.klass.instructorName).forEach(name => {
      const key = instructorKey(name);
      if (!key) return;

      const existing = byKey.get(key);
      if (existing) {
        // A class can appear once per child. The family does not need to be
        // told twice that Miss Sarah takes Junior Ballet.
        if (!existing.classNames.includes(row.klass.name)) {
          existing.classNames.push(row.klass.name);
        }
        return;
      }
      byKey.set(key, { key, name, classNames: [row.klass.name] });
    });
  });

  // Most classes first: the teacher a family sees three times a week is the one
  // they are looking for. Ties broken by name so the order is stable between
  // renders rather than dependent on Map insertion.
  // Array.from rather than a spread: the build targets an ES version whose
  // iterator protocol TypeScript will not downlevel without a compiler flag,
  // and changing tsconfig for one line is the wrong trade.
  return Array.from(byKey.values()).sort(
    (a, b) => b.classNames.length - a.classNames.length || a.name.localeCompare(b.name),
  );
};

const TeachersCard: React.FC<ProfileCardProps> = ({ ctx }) => {
  const { data, loading } = useHousehold(ctx.source);
  const { instructorLooks } = usePortal();

  const teachers = useMemo(
    () => (data ? collectTeachers(data.perStudent.flatMap(p => p.current)) : []),
    [data],
  );

  // No skeleton, and nothing on failure — the same call SeasonStatsCard makes.
  // Up next and Attendance both already announce a failed household read with a
  // retry, and a third copy of that message is noise. Absent makes no claim.
  if (loading || !data || data.error) return null;

  // A family whose classes carry no instructor name gets no card rather than an
  // empty one. The catalogue is imported and the column is genuinely blank for
  // some classes, which is a fact about the import, not about the family.
  if (teachers.length === 0) return null;

  return (
    <Card>
      <h3 style={{
        ...theme.typography.h3,
        fontFamily: theme.fonts.display,
        color: theme.colors.txt.primary,
        margin: `0 0 ${theme.spacing.md}`,
      }}>
        Your teachers
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        {teachers.map((teacher, index) => (
          <div
            key={teacher.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: `${theme.spacing.sm} 0`,
              borderTop: index === 0 ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
            }}
          >
            <ProfileAvatar
              config={lookFor(teacher.name, instructorLooks)}
              fallbackInitials="·"
              size={40}
            />

            {/* minWidth:0 with overflowWrap, both. A flex item will not shrink
                below its content's min-content width, and a class list like
                "Contemporary Foundations" has nothing to break at — one without
                the other still overflows a 320px phone (CLAUDE.md). */}
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{
                ...theme.typography.body,
                fontFamily: theme.fonts.primary,
                fontWeight: 600,
                color: theme.colors.txt.primary,
                margin: '0 0 2px',
                overflowWrap: 'anywhere',
              }}>
                {teacher.name}
              </p>
              <p style={{
                ...theme.typography.captionSmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.tertiary,
                margin: 0,
                overflowWrap: 'anywhere',
              }}>
                {teacher.classNames.join(' · ')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default TeachersCard;
