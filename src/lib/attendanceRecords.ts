import { supabase } from './supabase';
import { AttendanceStatus, SessionStatus } from '../types/attendance';

/**
 * The admin records view: every mark, filterable, and the source the exports
 * are built from.
 *
 * WHY THIS READS portal_attendance_detail AND NOT portal_attendance
 *
 * portal_attendance holds only the marks that were MADE. A report built from it
 * cannot show the dancer nobody marked — which is the single most important row
 * in an attendance report, and the one the studio is running the report to find.
 * The detail view is enrollments × sessions LEFT JOIN attendance, so an
 * unmarked dancer arrives with `status: null` and says so.
 *
 * It also means the exports and the parent's own screen are reading the same
 * rows, through the same denominator rules, so a printed report and a phone
 * cannot disagree about whether a Tuesday counted.
 *
 * THE COST, AND WHY THE DATE RANGE IS NOT OPTIONAL
 *
 * That view is a cross product: 1,111 enrollments against ~42 sessions each is
 * roughly 46,000 rows for a season. Every query here is bounded by a date
 * range for that reason, and every fetch is paged — see PAGE and CEILING.
 */

export type RecordError = string | null;

export interface RecordRow {
  sessionId: string;
  sessionDate: string;
  sessionStatus: SessionStatus;
  sessionNote: string | null;
  classId: string;
  className: string;
  /** Every instructor granted this class, comma-joined. Empty when none is assigned. */
  teachers: string;
  studentId: string;
  lastName: string;
  firstName: string;
  status: AttendanceStatus | null;
  countsTowardTotal: boolean;
  excludedReason: string | null;
}

export interface RecordFilters {
  from: string;
  to: string;
  classId?: string;
  teacherId?: string;
  /** Free text against the dancer's name. Applied client-side over the page. */
  student?: string;
}

export interface RecordsResult {
  rows: RecordRow[];
  error: RecordError;
  /**
   * True when the ceiling was hit and rows were left behind.
   *
   * This exists because a truncated export is worse than a refused one: it is a
   * complete-looking spreadsheet that is quietly missing children, and nobody
   * counts the rows of a report they asked the computer for. Anything that
   * renders or exports these rows MUST say so when this is set.
   */
  truncated: boolean;
}

/** PostgREST caps a response at 1000 rows, so everything here pages. */
const PAGE = 1000;
/** Roughly a season for the whole studio. Past this, narrow the filters. */
const CEILING = 20000;

const LOAD_FAILED = "Couldn't load those records. Check your connection and try again.";

export interface TeacherOption { id: string; name: string; }
export interface ClassOption { id: string; name: string; }

/** Instructors who hold at least one class, for the filter. */
export const loadTeacherOptions = async (): Promise<{ rows: TeacherOption[]; error: RecordError }> => {
  const { data, error } = await supabase
    .from('portal_class_instructors')
    .select('profile_id, profiles(id, first_name, last_name, is_active)');

  if (error) return { rows: [], error: LOAD_FAILED };

  const byId = new Map<string, TeacherOption>();
  (data ?? []).forEach((row: any) => {
    // PostgREST returns an embedded to-one as an object, but older versions and
    // some relationship shapes return a single-element array. Handle both
    // rather than crashing on whichever this project's version does today.
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!p || p.is_active === false) return;
    byId.set(p.id, { id: p.id, name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed' });
  });

  return {
    rows: Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name)),
    error: null,
  };
};

export const loadClassOptions = async (): Promise<{ rows: ClassOption[]; error: RecordError }> => {
  const { data, error } = await supabase
    .from('portal_classes')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  if (error) return { rows: [], error: LOAD_FAILED };
  return { rows: (data ?? []).map((c: any) => ({ id: c.id, name: c.name })), error: null };
};

/** class_id -> "Ada Nunez, Bo Marsh" */
const loadInstructorNames = async (classIds: string[]): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  if (classIds.length === 0) return out;

  const { data } = await supabase
    .from('portal_class_instructors')
    .select('class_id, profiles(first_name, last_name)')
    .in('class_id', classIds);

  const lists = new Map<string, string[]>();
  (data ?? []).forEach((row: any) => {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!p) return;
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
    if (!name) return;
    const list = lists.get(row.class_id) ?? [];
    list.push(name);
    lists.set(row.class_id, list);
  });

  lists.forEach((names, classId) => out.set(classId, names.sort().join(', ')));
  return out;
};

/** The class IDs one instructor holds. */
export const classIdsForTeacher = async (teacherId: string): Promise<string[]> => {
  const { data } = await supabase
    .from('portal_class_instructors')
    .select('class_id')
    .eq('profile_id', teacherId);
  return Array.from(new Set((data ?? []).map((r: any) => r.class_id)));
};

export const loadRecords = async (filters: RecordFilters): Promise<RecordsResult> => {
  let classIds: string[] | null = null;

  if (filters.teacherId) {
    classIds = await classIdsForTeacher(filters.teacherId);
    // A teacher who holds nothing has no records. That is an answer, not an
    // empty filter that would quietly widen to the whole studio.
    if (classIds.length === 0) return { rows: [], error: null, truncated: false };
  }
  if (filters.classId) {
    classIds = classIds ? classIds.filter(id => id === filters.classId) : [filters.classId];
    if (classIds.length === 0) return { rows: [], error: null, truncated: false };
  }

  const raw: any[] = [];
  let truncated = false;

  for (let offset = 0; offset < CEILING; offset += PAGE) {
    let q = supabase
      .from('portal_attendance_detail')
      .select('student_id, class_id, session_id, session_date, session_status, note, status, counts_toward_total, excluded_reason')
      .gte('session_date', filters.from)
      .lte('session_date', filters.to)
      .order('session_date', { ascending: false })
      // A stable secondary key. Without one, paging over rows that share a date
      // can return the same row twice and drop another.
      .order('student_id', { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (classIds) q = q.in('class_id', classIds);

    const { data, error } = await q;
    if (error) return { rows: [], error: LOAD_FAILED, truncated: false };

    raw.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    if (offset + PAGE >= CEILING) truncated = true;
  }

  if (raw.length === 0) return { rows: [], error: null, truncated };

  const classIdSet = Array.from(new Set(raw.map(r => r.class_id)));
  const studentIdSet = Array.from(new Set(raw.map(r => r.student_id)));

  const [classes, students, instructors] = await Promise.all([
    supabase.from('portal_classes').select('id, name').in('id', classIdSet),
    // Chunked: an `in` list of several hundred UUIDs makes a URL long enough to
    // be refused by the gateway before it ever reaches Postgres.
    fetchStudents(studentIdSet),
    loadInstructorNames(classIdSet),
  ]);

  if (classes.error || students.error) return { rows: [], error: LOAD_FAILED, truncated };

  const className = new Map<string, string>((classes.data ?? []).map((c: any) => [c.id, c.name]));
  const student = new Map<string, any>((students.data ?? []).map((s: any) => [s.id, s]));

  const needle = filters.student?.trim().toLowerCase();

  const rows: RecordRow[] = raw.flatMap(r => {
    const s = student.get(r.student_id);
    if (!s) return [];
    const first = s.first_name ?? '';
    const last = s.last_name ?? '';
    if (needle && !`${first} ${last}`.toLowerCase().includes(needle)) return [];

    return [{
      sessionId: r.session_id,
      sessionDate: r.session_date,
      sessionStatus: r.session_status,
      sessionNote: r.note,
      classId: r.class_id,
      className: className.get(r.class_id) ?? 'Unknown class',
      teachers: instructors.get(r.class_id) ?? '',
      studentId: r.student_id,
      firstName: first,
      lastName: last,
      status: r.status,
      countsTowardTotal: r.counts_toward_total,
      excludedReason: r.excluded_reason,
    }];
  });

  rows.sort((a, b) =>
    b.sessionDate.localeCompare(a.sessionDate) ||
    a.className.localeCompare(b.className) ||
    a.lastName.localeCompare(b.lastName) ||
    a.firstName.localeCompare(b.firstName));

  return { rows, error: null, truncated };
};

const STUDENT_CHUNK = 200;

const fetchStudents = async (ids: string[]): Promise<{ data: any[]; error: any }> => {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += STUDENT_CHUNK) {
    const { data, error } = await supabase
      .from('portal_students')
      .select('id, first_name, last_name')
      .in('id', ids.slice(i, i + STUDENT_CHUNK));
    if (error) return { data: [], error };
    out.push(...(data ?? []));
  }
  return { data: out, error: null };
};
