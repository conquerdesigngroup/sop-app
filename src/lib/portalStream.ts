import { mediaKindOf } from './portalMedia';

/**
 * Class videos live in Cloudflare Stream; everything else lives in the bucket.
 *
 * A phone records a class as 1–3 GB and the bucket would keep and re-send
 * every byte. Stream re-encodes once and streams whatever each parent's
 * connection can carry, and an iPhone .mov comes out the other side playing
 * on Android. So a picked file is routed by what it IS: video here, the rest
 * through portalAdmin.ts as before.
 *
 * This file is the pure half — routing, limits, and the URLs derived from the
 * playback base a row stores. It imports nothing that needs a browser or a
 * network, so the parent-facing list can use it under test without dragging
 * in the upload client. The network half is portalStreamUpload.ts.
 */

export type StreamStatus = 'pending' | 'ready' | 'error';

/**
 * Stream's own ceiling is 30 GB. 20 leaves headroom and is more than any
 * phone holds in one clip; a longer class is two uploads, not one.
 */
export const MAX_STREAM_BYTES = 20 * 1024 * 1024 * 1024;

/**
 * Storage is reserved per upload by duration, not size, so the ticket has to
 * name a maximum. Three hours covers a full class with margin. Mirrors the
 * default of STREAM_MAX_DURATION_SECONDS in the portal-stream function.
 */
export const MAX_STREAM_HOURS = 3;

/**
 * tus chunk size. Cloudflare requires ≥ 5 MiB, ≤ 200 MiB, and a multiple of
 * 256 KiB. 16 MiB is 64 × 256 KiB: big enough not to chatter, small enough
 * that a chunk dropped on cellular is cheap to resend.
 */
export const STREAM_CHUNK_BYTES = 16 * 1024 * 1024;

export const STREAM_HINT =
  `Videos are sent to Cloudflare Stream: any size, up to ${MAX_STREAM_HOURS} hours, and they play on every phone.`;

/** True for what Stream should take. Uses the same MIME-then-extension rule as playback. */
export const goesToStream = (file: Pick<File, 'type' | 'name'>): boolean =>
  mediaKindOf(file.type || null, file.name) === 'video';

/** Null when fine, otherwise the sentence to show. Duration is Cloudflare's to refuse. */
export const validateStreamFile = (file: Pick<File, 'size'>): string | null => {
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_STREAM_BYTES) {
    const gb = 1024 * 1024 * 1024;
    return `That video is ${(file.size / gb).toFixed(1)} GB. The limit is ${MAX_STREAM_BYTES / gb} GB.`;
  }
  return null;
};

// The row stores `https://customer-<code>.cloudflarestream.com/<uid>` and
// these are the three things Cloudflare serves under it.
export const streamIframeUrl = (playbackUrl: string): string => `${playbackUrl}/iframe`;
export const streamWatchUrl = (playbackUrl: string): string => `${playbackUrl}/watch`;
export const streamThumbnailUrl = (playbackUrl: string): string =>
  `${playbackUrl}/thumbnails/thumbnail.jpg`;

/**
 * The name the saved file gets. Cloudflare's `?filename=` takes at most 120
 * characters of letters, digits, hyphens and underscores plus one extension,
 * so the title is reduced to that: "Tuesday class recording" → Tuesday-class-recording.mp4.
 * A title with nothing usable in it becomes video.mp4.
 */
export const streamDownloadFilename = (title: string): string => {
  const slug = title
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return `${slug || 'video'}.mp4`;
};

/** The Download button's href: the recorded MP4 URL, named after the title. */
export const streamDownloadHref = (downloadUrl: string, title: string): string =>
  `${downloadUrl}?filename=${streamDownloadFilename(title)}`;

/**
 * Save to Photos works by fetching the whole MP4 into memory and handing it
 * to the phone's share sheet. 300 MB is comfortably inside what an older
 * iPhone's Safari will hold; a full class can be several times that and goes
 * the plain-download way instead.
 */
export const SHARE_MAX_BYTES = 300 * 1024 * 1024;

export type SaveToPhotosSupport = 'share' | 'link';

/**
 * 'share' when this browser can hand a file of this type to the share sheet
 * (iOS 15+, Android Chrome, installed PWAs included); 'link' everywhere
 * else, where Save / Download stays a plain anchor.
 */
export const saveToPhotosSupport = (
  nav: Partial<Pick<Navigator, 'share' | 'canShare'>> | undefined,
  mime: string = 'video/mp4',
): SaveToPhotosSupport => {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return 'link';
  if (typeof File === 'undefined') return 'link';
  try {
    const ext = mime.startsWith('image/') ? 'jpg' : 'mp4';
    return nav.canShare({ files: [new File([''], `probe.${ext}`, { type: mime })] }) ? 'share' : 'link';
  } catch {
    return 'link';
  }
};

const mb = (bytes: number): string => {
  const n = bytes / (1024 * 1024);
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} MB`;
};

/** "43% of 21 MB", or "12 MB so far" when the total is unknown. */
export const describeFetchProgress = (received: number, total: number | null): string =>
  total && total > 0
    ? `${Math.min(100, Math.floor((received / total) * 100))}% of ${mb(total)}`
    : `${mb(received)} so far`;

/** 754 → "12:34", 3723 → "1:02:03". Null for anything that is not a duration. */
export const formatDuration = (seconds: number | null | undefined): string | null => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
};

/** What the staff list shows next to a video that is not yet playable. */
export const streamStatusLabel = (status: StreamStatus | null | undefined): string | null =>
  status === 'pending' ? 'Processing' : status === 'error' ? 'Video failed' : null;
