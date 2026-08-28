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
