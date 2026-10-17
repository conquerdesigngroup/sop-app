import React, { useMemo } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { theme } from '../../theme';
import { Badge, Button, Card, PageHeader, Spinner } from '../../components/ui';
import { useResponsive } from '../../hooks/useResponsive';
import { usePortalAdmin } from '../../contexts/PortalAdminContext';
import { useAdminList } from '../../components/portal-admin/useAdminList';
import { ManagerList, RowMeta, classSummary } from '../../components/portal-admin/shared';
import { PortalClass } from '../../types';

/**
 * A teacher's own classes, in one list, one tap from the dashboard.
 *
 * WHY THIS IS NOT A FILTER ON THE PORTAL EDITOR
 *
 * The editor is scoped to one program at a time — it has to be, because almost
 * everything on it (Info, Calendar, the access code) belongs to a program. A
 * teacher does not: the Teachers section says so in as many words, "a teacher
 * holds Academy and All-Star classes alike". So a "mine" checkbox inside the
 * editor would still make someone who teaches in both programs switch tabs to
 * find half their classes, which is the search this page exists to remove.
 *
 * WHAT IT IS NOT
 *
 * Not a second editor. Every row opens the real class workspace in the portal
 * editor, so there is one place where a class is edited and this is a way in
 * to it. Nothing here writes.
 *
 * WHO SEES IT
 *
 * Whoever holds at least one unpaused grant in portal_class_instructors —
 * `editableClassIds`, which is the same list the editor marks "Yours" with.
 * Deliberately not `isAdmin`: can_edit_portal() is true for every admin, so
 * keying off it would put an empty page behind a dashboard tile for every
 * admin who teaches nothing. An admin who DOES hold classes gets it like
 * anyone else.
 *
 * The route is not adminOnly for the same reason /portal-admin is not: the
 * per-class grants exist precisely for people who are not admins. The page
 * turns away anyone can_edit_portal() refuses, and the database refuses them
 * again underneath.
 */
const MyClassesPage: React.FC = () => {
  const { canEdit, checking, editableClassIds, programs, fetchAllClasses } = usePortalAdmin();
  const { isMobileOrTablet } = useResponsive();
  const navigate = useNavigate();

  // Keyed on a constant rather than a program: this list crosses all of them.
  // useAdminList is still the right hook — it brings the silent app-wide
  // refresh and the stale-response guard with it, and fetchAllClasses simply
  // ignores the key it is handed.
  const { data: allClasses, loading, error } = useAdminList<PortalClass[]>(
    canEdit ? 'my-classes' : undefined,
    fetchAllClasses,
    []
  );

  const mine = useMemo(
    () => allClasses.filter(c => editableClassIds.includes(c.id)),
    [allClasses, editableClassIds]
  );

  /**
   * Grouped by program, in the order the programs themselves are listed, so a
   * teacher who holds classes in both always sees them in the same order.
   * fetchAllClasses already sorts by sort_order then name, and grouping
   * preserves that within each program.
   */
  const groups = useMemo(() => {
    const byProgram = new Map<string, PortalClass[]>();
    for (const c of mine) {
      const list = byProgram.get(c.programId);
      if (list) list.push(c);
      else byProgram.set(c.programId, [c]);
    }

    const ordered = programs
      .filter(p => byProgram.has(p.id))
      .map(p => ({ id: p.id, name: p.name, slug: p.slug, classes: byProgram.get(p.id)! }));

    // A class whose program is not in the list — a program removed from under
    // a live grant — is still the teacher's class and still has to be
    // reachable. Shown last, without a program link rather than hidden.
    const known = new Set(ordered.map(g => g.id));
    const orphans = mine.filter(c => !known.has(c.programId));

    return orphans.length > 0
      ? [...ordered, { id: 'other', name: 'Other', slug: null as string | null, classes: orphans }]
      : ordered;
  }, [mine, programs]);

  const openClass = (slug: string | null, classId: string) => {
    const query = new URLSearchParams({ section: 'classes', class: classId });
    if (slug) query.set('program', slug);
    navigate(`/portal-admin?${query.toString()}`);
  };

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
        <Spinner size={32} color={theme.colors.primary} />
      </div>
    );
  }

  // Same as the editor: no portal entry exists in the nav for a non-author, so
  // this only fires on a typed URL.
  if (!canEdit) return <Navigate to="/dashboard" replace />;

  return (
    <div style={{
      padding: isMobileOrTablet ? '16px' : '40px',
      maxWidth: '1400px',
      margin: '0 auto',
    }}>
      <PageHeader
        title="My classes"
        subtitle="The classes you teach, across both programs"
        actions={
          <Link to="/portal-admin" style={{ textDecoration: 'none' }}>
            <Button variant="outline">Portal editor</Button>
          </Link>
        }
      />

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={mine.length === 0}
        emptyTitle="No classes are assigned to you yet"
        emptyDescription="An admin assigns classes under Portal editor → Teachers. Once yours are set, they appear here."
      >
        {groups.map(group => (
          <section key={group.id} aria-label={group.name}>
            {/* Not an h2: index.css forces every h2 to 22px on a phone with
                !important, over any inline size. The section's own name is
                what a screen reader announces. */}
            <div
              aria-hidden="true"
              style={{
                fontFamily: theme.fonts.mono,
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: theme.colors.txt.tertiary,
                margin: '0 0 8px',
              }}
            >
              {group.name}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {group.classes.map(c => (
                <Card key={c.id}>
                  <div style={{
                    display: 'flex',
                    // Wraps, because this row holds a class name of any length
                    // beside a button: on a 320px phone an unwrapped row puts
                    // Open off the right edge.
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}>
                    {/* minWidth 0 AND overflowWrap: a flex item will not shrink
                        below its content's min-content width, and a class name
                        like "Turns & Jumps" has little to break at. */}
                    <div style={{ flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                        {c.style && <Badge variant="default" size="sm">{c.style}</Badge>}
                        {!c.isActive && <Badge variant="default" size="sm">Hidden</Badge>}
                      </div>

                      <h3 style={{
                        ...theme.typography.h3,
                        color: theme.colors.txt.primary,
                        margin: '0 0 6px',
                        wordBreak: 'break-word',
                      }}>
                        {c.name}
                      </h3>

                      <RowMeta>
                        <span>{classSummary(c)}</span>
                        {c.location && <span>· {c.location}</span>}
                        {c.ageGroup && <span>· {c.ageGroup}</span>}
                      </RowMeta>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openClass(group.slug, c.id)}
                      aria-label={`Open ${c.name}`}
                    >
                      Open
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </ManagerList>
    </div>
  );
};

export default MyClassesPage;
