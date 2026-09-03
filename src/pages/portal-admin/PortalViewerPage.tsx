import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { theme } from '../../theme';
import { Button, PageHeader } from '../../components/ui';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../contexts/AuthContext';
import { useRefreshable } from '../../contexts/RefreshContext';
import { usePortalAdmin } from '../../contexts/PortalAdminContext';
import { TabRow } from '../../components/portal-admin/shared';
import PortalAdminTabs from '../../components/portal-admin/PortalAdminTabs';
import { ClassList, HouseholdList, StudentList } from '../../components/portal-admin/viewer/ViewerLists';
import HouseholdPanel from '../../components/portal-admin/viewer/HouseholdPanel';
import RosterPanel from '../../components/portal-admin/viewer/RosterPanel';
import {
  EMPTY_FILTERS,
  ViewerClass,
  ViewerFilters,
  ViewerHousehold,
  ViewerStudent,
  loadHouseholds,
  loadStudents,
  loadViewerClasses,
} from '../../lib/portalViewer';

/**
 * Oversight: everything the account holders have, from the studio's side.
 *
 * WHY THIS IS NOT PART OF THE EDITOR
 *
 * The editor answers "what should families see?". This answers "what do they
 * actually have?" — which family owns which login, which child is in which
 * class, and whether anyone has signed up at all. They are different questions
 * with different shapes, and the editor is already three tabs deep.
 *
 * SUPER ADMIN ONLY, AND WHERE THAT IS ENFORCED
 *
 * The route is superAdminOnly, which is a UI gate. The DATABASE is more
 * permissive on reads: v33 wrote every household policy as `OR is_admin()`, so
 * any admin could already select these tables — this page opens no new read
 * access, it only makes existing access legible.
 *
 * WRITES are different and are genuinely enforced: portal_updates_insert
 * requires is_super_admin() for any row carrying a household_id (v36). An admin
 * who reached this page by typing the URL still could not send anybody a note.
 *
 * THREE LISTS, ONE ANSWER
 *
 * Families, dancers and classes are three doors into the same place. Whichever
 * the front desk searches, they land on the family — because every question
 * that starts "a parent called about…" ends there.
 */

type ViewKey = 'families' | 'dancers' | 'classes';

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'families', label: 'Families' },
  { key: 'dancers', label: 'Dancers' },
  { key: 'classes', label: 'Classes & rosters' },
];

const PortalViewerPage: React.FC = () => {
  const { isMobileOrTablet } = useResponsive();
  const { isSuperAdmin } = useAuth();
  const { programs } = usePortalAdmin();
  const [params, setParams] = useSearchParams();

  const [households, setHouseholds] = useState<ViewerHousehold[]>([]);
  const [students, setStudents] = useState<ViewerStudent[]>([]);
  const [classes, setClasses] = useState<ViewerClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * One clock for the whole screen.
   *
   * Ages are computed against it in three different components; letting each
   * call new Date() means a render that straddles midnight can show the same
   * child as 8 in the list and 9 in the detail.
   */
  const [today] = useState(() => new Date());

  /**
   * One query and one filter set PER LIST, held here rather than inside the
   * lists themselves.
   *
   * A detail panel replaces the list, so state living in the list is destroyed
   * on every drill-down: narrowing 343 families to the four All-Stars ones and
   * then losing it by opening one of them is exactly the work filtering was
   * supposed to save.
   *
   * Per-list and not shared, because the three lists filter different things —
   * a day-of-week chip means nothing on the families tab, and carrying
   * "Not signed up" onto the class list would silently hide classes for a
   * reason that screen cannot explain.
   */
  const [queries, setQueries] = useState<Record<ViewKey, string>>({
    families: '', dancers: '', classes: '',
  });
  const setQuery = useCallback(
    (key: ViewKey) => (value: string) => setQueries(q => ({ ...q, [key]: value })),
    [],
  );

  const [filters, setFilters] = useState<Record<ViewKey, ViewerFilters>>({
    families: EMPTY_FILTERS, dancers: EMPTY_FILTERS, classes: EMPTY_FILTERS,
  });
  const setFilter = useCallback(
    (key: ViewKey) => (value: ViewerFilters) => setFilters(f => ({ ...f, [key]: value })),
    [],
  );

  const requestedView = params.get('view') as ViewKey | null;
  const view: ViewKey = VIEWS.some(v => v.key === requestedView)
    ? (requestedView as ViewKey)
    : 'families';

  const openHouseholdId = params.get('household');
  const openClassId = params.get('class');
  const openClass = openClassId ? classes.find(c => c.id === openClassId) ?? null : null;

  /**
   * `push` decides whether the phone's back gesture can undo this.
   *
   * Switching tabs replaces: a row of tabs is one screen, and stacking a
   * history entry per tap turns Back into "undo my last five taps".
   *
   * Opening or closing a detail panel PUSHES. The panel replaces the list
   * rather than sitting under it, so to a parent — and to the phone — it is a
   * new screen, and with replace the back gesture left the Portal viewer
   * entirely instead of returning to the 343 families they were looking at.
   * Closing pushes too: two entries per drill-down is a little history, and
   * the alternative (replace on close) puts Back on a panel the user has just
   * dismissed.
   */
  const setParam = useCallback((next: Record<string, string | null>, push = false) => {
    const merged = new URLSearchParams(params);
    Object.keys(next).forEach(k => {
      const value = next[k];
      if (value === null) merged.delete(k);
      else merged.set(k, value);
    });
    setParams(merged, { replace: !push });
  }, [params, setParams]);

  // All three lists load together and are then searched locally. Three
  // requests once beats one request per keystroke, and the payload is small
  // enough that splitting them per tab would only add a spinner on every
  // switch.
  //
  // Also what the app-wide refresh re-runs (RefreshContext): the same three
  // reads, swapped in under the page rather than behind a spinner. The request
  // counter drops a response that lands after a newer load has started.
  const requestRef = useRef(0);
  const loadAll = useCallback(async () => {
    const requestId = ++requestRef.current;
    const [h, s, c] = await Promise.all([loadHouseholds(), loadStudents(), loadViewerClasses()]);
    if (requestId !== requestRef.current) return;
    setHouseholds(h.rows);
    setStudents(s.rows);
    setClasses(c.rows);
    setError(h.error ?? s.error ?? c.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
    return () => { requestRef.current++; };
  }, [loadAll]);
  useRefreshable(loadAll);

  /**
   * Opening a family does NOT clear `class`.
   *
   * It used to. Opening a dancer from a class roster therefore dropped the
   * roster, and Back — labelled "All families" — landed on the list of classes
   * instead. Keeping the parameter means the panel stack unwinds the way it was
   * built: roster to family, family back to the same roster.
   */
  const openHousehold = useCallback((id: string) => {
    setParam({ household: id }, true);
  }, [setParam]);

  /**
   * A detail panel replaces the list, and the page keeps the scroll position
   * it had. Tapping the 200th of 343 families therefore opened their record
   * already scrolled past its own heading, somewhere in the middle of the
   * dancers. scrollIntoView on the panel rather than window.scrollTo, because
   * which element actually scrolls depends on the layout this page is mounted
   * inside and guessing wrong is a silent no-op.
   */
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openKey = `${openHouseholdId ?? ''}|${openClassId ?? ''}`;
  useEffect(() => {
    if (!openHouseholdId && !openClassId) return;
    panelRef.current?.scrollIntoView({ block: 'start' });
  }, [openKey, openHouseholdId, openClassId]);

  const subtitle = useMemo(() => {
    if (loading || error) return 'Every account, dancer and roster in the portal';
    return `${households.length} families · ${students.length} dancers · ${classes.length} classes`;
  }, [loading, error, households.length, students.length, classes.length]);

  return (
    <div style={{
      padding: isMobileOrTablet ? '16px' : '40px',
      maxWidth: '1400px',
      margin: '0 auto',
    }}>
      <PageHeader
        title="Portal viewer"
        subtitle={subtitle}
        actions={
          <Link to="/portal-admin/clients" style={{ textDecoration: 'none' }}>
            <Button variant="outline">Client accounts</Button>
          </Link>
        }
      />

      <PortalAdminTabs active="viewer" canViewEveryone={isSuperAdmin} />

      {/* A detail panel replaces the list rather than sitting under it: on a
          phone a list of 343 above a detail is a scroll nobody finishes. */}
      <div ref={panelRef}>
      {openHouseholdId ? (
        <HouseholdPanel
          householdId={openHouseholdId}
          programs={programs}
          canSendNotes={isSuperAdmin}
          today={today}
          // A family can be reached from the family list OR from a class
          // roster, and Back must name wherever it will actually land.
          backLabel={openClass ? `Back to ${openClass.name}` : 'All families'}
          onBack={() => setParam({ household: null }, true)}
        />
      ) : openClass ? (
        <RosterPanel
          klass={openClass}
          today={today}
          onBack={() => setParam({ class: null }, true)}
          onOpenHousehold={openHousehold}
        />
      ) : (
        <>
          <TabRow
            panelId="portal-viewer-panel"
            options={VIEWS.map(v => ({ key: v.key, label: v.label }))}
            active={view}
            onSelect={key => setParam({ view: key, household: null, class: null })}
          />

          <div id="portal-viewer-panel" role="tabpanel">
            {view === 'families' && (
              <HouseholdList
                households={households}
                loading={loading}
                error={error}
                onOpen={openHousehold}
                query={queries.families}
                setQuery={setQuery('families')}
                filters={filters.families}
                setFilters={setFilter('families')}
              />
            )}
            {view === 'dancers' && (
              <StudentList
                students={students}
                loading={loading}
                error={error}
                today={today}
                onOpenHousehold={openHousehold}
                query={queries.dancers}
                setQuery={setQuery('dancers')}
                filters={filters.dancers}
                setFilters={setFilter('dancers')}
              />
            )}
            {view === 'classes' && (
              <ClassList
                classes={classes}
                loading={loading}
                error={error}
                onOpen={id => setParam({ class: id, household: null }, true)}
                query={queries.classes}
                setQuery={setQuery('classes')}
                filters={filters.classes}
                setFilters={setFilter('classes')}
              />
            )}
          </div>
        </>
      )}

      </div>

      <p style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.tertiary,
        marginTop: theme.spacing.xl,
      }}>
        Read-only, apart from notes. Enrollments and rosters come from the
        Enrolio import — correct them there, not here.
      </p>
    </div>
  );
};

export default PortalViewerPage;
