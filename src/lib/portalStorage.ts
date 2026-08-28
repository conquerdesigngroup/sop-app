import { supabase } from './supabase';

export const DOCUMENT_BUCKET = 'portal-documents';

/** One hour. Long enough to read a page, short enough that a copied link dies. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Sign every file on a page in ONE request.
 *
 * The old flow signed on tap, which cost nothing until files stopped being
 * things you tap. A photo has to be rendered, so its URL has to exist before
 * the parent does anything — and signing each one separately would be a request
 * per file on every page view.
 *
 * `createSignedUrls` takes the whole list and returns one array. Rows that fail
 * individually come back with a null signedUrl and an error string rather than
 * failing the batch, so one deleted object does not blank the other five files:
 * they are simply left out of the map, and the caller renders those as
 * unavailable.
 *
 * Returns a map keyed by storage path. An empty map means the whole call
 * failed, which callers treat the same as every file failing — there is nothing
 * useful to distinguish.
 */
export const signDocumentUrls = async (
  storagePaths: string[],
): Promise<Record<string, string>> => {
  const paths = Array.from(new Set(storagePaths.filter(Boolean)));
  if (paths.length === 0) return {};

  try {
    const { data, error } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

    if (error) throw error;

    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
    }
    return map;
  } catch (e) {
    console.error('Could not sign document URLs:', e);
    return {};
  }
};

/**
 * "The object is not there" — which, when you are deleting it, is success.
 *
 * The Storage API answers a delete for a path it does not hold with an error,
 * not a no-op:
 *
 *     400  {"statusCode":"404","error":"not_found",
 *           "message":"Object not found","code":"NoSuchKey"}
 *
 * That matters because deleteDocument now removes the object BEFORE the row and
 * aborts if it cannot. Without this check, a row whose file had already gone
 * would be permanently undeletable — exactly the kind of trap the reordering
 * exists to remove, just pointed the other way.
 *
 * Matched loosely on purpose. supabase-js has moved this error between `status`,
 * `statusCode` and the message across versions, and being wrong here means a
 * row nobody can delete; being generous means at worst a row is deleted while
 * its file survives, which is the recoverable direction and is visible in the
 * bucket.
 */
export const isMissingObjectError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: unknown; statusCode?: unknown; message?: unknown; code?: unknown };
  if (e.status === 404 || String(e.statusCode) === '404') return true;
  if (String(e.code) === 'NoSuchKey') return true;
  return /not.?found|nosuchkey/i.test(String(e.message ?? ''));
};

/**
 * Delete the file, and treat "already gone" as done.
 *
 * Throws for anything else — no permission, no network — so the caller can
 * leave the database row where it is. A row that still points at a live file
 * can be retried; a file with no row pointing at it cannot be reached by the
 * app at all, because Supabase blocks direct DELETEs on storage.objects
 * (trigger storage.protect_delete) and the only listing the app does is by row.
 */
export const removeStorageObject = async (bucket: string, storagePath: string): Promise<void> => {
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);
  if (error && !isMissingObjectError(error)) throw error;
};
