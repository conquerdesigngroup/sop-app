import { UserRole } from '../types';

/**
 * What a role means, in one place.
 *
 * WHY THIS EXISTS
 *
 * Before the super_admin tier there were two roles, so `role === 'admin'` was a
 * complete test and it was written out by hand in a dozen components. With three
 * roles that expression is no longer a question anyone means to ask: almost every
 * site meant "is this person management", and one meant "is this person the top
 * tier". Spelling that out per file is how one of them gets missed, and a missed
 * site does not fail loudly — it quietly shows a super admin a team member's
 * screen, or offers a control the database will refuse.
 *
 * So the comparisons live here and the components ask by name.
 *
 * THE CLIENT IS NOT THE BOUNDARY
 *
 * None of this enforces anything. Every one of these mirrors a policy —
 * is_admin() and is_super_admin() in the database — so that the UI does not
 * offer a save that Postgres will reject. Deleting this file would make the app
 * ugly and confusing; it would not make it insecure.
 */

/**
 * Management or above: admin and super_admin. Mirrors public.is_admin(), which
 * was widened in v13 rather than renamed, for the same reason this helper is not
 * called isAdmin — the name should say what it includes.
 */
export const isManagementRole = (role?: UserRole | null): boolean =>
  role === 'admin' || role === 'super_admin';

/**
 * The narrow test. Mirrors public.is_super_admin(): pay, hours and login
 * management.
 */
export const isSuperAdminRole = (role?: UserRole | null): boolean =>
  role === 'super_admin';

/** Most privileged first — the order the team list and its filter use. */
export const ROLE_ORDER: readonly UserRole[] = ['super_admin', 'admin', 'team'];

/**
 * How a role is written for a person to read.
 *
 * Falls back to 'Unknown' rather than throwing or rendering the raw value: a
 * role this build has never heard of means the database is ahead of the bundle,
 * which happens routinely on an installed phone that has not reloaded yet. A
 * neutral label degrades better than 'super_admin' in a badge.
 */
export const roleLabel = (role?: UserRole | null): string => {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    case 'team':
      return 'Team Member';
    default:
      return 'Unknown';
  }
};
