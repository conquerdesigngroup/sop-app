import { supabase } from './supabase';
import { streamDownloadFilename } from './portalStream';

/**
 * The one Stream call a parent's phone makes.
 *
 * The MP4 URL a row records answers with a 302 to a signed copy, and that 302
 * carries no CORS header — so a browser fetch from didc.app dies on the
 * redirect before it ever reaches the file, which does allow our origin. The
 * portal-stream function follows the hop server-side and hands back the
 * target; Save to Photos fetches that. Parents are anonymous in the portal,
 * so the action needs no session: the anon key alone gets through.
 *
 * Kept apart from portalStreamUpload.ts so the parent-facing bundle does not
 * pull in the tus upload client for the sake of one request.
 */
export const resolveStreamDownload = async (uid: string, title: string): Promise<string> => {
  const { data, error } = await supabase.functions.invoke('portal-stream', {
    body: { action: 'download-url', uid, filename: streamDownloadFilename(title) },
  });
  if (error) throw new Error(error.message || 'Could not reach the video service');
  const url = data && typeof data === 'object' ? (data as { url?: unknown }).url : null;
  if (typeof url !== 'string' || !url) throw new Error((data as { error?: string })?.error || 'No download URL');
  return url;
};
