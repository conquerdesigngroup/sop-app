/**
 * "Today" for anything dated in the studio's calendar.
 *
 * WHY THIS EXISTS
 *
 * A job task's `scheduledDate` is a bare YYYY-MM-DD with no timezone on it.
 * It was chosen in the studio's frame — "this is due Friday" means Friday at
 * the studio, not Friday wherever the person reading the badge happens to be
 * standing. So the "today" it gets compared against has to resolve in the
 * studio's zone too. Resolve it in the viewer's zone instead and the same
 * task is overdue for one person and not for another at the same instant.
 *
 * THE DECISION: the studio's date, not the viewer's.
 *
 * The server already works this way. The push digest in
 * supabase/functions/alert-push pins America/Los_Angeles and runs the exact
 * same predicate the badges do — `status === 'overdue' || scheduled_date <
 * today`. If the client resolved "today" locally, the badge and the
 * notification that lands on the same phone would disagree, and the person
 * holding the phone has no way to tell which one is lying. Pinning both to
 * the studio makes the count the same number everywhere: on the bottom bar,
 * on the Alerts page, and in the digest.
 *
 * This is deliberately NOT the rule for hours — see toISODate() in
 * src/components/hours/hoursUtils.ts, which stays local on purpose. A shift
 * is something a person worked in their own day. Scheduled work is the
 * studio's day. Two different questions, two different answers.
 *
 * The old idiom this replaces was `new Date().toISOString().split('T')[0]`
 * after `setHours(0,0,0,0)`: local midnight converted to UTC. That happens to
 * give the right answer in Pacific, which is why nobody noticed, and returns
 * yesterday's date for anyone east of Greenwich.
 */

export const STUDIO_TZ = 'America/Los_Angeles';

// Built once — constructing an Intl.DateTimeFormat is expensive and these run
// inside render paths and list filters.
const studioFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: STUDIO_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** An instant as YYYY-MM-DD in the studio's timezone. */
export const studioDate = (when: Date = new Date()): string => {
  const parts = studioFormat.formatToParts(when);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/** Today at the studio, YYYY-MM-DD. */
export const studioToday = (): string => studioDate();

/**
 * Shift a YYYY-MM-DD by whole days. Pure calendar arithmetic on the string —
 * anchored at UTC so no zone, and no DST hour, can leak into the answer.
 */
export const shiftIsoDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
};

/** Whole days from `from` to `to`. Negative when `to` is the earlier date. */
export const daysBetweenIso = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
