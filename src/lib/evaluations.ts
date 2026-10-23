import { supabase, isSupabaseConfigured } from './supabase';
import { loadMyClassIds, Scope } from './attendanceStaff';

/**
 * Class evaluations (v70) — every read and write the screens make, and the
 * pure helpers they share.
 *
 * THE SHAPE, IN ONE PARAGRAPH
 *
 * A teacher rates each dancer in their own classes on three things, 1 to 5,
 * adds a comment and a "move up" flag, and either saves a draft or submits.
 * Rounds ("Fall midterm") are named by an admin, who also holds the switch
 * that lets teachers save at all. A family sees an evaluation once it is
 * submitted, and keeps seeing it if it is later edited. One row per dancer +
 * class + season + round.
 *
 * SECURITY POSTURE — the same as attendance (attendanceStaff.ts)
 *
 * Nothing here is access control. RLS decides which rows a read returns: a
 * teacher gets every row for the classes they hold, a family gets submitted
 * rows for its own dancers, and a tampered class ID returns nothing rather
 * than somebody else's roster. Every write goes through staff_save_evaluation,
 * which is SECURITY DEFINER and re-checks the switch, the grant, the roster and
 * the round server-side. No client role can INSERT, UPDATE or DELETE.
 *
 * ERRORS ARE RETURNED, NOT THROWN
 *
 * The messages the RPCs raise are written to be shown to a person as-is
 * ("That round is not open"), so a wrapper returns `{ result, error }` and the
 * screen puts the sentence beside the control that failed. Loaders return a
 * LoadError string so "failed to load" stays distinguishable from "empty".
 *
 * NAMES
 *
 * Staff screens and every export show first_name + last_name and never
 * `display_name`, which is the household nickname. Same rule as the roster.
 */

export type LoadError = string | null;

const LOAD_FAILED = "Couldn't load this. Check your connection and pull down to try again.";

// ------------------------------------------------------------------- the form

export type Rating = 1 | 2 | 3 | 4 | 5;
export type Criterion = 'performance' | 'attendance' | 'showmanship';
export type EvaluationStatus = 'draft' | 'submitted';

export const RATINGS: Rating[] = [1, 2, 3, 4, 5];

/** One word per step, so a 1 reads as a place to start and not a verdict. */
export const RATING_LABELS: Record<Rating, string> = {
  1: 'Needs work',
  2: 'Developing',
  3: 'Solid',
  4: 'Strong',
  5: 'Outstanding',
};

export const CRITERIA: { key: Criterion; label: string; hint: string }[] = [
  { key: 'performance', label: 'Performance', hint: 'Technique, musicality and progress in class' },
  { key: 'attendance', label: 'Attendance', hint: 'Shows up, on time, ready to dance' },
  { key: 'showmanship', label: 'Showmanship', hint: 'Energy, confidence and presence' },
];

export const COMMENT_MAX = 4000;

/**
 * Whether families see the move-up flag. Open decision 2 in
 * EVALUATIONS-BUILD.md: it exists on every round, and a parent may read it as
 * a promise. One constant, so the owner's answer is a one-line change.
 */
export const SHOW_MOVE_UP_TO_FAMILIES = true;

export const ratingLabel = (n: number | null | undefined): string =>
  n && n >= 1 && n <= 5 ? RATING_LABELS[n as Rating] : 'Not rated';

export const isRating = (n: unknown): n is Rating =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5;

/** What a teacher types before it is saved. */
export interface EvaluationDraft {
  performance: Rating | null;
  attendance: Rating | null;
  showmanship: Rating | null;
  comment: string;
  moveUp: boolean;
}

export const EMPTY_DRAFT: EvaluationDraft = {
  performance: null,
  attendance: null,
  showmanship: null,
  comment: '',
  moveUp: false,
};

/** Submit needs all three ratings; the function refuses otherwise. */
export const isComplete = (d: EvaluationDraft): boolean =>
  isRating(d.performance) && isRating(d.attendance) && isRating(d.showmanship);

export const draftOf = (e: StaffEvaluation | null): EvaluationDraft =>
  e
    ? {
        performance: e.performance,
        attendance: e.attendance,
        showmanship: e.showmanship,
        comment: e.comment,
        moveUp: e.moveUp,
      }
    : EMPTY_DRAFT;

export const sameDraft = (a: EvaluationDraft, b: EvaluationDraft): boolean =>
  a.performance === b.performance &&
  a.attendance === b.attendance &&
  a.showmanship === b.showmanship &&
  a.comment === b.comment &&
  a.moveUp === b.moveUp;

// ----------------------------------------------------------------- the switch

export interface EvaluationSettings {
  enabled: boolean;
  round: string;
}

/**
 * Why a teacher cannot save right now, in a sentence — or null when they can.
 *
 * Checked on the client before the form opens so a teacher gets a locked
 * screen rather than an error after typing (EVALUATIONS-BUILD.md §3). Admins
 * are never locked out: the function lets them write with the switch off and
 * into any round, so the only thing they need is a round name to write under.
 */
export const lockReason = (settings: EvaluationSettings | null, isAdmin: boolean): string | null => {
  if (!settings) return null;
  if (!settings.round.trim()) {
    return isAdmin
      ? 'No evaluation round is named yet. Name one below before anyone can fill in a form.'
      : 'No evaluation round is open yet. The office names the round and opens evaluations.';
  }
  if (!settings.enabled && !isAdmin) {
    return 'Evaluations are closed right now. The office opens them when a round is due.';
  }
  return null;
};

// -------------------------------------------------------------------- shapes

export interface EvaluationClass {
  id: string;
  name: string;
  season: string | null;
  category: string | null;
  instructorName: string | null;
  dayOfWeek: number | null;
  startTime: string | null;
}

export interface StaffEvaluation {
  id: string;
  studentId: string;
  classId: string;
  season: string;
  round: string;
  performance: Rating | null;
  attendance: Rating | null;
  showmanship: Rating | null;
  comment: string;
  moveUp: boolean;
  status: EvaluationStatus;
  submittedAt: string | null;
  updatedAt: string | null;
}

export interface RosterEntry {
  studentId: string;
  firstName: string;
  lastName: string;
  /** Null until somebody has saved anything for this dancer this round. */
  evaluation: StaffEvaluation | null;
}

export interface RosterProgress {
  total: number;
  submitted: number;
  draft: number;
  notStarted: number;
}

/** What a family reads: submitted only, class name attached (v71). */
export interface FamilyEvaluation {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  classId: string;
  className: string;
  instructorName: string | null;
  season: string;
  round: string;
  performance: Rating;
  attendance: Rating;
  showmanship: Rating;
  comment: string;
  moveUp: boolean;
  submittedAt: string;
}

// -------------------------------------------------------------- pure helpers

const uniq = (xs: string[]): string[] => Array.from(new Set(xs));

const toRating = (v: unknown): Rating | null => (isRating(v) ? v : null);

export const toClass = (row: any): EvaluationClass => ({
  id: row.id,
  name: row.name,
  season: row.season ?? null,
  category: row.category ?? null,
  instructorName: row.instructor_name ?? null,
  dayOfWeek: row.day_of_week ?? null,
  startTime: row.start_time ?? null,
});

export const toEvaluation = (row: any): StaffEvaluation => ({
  id: row.id,
  studentId: row.student_id,
  classId: row.class_id,
  season: row.season,
  round: row.round,
  performance: toRating(row.performance),
  attendance: toRating(row.attendance),
  showmanship: toRating(row.showmanship),
  comment: row.comment ?? '',
  moveUp: Boolean(row.move_up),
  status: row.status === 'submitted' ? 'submitted' : 'draft',
  submittedAt: row.submitted_at ?? null,
  updatedAt: row.updated_at ?? null,
});

/** Surname first, the way a paper roster reads. */
export const byName = (a: RosterEntry, b: RosterEntry): number =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);

/** Weekday then start time, with untimed classes last. */
export const byMeeting = (a: EvaluationClass, b: EvaluationClass): number => {
  const ad = a.dayOfWeek ?? 99;
  const bd = b.dayOfWeek ?? 99;
  if (ad !== bd) return ad - bd;
  const at = a.startTime ?? '99';
  const bt = b.startTime ?? '99';
  if (at !== bt) return at.localeCompare(bt);
  return a.name.localeCompare(b.name);
};

/**
 * Join the roster to whatever has been saved for it.
 *
 * Built from the ENROLLMENTS, not from the evaluations: a dancer nobody has
 * opened yet has no row, and that absence is the thing the screen has to show.
 * A student row that RLS did not return is dropped rather than rendered blank.
 */
export const buildRoster = (
  enrollments: any[],
  students: any[],
  evaluations: any[],
): RosterEntry[] => {
  const studentById = new Map<string, any>(students.map(s => [s.id, s]));
  const evalFor = new Map<string, StaffEvaluation>(
    evaluations.map(e => [e.student_id, toEvaluation(e)]),
  );

  return uniq(enrollments.map((e: any) => e.student_id))
    .flatMap(id => {
      const s = studentById.get(id);
      if (!s) return [];
      return [{
        studentId: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        evaluation: evalFor.get(s.id) ?? null,
      }];
    })
    .sort(byName);
};

export const rosterProgress = (rows: RosterEntry[]): RosterProgress => {
  const p: RosterProgress = { total: rows.length, submitted: 0, draft: 0, notStarted: 0 };
  rows.forEach(r => {
    if (!r.evaluation) p.notStarted += 1;
    else if (r.evaluation.status === 'submitted') p.submitted += 1;
    else p.draft += 1;
  });
  return p;
};

/** "12 of 15 submitted" — the number a class row and the export notice share. */
export const progressText = (submitted: number, total: number): string =>
  total === 0 ? 'No dancers on the roster' : `${submitted} of ${total} submitted`;

/**
 * Group a family's evaluations the way a parent reads them: dancer, then
 * season (newest first), then round (newest submission first). Rounds keep
 * the order they were submitted in, so "Fall midterm" sits above "Final".
 */
export interface FamilyGroup {
  studentId: string;
  name: string;
  seasons: { season: string; rounds: FamilyEvaluation[] }[];
}

export const groupFamilyEvaluations = (rows: FamilyEvaluation[]): FamilyGroup[] => {
  const byStudent = new Map<string, FamilyGroup>();
  rows.forEach(r => {
    const g = byStudent.get(r.studentId) ?? { studentId: r.studentId, name: r.firstName, seasons: [] };
    let season = g.seasons.find(s => s.season === r.season);
    if (!season) {
      season = { season: r.season, rounds: [] };
      g.seasons.push(season);
    }
    season.rounds.push(r);
    byStudent.set(r.studentId, g);
  });

  return Array.from(byStudent.values())
    .map(g => ({
      ...g,
      seasons: g.seasons
        .sort((a, b) => b.season.localeCompare(a.season))
        .map(s => ({
          ...s,
          rounds: s.rounds.slice().sort((a, b) =>
            b.submittedAt.localeCompare(a.submittedAt) || a.className.localeCompare(b.className)),
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** The season most classes are in — the default for an export filter. */
export const currentSeason = (classes: { season: string | null }[]): string | null => {
  const counts = new Map<string, number>();
  classes.forEach(c => {
    if (c.season) counts.set(c.season, (counts.get(c.season) ?? 0) + 1);
  });
  let best: string | null = null;
  counts.forEach((n, season) => {
    if (best === null || n > (counts.get(best) ?? 0) || (n === counts.get(best) && season > best)) best = season;
  });
  return best;
};

// ------------------------------------------------------------------- the export

export type ExportState = 'submitted' | 'draft' | 'not_started';

export interface ExportMissing {
  studentId: string;
  name: string;
  state: Exclude<ExportState, 'submitted'>;
}

export interface ExportClassSummary {
  classId: string;
  className: string;
  total: number;
  submitted: number;
  missing: ExportMissing[];
}

export interface ExportSummary {
  round: string | null;
  total: number;
  submitted: number;
  draft: number;
  notStarted: number;
  byClass: ExportClassSummary[];
}

/** One evaluation as the export writes it — a complete snapshot, no joins left. */
export interface ExportRow {
  studentId: string;
  classId: string;
  season: string;
  firstName: string;
  lastName: string;
  className: string;
  category: string | null;
  instructorName: string | null;
  evaluationId: string;
  round: string;
  performance: Rating | null;
  attendance: Rating | null;
  showmanship: Rating | null;
  comment: string;
  moveUp: boolean;
  submittedAt: string | null;
  state: ExportState;
}

export interface ExportResult {
  summary: ExportSummary;
  evaluations: ExportRow[];
}

export const toExportResult = (data: any): ExportResult => {
  const s = data?.summary ?? {};
  return {
    summary: {
      round: s.round ?? null,
      total: Number(s.total ?? 0),
      submitted: Number(s.submitted ?? 0),
      draft: Number(s.draft ?? 0),
      notStarted: Number(s.not_started ?? 0),
      byClass: (s.by_class ?? []).map((c: any) => ({
        classId: c.class_id,
        className: c.class_name,
        total: Number(c.total ?? 0),
        submitted: Number(c.submitted ?? 0),
        missing: (c.missing ?? []).map((m: any) => ({
          studentId: m.student_id,
          name: m.name,
          state: m.state === 'draft' ? 'draft' : 'not_started',
        })),
      })),
    },
    evaluations: (data?.evaluations ?? []).map((r: any): ExportRow => ({
      studentId: r.student_id,
      classId: r.class_id,
      season: r.season,
      firstName: r.first_name,
      lastName: r.last_name,
      className: r.class_name,
      category: r.category ?? null,
      instructorName: r.instructor_name ?? null,
      evaluationId: r.evaluation_id,
      round: r.round,
      performance: toRating(r.performance),
      attendance: toRating(r.attendance),
      showmanship: toRating(r.showmanship),
      comment: r.comment ?? '',
      moveUp: Boolean(r.move_up),
      submittedAt: r.submitted_at ?? null,
      state: r.state === 'submitted' ? 'submitted' : r.state === 'draft' ? 'draft' : 'not_started',
    })),
  };
};

/**
 * The sentence shown before an export runs: how many are not filled out, and
 * who. Lists the dancers by class, drafts marked, so the admin can chase the
 * right teacher — and then export anyway if they choose.
 */
export const missingNotice = (summary: ExportSummary): { headline: string; lines: string[] } => {
  const missing = summary.total - summary.submitted;
  if (summary.total === 0) {
    return { headline: 'Nothing matched those filters.', lines: [] };
  }
  if (missing === 0) {
    return { headline: `All ${summary.total} evaluations are submitted.`, lines: [] };
  }
  const headline = `${summary.submitted} of ${summary.total} submitted — ${missing} not filled out` +
    (summary.draft > 0 ? ` (${summary.draft} still ${summary.draft === 1 ? 'a draft' : 'drafts'})` : '') + '.';
  const lines = summary.byClass
    .filter(c => c.missing.length > 0)
    .map(c => `${c.className}: ${c.missing.map(m => m.state === 'draft' ? `${m.name} (draft)` : m.name).join(', ')}`);
  return { headline, lines };
};

/**
 * Where a PDF goes inside the ZIP.
 *
 *   by class:  Season/Class name/Last, First — Round.pdf
 *   by dancer: Last, First/Class name — Round.pdf
 *
 * `clean` is the caller's filename sanitiser (slug from attendanceExport).
 */
export const zipPath = (
  row: ExportRow,
  layout: 'class' | 'dancer',
  clean: (s: string) => string,
): string => {
  const dancer = clean(`${row.lastName}, ${row.firstName}`);
  const round = clean(row.round);
  const klass = clean(row.className);
  return layout === 'dancer'
    ? `${dancer}/${klass}-${round}.pdf`
    : `${clean(row.season)}/${klass}/${dancer}-${round}.pdf`;
};

// -------------------------------------------------------------------- reads

export const loadEvaluationSettings = async (): Promise<{ settings: EvaluationSettings | null; error: LoadError }> => {
  const { data, error } = await supabase
    .from('portal_settings')
    .select('evaluations_enabled, evaluation_round')
    .single();
  if (error) return { settings: null, error: LOAD_FAILED };
  return {
    settings: { enabled: Boolean(data?.evaluations_enabled), round: data?.evaluation_round ?? '' },
    error: null,
  };
};

const CLASS_COLUMNS = 'id, name, season, category, instructor_name, day_of_week, start_time';

/**
 * The classes this person evaluates. 'mine' is what they hold in
 * portal_class_instructors; 'all' (admins only) is every active class. Null
 * ids from loadMyClassIds is the absence of a filter, not a grant — RLS still
 * decides what comes back.
 */
export const loadEvaluationClasses = async (
  profileId: string,
  isAdmin: boolean,
  scope: Scope,
): Promise<{ classes: EvaluationClass[]; myCount: number; error: LoadError }> => {
  const { ids: mine, error: mineError } = await loadMyClassIds(profileId, isAdmin, 'mine');
  if (mineError) return { classes: [], myCount: 0, error: mineError };
  const myCount = (mine ?? []).length;

  const effective: Scope = isAdmin && myCount === 0 ? 'all' : scope;
  const ids = isAdmin && effective === 'all' ? null : (mine ?? []);
  if (ids && ids.length === 0) return { classes: [], myCount, error: null };

  let q = supabase.from('portal_classes').select(CLASS_COLUMNS).eq('is_active', true);
  if (ids) q = q.in('id', ids);
  const { data, error } = await q;
  if (error) return { classes: [], myCount, error: LOAD_FAILED };

  return { classes: (data ?? []).map(toClass).sort(byMeeting), myCount, error: null };
};

/** Every active class, for the admin's lookup. */
export const loadAllClasses = async (): Promise<{ classes: EvaluationClass[]; error: LoadError }> => {
  const { data, error } = await supabase
    .from('portal_classes')
    .select(CLASS_COLUMNS)
    .eq('is_active', true)
    .order('name');
  if (error) return { classes: [], error: LOAD_FAILED };
  return { classes: (data ?? []).map(toClass), error: null };
};

/**
 * The dancers on one class's roster, with whatever is saved for this round.
 *
 * ROSTER RULE: `status = 'active'`, exactly what staff_save_evaluation checks.
 * Using the date-window test the attendance roster uses would show a dancer
 * the function then refuses to save (EVALUATIONS-BUILD.md §6C).
 */
export const loadClassRoster = async (
  classId: string,
  season: string | null,
  round: string,
): Promise<{ rows: RosterEntry[]; error: LoadError }> => {
  const { data: enrollments, error } = await supabase
    .from('portal_enrollments')
    .select('student_id')
    .eq('class_id', classId)
    .eq('status', 'active');
  if (error) return { rows: [], error: LOAD_FAILED };
  if (!enrollments || enrollments.length === 0) return { rows: [], error: null };

  const studentIds = uniq(enrollments.map((e: any) => e.student_id));

  let evalQuery = supabase
    .from('portal_evaluations')
    .select('*')
    .eq('class_id', classId)
    .eq('round', round);
  if (season) evalQuery = evalQuery.eq('season', season);

  const [students, evaluations] = await Promise.all([
    supabase.from('portal_students').select('id, first_name, last_name').in('id', studentIds),
    evalQuery,
  ]);
  if (students.error || evaluations.error) return { rows: [], error: LOAD_FAILED };

  return { rows: buildRoster(enrollments, students.data ?? [], evaluations.data ?? []), error: null };
};

export interface StudentHit {
  id: string;
  firstName: string;
  lastName: string;
}

/** Admin lookup by name. RLS: an admin reads every student, a teacher their own. */
export const searchStudents = async (query: string): Promise<{ rows: StudentHit[]; error: LoadError }> => {
  const q = query.trim();
  if (q.length < 2) return { rows: [], error: null };
  // Each word must match the first OR the last name, so "Alvarez, M" — the
  // way the roster prints a name — finds Maya Alvarez. Pattern characters are
  // not meant as patterns, and , ( ) are PostgREST's or() grammar, so they
  // split words rather than travel.
  const words = q
    .replace(/[,()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.replace(/[\\%_]/g, m => '\\' + m));
  if (words.length === 0) return { rows: [], error: null };
  let req = supabase
    .from('portal_students')
    .select('id, first_name, last_name')
    .eq('status', 'active');
  words.forEach(w => { req = req.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%`); });
  const { data, error } = await req
    .order('last_name')
    .order('first_name')
    .limit(25);
  if (error) return { rows: [], error: LOAD_FAILED };
  return {
    rows: (data ?? []).map((s: any) => ({ id: s.id, firstName: s.first_name, lastName: s.last_name })),
    error: null,
  };
};

/** The family's submitted evaluations, class names attached (family_evaluations, v71). */
export const loadFamilyEvaluations = async (): Promise<{ rows: FamilyEvaluation[]; error: LoadError }> => {
  if (!isSupabaseConfigured() || !supabase) return { rows: [], error: null };
  const { data, error } = await supabase.rpc('family_evaluations');
  if (error) return { rows: [], error: LOAD_FAILED };
  return {
    rows: (data ?? []).flatMap((r: any): FamilyEvaluation[] => {
      const performance = toRating(r.performance);
      const attendance = toRating(r.attendance);
      const showmanship = toRating(r.showmanship);
      // A submitted row carries all three by constraint; anything else is not ours to show.
      if (!performance || !attendance || !showmanship) return [];
      return [{
        id: r.id,
        studentId: r.student_id,
        firstName: r.first_name,
        lastName: r.last_name,
        classId: r.class_id,
        className: r.class_name ?? 'Class',
        instructorName: r.instructor_name ?? null,
        season: r.season,
        round: r.round,
        performance,
        attendance,
        showmanship,
        comment: r.comment ?? '',
        moveUp: Boolean(r.move_up),
        submittedAt: r.submitted_at ?? '',
      }];
    }),
    error: null,
  };
};

// ------------------------------------------------------------------- writes

export interface SaveInput extends EvaluationDraft {
  studentId: string;
  classId: string;
  submit: boolean;
  /** Admin overrides. A teacher leaves both unset and writes the open round. */
  season?: string | null;
  round?: string | null;
}

export interface SaveResult {
  id: string;
  status: EvaluationStatus;
  season: string;
  round: string;
}

/**
 * Save a draft or submit. Numbers go as JSON numbers; PostgREST casts them to
 * smallint. The RPC's message is the thing to show when it refuses.
 */
export const saveEvaluation = async (input: SaveInput): Promise<{ result: SaveResult | null; error: LoadError }> => {
  const { data, error } = await supabase.rpc('staff_save_evaluation', {
    p_student_id: input.studentId,
    p_class_id: input.classId,
    p_performance: input.performance,
    p_attendance: input.attendance,
    p_showmanship: input.showmanship,
    p_comment: input.comment.slice(0, COMMENT_MAX),
    p_move_up: input.moveUp,
    p_submit: input.submit,
    p_season: input.season ?? null,
    p_round: input.round ?? null,
  });
  if (error) return { result: null, error: error.message || LOAD_FAILED };
  return {
    result: {
      id: data?.id,
      status: data?.status === 'submitted' ? 'submitted' : 'draft',
      season: data?.season,
      round: data?.round,
    },
    error: null,
  };
};

/** Flip the switch, name the round. Admin only; the RPC says so otherwise. */
export const saveEvaluationSettings = async (
  enabled: boolean,
  round: string | null,
): Promise<{ settings: EvaluationSettings | null; error: LoadError }> => {
  const { data, error } = await supabase.rpc('admin_set_evaluation_settings', {
    p_enabled: enabled,
    p_round: round,
  });
  if (error) return { settings: null, error: error.message || LOAD_FAILED };
  return {
    settings: { enabled: Boolean(data?.evaluations_enabled), round: data?.evaluation_round ?? '' },
    error: null,
  };
};

export interface ExportFilters {
  classIds?: string[];
  studentIds?: string[];
  season?: string | null;
  round?: string | null;
  includeDrafts?: boolean;
}

/**
 * One call for both the notice and the content, so they cannot disagree.
 * Admin only. Starts from the rosters, so dancers with no row are counted.
 */
export const loadExport = async (f: ExportFilters): Promise<{ result: ExportResult | null; error: LoadError }> => {
  const { data, error } = await supabase.rpc('admin_evaluation_export', {
    p_class_ids: f.classIds && f.classIds.length > 0 ? f.classIds : null,
    p_student_ids: f.studentIds && f.studentIds.length > 0 ? f.studentIds : null,
    p_season: f.season || null,
    p_round: f.round || null,
    p_include_drafts: Boolean(f.includeDrafts),
  });
  if (error) return { result: null, error: error.message || LOAD_FAILED };
  return { result: toExportResult(data), error: null };
};

/**
 * "Email me my evaluations" — the public page. The function answers
 * { ok: true } for every well-formed address whether or not it matched, so
 * `ok` means the request went through, not that mail was sent.
 */
export const requestEvaluationEmail = async (email: string): Promise<{ ok: boolean; error?: string }> => {
  if (!isSupabaseConfigured() || !supabase) return { ok: false };
  try {
    const { error } = await supabase.functions.invoke('evaluation-email', {
      body: { email: email.trim().toLowerCase() },
    });
    if (!error) return { ok: true };
    if (error.context?.status !== 400) return { ok: false };
    const refusal = await error.context.json().catch(() => null);
    return typeof refusal?.error === 'string' ? { ok: false, error: refusal.error } : { ok: false };
  } catch (e) {
    console.error('evaluation-email threw:', e);
    return { ok: false };
  }
};

// ----------------------------------------------------------------- snapshots

/**
 * One evaluation as a document: the shape the snapshot card, the PDF and the
 * email all render. Built from an export row (admin) or a family row (parent)
 * so the three can never show different fields.
 */
export interface EvaluationSnapshot {
  firstName: string;
  lastName: string;
  className: string;
  instructorName: string | null;
  season: string;
  round: string;
  performance: Rating | null;
  attendance: Rating | null;
  showmanship: Rating | null;
  comment: string;
  moveUp: boolean;
  submittedAt: string | null;
  state: ExportState;
}

export const snapshotOfExport = (r: ExportRow): EvaluationSnapshot => ({
  firstName: r.firstName,
  lastName: r.lastName,
  className: r.className,
  instructorName: r.instructorName,
  season: r.season,
  round: r.round,
  performance: r.performance,
  attendance: r.attendance,
  showmanship: r.showmanship,
  comment: r.comment,
  moveUp: r.moveUp,
  submittedAt: r.submittedAt,
  state: r.state,
});

export const snapshotOfFamily = (r: FamilyEvaluation): EvaluationSnapshot => ({
  firstName: r.firstName,
  lastName: r.lastName,
  className: r.className,
  instructorName: r.instructorName,
  season: r.season,
  round: r.round,
  performance: r.performance,
  attendance: r.attendance,
  showmanship: r.showmanship,
  comment: r.comment,
  moveUp: r.moveUp,
  submittedAt: r.submittedAt,
  state: 'submitted',
});

/** "Oct 20, 2026", or '' for a draft that was never submitted. */
export const prettyDate = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ------------------------------------------------------------ class progress

export interface ClassProgress {
  total: number;
  submitted: number;
  draft: number;
}

/**
 * "N of M submitted" for every class on the list, in two queries rather than
 * two per class. Counts active enrollments against saved rows for the round;
 * a class RLS does not grant simply has no rows and reads 0 of 0.
 */
export const loadClassProgress = async (
  classes: { id: string; season: string | null }[],
  round: string,
): Promise<{ progress: Map<string, ClassProgress>; error: LoadError }> => {
  const progress = new Map<string, ClassProgress>();
  const classIds = classes.map(c => c.id);
  const seasonOf = new Map(classes.map(c => [c.id, c.season]));
  if (classIds.length === 0 || !round) return { progress, error: null };

  const [enrollments, evaluations] = await Promise.all([
    supabase.from('portal_enrollments').select('class_id, student_id').in('class_id', classIds).eq('status', 'active'),
    supabase.from('portal_evaluations').select('class_id, student_id, status, season').in('class_id', classIds).eq('round', round),
  ]);
  if (enrollments.error || evaluations.error) return { progress, error: LOAD_FAILED };

  const rostered = new Map<string, Set<string>>();
  (enrollments.data ?? []).forEach((e: any) => {
    const set = rostered.get(e.class_id) ?? new Set<string>();
    set.add(e.student_id);
    rostered.set(e.class_id, set);
  });
  classIds.forEach(id => progress.set(id, { total: rostered.get(id)?.size ?? 0, submitted: 0, draft: 0 }));
  (evaluations.data ?? []).forEach((e: any) => {
    const p = progress.get(e.class_id);
    // Only count a row for a dancer still on the roster; a dropped dancer's
    // row would otherwise make "16 of 15". And only this class's season: a
    // prior year's "Final" is not this year's.
    if (!p || !rostered.get(e.class_id)?.has(e.student_id)) return;
    const season = seasonOf.get(e.class_id);
    if (season && e.season !== season) return;
    if (e.status === 'submitted') p.submitted += 1;
    else p.draft += 1;
  });
  return { progress, error: null };
};
