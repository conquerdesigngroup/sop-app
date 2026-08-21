/**
 * Parent-portal constants and route helpers.
 *
 * The portal is the client-facing half of the app: reachable before any login,
 * from the STAFF / TEAM chooser at `/`. Everything here is shared by the portal
 * pages and (from v9) by the staff-side authoring screens, so that a program
 * slug is defined exactly once.
 */

export type ProgramSlug = 'allstars' | 'academy';

export interface PortalProgram {
  slug: ProgramSlug;
  /** Display name. Rendered through the Kanit display face, so it uppercases itself. */
  name: string;
  /** One line under the name on the portal home tiles. */
  blurb: string;
  /**
   * Whether this section sits behind the shared studio access code.
   *
   * Both dancer programs do. Billing & Admin does not — it is an external link
   * to Enrollio, which has its own login.
   */
  gated: boolean;
}

export const PROGRAMS: readonly PortalProgram[] = [
  {
    slug: 'allstars',
    name: 'All-Star Dancers',
    blurb: 'Competition team schedules, updates and documents',
    gated: true,
  },
  {
    slug: 'academy',
    name: 'Academy / TNT Dancers',
    blurb: 'Class schedules, updates and documents',
    gated: true,
  },
] as const;

const PROGRAM_BY_SLUG = new Map<string, PortalProgram>(
  PROGRAMS.map(p => [p.slug, p])
);

/**
 * Resolve a `:program` route param.
 *
 * Returns null for anything unrecognised so callers can redirect rather than
 * render a section that does not exist. Never trust the URL segment directly —
 * it reaches the database as a filter value.
 */
export const getProgram = (slug: string | undefined): PortalProgram | null =>
  (slug && PROGRAM_BY_SLUG.get(slug)) || null;

export const isProgramSlug = (slug: string | undefined): slug is ProgramSlug =>
  getProgram(slug) !== null;

/**
 * Enrollio — billing, registration and account admin.
 *
 * TODO(tony): confirm the PARENT-facing entry point. This is the studio/staff
 * login taken from commit d63c7a5; families may need a different URL. Swapping
 * it is a one-line change here — no component references the raw string.
 */
export const ENROLLIO_URL =
  'https://portal.enrollio.ai/login?studioId=02CXn3sR0U7KkN3DSkwZ';

// ---------------------------------------------------------------- routes

export const portalRoutes = {
  chooser: '/',
  home: '/portal',
  program: (slug: ProgramSlug) => `/portal/${slug}`,
  classes: (slug: ProgramSlug) => `/portal/${slug}/classes`,
  classDetail: (slug: ProgramSlug, classId: string) =>
    `/portal/${slug}/classes/${classId}`,
  updates: (slug: ProgramSlug) => `/portal/${slug}/updates`,
  documents: (slug: ProgramSlug) => `/portal/${slug}/documents`,
  calendar: (slug: ProgramSlug) => `/portal/${slug}/calendar`,
} as const;

/** True for any path rendered inside the portal shell (i.e. no staff chrome). */
export const isPortalPath = (pathname: string): boolean =>
  pathname === '/' || pathname === '/portal' || pathname.startsWith('/portal/');

// ---------------------------------------------------------------- access gate

const GATE_KEY_PREFIX = 'didc_portal_access_';

/**
 * Remember that a visitor cleared the access code for a program.
 *
 * localStorage rather than sessionStorage: a parent adding the app to their home
 * screen should not have to re-enter the code every launch.
 *
 * This is a convenience flag, not a security boundary. The code itself is
 * verified by the verify_portal_code() RPC against a bcrypt hash that never
 * leaves the database — but portal content is readable by the `anon` role, so
 * clearing this flag by hand does not protect anything. Keep private
 * information out of portal content. See the v9 migration header.
 */
export const hasPortalAccess = (slug: ProgramSlug): boolean => {
  try {
    return window.localStorage.getItem(GATE_KEY_PREFIX + slug) === 'granted';
  } catch {
    // Safari private mode throws on localStorage access.
    return false;
  }
};

export const grantPortalAccess = (slug: ProgramSlug): void => {
  try {
    window.localStorage.setItem(GATE_KEY_PREFIX + slug, 'granted');
  } catch {
    /* no-op — the visitor just re-enters the code next time */
  }
};

export const revokePortalAccess = (slug: ProgramSlug): void => {
  try {
    window.localStorage.removeItem(GATE_KEY_PREFIX + slug);
  } catch {
    /* no-op */
  }
};
