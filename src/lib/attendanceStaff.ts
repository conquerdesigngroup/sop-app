import { supabase } from './supabase';
import { AttendanceStatus, ClassSession } from '../types/attendance';

/**
 * Every read and write the STAFF attendance screens make.
 *
 * The mirror of attendanceQueries.ts, which is the parent's half. They are kept
 * apart because they answer opposite questions off the same tables: a parent
 * asks "how has my child done", a teacher asks "who is in front of me right
 * now and who have I not marked yet". Sharing a loader between those would mean
 * one of them fetching a shape it does not want.
 *
 * SECURITY POSTURE
 *
 * The class and student IDs passed in here are for the query planner and for
 * rendering. They are NEVER the access control — that is RLS (v52):
 * `can_edit_portal_class()` and `staff_teaches_student()` decide what comes
 * back, so a tampered class ID returns zero rows rather than another teacher's
 * roster. Writes go through two SECURITY DEFINER RPCs which re-check the same
 * rules server-side; there is no INSERT policy on portal_attendance for anyone.
 *
 * NAMES
 *
 * The roster shows first_name + last_name and never `display_name`. That column
 * is the household nickname (v33: "Bug is not on the invoice") — it is readable
 * here only because it sits on a row the teacher may now see, and no staff
 * screen may render it.
 */

export type LoadError = string | null;

const LOAD_FAILED = "Couldn't load this. Check your connection and pull down to try again.";

export interface StaffClass {
  id: string;
  name: string;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  level: string | null;
  style: string | null;
}

/**
 * One class on one date, as the teacher's list shows it.
 *
 * `session` is never null: this list is BUILT from the sessions that exist on
 * the date, because a generated session is precisely the studio's claim that
 * the class meets then. A class with no session on a date does not appear,
 * which is the correct answer for "what am I teaching today".
 */
export interface ClassDay {
  klass: StaffClass;
  session: ClassSession;
  /** Roster size ON THE DATE — not today's roster. */
  expected: number;
  marked: number;
}

export interface RosterEntry {
  studentId: string;
  firstName: string;
  lastName: string;
  /** Null means nobody has said anything about this dancer for this session. */
  status: AttendanceStatus | null;
}

/** A past session that was never finished, for the backfill queue. */
export interface AttendanceGap {
  classId: string;
  sessionId: string;
  sessionDate: string;
  expected: number;
  marked: number;
  missing: number;
}

// ---------------------------------------------------------------- pure shapes

const uniq = (xs: string[]): string[] => Array.from(new Set(xs));

const toClass = (row: any): StaffClass => ({
  id: row.id,
  name: row.name,
  dayOfWeek: row.day_of_week,
  startTime: row.start_time,
  endTime: row.end_time,
  location: row.location,
  level: row.level,
  style: row.style,
});

const toSession = (row: any): ClassSession => ({
  id: row.id,
  classId: row.class_id,
  sessionDate: row.session_date,
  status: row.status,
  source: row.source,
  note: row.note,
});

/**
 * Sort a teacher's day by when the classes actually start.
 *
 * Null start times sort last rather than first. A class with no time on it is a
 * data problem, and burying it under the ones with times is better than putting
 * it at the top of the screen at 5:20pm.
 */
export const byStartTime = (a: ClassDay, b: ClassDay): number => {
  const at = a.klass.startTime;
  const bt = b.klass.startTime;
  if (at === bt) return a.klass.name.localeCompare(b.klass.name);
  if (!at) return 1;
  if (!bt) return -1;
  return at.localeCompare(bt);
};

/** Surname first, the way a paper roster reads. */
export const byName = (a: RosterEntry, b: RosterEntry): number =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);

/**
 * Join the four result sets into the list the day screen renders.
 *
 * Pure, and tested, because the counting is the part that decides whether the
 * "you have not finished this" banner is telling the truth.
 */
export const buildDay = (
  classes: any[],
  sessions: any[],
  enrollments: any[],
  marks: any[],
): ClassDay[] => {
  const classById = new Map<string, StaffClass>(classes.map(c => [c.id, toClass(c)]));

  const expected = new Map<string, number>();
  enrollments.forEach(e => {
    expected.set(e.class_id, (expected.get(e.class_id) ?? 0) + 1);
  });

  const marked = new Map<string, number>();
  marks.forEach(m => {
    marked.set(m.session_id, (marked.get(m.session_id) ?? 0) + 1);
  });

  return sessions
    .flatMap(row => {
      const klass = classById.get(row.class_id);
      // A session whose class did not come back is a class RLS did not grant.
      // Dropping it silently is right: it is not this teacher's to see.
      if (!klass) return [];
      return [{
        klass,
        session: toSession(row),
        expected: expected.get(row.class_id) ?? 0,
        marked: marked.get(row.id) ?? 0,
      }];
    })
    .sort(byStartTime);
};

/** The roster for one session, with each dancer's current mark attached. */
export const buildRoster = (
  enrollments: any[],
  students: any[],
  marks: any[],
): RosterEntry[] => {
  const studentById = new Map<string, any>(students.map(s => [s.id, s]));
  const markFor = new Map<string, AttendanceStatus>(marks.map(m => [m.student_id, m.status]));

  return enrollments
    .flatMap(e => {
      const s = studentById.get(e.student_id);
      if (!s) return [];
      return [{
        studentId: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        status: markFor.get(s.id) ?? null,
      }];
    })
    .sort(byName);
};

// -------------------------------------------------------------------- queries

/** Whose classes a screen is asking about. */
export type Scope = 'mine' | 'all';

/**
 * The class IDs to show. Null means "no filter — every class".
 *
 * Null is not a permission grant; it is the absence of a WHERE, and RLS still
 * decides what comes back. Only an admin ever gets it.
 *
 * WHY 'mine' IS NOT THE SAME QUESTION AS "ARE YOU AN ADMIN"
 *
 * The first version returned null for any admin, on the reasoning that an admin
 * may see everything. That is true and it made the screen useless for the two
 * busiest teachers in the studio: the owner and the studio manager each hold
 * sixteen classes AND the admin role, so "what am I teaching now" answered with
 * all twenty classes running that afternoon.
 *
 * Holding the role and holding the class are different facts. An admin who
 * teaches asks both questions on different days, so the screen offers both and
 * defaults to the one they are standing in a studio to ask.
 */
export const loadMyClassIds = async (
  profileId: string,
  isAdmin: boolean,
  scope: Scope = 'all',
): Promise<{ ids: string[] | null; error: LoadError }> => {
  if (isAdmin && scope === 'all') return { ids: null, error: null };

  const { data, error } = await supabase
    .from('portal_class_instructors')
    .select('class_id')
    .eq('profile_id', profileId);

  if (error) return { ids: [], error: LOAD_FAILED };
  return { ids: uniq((data ?? []).map((r: any) => r.class_id)), error: null };
};

/**
 * What this person is teaching on one date.
 *
 * Empty is a real answer — a teacher with no Wednesday classes has an empty
 * Wednesday — so it must stay distinguishable from a failed load. Hence the
 * error string rather than a bare array (see attendanceQueries' LoadError note:
 * a dropped connection that renders as "no classes" is a specific false claim).
 */
export const loadDay = async (
  date: string,
  profileId: string,
  isAdmin: boolean,
  scope: Scope = 'all',
): Promise<{ days: ClassDay[]; error: LoadError }> => {
  const { ids, error: idsError } = await loadMyClassIds(profileId, isAdmin, scope);
  if (idsError) return { days: [], error: idsError };
  if (ids && ids.length === 0) return { days: [], error: null };

  let sessionQuery = supabase
    .from('portal_class_sessions')
    .select('id, class_id, session_date, status, source, note')
    .eq('session_date', date);
  if (ids) sessionQuery = sessionQuery.in('class_id', ids);

  const { data: sessions, error: sessionError } = await sessionQuery;
  if (sessionError) return { days: [], error: LOAD_FAILED };
  if (!sessions || sessions.length === 0) return { days: [], error: null };

  const classIds = uniq(sessions.map((s: any) => s.class_id));
  const sessionIds = sessions.map((s: any) => s.id);

  const [classes, enrollments, marks] = await Promise.all([
    supabase
      .from('portal_classes')
      .select('id, name, day_of_week, start_time, end_time, location, level, style')
      .in('id', classIds),
    supabase
      .from('portal_enrollments')
      .select('student_id, class_id')
      .in('class_id', classIds)
      .lte('enrolled_on', date)
      .or(`dropped_on.is.null,dropped_on.gte.${date}`),
    supabase
      .from('portal_attendance')
      .select('student_id, session_id, status')
      .in('session_id', sessionIds),
  ]);

  if (classes.error || enrollments.error || marks.error) {
    return { days: [], error: LOAD_FAILED };
  }

  return {
    days: buildDay(classes.data ?? [], sessions, enrollments.data ?? [], marks.data ?? []),
    error: null,
  };
};

/** The dancers on one class's roster for one date, with their marks. */
export const loadRoster = async (
  classId: string,
  sessionId: string,
  date: string,
): Promise<{ rows: RosterEntry[]; error: LoadError }> => {
  const { data: enrollments, error } = await supabase
    .from('portal_enrollments')
    .select('student_id')
    .eq('class_id', classId)
    .lte('enrolled_on', date)
    .or(`dropped_on.is.null,dropped_on.gte.${date}`);

  if (error) return { rows: [], error: LOAD_FAILED };
  if (!enrollments || enrollments.length === 0) return { rows: [], error: null };

  const studentIds = uniq(enrollments.map((e: any) => e.student_id));

  const [students, marks] = await Promise.all([
    supabase.from('portal_students').select('id, first_name, last_name').in('id', studentIds),
    supabase.from('portal_attendance').select('student_id, status').eq('session_id', sessionId),
  ]);

  if (students.error || marks.error) return { rows: [], error: LOAD_FAILED };

  return {
    rows: buildRoster(enrollments, students.data ?? [], marks.data ?? []),
    error: null,
  };
};

/** Past sessions with dancers still unmarked. The backfill queue. */
export const loadGaps = async (
  classIds?: string[],
): Promise<{ rows: AttendanceGap[]; error: LoadError }> => {
  let q = supabase
    .from('portal_attendance_gaps')
    .select('class_id, session_id, session_date, expected, marked, missing')
    .order('session_date', { ascending: false });

  if (classIds) {
    if (classIds.length === 0) return { rows: [], error: null };
    q = q.in('class_id', classIds);
  }

  const { data, error } = await q;
  if (error) return { rows: [], error: LOAD_FAILED };

  return {
    rows: (data ?? []).map((r: any) => ({
      classId: r.class_id,
      sessionId: r.session_id,
      sessionDate: r.session_date,
      expected: r.expected,
      marked: r.marked,
      missing: r.missing,
    })),
    error: null,
  };
};

// --------------------------------------------------------------------- writes

export interface MarkResult {
  written: number;
  unchanged: number;
}

/**
 * Save marks for one session.
 *
 * Batched on purpose: a teacher marks a whole class, and thirty round trips on
 * studio wifi at 5:20pm is the difference between a tool and a nuisance. The
 * RPC applies them in one transaction and writes the history rows with them, so
 * a dropped connection either saves everything or nothing.
 *
 * The error is returned rather than thrown so a caller can put it beside the
 * control that failed. The messages the RPC raises are written to be shown to a
 * person as-is ("That dancer was not on this roster on 2026-09-02").
 */
export const markAttendance = async (
  sessionId: string,
  marks: { studentId: string; status: AttendanceStatus }[],
): Promise<{ result: MarkResult | null; error: LoadError }> => {
  if (marks.length === 0) return { result: { written: 0, unchanged: 0 }, error: null };

  const { data, error } = await supabase.rpc('staff_mark_attendance', {
    p_session_id: sessionId,
    p_marks: marks.map(m => ({ student_id: m.studentId, status: m.status })),
  });

  if (error) return { result: null, error: error.message || LOAD_FAILED };
  return { result: { written: data?.written ?? 0, unchanged: data?.unchanged ?? 0 }, error: null };
};

/**
 * Say the class did not meet — or take that back.
 *
 * Marking a session cancelled or closed removes it from every dancer's
 * denominator retroactively, and keeps any marks already taken. That is a large
 * effect for one tap, which is why the screen confirms it and why the RPC
 * reports how many marks it kept so the confirmation can say so.
 */
export const setSessionStatus = async (
  sessionId: string,
  status: ClassSession['status'],
  note?: string,
): Promise<{ marksKept: number | null; error: LoadError }> => {
  const { data, error } = await supabase.rpc('staff_set_session_status', {
    p_session_id: sessionId,
    p_status: status,
    p_note: note ?? null,
  });

  if (error) return { marksKept: null, error: error.message || LOAD_FAILED };
  return { marksKept: data?.marks_kept ?? 0, error: null };
};
