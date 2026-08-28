import type { PortalProgramSlug } from '../types';

/**
 * Helpers for the staff side of the parent portal — the manager at
 * /portal-admin, not the parent-facing pages.
 *
 * src/lib/portal.ts is the parent half: route helpers, the access-gate flag and
 * READ formatters. This file is its mirror: the WRITE conversions, and the file
 * rules the storage bucket enforces server-side.
 *
 * The two must agree about time. Everything in the "events" section below is
 * the inverse of formatEventDate/formatEventTime in portal.ts, and getting one
 * of the pair wrong puts studio dates on the wrong day for every family.
 */

export const PORTAL_ADMIN_PATH = '/portal-admin';

// ------------------------------------------------------------------ documents

/**
 * 50 MB — the bucket's own file_size_limit, checked here for a real message.
 *
 * Raised from 25 MB with v27, when video became something a teacher can post.
 * 25 MB is about twenty seconds of phone video, which is not a routine.
 *
 * 50 is not a taste decision: it is the per-file ceiling on the Supabase free
 * plan, so it cannot go higher without changing the plan. Worth knowing that
 * the same plan caps TOTAL storage at 1 GB — twenty full-size videos fills it,
 * and nothing in the app warns anyone when it does.
 */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

/**
 * Mirrors allowed_mime_types on the `portal-documents` bucket (v9 s.12, v27).
 *
 * The bucket rejects anything else regardless, but its error arrives as an
 * opaque failure after the whole file has uploaded. Checking first costs
 * nothing and lets someone with a 60 MB video know why before they wait.
 *
 * Change this and the bucket together, or the two drift apart silently.
 */
export const ALLOWED_DOCUMENT_MIME: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'audio/mpeg',
  'audio/mp4',
  // Added in v27. quicktime is what an iPhone calls a .mov and is the one a
  // teacher will reach for first; mp4 is the one that plays on every device
  // they might send it to. Both are accepted and the upload form says which
  // is which — see compatibilityWarning in portalMedia.ts.
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

/** For the file picker's `accept` and for the hint under it. */
export const DOCUMENT_ACCEPT = ALLOWED_DOCUMENT_MIME.join(',');
export const DOCUMENT_HINT = 'Photo, video, MP3, PDF, Word or text. 50 MB max.';

/** Null when the file is fine, otherwise the reason to show. */
export const validateDocumentFile = (file: File): string | null => {
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is 25 MB.`;
  }
  // Some browsers report an empty type for less common extensions; the bucket
  // makes the final call, so only a positively wrong type is rejected here.
  if (file.type && !ALLOWED_DOCUMENT_MIME.includes(file.type)) {
    return `${file.type || 'That file type'} is not accepted. ${DOCUMENT_HINT}`;
  }
  return null;
};

const randomId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Object key inside the `portal-documents` bucket.
 *
 * Prefixed with a random id rather than named after the file, because
 * storage_path is UNIQUE: two teachers both uploading "costume-list.pdf" would
 * otherwise collide, and the second insert would fail after the upload
 * succeeded. The original file name is kept on the row and is what parents
 * download as.
 */
export const buildStoragePath = (programSlug: PortalProgramSlug, fileName: string): string => {
  const safe = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(-80);
  return `${programSlug}/${randomId()}-${safe || 'file'}`;
};

// --------------------------------------------------------------------- events

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The timezone the author is typing in, e.g. "America/Los_Angeles".
 *
 * Shown next to every time field. A timed event is stored from the author's own
 * device clock, which is right for staff at the studio and wrong for a teacher
 * entering a rehearsal from another state — so the screen says which one it is
 * rather than leaving it to be discovered later.
 */
export const localTimeZoneName = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your device timezone';
  } catch {
    return 'your device timezone';
  }
};

/**
 * An all-day date -> UTC midnight, the convention portal_events stores and
 * formatEventDate() reads back with { timeZone: 'UTC' }.
 *
 * Built from parts rather than `new Date('2026-09-30')`, which is only
 * UTC-parsed for that exact format and local-parsed the moment anything else
 * creeps in.
 */
export const allDayToIso = (dateValue: string): string => {
  const [y, m, d] = dateValue.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString();
};

/** A date + wall-clock time in the author's local zone -> ISO. */
export const timedToIso = (dateValue: string, timeValue: string): string => {
  const [y, m, d] = dateValue.split('-').map(Number);
  const [hh, mm] = timeValue.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
};

/** ISO -> the value an <input type="date"> wants, in the event's own frame. */
export const isoToDateInput = (iso: string, isAllDay: boolean): string => {
  const dt = new Date(iso);
  return isAllDay
    ? `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
    : `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

/** ISO -> the value an <input type="time"> wants. Local; all-day has no time. */
export const isoToTimeInput = (iso: string): string => {
  const dt = new Date(iso);
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

/** Today, as an <input type="date"> value. Used to default a new event. */
export const todayDateInput = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// -------------------------------------------------------------------- classes

/**
 * A Postgres `time` column ('16:30:00') <-> an <input type="time"> ('16:30').
 *
 * Never round-tripped through Date. A bare time has no date and no zone, and
 * handing it to Date attaches today's and drags a conversion into a value that
 * should not have one — the reason formatTime() in portal.ts parses by hand.
 */
export const timeColumnToInput = (value: string | null): string =>
  value ? value.slice(0, 5) : '';

export const timeInputToColumn = (value: string): string | null =>
  value ? `${value}:00` : null;

export const DAY_OPTIONS = [
  { value: '', label: 'No fixed day' },
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];
