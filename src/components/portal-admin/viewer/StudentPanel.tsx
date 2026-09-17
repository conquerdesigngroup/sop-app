import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../../../theme';
import { useResponsive } from '../../../hooks/useResponsive';
import { formatClassSchedule } from '../../../lib/portal';
import { Badge, Button, Card, ChevronLeftIcon, Spinner } from '../../ui';
import {
  STUDENT_ACCESS_BADGE,
  ViewerStudentProfile,
  ageFrom,
  familyLabel,
  loadStudentDetail,
  studentAccessLabel,
  studentFullName,
} from '../../../lib/portalViewer';
import { CategoryChips, ChipRow, DetailField } from './ViewerShared';

/**
 * One dancer's own record.
 *
 * WHY THIS EXISTS
 *
 * Every route into a child used to end on their FAMILY: tapping "Ava
 * Kettenbrink" in the dancer list, or that name on a class roster, opened a
 * screen headed with somebody else's and showing them as one card among three
 * siblings. For the question that sends staff here — "they say they can't see
 * their class" — that is the wrong altitude twice over: it hides which classes
 * are theirs, and it says nothing about whether THIS child has a login or is
 * relying on a parent's.
 *
 * WHAT IS ON IT, AND WHY NOT MORE
 *
 * Their identity (the name, the nickname, the date of birth that tells two Ava
 * Martinezes apart), whose child they are, how anybody gets in to see them, and
 * every class they are in — active and dropped. That is what the portal
 * actually holds about a child.
 *
 * Attendance is deliberately NOT here. It lives on /attendance with its own
 * per-session history, and a summary of it on this screen would be a second
 * answer to the same question, free to disagree with the first.
 *
 * READ-ONLY, like the rest of the Viewer. Enrollments come from the Enrolio
 * import and are corrected there. The two things staff can DO for this child —
 * give them a login, fix the family's email — are buttons through to the client
 * accounts page, which is the audited surface for both.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A date column stored as YYYY-MM-DD, which must not go through Date(). */
const plainDate = (value: string | null): string => {
  if (!value) return '—';
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  const month = MONTHS[Number(parts[1]) - 1];
  return month ? `${Number(parts[2])} ${month} ${parts[0]}` : value;
};

const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 style={{
    ...theme.typography.h3,
    fontFamily: theme.fonts.display,
    color: theme.colors.txt.primary,
    margin: `0 0 ${theme.spacing.sm}`,
  }}>
    {children}
  </h3>
);

const StudentPanel: React.FC<{
  studentId: string;
  today: Date;
  /** Where Back actually goes — a dancer can be opened from a class roster. */
  backLabel: string;
  onBack: () => void;
  onOpenHousehold: (id: string) => void;
}> = ({ studentId, today, backLabel, onBack, onOpenHousehold }) => {
  const { isMobileOrTablet } = useResponsive();

  const [detail, setDetail] = useState<ViewerStudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await loadStudentDetail(studentId);
    setDetail(result.detail);
    setError(result.error);
    setLoading(false);
  }, [studentId]);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <Spinner size={28} color={theme.colors.primary} />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <Card>
        <p style={{ ...theme.typography.body, fontFamily: theme.fonts.primary, margin: 0 }}>
          {error ?? 'That dancer could not be found.'}
        </p>
        <div style={{ marginTop: theme.spacing.md }}>
          <Button variant="secondary" size="sm" onClick={onBack}>{backLabel}</Button>
        </div>
      </Card>
    );
  }

  const { student, household, enrollments } = detail;
  const age = ageFrom(student.dateOfBirth, today);
  const access = studentAccessLabel(student);
  // Null until v57 is applied. Nothing is claimed about this child's access in
  // that case — no badge, no account card — rather than telling the owner they
  // have no login on the strength of a column that is not in the response.
  const accessKnown = student.ownLogins !== null || student.householdLogins !== null;
  const family = household
    ? (household.accountName?.trim() || familyLabel(household))
    : familyLabel({ name: student.householdName, email: student.householdEmail });

  return (
    <>
      <Button variant="ghost" size="sm" leftIcon={<ChevronLeftIcon size={16} />} onClick={onBack}>
        {backLabel}
      </Button>

      <Card style={{ marginTop: theme.spacing.sm }}>
        <h2 style={{
          ...theme.typography.h3,
          fontFamily: theme.fonts.display,
          color: theme.colors.txt.primary,
          margin: 0,
          overflowWrap: 'anywhere',
        }}>
          {studentFullName(student)}
        </h2>
        {/* What they are actually called, when the studio has recorded it and
            it is not simply their name again — the import fills display_name
            from the roster for some children, and "Goes by Maya Alvarez" under
            "Maya Alvarez" is a line that says nothing. */}
        {student.displayName &&
          student.displayName.trim().toLowerCase() !== studentFullName(student).toLowerCase() && (
          <p style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.tertiary,
            margin: `${theme.spacing.xs} 0 0`,
            overflowWrap: 'anywhere',
          }}>
            Goes by “{student.displayName}”
          </p>
        )}

        <ChipRow>
          {accessKnown && (
            <Badge variant={STUDENT_ACCESS_BADGE[access.state]} size="sm">{access.text}</Badge>
          )}
          <CategoryChips categories={student.categories} />
          {student.status !== 'active' && <Badge variant="warning" size="sm">Withdrawn</Badge>}
        </ChipRow>

        <div style={{
          display: 'grid',
          // Two columns where there is room, one where there is not — `auto-fit`
          // rather than a media query, so the 480–660px band is covered too.
          gridTemplateColumns: isMobileOrTablet ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: theme.spacing.md,
          marginTop: theme.spacing.md,
        }}>
          <DetailField label="Date of birth">
            {plainDate(student.dateOfBirth)}{age !== null ? ` · age ${age}` : ''}
          </DetailField>
          <DetailField label="Family">{family}</DetailField>
          <DetailField label="Active classes">{student.enrollmentCount}</DetailField>
          {/* The Enrolio id is the join key every import matches on, and the
              first thing to check when a child arrives twice or not at all. */}
          <DetailField label="Enrolio dancer">{student.externalStudentId ?? '—'}</DetailField>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          <Button variant="outline" size="sm" onClick={() => onOpenHousehold(student.householdId)}>
            Open the family
          </Button>
          <Link
            to={`/portal-admin/clients?q=${encodeURIComponent(student.ownLoginEmail ?? student.householdEmail)}`}
            style={{ textDecoration: 'none' }}
          >
            <Button variant="outline" size="sm">Login &amp; roster</Button>
          </Link>
        </div>
      </Card>

      {/* ---------------------------------------------------------- access */}
      {accessKnown && (
        <div style={{ marginTop: theme.spacing.lg }}>
          <SectionHeading>Portal access</SectionHeading>
          <Card padding="sm">
            {/* Three states, three different things to do about them — the same
                three the Families tab has shown since v48, asked about one
                child instead of a household. */}
            <p style={{
              ...theme.typography.body,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.primary,
              margin: 0,
              overflowWrap: 'anywhere',
            }}>
              {access.state === 'own'
                ? 'This dancer has their own login. It sees only them — never a sibling.'
                : access.state === 'family'
                  ? 'No login of their own. The family has signed up, so a parent can see their classes, photos and updates.'
                  : 'Nobody can see this dancer in the portal yet: no login of their own, and nobody in the family has signed up.'}
            </p>
            {student.ownLoginEmail && (
              <p style={{
                ...theme.typography.bodySmall,
                fontFamily: theme.fonts.mono,
                color: theme.colors.txt.tertiary,
                margin: `${theme.spacing.xs} 0 0`,
                overflowWrap: 'anywhere',
              }}>
                signs in as {student.ownLoginEmail}
              </p>
            )}
            {/* No button here: "Login & roster" above already goes to the one
                page that can change any of this, and two controls with the same
                destination on one screen is a choice that isn't one. Giving a
                dancer a login is an audited write; the Viewer does not write. */}
            <p style={{
              ...theme.typography.bodySmall,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.tertiary,
              margin: `${theme.spacing.sm} 0 0`,
            }}>
              {access.state === 'own'
                ? 'Change or remove it under Login & roster.'
                : access.state === 'family'
                  ? 'Login & roster can give this dancer an address of their own if they need one.'
                  : 'Login & roster is where you invite the family, or give this dancer a login of their own.'}
            </p>
          </Card>
        </div>
      )}

      {/* --------------------------------------------------------- classes */}
      <div style={{ marginTop: theme.spacing.lg }}>
        <SectionHeading>Classes</SectionHeading>

        {enrollments.length === 0 ? (
          <Card>
            <p style={{
              ...theme.typography.body,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.secondary,
              margin: 0,
            }}>
              Not enrolled in any class. Enrollments come from the Enrolio import.
            </p>
          </Card>
        ) : (
          <Card padding="sm">
            {enrollments.map((e, i) => {
              const when = formatClassSchedule(e.dayOfWeek, e.startTime, null);
              return (
                <div
                  key={e.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    alignItems: 'baseline',
                    padding: '8px 0',
                    borderTop: i === 0 ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
                  }}
                >
                  <span style={{
                    ...theme.typography.bodySmall,
                    fontFamily: theme.fonts.primary,
                    color: theme.colors.txt.primary,
                    // minWidth: 0 AND overflowWrap, because a class title is
                    // arbitrary text with nothing to break at.
                    flex: '1 1 160px',
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                  }}>
                    {e.className}
                  </span>
                  {when && (
                    <span style={{
                      ...theme.typography.captionSmall,
                      fontFamily: theme.fonts.mono,
                      color: theme.colors.txt.tertiary,
                    }}>
                      {when}
                    </span>
                  )}
                  {/* A dropped class stays on the screen: it is the only thing
                      that explains an attendance history with no class behind
                      it. Labelled, so it cannot be read as a current one. */}
                  {e.status !== 'active' && (
                    <Badge variant="warning" size="sm">
                      {e.status === 'dropped' && e.droppedOn
                        ? `Dropped ${plainDate(e.droppedOn)}`
                        : e.status}
                    </Badge>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </div>

      {/* No "read-only" footer here: the page itself already prints one under
          every panel, and two of them in a row reads as a bug. */}
    </>
  );
};

export default StudentPanel;
