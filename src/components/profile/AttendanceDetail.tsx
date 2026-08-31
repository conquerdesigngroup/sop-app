import React, { useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Modal, Spinner } from '../ui';
import { SessionAttendance, Student } from '../../types/attendance';
import { classAccent } from '../../lib/attendanceColors';
import {
  AttendanceSource,
  ClassProgress,
  LoadError,
  loadAttendanceDetail,
  studentLabel,
} from '../../lib/attendanceQueries';
import CardError from './CardError';

/**
 * The session-by-session view behind a class (§6.2).
 *
 * WHY EXCLUDED SESSIONS ARE SHOWN RATHER THAN HIDDEN
 *
 * A cancelled class could simply be dropped from this list — the denominator
 * already ignores it. Showing it, struck through and labelled, is what makes
 * the summary card's fraction checkable: a parent who counts eleven Tuesdays on
 * the calendar and reads "9 of 10" needs to see the tenth Tuesday sitting there
 * marked "studio closed" or the number looks like a bug. Every subtraction from
 * the denominator is visible here, including the ones made on the child's
 * behalf: sessions before they joined, sessions after they left, and excused
 * absences.
 */

interface AttendanceDetailProps {
  source: AttendanceSource;
  student: Student;
  progress: ClassProgress;
  onClose: () => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** '2026-08-11' → 'Tue 11 Aug'. Parsed by hand: `new Date('2026-08-11')` is UTC
 *  and renders as the 10th for anyone west of Greenwich. */
const formatDay = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
  return `${weekday} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
};

const monthKey = (iso: string): string => {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

interface Mark {
  label: string;
  /** Null renders a hollow ring — used for absence, which needs no colour. */
  dot: string | null;
  muted: boolean;
  strike: boolean;
}

const describe = (entry: SessionAttendance, accent: string): Mark => {
  if (entry.excludedReason === 'cancelled' || entry.excludedReason === 'closed') {
    return {
      label: entry.session.note || (entry.excludedReason === 'cancelled' ? 'Class cancelled' : 'Studio closed'),
      dot: null,
      muted: true,
      strike: true,
    };
  }
  if (entry.excludedReason === 'before-enrollment') {
    return { label: 'Before joining', dot: null, muted: true, strike: true };
  }
  if (entry.excludedReason === 'after-drop') {
    return { label: 'After leaving', dot: null, muted: true, strike: true };
  }
  if (entry.excludedReason === 'excused') {
    return { label: 'Excused', dot: theme.colors.status.info, muted: true, strike: false };
  }

  switch (entry.status) {
    case 'present': return { label: 'Present', dot: accent, muted: false, strike: false };
    case 'late': return { label: 'Late', dot: theme.colors.status.warning, muted: false, strike: false };
    case 'absent': return { label: 'Absent', dot: null, muted: false, strike: false };
    default: return { label: 'Not marked', dot: null, muted: true, strike: false };
  }
};

const AttendanceDetail: React.FC<AttendanceDetailProps> = ({ source, student, progress, onClose }) => {
  const [rows, setRows] = useState<SessionAttendance[] | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [attempt, setAttempt] = useState(0);
  const accent = classAccent(progress.klass);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    loadAttendanceDetail(source, student.id, progress.klass.id).then(next => {
      if (cancelled) return;
      setRows(next.rows);
      setError(next.error);
    });
    return () => { cancelled = true; };
  }, [source, student.id, progress.klass.id, attempt]);

  const { attended, counted, percent } = progress.summary;

  const groups: { month: string; entries: SessionAttendance[] }[] = [];
  (rows ?? []).forEach(entry => {
    const key = monthKey(entry.session.sessionDate);
    const last = groups[groups.length - 1];
    if (last && last.month === key) last.entries.push(entry);
    else groups.push({ month: key, entries: [entry] });
  });

  return (
    <Modal isOpen onClose={onClose} title={progress.klass.name} size="md">
      <p style={{
        ...theme.typography.bodySmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.tertiary,
        margin: `0 0 ${theme.spacing.md}`,
      }}>
        {studentLabel(student)}
        {' · '}
        {counted === 0
          ? 'No sessions yet'
          : `${attended} of ${counted} classes${percent === null ? '' : ` · ${percent}%`}`}
      </p>

      {error ? (
        // Without this branch a failed load fell through to "This class hasn't
        // met yet" — a factual claim about the class, made because the network
        // failed.
        <CardError message={error} onRetry={() => setAttempt(n => n + 1)} />
      ) : rows === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: theme.spacing.xl }}>
          <Spinner size={24} color={theme.colors.primary} />
        </div>
      ) : rows.length === 0 ? (
        <p style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          margin: 0,
        }}>
          This class hasn’t met yet. Sessions appear here after the studio records the first one.
        </p>
      ) : (
        groups.map(group => (
          <div key={group.month} style={{ marginBottom: theme.spacing.md }}>
            <p style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.mono,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: theme.colors.txt.tertiary,
              margin: `0 0 ${theme.spacing.xs}`,
            }}>
              {group.month}
            </p>

            {group.entries.map(entry => {
              const mark = describe(entry, accent);
              return (
                <div
                  key={entry.session.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                    padding: '10px 0',
                    borderBottom: `1px solid ${theme.colors.bdr.primary}`,
                    opacity: mark.muted ? 0.6 : 1,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '9px',
                      height: '9px',
                      borderRadius: theme.borderRadius.full,
                      flexShrink: 0,
                      background: mark.dot ?? 'transparent',
                      border: mark.dot ? 'none' : `1.5px solid ${theme.colors.bdr.secondary}`,
                    }}
                  />

                  <span style={{
                    ...theme.typography.bodySmall,
                    fontFamily: theme.fonts.mono,
                    color: theme.colors.txt.secondary,
                    textDecoration: mark.strike ? 'line-through' : 'none',
                    flexShrink: 0,
                  }}>
                    {formatDay(entry.session.sessionDate)}
                  </span>

                  {/* The label can be a studio's free-text closure note, so it
                      needs both minWidth:0 and overflowWrap to stay inside a
                      narrow phone. One without the other still overflows. */}
                  <span style={{
                    ...theme.typography.bodySmall,
                    fontFamily: theme.fonts.primary,
                    color: theme.colors.txt.tertiary,
                    marginLeft: 'auto',
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                    textAlign: 'right',
                  }}>
                    {mark.label}
                    {mark.muted && !mark.strike && (
                      <span style={{ display: 'block', fontSize: '11px' }}>not counted</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ))
      )}

      <p style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.tertiary,
        margin: 0,
        paddingTop: theme.spacing.sm,
      }}>
        Cancelled classes and any sessions before joining are left out of the total, so they never
        count against a dancer.
      </p>
    </Modal>
  );
};

export default AttendanceDetail;
