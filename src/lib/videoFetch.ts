/**
 * Pulls a video down as a File the phone's share sheet can take.
 *
 * WHY THIS EXISTS
 *
 * A download link saves a class video into Files, and getting it from there
 * into Photos is four taps through the share sheet. The share API can hand the
 * phone an actual file instead — and the iOS sheet then offers "Save Video"
 * directly — but only a file already in memory. So the MP4 is fetched here,
 * chunk by chunk, reporting progress as it comes, and turned into a File.
 *
 * The whole thing sits in memory until it is shared. That is fine for a clip
 * and dangerous for a 40-minute class on an older phone, which is what
 * `maxBytes` is for: the caller passes the ceiling, and anything over it is
 * refused up front (from Content-Length) or mid-stream (when there is none)
 * so the caller can fall back to a plain download.
 */

export interface FetchProgress {
  /** Bytes received so far. */
  received: number;
  /** Bytes expected, or null when the server did not say. */
  total: number | null;
}

/** Thrown when the file is over `maxBytes`. `bytes` is the size when known. */
export class VideoTooLarge extends Error {
  readonly bytes: number | null;
  constructor(bytes: number | null) {
    super('Video is too large to hold in memory');
    this.name = 'VideoTooLarge';
    this.bytes = bytes;
  }
}

export interface FetchVideoOptions {
  onProgress?: (p: FetchProgress) => void;
  signal?: AbortSignal;
  maxBytes: number;
}

/** True for the rejection fetch/read produce when `signal` is aborted. */
export const isAbort = (e: unknown): boolean =>
  e instanceof Error && e.name === 'AbortError';

export const fetchVideoFile = async (
  url: string,
  filename: string,
  { onProgress, signal, maxBytes }: FetchVideoOptions,
): Promise<File> => {
  const res = await fetch(url, { signal, credentials: 'omit' });
  if (!res.ok) throw new Error(`Video fetch failed (${res.status})`);

  const mime = (res.headers.get('content-type') || 'video/mp4').split(';')[0].trim() || 'video/mp4';
  const lengthHeader = res.headers.get('content-length');
  const total = lengthHeader && Number(lengthHeader) > 0 ? Number(lengthHeader) : null;
  if (total !== null && total > maxBytes) {
    await res.body?.cancel?.().catch(() => undefined);
    throw new VideoTooLarge(total);
  }

  onProgress?.({ received: 0, total });

  // No streaming body (very old browsers): take it in one piece.
  if (!res.body) {
    const blob = await res.blob();
    if (blob.size > maxBytes) throw new VideoTooLarge(blob.size);
    onProgress?.({ received: blob.size, total: blob.size });
    return new File([blob], filename, { type: mime });
  }

  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value as BlobPart);
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new VideoTooLarge(null);
    }
    onProgress?.({ received, total });
  }

  return new File(chunks, filename, { type: mime });
};
