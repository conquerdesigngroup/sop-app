import React, { useState } from 'react';
import { theme } from '../../theme';
import { Card, EmptyState, Spinner } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import { usePortal } from '../../contexts/PortalContext';
import { portalRoutes, formatFileSize } from '../../lib/portal';
import { useProgramPage, useProgramQuery } from './useProgramPage';
import { PortalDocument } from '../../types';

/**
 * Downloads for a program — handouts, policies, music, forms.
 *
 * The bucket is private, so there is no URL to render into an href up front.
 * Each row signs on demand and then opens the result. That keeps links
 * short-lived rather than minting a permanent handle for every file on every
 * page view, and means a copied link stops working within the hour.
 */

const FileIcon: React.FC<{ mime: string | null }> = ({ mime }) => {
  const isImage = !!mime?.startsWith('image/');
  const isAudio = !!mime?.startsWith('audio/');

  const d = isImage
    ? 'M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M21 15l-5-5L5 21'
    : isAudio
      ? 'M9 18V5l12-2v13 M9 18a3 3 0 11-6 0 3 3 0 016 0z M21 16a3 3 0 11-6 0 3 3 0 016 0z'
      : 'M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7';

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const DocumentRow: React.FC<{ doc: PortalDocument }> = ({ doc }) => {
  const { getDocumentUrl } = usePortal();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = async () => {
    setBusy(true);
    setFailed(false);
    const url = await getDocumentUrl(doc.storagePath);
    setBusy(false);

    if (!url) {
      setFailed(true);
      return;
    }
    // noopener on a programmatic open for the same reason as on a link: the
    // opened document should not get a handle back on this tab.
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const meta = [doc.category, formatFileSize(doc.sizeBytes)].filter(Boolean).join(' · ');

  return (
    <button
      onClick={open}
      disabled={busy}
      style={{
        backgroundColor: theme.colors.bg.secondary,
        border: `2px solid ${theme.colors.bdr.primary}`,
        borderRadius: theme.borderRadius.lg,
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        textAlign: 'left',
        cursor: busy ? 'wait' : 'pointer',
        width: '100%',
        font: 'inherit',
      }}
    >
      <span style={{
        width: '40px',
        height: '40px',
        flexShrink: 0,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.bg.tertiary,
        color: theme.colors.txt.secondary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <FileIcon mime={doc.mimeType} />
      </span>

      <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
        <span style={{
          ...theme.typography.body,
          fontFamily: theme.fonts.primary,
          fontWeight: 600,
          color: theme.colors.txt.primary,
          display: 'block',
        }}>
          {doc.title}
        </span>

        {doc.description && (
          <span style={{
            ...theme.typography.caption,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.tertiary,
            display: 'block',
            marginTop: '2px',
          }}>
            {doc.description}
          </span>
        )}

        {(meta || failed) && (
          <span style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: failed ? theme.colors.status.error : theme.colors.txt.tertiary,
            display: 'block',
            marginTop: '4px',
          }}>
            {failed ? 'Could not open — try again' : meta}
          </span>
        )}
      </span>

      {busy
        ? <Spinner size={18} color={theme.colors.txt.tertiary} />
        : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
            <path
              d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3"
              style={{ stroke: theme.colors.txt.tertiary }}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
    </button>
  );
};

const ProgramDocuments: React.FC = () => {
  const { slug, program } = useProgramPage();
  const { fetchDocuments } = usePortal();
  const { data: docs, loading, error } = useProgramQuery<PortalDocument[]>(program?.id, fetchDocuments, []);

  return (
    <PortalLayout
      title="Documents"
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

        {!loading && !error && docs.length === 0 && (
          <EmptyState
            title="No documents yet"
            description="Handouts, policies and forms will appear here once the studio uploads them."
          />
        )}

        {!loading && !error && docs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {docs.map(doc => <DocumentRow key={doc.id} doc={doc} />)}
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default ProgramDocuments;
