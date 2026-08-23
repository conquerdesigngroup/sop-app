/**
 * Telling "the request never left the device" apart from "the server said no".
 *
 * Only the first kind is safe to queue for a later retry. A rejection the
 * database actually sent — an RLS refusal, a constraint violation, a bad
 * column — would fail identically on every replay, so queueing it would
 * strand the write in a queue that never drains while telling the person
 * their entry was saved.
 *
 * fetch() reports a transport failure as a bare TypeError with no status
 * code, so the message is what there is to go on. The strings below are the
 * wordings the major engines use: Chrome and Firefox say "Failed to fetch"
 * / "NetworkError when attempting to fetch resource", Safari says "Load
 * failed", and React Native's polyfill says "Network request failed".
 */
export const isNetworkFailure = (thrown: unknown): boolean => {
  // supabase-js wraps transport failures but preserves the TypeError.
  if (thrown instanceof TypeError) return true;

  const message = (thrown as { message?: unknown } | null | undefined)?.message;
  if (typeof message !== 'string') return false;

  const lowered = message.toLowerCase();
  return (
    lowered.includes('failed to fetch') ||
    lowered.includes('networkerror') ||
    lowered.includes('network request failed') ||
    lowered.includes('load failed')
  );
};
