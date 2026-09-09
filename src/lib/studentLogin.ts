/**
 * Granting one dancer their own portal login — the decisions worth testing.
 *
 * The server refuses all of this again in admin_roster_add_student, and it is
 * the authority. These exist so the modal can say WHY before a round trip, and
 * so the reasons are pinned by tests rather than living in JSX.
 */

import { ViewerStudent } from './portalViewer';

/** Same shape the edge function and the RPC test. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const normaliseEmail = (raw: string): string => raw.trim().toLowerCase();

export const isValidEmail = (raw: string): boolean => {
  const v = normaliseEmail(raw);
  return v.length > 0 && v.length <= 254 && EMAIL_RE.test(v);
};

/**
 * Why this dancer cannot be given a login, or null if they can.
 *
 * Only reasons knowable from what the picker already has in memory. Everything
 * that needs the database — the address belonging to a staff account, to a
 * client already in a family, or to another dancer — is the RPC's to refuse,
 * because only the RPC can see it.
 */
export const dancerBlockedReason = (
  student: ViewerStudent,
  alreadyGranted: ReadonlySet<string>,
): string | null => {
  if (student.status !== 'active') {
    return 'That dancer’s record is archived. Restore the family first.';
  }
  if (alreadyGranted.has(student.id)) {
    return 'That dancer already has their own login.';
  }
  return null;
};

/**
 * Why this address is wrong for this dancer, or null.
 *
 * The family's own address is the one that matters: used for a dancer login it
 * would file the PARENT as a student member the next time they registered, and
 * they would silently see exactly one of their own children.
 */
export const emailBlockedReason = (
  student: ViewerStudent,
  rawEmail: string,
): string | null => {
  const email = normaliseEmail(rawEmail);
  if (!email) return null;
  if (!isValidEmail(email)) return 'That is not a valid email address.';
  if (email === normaliseEmail(student.householdEmail)) {
    return 'That is the family’s own account address, not the dancer’s. Using it would file the parent as a dancer and show them only one of their children.';
  }
  return null;
};
