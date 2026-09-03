import React, { useEffect, useMemo, useState } from 'react';
import { theme } from '../../theme';
import { Card, Spinner } from '../ui';
import { AttendanceRange } from '../../types/attendance';
import { classAccent } from '../../lib/attendanceColors';
import { dayName, formatTime } from '../../lib/portal';
import {
  AttendanceSource,
  ClassProgress,
  LoadError,
  RANGE_LABELS,
  loadStudentProgress,
  studentLabel,
} from '../../lib/attendanceQueries';
import AttendanceProgress from './AttendanceProgress';
import AttendanceDetail from './AttendanceDetail';
import CardError from './CardError';
import SegmentedControl from './SegmentedControl';
import { useHousehold } from './useHousehold';

/**
 * The attendance summary card (§6.1).
 *
 * WHAT THIS CARD IS ACTUALLY FOR
 *
 * A parent opens it to answer one question — "has my kid been going?" — and the
 * honest answer is a fraction, not a grade. So: one row per active enrollment,
 * a bar coloured by discipline, the percentage, and the raw count beside it.
 * No ranking between siblings, no streaks, no praise or blame.
 *
 * THE EMPTY STATES ARE THE FEATURE
 *
 * On the day this ships, every household sees an empty state, because the first
 * Enrolio import has not run. §6.1 names four and all four are handled here and
 * in AttendanceProgress. None of them uses error styling: nothing has gone
 * wrong when a season has not started.
 */

interface AttendanceCardProps {
  source: AttendanceSource;
}

const chevron = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** "Ballet · Tue 4:30 PM" — omits whatever the catalogue is missing. */
const classMeta = (progress: ClassProgress): string => {
  const parts: string[] = [];
  if (progress.klass.style) parts.push(progress.klass.style);

  const day = dayName(progress.klass.dayOfWeek);
  const time = formatTime(progress.klass.startTime);
  if (day && time) parts.push(`${day.slice(0, 3)} ${time}`);
  else if (day) parts.push(day);

  return parts.join(' · ');
};

const EmptyNote: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div style={{ padding: `${theme.spacing.lg} 0`, textAlign: 'left' }}>
    <p style={{
      ...theme.typography.body,
      fontFamily: theme.fonts.primary,
      fontWeight: 600,
      color: theme.colors.txt.primary,
      margin: '0 0 4px',
    }}>
      {title}
    </p>
    <p style={{
      ...theme.typography.bodySmall,
      fontFamily: theme.fonts.primary,
      color: theme.colors.txt.tertiary,
      margin: 0,
      maxWidth: '46ch',
    }}>
      {body}
    </p>
  </div>
);

const ClassRow: React.FC<{
  progress: ClassProgress;
  muted?: boolean;
  onOpen: () => void;
}> = ({ progress, muted, onOpen }) => {
  const accent = classAccent(progress.klass);
  const meta = classMeta(progress);
  const { percent } = progress.summary;

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        borderRadius: theme.borderRadius.md,
        padding: `${theme.spacing.sm} 0`,
        cursor: 'pointer',
        opacity: muted ? 0.72 : 1,
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: theme.spacing.sm,
        marginBottom: '2px',
      }}>
        {/* minWidth:0 + overflowWrap let a long class name wrap instead of
            pushing the percentage off the right edge on a 320px phone. */}
        <span style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}>
          <span style={{
            ...theme.typography.body,
            fontFamily: theme.fonts.primary,
            fontWeight: 600,
            color: theme.colors.txt.primary,
          }}>
            {progress.klass.name}
          </span>
        </span>

        <span style={{
          ...theme.typography.body,
          fontFamily: theme.fonts.mono,
          fontWeight: 700,
          color: percent === null ? theme.colors.txt.tertiary : theme.colors.txt.primary,
          flexShrink: 0,
        }}>
          {percent === null ? '—' : `${percent}%`}
        </span>

        <span style={{ color: theme.colors.txt.tertiary, flexShrink: 0, display: 'flex' }}>
          {chevron}
        </span>
      </div>

      {meta && (
        <p style={{
          ...theme.typography.captionSmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          margin: '0 0 8px',
        }}>
          {meta}
        </p>
      )}

      <AttendanceProgress summary={progress.summary} accent={accent} />
    </button>
  );
};

const AttendanceCard: React.FC<AttendanceCardProps> = ({ source }) => {
  const [range, setRange] = useState<AttendanceRange>('season');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: ClassProgress[]; past: ClassProgress[] } | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<ClassProgress | null>(null);

  const sourceKey = source.source === 'fixture' ? source.scenario : 'live';

  // The roster comes from the SHARED household read, not a second copy of it.
  // This card used to re-query portal_students and portal_household_members
  // itself on every mount and every range toggle — data the rest of the page
  // had already loaded and cached.
  const household = useHousehold(source);

  // Memoised because `?? []` is a fresh array each render, which would make the
  // `selected` memo below recompute continuously.
  const students = useMemo(() => household.data?.students ?? [], [household.data]);
  const showSwitcher = household.data?.memberType === 'guardian' && students.length > 1;
  const selected = useMemo(
    () => students.find(s => s.id === studentId) ?? students[0] ?? null,
    [students, studentId],
  );

  const selectedId = selected?.id ?? null;

  useEffect(() => {
    if (!selectedId) {
      setProgress(null);
      setLoading(household.loading);
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadStudentProgress(source, selectedId, range).then(next => {
      if (cancelled) return;
      setProgress({ current: next.current, past: next.past });
      setError(next.error);
      setLoading(false);
    });

    return () => { cancelled = true; };
    // `source` is rebuilt each render by the parent; sourceKey is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, selectedId, range, attempt, household.loading]);

  // Switching scenarios can strand a studentId that no longer exists.
  useEffect(() => { setStudentId(null); }, [sourceKey]);

  const retry = () => {
    household.reload();
    setAttempt(n => n + 1);
  };

  const body = () => {
    // Error BEFORE every empty state. Each empty state below is a confident
    // sentence about a real family — "no dancers linked", "no classes this
    // season" — and rendering one of those because a request failed tells a
    // parent something false about their own child.
    const failure = household.error ?? error;
    if (failure) return <CardError message={failure} onRetry={retry} />;

    if (loading && !progress) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: theme.spacing.xl }}>
          <Spinner size={24} color={theme.colors.primary} />
        </div>
      );
    }

    // Empty state 1: signed in, but no child is attached to this household yet.
    // Deliberately not an error — the roster import runs on the studio's clock.
    if (!students.length) {
      return (
        <EmptyNote
          title="No dancers linked yet"
          body="Enrollment details are still syncing from the studio. Classes and attendance will appear here once they arrive — nothing is missing on your end."
        />
      );
    }

    // Empty state 2: a child on file with nothing enrolled this season.
    if (!progress?.current.length && !progress?.past.length) {
      return (
        <EmptyNote
          title="No classes this season"
          body={`${selected ? studentLabel(selected) : 'This dancer'} isn’t enrolled in any classes right now. Registrations made through the studio show up here automatically.`}
        />
      );
    }

    return (
      <>
        {progress.current.map(row => (
          <ClassRow
            key={row.enrollment.id}
            progress={row}
            onOpen={() => setOpen(row)}
          />
        ))}

        {!progress.current.length && (
          <EmptyNote
            title="No classes this season"
            body="Past classes are still below, with their history intact."
          />
        )}

        {progress.past.length > 0 && (
          <div style={{ marginTop: theme.spacing.md }}>
            <p style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.mono,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: theme.colors.txt.tertiary,
              margin: `0 0 ${theme.spacing.xs}`,
              paddingTop: theme.spacing.sm,
              borderTop: `1px solid ${theme.colors.bdr.primary}`,
            }}>
              Past classes
            </p>
            {/* Past enrollments deliberately ignore the range filter — they are
                loaded with range 'all'. Clipping a class that finished in March
                to "this month" would render every past row as "No sessions
                yet", which reads as data loss rather than as a filter doing its
                job. Saying so is cheaper than the confusion of a row whose
                numbers do not move when the filter does. */}
            <p style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.tertiary,
              margin: `0 0 ${theme.spacing.xs}`,
            }}>
              Full history, whichever period is selected above.
            </p>
            {progress.past.map(row => (
              <ClassRow
                key={row.enrollment.id}
                progress={row}
                muted
                onOpen={() => setOpen(row)}
              />
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <Card>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.md,
      }}>
        <h3 style={{
          ...theme.typography.h3,
          fontFamily: theme.fonts.display,
          color: theme.colors.txt.primary,
          margin: 0,
        }}>
          Attendance
        </h3>
        <SegmentedControl
          options={RANGE_LABELS}
          value={range}
          onChange={setRange}
          ariaLabel="Attendance period"
        />
      </div>

      {showSwitcher && (
        <div style={{ marginBottom: theme.spacing.md }}>
          <SegmentedControl
            options={students.map(s => ({ value: s.id, label: studentLabel(s) }))}
            value={selected?.id ?? students[0].id}
            onChange={setStudentId}
            ariaLabel="Choose dancer"
          />
        </div>
      )}

      {body()}

      {open && selected && (
        <AttendanceDetail
          source={source}
          student={selected}
          progress={open}
          onClose={() => setOpen(null)}
        />
      )}
    </Card>
  );
};

export default AttendanceCard;
