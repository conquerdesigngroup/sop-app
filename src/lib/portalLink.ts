/**
 * The one optional link an info post can carry.
 *
 * WHY THIS IS A MODULE AND NOT TWO LINES IN THE FORM
 *
 * The same URL is judged in three places — the editor, saveUpdate, and the
 * parent renderer — and they have to agree. If the editor accepts something
 * the renderer then refuses to draw, staff publish a post with a link nobody
 * can see and nothing says so.
 *
 * These values go straight into an href, and `javascript:` in an href is the
 * oldest trick there is. The v54 CHECK constraint is the fourth layer, for
 * everything that is not this app. Same reasoning as addLink() in
 * eventAttachments.ts, which guards calendar links the same way.
 */

export const LINK_URL_ERROR = 'A link must start with http:// or https://';

/**
 * What the typist meant, or null for a blank field.
 *
 * A bare `didc.app/tickets` becomes `https://didc.app/tickets`, because that is
 * what someone pasting on a phone actually writes and refusing it teaches
 * nobody anything.
 *
 * Anything that already names a scheme is left EXACTLY as typed — `javascript:`
 * included — so that isSafeLinkUrl below gets to reject it. Prefixing blindly
 * would turn an attack into `https://javascript:alert(1)`, which passes every
 * check and quietly does nothing: the bug report would be "the link is broken",
 * not "the link is dangerous".
 */
export const normalizeLinkUrl = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

/** Trimmed, or null. A label is either words or nothing. */
export const normalizeLinkLabel = (raw: string): string | null => raw.trim() || null;

/**
 * http(s) and parseable. Nothing else ever reaches an href.
 *
 * Called on the way out as well as on the way in, because a row can predate
 * the constraint, arrive from a restore, or be written by something that is
 * not this app.
 */
export const isSafeLinkUrl = (url: string | null | undefined): boolean => {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    // Passed the scheme test but not the parser.
    return false;
  }
};

/** `tickets.didc.app`, or null if it will not parse. */
export const linkHost = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
};

/**
 * What the button says.
 *
 * The label when staff wrote one; otherwise the site it goes to. The host
 * rather than "Open link" on purpose — a parent about to leave the portal on a
 * phone should be able to see where they are going before they tap.
 */
export const linkButtonLabel = (url: string, label: string | null): string =>
  normalizeLinkLabel(label ?? '') ?? linkHost(url) ?? 'Open link';
