import React, { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { theme } from '../../theme';
import { Badge, Card, EmptyState, Spinner } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import { usePortal } from '../../contexts/PortalContext';
import { portalRoutes, formatClassSchedule, CLASS_CATEGORY_LABEL } from '../../lib/portal';
import { ageRangeLabel, durationLabel } from '../../lib/portalClasses';
import { useProgramPage } from './useProgramPage';
import { formatUpdateDate, UpdateBody } from './ProgramUpdates';
import { DocumentList } from '../../components/portal/DocumentList';
import { PortalClass, PortalDocument, PortalUpdate } from '../../types';

/**
 * One class: its details, and the updates its teacher has posted.
 *
 * This is the page a parent lands on to find out what is happening in their
 * dancer's class specifically, so the updates are the substance and the
 * schedule is the header.
 *
 * Content sits below the updates. It used to live on a program-wide Documents
 * page; a class's music and choreography notes belong with the class, and the
 * teacher who holds it can now post them here rather than asking an admin to
 * upload something studio-wide.
 *
 * Photos and videos render in place rather than listing as downloads — see
 * components/portal/DocumentList.tsx, which decides that per file.
 *
 * THE CLASS AND THE ROUTE CAN BELONG TO DIFFERENT PROGRAMS
 *
 * The All-Star schedule lists Academy and TNT classes, so /portal/allstars/
 * classes/:id routinely opens a class filed under the Academy program. Its
 * updates and files carry the CLASS's program id, not the route's — fetching
 * them by the route would quietly return an empty page for every Academy class
 * reached from the All-Star side. So the class is resolved first, and its own
 * programId drives the two fetches that follow.
 */
const ClassDetail: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const { slug, program } = useProgramPage();
  const { fetchClasses, fetchUpdates, fetchDocuments } = usePortal();

  const [klass, setKlass] = useState<PortalClass | null>(null);
  const [updates, setUpdates] = useState<PortalUpdate[]>([]);
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!program?.id || !classId) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // Two steps rather than one Promise.all: the second pair of fetches is
        // scoped by the class's own program, which is not known until the
        // first has resolved. The list is one indexed query and already in
        // cache from the schedule page in the common case.
        const classes = await fetchClasses(slug);
        if (cancelled) return;

        const found = classes.find(c => c.id === classId) ?? null;
        setKlass(found);
        setNotFound(!found);

        if (!found) {
          setUpdates([]);
          setDocuments([]);
          setError(null);
          return;
        }

        const [classUpdates, classDocs] = await Promise.all([
          fetchUpdates(found.programId, classId),
          fetchDocuments(found.programId, classId),
        ]);
        if (cancelled) return;

        setUpdates(classUpdates);
        setDocuments(classDocs);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        console.error('Failed to load class:', e);
        setError('Could not load this class.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // fetchClasses/fetchUpdates/fetchDocuments are useCallback-stable, and slug
    // moves with program?.id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.id, classId]);

  // An id that is not in this program — a stale link, or a class that has been
  // deactivated since it was shared.
  if (!loading && notFound) {
    return <Navigate to={portalRoutes.classes(slug)} replace />;
  }

  const schedule = klass ? formatClassSchedule(klass.dayOfWeek, klass.startTime, klass.endTime) : null;
  const details = klass
    ? [klass.instructorName, klass.level ? `Level ${klass.level}` : null, klass.location]
        .filter(Boolean)
    : [];

  /**
   * The rest of the catalogue, as label/value pairs.
   *
   * Each one is dropped when it is missing rather than rendered empty: a class
   * added by hand in the manager has none of these, and a column of blank
   * labels reads as a broken page rather than an unfilled one.
   *
   * WHAT IS DELIBERATELY NOT HERE
   *
   * Tuition, class size and age group. All three are still on the row and
   * still editable in the manager — the import filled them in and nothing has
   * thrown them away — but none belongs on a page parents browse. Price and
   * capacity are Enrollio's job and change without this app hearing about it;
   * the age GROUP is a filter rather than a fact, and it only ever repeats
   * what the class name already says. The age RANGE stays, because that is the
   * one a parent is actually asking about. Matches the card in
   * ClassScheduleViews — change the two together or they disagree.
   */
  const facts: { label: string; value: string }[] = klass
    ? ([
        ['Length', durationLabel(klass)],
        ['Ages', ageRangeLabel(klass)],
        ['Style', klass.style],
        ['Studio', klass.location],
        ['Season', klass.season],
      ] as [string, string | null][])
        .filter((pair): pair is [string, string] => !!pair[1])
        .map(([label, value]) => ({ label, value }))
    : [];

  return (
    <PortalLayout
      title={klass?.name ?? 'Loading…'}
      subtitle={program?.name}
      backTo={portalRoutes.classes(slug)}
      slug={slug}
    >
      <div style={{ maxWidth: '720px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <Spinner size={28} color={theme.colors.primary} />
          </div>
        )}

        {!loading && error && (
          <Card><p style={{ ...theme.typography.body, fontFamily: theme.fonts.primary, color: theme.colors.txt.secondary, margin: 0 }}>{error}</p></Card>
        )}

        {!loading && !error && klass && (
          <>
            {(schedule || details.length > 0 || klass.description || facts.length > 0) && (
              <Card>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                  <Badge
                    variant={klass.category === 'allstars' ? 'primary' : klass.category === 'tnt' ? 'warning' : 'info'}
                    size="sm"
                  >
                    {CLASS_CATEGORY_LABEL[klass.category]}
                  </Badge>
                  {klass.style && <Badge variant="default" size="sm">{klass.style}</Badge>}
                </div>

                {schedule && (
                  <div style={{
                    ...theme.typography.body,
                    fontFamily: theme.fonts.mono,
                    color: theme.colors.txt.primary,
                    marginBottom: details.length ? '6px' : 0,
                  }}>
                    {schedule}
                  </div>
                )}

                {details.length > 0 && (
                  <div style={{
                    ...theme.typography.bodySmall,
                    fontFamily: theme.fonts.primary,
                    color: theme.colors.txt.tertiary,
                  }}>
                    {details.join(' · ')}
                  </div>
                )}

                {klass.description && (
                  <p style={{
                    ...theme.typography.body,
                    fontFamily: theme.fonts.primary,
                    color: theme.colors.txt.secondary,
                    margin: '14px 0 0',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {klass.description}
                  </p>
                )}

                {facts.length > 0 && (
                  <dl
                    style={{
                      display: 'grid',
                      // auto-fit rather than a fixed column count: three
                      // columns on a phone would put "Class size" on four lines.
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '12px 18px',
                      margin: '18px 0 0',
                      paddingTop: '16px',
                      borderTop: `1px solid ${theme.colors.bdr.primary}`,
                    }}
                  >
                    {facts.map(fact => (
                      <div key={fact.label} style={{ minWidth: 0 }}>
                        <dt style={{
                          ...theme.typography.captionSmall,
                          fontFamily: theme.fonts.mono,
                          color: theme.colors.txt.tertiary,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          marginBottom: '3px',
                        }}>
                          {fact.label}
                        </dt>
                        <dd style={{
                          ...theme.typography.bodySmall,
                          fontFamily: theme.fonts.primary,
                          color: theme.colors.txt.primary,
                          margin: 0,
                          overflowWrap: 'anywhere',
                        }}>
                          {fact.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Card>
            )}

            <div>
              <h2 style={{
                ...theme.typography.h3,
                color: theme.colors.txt.primary,
                margin: '0 0 12px',
              }}>
                Class info
              </h2>

              {updates.length === 0 ? (
                <EmptyState
                  title="Nothing posted yet"
                  description={`Info from ${klass.instructorName || 'this class’s teacher'} will appear here.`}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {updates.map(u => (
                    <Card key={u.id}>
                      {formatUpdateDate(u.publishedAt) && (
                        <div style={{
                          ...theme.typography.captionSmall,
                          fontFamily: theme.fonts.mono,
                          color: theme.colors.txt.tertiary,
                          marginBottom: '8px',
                        }}>
                          {formatUpdateDate(u.publishedAt)}
                        </div>
                      )}
                      <h3 style={{
                        ...theme.typography.h3,
                        color: theme.colors.txt.primary,
                        margin: '0 0 10px',
                      }}>
                        {u.title}
                      </h3>
                      <UpdateBody body={u.body} />
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Only rendered when there is something to show: an empty Files
                heading on every class page is noise, and unlike updates — where
                "nothing posted yet" is useful reassurance — a class with no
                files is the normal case. */}
            {documents.length > 0 && (
              <div>
                <h2 style={{
                  ...theme.typography.h3,
                  color: theme.colors.txt.primary,
                  margin: '0 0 12px',
                }}>
                  Class content
                </h2>

                <DocumentList documents={documents} />
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
};

export default ClassDetail;
