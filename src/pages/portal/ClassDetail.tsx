import React, { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { theme } from '../../theme';
import { Card, EmptyState, Spinner } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import { usePortal } from '../../contexts/PortalContext';
import { portalRoutes, formatClassSchedule } from '../../lib/portal';
import { useProgramPage } from './useProgramPage';
import { formatUpdateDate, UpdateBody } from './ProgramUpdates';
import { DocumentRow } from '../../components/portal/DocumentRow';
import { PortalClass, PortalDocument, PortalUpdate } from '../../types';

/**
 * One class: its details, and the updates its teacher has posted.
 *
 * This is the page a parent lands on to find out what is happening in their
 * dancer's class specifically, so the updates are the substance and the
 * schedule is the header.
 *
 * Files sit below the updates. They used to live on a program-wide Documents
 * page; a class's music and choreography notes belong with the class, and the
 * teacher who holds it can now post them here rather than asking an admin to
 * upload something studio-wide.
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
        // The class list is small and already indexed by program, so one fetch
        // and a find beats a second round trip for a single row.
        const [classes, classUpdates, classDocs] = await Promise.all([
          fetchClasses(program.id),
          fetchUpdates(program.id, classId),
          fetchDocuments(program.id, classId),
        ]);
        if (cancelled) return;

        const found = classes.find(c => c.id === classId) ?? null;
        setKlass(found);
        setNotFound(!found);
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
    // fetchClasses/fetchUpdates/fetchDocuments are useCallback-stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.id, classId]);

  // An id that is not in this program — a stale link, or a class that has been
  // deactivated since it was shared.
  if (!loading && notFound) {
    return <Navigate to={portalRoutes.classes(slug)} replace />;
  }

  const schedule = klass ? formatClassSchedule(klass.dayOfWeek, klass.startTime, klass.endTime) : null;
  const details = klass ? [klass.instructorName, klass.level, klass.location].filter(Boolean) : [];

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
            {(schedule || details.length > 0 || klass.description) && (
              <Card>
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
              </Card>
            )}

            <div>
              <h2 style={{
                ...theme.typography.h3,
                color: theme.colors.txt.primary,
                margin: '0 0 12px',
              }}>
                Class updates
              </h2>

              {updates.length === 0 ? (
                <EmptyState
                  title="Nothing posted yet"
                  description={`Updates from ${klass.instructorName || 'this class’s teacher'} will appear here.`}
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
                  Class files
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {documents.map(doc => <DocumentRow key={doc.id} doc={doc} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
};

export default ClassDetail;
