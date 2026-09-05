import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { theme } from '../../theme';
import { Badge, Button, Card, Select, Spinner } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRefreshable } from '../../contexts/RefreshContext';
import { usePortalAdmin, describeWriteError } from '../../contexts/PortalAdminContext';
import { isManagementRole, roleLabel } from '../../lib/roles';
import {
  matchInstructors, normalizeName, InstructorRow, MatchConfidence,
} from '../../lib/instructorMatch';
import { PortalClass } from '../../types';

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
 * and the only symptom is a teacher saying the app stopped working. Revoking
 * lives on the class itself, in ClassesSection, where it is one visible tick.
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

interface Row extends InstructorRow {
  key: string;
  /** The account currently selected for this name. '' means nobody. */
  chosen: string;
  /** Classes on this row that already grant the chosen account. */
  alreadyGranted: number;
  /** Classes on this row that would gain a grant if Apply were pressed now. */
  pending: number;
}

const TeachersSection: React.FC = () => {
  const {
    fetchAllClasses, fetchAllClassInstructors, grantClassInstructors,
  } = usePortalAdmin();
  const { users } = useAuth();
  const { success, error: toastError } = useToast();

  const [classes, setClasses] = useState<PortalClass[]>([]);
  const [grants, setGrants] = useState<{ classId: string; profileId: string }[]>([]);
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

  const grantedByClass = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const g of grants) {
      const set = map.get(g.classId) ?? new Set<string>();
      set.add(g.profileId);
      map.set(g.classId, set);
    }
    return map;
  }, [grants]);

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
      const alreadyGranted = pick
        ? row.classIds.filter(id => grantedByClass.get(id)?.has(pick)).length
        : 0;
      return {
        ...row,
        key,
        chosen: pick,
        alreadyGranted,
        pending: pick ? row.classIds.length - alreadyGranted : 0,
      };
    });
  }, [classes, staff, chosen, grantedByClass]);

  /**
   * An admin already publishes everywhere, so a grant for one would be a row
   * that changes nothing. Those rows stay on screen — an admin looking for a
   * name needs to find it — but they are not part of the work.
   */
  const actionable = rows.filter(r => r.chosen && r.pending > 0 && !r.alreadyCovered);
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
        <p style={{ ...paragraph, margin: 0 }}>
          The names on the schedule are what parents read, so they don't always match an account
          exactly. Check anything not marked <strong>Name matches</strong> before you apply.
          Nothing is saved until you press the button, and applying never takes access away —
          to remove someone, untick them on the class itself.
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
          const meta = [
            `${row.classIds.length} ${row.classIds.length === 1 ? 'class' : 'classes'}`,
            row.alreadyGranted > 0 ? `${row.alreadyGranted} already granted` : null,
            row.pending > 0 && !row.alreadyCovered ? `${row.pending} to add` : null,
          ]
            .filter(Boolean)
            .join(' · ');
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
            </Card>
          );
        })}
      </div>
    </>
  );
};

export default TeachersSection;
