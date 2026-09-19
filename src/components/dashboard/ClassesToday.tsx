import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavigateFunction } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAdmin } from '../../contexts/PortalAdminContext';
import { useRefreshable } from '../../contexts/RefreshContext';
import { AttendanceGap, ClassDay, loadDay, loadGaps } from '../../lib/attendanceStaff';
import { classPhase, registerState, RegisterTone } from '../../lib/classesToday';
import { formatTime } from '../../lib/portal';
import { studioClock, studioToday } from '../../lib/studioDate';
import { theme } from '../../theme';
import { Button, Spinner } from '../ui';

/**
 * "Your classes today" — the classes this person teaches, on the dashboard.
 *
 * WHY THIS EXISTS
 *
 * A teacher's dashboard used to be entirely about job tasks, and the one thing
 * they do at the top of every lesson lived on another page. This card answers
 * the question they open the app with at 5:20pm — which class is on, and have
 * I taken its register — and one tap on a class opens that register directly.
 *
 * WHO SEES IT
 *
 * Anyone holding a class that is not paused, admins included: the owner and
 * the studio manager each carry a full teaching load. Nobody else. The same
 * `editableClassIds` the portal manager reads decides it, so an admin who
 * teaches nothing, and a team member with no classes, get no card at all
 * rather than an empty one they can do nothing about.
 *
 * The rows are the Attendance page's own loaders, scoped 'mine', so the card
 * and the page cannot disagree about what is on or how many are marked.
 */

const card: React.CSSProperties = {
  backgroundColor: theme.colors.bg.secondary,
  border: `2px solid ${theme.colors.bdr.primary}`,
  borderRadius: theme.borderRadius.lg,
  padding: '16px',
  marginBottom: theme.spacing.md,
  minWidth: 0,
};

const linkBtn: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: theme.colors.primary,
  backgroundColor: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '4px 0',
  whiteSpace: 'nowrap',
  fontFamily: theme.fonts.primary,
  // index.css gives every button overflow: hidden, which lets a flex item
  // shrink below its own text. Beside a title that wraps on a 320px phone,
  // this link was cut to "Attendanc".
  flexShrink: 0,
};

const muted: React.CSSProperties = {
  fontSize: '14px',
  color: theme.colors.txt.tertiary,
  margin: 0,
  padding: '8px 0',
};

// On a filled status surface the text is always white: the mode-dependent text
// tokens flip dark in light mode and lose the contrast.
const pillColours: Record<RegisterTone, { background: string; color: string }> = {
  muted: { background: theme.colors.bg.tertiary, color: theme.colors.txt.secondary },
  live: { background: theme.colors.primary, color: '#FFFFFF' },
  due: { background: theme.colors.status.warning, color: '#FFFFFF' },
  done: { background: theme.colors.status.success, color: '#FFFFFF' },
};

const ClassesToday: React.FC<{ navigate: NavigateFunction }> = ({ navigate }) => {
  const { currentUser, isAdmin } = useAuth();
  const { checking, editableClassIds } = usePortalAdmin();
  const profileId = currentUser?.id ?? '';
  // A string, so a refresh that hands back the same grants in a new array does
  // not count as a change and refetch.
  const classKey = editableClassIds.join(',');
  const holdsClasses = !checking && classKey !== '' && profileId !== '';

  // null until the first load lands: the only time a spinner is right.
  const [days, setDays] = useState<ClassDay[] | null>(null);
  const [gaps, setGaps] = useState<AttendanceGap[]>([]);
  const [today, setToday] = useState(studioToday);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => studioClock());
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!holdsClasses) return;
    const id = ++request.current;
    // Asked again on every load, so a dashboard left open overnight moves on.
    const date = studioToday();
    const [day, backlog] = await Promise.all([
      loadDay(date, profileId, isAdmin, 'mine'),
      loadGaps(classKey.split(',')),
    ]);
    // A slower, older request must not overwrite a newer one.
    if (id !== request.current) return;

    // A failed refresh keeps what is already on screen; the refresh control is
    // what reports the failure. The message is only drawn when there is
    // nothing else to draw.
    if (day.error) {
      setError(day.error);
      throw new Error(day.error);
    }
    setError(null);
    setToday(date);
    setClock(studioClock());
    setDays(day.days);
    if (!backlog.error) setGaps(backlog.rows);
  }, [holdsClasses, profileId, isAdmin, classKey]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  useRefreshable(load, holdsClasses);

  /*
   * A clock, but only while a class today can still change what it says. Each
   * tick re-runs this effect, so the interval stops itself once the last class
   * is over instead of ticking for as long as the dashboard stays open.
   */
  const pending = (days ?? []).some(d => {
    const phase = classPhase(d.klass.startTime, d.klass.endTime, clock);
    return phase === 'upcoming' || phase === 'on';
  });
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(() => setClock(studioClock()), 30_000);
    return () => clearInterval(timer);
  }, [pending, clock]);

  if (!holdsClasses) return null;

  const retry = () => {
    setError(null);
    setDays(null);
    load().catch(() => {});
  };

  // A session still unmarked from an earlier day. Today's are the rows below.
  const earlier = gaps.filter(g => g.sessionDate < today).length;

  return (
    <section className="glass-panel" style={card} aria-label="Your classes today">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.txt.primary, margin: 0 }}>
          Your classes today
        </h3>
        <button type="button" style={linkBtn} onClick={() => navigate('/attendance')}>
          Attendance
        </button>
      </div>

      {days === null ? (
        error ? (
          <div>
            <p role="alert" style={{ ...muted, color: theme.colors.txt.secondary }}>
              Couldn't load today's classes. Check your connection and try again.
            </p>
            <Button variant="secondary" size="sm" onClick={retry}>Try again</Button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <Spinner size={20} color={theme.colors.primary} />
          </div>
        )
      ) : days.length === 0 ? (
        <p style={muted}>No classes on your schedule today.</p>
      ) : (
        <div>
          {days.map((day, index) => {
            const phase = classPhase(day.klass.startTime, day.klass.endTime, clock);
            const state = registerState(day, phase);
            const start = formatTime(day.klass.startTime);
            const end = formatTime(day.klass.endTime);
            const onNow = phase === 'on' && day.session.status === 'held';
            const place = [day.klass.location, day.klass.level].filter(Boolean).join(' · ');

            /*
             * Time and pill share the top line and the class name gets the
             * whole width under them. A time column beside the name left a
             * 320px phone about 90px for it, and imported names run long:
             * "Teen Contemporary & Lyrical Technique" broke mid-word.
             */
            return (
              <button
                key={day.session.id}
                type="button"
                // Opens this class's register, not the list it sits in.
                onClick={() => navigate('/attendance', { state: { openClassId: day.klass.id } })}
                aria-label={`${day.klass.name}${start ? `, ${start}` : ''}${onNow ? ', on now' : ''}. ${state.description}. Open the register.`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: '3px',
                  width: '100%',
                  padding: '12px 4px',
                  background: 'none',
                  border: 'none',
                  borderTop: index === 0 ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: theme.colors.txt.primary,
                  fontFamily: theme.fonts.primary,
                }}
              >
                <span style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  columnGap: '8px',
                  rowGap: '4px',
                }}>
                  <span style={{
                    minWidth: 0,
                    fontSize: '13px',
                    fontWeight: 700,
                    color: theme.colors.txt.secondary,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {start ? `${start}${end ? ` – ${end}` : ''}` : 'No time set'}
                  </span>
                  <span style={{
                    ...pillColours[state.tone],
                    flexShrink: 0,
                    padding: '3px 10px',
                    borderRadius: theme.borderRadius.full,
                    fontSize: '12px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}>
                    {state.label}
                  </span>
                </span>

                <span style={{ fontSize: '16px', fontWeight: 600, overflowWrap: 'anywhere' }}>
                  {day.klass.name}
                </span>

                {(onNow || place) && (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    minWidth: 0,
                    fontSize: '12px',
                    color: theme.colors.txt.tertiary,
                  }}>
                    {onNow && (
                      <>
                        {/* The dot is decoration; the words are the state. Reduced
                            motion freezes it solid and this still says On now. */}
                        <span
                          className="live-dot"
                          aria-hidden="true"
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: theme.colors.status.success,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontWeight: 700, color: theme.colors.status.success, whiteSpace: 'nowrap' }}>
                          On now
                        </span>
                      </>
                    )}
                    {place && (
                      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                        {onNow ? `· ${place}` : place}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {earlier > 0 && (
        <button
          type="button"
          onClick={() => navigate('/attendance')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            width: '100%',
            minHeight: '44px',
            marginTop: '8px',
            padding: '0 12px',
            background: 'none',
            border: `1px solid ${theme.colors.status.warning}`,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            textAlign: 'left',
            color: theme.colors.status.warning,
            fontFamily: theme.fonts.primary,
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {earlier === 1
              ? '1 earlier class still needs attendance'
              : `${earlier} earlier classes still need attendance`}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ flexShrink: 0 }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </section>
  );
};

export default ClassesToday;
