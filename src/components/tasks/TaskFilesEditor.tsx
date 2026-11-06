import React, { useEffect, useRef, useState } from 'react';
import { theme } from '../../theme';
import { TaskFile } from '../../types';
import { Button } from '../ui';
import { uploadTaskFile } from '../../lib/taskFiles';
import { TaskFileTiles } from './TaskFileTiles';

/**
 * Add photos and files to a task, or pictures to one step.
 *
 * Two pickers, because a phone treats them differently:
 *   - "Add photos" is `accept="image/*"`, which on iOS and Android opens the
 *     photo library (and offers the camera) straight away.
 *   - "Add files" has no accept list, which opens the Files app on a phone and
 *     the normal file dialog on a desktop — PDFs, spreadsheets, anything.
 * On a desktop a screenshot can also be pasted straight into the box.
 *
 * Uploads go one at a time and each finished file is added to the list as it
 * lands, so a slow connection still shows progress file by file. The rules in
 * CLAUDE.md "SLOW TAPS" apply: the buttons disable on the first tap (and a
 * busy ref drops a second tap that lands before the re-render), a striped bar
 * and a sentence say what is happening, Cancel stops the batch, and the line
 * ends saying what happened.
 *
 * The storage client reports no byte progress for an upload, so the bar is
 * indeterminate and the count ("2 of 5") carries the meaning.
 */

export interface TaskFilesEditorProps {
  files: TaskFile[];
  /** Functional update, so files finishing one after another never race. */
  onChange: (update: (prev: TaskFile[]) => TaskFile[]) => void;
  /** The signed-in user's id. Storage keys must start with it. */
  uid: string;
  /** 'task' offers photos and any file; 'step' offers pictures only. */
  variant?: 'task' | 'step';
  /** Told about every file this editor uploaded, so a cancelled form can
   *  delete what it put in storage. */
  onUploaded?: (file: TaskFile) => void;
  /** Told when a file is taken off the list. */
  onRemoved?: (file: TaskFile) => void;
  /** So the surrounding form can refuse to save mid-upload. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}

const PhotoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const PaperclipIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

export const TaskFilesEditor: React.FC<TaskFilesEditorProps> = ({
  files,
  onChange,
  uid,
  variant = 'task',
  onUploaded,
  onRemoved,
  onBusyChange,
  disabled,
}) => {
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const cancelRef = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const setBusyBoth = (b: boolean) => {
    busyRef.current = b;
    if (mounted.current) setBusy(b);
    onBusyChange?.(b);
  };

  const say = (msg: string | null, error = false) => {
    if (!mounted.current) return;
    setStatus(msg);
    setIsError(error);
  };

  const uploadAll = async (picked: File[]) => {
    if (busyRef.current || picked.length === 0) return;
    if (!uid) {
      say('You need to be signed in to add files.', true);
      return;
    }
    cancelRef.current = false;
    setBusyBoth(true);

    const total = picked.length;
    let done = 0;
    const failed: string[] = [];

    for (let i = 0; i < picked.length; i++) {
      if (cancelRef.current) break;
      const f = picked[i];
      const sizeMb = f.size >= 1024 * 1024 ? ` (${(f.size / 1024 / 1024).toFixed(1)} MB)` : '';
      say(
        total > 1
          ? `Uploading ${i + 1} of ${total}: ${f.name}${sizeMb}. Keep this open.`
          : `Uploading ${f.name}${sizeMb}. Keep this open.`
      );
      try {
        const record = await uploadTaskFile(uid, f);
        onUploaded?.(record);
        if (cancelRef.current) {
          // It landed after Cancel. The parent was told about it, so it is
          // cleaned up with everything else this form discards.
          break;
        }
        onChange(prev => [...prev, record]);
        done++;
      } catch (e: any) {
        failed.push(`${f.name}: ${e?.message || 'upload failed'}`);
      }
    }

    const cancelled = cancelRef.current;
    setBusyBoth(false);

    const noun = variant === 'step' ? 'picture' : 'file';
    if (cancelled) {
      say(
        done
          ? `Stopped. ${done} ${noun}${done === 1 ? ' was' : 's were'} added; the rest were not.`
          : 'Stopped. Nothing was added.'
      );
    } else if (failed.length) {
      say(
        `${done ? `Added ${done}. ` : ''}Couldn't upload ${failed.join('; ')}. Check your connection and try that one again.`,
        true
      );
    } else {
      say(
        `Added ${done} ${noun}${done === 1 ? '' : 's'}. ${variant === 'step' ? 'It' : done === 1 ? 'It' : 'They'} will be saved with the task.`
      );
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    // Clear so picking the same file again still fires a change.
    e.target.value = '';
    void uploadAll(list);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const pasted = Array.from(e.clipboardData?.files || []);
    const usable = variant === 'step' ? pasted.filter(f => f.type.startsWith('image/')) : pasted;
    if (usable.length === 0) return;
    e.preventDefault();
    // A pasted screenshot is called "image.png" by every browser; give it a
    // name a person can tell apart from the next one.
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const named = usable.map((f, i) =>
      /^image\.(png|jpe?g|gif|webp)$/i.test(f.name)
        ? new File([f], `screenshot-${stamp}${usable.length > 1 ? `-${i + 1}` : ''}.${f.name.split('.').pop()}`, { type: f.type })
        : f
    );
    void uploadAll(named);
  };

  const remove = (file: TaskFile) => {
    onChange(prev => prev.filter(f => f.id !== file.id));
    onRemoved?.(file);
    say(null);
  };

  const isStep = variant === 'step';

  return (
    <div onPaste={onPaste} style={styles.wrap}>
      {files.length > 0 && (
        <TaskFileTiles
          files={files}
          thumbSize={isStep ? 72 : 88}
          onRemove={disabled || busy ? undefined : remove}
        />
      )}

      <div style={styles.buttons}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          leftIcon={<PhotoIcon />}
          disabled={disabled || busy}
          onClick={() => photoInput.current?.click()}
        >
          {isStep ? 'Add picture' : 'Add photos'}
        </Button>
        {!isStep && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<PaperclipIcon />}
            disabled={disabled || busy}
            onClick={() => fileInput.current?.click()}
          >
            Add files
          </Button>
        )}
        {busy && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              cancelRef.current = true;
              say('Stopping after the file that is uploading now…');
            }}
          >
            Cancel
          </Button>
        )}
      </div>

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        multiple
        onChange={onPick}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />
      {!isStep && (
        <input
          ref={fileInput}
          type="file"
          multiple
          onChange={onPick}
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
        />
      )}

      {busy && (
        <div
          role="progressbar"
          aria-label="Uploading"
          className="progress-striped"
          style={styles.bar}
        />
      )}

      <p
        role="status"
        aria-live="polite"
        style={{
          ...styles.status,
          color: isError ? theme.colors.status.error : theme.colors.txt.tertiary,
          display: status || (!isStep && !busy && files.length === 0) ? 'block' : 'none',
        }}
      >
        {status ?? 'Optional: photos, PDFs or any file up to 25 MB. On a computer you can also paste a screenshot here.'}
      </p>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  buttons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  bar: {
    height: '4px',
    width: '100%',
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
  },
  status: {
    margin: 0,
    fontSize: '12px',
    lineHeight: 1.4,
    overflowWrap: 'anywhere',
  },
};

export default TaskFilesEditor;
