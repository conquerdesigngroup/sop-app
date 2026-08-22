import React, { useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Input, Modal, Textarea, Badge, PlusIcon } from '../ui';
import { CustomCheckbox } from '../CustomCheckbox';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAdmin, describeWriteError, UpdateInput } from '../../contexts/PortalAdminContext';
import { PortalClass, PortalProgram, PortalUpdate } from '../../types';
import { useAdminList } from './useAdminList';
import { ManagerList, ClassSelect, RowActions, RowMeta, PublishedBadge, audienceLabel, useAutoFocus } from './shared';

/**
 * Announcements. What a parent sees under /portal/:program/updates.
 *
 * The body is a plain textarea and stays plain text end to end: the parent
 * renderer splits it on blank lines and lets React escape every line, because
 * putting staff-authored text through dangerouslySetInnerHTML would make this
 * editor stored XSS against every family. If rich text is ever wanted, it needs
 * a sanitiser on the way out, not a change here.
 */

const emptyDraft = (programId: string, classId: string | null): UpdateInput => ({
  programId,
  classId,
  title: '',
  body: '',
  isPinned: false,
  isPublished: false,
  publishedAt: null,
});

const toDraft = (u: PortalUpdate): UpdateInput => ({
  id: u.id,
  programId: u.programId,
  classId: u.classId,
  title: u.title,
  body: u.body,
  isPinned: u.isPinned,
  isPublished: u.isPublished,
  publishedAt: u.publishedAt,
});

const UpdatesSection: React.FC<{ program: PortalProgram; classes: PortalClass[] }> = ({
  program, classes,
}) => {
  const { fetchUpdates, saveUpdate, deleteUpdate, canEditClass, editableClassIds } = usePortalAdmin();
  const { isAdmin } = useAuth();
  const { success, error: toastError } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const { isMobileOrTablet } = useResponsive();

  const { data: updates, loading, error, reload } = useAdminList<PortalUpdate[]>(
    program.id, fetchUpdates, []
  );

  const [draft, setDraft] = useState<UpdateInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const focusRef = useAutoFocus(draft !== null);

  // A teacher's first class, so a new update opens on something they can save.
  const defaultClassId = isAdmin ? null : (editableClassIds[0] ?? null);

  const startNew = () => {
    setFormError('');
    setDraft(emptyDraft(program.id, defaultClassId));
  };

  const handleSave = async () => {
    if (!draft) return;

    if (!draft.title.trim()) {
      setFormError('Give it a title — that is what parents see in the list.');
      return;
    }
    if (!canEditClass(draft.classId)) {
      setFormError('Pick one of your own classes. Studio-wide posts are admin-only.');
      return;
    }

    setSaving(true);
    try {
      await saveUpdate(draft);
      success(draft.isPublished ? 'Update published.' : 'Draft saved.');
      setDraft(null);
      reload();
    } catch (e) {
      setFormError(describeWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: PortalUpdate) => {
    const ok = await confirm({
      title: 'Delete this update?',
      message: u.isPublished
        ? `"${u.title}" is live. Deleting it removes it from the portal immediately and cannot be undone.`
        : `"${u.title}" has not been published. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteUpdate(u.id);
      success('Update deleted.');
      reload();
    } catch (e) {
      toastError(describeWriteError(e));
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <Button leftIcon={<PlusIcon />} onClick={startNew}>New update</Button>
      </div>

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={updates.length === 0}
        emptyTitle="No updates yet"
        emptyDescription="Post schedule changes, reminders and announcements. Parents see them newest first, pinned at the top."
        emptyAction={<Button leftIcon={<PlusIcon />} onClick={startNew}>New update</Button>}
      >
        {updates.map(u => (
          <Card key={u.id}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <PublishedBadge published={u.isPublished} />
                  {u.isPinned && <Badge variant="primary" size="sm">Pinned</Badge>}
                </div>

                <h3 style={{
                  ...theme.typography.h3,
                  color: theme.colors.txt.primary,
                  margin: '0 0 6px',
                  wordBreak: 'break-word',
                }}>
                  {u.title}
                </h3>

                <RowMeta>
                  <span>{audienceLabel(u.classId, classes)}</span>
                  {u.publishedAt && (
                    <span>· {new Date(u.publishedAt).toLocaleDateString()}</span>
                  )}
                </RowMeta>
              </div>

              {/* A teacher can READ every published update in the program —
                  portal_updates_read is permissive and ORs with the staff
                  policy — but may only change their own classes'. Showing the
                  buttons anyway would offer a save the database refuses. */}
              {canEditClass(u.classId) && (
                <RowActions
                  onEdit={() => { setFormError(''); setDraft(toDraft(u)); }}
                  onDelete={() => handleDelete(u)}
                  editLabel={`Edit ${u.title}`}
                  deleteLabel={`Delete ${u.title}`}
                />
              )}
            </div>
          </Card>
        ))}
      </ManagerList>

      <Modal
        isOpen={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit update' : 'New update'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              {draft?.isPublished ? 'Publish' : 'Save draft'}
            </Button>
          </>
        }
      >
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input
              ref={focusRef}
              label="Title"
              value={draft.title}
              placeholder="Recital tickets are on sale"
              onChange={e => setDraft({ ...draft, title: e.target.value })}
            />

            <Textarea
              label="Message"
              value={draft.body}
              placeholder={'Leave a blank line between paragraphs.\n\nPlain text only — links are not clickable and formatting is not applied.'}
              style={{ minHeight: '180px' }}
              onChange={e => setDraft({ ...draft, body: e.target.value })}
            />

            <ClassSelect
              classes={classes}
              value={draft.classId}
              onChange={classId => setDraft({ ...draft, classId })}
              allowStudioWide={isAdmin}
              editableClassIds={editableClassIds}
              isAdmin={isAdmin}
            />

            <div style={{
              display: 'flex',
              gap: isMobileOrTablet ? '12px' : '24px',
              flexDirection: isMobileOrTablet ? 'column' : 'row',
            }}>
              <CustomCheckbox
                checked={draft.isPublished}
                onChange={isPublished => setDraft({ ...draft, isPublished })}
                label="Visible to parents"
              />
              <CustomCheckbox
                checked={draft.isPinned}
                onChange={isPinned => setDraft({ ...draft, isPinned })}
                label="Pin to the top"
              />
            </div>

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

export default UpdatesSection;
