/**
 * Does this device want the OS share sheet, or a plain download?
 *
 * ONE RULE, ONE PLACE
 *
 * This lived privately inside calendarTarget.ts, which meant the next feature
 * to hand a file to the browser had to rediscover it — and the hours export
 * did not. It tested `navigator.canShare({ files })` alone, which is TRUE in
 * desktop Chrome and desktop Safari on macOS, so pressing "Download PDF" on a
 * Mac opened the macOS share sheet (AirDrop, Messages, Notes…) instead of
 * saving the file. A share sheet is not a download, and a payroll PDF that
 * needs a second decision before it reaches the Downloads folder is a button
 * that did not do what it says.
 *
 * BOTH HALVES ARE NEEDED
 *
 * - `canShare({ files })` answers "can this browser share a file of this type
 *   at all". Plenty of browsers define `navigator.share` and still reject a
 *   file payload, so this is the only honest capability test.
 * - `(pointer: coarse)` is what separates the phone and the iPad from the
 *   desktop. It reports the PRIMARY pointer, so a Windows laptop with both a
 *   touchscreen and a mouse correctly reads as fine/desktop, while an iPad —
 *   which lies about being a 'Macintosh' in its user agent since iPadOS 13 —
 *   correctly reads as coarse without any user-agent sniffing.
 *
 * On a phone or an iPad the sheet is the better route: the file goes straight
 * to Mail, Messages or Drive and the OS confirms it happened, whereas a blob
 * download lands silently in Files. On a desktop the download IS the answer.
 *
 * Probed with an empty stand-in rather than the real file: the question is
 * whether this browser shares files of this type at all, and building the
 * payload to ask would be work thrown away on every desktop.
 */
export const prefersShareSheet = (
  probeName: string,
  mimeType: string,
  nav: Pick<Navigator, 'canShare' | 'share'> | undefined =
    typeof navigator !== 'undefined' ? navigator : undefined,
  matcher: (query: string) => boolean = query =>
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches,
): boolean => {
  // Total whatever the caller supplies: a hostile matchMedia or a canShare
  // that throws must mean "download", never an exception out of a click.
  try {
    if (typeof File !== 'function') return false;
    if (!nav || typeof nav.canShare !== 'function' || typeof nav.share !== 'function') return false;
    if (!matcher('(pointer: coarse)')) return false;
    return nav.canShare({ files: [new File([''], probeName, { type: mimeType })] });
  } catch {
    return false;
  }
};
