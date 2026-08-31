import { supabase } from './supabase';
import { removeStorageObject } from './portalStorage';
import { logActivity } from './activityLog';

/**
 * Links and files hung on a calendar event.
 *
 * Keyed by (googleCalendarId, googleEventId) rather than by a row id, because
 * the staff calendar and the parent portal are DIFFERENT TABLES — events live
 * in calendar_events for staff and portal_events for parents, both filled from
 * the same Google calendars by two separate syncs. The Google pair is the only
 * identity the two share, so it is what the attachments hang off and what both
 * sides look up. See the v22 migration header.
 *
 * Fetched when an event is opened rather than loaded with the calendar. A
 * month of events is dozens of rows and almost none of them get opened; one
 * small query on tap is cheaper than a join nobody reads.
 */

export const ATTACHMENT_BUCKET = 'calendar-attachments';

/** Matches the bucket's own limit, so the check fails here with a sentence
 *  rather than at the API with a 413. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface EventAttachment {
  id: string;
  kind: 'link' | 'file';
  /** kind === 'link' */
  url: string | null;
  label: string | null;
  /** kind === 'file' */
  storagePath: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

interface Row {
  id: string;
  kind: 'link' | 'file';
  url: string | null;
  label: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

const mapRow = (r: Row): EventAttachment => ({
  id: r.id,
  kind: r.kind,
  url: r.url,
  label: r.label,
  storagePath: r.storage_path,
  fileName: r.file_name,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  createdAt: r.created_at,
});

/** Named columns, never `*`: a select star hands the client every column a
 *  later migration adds, including ones nobody meant to publish. */
const COLUMNS =
  'id, kind, url, label, storage_path, file_name, mime_type, size_bytes, created_at';

export const fetchAttachments = async (
  googleCalendarId: string,
  googleEventId: string
): Promise<EventAttachment[]> => {
  const { data, error } = await supabase
    .from('calendar_event_attachments')
    .select(COLUMNS)
    .eq('google_calendar_id', googleCalendarId)
    .eq('google_event_id', googleEventId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow as any);
};

/**
 * A link a parent can open.
 *
 * The scheme is checked here and again by a CHECK constraint. Both are
 * deliberate: these render as real anchors, and `javascript:` in an href is
 * the oldest trick there is.
 */
export const addLink = async (
  googleCalendarId: string,
  googleEventId: string,
  url: string,
  label: string
): Promise<EventAttachment> => {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('A link must start with http:// or https://');
  }

  const { data, error } = await supabase
    .from('calendar_event_attachments')
    .insert({
      google_calendar_id: googleCalendarId,
      google_event_id: googleEventId,
      kind: 'link',
      url: trimmed,
      label: label.trim() || null,
    })
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  // Hostname only in details — the full URL can be a secret (unlisted doc,
  // pre-signed share) and the log allowlist forbids those.
  let host: string | null = null;
  try {
    host = new URL(trimmed).hostname;
  } catch {
    // Passed the scheme regex but not the URL parser; log without a host.
  }
  void logActivity({
    action: 'event_updated',
    entityType: 'event',
    entityId: googleEventId,
    details: {
      change: 'attachment_added',
      kind: 'link',
      label: label.trim() || null,
      host,
      calendarId: googleCalendarId,
    },
  });
  return mapRow(data as any);
};

/** Keeps the extension so browsers and Quick Look still recognise the file. */
const storagePathFor = (file: File): string => {
  const dot = file.name.lastIndexOf('.');
  const ext = dot > 0 ? file.name.slice(dot).toLowerCase() : '';
  return `${crypto.randomUUID()}${ext}`;
};

/**
 * Upload first, record second.
 *
 * That order matters: a row written before a failed upload is a file that
 * shows in the list and 404s on click, which looks like data loss to whoever
 * clicks it. This way a failed upload leaves nothing behind, and a failed
 * insert leaves an unreferenced object — invisible, and cheap to sweep.
 */
export const uploadAttachment = async (
  googleCalendarId: string,
  googleEventId: string,
  file: File
): Promise<EventAttachment> => {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 25 MB.`
    );
  }

  const path = storagePathFor(file);
  const { error: upErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });

  if (upErr) {
    throw new Error(
      /mime|content type/i.test(upErr.message)
        ? `${file.type || 'That file type'} is not one this calendar accepts. PDFs, images, Word, Excel and plain text are.`
        : upErr.message
    );
  }

  const { data, error } = await supabase
    .from('calendar_event_attachments')
    .insert({
      google_calendar_id: googleCalendarId,
      google_event_id: googleEventId,
      kind: 'file',
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    // Do not leave an object nothing points at.
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]).catch(() => {});
    throw new Error(error.message);
  }
  // Logged after the insert, not the storage upload: a failed insert removes
  // the orphan object above, so only a completed mutation reaches the log.
  void logActivity({
    action: 'document_uploaded',
    entityType: 'document',
    entityId: (data as Row).id,
    entityTitle: file.name,
    details: {
      fileName: file.name,
      mimeType: file.type || null,
      sizeBytes: file.size,
      googleEventId,
      calendarId: googleCalendarId,
    },
  });
  return mapRow(data as any);
};

/** Row first, then the object — the reverse would leave a row pointing at
 *  nothing if the storage call failed. */
export const removeAttachment = async (a: EventAttachment): Promise<void> => {
  // File first, row second, and the file's failure is not swallowed. The old
  // order deleted the row and then fired the storage delete without even
  // looking at the result, so a failure left the file in the bucket with
  // nothing pointing at it and no way for the app to reach it again. See the
  // long note on deleteDocument in PortalAdminContext for why that direction
  // is the unrecoverable one.
  if (a.storagePath) {
    await removeStorageObject(ATTACHMENT_BUCKET, a.storagePath);
  }

  const { error } = await supabase
    .from('calendar_event_attachments')
    .delete()
    .eq('id', a.id);
  if (error) throw new Error(error.message);
  // Never attachmentTitle here: for a label-less link it falls back to the
  // full URL, which can be a secret (unlisted doc, pre-signed share) — the
  // same value addLink refuses to log. Label, filename or hostname only.
  let title = a.fileName ?? a.label;
  if (a.kind === 'link' && !title) {
    try {
      title = a.url ? new URL(a.url).hostname : null;
    } catch {
      title = null;
    }
  }
  void logActivity({
    action: 'document_deleted',
    entityType: 'document',
    entityId: a.id,
    entityTitle: title ?? undefined,
    details: { kind: a.kind, fileName: a.fileName },
  });
};

/**
 * A time-limited URL for a stored file.
 *
 * The bucket is private, matching portal-documents. Parents are anonymous —
 * they hold an access code, not an account — so the signed URL is what lets
 * them open the file at all.
 */
export const attachmentUrl = async (a: EventAttachment): Promise<string | null> => {
  if (a.kind === 'link') return a.url;
  if (!a.storagePath) return null;

  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(a.storagePath, 60 * 60);

  if (error) throw new Error(error.message);
  return data?.signedUrl ?? null;
};

/** What to call it in a list. */
export const attachmentTitle = (a: EventAttachment): string =>
  (a.kind === 'link' ? a.label || a.url : a.fileName) || 'Attachment';

export const formatBytes = (n: number | null): string => {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
