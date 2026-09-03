import React, { useEffect, useRef, useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Input, Modal, Textarea, PlusIcon } from '../ui';
import { CustomCheckbox } from '../CustomCheckbox';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuth } from '../../contexts/AuthContext';
import {
  usePortalAdmin, describeWriteError, DocumentInput, StreamUploadProgress,
} from '../../contexts/PortalAdminContext';
import { PortalClass, PortalDocument, PortalProgram } from '../../types';
import { formatFileSize } from '../../lib/portal';
import { logActivity } from '../../lib/activityLog';
import { DOCUMENT_ACCEPT, DOCUMENT_HINT, validateDocumentFile } from '../../lib/portalAdmin';
import { compatibilityWarning, mediaKindOf } from '../../lib/portalMedia';
import {
  goesToStream, validateStreamFile, STREAM_HINT,
  streamThumbnailUrl, streamWatchUrl, streamDownloadHref, streamStatusLabel, formatDuration,
} from '../../lib/portalStream';
import { useAdminList } from './useAdminList';
import { ManagerList, ClassSelect, RowActions, RowMeta, PublishedBadge, audienceLabel, useAutoFocus } from './shared';

/**
 * Handouts, costume lists, permission slips. The first thing in this project to
 * use Supabase Storage — existing image handling base64s into text columns,
 * which is not viable for the PDFs parents actually need.
 *
 * The bucket is private. Nothing here produces a permanent link: a file is read
 * through a one-hour signed URL, minted when someone taps it, both for parents
 * and on this screen.
 *
 * Images get a thumbnail in the list, because "did I upload the right costume
 * photo" is the question this screen is usually open to answer and a file name
 * does not answer it. Everything else gets its icon.
 *
 * The file itself cannot be edited after upload — only its title, audience and
 * visibility. Replacing a file means deleting the row and uploading again,
 * which is deliberate: storage_path is UNIQUE and a silent swap under a link
 * someone has already opened is worse than an obvious re-upload.
 */

/**
 * 56px of "which file is this".
 *
 * Images render themselves; everything else gets a glyph on a tinted tile. A
 * broken image falls back to the glyph too — an admin on a laptop viewing a
 * HEIC a teacher shot on an iPhone is the case, and a torn-page icon in the
 * corner of the manager would look like something is wrong when it is not.
 */
const Thumb: React.FC<{ doc: PortalDocument; url?: string }> = ({ doc, url }) => {
  const kind = mediaKindOf(doc.mimeType, doc.fileName);
  const [broken, setBroken] = useState(false);

  const box: React.CSSProperties = {
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
  };

  // A Stream video has a thumbnail once Cloudflare has processed it; before
  // that, and for every other kind, the glyph.
  const thumb = doc.streamPlaybackUrl && doc.streamStatus === 'ready'
    ? streamThumbnailUrl(doc.streamPlaybackUrl)
    : (kind === 'image' ? url : undefined);

  if (thumb && !broken) {
    return (
      <span style={box}>
        <img
          src={thumb}
          alt=""
          onError={() => setBroken(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </span>
    );
  }

  const d = kind === 'video'
    ? 'M23 7l-7 5 7 5V7z M14 5H3a2 2 0 00-2 2v10a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2z'
    : kind === 'audio'
      ? 'M9 18V5l12-2v13 M9 18a3 3 0 11-6 0 3 3 0 016 0z M21 16a3 3 0 11-6 0 3 3 0 016 0z'
      : kind === 'image'
        ? 'M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M21 15l-5-5L5 21'
        : 'M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7';

  return (
    <span style={box}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
};

const OPEN_LINK: React.CSSProperties = {
  display: 'inline-block',
  marginTop: '8px',
  ...theme.typography.bodySmall,
  fontFamily: theme.fonts.primary,
  fontWeight: 600,
  color: theme.colors.primary,
  textDecoration: 'none',
};

const emptyMeta = (programId: string, classId: string | null): DocumentInput => ({
  programId,
  classId,
  title: '',
  description: '',
  category: '',
  sortOrder: 0,
  isPublished: true,
});

/**
 * `scope` narrows the section to one audience and pins new uploads to it. Same
 * contract as UpdatesSection — see the note there. Presentation only: the
 * canEditClass guards below are untouched and remain what actually decides.
 */
const DocumentsSection: React.FC<{
  program: PortalProgram;
  classes: PortalClass[];
  scope?: { classId: string | null };
}> = ({ program, classes, scope }) => {
  const {
    fetchDocuments, uploadDocument, uploadStreamVideo, refreshStreamStatus,
    saveDocumentMeta, deleteDocument,
    getDocumentUrl, getDocumentUrls,
    canEditClass, editableClassIds,
  } = usePortalAdmin();
  const { isAdmin } = useAuth();
  const { success, error: toastError } = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const { data: documents, loading, error, reload } = useAdminList<PortalDocument[]>(
    program.id, fetchDocuments, []
  );

  // Filtered here rather than refetched per class — see UpdatesSection.
  const rows = scope ? documents.filter(d => d.classId === scope.classId) : documents;

  /**
   * Signed URLs for the whole list, in one request.
   *
   * Feeds the thumbnails, and means Open is a real anchor rather than a button
   * that signs first — see the note on openDocument below.
   */
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const pathKey = rows.map(d => d.storagePath ?? '').join(' ');

  useEffect(() => {
    const paths = rows.map(d => d.storagePath).filter((p): p is string => Boolean(p));
    if (paths.length === 0) {
      setPreviews({});
      return;
    }
    let cancelled = false;
    getDocumentUrls(paths).then(signed => { if (!cancelled) setPreviews(signed); });
    return () => { cancelled = true; };
    // pathKey, not rows: `rows` is a fresh array every render and would
    // re-sign forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey, getDocumentUrls]);

  /**
   * Videos Cloudflare is still working on. Two kinds: rows that say 'pending'
   * (still encoding) and rows that are ready but have no MP4 yet (Cloudflare
   * builds the download after the encode, and only when asked — the status
   * call is what asks). While there is any such row, ask every ten seconds
   * and refetch the list the moment one moves — that is what turns
   * "Processing" into a thumbnail, and then into a Download link, without
   * anyone reloading. The function writes the answer onto the row, so a
   * parent's page picks it up on its next load too.
   *
   * Capped at ten minutes per mount so a download Cloudflare never finishes
   * does not keep a forgotten tab asking forever.
   *
   * reload comes through a ref: its identity is the list hook's business and
   * this effect must not restart the timer every render.
   */
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const watchKey = rows
    .filter(d => d.streamUid && (
      d.streamStatus === 'pending' || (d.streamStatus === 'ready' && !d.streamDownloadUrl)
    ))
    .map(d => `${d.streamUid}:${d.streamStatus}`)
    .join(' ');

  useEffect(() => {
    if (!watchKey) return;
    let cancelled = false;
    let checks = 0;
    const watched = watchKey.split(' ').map(entry => {
      const [uid, status] = entry.split(':');
      return { uid, status };
    });
    const check = async () => {
      if (++checks > 60) { window.clearInterval(timer); return; }
      const results = await Promise.all(
        watched.map(w => refreshStreamStatus(w.uid).catch(() => null)),
      );
      const moved = results.some((r, i) =>
        r !== null && (r.status !== watched[i].status || r.downloadUrl !== null));
      if (!cancelled && moved) reloadRef.current();
    };
    const timer = window.setInterval(check, 10000);
    void check();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [watchKey, refreshStreamStatus]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<DocumentInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'uploading' | 'saving'>('idle');
  // The Stream path reports finer progress than the bucket path's two stages.
  const [progress, setProgress] = useState<StreamUploadProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [formError, setFormError] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const focusRef = useAutoFocus(meta !== null);

  // Inside a class workspace the audience is wherever you are standing.
  const defaultClassId = scope
    ? scope.classId
    : (isAdmin ? null : (editableClassIds[0] ?? null));
  const busy = stage !== 'idle' || progress !== null;

  const startUpload = () => {
    setFormError('');
    setFile(null);
    setEditingId(null);
    setMeta(emptyMeta(program.id, defaultClassId));
  };

  const startEdit = (doc: PortalDocument) => {
    setFormError('');
    setFile(null);
    setEditingId(doc.id);
    setMeta({
      programId: doc.programId,
      classId: doc.classId,
      title: doc.title,
      description: doc.description,
      category: doc.category ?? '',
      sortOrder: doc.sortOrder,
      isPublished: doc.isPublished,
    });
  };

  const closeModal = () => {
    if (busy) return;
    setMeta(null);
    setFile(null);
    setEditingId(null);
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return;

    const problem = goesToStream(picked) ? validateStreamFile(picked) : validateDocumentFile(picked);
    if (problem) {
      setFormError(problem);
      setFile(null);
      // Clear the input so picking the same file again re-fires onChange.
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFormError('');
    setFile(picked);
    // Name the document after the file unless someone has already typed a title.
    setMeta(prev => prev && !prev.title.trim()
      ? { ...prev, title: picked.name.replace(/\.[^.]+$/, '') }
      : prev);
  };

  const handleSave = async () => {
    if (!meta) return;

    if (!meta.title.trim()) {
      setFormError('Give it a name — that is what parents see in the list.');
      return;
    }
    if (!canEditClass(meta.classId)) {
      setFormError('Pick one of your own classes. Studio-wide files are admin-only.');
      return;
    }
    if (!editingId && !file) {
      setFormError('Choose a file to upload.');
      return;
    }

    try {
      if (editingId) {
        setStage('saving');
        await saveDocumentMeta({ ...meta, id: editingId });
        success('File details updated.');
      } else if (goesToStream(file!)) {
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          await uploadStreamVideo(file!, meta, setProgress, controller.signal);
        } finally {
          abortRef.current = null;
          setProgress(null);
        }
        success('Video uploaded. Parents will see it once Cloudflare finishes processing — usually a few minutes.');
      } else {
        await uploadDocument(file!, program.slug, meta, setStage);
        success('File uploaded.');
      }
      setStage('idle');
      setMeta(null);
      setFile(null);
      setEditingId(null);
      reload();
    } catch (e) {
      setStage('idle');
      // A cancelled upload is not an error; the form just stays open.
      if ((e as Error)?.name === 'StreamUploadAborted') return;
      setFormError(describeWriteError(e));
    }
  };

  const handleDelete = async (doc: PortalDocument) => {
    const ok = await confirm({
      title: 'Delete this file?',
      message: `"${doc.title}" will be removed from the portal and the ${doc.streamUid ? 'video deleted from Cloudflare Stream' : 'file itself deleted'}. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      // Throws if the stored file could not be removed, and the row is still
      // there when it does — so this is a real error now, not housekeeping.
      await deleteDocument(doc);
      success('File deleted.');
      reload();
    } catch (e) {
      toastError(describeWriteError(e));
    }
  };

  const logDownload = (doc: PortalDocument) => {
    void logActivity({
      action: 'document_downloaded',
      entityType: 'document',
      entityId: doc.id,
      entityTitle: doc.title,
      details: { fileName: doc.fileName, via: 'manager' },
    });
  };

  /**
   * The fallback for a file the batch signing did not cover.
   *
   * The normal path is the <a href> below, which needs no await and so cannot
   * be blocked. This one runs after one, and that is exactly the bug it has to
   * avoid: window.open() called once the await has resolved is no longer part
   * of the tap that asked for it, and iOS drops it without a word — which is
   * why the Open button could be pressed over and over on a phone and do
   * nothing at all. Navigating instead is never blocked.
   */
  const openDocument = async (doc: PortalDocument) => {
    if (!doc.storagePath) return;
    setOpening(doc.id);
    const url = await getDocumentUrl(doc.storagePath);
    setOpening(null);

    if (!url) {
      toastError('That file could not be opened. It may have been removed from storage.');
      return;
    }
    logDownload(doc);
    window.location.assign(url);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <Button leftIcon={<PlusIcon />} onClick={startUpload}>Upload file</Button>
      </div>

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={rows.length === 0}
        emptyTitle="No files yet"
        emptyDescription={scope?.classId
          ? 'Music, choreography notes, costume details — anything this class needs. Only families in this class see them.'
          : 'Costume lists, handbooks, permission slips — anything a parent needs to download.'}
        emptyAction={<Button leftIcon={<PlusIcon />} onClick={startUpload}>Upload file</Button>}
      >
        {rows.map(doc => (
          <Card key={doc.id}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <Thumb doc={doc} url={previews[doc.storagePath ?? '']} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ marginBottom: '6px' }}>
                  <PublishedBadge published={doc.isPublished} />
                </div>

                <h3 style={{
                  ...theme.typography.h3,
                  color: theme.colors.txt.primary,
                  margin: '0 0 6px',
                  wordBreak: 'break-word',
                }}>
                  {doc.title}
                </h3>

                <RowMeta>
                  <span>{doc.fileName}</span>
                  {formatFileSize(doc.sizeBytes) && <span>· {formatFileSize(doc.sizeBytes)}</span>}
                  {formatDuration(doc.durationSeconds) && <span>· {formatDuration(doc.durationSeconds)}</span>}
                  {streamStatusLabel(doc.streamStatus) && (
                    <span style={{
                      color: doc.streamStatus === 'error' ? theme.colors.status.error : theme.colors.status.warning,
                    }}>
                      · {streamStatusLabel(doc.streamStatus)}
                    </span>
                  )}
                  {doc.category && <span>· {doc.category}</span>}
                  {/* Redundant inside a scope — see UpdatesSection. */}
                  {!scope && <span>· {audienceLabel(doc.classId, classes)}</span>}
                </RowMeta>

                {doc.streamPlaybackUrl ? (
                  <>
                    {/* Cloudflare's own watch page. Nothing to sign, and it
                        shows "processing" itself until the video is ready. */}
                    <a
                      href={streamWatchUrl(doc.streamPlaybackUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => logDownload(doc)}
                      style={OPEN_LINK}
                    >
                      {doc.streamStatus === 'ready' ? 'Watch' : 'Open on Cloudflare'}
                    </a>
                    {/* The same MP4 parents get, once Cloudflare has built it. */}
                    {doc.streamDownloadUrl && (
                      <a
                        href={streamDownloadHref(doc.streamDownloadUrl, doc.title)}
                        onClick={() => logDownload(doc)}
                        style={{ ...OPEN_LINK, marginLeft: '14px' }}
                      >
                        Download
                      </a>
                    )}
                  </>
                ) : previews[doc.storagePath ?? ''] ? (
                  /* A plain anchor, because it can be: the URL is already
                     signed. Nothing to await means nothing for a phone to
                     treat as an unsolicited popup. */
                  <a
                    href={previews[doc.storagePath ?? '']}
                    target="_blank"
                    rel="noopener noreferrer"
                    // Fires alongside the navigation, never instead of it —
                    // onClick on an <a href> does not swallow the tap.
                    onClick={() => logDownload(doc)}
                    style={OPEN_LINK}
                  >
                    Open
                  </a>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ marginTop: '8px', paddingLeft: 0 }}
                    loading={opening === doc.id}
                    onClick={() => openDocument(doc)}
                  >
                    Open
                  </Button>
                )}
              </div>

              {/* Read is program-wide for staff; write is not. See
                  UpdatesSection for the same guard and why. */}
              {canEditClass(doc.classId) && (
                <RowActions
                  onEdit={() => startEdit(doc)}
                  onDelete={() => handleDelete(doc)}
                  editLabel={`Edit ${doc.title}`}
                  deleteLabel={`Delete ${doc.title}`}
                />
              )}
            </div>
          </Card>
        ))}
      </ManagerList>

      <Modal
        isOpen={meta !== null}
        onClose={closeModal}
        title={editingId ? 'Edit file details' : 'Upload a file'}
        size="lg"
        footer={
          <>
            {progress?.stage === 'uploading' ? (
              /* The one moment Cancel has to work while busy: it stops the
                 tus upload and the video is deleted again on Cloudflare. */
              <Button variant="secondary" onClick={() => abortRef.current?.abort()}>Cancel upload</Button>
            ) : (
              <Button variant="secondary" onClick={closeModal} disabled={busy}>Cancel</Button>
            )}
            <Button variant="primary" onClick={handleSave} loading={busy}>
              {progress
                ? progress.stage === 'uploading'
                  ? `Uploading ${Math.round(progress.fraction * 100)}%`
                  : progress.stage === 'saving' ? 'Saving…' : 'Preparing…'
                : stage === 'uploading' ? 'Uploading…' : editingId ? 'Save' : 'Upload'}
            </Button>
          </>
        }
      >
        {meta && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {!editingId && (
              <div>
                <label style={{
                  display: 'block',
                  ...theme.typography.caption,
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.txt.secondary,
                  marginBottom: '8px',
                }}>
                  File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={DOCUMENT_ACCEPT}
                  onChange={handleFilePicked}
                  disabled={busy}
                  style={{
                    ...theme.typography.bodySmall,
                    fontFamily: theme.fonts.primary,
                    color: theme.colors.txt.primary,
                    width: '100%',
                  }}
                />
                <p style={{
                  ...theme.typography.captionSmall,
                  fontFamily: theme.fonts.mono,
                  color: theme.colors.txt.tertiary,
                  margin: '8px 0 0',
                }}>
                  {file
                    ? `${file.name} · ${formatFileSize(file.size)}${goesToStream(file) ? ' · video — goes to Cloudflare Stream' : ''}`
                    : `${DOCUMENT_HINT} ${STREAM_HINT}`}
                </p>

                {progress?.stage === 'uploading' && (
                  <div
                    role="progressbar"
                    aria-label="Upload progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress.fraction * 100)}
                    style={{
                      marginTop: '10px',
                      height: '6px',
                      borderRadius: theme.borderRadius.full,
                      backgroundColor: theme.colors.bg.tertiary,
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{
                      width: `${Math.round(progress.fraction * 100)}%`,
                      height: '100%',
                      backgroundColor: theme.colors.primary,
                      transition: 'width 300ms ease',
                    }} />
                  </div>
                )}

                {/* Said here rather than refused: the bucket takes both, and a
                    teacher on an iPhone should not be blocked from posting the
                    photo they have. It only warns about what a parent on the
                    other platform would get. A video is exempt: Stream
                    re-encodes a .mov into something every phone plays. */}
                {file && !goesToStream(file) && compatibilityWarning(file.type, file.name) && (
                  <p style={{
                    ...theme.typography.captionSmall,
                    fontFamily: theme.fonts.primary,
                    color: theme.colors.status.warning,
                    margin: '6px 0 0',
                  }}>
                    {compatibilityWarning(file.type, file.name)}
                  </p>
                )}
              </div>
            )}

            {editingId && (
              <p style={{
                ...theme.typography.bodySmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.tertiary,
                margin: 0,
              }}>
                The file itself cannot be swapped. To replace it, delete this entry and upload the new one.
              </p>
            )}

            <Input
              ref={focusRef}
              label="Name"
              value={meta.title}
              placeholder="Competition costume list"
              onChange={e => setMeta({ ...meta, title: e.target.value })}
            />

            <Textarea
              label="Description (optional)"
              value={meta.description}
              placeholder="Everything to bring to the January competition."
              onChange={e => setMeta({ ...meta, description: e.target.value })}
            />

            <Input
              label="Category (optional)"
              value={meta.category ?? ''}
              placeholder="Costumes"
              onChange={e => setMeta({ ...meta, category: e.target.value })}
            />

            {/* Scoped: fixed by where this was opened from. See UpdatesSection. */}
            {!scope && (
              <ClassSelect
                classes={classes}
                value={meta.classId}
                onChange={classId => setMeta({ ...meta, classId })}
                allowStudioWide={isAdmin}
                editableClassIds={editableClassIds}
                isAdmin={isAdmin}
                disabled={busy}
              />
            )}

            <CustomCheckbox
              checked={meta.isPublished}
              onChange={isPublished => setMeta({ ...meta, isPublished })}
              label="Visible to parents"
              disabled={busy}
            />

            {formError && (
              <p style={{
                ...theme.typography.bodySmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.status.error,
                margin: 0,
              }}>
                {formError}
              </p>
            )}
          </div>
        )}
      </Modal>

      {confirmDialog}
    </>
  );
};

export default DocumentsSection;
