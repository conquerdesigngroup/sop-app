import { supabase } from './supabase';
import { PortalUpdate } from '../types';
import { mapUpdate } from './portalMappers';

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
  /** Rows in portal_household_members: 0 = nobody has signed up and linked yet. */
  linkedLogins: number;
  enrollmentCount: number;
  /** Class categories the household's children are enrolled in — All-Stars, Academy, TNT. */
  categories: string[];
  lastNoteAt: string | null;
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
  enrollmentCount: r.enrollment_count ?? 0,
  categories: r.categories ?? [],
  lastNoteAt: r.last_note_at ?? null,
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
export const householdMatches = (h: ViewerHousehold, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    h.name.toLowerCase().indexOf(q) !== -1 ||
    h.email.toLowerCase().indexOf(q) !== -1 ||
    (h.externalAccountId ?? '').toLowerCase().indexOf(q) !== -1
  );
};

export const studentMatches = (s: ViewerStudent, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    studentFullName(s).toLowerCase().indexOf(q) !== -1 ||
    (s.displayName ?? '').toLowerCase().indexOf(q) !== -1 ||
    s.householdName.toLowerCase().indexOf(q) !== -1 ||
    s.householdEmail.toLowerCase().indexOf(q) !== -1
  );
};

export const classMatches = (c: ViewerClass, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    c.name.toLowerCase().indexOf(q) !== -1 ||
    (c.category ?? '').toLowerCase().indexOf(q) !== -1 ||
    (c.instructorName ?? '').toLowerCase().indexOf(q) !== -1 ||
    (c.externalClassId ?? '').toLowerCase().indexOf(q) !== -1
  );
};

/**
 * What to say about a family's access, in the words the owner would use.
 *
 * "Signed up" means a portal login has claimed this household. It is derived
 * from portal_household_members rather than auth.users because that is the
 * question worth answering — an account that exists but never linked sees an
 * empty portal, which is indistinguishable from having no account at all.
 */
export const accessLabel = (h: ViewerHousehold): { text: string; ok: boolean } =>
  h.linkedLogins > 0
    ? { text: h.linkedLogins > 1 ? `${h.linkedLogins} logins` : 'Signed up', ok: true }
    : { text: 'Not signed up', ok: false };

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

export type AccessFilter = 'any' | 'signed-up' | 'not-signed-up';
export type ActivityFilter = 'any' | 'active' | 'inactive';

export interface ViewerFilters {
  /** Category slugs, plus possibly NO_DIVISION. Empty = no division filter. */
  divisions: string[];
  access: AccessFilter;
  activity: ActivityFilter;
  /** 0–6, or null for any day. */
  dayOfWeek: number | null;
}

export const EMPTY_FILTERS: ViewerFilters = {
  divisions: [],
  access: 'any',
  activity: 'any',
  dayOfWeek: null,
};

/** True when no filter is narrowing anything — used to offer a "clear" button. */
export const filtersAreEmpty = (f: ViewerFilters): boolean =>
  f.divisions.length === 0 && f.access === 'any' && f.activity === 'any' && f.dayOfWeek === null;

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
  if (f.access === 'not-signed-up' && h.linkedLogins > 0) return false;
  if (f.activity === 'active' && h.status !== 'active') return false;
  if (f.activity === 'inactive' && h.status === 'active') return false;
  return true;
};

export const studentPasses = (s: ViewerStudent, query: string, f: ViewerFilters): boolean => {
  if (!studentMatches(s, query)) return false;
  if (!matchesDivisions(s.categories, f.divisions)) return false;
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
