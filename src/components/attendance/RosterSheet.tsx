import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from '../../theme';
import { AttendanceStatus } from '../../types/attendance';
import { ClassDay, RosterEntry, loadRoster, markAttendance } from '../../lib/attendanceStaff';
import { useRefreshable } from '../../contexts/RefreshContext';
import { Button, Spinner } from '../ui';
import { StatusChip, StatusPills } from './StatusControl';

/**
 * Taking attendance for one class on one date.
 *
 * WHY MARKS SAVE THEMSELVES INSTEAD OF WAITING FOR A SAVE BUTTON
 *
 * The failure this replaces is a teacher marking thirty children, being called
 * away, and losing all of it. A Save button makes that failure possible and
 * makes it the teacher's fault. So a tap updates the screen immediately and a
 * batched write follows a moment later, which also collapses "mark all present
 * then fix four" into one request instead of thirty-four.
 *
 * The debounce is what makes that safe rather than chatty: rapid taps coalesce,
 * and the RPC counts a re-mark of the same value as unchanged, so scrolling
 * back through a finished list writes nothing.
 *
 * NEVER GO QUIET (CLAUDE.md, slow taps)
 *
 * There is always a word for the current state — Saving, All saved, or a
 * failure with a way to retry — in a role="status" line, because a control that
 * silently returns to how it looked before the tap is exactly what people tap
 * again. The marks are never disabled while a save is in flight: they are local
 * state, they are correct on screen, and freezing the list mid-class to wait
 * for studio wifi would be the worst possible moment to do it.
 */

const SAVE_DELAY_MS = 700;

interface Props {
  day: ClassDay;
  /** Closes the roster and returns to the day list. */
  onBack: () => void;
  /** So the day list can update its "12 of 14" chip without a full reload. */
  onCountChange: (marked: number) => void;
  readOnly?: boolean;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

const RosterSheet: React.FC<Props> = ({ day, onBack, onCountChange, readOnly }) => {
  const [rows, setRows] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });

  // Changes made but not yet written. Kept in a ref so the debounced flush
  // always sees the latest set without being re-created on every keystroke.
  const pending = useRef<Map<string, AttendanceStatus>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => () => {
    alive.current = false;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { rows: fetched, error } = await loadRoster(day.klass.id, day.session.id, day.session.sessionDate);
    if (!alive.current) return;
    setLoadError(error);
    if (!error) setRows(fetched);
    setLoading(false);
    if (error) throw new Error(error);
  }, [day.klass.id, day.session.id, day.session.sessionDate]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const reload = useCallback(() => load(true), [load]);
  useRefreshable(reload, true);

  const flush = useCallback(async () => {
    const batch = Array.from(pending.current.entries())
      .map(([studentId, status]) => ({ studentId, status }));
    if (batch.length === 0) return;

    // Clear BEFORE the await so marks made during the request are not dropped
    // on success. They stay in the map and the next flush picks them up.
    pending.current = new Map();
    setSave({ kind: 'saving' });

    const { error } = await markAttendance(day.session.id, batch);
    if (!alive.current) return;

    if (error) {
      // Put them back so a retry sends everything that never landed.
      batch.forEach(m => {
        if (!pending.current.has(m.studentId)) pending.current.set(m.studentId, m.status);
      });
      setSave({ kind: 'error', message: error });
      return;
    }
    setSave({ kind: 'saved', at: Date.now() });
  }, [day.session.id]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { flush().catch(() => {}); }, SAVE_DELAY_MS);
  }, [flush]);

  const pick = useCallback((studentId: string, status: AttendanceStatus) => {
    setRows(prev => {
      const next = prev.map(r => (r.studentId === studentId ? { ...r, status } : r));
      onCountChange(next.filter(r => r.status !== null).length);
      return next;
    });
    pending.current.set(studentId, status);
    setOpenId(null);
    schedule();
  }, [onCountChange, schedule]);

  /**
   * The bulk action that makes this usable.
   *
   * Most classes are "everyone came" plus two exceptions, so typing thirty
   * Presents by hand is the difference between a tool a teacher uses and one
   * they abandon. It only fills the BLANKS — a dancer already marked absent is
   * left alone, because the alternative silently overwrites a decision that was
   * made on purpose.
   */
  const markRemainingPresent = useCallback(() => {
    setRows(prev => {
      const next = prev.map(r => {
        if (r.status !== null) return r;
        pending.current.set(r.studentId, 'present');
        return { ...r, status: 'present' as AttendanceStatus };
      });
      onCountChange(next.filter(r => r.status !== null).length);
      return next;
    });
    schedule();
  }, [onCountChange, schedule]);

  const unmarked = rows.filter(r => r.status === null).length;
  const marked = rows.length - unmarked;

  const saveLine = (): { text: string; tone: string } => {
    switch (save.kind) {
      case 'saving': return { text: 'Saving…', tone: theme.colors.txt.tertiary };
      case 'saved': return { text: 'All saved', tone: theme.colors.status.success };
      case 'error': return { text: save.message, tone: theme.colors.status.error };
      default: return { text: '', tone: theme.colors.txt.tertiary };
    }
  };
  const line = saveLine();

  if (loading) {
    return (
      <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center', marginBottom: theme.spacing.md }}>
        <Button variant="secondary" size="sm" onClick={onBack}>← Classes</Button>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <div style={{
            fontWeight: 700,
            color: theme.colors.txt.primary,
            overflowWrap: 'anywhere',
          }}>
            {day.klass.name}
          </div>
          <div style={{ fontSize: '0.8rem', color: theme.colors.txt.tertiary }}>
            {marked} of {rows.length} marked
          </div>
        </div>
      </div>

      {loadError && (
        <div role="alert" style={{
          padding: theme.spacing.md,
          borderRadius: theme.borderRadius.lg,
          border: `2px solid ${theme.colors.status.error}`,
          color: theme.colors.txt.primary,
          marginBottom: theme.spacing.md,
        }}>
          {loadError}
        </div>
      )}

      {!readOnly && unmarked > 0 && rows.length > 0 && (
        <Button
          variant="primary"
          onClick={markRemainingPresent}
          style={{ width: '100%', marginBottom: theme.spacing.md }}
        >
          Mark the remaining {unmarked} present
        </Button>
      )}

      {/*
        aria-live so the outcome of a tap is announced, not just drawn. The
        height is reserved whether or not there is a message, so the list does
        not jump under a thumb the moment a save resolves.
      */}
      <div
        role="status"
        aria-live="polite"
        style={{
          minHeight: 22,
          fontSize: '0.85rem',
          fontWeight: 600,
          color: line.tone,
          marginBottom: theme.spacing.sm,
          overflowWrap: 'anywhere',
        }}
      >
        {line.text}
        {save.kind === 'error' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { flush().catch(() => {}); }}
            style={{ marginLeft: theme.spacing.sm }}
          >
            Try again
          </Button>
        )}
      </div>

      {rows.length === 0 && !loadError && (
        <div style={{ padding: theme.spacing.lg, color: theme.colors.txt.tertiary, textAlign: 'center' }}>
          Nobody is enrolled in this class on this date.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
        {rows.map(row => {
          const open = openId === row.studentId;
          return (
            <div
              key={row.studentId}
              style={{
                background: theme.colors.bg.secondary,
                border: `2px solid ${open ? theme.colors.bdr.secondary : theme.colors.bdr.primary}`,
                borderRadius: theme.borderRadius.lg,
                padding: theme.spacing.sm,
              }}
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : row.studentId)}
                aria-expanded={open}
                disabled={readOnly}
                style={{
                  width: '100%',
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing.sm,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.txt.primary,
                  cursor: readOnly ? 'default' : 'pointer',
                  textAlign: 'left',
                }}
              >
                {/*
                  minWidth:0 AND overflowWrap — a flex item will not shrink below
                  its content's min-content width, and a long surname has nothing
                  to break at. One without the other still overflows (CLAUDE.md).
                */}
                <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>
                  {row.firstName} {row.lastName}
                </span>
                <StatusChip value={row.status} />
              </button>

              {open && !readOnly && (
                <StatusPills value={row.status} onPick={s => pick(row.studentId, s)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RosterSheet;
