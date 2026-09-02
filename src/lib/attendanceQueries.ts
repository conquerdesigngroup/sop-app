import { supabase } from './supabase';
import {
  AttendanceClass,
  AttendanceRange,
  AttendanceSettings,
  AttendanceSummary,
  DEFAULT_ATTENDANCE_SETTINGS,
  Enrollment,
  MemberType,
  SessionAttendance,
  Student,
} from '../types/attendance';
import { clipToRange, sessionBreakdown, summarise } from './attendanceSummary';
import { UpcomingClass, buildUpcoming, nextPerClass } from './upcomingClasses';
import { PortalDocument, PortalUpdate } from '../types';
import {
  FIXTURE_ATTENDANCE,
  FIXTURE_CLASSES,
  FIXTURE_DOCUMENTS,
  FIXTURE_UPDATES,
  FIXTURE_ENROLLMENTS,
  FIXTURE_MEMBERS,
  FIXTURE_SESSIONS,
  FIXTURE_STUDENTS,
  FIXTURE_TODAY,
  FixtureScenario,
} from './attendanceFixture';

/**
 * Every read the attendance cards make, behind one interface (§6.3).
 *
 * SECURITY POSTURE
 *
 * The student and household IDs passed in here are a convenience for the query
 * planner and for rendering — they are NEVER the access control. That is RLS:
 * `can_see_student()` and `is_household_member()` decide what comes back, so a
 * tampered student ID in a request returns zero rows rather than another
 * family's child. The frontend filtering below is what makes the switcher work,
 * not what makes it safe.
 *
 * TWO SOURCES, ONE SHAPE
 *
 * `source: 'fixture'` resolves everything from the in-repo seed so the cards can
 * be designed and reviewed before v32 is applied. `source: 'live'` reads the
 * real tables. Both return identical shapes, so no component knows which it got.
 *
 * The live path is written against the table and view names in §3, and is not
 * exercised until that migration lands — see LIVE PATH below.
 */

export interface ClassProgress {
  enrollment: Enrollment;
  klass: AttendanceClass;
  summary: AttendanceSummary;
}

/**
 * Why a load produced nothing — null means it genuinely IS empty.
 *
 * THE DISTINCTION THIS TYPE EXISTS TO FORCE
 *
 * Every loader here used to collapse a failed request into an empty result,
 * and every card renders empty as a calm, confident sentence: "No dancers
 * linked yet", "No classes this season", "This class hasn't met yet". So a
 * dropped connection told a parent their child was not enrolled. That is worse
 * than an error screen and worse than a blank one, because it is a specific
 * false claim about their kid that they have no reason to doubt.
 *
 * Empty and broken are different states and must stay different all the way up
 * to the card. A string here is a message fit to show a parent.
 */
export type LoadError = string | null;

export const GENERIC_LOAD_ERROR = 'We could not load this. Check your connection and try again.';

export interface AttendanceView {
  /** Everyone this login may see. One entry for a student member. */
  students: Student[];
  memberType: MemberType;
  /** Active enrollments, most relevant first. */
  current: ClassProgress[];
  /** Dropped or completed. Reachable, visually separated (§6.2). */
  past: ClassProgress[];
  error: LoadError;
}

export type AttendanceSource =
  | { source: 'fixture'; scenario: FixtureScenario }
  | { source: 'live' };

const EMPTY_VIEW = (memberType: MemberType, error: LoadError = null): AttendanceView => ({
  students: [],
  memberType,
  current: [],
  past: [],
  error,
});

// ---------------------------------------------------------------------------
// Fixture path
// ---------------------------------------------------------------------------

const fixtureStudentsFor = (scenario: FixtureScenario): { students: Student[]; memberType: MemberType } => {
  switch (scenario) {
    case 'guardian':
      return {
        students: FIXTURE_STUDENTS.filter(s => s.householdId === 'hh-alvarez'),
        memberType: 'guardian',
      };
    case 'student': {
      // A student member is pinned to exactly one student_id by the members
      // table. Deriving it from the membership rather than hardcoding it keeps
      // this honest about where the constraint actually lives.
      const member = FIXTURE_MEMBERS.find(m => m.memberType === 'student');
      return {
        students: FIXTURE_STUDENTS.filter(s => s.id === member?.studentId),
        memberType: 'student',
      };
    }
    case 'no-enrollments':
      return { students: [FIXTURE_STUDENTS[0]], memberType: 'guardian' };
    case 'no-students':
    case 'fresh-studio':
    default:
      return { students: [], memberType: 'guardian' };
  }
};

const buildProgress = (
  enrollments: Enrollment[],
  range: AttendanceRange,
  settings: AttendanceSettings,
  today: Date,
): ClassProgress[] =>
  enrollments.flatMap(enrollment => {
    const klass = FIXTURE_CLASSES.find(c => c.id === enrollment.classId);
    if (!klass) return [];

    const sessions = clipToRange(
      FIXTURE_SESSIONS.filter(s => s.classId === klass.id),
      range,
      klass.seasonStart,
      klass.seasonEnd,
      today,
    );
    const attendance = FIXTURE_ATTENDANCE.filter(
      a => a.studentId === enrollment.studentId && a.classId === klass.id,
    );

    const breakdown = sessionBreakdown(sessions, attendance, enrollment, settings);
    const { attended, counted, percent } = summarise(breakdown);

    return [{
      enrollment,
      klass,
      summary: {
        studentId: enrollment.studentId,
        classId: klass.id,
        enrollmentId: enrollment.id,
        attended,
        counted,
        percent,
      },
    }];
  });

const loadFixtureDetail = (
  studentId: string,
  classId: string,
  settings: AttendanceSettings,
): SessionAttendance[] => {
  const enrollment = FIXTURE_ENROLLMENTS.find(e => e.studentId === studentId && e.classId === classId);
  if (!enrollment) return [];

  return sessionBreakdown(
    FIXTURE_SESSIONS.filter(s => s.classId === classId),
    FIXTURE_ATTENDANCE.filter(a => a.studentId === studentId && a.classId === classId),
    enrollment,
    settings,
  );
};

// ---------------------------------------------------------------------------
// LIVE PATH
//
// Written against the names in §3 and NOT yet reachable: the v32 migration that
// creates portal_students, portal_enrollments and portal_attendance_summary has
// not been applied. `attendanceSource()` therefore returns the fixture until
// REACT_APP_ATTENDANCE_LIVE is set, which is deliberate — a card that silently
// renders zeros against missing tables looks exactly like a child who attended
// nothing, and that is the worst possible failure for this feature.
// ---------------------------------------------------------------------------

const mapStudent = (row: any): Student => ({
  id: row.id,
  householdId: row.household_id,
  externalStudentId: row.external_student_id,
  firstName: row.first_name,
  lastName: row.last_name,
  displayName: row.display_name,
  status: row.status,
});

const mapProgress = (row: any): ClassProgress => ({
  enrollment: {
    id: row.enrollment_id,
    studentId: row.student_id,
    classId: row.class_id,
    season: row.season,
    status: row.status,
    enrolledOn: row.enrolled_on,
    droppedOn: row.dropped_on,
  },
  klass: {
    id: row.class_id,
    name: row.class_name,
    style: row.class_style,
    category: row.class_category,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    seasonStart: row.season_start,
    seasonEnd: row.season_end,
    location: row.class_location,
    instructorName: row.instructor_name,
    level: row.class_level,
    whatToBring: row.what_to_bring,
  },
  summary: {
    studentId: row.student_id,
    classId: row.class_id,
    enrollmentId: row.enrollment_id,
    attended: row.attended,
    counted: row.counted,
    percent: row.counted === 0 ? null : row.percent,
  },
});

/**
 * The columns portal_my_enrollments exposes. Named once.
 *
 * NOT portal_attendance_summary. That view aggregates SESSIONS, so before the
 * first attendance import it returns zero rows for an enrolled child — and the
 * card then said "No classes this season", which is false. Enrollment and
 * attendance are different facts with different lifetimes; this view carries
 * the enrollment and LEFT JOINs the numbers.
 */
const ENROLLMENT_COLUMNS =
  'student_id, class_id, enrollment_id, range, attended, counted, percent, status, season, '
  + 'enrolled_on, dropped_on, class_name, class_style, class_category, day_of_week, '
  + 'start_time, end_time, season_start, season_end, class_location, instructor_name, '
  + 'class_level, what_to_bring, cancelled_dates';

const loadLiveView = async (
  studentId: string | null,
  range: AttendanceRange,
): Promise<AttendanceView> => {
  // No household filter in any of these. RLS scopes them; adding a client-side
  // household_id would imply the filter is what protects the data.
  //
  // PARALLEL, NOT SEQUENTIAL. These two queries do not depend on each other,
  // and awaiting them in turn simply added a round trip of latency to every
  // load — which on a phone at the studio is the difference between the page
  // appearing and the page appearing to be broken.
  const [studentsRes, memberRes] = await Promise.all([
    supabase
      .from('portal_students')
      .select('id, household_id, external_student_id, first_name, last_name, display_name, status')
      .eq('status', 'active')
      .order('first_name'),
    supabase
      .from('portal_household_members')
      .select('member_type, student_id')
      .maybeSingle(),
  ]);

  // An error is NOT an empty household. Saying "no dancers linked yet" because
  // the network dropped is a false statement about someone's child.
  if (studentsRes.error) return EMPTY_VIEW('guardian', GENERIC_LOAD_ERROR);

  const mapped: Student[] = (studentsRes.data ?? []).map(mapStudent);
  const memberType = (memberRes.data?.member_type as MemberType) ?? 'guardian';
  if (!mapped.length) return EMPTY_VIEW(memberType);

  const target = mapped.find(s => s.id === studentId) ?? mapped[0];

  const { data: rows, error } = await supabase
    .from('portal_my_enrollments')
    .select(ENROLLMENT_COLUMNS)
    .eq('student_id', target.id)
    .eq('range', range);

  if (error) {
    return { students: mapped, memberType, current: [], past: [], error: GENERIC_LOAD_ERROR };
  }

  const progress: ClassProgress[] = (rows ?? []).map(mapProgress);

  return {
    students: mapped,
    memberType,
    current: progress.filter(p => p.enrollment.status === 'active'),
    past: progress.filter(p => p.enrollment.status !== 'active'),
    error: null,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Flip to the real tables only once v32 is applied and seeded. */
export const ATTENDANCE_LIVE = process.env.REACT_APP_ATTENDANCE_LIVE === 'true';

// loadAttendanceView was removed here on purpose.
//
// It fetched the roster AND one student's progress in a single call, which is
// why AttendanceCard used to re-query portal_students and
// portal_household_members that the rest of the page had already loaded. The
// roster now comes from useHousehold and the per-student rows from
// loadStudentProgress. Reintroducing a combined loader reintroduces the
// duplicate fetch, so it is documented as deleted rather than left lying
// around to be found and reused.

export const loadAttendanceDetail = async (
  src: AttendanceSource,
  studentId: string,
  classId: string,
  settings: AttendanceSettings = DEFAULT_ATTENDANCE_SETTINGS,
): Promise<{ rows: SessionAttendance[]; error: LoadError }> => {
  if (src.source === 'fixture') {
    return { rows: loadFixtureDetail(studentId, classId, settings), error: null };
  }

  const { data, error } = await supabase
    .from('portal_attendance_detail')
    .select('session_id, session_date, session_status, note, status, counts_toward_total, excluded_reason')
    .eq('student_id', studentId)
    .eq('class_id', classId)
    .order('session_date');

  // Empty means the class has not met. An error means we do not know, and the
  // modal must say so rather than claim the class has not met.
  if (error) return { rows: [], error: GENERIC_LOAD_ERROR };

  return {
    rows: (data ?? []).map((row: any) => ({
      session: {
        id: row.session_id,
        classId,
        sessionDate: row.session_date,
        status: row.session_status,
        source: 'import',
        note: row.note,
      },
      status: row.status,
      countsTowardTotal: row.counts_toward_total,
      excludedReason: row.excluded_reason,
    })),
    error: null,
  };
};

/**
 * One student's classes for one range — WITHOUT re-reading the household.
 *
 * DEFECT THIS FIXES
 *
 * AttendanceCard used to call loadAttendanceView, which re-queried
 * portal_students and portal_household_members on every render and every range
 * toggle — data useHousehold had already fetched and cached for the rest of the
 * page. Two of the three queries were pure duplication. The card now takes the
 * roster from the shared cache and asks only for the part that is genuinely its
 * own: this student, this range.
 */
export const loadStudentProgress = async (
  src: AttendanceSource,
  studentId: string,
  range: AttendanceRange,
  settings: AttendanceSettings = DEFAULT_ATTENDANCE_SETTINGS,
): Promise<{ current: ClassProgress[]; past: ClassProgress[]; error: LoadError }> => {
  if (src.source === 'fixture') {
    const mine = FIXTURE_ENROLLMENTS.filter(e => e.studentId === studentId);
    return {
      current: buildProgress(mine.filter(e => e.status === 'active'), range, settings, FIXTURE_TODAY),
      past: buildProgress(mine.filter(e => e.status !== 'active'), 'all', settings, FIXTURE_TODAY),
      error: null,
    };
  }

  const { data, error } = await supabase
    .from('portal_my_enrollments')
    .select(ENROLLMENT_COLUMNS)
    .eq('student_id', studentId)
    .eq('range', range);

  if (error) return { current: [], past: [], error: GENERIC_LOAD_ERROR };

  const progress: ClassProgress[] = (data ?? []).map(mapProgress);
  return {
    current: progress.filter(p => p.enrollment.status === 'active'),
    past: progress.filter(p => p.enrollment.status !== 'active'),
    error: null,
  };
};

/** Display name inside the household; enrollment name everywhere else (§5.3). */
export const studentLabel = (s: Student): string => s.displayName?.trim() || s.firstName;

export const RANGE_LABELS: { value: AttendanceRange; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'season', label: 'This season' },
  { value: 'all', label: 'All time' },
];

export type { AttendanceSummary };

// ---------------------------------------------------------------------------
// The household-wide reads
//
// The attendance card looks at ONE child at a time, because a percentage is a
// per-child number. Everything added after it — what is on tonight, which
// updates apply, which documents are ours — is a per-HOUSEHOLD question, and
// answering it one child at a time is how you end up with three cards that each
// know a third of the answer. So these load the whole household once.
// ---------------------------------------------------------------------------

/** ES5 target: spreading a Set is not available, and this reads fine anyway. */
const unique = (values: string[]): string[] => values.filter((v, i) => values.indexOf(v) === i);

export interface HouseholdSummary {
  students: Student[];
  memberType: MemberType;
  /** Active enrollments per child, in the order the switcher shows them. */
  perStudent: { student: Student; current: ClassProgress[] }[];
  /** The next few classes across every child, soonest first. */
  upcoming: UpcomingClass[];
  /**
   * One row per active enrollment — the next time THAT class meets.
   *
   * Separate from `upcoming`, which is capped at what fits on a schedule card.
   * The calendar card has to offer every class, including the Saturday one a
   * parent is looking at on a Tuesday.
   */
  series: UpcomingClass[];
  /** Dates a class is known not to meet, for calendar EXDATEs. */
  cancelledByClass: Record<string, string[]>;
  error: LoadError;
  /** Which classes this household is in — the filter for updates and files. */
  enrolledClassIds: string[];
}

const EMPTY_HOUSEHOLD: HouseholdSummary = {
  students: [],
  memberType: 'guardian',
  perStudent: [],
  upcoming: [],
  series: [],
  cancelledByClass: {},
  enrolledClassIds: [],
  error: null,
};

const loadFixtureHousehold = (
  scenario: FixtureScenario,
  settings: AttendanceSettings,
): HouseholdSummary => {
  const { students, memberType } = fixtureStudentsFor(scenario);
  if (!students.length) return { ...EMPTY_HOUSEHOLD, memberType };

  if (scenario === 'no-enrollments' || scenario === 'fresh-studio') {
    return {
      ...EMPTY_HOUSEHOLD,
      students,
      memberType,
      perStudent: students.map(student => ({ student, current: [] })),
    };
  }

  const perStudent = students.map(student => ({
    student,
    current: buildProgress(
      FIXTURE_ENROLLMENTS.filter(e => e.studentId === student.id && e.status === 'active'),
      'all',
      settings,
      FIXTURE_TODAY,
    ),
  }));

  const entries = perStudent.flatMap(({ student, current }) =>
    current.map(p => ({
      student,
      klass: p.klass,
      enrollment: p.enrollment,
      sessions: FIXTURE_SESSIONS.filter(sn => sn.classId === p.klass.id),
    })),
  );

  const cancelledByClass: Record<string, string[]> = {};
  entries.forEach(({ klass, sessions }) => {
    cancelledByClass[klass.id] = sessions.filter(sn => sn.status !== 'held').map(sn => sn.sessionDate);
  });

  return {
    students,
    memberType,
    perStudent,
    upcoming: buildUpcoming(entries, FIXTURE_TODAY),
    series: nextPerClass(entries, FIXTURE_TODAY),
    cancelledByClass,
    error: null,
    enrolledClassIds: unique(perStudent.flatMap(p => p.current.map(c => c.klass.id))),
  };
};

/**
 * Claim the household carrying this login's own email.
 *
 * Every RLS policy in v33 pivots on portal_household_members, and until v35
 * nothing could write a row to it — so a signed-in parent read zero students
 * and saw "No dancers linked yet" regardless of how much correct data sat
 * behind it. The RPC is security-definer and takes no arguments: it can only
 * ever link the caller to the household whose primary_email matches the email
 * on their own JWT, so a client cannot choose a family to join.
 *
 * Idempotent, and attempted once per page load rather than per read.
 */
let linkAttempt: Promise<void> | null = null;

const ensureHouseholdLink = (): Promise<void> => {
  if (linkAttempt === null) {
    linkAttempt = supabase
      .rpc('link_household_member')
      .then(() => undefined)
      // A parent whose family was never imported matches nothing. That is an
      // honest outcome, not an error, and must not break the page.
      .catch(() => undefined);
  }
  return linkAttempt as Promise<void>;
};

export const loadHouseholdSummary = async (
  src: AttendanceSource,
  settings: AttendanceSettings = DEFAULT_ATTENDANCE_SETTINGS,
): Promise<HouseholdSummary> => {
  if (src.source === 'fixture') return loadFixtureHousehold(src.scenario, settings);

  await ensureHouseholdLink();

  // RLS scopes every read below to this household, so there is no household
  // filter here by design (§6.3).
  const [studentsRes, memberRes] = await Promise.all([
    supabase
      .from('portal_students')
      .select('id, household_id, external_student_id, first_name, last_name, display_name, status')
      .eq('status', 'active')
      .order('first_name'),
    supabase
      .from('portal_household_members')
      .select('member_type, student_id')
      .maybeSingle(),
  ]);

  if (studentsRes.error) return { ...EMPTY_HOUSEHOLD, error: GENERIC_LOAD_ERROR };

  const students: Student[] = (studentsRes.data ?? []).map(mapStudent);
  const memberType = (memberRes.data?.member_type as MemberType) ?? 'guardian';
  if (!students.length) return { ...EMPTY_HOUSEHOLD, memberType };

  // 'all' because the schedule is not a function of the range filter — a
  // Saturday class must be addable to a calendar on a Tuesday, and "up next"
  // must not vanish because the user is looking at "This month".
  const { data, error } = await supabase
    .from('portal_my_enrollments')
    .select(ENROLLMENT_COLUMNS)
    .eq('range', 'all');

  if (error) return { ...EMPTY_HOUSEHOLD, students, memberType, error: GENERIC_LOAD_ERROR };

  const rows: any[] = data ?? [];
  const byId = new Map(students.map(s => [s.id, s]));
  const progress: ClassProgress[] = rows.map(mapProgress);

  const perStudent = students.map(student => ({
    student,
    current: progress.filter(p => p.enrollment.studentId === student.id
                              && p.enrollment.status === 'active'),
  }));

  // The projection needs the same shape the fixture path builds: a student, a
  // class, an enrollment, and the sessions that are known NOT to be held. The
  // view carries those dates as an array so this costs no extra round trip.
  const cancelledByClass: Record<string, string[]> = {};
  const entries = rows.flatMap((row, i) => {
    const student = byId.get(row.student_id);
    const p = progress[i];
    if (!student || p.enrollment.status !== 'active') return [];
    const dates: string[] = row.cancelled_dates ?? [];
    cancelledByClass[p.klass.id] = dates;
    return [{
      student,
      klass: p.klass,
      enrollment: p.enrollment,
      sessions: dates.map(d => ({
        id: `x-${p.klass.id}-${d}`,
        classId: p.klass.id,
        sessionDate: d,
        // Only the fact that it is NOT 'held' matters to blockedDates().
        status: 'cancelled' as const,
        source: 'manual' as const,
        note: null,
      })),
    }];
  });

  // Real clock on live data. The fixture pins a date so the demo stays stable;
  // a real family's "tonight" is tonight.
  const now = new Date();

  return {
    students,
    memberType,
    perStudent,
    upcoming: buildUpcoming(entries, now),
    series: nextPerClass(entries, now),
    cancelledByClass,
    enrolledClassIds: unique(perStudent.flatMap(p => p.current.map(c => c.klass.id))),
    error: null,
  };
};

/**
 * Studio-wide notices plus the ones for classes this household is actually in.
 *
 * A null `classId` is studio-wide and reaches everyone. A set one reaches only
 * the enrolled. Today a Ballet parent reads Hip Hop announcements and learns to
 * skim past all of it, which is how the genuinely important notice gets missed.
 */
export const loadMyUpdates = async (
  src: AttendanceSource,
  enrolledClassIds: string[],
): Promise<{ rows: PortalUpdate[]; error: LoadError }> => {
  const mine = (rows: PortalUpdate[]) => rows
    .filter(u => u.isPublished)
    .filter(u => u.classId === null || enrolledClassIds.includes(u.classId))
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt);
    });

  if (src.source === 'fixture') return { rows: mine(FIXTURE_UPDATES), error: null };

  const { data, error } = await supabase
    .from('portal_updates')
    .select('*')
    .eq('is_published', true)
    .order('published_at', { ascending: false });

  if (error) return { rows: [], error: GENERIC_LOAD_ERROR };

  return { rows: mine((data ?? []).map((row: any) => ({
    id: row.id,
    programId: row.program_id,
    classId: row.class_id,
    // RLS decides whether this row is even returned; the field is carried so
    // the card can mark a note as addressed to this family alone.
    householdId: row.household_id ?? null,
    title: row.title,
    body: row.body,
    isPinned: row.is_pinned,
    isPublished: row.is_published,
    publishedAt: row.published_at,
    authorId: row.author_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))), error: null };
};

/** Same filter, applied to files. */
export const loadMyDocuments = async (
  src: AttendanceSource,
  enrolledClassIds: string[],
): Promise<{ rows: PortalDocument[]; error: LoadError }> => {
  const mine = (rows: PortalDocument[]) => rows
    .filter(d => d.isPublished)
    .filter(d => d.classId === null || enrolledClassIds.includes(d.classId))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (src.source === 'fixture') return { rows: mine(FIXTURE_DOCUMENTS), error: null };

  const { data, error } = await supabase
    .from('portal_documents')
    .select('*')
    .eq('is_published', true)
    .order('sort_order');

  if (error) return { rows: [], error: GENERIC_LOAD_ERROR };

  return { rows: mine((data ?? []).map((row: any) => ({
    id: row.id,
    programId: row.program_id,
    classId: row.class_id,
    title: row.title,
    description: row.description ?? '',
    category: row.category,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    createdAt: row.created_at,
  }))), error: null };
};

/** Overall attendance for one child across every active class. */
export const overallPercent = (current: ClassProgress[]): { attended: number; counted: number; percent: number | null } => {
  const attended = current.reduce((n, p) => n + p.summary.attended, 0);
  const counted = current.reduce((n, p) => n + p.summary.counted, 0);
  return { attended, counted, percent: counted === 0 ? null : Math.round((attended / counted) * 100) };
};
