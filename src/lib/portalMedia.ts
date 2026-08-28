/**
 * What a file IS, and how to hand it to a browser.
 *
 * A class carries four different things under one `portal_documents` table: a
 * costume photo, a choreography video, the music, and the permission slip. Only
 * the last of those is a download. The first three are content — a parent
 * should see the photo on the class page, not a grey row that promises one.
 *
 * Everything here is pure so the decisions can be tested without a browser or a
 * network. The components in components/portal/DocumentList.tsx do the rendering
 * and own the fallbacks; this file only decides what to attempt.
 */

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

/**
 * Extension -> kind, used only when the MIME type is missing or useless.
 *
 * It is missing more often than you would think. A file picked on iOS can
 * arrive with an empty `type`, and files uploaded before the video columns
 * existed have whatever the browser guessed at the time. The stored name always
 * has the extension because buildStoragePath keeps it.
 */
const EXTENSION_KIND: Readonly<Record<string, MediaKind>> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  gif: 'image',
  heic: 'image',
  heif: 'image',

  mp4: 'video',
  m4v: 'video',
  mov: 'video',
  webm: 'video',

  mp3: 'audio',
  m4a: 'audio',
  aac: 'audio',
  wav: 'audio',
};

/** Lowercase extension without the dot, or '' when there is not one. */
export const extensionOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return '';
  return fileName.slice(dot + 1).toLowerCase();
};

/**
 * MIME first, extension second.
 *
 * The MIME type is what the browser will actually act on, so when it says
 * `image/*` that is the answer even if someone named the file ".pdf". The
 * extension only gets a say when the MIME is absent or generic — Safari and
 * some Android pickers send `application/octet-stream` for a perfectly ordinary
 * .mov, and treating that as an undisplayable blob is the bug this avoids.
 */
export const mediaKindOf = (mimeType: string | null, fileName: string): MediaKind => {
  const mime = (mimeType ?? '').toLowerCase();

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  // A real type that is none of the three: believe it, and do not let the
  // extension table override it. application/pdf is a file, full stop.
  const generic = !mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream';
  if (!generic) return 'file';

  return EXTENSION_KIND[extensionOf(fileName)] ?? 'file';
};

/** True for the kinds that get rendered in place rather than listed as a row. */
export const isPlayable = (kind: MediaKind): boolean => kind !== 'file';

/**
 * The same signed URL, but asking storage to send it as an attachment.
 *
 * `?download=` is read by the storage server at request time and is not part of
 * what the token signs — supabase-js's own `{ download }` option does exactly
 * this string append after the URL comes back. So one signature covers both
 * jobs: bare for an <img>/<video> src, this for the download button.
 *
 * encodeURIComponent rather than the SDK's encodeURI: a file called
 * "Recital #2 & 3.pdf" has to survive being a query value, and encodeURI leaves
 * both `#` and `&` alone.
 */
export const withDownload = (signedUrl: string, fileName: string): string => {
  const separator = signedUrl.includes('?') ? '&' : '?';
  return `${signedUrl}${separator}download=${encodeURIComponent(fileName || 'file')}`;
};

/**
 * Types a phone will not play, even though the bucket accepts them.
 *
 * HEIC is the live one. iPhones shoot it by default, Safari renders it, and
 * every other browser shows a broken image — so an Android parent gets nothing
 * where an iPhone parent gets a photo. .mov is the same story a step milder:
 * Safari plays it, Chrome usually will not.
 *
 * This is advice for the AUTHOR, in the upload form. It is deliberately not
 * used to decide what to render: the components try anyway and fall back to a
 * download row when the browser says it cannot, because the browser is the only
 * thing that actually knows.
 */
export const compatibilityWarning = (mimeType: string, fileName: string): string | null => {
  const mime = mimeType.toLowerCase();
  const ext = extensionOf(fileName);

  if (mime === 'image/heic' || mime === 'image/heif' || ext === 'heic' || ext === 'heif') {
    return 'HEIC photos only display on Apple devices. Parents on Android will get a download instead. '
      + 'Sending it to yourself as a JPG first avoids that.';
  }
  if (mime === 'video/quicktime' || ext === 'mov') {
    return 'A .mov plays on Apple devices but often not on Android. An MP4 plays everywhere.';
  }
  return null;
};
