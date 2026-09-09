import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { theme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useRefreshable } from '../contexts/RefreshContext';
import { useResponsive } from '../hooks/useResponsive';
import { PageHeader, Card, Button, Spinner, EmptyState } from '../components/ui';
import RosterSheet from '../components/attendance/RosterSheet';
import RecordsTab from '../components/attendance/RecordsTab';
import { shiftIsoDays, studioToday } from '../lib/studioDate';
import {
  AttendanceGap,
  ClassDay,
  Scope,
  loadDay,
  loadGaps,
  loadMyClassIds,
} from '../lib/attendanceStaff';

/**
 * Attendance — the teacher's side.
 *
 * The screen opens on today and on the classes THIS person teaches, because at
 * 5:20pm that is the only question being asked. Everything else — other dates,
 * other people's classes, the records tab — is a deliberate extra tap away.
 *
 * WHY THE LIST IS BUILT FROM SESSIONS RATHER THAN FROM CLASSES
 *
 * A generated session (v52) is the studio's claim that a class meets on a date.
 * Building the day from sessions means a class appears exactly when it should,
 * a cancelled week still shows with its reason instead of vanishing, and the
 * screen cannot disagree with the denominator a parent is scored against —
 * they are reading the same rows.
 */

const dayLabel = (iso: string, today: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const pretty = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  if (iso === today) return `Today · ${pretty}`;
  return pretty;
};

const AttendancePage: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const { isMobileOrTablet } = useResponsive();

  // The studio's today, not the device's — the same clock the server's
  // studio_today() uses, so the two cannot disagree about which day it is.
  const today = useMemo(() => studioToday(), []);
  const [date, setDate] = useState(today);
  const [days, setDays] = useState<ClassDay[]>([]);
  const [gaps, setGaps] = useState<AttendanceGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openClassId, setOpenClassId] = useState<string | null>(null);
  // A session opened from the records tab, which is not necessarily one of
  // today's classes and so has no entry in `days`.
  const [fixing, setFixing] = useState<ClassDay | null>(null);
  const [tab, setTab] = useState<'take' | 'records'>('take');
  /*
   * Whose classes the day shows.
   *
   * Defaults to 'mine' for everyone, including admins, because the owner and
   * the studio manager each hold sixteen classes as well as the admin role —
   * answering "what am I teaching now" with all twenty classes running that
   * afternoon is the wrong answer for the person standing in a studio. An
   * admin who teaches nothing is switched to 'all' below, since 'mine' would
   * be an empty screen with no way out.
   */
  const [scope, setScope] = useState<Scope>('mine');
  const [myClassCount, setMyClassCount] = useState(0);

  const profileId = currentUser?.id ?? '';

  const load = useCallback(async (silent = false) => {
    if (!profileId) return;
    if (!silent) setLoading(true);

    // What this person actually holds, regardless of their role. Decides both
    // whether the toggle is worth drawing and what 'mine' means.
    const { ids: myIds } = await loadMyClassIds(profileId, isAdmin, 'mine');
    const holds = (myIds ?? []).length;
    setMyClassCount(holds);

    const effective: Scope = isAdmin && holds === 0 ? 'all' : scope;

    const { days: fetched, error: dayError } = await loadDay(date, profileId, isAdmin, effective);

    // The backlog is scoped to the same classes the day list is, so nobody is
    // nagged about a class that is not theirs — and an admin looking at the
    // whole studio sees the whole studio's backlog.
    const { rows: gapRows } = await loadGaps(effective === 'mine' ? (myIds ?? []) : undefined);

    setDays(fetched);
    setGaps(gapRows);
    setError(dayError);
    setLoading(false);
    if (dayError) throw new Error(dayError);
  }, [date, profileId, isAdmin, scope]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const reload = useCallback(() => load(true), [load]);
  useRefreshable(reload, Boolean(profileId));

  const gapsByClass = useMemo(() => {
    const m = new Map<string, AttendanceGap[]>();
    gaps.forEach(g => {
      const list = m.get(g.classId) ?? [];
      list.push(g);
      m.set(g.classId, list);
    });
    return m;
  }, [gaps]);

  const open = fixing ?? days.find(d => d.klass.id === openClassId) ?? null;

  const setMarked = useCallback((classId: string, marked: number) => {
    setDays(prev => prev.map(d => (d.klass.id === classId ? { ...d, marked } : d)));
  }, []);

  return (
    <div style={{
      padding: isMobileOrTablet ? theme.spacing.md : '40px',
      maxWidth: 1000,
      margin: '0 auto',
    }}>
      <PageHeader
        title="Attendance"
        subtitle={
          !isAdmin || myClassCount === 0
            ? (isAdmin ? 'Every class in the studio' : 'Your classes')
            : scope === 'mine'
              ? `Your ${myClassCount} classes`
              : 'Every class in the studio'
        }
      />

      {/*
        Records is admin-only, mirroring is_admin() in the database. A teacher
        who forced the tab open would get their own classes back and nothing
        else — the RLS decides, not this flag — but offering a tab that returns
        a fraction of what it promises is its own kind of lie.
      */}
      {isAdmin && !open && (
        <div role="tablist" aria-label="Attendance views" style={{
          display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.md,
        }}>
          {(['take', 'records'] as const).map(key => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              style={{
                minHeight: 44,
                padding: `0 ${theme.spacing.md}`,
                borderRadius: theme.borderRadius.full,
                border: `2px solid ${tab === key ? theme.colors.primary : theme.colors.bdr.primary}`,
                background: tab === key ? theme.colors.primary : 'transparent',
                // White on the crimson fill: the mode-dependent text tokens flip
                // in light mode and lose the contrast.
                color: tab === key ? '#FFFFFF' : theme.colors.txt.secondary,
                fontFamily: theme.fonts.primary,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {key === 'take' ? 'Take attendance' : 'Records'}
            </button>
          ))}
        </div>
      )}

      {open ? (
        <Card>
          <RosterSheet
            day={open}
            onBack={() => { setOpenClassId(null); setFixing(null); if (fixing) load(true).catch(() => {}); }}
            onCountChange={n => setMarked(open.klass.id, n)}
            readOnly={open.session.status !== 'held'}
          />
        </Card>
      ) : isAdmin && tab === 'records' ? (
        <RecordsTab
          generatedBy={currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : undefined}
          onFix={r => setFixing({
            klass: {
              id: r.classId, name: r.className,
              dayOfWeek: null, startTime: null, endTime: null,
              location: null, level: null, style: null,
            },
            session: {
              id: r.sessionId, classId: r.classId, sessionDate: r.sessionDate,
              status: r.sessionStatus, source: 'schedule', note: null,
            },
            expected: 0,
            marked: 0,
          })}
        />
      ) : (
        <>
          {/*
            Date bar. Wraps, and centres nothing — a centred row that overflows
            hangs off BOTH edges and the left half is unreachable (CLAUDE.md).
          */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: theme.spacing.sm,
            marginBottom: theme.spacing.md,
          }}>
            <Button variant="secondary" size="sm" onClick={() => setDate(d => shiftIsoDays(d, -1))}>←</Button>
            <span style={{
              flex: '1 1 auto',
              minWidth: 0,
              overflowWrap: 'anywhere',
              fontWeight: 700,
              color: theme.colors.txt.primary,
            }}>
              {dayLabel(date, today)}
            </span>
            <Button variant="secondary" size="sm" onClick={() => setDate(d => shiftIsoDays(d, 1))}>→</Button>
            {date !== today && (
              <Button variant="ghost" size="sm" onClick={() => setDate(today)}>Today</Button>
            )}
          </div>

          {/*
            Only drawn for an admin who also teaches. For everyone else there
            is one answer and a toggle between it and itself is noise.
          */}
          {isAdmin && myClassCount > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs,
              marginBottom: theme.spacing.md,
            }}>
              {(['mine', 'all'] as const).map(key => (
                <Button
                  key={key}
                  variant={scope === key ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setScope(key)}
                >
                  {key === 'mine' ? `My classes (${myClassCount})` : 'All classes'}
                </Button>
              ))}
            </div>
          )}

          <MissedBanner gaps={gaps} onJump={setDate} today={today} />

          {loading ? (
            <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}><Spinner /></div>
          ) : error ? (
            <Card>
              <div role="alert" style={{ color: theme.colors.txt.primary }}>
                {error}
                <div style={{ marginTop: theme.spacing.md }}>
                  <Button variant="secondary" onClick={() => { load().catch(() => {}); }}>Try again</Button>
                </div>
              </div>
            </Card>
          ) : days.length === 0 ? (
            <EmptyState
              title="No classes on this day"
              description={
                isAdmin
                  ? 'Nothing is scheduled to meet on this date.'
                  : 'You are not scheduled to teach on this date. If that looks wrong, the office assigns classes in Portal Manager.'
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
              {days.map(day => (
                <ClassRow
                  key={day.session.id}
                  day={day}
                  priorGaps={(gapsByClass.get(day.klass.id) ?? []).filter(g => g.sessionDate !== date)}
                  onOpen={() => setOpenClassId(day.klass.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/**
 * The banner the studio asked for: what has been missed, before anything else.
 *
 * It counts SESSIONS, not dancers, because "you have three unfinished classes"
 * is a thing a person can act on and "you have 41 unmarked dancers" is a thing
 * they scroll past. The dancer count is still there, one level down, for
 * whoever wants it.
 */
const MissedBanner: React.FC<{
  gaps: AttendanceGap[];
  today: string;
  onJump: (date: string) => void;
}> = ({ gaps, today, onJump }) => {
  const [open, setOpen] = useState(false);
  if (gaps.length === 0) return null;

  const dancers = gaps.reduce((n, g) => n + g.missing, 0);
  const shown = open ? gaps : gaps.slice(0, 3);

  return (
    <Card
      padding="md"
      style={{
        borderColor: theme.colors.status.warning,
        marginBottom: theme.spacing.md,
      }}
    >
      <div style={{ fontWeight: 700, color: theme.colors.txt.primary, overflowWrap: 'anywhere' }}>
        {gaps.length === 1 ? '1 class still needs attendance' : `${gaps.length} classes still need attendance`}
      </div>
      <div style={{ fontSize: '0.85rem', color: theme.colors.txt.tertiary, marginTop: 4 }}>
        {dancers} {dancers === 1 ? 'dancer has' : 'dancers have'} no mark yet. Tap a date to fill it in.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: theme.spacing.sm }}>
        {shown.map(g => (
          <button
            key={g.sessionId}
            type="button"
            onClick={() => onJump(g.sessionDate)}
            style={{
              minHeight: 44,
              display: 'flex',
              flexWrap: 'wrap',
              gap: theme.spacing.sm,
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'transparent',
              border: `1px solid ${theme.colors.bdr.primary}`,
              borderRadius: theme.borderRadius.md,
              padding: `0 ${theme.spacing.sm}`,
              font: 'inherit',
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.secondary,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              {g.sessionDate === today ? 'Today' : g.sessionDate}
            </span>
            <span style={{ color: theme.colors.status.warning, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {g.missing} of {g.expected} unmarked
            </span>
          </button>
        ))}
      </div>

      {gaps.length > 3 && (
        <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)} style={{ marginTop: theme.spacing.xs }}>
          {open ? 'Show fewer' : `Show all ${gaps.length}`}
        </Button>
      )}
    </Card>
  );
};

const ClassRow: React.FC<{
  day: ClassDay;
  priorGaps: AttendanceGap[];
  onOpen: () => void;
}> = ({ day, priorGaps, onOpen }) => {
  const done = day.expected > 0 && day.marked >= day.expected;
  const notHeld = day.session.status !== 'held';

  const time = day.klass.startTime ? day.klass.startTime.slice(0, 5) : null;

  return (
    <Card hover onClick={onOpen} padding="md">
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing.sm,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: theme.colors.txt.primary, overflowWrap: 'anywhere' }}>
            {day.klass.name}
          </div>
          <div style={{ fontSize: '0.8rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>
            {[time, day.klass.location, day.klass.level].filter(Boolean).join(' · ') || 'No time set'}
          </div>
          {priorGaps.length > 0 && (
            <div style={{ fontSize: '0.78rem', color: theme.colors.status.warning, marginTop: 4 }}>
              {priorGaps.length} earlier {priorGaps.length === 1 ? 'date needs' : 'dates need'} attendance
            </div>
          )}
        </div>

        <span
          style={{
            padding: `6px ${theme.spacing.sm}`,
            borderRadius: theme.borderRadius.full,
            whiteSpace: 'nowrap',
            fontSize: '0.8rem',
            fontWeight: 700,
            background: notHeld
              ? theme.colors.bg.tertiary
              : done ? theme.colors.status.success : theme.colors.status.warning,
            // On a filled status surface the text is always white — the
            // mode-dependent tokens flip in light mode and lose contrast.
            color: notHeld ? theme.colors.txt.tertiary : '#FFFFFF',
          }}
        >
          {notHeld
            ? (day.session.status === 'cancelled' ? 'Cancelled' : 'Closed')
            : done ? 'Done' : `${day.marked} of ${day.expected}`}
        </span>
      </div>
    </Card>
  );
};

export default AttendancePage;
