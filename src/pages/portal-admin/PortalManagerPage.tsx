import React, { useMemo } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { theme } from '../../theme';
import { Button, PageHeader, Spinner } from '../../components/ui';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAdmin } from '../../contexts/PortalAdminContext';
import { useAdminList } from '../../components/portal-admin/useAdminList';
import { TabRow } from '../../components/portal-admin/shared';
import PortalAdminTabs from '../../components/portal-admin/PortalAdminTabs';
import UpdatesSection from '../../components/portal-admin/UpdatesSection';
import EventsSection from '../../components/portal-admin/EventsSection';
import ClassesSection from '../../components/portal-admin/ClassesSection';
import TeachersSection from '../../components/portal-admin/TeachersSection';
import ClassWorkspace from '../../components/portal-admin/ClassWorkspace';
import AccessSection from '../../components/portal-admin/AccessSection';
import { PortalClass } from '../../types';
import { portalRoutes, isProgramSlug } from '../../lib/portal';

/**
 * The staff side of the parent portal: everything families see, editable
 * without opening the SQL editor.
 *
 * WHO GETS HERE
 *
 * Not admins — authors. can_edit_portal() answers that, and it is true for an
 * admin or for anyone holding a class. Gating this route on `isAdmin` would
 * lock out the instructors the per-class grants were built for.
 *
 * Within the screen the split is finer: editing a class RECORD and the Access
 * codes are admin-only because their write policies are, while a class's own
 * content is open to whoever holds that class. Every one of those is a mirror of
 * a policy, never the thing enforcing it.
 *
 * WHY THREE SECTIONS AND NOT FIVE
 *
 * Updates, Files and Calendar used to be three sibling lists with a class
 * dropdown on each row. Files has moved inside the class it belongs to, next to
 * that class's updates, because a class is the unit people actually think in —
 * see ClassWorkspace. What is left at this level is genuinely studio-wide:
 * Updates that go to a whole program, and the Calendar.
 *
 * The program, section and open class live in the query string so a refresh, a
 * bookmark or a link pasted to a colleague all land in the same place.
 */

type SectionKey = 'classes' | 'teachers' | 'updates' | 'calendar' | 'access';

/**
 * Classes lead: it is the way in to most of what anyone comes here to do, and
 * for a teacher it is the only section they can write to.
 *
 * Access code is not a fourth content section — it is the program's gate — but
 * it has nowhere better to live and is admin-only, so it sits last.
 *
 * Labelled "Access code" rather than "Access", because the owner asked for a
 * way to change the parent portal's password that had been sitting behind that
 * tab since v11. One word made the difference between a feature existing and a
 * feature being findable. Both things on that screen are about the code — what
 * it is, and whether one is required at all — so the longer label is no less
 * accurate. TabRow wraps, so it costs nothing on a phone.
 */
const SECTIONS: { key: SectionKey; label: string; adminOnly?: boolean }[] = [
  { key: 'classes', label: 'Classes' },
  // The one-pass way to fill in portal_class_instructors. Admin-only because
  // portal_ci_write is, and studio-wide rather than per-program even though it
  // sits under a program tab — a teacher holds Academy and All-Star classes
  // alike, and splitting the job in two is how half of it gets forgotten.
  { key: 'teachers', label: 'Teachers', adminOnly: true },
  // Admin-only, because a program-wide post has class_id NULL and
  // can_edit_portal_class(NULL) is false for everybody but an admin. Without
  // this a teacher saw a "New info post" button whose every save came back
  // "Pick one of your own classes" — a button that cannot work. Their posts go
  // through the class workspace, which is the right place for them anyway.
  { key: 'updates', label: 'Info', adminOnly: true },
  // Admin-only since v44, and for the same reason as Info above: writing
  // portal_events is now is_admin() alone, so every save a teacher made here
  // would come back refused. Their class's events are still readable — they
  // just are not theirs to change.
  { key: 'calendar', label: 'Calendar', adminOnly: true },
  { key: 'access', label: 'Access code', adminOnly: true },
];

const PortalManagerPage: React.FC = () => {
  const { canEdit, checking, programs, programsLoading, fetchClasses } = usePortalAdmin();
  const { isAdmin, isSuperAdmin } = useAuth();
  const { isMobileOrTablet } = useResponsive();
  const [params, setParams] = useSearchParams();

  const sections = SECTIONS.filter(s => isAdmin || !s.adminOnly);

  const programSlug = params.get('program');
  const program = useMemo(
    () => programs.find(p => p.slug === programSlug) ?? programs[0],
    [programs, programSlug]
  );

  // An unknown section — including the retired 'documents', which may still be
  // in someone's bookmark — falls through to Classes rather than erroring.
  const requestedSection = params.get('section') as SectionKey | null;
  const section: SectionKey = sections.some(s => s.key === requestedSection)
    ? (requestedSection as SectionKey)
    : 'classes';

  // Classes are loaded once for the program and handed to every section: the
  // updates, files and calendar editors all need the same list to label rows
  // and fill their audience picker.
  const { data: classes, loading: classesLoading, error: classesError, reload: reloadClasses } =
    useAdminList<PortalClass[]>(program?.id, fetchClasses, []);

  // A class id that does not match a class in THIS program is ignored rather
  // than trusted: the param survives a program switch and a deletion, and
  // handing a stale id to the workspace would render another program's class.
  const openClassId = params.get('class');
  const openClass = openClassId
    ? classes.find(c => c.id === openClassId) ?? null
    : null;

  const setParam = (key: string, value: string, drop: string[] = []) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    drop.forEach(k => next.delete(k));
    setParams(next, { replace: true });
  };

  const closeClass = () => {
    const next = new URLSearchParams(params);
    next.delete('class');
    setParams(next, { replace: true });
  };

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
        <Spinner size={32} color={theme.colors.primary} />
      </div>
    );
  }

  // Not an author: no portal entry exists in the nav for them either, so this
  // only fires on a typed URL.
  if (!canEdit) return <Navigate to="/dashboard" replace />;

  return (
    <div style={{
      padding: isMobileOrTablet ? '16px' : '40px',
      maxWidth: '1400px',
      margin: '0 auto',
    }}>
      <PageHeader
        title="Portal editor"
        subtitle="What families see when they open the parent portal"
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {/* Admin-only like its route: instructors manage classes here, not
                other families' logins. */}
            {isAdmin && (
              <Link to="/portal-admin/clients" style={{ textDecoration: 'none' }}>
                <Button variant="outline">Client accounts</Button>
              </Link>
            )}
            {program && isProgramSlug(program.slug) && (
              <Button
                variant="outline"
                onClick={() => window.open(portalRoutes.program(program.slug), '_blank', 'noopener,noreferrer')}
              >
                View as a parent
              </Button>
            )}
          </div>
        }
      />

      <PortalAdminTabs active="editor" canViewEveryone={isSuperAdmin} />

      {programsLoading && !program && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <Spinner size={28} color={theme.colors.primary} />
        </div>
      )}

      {!programsLoading && !program && (
        <p style={{
          ...theme.typography.body,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.secondary,
        }}>
          No portal programs are set up yet.
        </p>
      )}

      {program && (
        <>
          <TabRow
            emphasis
            groupLabel="Portal section"
            options={programs.map(p => ({ key: p.slug, label: p.name }))}
            active={program.slug}
            onSelect={key => setParam('program', key, ['class'])}
          />

          <TabRow
            panelId="portal-manager-panel"
            options={sections.map(s => ({ key: s.key, label: s.label }))}
            active={section}
            onSelect={key => setParam('section', key, ['class'])}
          />

          <div id="portal-manager-panel" role="tabpanel">
          {section === 'classes' && (
            openClass ? (
              <ClassWorkspace
                program={program}
                klass={openClass}
                classes={classes}
                onBack={closeClass}
              />
            ) : (
              <ClassesSection
                program={program}
                classes={classes}
                loading={classesLoading}
                error={classesError}
                reload={reloadClasses}
                onOpenClass={id => setParam('class', id)}
              />
            )
          )}
          {/* Studio-wide, not this program's: a teacher crosses both. */}
          {section === 'teachers' && isAdmin && <TeachersSection />}
          {/* Studio-wide only. A class's own updates are in its workspace. */}
          {section === 'updates' && (
            <UpdatesSection program={program} classes={classes} scope={{ classId: null }} />
          )}
          {section === 'calendar' && (
            <EventsSection program={program} classes={classes} />
          )}
          {section === 'access' && isAdmin && (
            <AccessSection program={program} />
          )}
          </div>
        </>
      )}
    </div>
  );
};

export default PortalManagerPage;
