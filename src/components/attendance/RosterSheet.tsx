import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from '../../theme';
import { AttendanceStatus, SessionStatus } from '../../types/attendance';
import {
  ClassDay, RosterEntry, cancelSession, loadRoster, markAttendance, restoreSession,
} from '../../lib/attendanceStaff';
import { useRefreshable } from '../../contexts/RefreshContext';
import { Button, Input, Modal, Spinner } from '../ui';
import { StatusChip, StatusPills } from './StatusControl';
import { shortDay } from './RecordsControls';

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
  /** Told when the date is cancelled or un-cancelled, so the list behind can say so. */
  onStatusChange?: (status: SessionStatus, note: string | null) => void;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

/** The RPC's messages carry no full stop; the sentence after them needs one. */
const sentence = (s: string): string => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

type Pending =
  | { kind: 'idle' }
  | { kind: 'busy'; what: string }
  | { kind: 'error'; message: string };

const RosterSheet: React.FC<Props> = ({ day, onBack, onCountChange, onStatusChange }) => {
  // The sheet owns the date's status once open: cancelling here must lock the
  // marks at once, and undoing must unlock them, without waiting on the page.
  const [status, setStatus] = useState<SessionStatus>(day.session.status);
  const [note, setNote] = useState<string | null>(day.session.note);
  const readOnly = status !== 'held';
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [change, setChange] = useState<Pending>({ kind: 'idle' });
  const [cancelSummary, setCancelSummary] = useState<string | null>(null);
  const changing = useRef(false);
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
  // The save currently on the wire, so leaving can wait for it.
  const inFlight = useRef<Promise<unknown> | null>(null);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);

  useEffect(() => () => {
    alive.current = false;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Stale-response guard: cancel and undo each re-read the roster, and the two
  // answers can arrive in either order.
  const loadRequest = useRef(0);

  const load = useCallback(async (silent = false) => {
    const mine = ++loadRequest.current;
    if (!silent) setLoading(true);
    const { rows: fetched, error } = await loadRoster(day.klass.id, day.session.id, day.session.sessionDate);
    if (!alive.current || mine !== loadRequest.current) return;
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

    const request = markAttendance(day.session.id, batch);
    inFlight.current = request;
    const { error } = await request;
    if (inFlight.current === request) inFlight.current = null;
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

  /**
   * Back, without losing the last few taps.
   *
   * Marks wait SAVE_DELAY_MS before they are sent, and unmounting clears that
   * timer — so leaving straight away dropped whatever was tapped in the last
   * moment, silently. Back now sends anything pending and waits for it (and for
   * a save already on its way), and only then leaves. If that save fails it
   * stays put: the error line says so and Retry has the marks.
   */
  const back = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    await inFlight.current?.catch(() => {});
    if (pending.current.size > 0) await flush().catch(() => {});
    if (!alive.current) return;
    leavingRef.current = false;
    setLeaving(false);
    if (pending.current.size === 0) onBack();
  }, [flush, onBack]);

  /**
   * Cancel the class: everyone on the roster for this date becomes Excused and
   * the date stops counting (v75). Pending marks go first, so a tap made a
   * moment ago is not silently overwritten by — or lost under — the cancel.
   */
  const confirmCancel = useCallback(async () => {
    if (changing.current) return;
    changing.current = true;
    setChange({ kind: 'busy', what: 'Cancelling the class and excusing everyone…' });
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    await inFlight.current?.catch(() => {});
    if (pending.current.size > 0) await flush().catch(() => {});
    if (!alive.current) return;
    // Marks that could not be saved would be refused for ever once the date is
    // cancelled, and Back waits for them — so do not cancel over them.
    if (pending.current.size > 0) {
      changing.current = false;
      setChange({
        kind: 'error',
        message: "Your last marks haven't saved, so the class was not cancelled. Check your connection and try again.",
      });
      return;
    }

    const { result, error } = await cancelSession(day.session.id, reason);
    changing.current = false;
    if (!alive.current) return;
    if (error || !result) {
      setChange({ kind: 'error', message: `${sentence(error ?? "Couldn't cancel the class")} Nothing was changed — try again.` });
      return;
    }
    const kept = reason.trim() || note;
    setStatus('cancelled');
    setNote(kept);
    onStatusChange?.('cancelled', kept);
    setRows(prev => prev.map(r => ({ ...r, status: 'excused' })));
    setCancelSummary(
      result.replaced > 0
        ? `${result.replaced} earlier ${result.replaced === 1 ? 'mark was' : 'marks were'} replaced. Undo puts them back.`
        : null,
    );
    setConfirming(false);
    setReason('');
    setChange({ kind: 'idle' });
    load(true).catch(() => {});
  }, [day.session.id, reason, note, flush, onStatusChange, load]);

  const undoCancel = useCallback(async () => {
    if (changing.current) return;
    changing.current = true;
    setChange({ kind: 'busy', what: 'Putting the class back and restoring the marks…' });
    const { error } = await restoreSession(day.session.id);
    changing.current = false;
    if (!alive.current) return;
    if (error) {
      setChange({ kind: 'error', message: `${sentence(error)} The class is still cancelled — try again.` });
      return;
    }
    setStatus('held');
    setNote(null);
    setCancelSummary(null);
    onStatusChange?.('held', null);
    setChange({ kind: 'idle' });
    load(true).catch(() => {});
  }, [day.session.id, onStatusChange, load]);

  // Keep the page's "12 of 14" chip honest after a reload changes the marks.
  useEffect(() => {
    if (!loading) onCountChange(rows.filter(r => r.status !== null).length);
  }, [rows, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const unmarked = rows.filter(r => r.status === null).length;
  const marked = rows.length - unmarked;
  const busyChanging = change.kind === 'busy';

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
        <Button variant="secondary" size="sm" onClick={() => { back().catch(() => {}); }} disabled={leaving}>
          {leaving ? 'Saving…' : '← Classes'}
        </Button>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <div style={{
            fontWeight: 700,
            color: theme.colors.txt.primary,
            overflowWrap: 'anywhere',
          }}>
            {day.klass.name}
          </div>
          <div style={{ fontSize: '0.8rem', color: theme.colors.txt.tertiary }}>
            {shortDay(day.session.sessionDate)} · {marked} of {rows.length} marked
          </div>
        </div>
        {status === 'held' && (
          <Button variant="outline" size="sm" onClick={() => { setChange({ kind: 'idle' }); setConfirming(true); }}>
            Cancel class
          </Button>
        )}
      </div>

      {status !== 'held' && (
        <div style={{
          padding: theme.spacing.md,
          borderRadius: theme.borderRadius.lg,
          border: `2px solid ${theme.colors.bdr.secondary}`,
          background: theme.colors.bg.tertiary,
          marginBottom: theme.spacing.md,
        }}>
          <div style={{ fontWeight: 700, color: theme.colors.txt.primary, overflowWrap: 'anywhere' }}>
            {status === 'cancelled' ? 'Class cancelled' : 'Studio closed'}{note ? ` — ${note}` : ''}
          </div>
          <div style={{ fontSize: '0.85rem', color: theme.colors.txt.secondary, marginTop: 4, overflowWrap: 'anywhere' }}>
            {status === 'cancelled'
              ? 'Everyone on the roster is excused, and this date does not count toward anyone\'s attendance.'
              : 'This date does not count toward anyone\'s attendance.'}
            {cancelSummary ? ` ${cancelSummary}` : ''}
          </div>
          <Button
            variant="secondary"
            size="sm"
            style={{ marginTop: theme.spacing.sm }}
            onClick={() => { undoCancel().catch(() => {}); }}
            disabled={busyChanging}
          >
            {busyChanging ? 'Undoing…' : status === 'cancelled' ? 'Undo cancellation' : 'Reopen this date'}
          </Button>
          <div role="status" aria-live="polite" style={{
            minHeight: 20, marginTop: theme.spacing.xs, fontSize: '0.85rem', fontWeight: 600, overflowWrap: 'anywhere',
            color: change.kind === 'error' ? theme.colors.status.error : theme.colors.txt.tertiary,
          }}>
            {!confirming && change.kind === 'busy' && change.what}
            {!confirming && change.kind === 'error' && change.message}
          </div>
        </div>
      )}

      <Modal
        isOpen={confirming}
        onClose={() => { if (!busyChanging) setConfirming(false); }}
        title="Cancel this class?"
        size="sm"
        footer={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busyChanging}>Keep class</Button>
            <Button variant="danger" onClick={() => { confirmCancel().catch(() => {}); }} loading={busyChanging} disabled={busyChanging}>
              {busyChanging ? 'Cancelling…' : 'Cancel class'}
            </Button>
          </div>
        }
      >
        <p style={{ marginTop: 0, color: theme.colors.txt.primary, overflowWrap: 'anywhere' }}>
          <strong>{day.klass.name}</strong> on {shortDay(day.session.sessionDate)}.
        </p>
        <p style={{ color: theme.colors.txt.secondary, overflowWrap: 'anywhere', marginBottom: theme.spacing.md }}>
          {rows.length === 1 ? 'The 1 dancer' : `All ${rows.length} dancers`} on the roster will be marked
          {' '}<strong>Excused</strong>, and this date won't count toward anyone's attendance.
          {rows.some(r => r.status !== null && r.status !== 'excused') && (
            <> {rows.filter(r => r.status !== null && r.status !== 'excused').length} already have a mark — it will be
            replaced, and Undo puts it back.</>
          )}
        </p>
        <Input
          label="Reason (optional)"
          placeholder="e.g. Studio closed — power outage"
          value={reason}
          maxLength={200}
          onChange={e => setReason(e.target.value)}
        />
        <div role="status" aria-live="polite" style={{
          minHeight: 20, marginTop: theme.spacing.sm, fontSize: '0.85rem', fontWeight: 600, overflowWrap: 'anywhere',
          color: change.kind === 'error' ? theme.colors.status.error : theme.colors.txt.tertiary,
        }}>
          {confirming && change.kind === 'busy' && change.what}
          {confirming && change.kind === 'error' && change.message}
        </div>
      </Modal>

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
