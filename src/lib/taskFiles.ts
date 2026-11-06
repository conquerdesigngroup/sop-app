import { supabase } from './supabase';
import type { TaskFile } from '../types';

/**
 * Photos and files on a task, and pictures on a task's steps.
 *
 * WHERE THEY LIVE
 *
 * The bytes are in the private `task-files` bucket (v76). What a task row
 * holds is a small record per file — key, name, type, size — in
 * job_tasks.files, task_templates.files, or steps[].images. No table of its
 * own: a task's steps are already jsonb on the row, a template is copied into
 * a task wholesale, and a separate table would have to be copied alongside it
 * every time.
 *
 * A KEY, NOT A URL
 *
 * The bucket is private, so a browser needs a signed url, and a signed url
 * expires. Storing one would turn every picture into a broken image an hour
 * later. We sign on read, batched and cached — see signTaskFile.
 *
 * THE KEY MUST START WITH THE UPLOADER'S OWN UID
 *
 * That is the storage policy, not a convention: task_files_insert_own compares
 * (storage.foldername(name))[1] with auth.uid(). Build a key any other way and
 * the upload is refused.
 *
 * REMOVING IS NOT DELETING
 *
 * The same object is shared by a template and every task made from it, and by
 * every copy of a recurring task. Taking a file off one of them must not break
 * it on the rest, so only discardUnsaved() deletes an object — and only for a
 * file that was uploaded in the editor and then thrown away before saving.
 */

export const TASK_FILE_BUCKET = 'task-files';

/** Matches the bucket's own limit, so the check fails here with a sentence
 *  rather than at the API with a 413. */
export const MAX_TASK_FILE_MB = 25;
export const MAX_TASK_FILE_BYTES = MAX_TASK_FILE_MB * 1024 * 1024;

/** An hour, matching the other signers. Long enough for a session. */
export const TASK_FILE_TTL_SECONDS = 60 * 60;

/** Phone photos are 3–8 MB straight off the camera. A step picture is looked
 *  at on a phone, so anything wider than this is bytes nobody sees. */
const MAX_IMAGE_EDGE = 2000;

export const isImageFile = (f: Pick<TaskFile, 'mimeType' | 'name'>): boolean =>
  /^image\//i.test(f.mimeType || '') ||
  /\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(f.name || '');

/** Images a browser will actually draw in an <img>. HEIC is an image, but
 *  only Safari can show it, so it is listed as a file elsewhere. */
export const isPreviewableImage = (f: Pick<TaskFile, 'mimeType' | 'name'>): boolean =>
  isImageFile(f) && !/hei[cf]/i.test(`${f.mimeType} ${f.name}`);

export const formatBytes = (n: number | null | undefined): string => {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

/** Human-readable refusal, or null when the file is fine. */
export const describeTaskFileProblem = (file: File): string | null => {
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_TASK_FILE_BYTES) {
    return `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. Keep each file under ${MAX_TASK_FILE_MB} MB.`;
  }
  return null;
};

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : '';
};

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const buildTaskFilePath = (uid: string, name: string): string => {
  const ext = extensionOf(name);
  return `${uid}/${newId()}${ext ? `.${ext}` : ''}`;
};

/**
 * Shrink a big photo before it goes up.
 *
 * Only JPEG/PNG/WebP that the browser can decode, and only when it is bigger
 * than it needs to be. Anything else — a PDF, a GIF (which would lose its
 * animation), a HEIC that Chrome cannot decode — is sent exactly as picked.
 * A failure anywhere here falls back to the original: a slow upload is better
 * than no upload.
 */
export const shrinkImage = async (file: File): Promise<File> => {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;
  if (file.size < 600 * 1024) return file;
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (typeof (bitmap as any).close === 'function') (bitmap as any).close();

    // PNG stays PNG: it is usually a screenshot, and JPEG smears text.
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, type, 0.85));
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    const name = type === 'image/png' ? `${base}.png` : `${base}.jpg`;
    return new File([blob], name, { type, lastModified: file.lastModified });
  } catch {
    return file;
  }
};

/**
 * Upload one file and return its record. Nothing is written to a task here —
 * the record is handed back to the editor and saved with the task, so a file
 * picked in a form that is then cancelled is never listed anywhere.
 */
export const uploadTaskFile = async (uid: string, picked: File): Promise<TaskFile> => {
  const problem = describeTaskFileProblem(picked);
  if (problem) throw new Error(problem);

  const file = await shrinkImage(picked);
  const path = buildTaskFilePath(uid, file.name);
  const { error } = await supabase.storage
    .from(TASK_FILE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });
  if (error) throw new Error(error.message || 'The upload failed.');

  return {
    id: newId(),
    path,
    name: file.name || 'file',
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    uploadedBy: uid,
    uploadedAt: new Date().toISOString(),
  };
};

/**
 * Delete objects that were uploaded in an editor and discarded before the task
 * was ever saved — the only case where nothing else can be pointing at them.
 * Best effort: a leftover object is untidy, a thrown error here would block
 * closing a form.
 */
export const discardUnsaved = async (files: TaskFile[]): Promise<void> => {
  const paths = files.map(f => f.path).filter(Boolean);
  if (!paths.length) return;
  try {
    await supabase.storage.from(TASK_FILE_BUCKET).remove(paths);
  } catch {
    /* ignored on purpose — see above */
  }
};

/**
 * Signing, cached and batched — the same shape as lib/staffPhoto.
 *
 * A task with eight step screenshots would otherwise be eight round trips to
 * draw one modal. A miss joins a queue that is flushed on the next tick through
 * createSignedUrls, and the answer is cached by path. Paths are never reused
 * (a fresh uuid per upload) so a cached URL can only expire, never point at the
 * wrong file. Expiry is tracked so a page left open past the TTL re-signs.
 */
interface CacheEntry { url: string | null; expires: number }
const cache = new Map<string, CacheEntry>();
let queue = new Set<string>();
let flushing: Promise<void> | null = null;

const fresh = (path: string): CacheEntry | undefined => {
  const hit = cache.get(path);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(path);
    return undefined;
  }
  return hit;
};

const flush = async (): Promise<void> => {
  const paths = Array.from(queue);
  queue = new Set();
  // Five minutes short of the TTL, so a URL handed out is never about to die.
  const expires = Date.now() + (TASK_FILE_TTL_SECONDS - 300) * 1000;
  // A failure is remembered for a short while only, so a dropped connection
  // does not leave every picture blank until the page is reloaded.
  const failExpires = Date.now() + 30 * 1000;
  if (paths.length) {
    try {
      const { data, error } = await supabase.storage
        .from(TASK_FILE_BUCKET)
        .createSignedUrls(paths, TASK_FILE_TTL_SECONDS);
      if (error || !data) {
        paths.forEach(p => cache.set(p, { url: null, expires: failExpires }));
      } else {
        data.forEach((row: any) => {
          if (row?.path) {
            const url = row.error ? null : row.signedUrl ?? null;
            cache.set(row.path, { url, expires: url ? expires : failExpires });
          }
        });
        paths.forEach(p => {
          if (!cache.has(p)) cache.set(p, { url: null, expires: failExpires });
        });
      }
    } catch {
      paths.forEach(p => cache.set(p, { url: null, expires: failExpires }));
    }
  }
  flushing = null;
};

/** A viewable URL for a stored key, or null. Never throws. */
export const signTaskFile = async (path: string | null | undefined): Promise<string | null> => {
  if (!path) return null;
  const hit = fresh(path);
  if (hit) return hit.url;

  queue.add(path);
  if (!flushing) {
    flushing = new Promise<void>(resolve => {
      setTimeout(() => { void flush().then(resolve); }, 0);
    });
  }
  await flushing;
  return cache.get(path)?.url ?? null;
};

/** Synchronous peek, so a re-render does not flash an empty tile. */
export const cachedTaskFileUrl = (path: string | null | undefined): string | null | undefined =>
  path ? fresh(path)?.url : null;

/** Clean the records that come out of jsonb: anything without a path is not a
 *  file we can show, and an old row may have no array at all. */
export const normalizeTaskFiles = (raw: unknown): TaskFile[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f: any) => f && typeof f.path === 'string' && f.path)
    .map((f: any) => ({
      id: String(f.id || f.path),
      path: f.path,
      name: typeof f.name === 'string' && f.name ? f.name : 'file',
      mimeType: typeof f.mimeType === 'string' ? f.mimeType : '',
      size: Number(f.size) || 0,
      uploadedBy: typeof f.uploadedBy === 'string' ? f.uploadedBy : undefined,
      uploadedAt: typeof f.uploadedAt === 'string' ? f.uploadedAt : '',
    }));
};
