/**
 * The attendance domain, as specified in ATTENDANCE-PROFILE-BUILD.md §3.
 *
 * These types are the contract between the import pipeline, the database and
 * the profile cards. They deliberately mirror the column names of the tables
 * rather than being reshaped for the UI's convenience: when a percentage looks
 * wrong, the fix is a schema or import question, and a shape that matches the
 * tables is the one you can compare against a SQL query.
 *
 * THE RULE THAT MAKES CLASS MATCHING SAFE
 *
 * Attendance references `classId` — the stable UUID — never the match key.
 * `matchKey` exists only so the importer can decide which UUID an incoming CSV
 * row belongs to. Renaming or rescheduling a class changes its match key and
 * leaves every attendance row untouched (§3.1).
 */

/** Enrollio's vocabulary, normalised. A fifth 'makeup' status may arrive later. */
export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'late';

/**
 * Why a session does or does not count toward a denominator.
 *
 * `held` is the only status that counts. `cancelled` (holiday, snow) and
 * `closed` (studio closure) are excluded retroactively, which is the whole
 * point of tracking sessions separately from attendance: nobody is marked down
 * for a class that never happened (§3.5).
 */
export type SessionStatus = 'held' | 'cancelled' | 'closed';

export type EnrollmentStatus = 'active' | 'dropped' | 'completed';

export interface Household {
  id: string;
  externalAccountId: string | null;
  primaryEmail: string;
  displayName: string | null;
  status: 'active' | 'inactive';
}

export interface Student {
  id: string;
  householdId: string;
  externalStudentId: string | null;
  firstName: string;
  lastName: string;
  /**
   * The nickname from §5.2, shown INSIDE the household only. Admin screens,
   * rosters and attendance records always show the enrollment name.
   */
  displayName: string | null;
  status: 'active' | 'inactive';
}

/** How a portal login is attached to a household. Drives the visibility rule. */
export type MemberType = 'guardian' | 'student';

export interface HouseholdMember {
  id: string;
  householdId: string;
  profileId: string;
  memberType: MemberType;
  /** Non-null exactly when memberType is 'student' — that member sees only this child. */
  studentId: string | null;
}

/**
 * The subset of a class this feature needs. The full record lives in
 * `PortalClass`; duplicating three fields here keeps the attendance queries
 * from having to join the whole catalogue.
 */
export interface AttendanceClass {
  id: string;
  name: string;
  /** Dance discipline — 'Ballet', 'Hip Hop'. Colours the progress bar. */
  style: string | null;
  category: string | null;
  /** 0 = Sunday, matching Date.getDay(). */
  dayOfWeek: number | null;
  /** 'HH:MM:SS' from a Postgres `time` column. */
  startTime: string | null;
  endTime: string | null;
  seasonStart: string | null;
  seasonEnd: string | null;

  // --- what a parent needs in order to turn up in the right place ----------
  // All three already exist on portal_classes and have simply never reached a
  // parent's own screen. They are carried here so the "up next" card does not
  // have to join the whole catalogue for three strings.

  /** 'Studio B'. */
  location: string | null;
  /** Display name only, as on PortalClass — there is no FK to profiles yet. */
  instructorName: string | null;
  /** 'Level 2', 'Beginner'. */
  level: string | null;

  /**
   * Shoes, tights, hair — the things a child is turned away for forgetting.
   *
   * NOT YET A COLUMN. portal_classes has no field for this, so it needs one
   * (`what_to_bring text[]`) in a migration after v32. It is modelled here
   * first because the shape is the decision worth getting right: a LIST, not a
   * paragraph. A paragraph gets skimmed on a phone at 5:20pm; four short items
   * get read. Null means the studio has not filled it in, which is different
   * from an empty list meaning "nothing special needed".
   */
  whatToBring: string[] | null;
}

export interface Enrollment {
  id: string;
  studentId: string;
  classId: string;
  season: string;
  status: EnrollmentStatus;
  /** ISO date. A child who joined in March is not marked absent for January. */
  enrolledOn: string;
  droppedOn: string | null;
}

export interface ClassSession {
  id: string;
  classId: string;
  /** ISO date. */
  sessionDate: string;
  status: SessionStatus;
  source: 'import' | 'manual';
  note: string | null;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  classId: string;
  sessionId: string;
  status: AttendanceStatus;
  importBatchId: string | null;
}

/**
 * One row of `portal_attendance_summary` — the view the frontend reads so it
 * never invents its own arithmetic (§3.6).
 *
 * `counted` is the denominator AFTER cancelled sessions, pre-enrollment dates
 * and (by default) excused absences have been removed. `percent` is null, not
 * zero, when `counted` is zero: a class that has not met yet has no percentage,
 * and rendering that as 0% tells a parent their child missed everything.
 */
export interface AttendanceSummary {
  studentId: string;
  classId: string;
  enrollmentId: string;
  attended: number;
  counted: number;
  /** 0–100, rounded. Null when `counted` is 0 — never render this as 0%. */
  percent: number | null;
}

/** A session joined to this student's mark on it, for the detail view. */
export interface SessionAttendance {
  session: ClassSession;
  /** Null when the student has no row for a session — e.g. before they enrolled. */
  status: AttendanceStatus | null;
  /** False when the session is cancelled/closed or falls outside the enrollment. */
  countsTowardTotal: boolean;
  /** Why it does not count, for the detail view's marker. */
  excludedReason: 'cancelled' | 'closed' | 'before-enrollment' | 'after-drop' | 'excused' | null;
}

/** Studio-level policy (§3.6). A settings row, not a hardcoded constant. */
export interface AttendanceSettings {
  /** When true, an excused absence lowers the percentage. Default false. */
  excusedCountsAgainst: boolean;
}

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  excusedCountsAgainst: false,
};

/** The window a summary is calculated over. Season comes from the class record. */
export type AttendanceRange = 'month' | 'season' | 'all';
