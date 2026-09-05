import { supabase, isSupabaseConfigured } from './supabase';

/**
 * "Somebody opened this file."
 *
 * WHY NOT logActivity()
 *
 * Because most of the people who open a portal file have no account. They
 * typed the studio access code, they are `anon` to the database, and
 * log_activity() is deliberately not reachable by anon: it honours a
 * caller-supplied actor identity when there is no session (that path exists
 * for the service role), so granting it would let anyone on the internet write
 * audit rows attributed to whoever they fancied.
 *
 * portal_log_download (v43) is the narrow door instead. It takes ONE argument
 * — which document — and nothing else. The title, the file name, the class,
 * the programme, the IP address, the country and who the caller is are all
 * resolved inside the function, so there is nothing here for a caller to lie
 * about. A signed-in family or staff member calling it is recorded as
 * themselves; everybody else is recorded as a visitor with their address.
 *
 * The same rules as logActivity apply and for the same reasons: never throws,
 * never awaited in a UI path. A parent opening their child's recital video
 * must not be made to wait on a log write, and must never be stopped by one
 * failing.
 *
 * Repeat taps inside fifteen minutes from the same address collapse into one
 * row, so the count means "people who opened it" rather than "times somebody
 * jabbed at a slow button".
 */
export async function logDownload(documentId: string): Promise<void> {
  try {
    if (!isSupabaseConfigured() || !supabase) return;
    const { error } = await supabase.rpc('portal_log_download', {
      p_document_id: documentId,
    });
    if (error) console.error('portal_log_download failed:', error.message, documentId);
  } catch (e) {
    console.error('portal_log_download threw:', e, documentId);
  }
}
