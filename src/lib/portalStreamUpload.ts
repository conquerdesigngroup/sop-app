import * as tus from 'tus-js-client';
import { supabase } from './supabase';
import { STREAM_CHUNK_BYTES, StreamStatus } from './portalStream';

/**
 * The network half of Cloudflare Stream: the three calls to the portal-stream
 * Edge Function, and the resumable upload of the bytes themselves.
 *
 * The bytes never touch Supabase. The function hands back a one-time tus URL
 * on upload.cloudflarestream.com and the phone PATCHes chunks straight to it;
 * a dropped connection resumes from the last chunk Cloudflare acknowledged
 * rather than from zero, which on a 2 GB class recording over studio wifi is
 * the difference between an upload that finishes and one that never does.
 */

export const STREAM_FUNCTION = 'portal-stream';

export interface StreamUploadTicket {
  uid: string;
  uploadUrl: string;
  /** `https://customer-<code>.cloudflarestream.com/<uid>` — stored on the row. */
  playbackUrl: string;
  expiresAt: string;
}

export interface StreamStatusReport {
  status: StreamStatus;
  state: string | null;
  durationSeconds: number | null;
  errorText: string | null;
  playbackUrl: string | null;
}

/**
 * supabase.functions.invoke reports any non-2xx as a FunctionsHttpError whose
 * `context` is the Response. The function puts the reason in {error}, and that
 * sentence is the one a teacher should read — not "Edge Function returned a
 * non-2xx status code".
 */
const invoke = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(STREAM_FUNCTION, { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      const parsed = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
      if (parsed?.error) message = parsed.error;
    } catch { /* keep the generic message */ }
    throw new Error(message);
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
};

export const createStreamUpload = (args: {
  classId: string | null;
  title: string;
  fileName: string;
  sizeBytes: number;
}): Promise<StreamUploadTicket> => invoke({ action: 'create', ...args });

export const fetchStreamStatus = (uid: string): Promise<StreamStatusReport> =>
  invoke({ action: 'status', uid });

/** Deletes the video on Cloudflare AND its row, in that order. Safe to repeat. */
export const deleteStreamVideo = (uid: string): Promise<{ deleted: true; hadRow: boolean }> =>
  invoke({ action: 'delete', uid });

/** Thrown when the person tapped Cancel. Not an error to show. */
export class StreamUploadAborted extends Error {
  constructor() {
    super('Upload cancelled.');
    this.name = 'StreamUploadAborted';
  }
}

/**
 * Push the file to the ticket's tus URL, reporting 0–1 as it goes.
 *
 * `uploadUrl` rather than `endpoint`: the function already created the upload
 * on Cloudflare, so the client's first request is a HEAD for the offset and
 * then PATCHes — which is also exactly what resuming looks like, so a retry
 * after a dropped connection needs no special path. Fingerprints are not
 * stored: a fresh ticket is minted per attempt and a stale localStorage entry
 * pointing at an expired URL would only confuse the next one.
 */
export const uploadToStream = (
  file: File,
  uploadUrl: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      uploadUrl,
      chunkSize: STREAM_CHUNK_BYTES,
      retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => onProgress(total > 0 ? sent / total : 0),
      onError: (err) => reject(signal?.aborted ? new StreamUploadAborted() : err),
      onSuccess: () => resolve(),
    });

    if (signal) {
      if (signal.aborted) {
        reject(new StreamUploadAborted());
        return;
      }
      signal.addEventListener('abort', () => {
        void upload.abort();
        reject(new StreamUploadAborted());
      }, { once: true });
    }

    upload.start();
  });
