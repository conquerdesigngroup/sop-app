/**
 * Which holiday decoration, if any, the front door is wearing.
 *
 * ONE FLAG, AND IT FAILS CLOSED
 *
 * `REACT_APP_HOLIDAY` names the active theme and nothing else turns this on.
 * Unset, empty, "off", a typo, a stray capital or a trailing space all resolve
 * to null, which is off. That asymmetry is deliberate: this flag is the only
 * thing standing between the studio's families and a zombie shambling across
 * the front door in March, so every ambiguous value has to mean "no".
 *
 * NO DATE AUTOMATION, ON PURPOSE
 *
 * The obvious idea is to switch on the calendar — Halloween from October 1,
 * Christmas from December 1 — and it was considered and rejected. A date-keyed
 * theme changes the appearance of the app on a morning when nobody deployed
 * anything, and the first report is a parent saying the site looks broken. A
 * seasonal decoration should go live because somebody decided it was time, and
 * the deploy is that decision. Turning it on is a Vercel env change and a
 * redeploy; so is turning it off.
 *
 * WHAT IT COSTS WHEN IT IS OFF
 *
 * Nothing. HolidayLayer returns null before it touches anything, and the theme
 * — act code and sprite URLs alike — sits behind a dynamic import that is never
 * reached, so no art is fetched and no extra bytes run. With this unset the
 * chooser renders exactly the markup it rendered before the feature existed.
 *
 * The name is safe for the public bundle: it carries no secret, and it does not
 * match the SECRET|PASSWORD|PRIVATE|CREDENTIAL|SERVICE_ACCOUNT gate that
 * scripts/check-public-env.js enforces on every REACT_APP_* var at prebuild.
 */

export type HolidayId = 'halloween' | 'thanksgiving' | 'christmas';

/** The themes that exist. A name not on this list is off, not an error. */
export const HOLIDAY_IDS: readonly HolidayId[] = ['halloween', 'thanksgiving', 'christmas'];

const raw = (process.env.REACT_APP_HOLIDAY || '').trim().toLowerCase();

/**
 * The active holiday, or null when the front door is wearing its usual face.
 *
 * Read once at module load rather than per render: webpack inlines the
 * process.env lookup at build time, so there is nothing to re-read, and a
 * constant keeps the null check out of the render path entirely.
 */
export const ACTIVE_HOLIDAY: HolidayId | null = (HOLIDAY_IDS as readonly string[]).includes(raw)
  ? (raw as HolidayId)
  : null;
