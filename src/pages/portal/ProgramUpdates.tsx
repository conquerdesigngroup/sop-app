import React from 'react';
import { theme } from '../../theme';
import { Badge, Card, EmptyState, Spinner } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import { usePortal } from '../../contexts/PortalContext';
import { portalRoutes } from '../../lib/portal';
import { useProgramPage, useProgramQuery } from './useProgramPage';
import { PortalUpdate } from '../../types';

/**
 * All published announcements for a program — studio-wide and per-class in one
 * feed, pinned first, then newest.
 */

export const formatUpdateDate = (iso: string | null): string | null => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/**
 * Renders an update body as paragraphs.
 *
 * Plain text split on blank lines, deliberately not HTML or markdown: this text
 * is written by staff and rendered for parents, and passing it through
 * dangerouslySetInnerHTML would turn the update editor into stored XSS against
 * every family. React escapes each line for free.
 */
export const UpdateBody: React.FC<{ body: string }> = ({ body }) => (
  <>
    {body.split(/\n\s*\n/).filter(Boolean).map((para, i) => (
      <p
        key={i}
        style={{
          ...theme.typography.body,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.secondary,
          margin: i === 0 ? '0 0 12px' : '0 0 12px',
          whiteSpace: 'pre-wrap',
        }}
      >
        {para}
      </p>
    ))}
  </>
);

const ProgramUpdates: React.FC = () => {
  const { slug, program } = useProgramPage();
  const { fetchUpdates } = usePortal();
  const { data: updates, loading, error } = useProgramQuery<PortalUpdate[]>(program?.id, fetchUpdates, []);

  return (
    <PortalLayout
      title="Updates"
      subtitle={program?.name}
      backTo={portalRoutes.program(slug)}
      slug={slug}
    >
      <div style={{ maxWidth: '720px' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <Spinner size={28} color={theme.colors.primary} />
          </div>
        )}

        {!loading && error && (
          <Card><p style={{ ...theme.typography.body, fontFamily: theme.fonts.primary, color: theme.colors.txt.secondary, margin: 0 }}>{error}</p></Card>
        )}

        {!loading && !error && updates.length === 0 && (
          <EmptyState
            title="No updates yet"
            description="Announcements from the studio and your teachers will show up here."
          />
        )}

        {!loading && !error && updates.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {updates.map(u => (
              <Card key={u.id}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  flexWrap: 'wrap',
                }}>
                  {u.isPinned && <Badge variant="primary" size="sm">Pinned</Badge>}
                  {formatUpdateDate(u.publishedAt) && (
                    <span style={{
                      ...theme.typography.captionSmall,
                      fontFamily: theme.fonts.mono,
                      color: theme.colors.txt.tertiary,
                    }}>
                      {formatUpdateDate(u.publishedAt)}
                    </span>
                  )}
                </div>

                <h2 style={{
                  ...theme.typography.h3,
                  color: theme.colors.txt.primary,
                  margin: '0 0 10px',
                }}>
                  {u.title}
                </h2>

                <UpdateBody body={u.body} />
              </Card>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default ProgramUpdates;
