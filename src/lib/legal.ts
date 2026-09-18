/**
 * The app's Privacy Policy and Terms of Use — the small half.
 *
 * TWO FILES, ON PURPOSE
 *
 * This one is what the rest of the app imports: the version a signup records,
 * the studio's legal details, and the two paths. The words themselves live in
 * legalDocs.ts, which only LegalPage imports, so several thousand words of
 * policy stay in that page's lazy chunk instead of riding along in the main
 * bundle with App.tsx and the signup form.
 *
 * WHEN THE TEXT CHANGES
 *
 * Edit legalDocs.ts, bump LEGAL_VERSION to the new effective date, and ship
 * through a review like any other change — the same reasoning as
 * studioPolicies.ts: this is what families agreed to, so it travels with the
 * code rather than through an editor where a stray edit is live at once.
 */

/**
 * The effective date of the current text, printed at the top of both pages and
 * recorded in the audit log by every signup (portal-signup's client_signed_up
 * row), so the studio can show which version a family agreed to.
 */
export const LEGAL_VERSION = '2026-09-18';

export const STUDIO_LEGAL = {
  /** As the DIDC Dance Student Contract names it — see studioPolicies.ts. */
  name: 'Dancing Images Dance Center, Inc.',
  shortName: 'DIDC',
  /**
   * Governing law. The studio's day is kept on California time throughout the
   * code (studioDate.ts); no address in the repo states it outright, so confirm
   * this with whoever reviews the text.
   */
  state: 'California',
  /** The studio's own inbox — the Google Workspace account behind its calendars. */
  contactEmail: 'info@didancecenter.com',
  site: 'didc.app',
} as const;

export const LEGAL_PATHS = {
  privacy: '/privacy',
  terms: '/terms',
} as const;

export type LegalDocId = keyof typeof LEGAL_PATHS;

/**
 * True on either legal page. App.tsx uses it to keep the staff header and
 * bottom bar off them: the pages carry their own header and notch padding, so
 * a signed-in employee would otherwise get both, stacked. Deliberately not
 * folded into isPortalPath, which also vets class back-links.
 */
export const isLegalPath = (pathname: string): boolean => {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return path === LEGAL_PATHS.privacy || path === LEGAL_PATHS.terms;
};

/** A run of text, or a link. Plain strings only — React escapes them. */
export type LegalInline = string | { text: string; href: string };

export type LegalBlock =
  | { kind: 'p'; parts: LegalInline[] }
  | { kind: 'list'; items: LegalInline[][] };

export interface LegalSection {
  /** The in-page anchor, e.g. /privacy#children. Keep stable: it may be linked to. */
  id: string;
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  id: LegalDocId;
  title: string;
  intro: LegalInline[];
  sections: LegalSection[];
}
