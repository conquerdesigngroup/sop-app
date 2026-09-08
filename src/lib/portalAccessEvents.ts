/**
 * Reading the portal's sign-in activity — what a failed sign-in MEANT.
 *
 * The portal-admin `client_access_events` action returns one row per address
 * that has tried to get in, carrying three facts the browser cannot see for
 * itself: whether an account exists on that address, whether it has claimed a
 * household, and whether the studio holds the address at all. This turns those
 * into the one word the front desk acts on.
 *
 * THE DISTINCTION THIS FILE EXISTS FOR
 *
 * "Failed to sign in" is the same sentence for two families who need opposite
 * phone calls: one mistyped a password, the other has no account to sign in TO
 * and is sitting on the login screen trying the same thing again. On the first
 * day of the launch (2026-09-07/08) six households produced forty failed
 * sign-ins and eight password-reset requests between them without a single
 * registration — every one of them the second kind, and none of them visible
 * as such in the activity log, which showed forty identical rows.
 *
 * That family is 'stuck' below, and it is deliberately the loudest state and
 * the first one sorted, because it is the only one where the studio doing
 * nothing means the family never gets in.
 */

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export type AccessEventKind =
  | 'signin_failed'
  | 'reset_requested'
  | 'registered'
  | 'verified'
  | 'verify_failed'
  | 'rejected';

export type AccessCounts = Record<AccessEventKind, number>;

export interface AccessPerson {
  email: string;
  householdId: string | null;
  householdName: string | null;
  householdStatus: string | null;
  studentCount: number;
  /** A household carries this address — i.e. the studio has them on file. */
  emailKnown: boolean;
  hasAccount: boolean;
  accountRole: string | null;
  accountActive: boolean | null;
  isLinked: boolean;
  counts: AccessCounts;
  firstAt: string;
  lastAt: string;
  lastIp: string | null;
}

export interface AccessEvent {
  at: string;
  kind: AccessEventKind;
  email: string;
  ip: string | null;
  reason: string | null;
}

export interface AccessEventsResponse {
  days: number;
  people: AccessPerson[];
  events: AccessEvent[];
  truncated?: boolean;
}

/**
 * 'stuck'         no account, and they have tried to get in. THE CALL LIST.
 * 'unknown_email' no household holds this address — almost always a parent
 *                 using a different email from the one Enrollio has.
 * 'no_account'    a sign-up on this address never completed.
 * 'not_linked'    account exists but has claimed no household: v48's middle
 *                 state, an empty portal behind a working password.
 * 'in'            account exists and is linked. Any failures here are
 *                 ordinary password fumbles.
 */
export type AccessState = 'stuck' | 'unknown_email' | 'no_account' | 'not_linked' | 'in';

/** Did they actually try to get in, as against merely failing to sign up? */
export const hasTriedToSignIn = (c: AccessCounts): boolean =>
  c.signin_failed + c.reset_requested > 0;

export const accessState = (p: AccessPerson): AccessState => {
  // Checked before the account, because an address the studio does not hold is
  // the actionable fact whether or not somebody made an account on it.
  if (!p.emailKnown) return 'unknown_email';
  if (!p.hasAccount) return hasTriedToSignIn(p.counts) ? 'stuck' : 'no_account';
  if (!p.isLinked) return 'not_linked';
  return 'in';
};

export const ACCESS_STATE: Record<
  AccessState,
  { text: string; variant: BadgeVariant; help: string }
> = {
  stuck: {
    text: 'Never signed up',
    variant: 'danger',
    help: 'They are trying to log in and there is no account on this address. Tell them to tap Sign up — the login will never work until they do.',
  },
  unknown_email: {
    text: 'Not a studio address',
    variant: 'warning',
    help: 'No household on file has this email. They are probably using a different address from the one the studio holds.',
  },
  no_account: {
    text: 'No account',
    variant: 'warning',
    help: 'A sign-up on this address did not complete, and nothing has been tried since.',
  },
  not_linked: {
    text: 'Account not linked',
    variant: 'warning',
    help: 'They have a working account that has not claimed their household, so the portal will look empty to them.',
  },
  in: {
    text: 'Signed in',
    variant: 'success',
    help: 'Account exists and is linked to the household. Any failures here are ordinary mistyped passwords.',
  },
};

export const EVENT_LABEL: Record<AccessEventKind, string> = {
  signin_failed: 'Sign-in failed',
  reset_requested: 'Password reset requested',
  registered: 'Registered',
  verified: 'Email verified',
  verify_failed: 'Wrong or expired code',
  rejected: 'Sign-up rejected',
};

export const EVENT_VARIANT: Record<AccessEventKind, BadgeVariant> = {
  signin_failed: 'danger',
  reset_requested: 'warning',
  registered: 'success',
  verified: 'success',
  verify_failed: 'warning',
  rejected: 'danger',
};

/** portal-signup's `reason` on a client_signup_rejected row. */
export const REJECT_REASON: Record<string, string> = {
  already_registered: 'already registered',
  create_failed: 'the account could not be created',
  profile_rebuild_failed: 'the account was made and then rolled back',
  not_on_roster: 'not on the roster',
};

const RANK: Record<AccessState, number> = {
  stuck: 0,
  unknown_email: 1,
  no_account: 2,
  not_linked: 3,
  in: 4,
};

/**
 * Worst first, then most recent. A list ordered purely by time buries the one
 * family who cannot get in under thirty rows of people who signed in fine.
 */
export const sortPeople = (people: AccessPerson[]): AccessPerson[] =>
  [...people].sort((a, b) => {
    const byState = RANK[accessState(a)] - RANK[accessState(b)];
    if (byState !== 0) return byState;
    return a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0;
  });

export interface AccessSummary {
  people: number;
  stuck: number;
  unknownEmail: number;
  notLinked: number;
  registered: number;
  signinFailed: number;
  resetRequested: number;
  verifyFailed: number;
}

export const summarise = (people: AccessPerson[]): AccessSummary => {
  const s: AccessSummary = {
    people: people.length,
    stuck: 0,
    unknownEmail: 0,
    notLinked: 0,
    registered: 0,
    signinFailed: 0,
    resetRequested: 0,
    verifyFailed: 0,
  };
  for (const p of people) {
    const state = accessState(p);
    if (state === 'stuck') s.stuck += 1;
    if (state === 'unknown_email') s.unknownEmail += 1;
    if (state === 'not_linked') s.notLinked += 1;
    s.registered += p.counts.registered;
    s.signinFailed += p.counts.signin_failed;
    s.resetRequested += p.counts.reset_requested;
    s.verifyFailed += p.counts.verify_failed;
  }
  return s;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "6 failed sign-ins · 2 reset requests" — only the kinds that happened. */
export const describeCounts = (c: AccessCounts): string => {
  const parts: string[] = [];
  if (c.signin_failed) parts.push(plural(c.signin_failed, 'failed sign-in', 'failed sign-ins'));
  if (c.reset_requested) parts.push(plural(c.reset_requested, 'reset request', 'reset requests'));
  if (c.registered) parts.push(plural(c.registered, 'registration', 'registrations'));
  if (c.verified) parts.push('email verified');
  if (c.verify_failed) parts.push(plural(c.verify_failed, 'wrong code', 'wrong codes'));
  if (c.rejected) parts.push(plural(c.rejected, 'rejected sign-up', 'rejected sign-ups'));
  return parts.join(' · ');
};

/**
 * "2:56pm today" / "9:05pm yesterday" / "Sun 7 Sep, 11:48pm".
 *
 * Local time, not the studio's Pacific day: the reader is looking at their own
 * phone deciding whether to ring somebody now, and studioDate.ts exists for
 * the opposite case (a task due date that must mean the same thing to
 * everybody). `now` is a parameter so the day boundary can be tested.
 */
export const describeWhen = (iso: string, now: Date = new Date()): string => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';

  const time = at
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(/\s?([AP])M/i, (_m, p1: string) => p1.toLowerCase() + 'm');

  // Compared as calendar days, not as a 24-hour difference: 11pm and 1am are
  // two hours apart and "yesterday".
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysBack = Math.round((midnight(now) - midnight(at)) / 86400000);

  if (daysBack === 0) return `${time} today`;
  if (daysBack === 1) return `${time} yesterday`;
  return `${at.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })}, ${time}`;
};
