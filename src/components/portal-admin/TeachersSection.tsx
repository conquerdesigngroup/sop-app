import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { theme } from '../../theme';
import { Badge, Button, Card, Select, Spinner, Toggle } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRefreshable } from '../../contexts/RefreshContext';
import {
  usePortalAdmin, describeWriteError, ClassGrant,
} from '../../contexts/PortalAdminContext';
import { isManagementRole, roleLabel } from '../../lib/roles';
import {
  matchInstructors, normalizeName, InstructorRow, MatchConfidence,
} from '../../lib/instructorMatch';
import { PortalClass } from '../../types';
import { classSummary } from './shared';

/**
 * Turning the per-class grants on, one teacher at a time instead of 103 classes
 * at a time.
 *
 * WHY THIS SCREEN EXISTS
 *
 * v9 built the whole teacher-scoped model — portal_class_instructors,
 * can_edit_portal_class(), write policies on updates and documents, a storage
 * policy, and a tick-list on every class. Then nobody ticked the boxes. Two
 * grants existed across the studio, both on one test class, so the feature was
 * complete and switched off for a year.
 *
 * The reason is arithmetic. The season import wrote 103 classes and about
 * thirteen distinct teachers, and the existing UI asks per class: open the
 * class, find the person, tick, save, repeat. Nobody does that 103 times. This
 * screen asks per teacher instead, which is thirteen decisions.
 *
 * IT SUGGESTS, IT DOES NOT DECIDE
 *
 * The suggestions come from src/lib/instructorMatch.ts, which explains what it
 * can and cannot tell. Nothing is written until someone presses Apply, and
 * every row below `exact` is labelled so the eye lands on it. Two live cases
 * are genuinely undecidable from the data — a nickname and a one-letter
 * surname difference — and both are the admin's call, not the matcher's.
 *
 * ADD-ONLY, ON PURPOSE
 *
 * Apply never removes a grant. A bulk screen that could revoke would, on the
 * day somebody re-typed a teacher's name, quietly strip every class they hold —
 * and the only symptom is a teacher saying the app stopped working.
 *
 * TURNING ONE OFF (v45)
 *
 * Switching a class off pauses the grant rather than deleting it, and the two
 * are not interchangeable. Deleting leaves no row, and no row is precisely what
 * this screen is built to fill in — so the next person to press Apply would put
 * it straight back, because the schedule still names that teacher. Nobody would
 * be told. A paused row is a row: Apply counts it as handled and leaves it
 * alone, so off stays off.
 *
 * It also keeps the answer to "who teaches this", which the delete threw away.
 *
 * The per-class tick list in ClassesSection still deletes, and that is still the
 * right tool for a teacher who has actually left.
 *
 * ADMIN-ONLY, AND NOT BY CONVENTION
 *
 * portal_ci_write is FOR ALL USING is_admin(), so a teacher pressing Apply gets
 * a row-level security error rather than a grant. The route hides it too; the
 * policy is what enforces it.
 */

const CONFIDENCE_BADGE: Record<
  MatchConfidence,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'default' }
> = {
  exact: { label: 'Name matches', variant: 'success' },
  likely: { label: 'Probably — check', variant: 'warning' },
  review: { label: 'Only an initial — check', variant: 'warning' },
  ambiguous: { label: 'Two accounts fit', variant: 'danger' },
  none: { label: 'No account found', variant: 'default' },
};

/** Rows an admin should look at before pressing anything. */
const NEEDS_A_LOOK: MatchConfidence[] = ['likely', 'review', 'ambiguous', 'none'];

/** One class under a teacher, and what their editing is set to on it. */
export interface GrantRow {
  classId: string;
  /** True when the class names this teacher on the schedule. */
  onTheSchedule: boolean;
  state: 'on' | 'paused' | 'none';
}

interface Row extends InstructorRow {
  key: string;
  /** The account currently selected for this name. '' means nobody. */
  chosen: string;
  /** Classes on this row that already grant the chosen account, paused or not. */
  alreadyGranted: number;
  /** Classes on this row that would gain a grant if Apply were pressed now. */
  pending: number;
  /**
   * Every class this account holds, whether or not the schedule names them.
   *
   * Deliberately wider than `classIds`. A grant is per (class, account), and an
   * admin can add one by hand on a class that lists somebody else entirely; if
   * this listed only schedule matches, that grant would be invisible here and
   * so impossible to switch off from the one screen built for switching things
   * off.
   */
  held: GrantRow[];
  paused: number;
}

const TeachersSection: React.FC = () => {
  const {
    fetchAllClasses, fetchAllClassInstructors, grantClassInstructors, setGrantPaused,
  } = usePortalAdmin();
  const { users } = useAuth();
  const { success, error: toastError } = useToast();

  const [classes, setClasses] = useState<PortalClass[]>([]);
  const [grants, setGrants] = useState<ClassGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * Overrides, keyed by the folded name so a row keeps its choice across a
   * refresh. Absent means "whatever the matcher suggested"; present-and-empty
   * means someone deliberately cleared it, which is not the same thing and must
   * survive a re-render.
   */
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);
  const [statusLine, setStatusLine] = useState('');
  /** Which teacher's class list is expanded. One at a time; the list is long. */
  const [open, setOpen] = useState<string | null>(null);
  /**
   * The one grant currently being written, as "classId:profileId".
   *
   * A toggle is a single small UPDATE, but it is still a network round trip: a
   * second tap on the same switch before the first lands would send a second,
   * contradictory write. Keyed rather than a boolean so switching class A does
   * not freeze the switch for class B.
   */
  const [busyGrant, setBusyGrant] = useState<string | null>(null);
  // A second tap can land between the first and the re-render that disables
  // the button, so the ref refuses it rather than granting everything twice.
  const busy = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [nextClasses, nextGrants] = await Promise.all([
        fetchAllClasses(),
        fetchAllClassInstructors(),
      ]);
      setClasses(nextClasses);
      setGrants(nextGrants);
      setLoadError(null);
    } catch (e) {
      console.error('Could not load the teacher assignment list:', e);
      // Thrown on rather than swallowed when this is the app-wide refresh, so
      // the refresh button can say it failed.
      if (silent) throw e;
      setLoadError('Could not load the schedule. Check your connection and try again.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fetchAllClasses, fetchAllClassInstructors]);

  useEffect(() => { load(); }, [load]);
  useRefreshable(useCallback(() => load(true), [load]), true);

  const staff = useMemo(
    () => users.filter(u => u.isActive !== false),
    [users]
  );

  /** classId -> profileId -> paused. Presence is the grant; the value is its state. */
  const grantedByClass = useMemo(() => {
    const map = new Map<string, Map<string, boolean>>();
    for (const g of grants) {
      const inner = map.get(g.classId) ?? new Map<string, boolean>();
      inner.set(g.profileId, g.paused);
      map.set(g.classId, inner);
    }
    return map;
  }, [grants]);

  const classById = useMemo(
    () => new Map(classes.map(c => [c.id, c])),
    [classes]
  );

  const rows: Row[] = useMemo(() => {
    const matched = matchInstructors(
      classes.map(c => ({
        id: c.id,
        instructorName: c.instructorName,
        isActive: c.isActive,
      })),
      staff.map(u => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
      }))
    );

    return matched.map(row => {
      const key = normalizeName(row.scheduleName);
      const pick = key in chosen ? chosen[key] : row.suggestion?.id ?? '';

      const scheduled = new Set(row.classIds);
      // Every class this account actually holds, plus every class the schedule
      // names them on. The union, so a hand-made grant on a class listing
      // somebody else is still switchable here.
      const heldIds = new Set(row.classIds);
      if (pick) {
        for (const g of grants) if (g.profileId === pick) heldIds.add(g.classId);
      }

      const held: GrantRow[] = Array.from(heldIds)
        .map(classId => {
          const paused = pick ? grantedByClass.get(classId)?.get(pick) : undefined;
          return {
            classId,
            onTheSchedule: scheduled.has(classId),
            state: paused === undefined ? 'none' : paused ? 'paused' : 'on',
          } as GrantRow;
        })
        .sort((a, b) =>
          (classById.get(a.classId)?.name ?? '').localeCompare(
            classById.get(b.classId)?.name ?? ''
          )
        );

      const alreadyGranted = row.classIds.filter(
        id => grantedByClass.get(id)?.has(pick)
      ).length;

      return {
        ...row,
        key,
        chosen: pick,
        alreadyGranted: pick ? alreadyGranted : 0,
        pending: pick ? row.classIds.length - alreadyGranted : 0,
        held: pick ? held : [],
        paused: held.filter(h => h.state === 'paused').length,
      };
    });
  }, [classes, staff, chosen, grants, grantedByClass, classById]);

  /**
   * An admin already publishes everywhere, so a grant for one would be a row
   * that changes nothing. Those rows stay on screen — an admin looking for a
   * name needs to find it — but they are not part of the work.
   */
  const actionable = rows.filter(r => r.chosen && r.pending > 0 && !r.alreadyCovered);
  /**
   * Only classes with NO grant row at all.
   *
   * `has` is true for a paused grant as well as a live one, which is the whole
   * point of v45: switching a teacher off must survive the next person pressing
   * Apply. Before the flag existed, "off" meant deleting the row, and this
   * filter would have put it straight back.
   */
  const pendingPairs = actionable.flatMap(r =>
    r.classIds
      .filter(id => !grantedByClass.get(id)?.has(r.chosen))
      .map(id => ({ classId: id, profileId: r.chosen }))
  );
  const needsALook = rows.filter(r => NEEDS_A_LOOK.includes(r.confidence) && !r.alreadyCovered);

  const staffOptions = useMemo(
    () => [
      { value: '', label: '— nobody —' },
      ...staff
        .slice()
        .sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        )
        .map(u => ({
          value: u.id,
          label: `${u.firstName.trim()} ${u.lastName.trim()}${
            isManagementRole(u.role) ? ` — ${roleLabel(u.role).toLowerCase()}` : ''
          }`,
        })),
    ],
    [staff]
  );

  const handleTogglePaused = async (classId: string, profileId: string, paused: boolean) => {
    const key = `${classId}:${profileId}`;
    if (busyGrant === key) return;
    setBusyGrant(key);

    // Optimistic, because a switch that does not move until the server answers
    // reads as broken. Rolled back below if the write is refused.
    const before = grants;
    setGrants(prev =>
      prev.map(g => (g.classId === classId && g.profileId === profileId ? { ...g, paused } : g))
    );

    try {
      await setGrantPaused(classId, profileId, paused);
      await load(true);
    } catch (e) {
      setGrants(before);
      toastError(describeWriteError(e));
    } finally {
      setBusyGrant(null);
    }
  };

  const handleApply = async () => {
    if (busy.current || !pendingPairs.length) return;
    busy.current = true;
    setApplying(true);
    setStatusLine(
      `Giving ${actionable.length} ${actionable.length === 1 ? 'teacher' : 'teachers'} access to ` +
      `${pendingPairs.length} ${pendingPairs.length === 1 ? 'class' : 'classes'}. Keep this page open.`
    );
    try {
      const created = await grantClassInstructors(pendingPairs);
      await load(true);
      setStatusLine(
        created === 0
          ? 'Nothing to add — those teachers already had every one of those classes.'
          : `Done. ${created} ${created === 1 ? 'class is' : 'classes are'} now editable by the ` +
            'teacher who holds them.'
      );
      success(
        created === 0
          ? 'Everything was already granted.'
          : `${created} ${created === 1 ? 'grant' : 'grants'} added.`
      );
    } catch (e) {
      const message = describeWriteError(e);
      setStatusLine(`Nothing was changed. ${message}`);
      toastError(message);
    } finally {
      busy.current = false;
      setApplying(false);
    }
  };

  const paragraph: React.CSSProperties = {
    ...theme.typography.bodySmall,
    fontFamily: theme.fonts.primary,
    color: theme.colors.txt.secondary,
    margin: '0 0 12px',
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <Spinner size={28} color={theme.colors.primary} />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <p style={{ ...paragraph, margin: '0 0 12px' }}>{loadError}</p>
        <Button variant="secondary" onClick={() => load()}>Try again</Button>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <h3 style={{ ...theme.typography.h3, color: theme.colors.txt.primary, margin: '0 0 8px' }}>
          Who teaches what
        </h3>
        <p style={paragraph}>
          Every teacher named on the schedule, with the staff account that looks like them.
          Giving someone their classes lets them post info and add files to those classes and
          nothing else — not the calendar, not another teacher's class, not the studio-wide posts.
        </p>
        <p style={paragraph}>
          The names on the schedule are what parents read, so they don't always match an account
          exactly. Check anything not marked <strong>Name matches</strong> before you apply.
          Nothing is saved until you press the button.
        </p>
        <p style={{ ...paragraph, margin: 0 }}>
          To switch a teacher's editing off for a class, open{' '}
          <strong>Turn classes on or off</strong> on their row. They stay listed as teaching it —
          the editing is just off, and it stays off. Pressing the button above will not quietly
          turn it back on.
        </p>
      </Card>

      <div style={{ height: theme.spacing.md }} />

      <Card>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{
              ...theme.typography.body,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.primary,
              margin: 0,
            }}>
              {pendingPairs.length === 0
                ? 'Nothing left to grant.'
                : `${pendingPairs.length} ${pendingPairs.length === 1 ? 'class' : 'classes'} ` +
                  `to hand to ${actionable.length} ${actionable.length === 1 ? 'teacher' : 'teachers'}.`}
            </p>
            {needsALook.length > 0 && (
              <p style={{
                ...theme.typography.captionSmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.tertiary,
                margin: '4px 0 0',
              }}>
                {needsALook.length} {needsALook.length === 1 ? 'name needs' : 'names need'} a look first.
              </p>
            )}
          </div>

          <Button
            variant="primary"
            onClick={handleApply}
            loading={applying}
            disabled={applying || pendingPairs.length === 0}
          >
            {applying ? 'Giving access…' : 'Give these teachers their classes'}
          </Button>
        </div>

        {statusLine && (
          <p
            role="status"
            aria-live="polite"
            style={{
              ...theme.typography.bodySmall,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.secondary,
              margin: '12px 0 0',
            }}
          >
            {statusLine}
          </p>
        )}
      </Card>

      <div style={{ height: theme.spacing.md }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        {rows.length === 0 && (
          <Card>
            <p style={{ ...paragraph, margin: 0 }}>
              No teacher names on the schedule yet. Add one to a class and it will show up here.
            </p>
          </Card>
        )}

        {rows.map(row => {
          const badge = CONFIDENCE_BADGE[row.confidence];
          // Assembled here rather than interpolated inline, so it reaches the
          // DOM as one string. Split across JSX expressions it becomes half a
          // dozen text nodes, which reads the same and matches nothing.
          const live = row.held.filter(h => h.state === 'on').length;
          const meta = [
            `${row.classIds.length} ${row.classIds.length === 1 ? 'class' : 'classes'}`,
            live > 0 ? `${live} on` : null,
            row.paused > 0 ? `${row.paused} paused` : null,
            row.pending > 0 && !row.alreadyCovered ? `${row.pending} to add` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          const expanded = open === row.key;
          return (
            <Card key={row.key}>
              {/*
                Wrapped rather than switched on a breakpoint. An earlier version
                asked useResponsive and set a hard 280px on the dropdown, which
                ran 22px off the right of a 320px phone — and would have done the
                same across the whole 480-660px band, where the hook says
                "desktop" and the card is still narrower than 220 + 280. Letting
                the two halves wrap makes the width the only thing that decides,
                which is the one thing that is always right.
              */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px',
                alignItems: 'center',
              }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    alignItems: 'center',
                    marginBottom: '4px',
                  }}>
                    <span style={{
                      ...theme.typography.body,
                      fontFamily: theme.fonts.primary,
                      fontWeight: 600,
                      color: theme.colors.txt.primary,
                      // The schedule name is free text; without both of these a
                      // long one pushes the card off the right of a phone.
                      minWidth: 0,
                      overflowWrap: 'anywhere',
                    }}>
                      {row.scheduleName}
                    </span>
                    <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                  </div>

                  <p style={{
                    ...theme.typography.captionSmall,
                    fontFamily: theme.fonts.mono,
                    color: theme.colors.txt.tertiary,
                    margin: 0,
                    overflowWrap: 'anywhere',
                  }}>
                    {meta}
                  </p>

                  {row.alreadyCovered && (
                    <p style={{
                      ...theme.typography.captionSmall,
                      fontFamily: theme.fonts.primary,
                      color: theme.colors.txt.tertiary,
                      margin: '4px 0 0',
                    }}>
                      This account is an admin and can already post to every class. Nothing to grant.
                    </p>
                  )}

                  {row.confidence === 'ambiguous' && (
                    <p style={{
                      ...theme.typography.captionSmall,
                      fontFamily: theme.fonts.primary,
                      color: theme.colors.status.warning,
                      margin: '4px 0 0',
                    }}>
                      {row.alternatives
                        .map(c => `${c.firstName.trim()} ${c.lastName.trim()}`)
                        .join(' and ')}{' '}
                      both fit this name. Pick the right one.
                    </p>
                  )}

                  {row.confidence === 'none' && (
                    <p style={{
                      ...theme.typography.captionSmall,
                      fontFamily: theme.fonts.primary,
                      color: theme.colors.txt.tertiary,
                      margin: '4px 0 0',
                    }}>
                      No staff account looks like this name. Either pick one below, or leave it —
                      a guest or a teacher with no login belongs on the schedule but not in here.
                    </p>
                  )}
                </div>

                {/* Shrinkable, not fixed: minWidth 0 is what lets it go below
                    the widest option's intrinsic width on a narrow phone. */}
                <div style={{ flex: '0 1 280px', minWidth: 0 }}>
                  <Select
                    aria-label={`Staff account for ${row.scheduleName}`}
                    options={staffOptions}
                    value={row.chosen}
                    onChange={e =>
                      setChosen(prev => ({ ...prev, [row.key]: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/*
                Switching editing off, per class.

                Only appears once the teacher actually holds something. A row
                with no grants has nothing to switch, and an empty disclosure on
                every unmatched name would be noise on a list of thirteen.
              */}
              {row.held.some(h => h.state !== 'none') && (
                <>
                  <div style={{ marginTop: '12px' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpen(expanded ? null : row.key)}
                      aria-expanded={expanded}
                      aria-controls={`classes-${row.key}`}
                      style={{ paddingLeft: 0 }}
                    >
                      {expanded ? 'Hide their classes' : 'Turn classes on or off'}
                    </Button>
                  </div>

                  {expanded && (
                    <div
                      id={`classes-${row.key}`}
                      style={{
                        marginTop: '8px',
                        borderTop: `1px solid ${theme.colors.bdr.primary}`,
                        paddingTop: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      {row.held.filter(h => h.state !== 'none').map(h => {
                        const klass = classById.get(h.classId);
                        const labelId = `cls-${row.key}-${h.classId}`;
                        const pending = busyGrant === `${h.classId}:${row.chosen}`;
                        return (
                          <div
                            key={h.classId}
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '10px',
                              alignItems: 'center',
                              padding: '6px 0',
                            }}
                          >
                            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                              <div
                                id={labelId}
                                style={{
                                  ...theme.typography.bodySmall,
                                  fontFamily: theme.fonts.primary,
                                  color: theme.colors.txt.primary,
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                {klass?.name ?? 'A class that is no longer listed'}
                              </div>
                              <div style={{
                                ...theme.typography.captionSmall,
                                fontFamily: theme.fonts.mono,
                                color: theme.colors.txt.tertiary,
                                overflowWrap: 'anywhere',
                              }}>
                                {[
                                  klass ? classSummary(klass) : null,
                                  h.state === 'paused' ? 'editing off' : 'editing on',
                                  // Worth saying out loud: this grant is not
                                  // explained by the schedule, so nobody should
                                  // be surprised to find it here.
                                  h.onTheSchedule ? null : 'not on the schedule',
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </div>

                            <Toggle
                              checked={h.state === 'on'}
                              disabled={pending}
                              labelledBy={labelId}
                              onChange={on => handleTogglePaused(h.classId, row.chosen, !on)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
};

export default TeachersSection;
