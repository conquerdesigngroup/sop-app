import { PortalDocument, PortalUpdate } from '../types';
import {
  AttendanceClass,
  AttendanceRecord,
  ClassSession,
  Enrollment,
  Household,
  HouseholdMember,
  Student,
} from '../types/attendance';

/**
 * The seed fixture from §3.8, as TypeScript.
 *
 * WHY IT IS A .ts FILE AND NOT ONLY SQL
 *
 * §3.8 asks for `supabase/seed/attendance_demo.sql` and that is still the right
 * artefact for testing RLS against a real database. But the attendance cards
 * (W4) have to be designed, looked at and argued about before the v32 tables
 * exist, and a designer cannot iterate against a migration that has not been
 * applied. This module is the same fixture in a form the app can render with no
 * backend at all. The SQL seed is generated from these constants, so the two
 * cannot drift.
 *
 * NO SESSION IS IN THE FUTURE
 *
 * §3.5 derives sessions from the import: a session exists because a batch
 * contained an attendance row for that date. Nothing has been imported for a
 * class that has not met yet, so a correct fixture has no future sessions —
 * the season below is deliberately *in progress*, with eleven of its twelve
 * weeks imported. This matters: if future sessions existed they would land in
 * every denominator and every child in the studio would look like they were
 * missing classes they have not had yet.
 *
 * EVERY NUMBER HERE IS HAND-CHECKABLE
 *
 * The expected percentage for each enrollment is written next to it. W4's
 * acceptance checklist asks that the UI match a hand calculation; these
 * comments are that calculation.
 */

/** The fixture's "today". The season is mid-flight relative to this date. */
export const FIXTURE_TODAY = new Date('2026-08-30T12:00:00');

const SEASON = 'Summer 2026';
const SEASON_START = '2026-06-15';
const SEASON_END = '2026-09-06';

// --- classes ---------------------------------------------------------------
// Three styles, so the progress bars have something to differentiate, plus a
// past-season class for the dropped enrollment.

export const FIXTURE_CLASSES: AttendanceClass[] = [
  {
    id: 'cls-ballet',
    name: 'Junior Ballet',
    style: 'Ballet',
    category: 'academy',
    dayOfWeek: 2,
    startTime: '16:30:00',
    endTime: '17:30:00',
    seasonStart: SEASON_START,
    seasonEnd: SEASON_END,
    location: 'Studio A',
    instructorName: 'Jess Moreau',
    level: 'Level 2',
    whatToBring: ['Pink ballet shoes', 'Black leotard', 'Hair in a bun'],
  },
  {
    id: 'cls-hiphop',
    name: 'Hip Hop Crew',
    style: 'Hip Hop',
    category: 'allstars',
    dayOfWeek: 4,
    startTime: '17:45:00',
    endTime: '18:45:00',
    seasonStart: SEASON_START,
    seasonEnd: SEASON_END,
    location: 'Studio B',
    instructorName: 'Devon Clarke',
    level: 'Crew',
    whatToBring: ['Clean indoor trainers', 'Water bottle'],
  },
  {
    // The "not started yet" case: enrolled, on the schedule, has never met.
    id: 'cls-turns',
    name: 'Turns & Jumps',
    style: 'Technique',
    category: 'academy',
    dayOfWeek: 6,
    startTime: '10:00:00',
    endTime: '10:45:00',
    seasonStart: SEASON_START,
    seasonEnd: SEASON_END,
    location: 'Studio A',
    instructorName: 'Jess Moreau',
    level: null,
    // Null, not []: the studio has not filled this in. The card stays silent
    // rather than claiming nothing is needed.
    whatToBring: null,
  },
  {
    id: 'cls-contemporary',
    name: 'Contemporary Foundations',
    style: 'Contemporary',
    category: 'academy',
    dayOfWeek: 1,
    startTime: '17:00:00',
    endTime: '18:00:00',
    seasonStart: '2026-01-12',
    seasonEnd: '2026-04-06',
    location: 'Studio C',
    instructorName: 'Priya Raman',
    level: 'Foundation',
    whatToBring: ['Bare feet or foot undies'],
  },
];

// --- sessions --------------------------------------------------------------

const session = (
  classId: string,
  date: string,
  status: ClassSession['status'] = 'held',
  note: string | null = null,
): ClassSession => ({
  id: `ses-${classId}-${date}`,
  classId,
  sessionDate: date,
  status,
  source: 'import',
  note,
});

/** Tuesdays. Eleven imported of the season's twelve; one is a studio closure. */
const BALLET_DATES = [
  '2026-06-16', '2026-06-23', '2026-06-30', '2026-07-07', '2026-07-14', '2026-07-21',
  '2026-07-28', '2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25',
];

/** Thursdays. All eleven held. */
const HIPHOP_DATES = [
  '2026-06-18', '2026-06-25', '2026-07-02', '2026-07-09', '2026-07-16', '2026-07-23',
  '2026-07-30', '2026-08-06', '2026-08-13', '2026-08-20', '2026-08-27',
];

/** Mondays of the past season. */
const CONTEMPORARY_DATES = [
  '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02',
  '2026-02-09', '2026-02-16', '2026-02-23', '2026-03-02',
];

export const FIXTURE_SESSIONS: ClassSession[] = [
  ...BALLET_DATES.map(d =>
    d === '2026-08-04'
      // The cancelled session. It must vanish from every denominator without
      // lowering anybody's percentage — W1.4 and W4.2.
      ? session('cls-ballet', d, 'cancelled', 'Studio closed — annual maintenance')
      : session('cls-ballet', d),
  ),
  ...HIPHOP_DATES.map(d => session('cls-hiphop', d)),
  ...CONTEMPORARY_DATES.map(d => session('cls-contemporary', d)),
  // cls-turns has no sessions at all. That is the point of it.
];

// --- households, students, members -----------------------------------------
// Two households, because "returns nothing outside the household" is not
// testable with one.

export const FIXTURE_HOUSEHOLDS: Household[] = [
  {
    id: 'hh-alvarez',
    externalAccountId: 'ENR-4471',
    primaryEmail: 'alvarez.family@example.com',
    displayName: 'Alvarez',
    status: 'active',
  },
  {
    id: 'hh-okonkwo',
    externalAccountId: 'ENR-5192',
    primaryEmail: 'okonkwo.family@example.com',
    displayName: 'Okonkwo',
    status: 'active',
  },
];

export const FIXTURE_STUDENTS: Student[] = [
  {
    id: 'stu-maya',
    householdId: 'hh-alvarez',
    externalStudentId: 'ENR-S-8801',
    firstName: 'Maya',
    lastName: 'Alvarez',
    displayName: null,
    status: 'active',
  },
  {
    id: 'stu-eli',
    householdId: 'hh-alvarez',
    externalStudentId: 'ENR-S-8802',
    firstName: 'Elias',
    lastName: 'Alvarez',
    // The §5.3 nickname: shown inside the household, never on a roster.
    displayName: 'Eli',
    status: 'active',
  },
  {
    id: 'stu-ada',
    householdId: 'hh-okonkwo',
    externalStudentId: 'ENR-S-9014',
    firstName: 'Ada',
    lastName: 'Okonkwo',
    displayName: null,
    status: 'active',
  },
];

export const FIXTURE_MEMBERS: HouseholdMember[] = [
  {
    id: 'mem-guardian-alvarez',
    householdId: 'hh-alvarez',
    profileId: 'prof-guardian',
    memberType: 'guardian',
    studentId: null,
  },
  {
    // A student's own login. Sees only herself — no switcher, no sibling.
    id: 'mem-student-maya',
    householdId: 'hh-alvarez',
    profileId: 'prof-student',
    memberType: 'student',
    studentId: 'stu-maya',
  },
  {
    id: 'mem-guardian-okonkwo',
    householdId: 'hh-okonkwo',
    profileId: 'prof-other',
    memberType: 'guardian',
    studentId: null,
  },
];

// --- enrollments -----------------------------------------------------------

export const FIXTURE_ENROLLMENTS: Enrollment[] = [
  {
    id: 'enr-maya-ballet',
    studentId: 'stu-maya',
    classId: 'cls-ballet',
    season: SEASON,
    status: 'active',
    enrolledOn: SEASON_START,
    droppedOn: null,
  },
  {
    id: 'enr-maya-hiphop',
    studentId: 'stu-maya',
    classId: 'cls-hiphop',
    season: SEASON,
    status: 'active',
    enrolledOn: SEASON_START,
    droppedOn: null,
  },
  {
    // The mid-season enrollment — W1.3 and W4.3. Joined at week 6, so the five
    // sessions before this date must not appear in her brother's denominator.
    id: 'enr-eli-ballet',
    studentId: 'stu-eli',
    classId: 'cls-ballet',
    season: SEASON,
    status: 'active',
    enrolledOn: '2026-07-21',
    droppedOn: null,
  },
  {
    // Enrolled in a class that has not met yet.
    id: 'enr-eli-turns',
    studentId: 'stu-eli',
    classId: 'cls-turns',
    season: SEASON,
    status: 'active',
    enrolledOn: SEASON_START,
    droppedOn: null,
  },
  {
    // Dropped last season. History survives and shows under "Past classes".
    id: 'enr-maya-contemporary',
    studentId: 'stu-maya',
    classId: 'cls-contemporary',
    season: 'Winter 2026',
    status: 'dropped',
    enrolledOn: '2026-01-12',
    droppedOn: '2026-02-16',
  },
  {
    id: 'enr-ada-hiphop',
    studentId: 'stu-ada',
    classId: 'cls-hiphop',
    season: SEASON,
    status: 'active',
    enrolledOn: SEASON_START,
    droppedOn: null,
  },
];

// --- attendance ------------------------------------------------------------

const mark = (
  studentId: string,
  classId: string,
  date: string,
  status: AttendanceRecord['status'],
): AttendanceRecord => ({
  id: `att-${studentId}-${classId}-${date}`,
  studentId,
  classId,
  sessionId: `ses-${classId}-${date}`,
  status,
  importBatchId: 'batch-demo-001',
});

/**
 * Maya — Junior Ballet. Eleven sessions imported, one cancelled, so ten count.
 * One absence. Expected: 9 of 10 → 90%.
 */
const MAYA_BALLET: AttendanceRecord[] = BALLET_DATES
  .filter(d => d !== '2026-08-04')
  .map(d => mark('stu-maya', 'cls-ballet', d, d === '2026-08-11' ? 'absent' : 'present'));

/**
 * Maya — Hip Hop Crew. Eleven held sessions. One late (still attendance), one
 * excused (leaves the denominator), one absent.
 * Expected: attended 9 (8 present + 1 late), counted 10 (11 − 1 excused) → 90%.
 */
const MAYA_HIPHOP: AttendanceRecord[] = HIPHOP_DATES.map(d => {
  if (d === '2026-07-02') return mark('stu-maya', 'cls-hiphop', d, 'absent');
  if (d === '2026-07-30') return mark('stu-maya', 'cls-hiphop', d, 'late');
  if (d === '2026-08-13') return mark('stu-maya', 'cls-hiphop', d, 'excused');
  return mark('stu-maya', 'cls-hiphop', d, 'present');
});

/**
 * Eli — Junior Ballet from week 6. Sessions from 07-21: six imported, one of
 * them cancelled, so five count. One absence.
 * Expected: 4 of 5 → 80%. NOT 4 of 10, which is what a naive denominator gives.
 */
const ELI_BALLET: AttendanceRecord[] = BALLET_DATES
  .filter(d => d >= '2026-07-21' && d !== '2026-08-04')
  .map(d => mark('stu-eli', 'cls-ballet', d, d === '2026-08-18' ? 'absent' : 'present'));

/**
 * Maya — Contemporary, last season. Dropped after 02-16, so the two sessions
 * after that date do not count against her. Expected: 5 of 6 → 83%.
 */
const MAYA_CONTEMPORARY: AttendanceRecord[] = CONTEMPORARY_DATES
  .filter(d => d <= '2026-02-16')
  .map(d => mark('stu-maya', 'cls-contemporary', d, d === '2026-01-26' ? 'absent' : 'present'));

/** The other household's child. Must never be visible to the Alvarez family. */
const ADA_HIPHOP: AttendanceRecord[] = HIPHOP_DATES
  .map(d => mark('stu-ada', 'cls-hiphop', d, 'present'));

export const FIXTURE_ATTENDANCE: AttendanceRecord[] = [
  ...MAYA_BALLET,
  ...MAYA_HIPHOP,
  ...ELI_BALLET,
  ...MAYA_CONTEMPORARY,
  ...ADA_HIPHOP,
];

/**
 * The states the attendance card has to survive, selectable in the demo so each
 * one can actually be looked at instead of imagined.
 *
 * §6.1 is explicit that the empty states matter more than the happy path here,
 * and the reason is that they are what a real family sees first: the studio
 * imports its first batch weeks after the portal goes live.
 */
export type FixtureScenario =
  /** Guardian, two children, full history. The happy path. */
  | 'guardian'
  /** A student's own login: one child, no switcher. */
  | 'student'
  /** Signed in, household exists, no children attached yet. */
  | 'no-students'
  /** Child on file, enrolled in nothing this season. */
  | 'no-enrollments'
  /** A studio that has never run an import. Every table empty. */
  | 'fresh-studio';

export const FIXTURE_SCENARIOS: { value: FixtureScenario; label: string; hint: string }[] = [
  { value: 'guardian', label: 'Guardian · 2 children', hint: 'Full history, mid-season join, cancelled class' },
  { value: 'student', label: 'Student login', hint: 'Own data only, no switcher' },
  { value: 'no-students', label: 'No children linked', hint: 'Enrollment still syncing' },
  { value: 'no-enrollments', label: 'No classes', hint: 'Child on file, nothing this season' },
  { value: 'fresh-studio', label: 'Fresh studio', hint: 'No imports have ever run' },
];

// --- updates and documents -------------------------------------------------
// Both tables already exist and both carry a nullable `class_id`. That column
// is what turns the portal from a noticeboard into a personal feed: a null
// class_id is studio-wide and reaches everyone, a set one reaches only the
// families enrolled in that class. Nothing new is needed to do it — the data
// has simply never been filtered by enrollment before.

const PROGRAM_ACADEMY = 'prog-academy';
const PROGRAM_ALLSTARS = 'prog-allstars';

const update = (
  id: string,
  programId: string,
  classId: string | null,
  title: string,
  body: string,
  publishedAt: string,
  isPinned = false,
): PortalUpdate => ({
  id,
  programId,
  classId,
  // The fixture has no households; a personal note is only ever real data.
  householdId: null,
  title,
  body,
  isPinned,
  isPublished: true,
  publishedAt,
  authorId: null,
  createdAt: publishedAt,
  updatedAt: publishedAt,
});

export const FIXTURE_UPDATES: PortalUpdate[] = [
  update(
    'upd-recital',
    PROGRAM_ACADEMY,
    null,
    'Recital tickets are on sale',
    'Tickets for the December showcase are available now through the studio office. Each family is allocated four before general release.',
    '2026-08-28T09:00:00Z',
    true,
  ),
  update(
    'upd-ballet-shoes',
    PROGRAM_ACADEMY,
    'cls-ballet',
    'New shoe supplier for Junior Ballet',
    'We have moved to Bloch for pink leather shoes. Existing shoes are absolutely fine for the rest of this season — no need to replace anything mid-term.',
    '2026-08-26T17:30:00Z',
  ),
  update(
    'upd-hiphop-showcase',
    PROGRAM_ALLSTARS,
    'cls-hiphop',
    'Crew showcase piece announced',
    'We are setting the showcase routine over the next three weeks. Attendance really matters for these — the choreography builds week on week.',
    '2026-08-21T18:00:00Z',
  ),
  update(
    // A class nobody in the Alvarez household is in. It must NOT appear on
    // their profile — that is the whole point of the class_id filter.
    'upd-tap-only',
    PROGRAM_ACADEMY,
    'cls-contemporary',
    'Contemporary moves to Studio C',
    'From next week Contemporary Foundations runs in Studio C.',
    '2026-02-02T12:00:00Z',
  ),
];

const doc = (
  id: string,
  programId: string,
  classId: string | null,
  title: string,
  description: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  category: string | null,
  sortOrder: number,
): PortalDocument => ({
  id,
  programId,
  classId,
  title,
  description,
  category,
  // Demo rows point at nothing. The card renders them without a working link
  // and says so, rather than offering a download that 404s.
  storagePath: '',
  streamUid: null,
  streamPlaybackUrl: null,
  streamStatus: null,
  durationSeconds: null,
  fileName,
  mimeType,
  sizeBytes,
  sortOrder,
  isPublished: true,
  createdAt: '2026-06-10T09:00:00Z',
});

export const FIXTURE_DOCUMENTS: PortalDocument[] = [
  doc('doc-handbook', PROGRAM_ACADEMY, null, 'Family handbook 2026', 'Studio policies, term dates and contact details.', 'didc-family-handbook-2026.pdf', 'application/pdf', 1_842_000, 'Policies', 1),
  doc('doc-dress-ballet', PROGRAM_ACADEMY, 'cls-ballet', 'Junior Ballet dress code', 'What to wear and how hair should be done.', 'junior-ballet-dress-code.pdf', 'application/pdf', 412_000, 'Dress code', 2),
  doc('doc-recital-pack', PROGRAM_ACADEMY, null, 'Recital information pack', 'Call times, costume collection and backstage rules.', 'recital-pack.pdf', 'application/pdf', 2_310_000, 'Recital', 3),
  doc('doc-hiphop-music', PROGRAM_ALLSTARS, 'cls-hiphop', 'Showcase routine music', 'Practice track for the crew piece.', 'crew-showcase-track.mp3', 'audio/mpeg', 4_120_000, 'Music', 4),
  doc('doc-contemp-only', PROGRAM_ACADEMY, 'cls-contemporary', 'Contemporary term plan', 'Skills covered each week.', 'contemporary-term-plan.pdf', 'application/pdf', 288_000, null, 5),
];
