import React, { useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { theme } from '../../theme';
import { Button, PageHeader, Spinner } from '../../components/ui';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAdmin } from '../../contexts/PortalAdminContext';
import { useAdminList } from '../../components/portal-admin/useAdminList';
import UpdatesSection from '../../components/portal-admin/UpdatesSection';
import DocumentsSection from '../../components/portal-admin/DocumentsSection';
import EventsSection from '../../components/portal-admin/EventsSection';
import ClassesSection from '../../components/portal-admin/ClassesSection';
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
 * Within the screen the split is finer: Classes and Access are admin-only
 * because their write policies are, and a teacher's audience picker offers
 * their own classes and no studio-wide option, because can_edit_portal_class()
 * refuses a NULL class_id for anyone who is not an admin. Every one of those is
 * a mirror of a policy, never the thing enforcing it.
 *
 * The program and section live in the query string so a refresh, a bookmark or
 * a link pasted to a colleague all land in the same place.
 */

type SectionKey = 'updates' | 'documents' | 'calendar' | 'classes' | 'access';

const SECTIONS: { key: SectionKey; label: string; adminOnly?: boolean }[] = [
  { key: 'updates', label: 'Updates' },
  { key: 'documents', label: 'Files' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'classes', label: 'Classes' },
  { key: 'access', label: 'Access', adminOnly: true },
];

/**
 * Shared look for both rows; the outer one is just bolder.
 *
 * `panelId` turns it into a real tab set — tablist, tabs and the panel they
 * control. The program row leaves it off and is announced as a plain group,
 * because those choices swap the whole screen rather than one panel, and
 * claiming otherwise gives a screen reader a contract the page does not keep.
 */
const TabRow: React.FC<{
  options: { key: string; label: string }[];
  active: string;
  onSelect: (key: string) => void;
  emphasis?: boolean;
  panelId?: string;
  groupLabel?: string;
}> = ({ options, active, onSelect, emphasis, panelId, groupLabel }) => (
  <div
    role={panelId ? 'tablist' : 'group'}
    aria-label={groupLabel}
    style={{
      display: 'flex',
      gap: '4px',
      flexWrap: 'wrap',
      borderBottom: `1px solid ${theme.colors.bdr.primary}`,
      marginBottom: emphasis ? '16px' : '24px',
    }}
  >
    {options.map(opt => {
      const isActive = opt.key === active;
      return (
        <button
          key={opt.key}
          role={panelId ? 'tab' : undefined}
          aria-selected={panelId ? isActive : undefined}
          aria-controls={panelId}
          aria-current={panelId ? undefined : isActive}
          onClick={() => onSelect(opt.key)}
          style={{
            appearance: 'none',
            background: 'none',
            border: 'none',
            borderBottom: `2px solid ${isActive ? theme.colors.primary : 'transparent'}`,
            padding: emphasis ? '10px 16px' : '8px 14px',
            cursor: 'pointer',
            color: isActive ? theme.colors.txt.primary : theme.colors.txt.tertiary,
            fontFamily: theme.fonts.primary,
            fontSize: emphasis ? '15px' : '14px',
            fontWeight: isActive ? 700 : 500,
            letterSpacing: '0.01em',
          }}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

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

  const requestedSection = params.get('section') as SectionKey | null;
  const section: SectionKey = sections.some(s => s.key === requestedSection)
    ? (requestedSection as SectionKey)
    : 'updates';

  // Classes are loaded once for the program and handed to every section: the
  // updates, files and calendar editors all need the same list to label rows
  // and fill their audience picker.
  const { data: classes, loading: classesLoading, error: classesError, reload: reloadClasses } =
    useAdminList<PortalClass[]>(program?.id, fetchClasses, []);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
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
            onSelect={key => setParam('program', key)}
          />

          <TabRow
            panelId="portal-manager-panel"
            options={sections.map(s => ({ key: s.key, label: s.label }))}
            active={section}
            onSelect={key => setParam('section', key)}
          />

          <div id="portal-manager-panel" role="tabpanel">
          {section === 'updates' && (
            <UpdatesSection program={program} classes={classes} />
          )}
          {section === 'documents' && (
            <DocumentsSection program={program} classes={classes} />
          )}
          {section === 'calendar' && (
            <EventsSection program={program} classes={classes} />
          )}
          {section === 'classes' && (
            <ClassesSection
              program={program}
              classes={classes}
              loading={classesLoading}
              error={classesError}
              reload={reloadClasses}
            />
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
