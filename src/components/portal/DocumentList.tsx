import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from '../../theme';
import { Spinner } from '../ui';
import { usePortal } from '../../contexts/PortalContext';
import { formatFileSize } from '../../lib/portal';
import { mediaKindOf, withDownload, MediaKind } from '../../lib/portalMedia';
import {
  streamIframeUrl, streamDownloadHref, streamDownloadFilename, formatDuration,
  saveToPhotosSupport, describeFetchProgress, SHARE_MAX_BYTES,
} from '../../lib/portalStream';
import { fetchVideoFile, isAbort, VideoTooLarge, FetchProgress } from '../../lib/videoFetch';
import { resolveStreamDownload } from '../../lib/portalStreamDownload';
import { PortalDocument } from '../../types';

/**
 * The files on a class, as a parent sees them.
 *
 * A photo is shown. A video plays. Everything else is a row you tap to
 * download. That distinction is the whole point of this file: the old version
 * rendered every attachment as an identical grey row, so a costume photo
 * arrived as a promise of a photo rather than the photo.
 *
 * TWO THINGS HAD TO CHANGE TO MAKE THAT POSSIBLE
 *
 * 1. URLs are signed for the whole list at once, when it mounts, instead of on
 *    tap. An <img> needs a src before anyone touches anything. One batched
 *    request covers every file on the page — see lib/portalStorage.ts.
 *
 * 2. Opening a file is now a plain <a href>, not window.open() after an await.
 *    That await is why downloads did nothing on a phone: iOS treats a popup
 *    opened outside the tap that caused it as unsolicited and drops it in
 *    silence, so the button could be pressed forever with no result and no
 *    error. With the URL already signed there is nothing to await, and a real
 *    anchor is never blocked.
 *
 * WHAT PLAYS IS THE BROWSER'S CALL, NOT OURS
 *
 * Every media block degrades to the download row on its own `error` event.
 * HEIC is the reason: an iPhone shoots it, Safari renders it, and Chrome shows
 * a broken image. Guessing from the MIME type would mean picking one of those
 * two answers for everybody, so instead each block tries and steps aside when
 * the browser that is actually rendering says it cannot.
 */

// ------------------------------------------------------------------ chrome

const CARD: React.CSSProperties = {
  backgroundColor: theme.colors.bg.secondary,
  border: `2px solid ${theme.colors.bdr.primary}`,
  borderRadius: theme.borderRadius.lg,
  overflow: 'hidden',
};

const FileIcon: React.FC<{ kind: MediaKind }> = ({ kind }) => {
  const d = kind === 'image'
    ? 'M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M21 15l-5-5L5 21'
    : kind === 'audio'
      ? 'M9 18V5l12-2v13 M9 18a3 3 0 11-6 0 3 3 0 016 0z M21 16a3 3 0 11-6 0 3 3 0 016 0z'
      : kind === 'video'
        ? 'M23 7l-7 5 7 5V7z M14 5H3a2 2 0 00-2 2v10a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2z'
        : 'M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7';

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const DownloadGlyph: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
    <path
      d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3"
      style={{ stroke: 'currentColor' }}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Title: React.FC<{ doc: PortalDocument }> = ({ doc }) => (
  <>
    <span style={{
      ...theme.typography.body,
      fontFamily: theme.fonts.primary,
      fontWeight: 600,
      color: theme.colors.txt.primary,
      display: 'block',
      // A file name has nothing to break at, and a flex child will not shrink
      // below its content without both of these. See CLAUDE.md.
      overflowWrap: 'anywhere',
    }}>
      {doc.title}
    </span>

    {doc.description && (
      <span style={{
        ...theme.typography.caption,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.tertiary,
        display: 'block',
        marginTop: '2px',
        overflowWrap: 'anywhere',
      }}>
        {doc.description}
      </span>
    )}
  </>
);

const Meta: React.FC<{ doc: PortalDocument; failed?: boolean }> = ({ doc, failed }) => {
  // A Stream video's size is the original upload, which nobody receives;
  // its duration is what a parent wants to know.
  const text = [
    doc.category,
    doc.streamUid ? formatDuration(doc.durationSeconds) : formatFileSize(doc.sizeBytes),
  ].filter(Boolean).join(' · ');
  if (!text && !failed) return null;

  return (
    <span style={{
      ...theme.typography.captionSmall,
      fontFamily: theme.fonts.mono,
      color: failed ? theme.colors.status.error : theme.colors.txt.tertiary,
      display: 'block',
      marginTop: '4px',
    }}>
      {failed ? 'Could not open — try again' : text}
    </span>
  );
};

/** The save control's look, shared by the anchor and the Save-to-Photos button. */
const SAVE_CONTROL: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexShrink: 0,
  padding: '6px 10px',
  borderRadius: theme.borderRadius.md,
  backgroundColor: theme.colors.bg.tertiary,
  color: theme.colors.txt.secondary,
  textDecoration: 'none',
  ...theme.typography.captionSmall,
  fontFamily: theme.fonts.primary,
  fontWeight: 600,
  // 32px of padding plus the glyph is under the 44px touch target on
  // its own; the row it sits in is taller than that, and the label
  // makes the hit area wide enough to be hit.
  minHeight: '32px',
  border: 'none',
  cursor: 'pointer',
};

/**
 * The strip under a photo or a video: what it is on the left, save on the right.
 *
 * The download is a separate control rather than the whole card being one,
 * because the card is now something you look at. Tapping a video should play
 * it, and a parent who wants the file still needs somewhere to say so.
 */
const MediaCaption: React.FC<{
  doc: PortalDocument;
  downloadUrl: string | null;
  /** "Save" for a file we hold; "Download" for the MP4 Cloudflare built. */
  label?: string;
  /** Replaces the anchor entirely — the Stream card's stateful control. */
  action?: React.ReactNode;
  onDownload?: (doc: PortalDocument) => void;
}> = ({
  doc, downloadUrl, label = 'Save', action, onDownload,
}) => (
  <div style={{
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px 14px',
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  }}>
    <span style={{ flex: 1, minWidth: 0 }}>
      <Title doc={doc} />
      <Meta doc={doc} />
    </span>

    {action ?? (downloadUrl && (
      <a
        href={downloadUrl}
        // Fires alongside the download, never instead of it — onClick on an
        // <a href> does not swallow the navigation (see DocumentList.test).
        onClick={() => onDownload?.(doc)}
        // No target: the URL carries Content-Disposition: attachment, so the
        // browser downloads it and stays put. _blank would open a tab that
        // immediately closes itself.
        style={SAVE_CONTROL}
      >
        <DownloadGlyph />
        {label}
      </a>
    ))}
  </div>
);

// ------------------------------------------------------------ save to photos

type SaveStage = 'idle' | 'fetching' | 'ready' | 'sharing' | 'shared' | 'handedOff' | 'failed';

/**
 * A photo that arrives within this long of the tap is shared straight away,
 * inside the tap's own activation, so it is ONE tap: Save → the sheet. Past
 * it, Safari would refuse the sheet as unprompted, so the flow falls back to
 * the second tap. Videos never try this: they take long enough that the
 * second tap is a clearer moment, and the tests pin the two-tap shape.
 */
const IMMEDIATE_SHARE_MS = 1500;

/**
 * Save (a photo) or Download (a class video) → Save to Photos.
 *
 * A plain download link lands the file in Files, and Files → share → Save
 * Image is where parents got lost. With the share API the phone can be
 * handed the file itself, and the iOS sheet then offers "Save Image" or
 * "Save Video" on the first screen. The file has to be in memory first, so:
 * the first tap fetches it (with the bar and the words below, because twenty
 * silent seconds is exactly how people end up tapping five times), then Save
 * to Photos opens the sheet inside the tap Safari insists on. A photo that
 * arrives fast enough skips the second tap.
 *
 * Every other case — no share API, a file over SHARE_MAX_BYTES, a share
 * sheet that will not open — falls back to the ordinary download and says so.
 * Nothing here ever goes quiet: the status line under the caption always
 * says what is happening and what to do next. See CLAUDE.md, "Slow taps".
 */
const SaveToPhotos: React.FC<{
  doc: PortalDocument;
  kind: 'photo' | 'video';
  /** The plain download, for every fallback. */
  href: string;
  /** Where to fetch the bytes from; may differ from href (see Stream). */
  getUrl: () => Promise<string>;
  /** The name the saved file gets. */
  filename: string;
  /** What to probe the share sheet with — a file of this type. */
  mime: string;
  /** "Save" for a photo we hold; "Download" for the MP4 Cloudflare built. */
  idleLabel: string;
  onDownload?: (doc: PortalDocument) => void;
}> = ({ doc, kind, href, getUrl, filename, mime, idleLabel, onDownload }) => {
  const [support] = useState(() =>
    saveToPhotosSupport(typeof navigator === 'undefined' ? undefined : navigator, mime));
  const [stage, setStage] = useState<SaveStage>('idle');
  const [progress, setProgress] = useState<FetchProgress>({ received: 0, total: null });
  const [file, setFile] = useState<File | null>(null);
  // The tap can land between a render and the state update it caused, so
  // the guard against a second fetch is a ref, not `stage`.
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handOff = useCallback(() => {
    // The browser's own download: the URL carries Content-Disposition, so
    // the page stays put. assign(), not open() — see the file header.
    window.location.assign(href);
    setStage('handedOff');
  }, [href]);

  const openSheet = async (got: File): Promise<'shared' | 'dismissed' | 'refused'> => {
    try {
      await navigator.share({ files: [got], title: doc.title });
      return 'shared';
    } catch (e) {
      return isAbort(e) ? 'dismissed' : 'refused';
    }
  };

  const startFetch = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const tappedAt = Date.now();
    onDownload?.(doc);
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ received: 0, total: null });
    setStage('fetching');
    try {
      const url = await getUrl();
      if (controller.signal.aborted) { setStage('idle'); return; }
      const got = await fetchVideoFile(url, filename, {
        maxBytes: SHARE_MAX_BYTES,
        signal: controller.signal,
        onProgress: setProgress,
      });
      // A Cancel that landed after the last byte still means "I changed my
      // mind", not "ready" — and the fetch does not always reject for it.
      if (controller.signal.aborted) { setStage('idle'); return; }
      setFile(got);

      if (kind === 'photo' && Date.now() - tappedAt < IMMEDIATE_SHARE_MS) {
        setStage('sharing');
        const outcome = await openSheet(got);
        // A refusal here is Safari saying the tap has expired, not that the
        // phone will not take the file: offer the second tap.
        setStage(outcome === 'shared' ? 'shared' : 'ready');
        return;
      }
      setStage('ready');
    } catch (e) {
      if (isAbort(e)) setStage('idle');
      else if (e instanceof VideoTooLarge) handOff();
      else setStage('failed');
    } finally {
      busyRef.current = false;
      abortRef.current = null;
    }
  };

  const share = async () => {
    if (busyRef.current || !file) return;
    busyRef.current = true;
    setStage('sharing');
    const outcome = await openSheet(file);
    // Dismissing the sheet is not a failure; anything else means this phone
    // will not take the file, so give it the download instead.
    if (outcome === 'shared') setStage('shared');
    else if (outcome === 'dismissed') setStage('ready');
    else handOff();
    busyRef.current = false;
  };

  if (support === 'link') {
    return <MediaCaption doc={doc} downloadUrl={href} label={idleLabel} onDownload={onDownload} />;
  }

  const noun = kind === 'photo' ? 'photo' : 'video';
  const sheetItem = kind === 'photo' ? 'Save Image' : 'Save Video';
  const fetching = stage === 'fetching';
  const pct = progress.total ? Math.min(100, Math.floor((progress.received / progress.total) * 100)) : null;

  const message: string | null =
    stage === 'fetching'
      ? (progress.received === 0 && progress.total === null
          ? `Getting the ${noun} ready — connecting. Keep this page open.`
          : `Getting the ${noun} ready — ${describeFetchProgress(progress.received, progress.total)}. Keep this page open.`)
    : stage === 'ready' ? `Ready. Tap Save to Photos, then choose ${sheetItem}.`
    : stage === 'sharing' ? 'Opening your phone’s share sheet…'
    : stage === 'shared' ? 'Done. Tap Save to Photos again to send it somewhere else.'
    : stage === 'handedOff' ? `This one is too big to save straight to Photos, so your phone is downloading it as a file instead.`
    : stage === 'failed' ? `Couldn’t get the ${noun}. Check your connection and tap ${idleLabel} again.`
    : null;

  const canSave = (stage === 'ready' || stage === 'shared') && file !== null;
  const busy = fetching || stage === 'sharing';
  const button = stage === 'handedOff' ? (
    <a href={href} style={SAVE_CONTROL}><DownloadGlyph />{idleLabel}</a>
  ) : (
    <button
      type="button"
      onClick={canSave ? share : startFetch}
      disabled={busy}
      aria-busy={busy ? true : undefined}
      style={{
        ...SAVE_CONTROL,
        ...(canSave ? { backgroundColor: theme.colors.primary, color: '#FFFFFF' } : {}),
        ...(busy ? { cursor: 'progress', opacity: 0.85 } : {}),
      }}
    >
      {busy ? <Spinner size={16} color="currentColor" /> : <DownloadGlyph />}
      {fetching ? (pct === null ? `Getting ${noun}…` : `${pct}%`)
        : stage === 'sharing' ? 'Opening…'
        : canSave ? 'Save to Photos'
        : idleLabel}
    </button>
  );

  return (
    <>
      <MediaCaption doc={doc} downloadUrl={null} action={button} />
      {message && (
        <div role="status" aria-live="polite" style={{ padding: '0 14px 12px' }}>
          {fetching && (
            <div
              role="progressbar"
              aria-label={`Getting the ${noun}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct ?? undefined}
              style={{
                height: '6px',
                borderRadius: '3px',
                backgroundColor: theme.colors.bg.tertiary,
                overflow: 'hidden',
                marginBottom: '8px',
              }}
            >
              {/* Striped and moving so it reads as "working" even while the
                  number is not changing; index.css freezes the stripes under
                  prefers-reduced-motion and the words above still say it. */}
              <div
                className="progress-striped"
                style={{
                  height: '100%',
                  width: pct === null ? '100%' : `${Math.max(pct, 3)}%`,
                  backgroundColor: theme.colors.primary,
                  backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.28) 0 6px, transparent 6px 12px)',
                  backgroundSize: '1rem 1rem',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          )}
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.primary,
            color: stage === 'failed' ? theme.colors.status.error : theme.colors.txt.tertiary,
          }}>
            <span style={{ flex: 1, minWidth: 0 }}>{message}</span>
            {fetching && (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px 0',
                  color: theme.colors.txt.secondary,
                  font: 'inherit',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Cancel
              </button>
            )}
          </span>
        </div>
      )}
    </>
  );
};

// ------------------------------------------------------------------- blocks

/** The photo itself. Tapping it opens the full-size original in a new tab. */
const ImageBlock: React.FC<{
  doc: PortalDocument;
  url: string;
  onUndisplayable: () => void;
  onDownload?: (doc: PortalDocument) => void;
}> = ({ doc, url, onUndisplayable, onDownload }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <div style={CARD}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onDownload?.(doc)}
        style={{
          display: 'block',
          backgroundColor: theme.colors.bg.tertiary,
          // Holds the space until the image reports its own size, so the page
          // does not jump when it arrives. Dropped once it has.
          minHeight: loaded ? undefined : '160px',
        }}
      >
        <img
          src={url}
          alt={doc.description || doc.title}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={onUndisplayable}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        />
      </a>
      {/* The signed URL itself, not the &download= form: the bytes come
          into memory and go to the share sheet, so nothing should ask the
          browser to save a file. The fallbacks still use the download form. */}
      <SaveToPhotos
        doc={doc}
        kind="photo"
        href={withDownload(url, doc.fileName)}
        getUrl={async () => url}
        filename={doc.fileName || 'photo.jpg'}
        mime={doc.mimeType || 'image/jpeg'}
        idleLabel="Save"
        onDownload={onDownload}
      />
    </div>
  );
};

/**
 * The video, with the browser's own controls.
 *
 * preload="metadata" is what produces the thumbnail: it fetches the header and
 * the first frame, which is what the player shows before you press play, and
 * stops there. preload="none" would leave a black rectangle; preload="auto"
 * would pull the whole file down over a parent's mobile data before anyone
 * asked to watch it.
 *
 * playsInline is not optional. Without it an iPhone takes any <video> fullscreen
 * the moment it plays, which is not what "watch it on the class page" means.
 */
const VideoBlock: React.FC<{
  doc: PortalDocument;
  url: string;
  onUndisplayable: () => void;
  onDownload?: (doc: PortalDocument) => void;
}> = ({ doc, url, onUndisplayable, onDownload }) => {
  // Pressing play is the open — it is when the file's content actually gets
  // fetched. First play only: pausing and resuming re-fires onPlay, and one
  // watch should be one onDownload.
  const played = useRef(false);

  return (
    <div style={CARD}>
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        onPlay={() => {
          if (!played.current) {
            played.current = true;
            onDownload?.(doc);
          }
        }}
        onError={onUndisplayable}
        style={{
          display: 'block',
          width: '100%',
          maxHeight: '70dvh',
          // Literal black, not a theme token: letterboxing around a frame is
          // black in both light and dark mode, the way every video player does it.
          backgroundColor: '#000000',
        }}
      />
      <MediaCaption doc={doc} downloadUrl={withDownload(url, doc.fileName)} onDownload={onDownload} />
    </div>
  );
};

/** Music and voice notes. Same idea, and <audio> needs no frame. */
const AudioBlock: React.FC<{
  doc: PortalDocument;
  url: string;
  onUndisplayable: () => void;
  onDownload?: (doc: PortalDocument) => void;
}> = ({ doc, url, onUndisplayable, onDownload }) => {
  // First play only — see VideoBlock.
  const played = useRef(false);

  return (
    <div style={CARD}>
      <div style={{ padding: '14px 14px 0' }}>
        <audio
          src={url}
          controls
          preload="metadata"
          onPlay={() => {
            if (!played.current) {
              played.current = true;
              onDownload?.(doc);
            }
          }}
          onError={onUndisplayable}
          style={{ display: 'block', width: '100%' }}
        />
      </div>
      <MediaCaption doc={doc} downloadUrl={withDownload(url, doc.fileName)} onDownload={onDownload} />
    </div>
  );
};

/**
 * A class video on Cloudflare Stream, in Cloudflare's own player.
 *
 * Nothing is signed: the iframe streams whichever quality the parent's
 * connection can carry, which is the entire reason the video is there rather
 * than in the bucket. The Download control (SaveToPhotos) hands out the MP4
 * Cloudflare builds from the encode (v41), not the multi-gigabyte original —
 * and only once the row says that file exists, because Cloudflare builds it
 * after the video is already playable and a link that 404s meanwhile would
 * look broken.
 *
 * Before Cloudflare has finished encoding, the row says so instead of showing
 * a player that would sit on a spinner. The staff screen keeps that state
 * fresh; a parent's page shows whatever the row said when it loaded.
 *
 * Plays are not reported to onDownload: the player lives on another origin
 * and this component cannot see a tap inside it. Downloads are.
 */
const StreamBlock: React.FC<{
  doc: PortalDocument;
  onDownload?: (doc: PortalDocument) => void;
}> = ({ doc, onDownload }) => {
  if (doc.streamStatus !== 'ready' || !doc.streamPlaybackUrl) {
    const failed = doc.streamStatus === 'error';
    return (
      <div style={{ ...CARD, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
        <span style={{
          width: '40px',
          height: '40px',
          flexShrink: 0,
          borderRadius: theme.borderRadius.md,
          backgroundColor: theme.colors.bg.tertiary,
          color: theme.colors.txt.secondary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <FileIcon kind="video" />
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
          <Title doc={doc} />
          <span style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: failed ? theme.colors.status.error : theme.colors.txt.tertiary,
            display: 'block',
            marginTop: '4px',
          }}>
            {failed
              ? 'This video could not be processed. Ask the studio to post it again.'
              : 'Still processing — check back in a few minutes.'}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div style={CARD}>
      {/* A 16:9 box held open with padding, so the page does not jump when
          the player loads and older iOS without aspect-ratio still gets a
          frame. Literal black for the letterbox, as in VideoBlock. */}
      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', backgroundColor: '#000000' }}>
        <iframe
          src={streamIframeUrl(doc.streamPlaybackUrl)}
          title={doc.title}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
        />
      </div>
      {doc.streamDownloadUrl ? (
        <SaveToPhotos
          doc={doc}
          kind="video"
          href={streamDownloadHref(doc.streamDownloadUrl, doc.title)}
          // The recorded URL redirects, and the redirect blocks a browser
          // fetch; the function follows it for us. See portalStreamDownload.ts.
          getUrl={() => resolveStreamDownload(doc.streamUid ?? '', doc.title)}
          filename={streamDownloadFilename(doc.title)}
          mime="video/mp4"
          idleLabel="Download"
          onDownload={onDownload}
        />
      ) : (
        <MediaCaption doc={doc} downloadUrl={null} />
      )}
    </div>
  );
};

/**
 * Everything else: one row, the whole of it a download link.
 *
 * Falls back to signing on tap when the batch did not cover this file — a
 * newly uploaded row, or a signing call that failed. That path navigates
 * rather than opening a window, for the reason in the file header.
 */
const FileRow: React.FC<{
  doc: PortalDocument;
  url: string | null;
  kind: MediaKind;
  onDownload?: (doc: PortalDocument) => void;
}> = ({
  doc, url, kind, onDownload,
}) => {
  const { getDocumentUrl } = usePortal();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const body = (
    <>
      <span style={{
        width: '40px',
        height: '40px',
        flexShrink: 0,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.bg.tertiary,
        color: theme.colors.txt.secondary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <FileIcon kind={kind} />
      </span>

      <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
        <Title doc={doc} />
        <Meta doc={doc} failed={failed} />
      </span>

      {busy
        ? <Spinner size={18} color={theme.colors.txt.tertiary} />
        : <span style={{ color: theme.colors.txt.tertiary, display: 'flex' }}><DownloadGlyph /></span>}
    </>
  );

  const shell: React.CSSProperties = {
    ...CARD,
    padding: '16px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    textAlign: 'left',
    width: '100%',
    color: 'inherit',
    textDecoration: 'none',
  };

  if (url) {
    return <a href={withDownload(url, doc.fileName)} onClick={() => onDownload?.(doc)} style={shell}>{body}</a>;
  }

  const openLate = async () => {
    if (!doc.storagePath) return;
    setBusy(true);
    setFailed(false);
    const signed = await getDocumentUrl(doc.storagePath);
    setBusy(false);

    if (!signed) {
      setFailed(true);
      return;
    }
    onDownload?.(doc);
    // assign(), not window.open(): the tap that started this is long over by
    // the time the signature arrives, and a popup opened now is dropped by
    // iOS without a word. The URL asks for an attachment, so the browser
    // downloads it and this page stays where it is.
    window.location.assign(withDownload(signed, doc.fileName));
  };

  return (
    <button
      onClick={openLate}
      disabled={busy}
      style={{ ...shell, font: 'inherit', cursor: busy ? 'wait' : 'pointer', background: CARD.backgroundColor }}
    >
      {body}
    </button>
  );
};

// -------------------------------------------------------------------- list

const DocumentItem: React.FC<{
  doc: PortalDocument;
  url: string | null;
  onDownload?: (doc: PortalDocument) => void;
}> = ({ doc, url, onDownload }) => {
  // Set by a media block's error event. Once a browser has said it cannot show
  // this file, it is a download for the rest of the visit.
  const [undisplayable, setUndisplayable] = useState(false);

  // Reset when the URL changes, so a re-signed link gets a fresh attempt
  // rather than inheriting a verdict about a URL that has expired.
  useEffect(() => setUndisplayable(false), [url]);

  const kind = mediaKindOf(doc.mimeType, doc.fileName);
  const degrade = () => setUndisplayable(true);

  // Stream videos have no signed URL and no fallback row: Cloudflare's
  // player is the only thing that can play them.
  if (doc.streamUid) return <StreamBlock doc={doc} onDownload={onDownload} />;

  if (url && !undisplayable) {
    if (kind === 'image') return <ImageBlock doc={doc} url={url} onUndisplayable={degrade} onDownload={onDownload} />;
    if (kind === 'video') return <VideoBlock doc={doc} url={url} onUndisplayable={degrade} onDownload={onDownload} />;
    if (kind === 'audio') return <AudioBlock doc={doc} url={url} onUndisplayable={degrade} onDownload={onDownload} />;
  }

  return <FileRow doc={doc} url={url} kind={kind} onDownload={onDownload} />;
};

/**
 * Signs the whole list once, then renders each file as whatever it is.
 *
 * Rendered in the order the author gave them. A photo card between two
 * download rows is what "put the costume picture with the costume list" looks
 * like, and reordering into a gallery would take that arrangement away from
 * the teacher who chose it.
 */
export const DocumentList: React.FC<{
  documents: PortalDocument[];
  /**
   * Fired when a parent actually opens or saves a file (not when the list is
   * pre-signed for rendering). ClassDetail passes the audit logger; other
   * callers may omit it. See AUDIT-LOG-SPEC.md §4 — "who downloaded what".
   */
  onDownload?: (doc: PortalDocument) => void;
}> = ({ documents, onDownload }) => {
  const { getDocumentUrls } = usePortal();
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const paths = documents.map(d => d.storagePath).filter((p): p is string => Boolean(p));
    if (paths.length === 0) {
      setUrls({});
      return;
    }

    let cancelled = false;
    getDocumentUrls(paths).then(signed => {
      if (!cancelled) setUrls(signed);
    });
    return () => { cancelled = true; };
    // Keyed on the paths themselves: `documents` is a new array on every
    // render of the page above, and depending on it would re-sign forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents.map(d => d.storagePath).join(' '), getDocumentUrls]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {documents.map(doc => (
        <DocumentItem
          key={doc.id}
          doc={doc}
          url={doc.storagePath ? (urls[doc.storagePath] ?? null) : null}
          onDownload={onDownload}
        />
      ))}
    </div>
  );
};

export default DocumentList;
