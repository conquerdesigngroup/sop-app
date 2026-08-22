import React, { useRef, useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Input, Modal, Textarea, PlusIcon } from '../ui';
import { CustomCheckbox } from '../CustomCheckbox';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAdmin, describeWriteError, DocumentInput } from '../../contexts/PortalAdminContext';
import { PortalClass, PortalDocument, PortalProgram } from '../../types';
import { formatFileSize } from '../../lib/portal';
import { DOCUMENT_ACCEPT, DOCUMENT_HINT, validateDocumentFile } from '../../lib/portalAdmin';
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
 * The file itself cannot be edited after upload — only its title, audience and
 * visibility. Replacing a file means deleting the row and uploading again,
 * which is deliberate: storage_path is UNIQUE and a silent swap under a link
 * someone has already opened is worse than an obvious re-upload.
 */

const emptyMeta = (programId: string, classId: string | null): DocumentInput => ({
  programId,
  classId,
  title: '',
  description: '',
  category: '',
  sortOrder: 0,
  isPublished: true,
});

const DocumentsSection: React.FC<{ program: PortalProgram; classes: PortalClass[] }> = ({
  program, classes,
}) => {
  const {
    fetchDocuments, uploadDocument, saveDocumentMeta, deleteDocument, getDocumentUrl,
    canEditClass, editableClassIds,
  } = usePortalAdmin();
  const { isAdmin } = useAuth();
  const { success, error: toastError, warning } = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const { data: documents, loading, error, reload } = useAdminList<PortalDocument[]>(
    program.id, fetchDocuments, []
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<DocumentInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'uploading' | 'saving'>('idle');
  const [formError, setFormError] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const focusRef = useAutoFocus(meta !== null);

  const defaultClassId = isAdmin ? null : (editableClassIds[0] ?? null);
  const busy = stage !== 'idle';

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

    const problem = validateDocumentFile(picked);
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
      setFormError(describeWriteError(e));
    }
  };

  const handleDelete = async (doc: PortalDocument) => {
    const ok = await confirm({
      title: 'Delete this file?',
      message: `"${doc.title}" will be removed from the portal and the file itself deleted. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const { orphanedObject } = await deleteDocument(doc);
      // The row is gone either way, so parents can no longer reach the file —
      // this is housekeeping, not a failure to hand back to the user as one.
      if (orphanedObject) warning('Removed from the portal. The stored file could not be deleted.');
      else success('File deleted.');
      reload();
    } catch (e) {
      toastError(describeWriteError(e));
    }
  };

  const openDocument = async (doc: PortalDocument) => {
    setOpening(doc.id);
    const url = await getDocumentUrl(doc.storagePath);
    setOpening(null);

    if (!url) {
      toastError('That file could not be opened. It may have been removed from storage.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <Button leftIcon={<PlusIcon />} onClick={startUpload}>Upload file</Button>
      </div>

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={documents.length === 0}
        emptyTitle="No files yet"
        emptyDescription="Costume lists, handbooks, permission slips — anything a parent needs to download."
        emptyAction={<Button leftIcon={<PlusIcon />} onClick={startUpload}>Upload file</Button>}
      >
        {documents.map(doc => (
          <Card key={doc.id}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
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
                  {doc.category && <span>· {doc.category}</span>}
                  <span>· {audienceLabel(doc.classId, classes)}</span>
                </RowMeta>

                <Button
                  variant="ghost"
                  size="sm"
                  style={{ marginTop: '8px', paddingLeft: 0 }}
                  loading={opening === doc.id}
                  onClick={() => openDocument(doc)}
                >
                  Open
                </Button>
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
            <Button variant="secondary" onClick={closeModal} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} loading={busy}>
              {stage === 'uploading' ? 'Uploading…' : editingId ? 'Save' : 'Upload'}
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
                  {file ? `${file.name} · ${formatFileSize(file.size)}` : DOCUMENT_HINT}
                </p>
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

            <ClassSelect
              classes={classes}
              value={meta.classId}
              onChange={classId => setMeta({ ...meta, classId })}
              allowStudioWide={isAdmin}
              editableClassIds={editableClassIds}
              isAdmin={isAdmin}
              disabled={busy}
            />

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
