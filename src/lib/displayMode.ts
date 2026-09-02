import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Is this page running as an installed app, and on what?
 *
 * WHY WE CARE
 *
 * Web Push on iOS reaches ONLY a site added to the Home Screen. A parent with
 * the portal open in a Safari tab cannot be sent a notification — not with the
 * right code, not with permission granted, not at all. Android and desktop
 * Chrome have no such restriction.
 *
 * So "should we build push?" reduces to "how many of our families installed
 * it?", and nobody knows that number. This module measures it, anonymously and
 * in aggregate, so the decision is made on evidence rather than on how many
 * people we imagine tapped Add to Home Screen. See
 * supabase-migration-v32-install-telemetry.sql for what is stored — daily
 * counters, no per-user rows.
 *
 * NOTHING HERE MAY EVER BREAK A PAGE
 *
 * This is instrumentation on a screen parents rely on. Every call is wrapped,
 * every failure is swallowed, and the ping is fire-and-forget — a portal that
 * fails to load because a metric could not be recorded would be a far worse bug
 * than the one this exists to prevent.
 */

export type DisplayMode = 'standalone' | 'browser';
export type Platform = 'ios' | 'android' | 'desktop' | 'other';

/**
 * Installed or in a tab.
 *
 * Two signals, because neither covers everything. `display-mode: standalone`
 * is the standard and works on Android and on iOS 16.4+. `navigator.standalone`
 * is Apple's own, non-standard, and remains the dependable answer on older iOS.
 * A home-screen icon can also be launched in `fullscreen` or `minimal-ui` if
 * the manifest ever changes, so those count as installed too — the question is
 * "is this a tab or not", not "which exact display mode did we ask for".
 */
export const detectDisplayMode = (
  matcher: (query: string) => boolean = query => {
    try {
      return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia(query).matches;
    } catch {
      return false;
    }
  },
  iosStandalone: boolean = typeof navigator !== 'undefined'
    && (navigator as Navigator & { standalone?: boolean }).standalone === true,
): DisplayMode => {
  if (iosStandalone) return 'standalone';

  // The catch belongs HERE and not only inside the default matcher, so the
  // function is total whoever supplies the matcher. "browser" is the right
  // failure value: it under-counts installs, and the honest direction to be
  // wrong in is the one that makes push look less attractive than it is,
  // rather than talking us into building something nobody can receive.
  try {
    const installed = ['standalone', 'fullscreen', 'minimal-ui']
      .some(mode => matcher(`(display-mode: ${mode})`));
    return installed ? 'standalone' : 'browser';
  } catch {
    return 'browser';
  }
};

/**
 * Which OS family, coarsely.
 *
 * Only four buckets, because the only distinction that matters is "does this
 * device need a Home Screen install before push works" — iOS does, the rest do
 * not. Finer detail would be data we have no use for.
 *
 * THE IPAD TRAP
 *
 * Since iPadOS 13 an iPad reports itself as 'Macintosh' in the user agent, so
 * the obvious /iPad/ test silently files every iPad under desktop — and iPads
 * are exactly the devices in this audience most likely to be an installed
 * home-screen app. A Mac with a touchscreen does not exist, so a 'Macintosh'
 * claiming multiple touch points is an iPad.
 */
export const detectPlatform = (
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  maxTouchPoints: number = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints ?? 0) : 0,
): Platform => {
  if (/iPhone|iPod/i.test(ua)) return 'ios';
  if (/iPad/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return 'desktop';
  return 'other';
};

// --------------------------------------------------------------------------
// Once per browser per day
// --------------------------------------------------------------------------

const PING_KEY = 'didc.portal.installPingDay';

/** Local date, not toISOString(): a UTC date rolls over mid-evening in the US. */
const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
};

/**
 * Fallback when localStorage is unavailable.
 *
 * Safari's private mode throws on access rather than returning null. Without
 * storage there is no way to remember that today was already counted, so the
 * ping would fire on every navigation and inflate exactly the number we are
 * trying to measure. A module-level flag bounds it to once per page load, which
 * over-counts a little and is bounded, instead of over-counting without limit.
 */
let pingedThisSession = false;

export const shouldPing = (readDay: () => string | null, now: string): boolean => {
  const last = readDay();
  return last !== now;
};

/**
 * Record that a browser in this mode opened the portal today.
 *
 * Deliberately not awaited by callers, and it resolves rather than rejects on
 * every failure path: an unconfigured Supabase, an unapplied migration, a
 * blocked request, a browser with no storage. The portal must not notice.
 */
export const recordInstallPing = async (): Promise<void> => {
  // isSupabaseConfigured is a FUNCTION, and `supabase` is null until it passes
  // — the same guard clientAuth and activityLog use. Testing the reference
  // rather than calling it is always truthy, which silently turns this into no
  // guard at all: the day gets stamped, the ping never happens, and the counts
  // read as "nobody opened the portal" rather than as a misconfiguration.
  if (!isSupabaseConfigured() || !supabase) return;
  if (pingedThisSession) return;

  const day = today();

  let storageWorks = true;
  try {
    if (window.localStorage.getItem(PING_KEY) === day) return;
  } catch {
    storageWorks = false;
  }

  // Set both guards BEFORE the request. If the call is slow and the parent
  // navigates, a second mount must not fire a second ping.
  pingedThisSession = true;
  if (storageWorks) {
    try {
      window.localStorage.setItem(PING_KEY, day);
    } catch {
      /* Nothing to do; the session flag still bounds this to one per load. */
    }
  }

  try {
    await supabase.rpc('record_install_ping', {
      p_display_mode: detectDisplayMode(),
      p_platform: detectPlatform(),
    });
  } catch {
    /* Instrumentation is never worth an error surfaced to a parent. */
  }
};

/** Test seam — the session guard would otherwise leak between cases. */
export const resetPingGuard = (): void => {
  pingedThisSession = false;
};
