import { supabase } from './supabase';
import { PortalClassCategory, PortalUpdate } from '../types';
import { mapUpdate } from './portalMappers';
import { CLASS_CATEGORY_LABEL, dayName } from './portal';

/**
 * The read layer behind the Portal Viewer — oversight of what families
 * actually have, as opposed to what the studio publishes at them.
 *
 * WHY A SEPARATE FILE FROM portalAdmin / attendanceQueries
 *
 * attendanceQueries.ts is the PARENT's view of their own household and is
 * written to be safe when it returns nothing. This is the studio's view of
 * every household, and its failure mode is the opposite: a screen that quietly
 * shows 340 families when there are 343 is worse than one that errors.
 *
 * Nothing here is authorised in this file. v33 wrote every policy as
 * `<the family's own rows> OR is_admin()`, so the database decides. What this
 * file adds is three overview views (v36) so a list is one request rather than
 * one per row.
 *
 * WHY EVERYTHING IS FETCHED WHOLE
 *
 * 343 households, 388 students, 103 classes. All three lists fit in a single
 * response of well under 100KB, and fetching them once buys instant local
 * search — which matters more than it sounds, because the actual task is
 * "find the Kettenbrinks" and a round trip per keystroke on a phone at the
 * front desk is the difference between using this and not.
 *
 * Rosters and household details are NOT fetched whole: 1,111 enrollments joined
 * to classes is a different size of thing, and both are opened one at a time.
 */

export const VIEWER_LOAD_ERROR =
  'We could not load this. Check your connection and try again.';

export type ViewerError = string | null;

export interface ViewerHousehold {
  id: string;
  externalAccountId: string | null;
  email: string;
  name: string;
  status: 'active' | 'inactive';
  studentCount: number;
  /** Rows in portal_household_members: 0 = nobody has claimed this family yet. */
  linkedLogins: number;
  /**
   * Client accounts carrying this family's address that have NOT claimed it.
   *
   * The difference between "they have never signed up" and "they signed up and
   * cannot see their dancers", which used to be one number and needed to be
   * two — see accessLabel.
   */
  unlinkedAccounts: number;
  enrollmentCount: number;
  /** Class categories the household's children are enrolled in — All-Stars, Academy, TNT. */
  categories: string[];
  lastNoteAt: string | null;
  /**
   * The full name the account holder signed up with — "Brittany Kettenbrink".
   *
   * `name` above is the FAMILY's label and is a bare surname for 341 of the 349
   * households, because that is what the Enrolio export puts in the guardian
   * column. This is the person, and it is null until somebody registers.
   *
   * Null also when v57 has not been applied. Same reading either way: we do not
   * know their name, so the screens fall back to the surname.
   */
  accountName: string | null;
  /** The address that account signs in with, which "Change email" can move. */
  accountEmail: string | null;
  /**
   * When this family first had an account (v59) — the earliest profile among
   * the logins that claimed it, or an unclaimed one carrying its address.
   *
   * Null when nobody has signed up, and null for every family when v59 has not
   * been applied — see signupDatesAreKnown.
   */
  signedUpAt: string | null;
}

export interface ViewerStudent {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  dateOfBirth: string | null;
  status: 'active' | 'inactive';
  externalStudentId: string | null;
  householdId: string;
  householdName: string;
  householdEmail: string;
  enrollmentCount: number;
  /** Divisions this dancer is currently enrolled in. Empty = not enrolled. */
  categories: string[];
  /**
   * Logins pinned to THIS child (v51). One dancer has one today.
   *
   * null, not 0, when v57 has not been applied — the difference between "this
   * child has no login" and "this screen cannot tell", and the lists refuse to badge
   * anybody rather than tell 395 dancers they have no account on the strength
   * of a column that is not there.
   */
  ownLogins: number | null;
  /** Logins on the family as a whole. A parent's login sees every sibling. */
  householdLogins: number | null;
  /** The address that dancer's own login signs in with, when there is one. */
  ownLoginEmail: string | null;
  /** The parent's full name, when the family has signed up. */
  householdAccountName: string | null;
}

export interface ViewerClass {
  id: string;
  programId: string;
  name: string;
  category: string | null;
  style: string | null;
  level: string | null;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  instructorName: string | null;
  season: string | null;
  isActive: boolean;
  externalClassId: string | null;
  activeEnrollments: number;
}

/** One child's place in one class, as the roster screen shows it. */
export interface ViewerRosterRow {
  enrollmentId: string;
  status: string;
  season: string | null;
  enrolledOn: string | null;
  droppedOn: string | null;
  studentId: string;
  studentName: string;
  dateOfBirth: string | null;
  householdId: string;
  householdName: string;
  householdEmail: string;
}

/** A child plus every class they are in — the shape the household screen needs. */
export interface ViewerStudentDetail {
  student: ViewerStudent;
  enrollments: {
    id: string;
    status: string;
    season: string | null;
    enrolledOn: string | null;
    droppedOn: string | null;
    classId: string;
    className: string;
    classCategory: string | null;
    dayOfWeek: number | null;
    startTime: string | null;
    programId: string;
  }[];
}

export interface ViewerHouseholdDetail {
  household: ViewerHousehold;
  students: ViewerStudentDetail[];
  /** Notes already sent to this family, newest first. */
  notes: PortalUpdate[];
}

/** One dancer's own record — the screen behind a tap on their name. */
export interface ViewerStudentProfile {
  student: ViewerStudent;
  /** Null only if the household vanished between the two reads. */
  household: ViewerHousehold | null;
  enrollments: ViewerStudentDetail['enrollments'];
}

// ------------------------------------------------------------------ mapping

const mapHousehold = (r: any): ViewerHousehold => ({
  id: r.id,
  externalAccountId: r.external_account_id,
  email: r.primary_email,
  // Enrolio does not always carry a contact name; the email is the only thing
  // guaranteed to be there, so it stands in rather than leaving a blank row.
  name: r.display_name || r.primary_email,
  status: r.status,
  studentCount: r.student_count ?? 0,
  linkedLogins: r.linked_logins ?? 0,
  // Absent until v48 is applied, and 0 is the honest reading of that: it says
  // "no stranded account known", which is what the Viewer showed before the
  // column existed. Never undefined reaching a comparison.
  unlinkedAccounts: r.unlinked_accounts ?? 0,
  enrollmentCount: r.enrollment_count ?? 0,
  categories: r.categories ?? [],
  lastNoteAt: r.last_note_at ?? null,
  // v57. Absent until the migration is applied, and null is the honest reading
  // of that — it means "no name known", which is what every screen showed
  // before the column existed.
  accountName: r.account_name ?? null,
  accountEmail: r.account_email ?? null,
  signedUpAt: r.signed_up_at ?? null,
});

const mapStudent = (r: any): ViewerStudent => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  displayName: r.display_name,
  dateOfBirth: r.date_of_birth,
  status: r.status,
  externalStudentId: r.external_student_id,
  householdId: r.household_id,
  householdName: r.household_name || r.primary_email,
  householdEmail: r.primary_email,
  enrollmentCount: r.enrollment_count ?? 0,
  categories: r.categories ?? [],
  // v57, and deliberately NOT `?? 0`: see ViewerStudent. A missing column must
  // not read as "this child has no login".
  ownLogins: r.own_logins ?? null,
  householdLogins: r.household_logins ?? null,
  ownLoginEmail: r.own_login_email ?? null,
  householdAccountName: r.household_account_name ?? null,
});

const mapClass = (r: any): ViewerClass => ({
  id: r.id,
  programId: r.program_id,
  name: r.name,
  category: r.category,
  style: r.style,
  level: r.level,
  dayOfWeek: r.day_of_week,
  startTime: r.start_time,
  endTime: r.end_time,
  location: r.location,
  instructorName: r.instructor_name,
  season: r.season,
  isActive: r.is_active,
  externalClassId: r.external_class_id,
  activeEnrollments: r.active_enrollments ?? 0,
});

// ------------------------------------------------------------- pure helpers

export const studentFullName = (s: { firstName: string; lastName: string }): string =>
  `${s.firstName} ${s.lastName}`.trim();

/**
 * What to call a family when you mean the FAMILY and not a person.
 *
 * portal_households.display_name is a bare surname for 341 of the 349
 * households — the import writes `coalesce(guardian_name, student_last_name)`
 * and Enrolio's guardian column holds a surname. Printed raw it reads as a
 * half-filled name field; "Kettenbrink family" reads as what it is.
 *
 * Left alone when it already has a space in it (somebody typed a real name, or
 * the studio wrote "The Kettenbrinks") and when it is standing in for a missing
 * name with the email address.
 */
export const familyLabel = (h: { name: string; email: string }): string => {
  const name = h.name.trim();
  if (!name || name.toLowerCase() === h.email.trim().toLowerCase()) return h.email;
  return name.indexOf(' ') === -1 ? `${name} family` : name;
};

/**
 * The heading for a family: the PERSON when we know who they are.
 *
 * The studio holds the full name of everyone who has signed up — it is what
 * they typed into the sign-up form — and until v57 no staff screen read it. A
 * family that had registered still showed as "Kettenbrink", which is why the
 * owner could not tell two Kettenbrinks apart and why the access-events list
 * named nobody at all.
 *
 * Falls back to the family label, never to half a name.
 */
export const householdTitle = (h: ViewerHousehold): string =>
  h.accountName?.trim() || familyLabel(h);

/**
 * The line under that heading, or null when it would only repeat it.
 *
 * "Brittany Kettenbrink" over "Kettenbrink family" is noise. "Brittany Ruiz"
 * over "Kettenbrink family" is the useful case and the reason this exists: a
 * parent whose surname is not the one the account is filed under is exactly the
 * family somebody is on the phone about.
 */
export const householdSubtitle = (h: ViewerHousehold): string | null => {
  const account = (h.accountName ?? '').trim().toLowerCase();
  if (!account) return null;
  const family = h.name.trim();
  if (!family || family.toLowerCase() === h.email.trim().toLowerCase()) return null;
  // The surname, however the studio wrote it. "Boateng family" and "Boateng"
  // are the same fact about Marcus Boateng, and a line repeating either under
  // his name is the noise this function exists to suppress — so the trailing
  // word "family" is stripped before comparing, and the last word is tried on
  // its own for a display_name like "The Boatengs".
  const core = family.replace(/\s*famil(y|ies)$/i, '').trim();
  if (core && account.indexOf(core.toLowerCase()) !== -1) return null;
  const surname = core.split(/\s+/).pop() ?? '';
  if (surname && account.indexOf(surname.toLowerCase()) !== -1) return null;
  return familyLabel(h);
};

/**
 * Who a dancer belongs to, in one line: the parent by name where the family has
 * signed up, the family label where they have not.
 *
 * The dancer row used to print the household's display_name, which is the
 * child's own surname for almost every family — "Ava Kettenbrink" over
 * "Kettenbrink", a line that told the reader nothing they had not just read.
 */
export const studentFamilyName = (s: ViewerStudent): string =>
  s.householdAccountName?.trim() ||
  familyLabel({ name: s.householdName, email: s.householdEmail });

/**
 * Age in whole years, or null when there is no date of birth.
 *
 * Shown next to the name because that is the whole reason date_of_birth is in
 * this database: two children called Ava Martinez are told apart by their age,
 * not by staring harder at the spelling.
 */
export const ageFrom = (dob: string | null, today: Date): number | null => {
  if (!dob) return null;
  const parts = dob.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  const beforeBirthday =
    today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 120 ? age : null;
};

/**
 * Search across every field a person might type.
 *
 * Deliberately matches the EMAIL as well as the name, because the front desk's
 * question is usually "who is brittknee58@yahoo.com" — and because Enrolio
 * spells surnames inconsistently (Ketenbrink / Kettenbrink), a name-only search
 * is the same trap that dropped three children from the import.
 */
/**
 * A row's divisions as the row DISPLAYS them.
 *
 * The column holds slugs; the chips render "All-Stars". Searching the slug
 * alone meant typing the exact words printed on thirty visible rows returned
 * "No class matches that" — the search rejecting its own labels. Both spellings
 * are searchable now, and an unrecognised category falls back to itself so a
 * category the studio adds later is never unsearchable.
 *
 * ClassesSection has done this since v25; this is the same corpus.
 */
const divisionText = (categories: string[]): string =>
  categories
    .map(c => `${c} ${CLASS_CATEGORY_LABEL[c as PortalClassCategory] ?? ''}`)
    .join(' ');

export const householdMatches = (h: ViewerHousehold, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    h.name.toLowerCase().indexOf(q) !== -1 ||
    // The name they signed up with, which is the one the row now PRINTS.
    // Searching a screen for a word that is visible on it and being told
    // nothing matches is the same trap divisionText was written to close.
    (h.accountName ?? '').toLowerCase().indexOf(q) !== -1 ||
    h.email.toLowerCase().indexOf(q) !== -1 ||
    (h.accountEmail ?? '').toLowerCase().indexOf(q) !== -1 ||
    (h.externalAccountId ?? '').toLowerCase().indexOf(q) !== -1 ||
    divisionText(h.categories).toLowerCase().indexOf(q) !== -1
  );
};

export const studentMatches = (s: ViewerStudent, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    studentFullName(s).toLowerCase().indexOf(q) !== -1 ||
    (s.displayName ?? '').toLowerCase().indexOf(q) !== -1 ||
    s.householdName.toLowerCase().indexOf(q) !== -1 ||
    // Their parent by name, and their own login by address — both printed on
    // the row, so both searchable.
    (s.householdAccountName ?? '').toLowerCase().indexOf(q) !== -1 ||
    s.householdEmail.toLowerCase().indexOf(q) !== -1 ||
    (s.ownLoginEmail ?? '').toLowerCase().indexOf(q) !== -1 ||
    divisionText(s.categories).toLowerCase().indexOf(q) !== -1
  );
};

export const classMatches = (c: ViewerClass, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    c.name.toLowerCase().indexOf(q) !== -1 ||
    divisionText(c.category ? [c.category] : []).toLowerCase().indexOf(q) !== -1 ||
    (c.instructorName ?? '').toLowerCase().indexOf(q) !== -1 ||
    (c.externalClassId ?? '').toLowerCase().indexOf(q) !== -1 ||
    // "saturday" is on the row too, and is how anyone would look for it.
    (dayName(c.dayOfWeek) ?? '').toLowerCase().indexOf(q) !== -1
  );
};

/**
 * What to say about a family's access, in the words the owner would use.
 *
 * THREE STATES, BECAUSE THEY NEED THREE DIFFERENT RESPONSES
 *
 * This used to be a boolean over portal_household_members, and the note
 * against it said an unlinked account "is indistinguishable from having no
 * account at all". That was true of the data and false of the studio: one
 * family needs chasing to sign up, the other has already signed up and cannot
 * see their dancers. Collapsing them put two families with working, verified
 * accounts into a 330-row chase list on 2026-09-07, where nobody would have
 * found them.
 *
 * 'linked'      — a login has claimed this household. Nothing to do.
 * 'unlinked'    — an account carries this address and has not claimed it. A
 *                 fault, not a to-do: an inactive household, an address that
 *                 changed in Enrolio after the account was made, or a link
 *                 that errored. Somebody has to look at it. v47 stops this
 *                 arising at signup; it does not stop it arising.
 * 'none'        — never signed up. The chase list.
 *
 * A household with a linked login AND a stranded second guardian reads as
 * 'linked'. The family has access, which is what this column answers; the
 * second account shows up in the ACCESS filter's own count, not here.
 */
export type AccessState = 'linked' | 'unlinked' | 'none';

/** Badge colour per state, so the two screens rendering it cannot disagree. */
export const ACCESS_BADGE: Record<AccessState, 'success' | 'warning' | 'default'> = {
  linked: 'success',
  unlinked: 'warning',
  none: 'default',
};

export const accessLabel = (h: ViewerHousehold): { text: string; state: AccessState } => {
  if (h.linkedLogins > 0) {
    return {
      text: h.linkedLogins > 1 ? `${h.linkedLogins} logins` : 'Signed up',
      state: 'linked',
    };
  }
  if (h.unlinkedAccounts > 0) {
    // Deliberately not "Signed up (broken)". It names what is true — the
    // account exists, the link does not — so the owner knows the family is
    // not waiting on an invitation.
    return { text: 'Account not linked', state: 'unlinked' };
  }
  return { text: 'Not signed up', state: 'none' };
};

/**
 * The same question asked about one CHILD: can they get into the portal, and
 * whose login does it take?
 *
 * 'own'    — a login pinned to this dancer (v51). They see themselves and no
 *            sibling. One dancer on this database today.
 * 'family' — no login of their own, but somebody in the family has signed up,
 *            so a parent can see them. 70 of 395 dancers.
 * 'none'   — nobody can see this child in the portal at all. 324 of 395, and
 *            the number the studio is actually trying to move.
 *
 * A dancer with a login of their own whose parents have also signed up reads as
 * 'own': the badge answers "what does THIS CHILD have", and the family's own
 * access is one tap away on their record.
 */
export type StudentAccessState = 'own' | 'family' | 'none';

export const STUDENT_ACCESS_BADGE: Record<StudentAccessState, 'success' | 'info' | 'default'> = {
  own: 'success',
  family: 'info',
  none: 'default',
};

export const studentAccessLabel = (
  s: ViewerStudent,
): { text: string; state: StudentAccessState } => {
  if ((s.ownLogins ?? 0) > 0) return { text: 'Own login', state: 'own' };
  if ((s.householdLogins ?? 0) > 0) return { text: 'Family signed up', state: 'family' };
  return { text: 'No account', state: 'none' };
};

/**
 * Whether the counts above are actually in the response.
 *
 * Until v57 is applied every dancer comes back without them, and treating that
 * as zero would badge all 395 children "No account" — a screen confidently
 * telling the owner something false. When this is false the lists show no
 * access badge and no access filter at all, which is the honest version of
 * "this deploy cannot tell you yet".
 *
 * Checked over the whole list rather than per row: one dancer with a login is
 * enough to prove the column is there, and a studio where nobody has signed up
 * reads the same as a missing column — in which case there is nothing to show
 * either way.
 */
export const studentAccessIsKnown = (students: ViewerStudent[]): boolean =>
  students.some(s => s.ownLogins !== null || s.householdLogins !== null);

/**
 * The same honesty check for sign-up dates. Without v59 every family comes back
 * with none, and a "Newest sign-ups" sort would silently be the A–Z list again —
 * a control that does nothing. The Families tab hides it instead.
 */
export const signupDatesAreKnown = (households: ViewerHousehold[]): boolean =>
  households.some(h => h.signedUpAt !== null);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * When a family signed up, in as few words as a badge can carry.
 *
 * "today" and "yesterday" rather than a date, because the point of sorting by
 * newest is spotting who is new since you last looked, and "18 Sep" makes the
 * reader work out whether that is today. The year only when it is not this one.
 *
 * Read in the device's zone, like every other timestamp on the family record.
 */
export const signedUpLabel = (iso: string | null, today: Date): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  if (sameDay(d, today)) return 'today';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameDay(d, yesterday)) return 'yesterday';
  const short = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === today.getFullYear() ? short : `${short} ${d.getFullYear()}`;
};

/**
 * 'name' is the order the families arrive in from the database. 'newest-signup'
 * puts the most recent account first and every family with no account after
 * them, still in that order — so choosing it with no Access filter shows the
 * newcomers at the top of the whole list rather than hiding anybody.
 */
export type HouseholdSort = 'name' | 'newest-signup';

export const sortHouseholds = (
  households: ViewerHousehold[],
  sort: HouseholdSort,
): ViewerHousehold[] => {
  if (sort === 'name') return households;
  const at = (h: ViewerHousehold): number => {
    const t = h.signedUpAt ? Date.parse(h.signedUpAt) : NaN;
    return isNaN(t) ? -Infinity : t;
  };
  // A copy: the array belongs to the page and the A–Z list is read from it.
  // Array.prototype.sort is stable, so ties and the no-account tail keep the
  // name order.
  return households.slice().sort((a, b) => {
    const ta = at(a);
    const tb = at(b);
    if (ta === tb) return 0;
    return ta > tb ? -1 : 1;
  });
};

// ------------------------------------------------------------------ queries

const fail = <T,>(fallback: T) => ({ rows: fallback, error: VIEWER_LOAD_ERROR });

export const loadHouseholds = async (): Promise<{ rows: ViewerHousehold[]; error: ViewerError }> => {
  const { data, error } = await supabase
    .from('portal_admin_household_overview')
    .select('*')
    .order('display_name', { ascending: true });
  if (error) return fail<ViewerHousehold[]>([]);
  return { rows: (data ?? []).map(mapHousehold), error: null };
};

export const loadStudents = async (): Promise<{ rows: ViewerStudent[]; error: ViewerError }> => {
  const { data, error } = await supabase
    .from('portal_admin_student_overview')
    .select('*')
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });
  if (error) return fail<ViewerStudent[]>([]);
  return { rows: (data ?? []).map(mapStudent), error: null };
};

export const loadViewerClasses = async (): Promise<{ rows: ViewerClass[]; error: ViewerError }> => {
  const { data, error } = await supabase
    .from('portal_admin_class_overview')
    .select('*')
    .order('name', { ascending: true });
  if (error) return fail<ViewerClass[]>([]);
  return { rows: (data ?? []).map(mapClass), error: null };
};

/** Everyone in one class. Ordered by surname, which is how a register reads. */
export const loadClassRoster = async (
  classId: string,
): Promise<{ rows: ViewerRosterRow[]; error: ViewerError }> => {
  const { data, error } = await supabase
    .from('portal_enrollments')
    .select(
      'id, status, season, enrolled_on, dropped_on, ' +
      'portal_students!inner(id, first_name, last_name, date_of_birth, ' +
      'portal_households!inner(id, display_name, primary_email))',
    )
    .eq('class_id', classId);
  if (error) return fail<ViewerRosterRow[]>([]);

  const rows: ViewerRosterRow[] = (data ?? []).map((r: any) => {
    const s = r.portal_students;
    const h = s?.portal_households;
    return {
      enrollmentId: r.id,
      status: r.status,
      season: r.season,
      enrolledOn: r.enrolled_on,
      droppedOn: r.dropped_on,
      studentId: s?.id ?? '',
      studentName: `${s?.first_name ?? ''} ${s?.last_name ?? ''}`.trim(),
      dateOfBirth: s?.date_of_birth ?? null,
      householdId: h?.id ?? '',
      householdName: h?.display_name || h?.primary_email || '',
      householdEmail: h?.primary_email ?? '',
    };
  });

  rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
  return { rows, error: null };
};

/**
 * One family, in full: children, every class each of them is in, and the notes
 * already sent to them.
 *
 * Three requests rather than one join, because PostgREST cannot express
 * "students of this household, with their enrollments, with those classes" in a
 * single embed without the class rows repeating per enrollment — and the point
 * of this screen is to be readable, not to be clever.
 */
export const loadHouseholdDetail = async (
  householdId: string,
): Promise<{ detail: ViewerHouseholdDetail | null; error: ViewerError }> => {
  const householdRes = await supabase
    .from('portal_admin_household_overview')
    .select('*')
    .eq('id', householdId)
    .maybeSingle();
  if (householdRes.error || !householdRes.data) {
    return { detail: null, error: VIEWER_LOAD_ERROR };
  }

  const studentsRes = await supabase
    .from('portal_admin_student_overview')
    .select('*')
    .eq('household_id', householdId)
    .order('first_name', { ascending: true });
  if (studentsRes.error) return { detail: null, error: VIEWER_LOAD_ERROR };

  const students: ViewerStudent[] = (studentsRes.data ?? []).map(mapStudent);
  const studentIds = students.map(s => s.id);

  let enrollments: any[] = [];
  if (studentIds.length) {
    const enrollRes = await supabase
      .from('portal_enrollments')
      .select(
        'id, status, season, enrolled_on, dropped_on, student_id, class_id, ' +
        'portal_classes!inner(id, name, category, day_of_week, start_time, program_id)',
      )
      .in('student_id', studentIds);
    if (enrollRes.error) return { detail: null, error: VIEWER_LOAD_ERROR };
    enrollments = enrollRes.data ?? [];
  }

  const notesRes = await supabase
    .from('portal_updates')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  if (notesRes.error) return { detail: null, error: VIEWER_LOAD_ERROR };

  return {
    detail: {
      household: mapHousehold(householdRes.data),
      students: students.map(student => ({
        student,
        enrollments: enrollments
          .filter(e => e.student_id === student.id)
          .map(e => ({
            id: e.id,
            status: e.status,
            season: e.season,
            enrolledOn: e.enrolled_on,
            droppedOn: e.dropped_on,
            classId: e.class_id,
            className: e.portal_classes?.name ?? 'Unknown class',
            classCategory: e.portal_classes?.category ?? null,
            dayOfWeek: e.portal_classes?.day_of_week ?? null,
            startTime: e.portal_classes?.start_time ?? null,
            programId: e.portal_classes?.program_id ?? '',
          }))
          // Active first, then alphabetical: a dropped class still belongs on
          // the screen (it explains an attendance gap) but not at the top.
          .sort((a, b) => {
            if ((a.status === 'active') !== (b.status === 'active')) {
              return a.status === 'active' ? -1 : 1;
            }
            return a.className.localeCompare(b.className);
          }),
      })),
      notes: (notesRes.data ?? []).map(mapUpdate),
    },
    error: null,
  };
};

/**
 * One dancer, in full: their own record, their family, and every class.
 *
 * Deliberately a separate read from loadHouseholdDetail rather than a filter
 * over it. The dancer screen is reached from three places — the dancer list, a
 * class roster, the family record — and two of them do not have the household
 * loaded. Fetching one child costs three small requests; fetching their whole
 * family to show one of them costs the family's notes and every sibling's
 * enrollments as well.
 *
 * The household read is allowed to fail softly: the dancer's own record is the
 * point of the screen, and losing the family panel is better than showing an
 * error page over a child who is right there.
 */
export const loadStudentDetail = async (
  studentId: string,
): Promise<{ detail: ViewerStudentProfile | null; error: ViewerError }> => {
  const studentRes = await supabase
    .from('portal_admin_student_overview')
    .select('*')
    .eq('id', studentId)
    .maybeSingle();
  if (studentRes.error || !studentRes.data) {
    return { detail: null, error: VIEWER_LOAD_ERROR };
  }
  const student = mapStudent(studentRes.data);

  const [enrollRes, householdRes] = await Promise.all([
    supabase
      .from('portal_enrollments')
      .select(
        'id, status, season, enrolled_on, dropped_on, student_id, class_id, ' +
        'portal_classes!inner(id, name, category, day_of_week, start_time, program_id)',
      )
      .eq('student_id', studentId),
    supabase
      .from('portal_admin_household_overview')
      .select('*')
      .eq('id', student.householdId)
      .maybeSingle(),
  ]);
  if (enrollRes.error) return { detail: null, error: VIEWER_LOAD_ERROR };

  const enrollments: ViewerStudentProfile['enrollments'] = (enrollRes.data ?? []).map((e: any) => ({
    id: e.id,
    status: e.status,
    season: e.season,
    enrolledOn: e.enrolled_on,
    droppedOn: e.dropped_on,
    classId: e.class_id,
    className: e.portal_classes?.name ?? 'Unknown class',
    classCategory: e.portal_classes?.category ?? null,
    dayOfWeek: e.portal_classes?.day_of_week ?? null,
    startTime: e.portal_classes?.start_time ?? null,
    programId: e.portal_classes?.program_id ?? '',
  }));

  // Same order as the family screen: active first, then alphabetical. A dropped
  // class still belongs here — it explains an attendance gap — but not at the
  // top.
  enrollments.sort((a, b) => {
    if ((a.status === 'active') !== (b.status === 'active')) {
      return a.status === 'active' ? -1 : 1;
    }
    return a.className.localeCompare(b.className);
  });

  return {
    detail: {
      student,
      household: householdRes.data ? mapHousehold(householdRes.data) : null,
      enrollments,
    },
    error: null,
  };
};

/**
 * Send one family a note nobody else can read.
 *
 * The `household_id` is what makes it private, and it is enforced by RLS
 * (v36), not here — portal_updates_read excludes household rows from the
 * broadcast policy entirely, so a note is unreachable to anon and to every
 * signed-in parent outside the household even if this function is wrong.
 *
 * class_id is always null: a note addressed to a family is not also addressed
 * to a class, and the scope CHECK constraint refuses a row that tries to be
 * both.
 */
export const sendHouseholdNote = async (input: {
  householdId: string;
  programId: string;
  title: string;
  body: string;
  authorId: string | null;
}): Promise<{ id: string | null; error: ViewerError }> => {
  const { data, error } = await supabase
    .from('portal_updates')
    .insert({
      program_id: input.programId,
      class_id: null,
      household_id: input.householdId,
      title: input.title.trim(),
      body: input.body,
      is_pinned: false,
      is_published: true,
      published_at: new Date().toISOString(),
      author_id: input.authorId,
    })
    .select('id')
    .single();

  if (error) {
    // 42501 is RLS refusing the write — the one failure worth naming, because
    // it means "you are not a super admin", not "the network is down".
    const denied = (error as any)?.code === '42501';
    return {
      id: null,
      error: denied
        ? 'Only a super admin can send a note to one family.'
        : 'The note could not be sent. Check your connection and try again.',
    };
  }
  return { id: (data as any).id as string, error: null };
};

export const deleteHouseholdNote = async (id: string): Promise<ViewerError> => {
  const { error } = await supabase.from('portal_updates').delete().eq('id', id);
  return error ? 'The note could not be deleted.' : null;
};

// ------------------------------------------------------------------ filters

/**
 * The cuts the front desk actually asks for.
 *
 * DIVISION IS "ANY OF", NOT "IS"
 *
 * 93 of the 343 households have children in more than one division and 11 are
 * in all three, so a family is not *a* division — it overlaps a set of them.
 * Selecting All-Stars and TNT therefore means "show me anyone touching either",
 * which is the question ("who do I need to tell about the Saturday change?"),
 * not "show me families enrolled in exactly those two".
 *
 * NOT-ENROLLED IS A DIVISION IN THE PICKER
 *
 * 72 households and 70 dancers have no active enrollment at all. Without a chip
 * for them they are invisible to every division filter and reachable only by
 * clearing all of them — and they are a group worth finding on purpose, because
 * a family paying nothing is either finished or a mistake.
 *
 * NOTHING SELECTED MEANS EVERYTHING
 *
 * An empty set is not an impossible filter. A picker that returns zero rows
 * until you choose something reads as broken, and the first thing anyone does
 * with a filter row is clear it.
 */

/** The pseudo-division for "no active enrollment". Never a real category. */
export const NO_DIVISION = 'none';

/**
 * 'not-signed-up' means NO ACCOUNT, not "no membership row".
 *
 * That is the change of meaning v48 brings, and it is the point of the filter:
 * it is the chase list, and a family who has already signed up does not belong
 * on it. They are under 'not-linked', which is a much shorter list and a
 * different job.
 */
export type AccessFilter = 'any' | 'signed-up' | 'not-linked' | 'not-signed-up';

/**
 * The same cut over DANCERS, which the Families tab has had since v48 and the
 * Dancers tab never had.
 *
 * 'signed-up' is "can this child be seen in the portal at all", by their own
 * login or a parent's — the question the studio asks. 'own-login' is the much
 * smaller set with a login of their own, which is a different job (they are the
 * ones who can be told something directly). 'no-account' is the chase list.
 */
export type StudentAccessFilter = 'any' | 'signed-up' | 'own-login' | 'no-account';
export type ActivityFilter = 'any' | 'active' | 'inactive';

export interface ViewerFilters {
  /** Category slugs, plus possibly NO_DIVISION. Empty = no division filter. */
  divisions: string[];
  access: AccessFilter;
  /** The dancer list's own access cut. Separate from `access` because the two
   *  lists mean different things by the word and share this type. */
  dancerAccess: StudentAccessFilter;
  activity: ActivityFilter;
  /** 0–6, or null for any day. */
  dayOfWeek: number | null;
}

export const EMPTY_FILTERS: ViewerFilters = {
  divisions: [],
  access: 'any',
  dancerAccess: 'any',
  activity: 'any',
  dayOfWeek: null,
};

/** True when no filter is narrowing anything — used to offer a "clear" button. */
export const filtersAreEmpty = (f: ViewerFilters): boolean =>
  f.divisions.length === 0 &&
  f.access === 'any' &&
  f.dancerAccess === 'any' &&
  f.activity === 'any' &&
  f.dayOfWeek === null;

/** Add or remove one chip, since these rows are multi-select. */
export const toggleDivision = (divisions: string[], value: string): string[] =>
  divisions.indexOf(value) === -1
    ? divisions.concat([value])
    : divisions.filter(d => d !== value);

/**
 * Does a row carrying `categories` pass the division chips?
 *
 * Shared by families and dancers because the rule is identical, and having two
 * copies is how they end up disagreeing about what "Academy" means.
 */
export const matchesDivisions = (categories: string[], divisions: string[]): boolean => {
  if (divisions.length === 0) return true;
  if (divisions.indexOf(NO_DIVISION) !== -1 && categories.length === 0) return true;
  return categories.some(c => divisions.indexOf(c) !== -1);
};

export const householdPasses = (h: ViewerHousehold, query: string, f: ViewerFilters): boolean => {
  if (!householdMatches(h, query)) return false;
  if (!matchesDivisions(h.categories, f.divisions)) return false;
  if (f.access === 'signed-up' && h.linkedLogins === 0) return false;
  if (f.access === 'not-linked' && !(h.linkedLogins === 0 && h.unlinkedAccounts > 0)) return false;
  // Not "no membership row" — no ACCOUNT. A family who signed up and failed to
  // link is not waiting to be invited and must not appear on the chase list.
  if (f.access === 'not-signed-up' && (h.linkedLogins > 0 || h.unlinkedAccounts > 0)) return false;
  if (f.activity === 'active' && h.status !== 'active') return false;
  if (f.activity === 'inactive' && h.status === 'active') return false;
  return true;
};

export const studentPasses = (s: ViewerStudent, query: string, f: ViewerFilters): boolean => {
  if (!studentMatches(s, query)) return false;
  if (!matchesDivisions(s.categories, f.divisions)) return false;
  const own = s.ownLogins ?? 0;
  const family = s.householdLogins ?? 0;
  // "Signed up" means SOMEBODY can see this child — their own login or a
  // parent's. A dancer whose parent signed up is not waiting to be chased.
  if (f.dancerAccess === 'signed-up' && own === 0 && family === 0) return false;
  if (f.dancerAccess === 'own-login' && own === 0) return false;
  if (f.dancerAccess === 'no-account' && (own > 0 || family > 0)) return false;
  if (f.activity === 'active' && s.status !== 'active') return false;
  if (f.activity === 'inactive' && s.status === 'active') return false;
  return true;
};

export const classPasses = (c: ViewerClass, query: string, f: ViewerFilters): boolean => {
  if (!classMatches(c, query)) return false;
  // A class has ONE category, so it is wrapped rather than special-cased —
  // and a class with none behaves like a row with no division, same as above.
  if (!matchesDivisions(c.category ? [c.category] : [], f.divisions)) return false;
  if (f.dayOfWeek !== null && c.dayOfWeek !== f.dayOfWeek) return false;
  if (f.activity === 'active' && !c.isActive) return false;
  if (f.activity === 'inactive' && c.isActive) return false;
  return true;
};
