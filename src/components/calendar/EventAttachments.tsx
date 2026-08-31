import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from '../../theme';
import { supabase } from '../../lib/supabase';
import { logActivity } from '../../lib/activityLog';
import {
  EventAttachment,
  fetchAttachments,
  addLink,
  uploadAttachment,
  removeAttachment,
  attachmentUrl,
  attachmentTitle,
  formatBytes,
} from '../../lib/eventAttachments';

/**
 * Links and files on one calendar event.
 *
 * Two components, one loader. AttachmentList is what a reader sees — staff in
 * the event modal, parents in the portal card — and AttachmentManager is the
 * admin's add-and-remove panel. They share the fetch so the two can never
 * disagree about what is attached.
 *
 * Opening a file is deliberately a two-step: the bucket is private, so the URL
 * has to be signed at the moment of the click. Pre-signing every row on load
 * would mint URLs for files nobody opens and start their clock ticking.
 */

const LinkIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const FileIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const ImageIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const iconFor = (a: EventAttachment) => {
  if (a.kind === 'link') return <LinkIcon />;
  return a.mimeType?.startsWith('image/') ? <ImageIcon /> : <FileIcon />;
};

const subtitleFor = (a: EventAttachment): string => {
  if (a.kind === 'link') {
    try {
      return new URL(a.url ?? '').hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }
  return formatBytes(a.sizeBytes);
};

/** Loads once per event, and again whenever `reloadKey` changes. */
export const useAttachments = (
  googleCalendarId?: string | null,
  googleEventId?: string | null
) => {
  const [items, setItems] = useState<EventAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!googleCalendarId || !googleEventId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchAttachments(googleCalendarId, googleEventId));
    } catch (e: any) {
      setError(e?.message || 'Could not load attachments');
    } finally {
      setLoading(false);
    }
  }, [googleCalendarId, googleEventId]);

  useEffect(() => { reload(); }, [reload]);

  return { items, loading, error, reload, setItems };
};

// ------------------------------------------------------------------- reading

/**
 * The tappable half of a row.
 *
 * A LINK is an anchor, because its destination is already known — nothing to
 * await, so nothing for a phone to treat as an unsolicited popup. A FILE has to
 * be signed first, so it stays a button and goes through openFile above.
 *
 * Same styling either way; the element differs because what it does differs.
 */
const AttachmentLabel: React.FC<{
  a: EventAttachment;
  opening: boolean;
  onOpenFile: () => void;
}> = ({ a, opening, onOpenFile }) => {
  const shell: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    textAlign: 'left',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: theme.colors.txt.primary,
    fontFamily: theme.fonts.primary,
    textDecoration: 'none',
    display: 'block',
  };

  const body = (
    <>
      <span style={{
        display: 'block',
        fontSize: '14px',
        fontWeight: 600,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {opening ? 'Opening…' : attachmentTitle(a)}
      </span>
      {subtitleFor(a) && (
        <span style={{
          display: 'block',
          fontSize: '12px',
          fontFamily: theme.fonts.mono,
          color: theme.colors.txt.tertiary,
        }}>
          {subtitleFor(a)}
        </span>
      )}
    </>
  );

  if (a.kind === 'link' && a.url) {
    return (
      <a href={a.url} target="_blank" rel="noopener noreferrer" style={shell}>
        {body}
      </a>
    );
  }

  return (
    <button type="button" onClick={onOpenFile} disabled={opening} style={shell}>
      {body}
    </button>
  );
};

export const AttachmentList: React.FC<{
  items: EventAttachment[];
  onRemove?: (a: EventAttachment) => void;
  busyId?: string | null;
}> = ({ items, onRemove, busyId }) => {
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  /**
   * Files only. A link already knows its URL and is rendered as an anchor
   * below, which is the whole point: this path has to await a signature, and
   * window.open() called once that await resolves is no longer part of the tap
   * that asked for it. iOS discards it silently — the button could be pressed
   * over and over on a phone and nothing would happen, no error, no clue.
   *
   * Navigating instead is never blocked. It also does not leave the page for a
   * file, because storage answers with Content-Disposition: attachment.
   */
  const openFile = async (a: EventAttachment) => {
    setFailed(null);
    setOpening(a.id);
    try {
      const url = await attachmentUrl(a);
      if (!url) throw new Error('That file is no longer available.');
      // On the anonymous portal the log RPC is revoked from anon, so this
      // degrades to a console error there — only signed-in opens produce rows,
      // the same trade ClassDetail makes.
      void logActivity({
        action: 'document_downloaded',
        entityType: 'document',
        entityId: a.id,
        entityTitle: attachmentTitle(a),
        details: { fileName: a.fileName, sizeBytes: a.sizeBytes },
      });
      window.location.assign(url);
    } catch (e: any) {
      setFailed(e?.message || 'Could not open that.');
    } finally {
      setOpening(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map(a => (
        <div
          key={a.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.bdr.primary}`,
            backgroundColor: theme.colors.bg.tertiary,
            minWidth: 0,
          }}
        >
          <span style={{ color: theme.colors.primary, flexShrink: 0, display: 'flex' }}>
            {iconFor(a)}
          </span>

          <AttachmentLabel
            a={a}
            opening={opening === a.id}
            onOpenFile={() => openFile(a)}
          />

          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(a)}
              disabled={busyId === a.id}
              aria-label={`Remove ${attachmentTitle(a)}`}
              style={{
                flexShrink: 0,
                minHeight: '32px',
                minWidth: '32px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: theme.colors.txt.tertiary,
                fontFamily: theme.fonts.mono,
                fontSize: '11px',
                textTransform: 'uppercase',
                opacity: busyId === a.id ? 0.5 : 1,
              }}
            >
              {busyId === a.id ? '…' : 'Remove'}
            </button>
          )}
        </div>
      ))}

      {failed && (
        <p style={{
          margin: 0,
          fontSize: '13px',
          fontFamily: theme.fonts.primary,
          color: theme.colors.status.error,
        }}>
          {failed}
        </p>
      )}
    </div>
  );
};

// ------------------------------------------------------------------- editing

/**
 * Whether this calendar feeds a parent portal programme.
 *
 * Asked of is_portal_calendar(), the very function the row-level policy uses
 * to decide what anon may read. Deriving it here instead — from a label, or a
 * list held in the client — is how the warning and the actual rule drift apart
 * and someone attaches an internal file to a parent-facing event.
 */
const useParentVisible = (googleCalendarId?: string | null): boolean => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!googleCalendarId) {
      setVisible(false);
      return;
    }
    supabase
      .rpc('is_portal_calendar', { p_calendar_id: googleCalendarId })
      .then((res: { data: unknown }) => {
        if (!cancelled) setVisible(res.data === true);
      });
    return () => { cancelled = true; };
  }, [googleCalendarId]);

  return visible;
};

export const AttachmentManager: React.FC<{
  googleCalendarId: string;
  googleEventId: string;
}> = ({ googleCalendarId, googleEventId }) => {
  const parentVisible = useParentVisible(googleCalendarId);
  const { items, loading, error, setItems } = useAttachments(googleCalendarId, googleEventId);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const submitLink = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const created = await addLink(googleCalendarId, googleEventId, url, label);
      setItems(prev => [...prev, created]);
      setUrl('');
      setLabel('');
    } catch (e: any) {
      setFailed(e?.message || 'Could not add that link');
    } finally {
      setBusy(false);
    }
  };

  const submitFile = async (file?: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const created = await uploadAttachment(googleCalendarId, googleEventId, file);
      setItems(prev => [...prev, created]);
    } catch (e: any) {
      setFailed(e?.message || 'Could not upload that file');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (a: EventAttachment) => {
    setBusyId(a.id);
    setFailed(null);
    try {
      await removeAttachment(a);
      setItems(prev => prev.filter(x => x.id !== a.id));
    } catch (e: any) {
      setFailed(e?.message || 'Could not remove that');
    } finally {
      setBusyId(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minWidth: 0,
    padding: '10px 12px',
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.bdr.primary}`,
    backgroundColor: theme.colors.bg.tertiary,
    color: theme.colors.txt.primary,
    fontFamily: theme.fonts.primary,
    fontSize: '14px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {loading && (
        <p style={{ margin: 0, fontSize: '13px', color: theme.colors.txt.tertiary }}>
          Loading attachments…
        </p>
      )}

      <AttachmentList items={items} onRemove={remove} busyId={busyId} />

      {/*
        Said plainly, because it is the one thing that is easy to get wrong.
        Visibility follows the calendar — the same rule that already governs an
        event's title and details — so an admin needs to know which calendar
        they are on before attaching anything.
      */}
      <p style={{
        margin: 0,
        fontSize: '12px',
        fontFamily: theme.fonts.primary,
        color: parentVisible ? theme.colors.status.warning : theme.colors.txt.tertiary,
      }}>
        {parentVisible
          ? 'Anything added here is visible to parents on this programme’s portal.'
          : 'This calendar is not shown in the parent portal, so attachments stay internal.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <input
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={url}
          onChange={e => setUrl(e.target.value)}
          style={inputStyle}
        />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="What to call it (optional)"
            value={label}
            onChange={e => setLabel(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: '140px' }}
          />
          <button
            type="button"
            onClick={submitLink}
            disabled={busy || !url.trim()}
            style={{
              padding: '10px 16px',
              minHeight: '44px',
              borderRadius: theme.borderRadius.md,
              border: 'none',
              backgroundColor: theme.colors.primary,
              color: '#FFFFFF',
              fontFamily: theme.fonts.primary,
              fontWeight: 600,
              fontSize: '14px',
              cursor: busy || !url.trim() ? 'default' : 'pointer',
              opacity: busy || !url.trim() ? 0.5 : 1,
            }}
          >
            Add link
          </button>
        </div>
      </div>

      <div>
        <input
          ref={fileInput}
          type="file"
          onChange={e => submitFile(e.target.files?.[0])}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          style={{
            width: '100%',
            padding: '12px',
            minHeight: '44px',
            borderRadius: theme.borderRadius.md,
            border: `1px dashed ${theme.colors.bdr.secondary}`,
            background: 'transparent',
            color: theme.colors.txt.secondary,
            fontFamily: theme.fonts.primary,
            fontSize: '14px',
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? 'Working…' : 'Upload a file or photo'}
        </button>
        <p style={{
          margin: '6px 0 0',
          fontSize: '12px',
          fontFamily: theme.fonts.mono,
          color: theme.colors.txt.tertiary,
        }}>
          PDF, image, Word, Excel or text. Up to 25 MB.
        </p>
      </div>

      {(failed || error) && (
        <p style={{
          margin: 0,
          fontSize: '13px',
          fontFamily: theme.fonts.primary,
          color: theme.colors.status.error,
        }}>
          {failed || error}
        </p>
      )}
    </div>
  );
};
