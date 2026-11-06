import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { theme } from '../../theme';
import { TaskFile } from '../../types';
import {
  cachedTaskFileUrl,
  formatBytes,
  isPreviewableImage,
  signTaskFile,
} from '../../lib/taskFiles';

/**
 * The read side of task files: thumbnails, file rows and a full-screen photo
 * viewer. Used by the task editor (with a remove button) and by every task
 * detail view (without one).
 */

/** Signed URL for a stored key. `undefined` while signing, `null` if it failed. */
export const useTaskFileUrl = (path: string | undefined): string | null | undefined => {
  const [url, setUrl] = useState<string | null | undefined>(() => cachedTaskFileUrl(path));
  useEffect(() => {
    let live = true;
    const hit = cachedTaskFileUrl(path);
    if (hit !== undefined) {
      setUrl(hit);
      return;
    }
    setUrl(undefined);
    void signTaskFile(path).then(u => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [path]);
  return url;
};

const FileIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const RemoveButton: React.FC<{ name: string; onRemove: () => void; disabled?: boolean }> = ({ name, onRemove, disabled }) => (
  <button
    type="button"
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
    disabled={disabled}
    aria-label={`Remove ${name}`}
    title="Remove"
    style={styles.removeButton}
  >
    <span style={styles.removeDot}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </span>
  </button>
);

/** A square photo thumbnail. Tapping it opens the photo viewer. */
const ImageTile: React.FC<{
  file: TaskFile;
  size: number;
  onOpen: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}> = ({ file, size, onOpen, onRemove, disabled }) => {
  const url = useTaskFileUrl(file.path);
  return (
    <div style={{ ...styles.imageTile, width: size, height: size }}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }}
        aria-label={`View ${file.name}`}
        style={styles.imageButton}
      >
        {url ? (
          <img src={url} alt={file.name} loading="lazy" style={styles.image} />
        ) : (
          <span style={styles.imagePlaceholder}>{url === null ? 'Unavailable' : ''}</span>
        )}
      </button>
      {onRemove && <RemoveButton name={file.name} onRemove={onRemove} disabled={disabled} />}
    </div>
  );
};

/** A non-image file: icon, name, size. Opens in a new tab. */
const FileRow: React.FC<{ file: TaskFile; onRemove?: () => void; disabled?: boolean }> = ({ file, onRemove, disabled }) => {
  const url = useTaskFileUrl(file.path);
  const body = (
    <>
      <span style={styles.fileIcon}><FileIcon /></span>
      <span style={styles.fileText}>
        <span style={styles.fileName}>{file.name}</span>
        <span style={styles.fileMeta}>
          {[formatBytes(file.size), url === null ? 'Could not be opened' : url ? 'Tap to open' : 'Getting link…']
            .filter(Boolean).join(' · ')}
        </span>
      </span>
    </>
  );
  return (
    <div style={styles.fileRow}>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={styles.fileLink}
        >
          {body}
        </a>
      ) : (
        <div style={styles.fileLink}>{body}</div>
      )}
      {onRemove && <RemoveButton name={file.name} onRemove={onRemove} disabled={disabled} />}
    </div>
  );
};

/** Full-screen photo viewer, with the file's own link for saving or sharing. */
export const PhotoViewer: React.FC<{
  images: TaskFile[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}> = ({ images, index, onIndex, onClose }) => {
  const file = images[index];
  const url = useTaskFileUrl(file?.path);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < images.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onIndex, onClose]);

  if (!file) return null;

  const viewer = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      style={styles.viewerOverlay}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div style={styles.viewerBar} onClick={(e) => e.stopPropagation()}>
        <span style={styles.viewerTitle}>
          {file.name}{images.length > 1 ? ` · ${index + 1} of ${images.length}` : ''}
        </span>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" style={styles.viewerLink}>
            Open
          </a>
        )}
        <button type="button" onClick={onClose} aria-label="Close" style={styles.viewerClose}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div style={styles.viewerStage}>
        {url ? (
          <img
            src={url}
            alt={file.name}
            style={styles.viewerImage}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span style={{ color: '#FFFFFF' }}>{url === null ? 'This photo could not be loaded.' : 'Loading…'}</span>
        )}
      </div>
      {images.length > 1 && (
        <div style={styles.viewerNav} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onIndex(index - 1)}
            disabled={index === 0}
            style={{ ...styles.viewerNavButton, opacity: index === 0 ? 0.4 : 1 }}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => onIndex(index + 1)}
            disabled={index === images.length - 1}
            style={{ ...styles.viewerNavButton, opacity: index === images.length - 1 ? 0.4 : 1 }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(viewer, document.body) : viewer;
};

/**
 * Every file on a task or step: photos as a wrapping grid of thumbnails, other
 * files as rows. Pass onRemove to make it editable.
 */
export const TaskFileTiles: React.FC<{
  files: TaskFile[];
  thumbSize?: number;
  onRemove?: (file: TaskFile) => void;
  disabled?: boolean;
}> = ({ files, thumbSize = 88, onRemove, disabled }) => {
  const [viewing, setViewing] = useState<number | null>(null);
  const images = files.filter(isPreviewableImage);
  const others = files.filter(f => !isPreviewableImage(f));

  if (!files.length) return null;

  return (
    <div style={styles.wrap}>
      {images.length > 0 && (
        <div style={styles.imageGrid}>
          {images.map((f, i) => (
            <ImageTile
              key={f.id}
              file={f}
              size={thumbSize}
              onOpen={() => setViewing(i)}
              onRemove={onRemove ? () => onRemove(f) : undefined}
              disabled={disabled}
            />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div style={styles.fileList}>
          {others.map(f => (
            <FileRow
              key={f.id}
              file={f}
              onRemove={onRemove ? () => onRemove(f) : undefined}
              disabled={disabled}
            />
          ))}
        </div>
      )}
      {viewing !== null && (
        <PhotoViewer
          images={images}
          index={Math.min(viewing, images.length - 1)}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
};

/** The task-level "Photos & files" block for a detail view. Renders nothing
 *  when the task has none, so a plain title-only task stays plain. */
export const TaskFilesSection: React.FC<{
  files?: TaskFile[];
  titleStyle?: React.CSSProperties;
  sectionStyle?: React.CSSProperties;
}> = ({ files, titleStyle, sectionStyle }) => {
  if (!files || files.length === 0) return null;
  return (
    <div style={sectionStyle}>
      <h3 style={titleStyle}>Photos &amp; files</h3>
      <TaskFileTiles files={files} />
    </div>
  );
};

/** A step's pictures, small, under its description. Stops clicks reaching the
 *  step's checkbox label, so viewing a picture does not tick the step. */
export const StepImages: React.FC<{ images?: TaskFile[] }> = ({ images }) => {
  if (!images || images.length === 0) return null;
  return (
    <div
      style={{ marginTop: theme.spacing.xs }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <TaskFileTiles files={images} thumbSize={72} />
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
  imageGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  imageTile: {
    position: 'relative',
    flexShrink: 0,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    border: `1px solid ${theme.colors.bdr.primary}`,
    backgroundColor: theme.colors.bg.tertiary,
  },
  imageButton: {
    display: 'block',
    width: '100%',
    height: '100%',
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'zoom-in',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  imagePlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    fontSize: '11px',
    color: theme.colors.txt.tertiary,
  },
  // A 44px hit area in the corner (the touch minimum index.css enforces
  // anyway), drawing only a small dot so it does not cover the photo.
  removeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    padding: 4,
    border: 'none',
    background: 'none',
    color: '#FFFFFF',
    cursor: 'pointer',
  },
  removeDot: {
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  fileRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
    backgroundColor: theme.colors.bg.tertiary,
  },
  fileLink: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
    minWidth: 0,
    padding: `${theme.spacing.sm} 40px ${theme.spacing.sm} ${theme.spacing.sm}`,
    color: theme.colors.txt.primary,
    textDecoration: 'none',
  },
  fileIcon: {
    display: 'flex',
    flexShrink: 0,
    color: theme.colors.txt.secondary,
  },
  fileText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  fileName: {
    fontSize: '14px',
    fontWeight: 600,
    overflowWrap: 'anywhere',
  },
  fileMeta: {
    fontSize: '12px',
    color: theme.colors.txt.tertiary,
  },
  viewerOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 3000,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 'env(safe-area-inset-top)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    paddingLeft: 'env(safe-area-inset-left)',
    paddingRight: 'env(safe-area-inset-right)',
  },
  viewerBar: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    color: '#FFFFFF',
    minWidth: 0,
  },
  viewerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: '14px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  viewerLink: {
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: 600,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  },
  viewerClose: {
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'none',
    color: '#FFFFFF',
    cursor: 'pointer',
    flexShrink: 0,
  },
  viewerStage: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.sm,
  },
  viewerImage: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  },
  viewerNav: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    padding: theme.spacing.sm,
  },
  viewerNavButton: {
    minWidth: 110,
    minHeight: 44,
    borderRadius: theme.borderRadius.full,
    border: '1px solid rgba(255, 255, 255, 0.4)',
    background: 'none',
    color: '#FFFFFF',
    fontSize: '14px',
    cursor: 'pointer',
  },
};

export default TaskFileTiles;
