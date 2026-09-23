import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Input, Modal, Select, Textarea, Badge, PlusIcon } from '../ui';
import { CustomCheckbox } from '../CustomCheckbox';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../contexts/AuthContext';
import {
  usePortalAdmin, describeWriteError, DocumentInput, UpdateInput, StreamUploadProgress,
} from '../../contexts/PortalAdminContext';
import { PortalClass, PortalDocument, PortalProgram, PortalUpdate } from '../../types';
import { StorageFolder, UPDATE_FOLDER } from '../../lib/portalAdmin';
import { goesToStream } from '../../lib/portalStream';
import { loadUpdateFiles } from '../../lib/updateFiles';
import { useAdminList } from './useAdminList';
import UpdateFilesField, {
  FilesFieldState, emptyFilesField, fileCountAfterSave,
} from './UpdateFilesField';
import {
  ManagerList, ClassSelect, RowActions, RowMeta, PublishedBadge, audienceLabel, useAutoFocus, FieldPair,
} from './shared';
import { LINK_URL_ERROR, isSafeLinkUrl, linkHost, normalizeLinkUrl } from '../../lib/portalLink';

/**
 * Announcements. What a parent sees under /portal/:program/updates.
 *
 * The body is a plain textarea and stays plain text end to end: the parent
 * renderer splits it on blank lines and lets React escape every line, because
 * putting staff-authored text through dangerouslySetInnerHTML would make this
 * editor stored XSS against every family. If rich text is ever wanted, it needs
 * a sanitiser on the way out, not a change here.
 *
 * Which is why the link is its own pair of fields (v54) rather than a URL typed
 * into the body. A URL in the body is not clickable — the placeholder says so —
 * so a parent has to retype it into a phone browser, and most will not. Kept
 * apart from the prose, the value can be checked whole before it ever reaches
 * an href. src/lib/portalLink.ts is where that checking lives.
 *
 * FILES (v65) ARE portal_documents ROWS WITH update_id SET
 *
 * Not a new table and not a new upload path: the same private bucket, the same
 * Cloudflare Stream route for video, the same signed reads and the same
 * renderer a parent already gets on a class page. They cannot be uploaded until
 * the post exists — update_id is a foreign key — so the modal collects them and
 * handleSave does the work in order: post, then removals, then uploads.
 */

const emptyDraft = (programId: string, classId: string | null): UpdateInput => ({
  programId,
  classId,
  title: '',
  body: '',
  linkUrl: '',
  linkLabel: '',
  isPinned: false,
  isPublished: false,
  publishedAt: null,
});

/**
 * The picker's value for a post that goes to both sections — programId null.
 *
 * Since v55 the All-Star section is closed to families without a dancer on a
 * team, so "which section" is also "which families". A post for every family
 * used to have to be filed under one section and so reached only that
 * section's list; a null program is listed in both and readable by all.
 */
const BOTH = 'both';

/** Who a post reaches, in a sentence, for the line under the picker. */
const reachNote = (programId: string | null, sections: PortalProgram[]): string => {
  if (programId === null) return 'Every family sees it, in both sections.';
  const section = sections.find(p => p.id === programId);
  if (section?.slug === 'allstars') return 'Only All-Star families see it.';
  return `Families in ${section?.name ?? 'this section'} see it, and All-Star families do too, because they see both sections.`;
};

const toDraft = (u: PortalUpdate): UpdateInput => ({
  id: u.id,
  programId: u.programId,
  classId: u.classId,
  title: u.title,
  body: u.body,
  // The row is nullable, the form fields are not — see UpdateInput.
  linkUrl: u.linkUrl ?? '',
  linkLabel: u.linkLabel ?? '',
  isPinned: u.isPinned,
  isPublished: u.isPublished,
  publishedAt: u.publishedAt,
});

/**
 * `scope` narrows the section to one audience and pins new posts to it:
 *
 *   undefined            every update in the program (the original behaviour)
 *   { classId: null }    studio-wide only — the Updates tab
 *   { classId: '<id>' }  one class only — the class workspace
 *
 * Scoping is presentation, never permission. canEditClass still decides every
 * button, so a teacher handed a class they do not hold sees the rows and none of
 * the controls, exactly as before.
 */
const UpdatesSection: React.FC<{
  program: PortalProgram;
  classes: PortalClass[];
  scope?: { classId: string | null };
}> = ({ program, classes, scope }) => {
  const {
    fetchUpdates, saveUpdate, deleteUpdate, canEditClass, editableClassIds, programs,
    uploadDocument, uploadStreamVideo, deleteDocument,
  } = usePortalAdmin();
  const { isAdmin } = useAuth();
  const { success, error: toastError } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const { isMobileOrTablet } = useResponsive();

  const { data: updates, loading, error, reload } = useAdminList<PortalUpdate[]>(
    program.id, fetchUpdates, []
  );

  // The program-wide fetch is kept and filtered here rather than refetching per
  // class. The list is small, and the Updates tab and every class workspace then
  // share one cache instead of issuing a request each time you switch.
  const rows = scope ? updates.filter(u => u.classId === scope.classId) : updates;

  // What the audience picker offers. The section in view stands in while the
  // list is still loading, so the picker is never blank; an inactive section
  // is offered only to a post already filed there.
  const sections = programs?.length ? programs : [program];

  const [draft, setDraft] = useState<UpdateInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const focusRef = useAutoFocus(draft !== null);

  // Attachments for every post on screen, in one request: the rows need a
  // count and the editor needs the list, and asking per post would be a
  // request per card.
  const [files, setFiles] = useState<Record<string, PortalDocument[]>>({});
  const [filesDraft, setFilesDraft] = useState<FilesFieldState>(emptyFilesField);
  const [filesError, setFilesError] = useState('');
  const [filesLoading, setFilesLoading] = useState(false);
  // What the Save button and the status line say while files are moving.
  const [step, setStep] = useState<{ text: string; fraction: number | null } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const rowIds = rows.map(u => u.id).join(' ');

  const reloadFiles = useCallback(async (ids: string[]) => {
    try {
      setFiles(await loadUpdateFiles(ids));
    } catch {
      // A count that does not render is worth less than the list it sits on.
      // The editor reads its own copy when it opens, so nothing depends on it.
      setFiles({});
    }
  }, []);

  useEffect(() => {
    const ids = rowIds ? rowIds.split(' ') : [];
    let cancelled = false;
    if (ids.length === 0) { setFiles({}); return; }
    loadUpdateFiles(ids)
      .then(next => { if (!cancelled) setFiles(next); })
      .catch(() => { if (!cancelled) setFiles({}); });
    return () => { cancelled = true; };
    // rowIds, not rows: `rows` is a fresh array every render.
  }, [rowIds]);

  // Inside a class workspace the audience is wherever you are standing.
  // Otherwise: a teacher's first class, so a new update opens on something they
  // can actually save.
  const defaultClassId = scope
    ? scope.classId
    : (isAdmin ? null : (editableClassIds[0] ?? null));

  /**
   * The cached list first so the editor is never briefly empty, then a fresh
   * read of just this post.
   *
   * Both, not one: the cache can be a few seconds stale, and an editor that
   * shows no files for a post that has three is how somebody attaches the
   * flyer a second time. The re-read is also what makes the list right after a
   * save that failed half way.
   */
  const openDraft = (next: UpdateInput, attached: PortalDocument[]) => {
    setFormError('');
    setFilesError('');
    setStep(null);
    setFilesDraft({ ...emptyFilesField(), existing: attached });
    setDraft(next);

    if (!next.id) return;
    const id = next.id;
    setFilesLoading(true);
    loadUpdateFiles([id])
      .then(map => setFilesDraft(prev => ({ ...prev, existing: map[id] ?? [] })))
      // Swallowed: the cached list is already on screen and is very likely
      // right. Save queues nothing against a file it has not seen, so the
      // worst case is a list that is stale, not one that deletes the wrong row.
      .catch(() => undefined)
      .finally(() => setFilesLoading(false));
  };

  const startNew = () => openDraft(emptyDraft(program.id, defaultClassId), []);

  /**
   * Which folder in the bucket an attachment goes in.
   *
   * The post's own section when it has one, so an All-Star file is gated by
   * its key as well as by its row (portal_object_is_allstars, v55). A post for
   * everyone belongs to no section, and UPDATE_FOLDER is how that is said.
   */
  const folderFor = (programId: string | null): StorageFolder => {
    const slug = sections.find(p => p.id === programId)?.slug;
    return slug ?? UPDATE_FOLDER;
  };

  /**
   * THE ORDER MATTERS: POST, THEN REMOVALS, THEN UPLOADS.
   *
   * A file is attached by update_id, so a brand-new post has to exist before
   * anything can hang off it — which is also why the new id is written back
   * onto the draft the moment it is known. Without that, a save that got the
   * post in and then failed on the second of three files would insert a SECOND
   * post when the person pressed Save again.
   *
   * Removals before uploads so that swapping the tenth file for another one
   * does not trip the ten-file limit.
   *
   * A failure part-way leaves the modal open, says which file it was, and
   * re-reads what actually landed, so what is on screen is what is in the
   * database and pressing Save again retries only the rest.
   */
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
    // saveUpdate refuses this too, and so does the v54 CHECK. Refusing it here
    // is what turns a thrown error into a sentence next to the field.
    const linkUrl = normalizeLinkUrl(draft.linkUrl);
    if (linkUrl !== null && !isSafeLinkUrl(linkUrl)) {
      setFormError(LINK_URL_ERROR);
      return;
    }

    setSaving(true);
    setFormError('');
    let updateId = draft.id ?? '';
    // How far the queue got. Counted rather than matched by name on the way
    // out: two files can share a name, and a retry that drops the wrong one
    // loses a file without saying so.
    let uploaded = 0;

    try {
      setStep({ text: 'Saving the post…', fraction: null });
      updateId = await saveUpdate(draft);
      // See above: this is what makes a retry an edit rather than a duplicate.
      if (!draft.id) setDraft(d => (d ? { ...d, id: updateId } : d));

      const going = filesDraft.existing.filter(d => filesDraft.removedIds.indexOf(d.id) !== -1);
      for (const doc of going) {
        setStep({ text: `Deleting ${doc.fileName}…`, fraction: null });
        await deleteDocument(doc);
      }

      const queued = filesDraft.picked;
      for (let i = 0; i < queued.length; i++) {
        const file = queued[i];
        const of = queued.length > 1 ? ` (${i + 1} of ${queued.length})` : '';
        const meta: DocumentInput = {
          programId: draft.programId,
          classId: draft.classId,
          updateId,
          // The file's own name, minus the extension: parents see this above
          // the file and "recital-order-form" beats "Untitled".
          title: file.name.replace(/\.[^.]+$/, '') || file.name,
          description: '',
          category: null,
          sortOrder: filesDraft.existing.length + i,
          // Never its own switch — the post decides. See src/lib/updateFiles.ts.
          isPublished: true,
        };

        if (goesToStream(file)) {
          const controller = new AbortController();
          abortRef.current = controller;
          try {
            await uploadStreamVideo(
              file, meta,
              (p: StreamUploadProgress) => setStep({
                text: p.stage === 'uploading'
                  ? `Uploading ${file.name}${of} — keep this page open.`
                  : `Finishing ${file.name}${of}…`,
                fraction: p.stage === 'uploading' ? p.fraction : null,
              }),
              controller.signal,
            );
          } finally {
            abortRef.current = null;
          }
        } else {
          // The bucket upload reports no fraction, so the bar stays
          // indeterminate and the words carry the progress instead.
          setStep({ text: `Uploading ${file.name}${of} — keep this page open.`, fraction: null });
          await uploadDocument(file, folderFor(draft.programId), meta);
        }
        uploaded++;
      }

      success(draft.isPublished ? 'Info post published.' : 'Draft saved.');
      setDraft(null);
      setFilesDraft(emptyFilesField());
      reload();
      void reloadFiles(updateId ? [updateId] : []);
    } catch (e) {
      // A cancelled video upload is not an error; the form just stays open.
      if ((e as Error)?.name !== 'StreamUploadAborted') setFormError(describeWriteError(e));
      if (updateId) {
        const landed = await loadUpdateFiles([updateId]).catch(() => ({} as Record<string, PortalDocument[]>));
        const attached = landed[updateId] ?? [];
        setFilesDraft(prev => ({
          existing: attached,
          // A removal that went through has no row left to point at.
          removedIds: prev.removedIds.filter(id => attached.some(d => d.id === id)),
          picked: prev.picked.slice(uploaded),
        }));
      }
    } finally {
      setStep(null);
      setSaving(false);
    }
  };

  const handleDelete = async (u: PortalUpdate) => {
    // Named, because the cascade is silent otherwise: v65 deletes the post's
    // files with it, and "I only meant to delete the notice" is how a costume
    // list disappears.
    const attached = files[u.id]?.length ?? 0;
    const alsoFiles = attached
      ? ` Its ${attached === 1 ? 'attached file goes' : `${attached} attached files go`} with it.`
      : '';

    const ok = await confirm({
      title: 'Delete this info post?',
      message: u.isPublished
        ? `"${u.title}" is live. Deleting it removes it from the portal immediately and cannot be undone.${alsoFiles}`
        : `"${u.title}" has not been published. This cannot be undone.${alsoFiles}`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteUpdate(u.id);
      success('Info post deleted.');
      reload();
    } catch (e) {
      toastError(describeWriteError(e));
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <Button leftIcon={<PlusIcon />} onClick={startNew}>New info post</Button>
      </div>

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={rows.length === 0}
        emptyTitle="Nothing posted yet"
        emptyDescription={scope?.classId
          ? 'Post reminders and announcements for this class. Only families in this class see them.'
          : 'Post schedule changes, reminders and announcements. Parents see them newest first, pinned at the top.'}
        emptyAction={<Button leftIcon={<PlusIcon />} onClick={startNew}>New info post</Button>}
      >
        {rows.map(u => (
          <Card key={u.id}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <PublishedBadge published={u.isPublished} />
                  {u.isPinned && <Badge variant="primary" size="sm">Pinned</Badge>}
                  {/* Listed under both section tabs, so it says so: editing
                      it here edits it there. */}
                  {u.programId === null && <Badge variant="info" size="sm">Both sections</Badge>}
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
                  {/* Redundant inside a scope — the heading already says whose
                      updates these are. */}
                  {!scope && <span>{audienceLabel(u.classId, classes)}</span>}
                  {u.publishedAt && (
                    // The separator belongs to the audience label above it, so
                    // it goes when that goes — otherwise the date reads
                    // "· 8/21/2026" with nothing in front of the dot.
                    <span>{scope ? '' : '· '}{new Date(u.publishedAt).toLocaleDateString()}</span>
                  )}
                  {/* Only where it is real: a link that would not render for a
                      parent must not read as one here either. */}
                  {isSafeLinkUrl(u.linkUrl) && <span>↗ {linkHost(u.linkUrl)}</span>}
                  {/* "Did the flyer actually attach" is the question this
                      screen gets reopened to answer. */}
                  {(files[u.id]?.length ?? 0) > 0 && (
                    <span>
                      ◫ {files[u.id].length} {files[u.id].length === 1 ? 'file' : 'files'}
                    </span>
                  )}
                </RowMeta>
              </div>

              {/* A teacher can READ every published update in the program —
                  portal_updates_read is permissive and ORs with the staff
                  policy — but may only change their own classes'. Showing the
                  buttons anyway would offer a save the database refuses. */}
              {canEditClass(u.classId) && (
                <RowActions
                  onEdit={() => openDraft(toDraft(u), files[u.id] ?? [])}
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
        // Not while files are moving: closing would leave an upload running
        // with nothing to report to.
        onClose={() => { if (!saving) setDraft(null); }}
        title={draft?.id ? 'Edit info post' : 'New info post'}
        size="lg"
        footer={
          <>
            {step && step.fraction !== null ? (
              /* The one moment Cancel has to work while busy: it stops the
                 video upload and Cloudflare deletes what it has. */
              <Button variant="secondary" onClick={() => abortRef.current?.abort()}>Cancel upload</Button>
            ) : (
              <Button variant="secondary" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            )}
            <Button variant="primary" onClick={handleSave} loading={saving}>
              {step
                ? (step.fraction !== null ? `Uploading ${Math.round(step.fraction * 100)}%` : 'Saving…')
                : draft?.isPublished ? 'Publish' : 'Save draft'}
            </Button>
          </>
        }
      >
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Which families (v55), first — like the To line of an email,
                because it decides who reads everything under it. Only for a
                post with no class: a class's post already has its audience,
                and the database refuses a both-sections post tied to one.
                Admin-only, like every post with no class. */}
            {isAdmin && draft.classId === null && (
              <div>
                <Select
                  label="Who sees this"
                  value={draft.programId ?? BOTH}
                  options={[
                    ...sections
                      .filter(p => p.isActive || p.id === draft.programId)
                      .map(p => ({ value: p.id, label: p.name })),
                    { value: BOTH, label: 'Both sections' },
                  ]}
                  onChange={e => setDraft({
                    ...draft,
                    programId: e.target.value === BOTH ? null : e.target.value,
                  })}
                />
                <p style={{
                  ...theme.typography.caption,
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.txt.tertiary,
                  margin: '6px 0 0',
                }}>
                  {reachNote(draft.programId, sections)}
                </p>
              </div>
            )}

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
              placeholder={'Leave a blank line between paragraphs.\n\nPlain text only — put any link in the field below, where it becomes a button parents can tap.'}
              style={{ minHeight: '180px' }}
              onChange={e => setDraft({ ...draft, body: e.target.value })}
            />

            {/* The tappable half of a post: tickets, a form, a schedule. Empty
                is the normal case, so it says optional and sits under the
                message rather than competing with it. */}
            <FieldPair stack={isMobileOrTablet}>
              <Input
                label="Link (optional)"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={draft.linkUrl}
                placeholder="didc.app/tickets"
                helperText="Parents get a button under the post. https:// is added if you leave it off."
                onChange={e => setDraft({ ...draft, linkUrl: e.target.value })}
              />
              <Input
                label="Button text"
                value={draft.linkLabel}
                placeholder="Buy recital tickets"
                helperText={
                  linkHost(normalizeLinkUrl(draft.linkUrl))
                    ? `Blank shows ${linkHost(normalizeLinkUrl(draft.linkUrl))} instead.`
                    : 'Blank shows the site the link goes to.'
                }
                disabled={draft.linkUrl.trim() === ''}
                onChange={e => setDraft({ ...draft, linkLabel: e.target.value })}
              />
            </FieldPair>

            {/* Under the link, because most posts have neither and the two
                are the same kind of thing: the part of a post a parent does
                something with rather than reads. */}
            <UpdateFilesField
              value={filesDraft}
              onChange={setFilesDraft}
              disabled={saving}
              loading={filesLoading}
              error={filesError}
              onError={setFilesError}
            />

            {/* Scoped: the audience is fixed by where this was opened from, so
                offering a picker would let someone move a post out of the list
                they are looking at. */}
            {!scope && (
              <ClassSelect
                classes={classes}
                value={draft.classId}
                onChange={classId => setDraft({ ...draft, classId })}
                allowStudioWide={isAdmin}
                editableClassIds={editableClassIds}
                isAdmin={isAdmin}
              />
            )}

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

            {/* Words as well as a bar, and never a bar on its own: a person
                waiting on a 90 MB video needs to know it is that video, that
                it is moving, and that the page has to stay open. */}
            {step && (
              <div>
                <p
                  role="status"
                  aria-live="polite"
                  style={{
                    ...theme.typography.bodySmall,
                    fontFamily: theme.fonts.primary,
                    color: theme.colors.txt.secondary,
                    margin: '0 0 8px',
                  }}
                >
                  {step.fraction !== null
                    ? `${step.text} ${Math.round(step.fraction * 100)}%`
                    : step.text}
                </p>
                <div
                  role="progressbar"
                  aria-label="Save progress"
                  aria-valuemin={step.fraction === null ? undefined : 0}
                  aria-valuemax={step.fraction === null ? undefined : 100}
                  aria-valuenow={step.fraction === null ? undefined : Math.round(step.fraction * 100)}
                  style={{
                    height: '6px',
                    borderRadius: theme.borderRadius.full,
                    backgroundColor: theme.colors.bg.tertiary,
                    overflow: 'hidden',
                  }}
                >
                  {step.fraction === null ? (
                    // index.css freezes this under prefers-reduced-motion, which
                    // is why the line above has to carry the meaning on its own.
                    <div
                      className="progress-striped"
                      style={{
                        width: '100%',
                        height: '100%',
                        backgroundColor: theme.colors.primary,
                      }}
                    />
                  ) : (
                    <div style={{
                      width: `${Math.round(step.fraction * 100)}%`,
                      height: '100%',
                      backgroundColor: theme.colors.primary,
                      transition: 'width 300ms ease',
                    }} />
                  )}
                </div>
              </div>
            )}

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
