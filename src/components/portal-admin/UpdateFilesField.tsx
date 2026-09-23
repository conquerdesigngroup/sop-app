import React, { useRef } from 'react';
import { theme } from '../../theme';
import { Button } from '../ui';
import { PortalDocument } from '../../types';
import { formatFileSize } from '../../lib/portal';
import { DOCUMENT_ACCEPT, DOCUMENT_HINT, validateDocumentFile } from '../../lib/portalAdmin';
import { goesToStream, validateStreamFile, STREAM_HINT } from '../../lib/portalStream';
import { compatibilityWarning } from '../../lib/portalMedia';

/**
 * The files on an info post, in the post's own editor (v65).
 *
 * WHY NOTHING HERE UPLOADS
 *
 * A file is attached by update_id, and a post that has not been saved yet has
 * no id to attach to. So this collects intent — these are going, that one is
 * coming off — and UpdatesSection does the work on Save, after the post
 * exists. It also makes Cancel mean what it says: nothing has been uploaded
 * and nothing has been deleted, so closing the modal really does leave the
 * post as it was.
 *
 * WHY A REMOVED FILE STAYS ON SCREEN, STRUCK THROUGH
 *
 * Because it has not been removed yet, and pretending otherwise would make
 * Cancel look like it undid something. Struck through with an Undo beside it
 * says both things at once: it is going, and it has not gone.
 */

const FILE_LIMIT = 10;

// One editor is open at a time, so a fixed id is safe and keeps the label
// wired to the input without a hook.
const FIELD_ID = 'update-files';

export interface FilesFieldState {
  /** Rows already attached to this post. */
  existing: PortalDocument[];
  /** Ids of those, marked for deletion when Save runs. */
  removedIds: string[];
  /** Files chosen in this sitting, uploaded when Save runs. */
  picked: File[];
}

export const emptyFilesField = (): FilesFieldState => ({
  existing: [],
  removedIds: [],
  picked: [],
});

/** How many files the post will have once Save has run. */
export const fileCountAfterSave = (s: FilesFieldState): number =>
  s.existing.length - s.removedIds.length + s.picked.length;

/**
 * What the picker will not take, or null.
 *
 * Video is measured against Cloudflare's limits and everything else against
 * the bucket's, exactly as the Files uploader does — the two paths have
 * different ceilings and a file refused by the wrong one gets the wrong reason.
 */
const rejectReasonFor = (file: File): string | null =>
  (goesToStream(file) ? validateStreamFile(file) : validateDocumentFile(file));

const Row: React.FC<{
  name: string;
  size: number | null;
  note?: string | null;
  struck?: boolean;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
}> = ({ name, size, note, struck, actionLabel, onAction, disabled }) => (
  <li style={{
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 0',
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  }}>
    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
      <span style={{
        ...theme.typography.bodySmall,
        fontFamily: theme.fonts.primary,
        color: struck ? theme.colors.txt.tertiary : theme.colors.txt.primary,
        textDecoration: struck ? 'line-through' : 'none',
      }}>
        {name}
      </span>
      <span style={{
        display: 'block',
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.mono,
        color: theme.colors.txt.tertiary,
      }}>
        {formatFileSize(size) ?? ''}{note ? ` · ${note}` : ''}
      </span>
    </span>
    <Button variant="ghost" size="sm" onClick={onAction} disabled={disabled}>
      {actionLabel}
    </Button>
  </li>
);

const UpdateFilesField: React.FC<{
  value: FilesFieldState;
  onChange: (next: FilesFieldState) => void;
  /** True while the post is saving — the whole field goes read-only. */
  disabled: boolean;
  /** True while this post's existing files are still being read. */
  loading?: boolean;
  /** Set when a picked file was refused; cleared by the next pick. */
  error: string;
  onError: (message: string) => void;
}> = ({ value, onChange, disabled, loading = false, error, onError }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  // What the post will have after Save, which is what the limit is about.
  const total = fileCountAfterSave(value);
  // What is on screen, which includes the ones marked for removal — they are
  // still attached, and hiding the last one the moment Remove is pressed is
  // exactly the "it is already gone" impression this field is built to avoid.
  const listed = value.existing.length + value.picked.length;

  const handlePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []);
    // Cleared whatever happens, so picking the same file twice in a row still
    // fires onChange the second time.
    if (inputRef.current) inputRef.current.value = '';
    if (chosen.length === 0) return;

    if (total + chosen.length > FILE_LIMIT) {
      onError(`A post can carry ${FILE_LIMIT} files. Remove one before adding another.`);
      return;
    }

    // Reported rather than skipped silently: someone who picked four files and
    // got three needs to be told which one is missing and why.
    const refused = chosen.map(f => ({ f, why: rejectReasonFor(f) })).filter(r => r.why);
    if (refused.length) {
      onError(`${refused[0].f.name}: ${refused[0].why}`);
      return;
    }

    onError('');
    onChange({ ...value, picked: value.picked.concat(chosen) });
  };

  return (
    <div>
      {/* htmlFor, not a wrapping label: the list of already-attached files
          sits between the two, and a label wrapping all of it would read every
          file name out as part of the field's name. */}
      <label
        htmlFor={FIELD_ID}
        style={{
          display: 'block',
          ...theme.typography.caption,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.secondary,
          marginBottom: '8px',
        }}
      >
        Files (optional)
      </label>

      {/* Said rather than left blank: an empty list and a list that has not
          arrived look identical, and the difference decides whether somebody
          attaches the same flyer twice. */}
      {loading && (
        <p style={{
          ...theme.typography.captionSmall,
          fontFamily: theme.fonts.mono,
          color: theme.colors.txt.tertiary,
          margin: '0 0 12px',
        }}>
          Checking what is already attached…
        </p>
      )}

      {listed > 0 && (
        <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
          {value.existing.map(doc => {
            const going = value.removedIds.indexOf(doc.id) !== -1;
            return (
              <Row
                key={doc.id}
                name={doc.fileName}
                size={doc.sizeBytes}
                note={going ? 'will be deleted when you save' : null}
                struck={going}
                actionLabel={going ? 'Undo' : 'Remove'}
                disabled={disabled}
                onAction={() => onChange({
                  ...value,
                  removedIds: going
                    ? value.removedIds.filter(id => id !== doc.id)
                    : value.removedIds.concat(doc.id),
                })}
              />
            );
          })}

          {value.picked.map((file, i) => (
            <Row
              key={`${file.name}-${i}`}
              name={file.name}
              size={file.size}
              note={[
                'not uploaded yet',
                goesToStream(file) ? 'video — goes to Cloudflare Stream' : null,
                goesToStream(file) ? null : compatibilityWarning(file.type, file.name),
              ].filter(Boolean).join(' · ')}
              actionLabel="Remove"
              disabled={disabled}
              onAction={() => onChange({
                ...value,
                picked: value.picked.filter((_, n) => n !== i),
              })}
            />
          ))}
        </ul>
      )}

      <input
        id={FIELD_ID}
        ref={inputRef}
        type="file"
        multiple
        accept={DOCUMENT_ACCEPT}
        onChange={handlePicked}
        disabled={disabled}
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
        {`Parents see these under the post. ${DOCUMENT_HINT} ${STREAM_HINT}`}
      </p>

      {error && (
        <p style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.status.error,
          margin: '6px 0 0',
        }}>
          {error}
        </p>
      )}
    </div>
  );
};

export default UpdateFilesField;
