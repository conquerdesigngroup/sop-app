import { supabase } from './supabase';
import { PortalDocument } from '../types';
import { mapDocument } from './portalMappers';
import { VIEWER_LOAD_ERROR, ViewerError } from './portalViewer';
import { DOCUMENT_BUCKET, SIGNED_URL_TTL_SECONDS } from './portalStorage';

/**
 * Every file in the portal, with the person who uploaded it — the Viewer's
 * Files tab.
 *
 * WHY NOT fetchDocuments FROM PortalAdminContext
 *
 * That one is the editor's list: one program at a time, and it deliberately
 * leaves out files hanging on an info post (v65), because deleting one there
 * would strip an attachment off a live post. This is oversight, not editing:
 * the question is "what has anyone put up, and who", so it is every program,
 * posts included, and it cannot delete anything.
 *
 * WHO UPLOADED IT IS A SECOND READ, NOT AN EMBED
 *
 * portal_documents.uploaded_by references auth.users, not profiles, so
 * PostgREST has no relationship to embed through. The names come from
 * profiles in one `in` query. Staff can read every profile (is_active_staff),
 * including a teacher who has since been deactivated, so the name survives
 * them leaving. A failed name lookup does not fail the list — the files are
 * the point, and "Unknown" is honest.
 */

export interface ViewerFile {
  doc: PortalDocument;
  uploaderId: string | null;
  /** "Jamie Rivera", else their email, else null if nobody could be named. */
  uploaderName: string | null;
  className: string | null;
  programName: string | null;
  /** The info post this file is attached to, when it is one (v65). */
  postTitle: string | null;
}

export const UNKNOWN_UPLOADER = 'Unknown';

const nameOf = (p: { first_name?: string | null; last_name?: string | null; email?: string | null }) => {
  const full = [p.first_name, p.last_name].map(s => (s ?? '').trim()).filter(Boolean).join(' ');
  return full || (p.email ?? '').trim() || null;
};

export const mapViewerFile = (r: any, names: Record<string, string>): ViewerFile => ({
  doc: mapDocument(r),
  uploaderId: r.uploaded_by ?? null,
  uploaderName: r.uploaded_by ? names[r.uploaded_by] ?? null : null,
  className: r.portal_classes?.name ?? null,
  programName: r.portal_programs?.name ?? null,
  postTitle: r.portal_updates?.title ?? null,
});

/** Newest first: "what went up this week" is the usual question. */
export const loadViewerFiles = async (): Promise<{ rows: ViewerFile[]; error: ViewerError }> => {
  const { data, error } = await supabase
    .from('portal_documents')
    .select('*, portal_classes(name), portal_programs(name), portal_updates(title)')
    .order('created_at', { ascending: false });
  if (error) return { rows: [], error: VIEWER_LOAD_ERROR };

  const ids = Array.from(new Set((data ?? []).map((r: any) => r.uploaded_by).filter(Boolean)));
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data: people } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', ids);
    (people ?? []).forEach((p: any) => {
      const n = nameOf(p);
      if (n) names[p.id] = n;
    });
  }

  return { rows: (data ?? []).map((r: any) => mapViewerFile(r, names)), error: null };
};

/**
 * Where a parent finds it. An attachment names its post; otherwise the class,
 * and a file with no class goes to everyone in its section.
 */
export const fileWhereLabel = (f: ViewerFile): string => {
  if (f.doc.updateId) return f.postTitle ? `Info post: ${f.postTitle}` : 'An info post';
  if (f.className) return f.className;
  if (f.doc.classId) return 'A deleted class';
  return f.programName ? `Everyone in ${f.programName}` : 'Everyone';
};

/** Every word has to appear somewhere — title, file name, uploader or place. */
export const fileMatches = (f: ViewerFile, query: string): boolean => {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [
    f.doc.title, f.doc.fileName, f.doc.category, f.uploaderName, fileWhereLabel(f),
  ].filter(Boolean).join(' ').toLowerCase();
  return words.every(w => hay.includes(w));
};

/** Uploader filter chips, busiest first. Files with no known uploader share one. */
export const uploaderOptions = (files: ViewerFile[]): { value: string; label: string; count: number }[] => {
  const counts = new Map<string, { label: string; count: number }>();
  files.forEach(f => {
    const key = f.uploaderId && f.uploaderName ? f.uploaderId : UNKNOWN_UPLOADER;
    const label = key === UNKNOWN_UPLOADER ? UNKNOWN_UPLOADER : (f.uploaderName as string);
    const cur = counts.get(key);
    if (cur) cur.count++;
    else counts.set(key, { label, count: 1 });
  });
  return Array.from(counts.entries())
    .map(([value, v]) => ({ value, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

export const filePasses = (f: ViewerFile, query: string, uploader: string | null): boolean => {
  if (uploader) {
    const key = f.uploaderId && f.uploaderName ? f.uploaderId : UNKNOWN_UPLOADER;
    if (key !== uploader) return false;
  }
  return fileMatches(f, query);
};

/**
 * A signed URL that downloads instead of opening. Supabase reads `download`
 * off the query string and answers with Content-Disposition: attachment —
 * the same thing createSignedUrl({ download }) appends, done here so it needs
 * no second request and the link can be a plain anchor.
 */
export const downloadHref = (signedUrl: string, fileName: string): string =>
  `${signedUrl}${signedUrl.includes('?') ? '&' : '?'}download=${encodeURIComponent(fileName)}`;

/**
 * One file, signed on tap — for a row the batch signing did not cover. The
 * caller navigates to it rather than window.open(), which iOS drops once an
 * await has come between the tap and the call.
 */
export const signViewerFile = async (storagePath: string): Promise<string | null> => {
  try {
    const { data, error } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    return data?.signedUrl ?? null;
  } catch (e) {
    console.error('Could not sign file URL:', e);
    return null;
  }
};
