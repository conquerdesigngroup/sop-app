import React, { useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { theme } from '../../theme';
import { Button, PageHeader, Spinner } from '../../components/ui';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAdmin } from '../../contexts/PortalAdminContext';
import { useAdminList } from '../../components/portal-admin/useAdminList';
import { TabRow } from '../../components/portal-admin/shared';
import UpdatesSection from '../../components/portal-admin/UpdatesSection';
import EventsSection from '../../components/portal-admin/EventsSection';
import ClassesSection from '../../components/portal-admin/ClassesSection';
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

type SectionKey = 'classes' | 'updates' | 'calendar' | 'access';

/**
 * Classes lead: it is the way in to most of what anyone comes here to do, and
 * for a teacher it is the only section they can write to.
 *
 * Access is not a fourth content section — it is the program's access code — but
 * it has nowhere better to live and is admin-only, so it sits last.
 */
const SECTIONS: { key: SectionKey; label: string; adminOnly?: boolean }[] = [
  { key: 'classes', label: 'Classes' },
  { key: 'updates', label: 'Info' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'access', label: 'Access', adminOnly: true },
];

const PortalManagerPage: React.FC = () => {
  const { canEdit, checking, programs, programsLoading, fetchClasses } = usePortalAdmin();
  const { isAdmin } = useAuth();
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
        title="Portal"
        subtitle="What families see when they open the parent portal"
        actions={
          program && isProgramSlug(program.slug) ? (
            <Button
              variant="outline"
              onClick={() => window.open(portalRoutes.program(program.slug), '_blank', 'noopener,noreferrer')}
            >
              View as a parent
            </Button>
          ) : undefined
        }
      />

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
