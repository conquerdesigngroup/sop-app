import {
  STREAM_CHUNK_BYTES,
  MAX_STREAM_BYTES,
  goesToStream,
  validateStreamFile,
  streamIframeUrl,
  streamWatchUrl,
  streamThumbnailUrl,
  formatDuration,
  streamStatusLabel,
  streamDownloadFilename, streamDownloadHref,
  videoSaveSupport, describeFetchProgress, SHARE_MAX_BYTES,
} from './portalStream';

/**
 * The rules Cloudflare enforces on the other end, pinned here so a "tidy"
 * edit to a constant fails a test instead of failing every upload at 5 MB in.
 */
describe('the tus chunk size', () => {
  it('is a multiple of 256 KiB, as Cloudflare requires', () => {
    expect(STREAM_CHUNK_BYTES % (256 * 1024)).toBe(0);
  });
  it('is inside the 5 MiB – 200 MiB window', () => {
    expect(STREAM_CHUNK_BYTES).toBeGreaterThanOrEqual(5 * 1024 * 1024);
    expect(STREAM_CHUNK_BYTES).toBeLessThanOrEqual(200 * 1024 * 1024);
  });
});

describe('routing a picked file', () => {
  it('sends an MP4 to Stream', () => {
    expect(goesToStream({ type: 'video/mp4', name: 'class.mp4' })).toBe(true);
  });
  it('sends an iPhone .mov with no MIME type to Stream — Safari often sends none', () => {
    expect(goesToStream({ type: '', name: 'IMG_2231.MOV' })).toBe(true);
  });
  it('keeps photos, PDFs and music in the bucket', () => {
    expect(goesToStream({ type: 'image/jpeg', name: 'costume.jpg' })).toBe(false);
    expect(goesToStream({ type: 'application/pdf', name: 'slip.pdf' })).toBe(false);
    expect(goesToStream({ type: 'audio/mpeg', name: 'routine.mp3' })).toBe(false);
  });
  it('believes a real non-video MIME over a video extension', () => {
    expect(goesToStream({ type: 'application/pdf', name: 'weird.mp4' })).toBe(false);
  });
});

describe('validating a video', () => {
  it('accepts a multi-gigabyte class recording', () => {
    expect(validateStreamFile({ size: 3 * 1024 * 1024 * 1024 })).toBeNull();
  });
  it('refuses an empty file', () => {
    expect(validateStreamFile({ size: 0 })).toMatch(/empty/);
  });
  it('refuses anything over the ceiling, and says the number', () => {
    expect(validateStreamFile({ size: MAX_STREAM_BYTES + 1 })).toMatch(/20 GB/);
  });
});

describe('URLs derived from the stored playback base', () => {
  const base = 'https://customer-abc123.cloudflarestream.com/0123456789abcdef0123456789abcdef';
  it('player, watch page and thumbnail all hang off the same base', () => {
    expect(streamIframeUrl(base)).toBe(`${base}/iframe`);
    expect(streamWatchUrl(base)).toBe(`${base}/watch`);
    expect(streamThumbnailUrl(base)).toBe(`${base}/thumbnails/thumbnail.jpg`);
  });
});

describe('formatDuration', () => {
  it('shows minutes:seconds under an hour', () => {
    expect(formatDuration(754)).toBe('12:34');
    expect(formatDuration(5)).toBe('0:05');
  });
  it('shows hours:minutes:seconds with zero-padded minutes past an hour', () => {
    expect(formatDuration(3723)).toBe('1:02:03');
  });
  it('rounds Cloudflare\'s fractional seconds', () => {
    expect(formatDuration(59.6)).toBe('1:00');
  });
  it('is null for nothing, a negative, or NaN', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(-1)).toBeNull();
    expect(formatDuration(NaN)).toBeNull();
  });
});

describe('streamDownloadFilename', () => {
  it('turns a title into something Cloudflare accepts, with the extension', () => {
    expect(streamDownloadFilename('Tuesday class recording')).toBe('Tuesday-class-recording.mp4');
    expect(streamDownloadFilename('  Jazz 2 — week 3 (Ms. B)  ')).toBe('Jazz-2-week-3-Ms-B.mp4');
  });
  it('falls back when nothing in the title is usable', () => {
    expect(streamDownloadFilename('🎉🎉')).toBe('video.mp4');
    expect(streamDownloadFilename('')).toBe('video.mp4');
  });
  it('keeps under Cloudflare\'s 120-character cap', () => {
    const long = 'a'.repeat(200);
    expect(streamDownloadFilename(long).length).toBeLessThanOrEqual(120);
  });
  it('builds the href from the recorded URL', () => {
    expect(streamDownloadHref('https://x/downloads/default.mp4', 'Recital'))
      .toBe('https://x/downloads/default.mp4?filename=Recital.mp4');
  });
});

describe('videoSaveSupport', () => {
  const probeOk = { share: async () => undefined, canShare: () => true };
  it('is share only when the browser can share a video file', () => {
    expect(videoSaveSupport(probeOk)).toBe('share');
    expect(videoSaveSupport({ ...probeOk, canShare: () => false })).toBe('link');
    expect(videoSaveSupport({ share: async () => undefined })).toBe('link');
    expect(videoSaveSupport({})).toBe('link');
    expect(videoSaveSupport(undefined)).toBe('link');
  });
  it('treats a throwing canShare as no support', () => {
    expect(videoSaveSupport({ ...probeOk, canShare: () => { throw new Error('x'); } })).toBe('link');
  });
});

describe('describeFetchProgress', () => {
  it('shows a percentage against a known total', () => {
    expect(describeFetchProgress(9 * 1024 * 1024, 21 * 1024 * 1024)).toBe('42% of 21 MB');
    expect(describeFetchProgress(0, 2.5 * 1024 * 1024)).toBe('0% of 2.5 MB');
  });
  it('never claims more than 100%', () => {
    expect(describeFetchProgress(30, 10)).toBe('100% of 0.0 MB');
  });
  it('shows bytes so far without a total', () => {
    expect(describeFetchProgress(12 * 1024 * 1024, null)).toBe('12 MB so far');
  });
  it('caps the in-memory path at 300 MB', () => {
    expect(SHARE_MAX_BYTES).toBe(300 * 1024 * 1024);
  });
});

describe('streamStatusLabel', () => {
  it('names the two states a teacher has to know about, and nothing for ready', () => {
    expect(streamStatusLabel('pending')).toBe('Processing');
    expect(streamStatusLabel('error')).toBe('Video failed');
    expect(streamStatusLabel('ready')).toBeNull();
    expect(streamStatusLabel(null)).toBeNull();
  });
});
