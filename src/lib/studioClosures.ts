import { supabase, isSupabaseConfigured } from './supabase';
import { dateKey, eventDayKey, eventLastDayKey } from './portal';

/**
 * The days the studio is shut.
 *
 * WHERE THEY ACTUALLY LIVE, WHICH IS NOT WHERE THE CODE LOOKED
 *
 * upcomingClasses.ts subtracts closures from the schedule by reading
 * portal_class_sessions rows with a status other than 'held' — "the manual
 * closures an admin enters ahead of a holiday". Measured on 2026-09-09 there
 * are ZERO such rows, and there are four real closures on the studio's
 * calendar: Thanksgiving, a two-week Christmas break, Memorial Day, and the
 * summer shutdown.
 *
 * The studio marks its closures in Google Calendar, which syncs into
 * portal_events. So the projection is looking in an empty table while the
 * answer sits in a full one. This module reads the full one.
 *
 * MATCHED ON THE TITLE, WHICH IS A HEURISTIC AND IS ADMITTED AS ONE
 *
 * portal_events has no type column — id, program_id, class_id, title,
 * description, starts_at, ends_at, is_all_day, location, source, the two
 * google ids, is_published. Nothing says "this one is a closure". So the title
 * is the only signal available, and it is matched narrowly: the word "closed"
 * on its own, or "no class(es)". Narrow on purpose, because the same calendar
 * carries "Veterans Day – Studio OPEN", which must not match, and a loose
 * pattern on "close" would catch "Registration closes Friday".
 *
 * The right fix is a flag on the event that an admin sets, at which point this
 * regex is deleted and `isClosure` reads the column. Until then a closure the
 * studio phrases differently is simply not shown — which is the safe direction:
 * a missing closure leaves the schedule as it is today, while a false positive
 * would tell a family not to come to a class that is running.
 *
 * ONE ROW PER PROGRAM, SO EVERYTHING IS DEDUPED
 *
 * The same Google event syncs into portal_events once for each program that
 * subscribes to that calendar, so "Closed for Thanksgiving Holiday" is two
 * rows. That is correct storage and wrong to render twice, hence the dedupe on
 * title plus span.
 */

export interface StudioClosure {
  title: string;
  /** 'YYYY-MM-DD', inclusive. */
  firstDay: string;
  /** 'YYYY-MM-DD', inclusive — see eventLastDayKey. */
  lastDay: string;
}

/**
 * Narrow by design. See the header: a missed closure costs nothing that is not
 * already true today, and a false one tells a family to stay home from a class
 * that is running.
 */
const CLOSURE_TITLE = /(^|\W)(closed|closing)(\W|$)|\bno\s+class(es)?\b/i;

export const isClosureTitle = (title: string | null | undefined): boolean =>
  !!title && CLOSURE_TITLE.test(title);

/** How far back to look, so a closure ALREADY UNDER WAY is still found. */
const LOOKBACK_DAYS = 30;

/**
 * Upcoming closures, soonest first, including one running right now.
 *
 * Reports failure rather than throwing: this is one card on a dashboard, and a
 * portal that cannot reach the events table should still show everything else.
 */
export const loadStudioClosures = async (
  now: Date = new Date(),
): Promise<{ closures: StudioClosure[]; error: string | null }> => {
  if (!isSupabaseConfigured()) return { closures: [], error: null };

  const from = new Date(now);
  from.setDate(from.getDate() - LOOKBACK_DAYS);

  const { data, error } = await supabase
    .from('portal_events')
    .select('title, starts_at, ends_at, is_all_day')
    .eq('is_published', true)
    .gte('starts_at', from.toISOString())
    .order('starts_at');

  if (error) return { closures: [], error: 'We could not load the studio closures.' };

  const today = dateKey(now);
  const seen = new Set<string>();
  const closures: StudioClosure[] = [];

  (data ?? []).forEach((row: any) => {
    if (!isClosureTitle(row.title)) return;

    const firstDay = eventDayKey(row.starts_at, row.is_all_day);
    const lastDay = eventLastDayKey(row.starts_at, row.ends_at, row.is_all_day);

    // Keys are zero-padded, so string comparison orders dates correctly.
    if (lastDay < today) return;

    const id = `${row.title}|${firstDay}|${lastDay}`;
    if (seen.has(id)) return;
    seen.add(id);

    closures.push({ title: row.title.trim(), firstDay, lastDay });
  });

  return { closures, error: null };
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A date key -> Date, in the LOCAL frame. `new Date('2026-11-24')` is UTC. */
const fromKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * "Mon 31 May", "Tue 24 – Fri 27 Nov", "Mon 21 Dec – Sun 3 Jan".
 *
 * The month is printed once when both ends share it, because "Tue 24 Nov –
 * Fri 27 Nov" makes a reader check whether the two months differ.
 */
export const closureDateLabel = (closure: StudioClosure): string => {
  const a = fromKey(closure.firstDay);
  const b = fromKey(closure.lastDay);
  const day = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()}`;

  if (closure.firstDay === closure.lastDay) return `${day(a)} ${MONTHS[a.getMonth()]}`;
  if (a.getMonth() === b.getMonth()) return `${day(a)} – ${day(b)} ${MONTHS[b.getMonth()]}`;
  return `${day(a)} ${MONTHS[a.getMonth()]} – ${day(b)} ${MONTHS[b.getMonth()]}`;
};

/** Whole days until a closure starts. Negative once it has begun. */
export const daysUntil = (closure: StudioClosure, now: Date = new Date()): number =>
  Math.round((fromKey(closure.firstDay).getTime() - fromKey(dateKey(now)).getTime()) / 86400000);

/** "Sat 20 Jun 2027" — the year matters on a date most of a year away. */
export const seasonEndLabel = (key: string): string => {
  const d = fromKey(key);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
