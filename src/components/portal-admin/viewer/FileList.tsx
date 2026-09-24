import React, { useEffect, useMemo, useState } from 'react';
import { theme } from '../../../theme';
import { Badge, Button, Card, SearchInput } from '../../ui';
import { ManagerList } from '../shared';
import { useToast } from '../../../contexts/ToastContext';
import { formatFileSize } from '../../../lib/portal';
import { logActivity } from '../../../lib/activityLog';
import { mediaKindOf } from '../../../lib/portalMedia';
import { signDocumentUrls } from '../../../lib/portalStorage';
import {
  formatDuration, streamDownloadHref, streamStatusLabel, streamThumbnailUrl,
} from '../../../lib/portalStream';
import {
  ViewerFile, downloadHref, filePasses, fileWhereLabel, signViewerFile, uploaderOptions, UNKNOWN_UPLOADER,
} from '../../../lib/portalViewerFiles';
import StreamPlayerModal from '../StreamPlayerModal';
import FilterChips from './FilterChips';
import { ChipRow, ResultCount, RowSub, RowTitle } from './ViewerShared';

/**
 * Every file anyone has put in the portal, who put it there, and a way to
 * look at it.
 *
 * Read-only on purpose. Editing and deleting stay in the Portal editor, where
 * the class and its families are on screen — deleting a file from a list of
 * every file in the studio is how the wrong costume list disappears.
 *
 * View and Download are plain anchors on URLs signed in one batch when the
 * list loads, not buttons that sign on tap: window.open() after an await is
 * dropped silently by iOS (see DocumentsSection.openDocument).
 */

const LINK: React.CSSProperties = {
  ...theme.typography.bodySmall,
  fontFamily: theme.fonts.primary,
  fontWeight: 600,
  color: theme.colors.primary,
  textDecoration: 'none',
};

const formatDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const GLYPH: Record<string, string> = {
  video: 'M23 7l-7 5 7 5V7z M14 5H3a2 2 0 00-2 2v10a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2z',
  audio: 'M9 18V5l12-2v13 M9 18a3 3 0 11-6 0 3 3 0 016 0z M21 16a3 3 0 11-6 0 3 3 0 016 0z',
  image: 'M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M21 15l-5-5L5 21',
  file: 'M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7',
};

const Thumb: React.FC<{ file: ViewerFile; url?: string }> = ({ file, url }) => {
  const { doc } = file;
  const kind = doc.streamUid ? 'video' : mediaKindOf(doc.mimeType, doc.fileName);
  const [broken, setBroken] = useState(false);
  const src = doc.streamPlaybackUrl && doc.streamStatus === 'ready'
    ? streamThumbnailUrl(doc.streamPlaybackUrl)
    : (kind === 'image' ? url : undefined);

  return (
    <span style={{
      width: '56px',
      height: '56px',
      flexShrink: 0,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.bg.tertiary,
      border: `1px solid ${theme.colors.bdr.primary}`,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: theme.colors.txt.tertiary,
    }}>
      {src && !broken ? (
        <img src={src} alt="" onError={() => setBroken(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d={GLYPH[kind] ?? GLYPH.file} stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
};

const logOpen = (f: ViewerFile, how: 'view' | 'download') => {
  void logActivity({
    action: 'document_downloaded',
    entityType: 'document',
    entityId: f.doc.id,
    entityTitle: f.doc.title,
    details: { fileName: f.doc.fileName, via: 'viewer', how },
  });
};

export const FileList: React.FC<{
  files: ViewerFile[];
  loading: boolean;
  error: string | null;
  query: string;
  setQuery: (value: string) => void;
  uploader: string | null;
  setUploader: (value: string | null) => void;
}> = ({ files, loading, error, query, setQuery, uploader, setUploader }) => {
  const shown = useMemo(
    () => files.filter(f => filePasses(f, query, uploader)),
    [files, query, uploader],
  );
  const uploaders = useMemo(() => uploaderOptions(files), [files]);

  // Signed once per set of files, not per render — pathKey, not the array.
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [signing, setSigning] = useState(false);
  const pathKey = files.map(f => f.doc.storagePath ?? '').join(' ');
  useEffect(() => {
    const paths = files.map(f => f.doc.storagePath).filter((p): p is string => Boolean(p));
    if (!paths.length) { setSigned({}); return; }
    let cancelled = false;
    setSigning(true);
    signDocumentUrls(paths).then(map => {
      if (cancelled) return;
      setSigned(map);
      setSigning(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  const { error: toastError } = useToast();
  const [opening, setOpening] = useState<string | null>(null);
  // Played here, not on Cloudflare's /watch page — see StreamPlayerModal.
  const [playing, setPlaying] = useState<ViewerFile['doc'] | null>(null);
  const openOne = async (f: ViewerFile) => {
    if (!f.doc.storagePath || opening) return;
    setOpening(f.doc.id);
    const url = await signViewerFile(f.doc.storagePath);
    setOpening(null);
    if (!url) {
      toastError('That file could not be opened. It may have been removed from storage.');
      return;
    }
    logOpen(f, 'view');
    window.location.assign(url);
  };

  const filtering = query !== '' || uploader !== null;

  return (
    <>
      <div style={{ marginBottom: theme.spacing.sm }}>
        <SearchInput
          placeholder="Search a file, class or who uploaded it…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onClear={() => setQuery('')}
        />
      </div>

      {uploaders.length > 1 && (
        <FilterChips
          label="Uploaded by"
          options={uploaders.map(u => ({ value: u.value, label: `${u.label} (${u.count})` }))}
          selected={uploader ? [uploader] : []}
          onToggle={v => setUploader(uploader === v ? null : v)}
        />
      )}

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.sm,
      }}>
        <ResultCount shown={shown.length} total={files.length} noun="files" />
        {filtering && (
          <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setUploader(null); }}>
            Clear
          </Button>
        )}
      </div>

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={shown.length === 0}
        emptyTitle={filtering ? 'No file matches that' : 'No files uploaded yet'}
        emptyDescription={filtering ? 'Clear a filter to widen the search.' : undefined}
      >
        {shown.map(f => {
          const { doc } = f;
          const url = doc.storagePath ? signed[doc.storagePath] : undefined;
          const status = streamStatusLabel(doc.streamStatus);
          const when = formatDate(doc.createdAt);
          return (
            <Card key={doc.id} padding="sm">
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Thumb file={f} url={url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <RowTitle>{doc.title}</RowTitle>
                  <RowSub>
                    Uploaded by{' '}
                    <strong style={{ color: theme.colors.txt.secondary, fontWeight: 600 }}>
                      {f.uploaderName ?? UNKNOWN_UPLOADER}
                    </strong>
                    {when && ` · ${when}`}
                  </RowSub>
                  <RowSub>{fileWhereLabel(f)}</RowSub>
                  <RowSub mono>
                    {[doc.fileName, formatFileSize(doc.sizeBytes), formatDuration(doc.durationSeconds)]
                      .filter(Boolean).join(' · ')}
                  </RowSub>
                  <ChipRow>
                    {doc.isPublished
                      ? <Badge variant="success" size="sm">Live</Badge>
                      : <Badge variant="default" size="sm">Draft</Badge>}
                    {doc.streamUid && <Badge variant="info" size="sm">Video</Badge>}
                    {doc.category && <Badge variant="default" size="sm">{doc.category}</Badge>}
                    {status && (
                      <Badge variant={doc.streamStatus === 'error' ? 'danger' : 'warning'} size="sm">
                        {status}
                      </Badge>
                    )}
                  </ChipRow>

                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: theme.spacing.sm,
                  }}>
                    {doc.streamPlaybackUrl ? (
                      <>
                        {doc.streamStatus === 'ready' && (
                          <button type="button"
                            onClick={() => { logOpen(f, 'view'); setPlaying(doc); }}
                            style={{ ...LINK, appearance: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                            Watch
                          </button>
                        )}
                        {doc.streamDownloadUrl && (
                          <a href={streamDownloadHref(doc.streamDownloadUrl, doc.title)}
                            onClick={() => logOpen(f, 'download')} style={LINK}>
                            Download
                          </a>
                        )}
                      </>
                    ) : url ? (
                      <>
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          onClick={() => logOpen(f, 'view')} style={LINK}>
                          View
                        </a>
                        <a href={downloadHref(url, doc.fileName)}
                          onClick={() => logOpen(f, 'download')} style={LINK}>
                          Download
                        </a>
                      </>
                    ) : signing ? (
                      <span style={{ ...theme.typography.bodySmall, color: theme.colors.txt.tertiary }}>
                        Preparing link…
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ paddingLeft: 0 }}
                        loading={opening === doc.id}
                        disabled={opening !== null}
                        onClick={() => openOne(f)}
                      >
                        Open
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </ManagerList>

      <StreamPlayerModal doc={playing} onClose={() => setPlaying(null)} />
    </>
  );
};

export default FileList;
