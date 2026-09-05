import { UserRole } from '../types';
import { isManagementRole } from './roles';

/**
 * Guessing which staff account belongs to a name on the schedule.
 *
 * WHY THIS IS A SUGGESTION AND NEVER A RULE
 *
 * v9 split these two on purpose. `portal_classes.instructor_name` is display
 * text for parents — "Miss Sarah", "Guest Choreographer", two names in one
 * field — while `portal_class_instructors` holds the account allowed to
 * publish. Deriving the second from the first would mean a class rename
 * silently moves write access, and a typo silently revokes it. That failure is
 * invisible: the teacher just finds the button gone and reports "the app is
 * broken".
 *
 * So nothing here grants anything. It ranks candidates so an admin can confirm
 * ~13 rows instead of hand-ticking 103, and every tier below `exact` is
 * labelled for a human to look at.
 *
 * WHAT THE REAL DATA ACTUALLY LOOKS LIKE
 *
 * Measured against the 2026-2027 season, all five of these are live cases, and
 * each one is why its tier exists:
 *
 *   Ky'ree Nevels    vs  "Ky’Ree ␣Nevels"  curly apostrophe, case, trailing space
 *   Kansas O'dwyer   vs  "Kansas ODwyer"   apostrophe on one side only
 *   Gracie Kunkle    vs  "Grace Kunkle"    a nickname, not a typo
 *   Morgan Davidson  vs  "Morgan Davison"  one letter, and nobody knows which is right
 *   Chill Kerney     vs  "Chill K"         the account's surname is an initial
 *
 * The first two are the same string once punctuation stops counting, so they
 * come back `exact`. The next two are `likely`. The last is `review`, because
 * an initial is weak evidence even when it is the only candidate.
 */

export type MatchConfidence = 'exact' | 'likely' | 'review' | 'ambiguous' | 'none';

export interface StaffCandidate {
  id: string;
  firstName: string;
  lastName: string;
  role?: UserRole | null;
}

export interface InstructorRow {
  /** The name exactly as it is written on the schedule, for display. */
  scheduleName: string;
  /** Every active class that lists this name. */
  classIds: string[];
  /** Best candidate, or null when nothing came close. */
  suggestion: StaffCandidate | null;
  confidence: MatchConfidence;
  /** Every candidate that tied for the best tier. Only filled when ambiguous. */
  alternatives: StaffCandidate[];
  /**
   * True when the suggested account is already admin or super_admin, so it can
   * publish everywhere and a grant would add nothing. Shown rather than hidden:
   * an admin looking for "why is Carlos not in the list" deserves an answer.
   */
  alreadyCovered: boolean;
}

/**
 * One field can hold several teachers. The season import wrote them
 * slash-separated and they have since been hand-edited to commas, so both are
 * live in the table today; `&` and " and " cost nothing to accept and no
 * surname contains any of the four.
 */
const SEPARATORS = /\s*(?:,|\/|&|\sand\s)\s*/i;

/**
 * Anything a person might type where an apostrophe belongs. The profile row
 * reads "Ky’Ree" and the schedule reads "Ky'ree"; without folding these two the
 * best-matched teacher in the studio looks like a stranger.
 */
const APOSTROPHES = /[‘’ʼ`´']/g;

/**
 * Fold a name to the part that identifies it: no case, no punctuation, no
 * accents, single spaces. Apostrophes are dropped rather than standardised so
 * that "O'dwyer" and "ODwyer" land on the same string.
 */
export const normalizeName = (raw: string): string =>
  raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Exactly one insertion, deletion or substitution apart — the shape of
 * "Davidson"/"Davison". A full edit-distance would also call "Ramirez" and
 * "Martinez" close, which is not a suggestion worth making.
 */
export const differsByOneEdit = (a: string, b: string): boolean => {
  if (a === b) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (short.length === long.length) {
      i++;
      j++;
    } else {
      j++;
    }
  }
  return edits + (long.length - j) + (short.length - i) === 1;
};

/** Split a normalized name into a first part and a surname. */
const split = (normalized: string): { first: string; last: string } => {
  const parts = normalized.split(' ');
  if (parts.length < 2) return { first: normalized, last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
};

/** Lower is better. Anything above REVIEW is not worth showing. */
const TIER = { EXACT: 0, LIKELY: 1, REVIEW: 2, NONE: 99 } as const;

const scoreCandidate = (scheduleName: string, candidate: StaffCandidate): number => {
  const target = normalizeName(scheduleName);
  const whole = normalizeName(`${candidate.firstName} ${candidate.lastName}`);
  if (!target || !whole) return TIER.NONE;
  if (target === whole) return TIER.EXACT;

  const s = split(target);
  const c = split(whole);
  if (!s.last || !c.last) return TIER.NONE;

  // "Grace" / "Gracie" — a shortened first name against the same surname. The
  // 3-character floor keeps "Jo" from matching every J-name on the schedule.
  if (s.last === c.last) {
    if (s.first === c.first) return TIER.EXACT;
    const [shortFirst, longFirst] =
      s.first.length <= c.first.length ? [s.first, c.first] : [c.first, s.first];
    if (shortFirst.length >= 3 && longFirst.startsWith(shortFirst)) return TIER.LIKELY;
    if (differsByOneEdit(s.first, c.first)) return TIER.LIKELY;
  }

  // "Davidson" / "Davison" — same first name, surname off by a character. The
  // 4-character floor stops an initial being treated as a near-miss surname;
  // initials are the tier below.
  if (s.first === c.first && c.last.length >= 4 && differsByOneEdit(s.last, c.last)) {
    return TIER.LIKELY;
  }

  // "Chill Kerney" against an account surnamed "K". Deliberately the weakest
  // tier: an initial is one character of evidence, so it is never applied
  // without someone looking at it.
  if (s.first === c.first && c.last.length <= 2 && s.last.startsWith(c.last)) {
    return TIER.REVIEW;
  }

  return TIER.NONE;
};

const CONFIDENCE_BY_TIER: Record<number, MatchConfidence> = {
  [TIER.EXACT]: 'exact',
  [TIER.LIKELY]: 'likely',
  [TIER.REVIEW]: 'review',
};

/**
 * Every distinct teacher name on the schedule, with a suggested account.
 *
 * Rows come back most-classes-first: the name attached to sixteen classes is
 * the one worth getting right, and burying it under a guest choreographer with
 * two would be a strange way to sort a to-do list.
 */
export const matchInstructors = (
  classes: { id: string; instructorName?: string | null; isActive?: boolean }[],
  staff: StaffCandidate[]
): InstructorRow[] => {
  const byName = new Map<string, { display: string; classIds: string[] }>();

  for (const klass of classes) {
    if (klass.isActive === false) continue;
    for (const piece of (klass.instructorName ?? '').split(SEPARATORS)) {
      const display = piece.trim();
      const key = normalizeName(display);
      if (!key) continue;
      const existing = byName.get(key);
      if (existing) existing.classIds.push(klass.id);
      else byName.set(key, { display, classIds: [klass.id] });
    }
  }

  const rows: InstructorRow[] = [];
  for (const { display, classIds } of Array.from(byName.values())) {
    let best: number = TIER.NONE;
    let winners: StaffCandidate[] = [];

    for (const candidate of staff) {
      const score = scoreCandidate(display, candidate);
      if (score === TIER.NONE) continue;
      if (score < best) {
        best = score;
        winners = [candidate];
      } else if (score === best) {
        winners.push(candidate);
      }
    }

    // A tie is not a suggestion. Two accounts scoring the same means the name
    // alone cannot tell them apart, and picking one would be a coin flip
    // presented as an answer.
    const ambiguous = winners.length > 1;
    const suggestion = ambiguous || winners.length === 0 ? null : winners[0];

    rows.push({
      scheduleName: display,
      classIds,
      suggestion,
      confidence: ambiguous ? 'ambiguous' : CONFIDENCE_BY_TIER[best] ?? 'none',
      alternatives: ambiguous ? winners : [],
      alreadyCovered: suggestion ? isManagementRole(suggestion.role) : false,
    });
  }

  return rows.sort(
    (a, b) => b.classIds.length - a.classIds.length || a.scheduleName.localeCompare(b.scheduleName)
  );
};
