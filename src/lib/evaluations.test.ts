import {
  buildRoster,
  currentSeason,
  draftOf,
  groupFamilyEvaluations,
  isComplete,
  lockReason,
  missingNotice,
  planSubmitAll,
  progressText,
  submitAllSummary,
  ratingLabel,
  rosterProgress,
  toExportResult,
  zipPath,
  FamilyEvaluation,
} from './evaluations';

/**
 * The pure half of the evaluations feature.
 *
 * The counting matters because it decides what an admin is told before an
 * export runs ("12 of 15 submitted, missing: …") and what a teacher sees on a
 * class row. Both failures are silent: a roster built from the evaluations
 * table instead of the enrollments would never mention a dancer nobody has
 * opened, which is precisely the dancer the notice exists to name.
 */

jest.mock('./supabase', () => ({
  isSupabaseConfigured: () => false,
  supabase: null,
}));

const student = (id: string, first: string, last: string) => ({ id, first_name: first, last_name: last });
const enrolled = (student_id: string) => ({ student_id });
const saved = (student_id: string, status: 'draft' | 'submitted', over: any = {}) => ({
  id: `ev-${student_id}`, student_id, class_id: 'cls-1', season: '2026-2027', round: 'Fall midterm',
  performance: 4, attendance: 5, showmanship: 3, comment: 'Lovely lines', move_up: false,
  status, submitted_at: status === 'submitted' ? '2026-10-20T01:00:00Z' : null, updated_at: null, ...over,
});

describe('a class roster for one round', () => {
  it('is built from the enrollments, so an unopened dancer still appears', () => {
    const rows = buildRoster(
      [enrolled('a'), enrolled('b'), enrolled('c')],
      [student('a', 'Maya', 'Alvarez'), student('b', 'Eli', 'Boateng'), student('c', 'Noor', 'Chen')],
      [saved('a', 'submitted'), saved('b', 'draft')],
    );

    expect(rows.map(r => r.lastName)).toEqual(['Alvarez', 'Boateng', 'Chen']);
    expect(rows[0].evaluation?.status).toBe('submitted');
    expect(rows[1].evaluation?.status).toBe('draft');
    expect(rows[2].evaluation).toBeNull();
    expect(rosterProgress(rows)).toEqual({ total: 3, submitted: 1, draft: 1, notStarted: 1 });
  });

  it('drops an enrollment whose student RLS did not return', () => {
    const rows = buildRoster([enrolled('a'), enrolled('zz')], [student('a', 'Maya', 'Alvarez')], []);
    expect(rows).toHaveLength(1);
  });

  it('does not double a dancer enrolled twice in the same class', () => {
    const rows = buildRoster([enrolled('a'), enrolled('a')], [student('a', 'Maya', 'Alvarez')], []);
    expect(rows).toHaveLength(1);
  });

  it('turns a saved row into the form, and a missing one into a blank form', () => {
    const row = buildRoster([enrolled('a')], [student('a', 'Maya', 'Alvarez')], [saved('a', 'draft', { showmanship: null })])[0];
    expect(draftOf(row.evaluation)).toEqual({
      performance: 4, attendance: 5, showmanship: null, comment: 'Lovely lines', moveUp: false,
    });
    expect(draftOf(null)).toEqual({ performance: null, attendance: null, showmanship: null, comment: '', moveUp: false });
    expect(isComplete(draftOf(row.evaluation))).toBe(false);
    expect(isComplete({ ...draftOf(row.evaluation), showmanship: 2 })).toBe(true);
  });

  it('rejects a rating outside 1 to 5 rather than passing it through', () => {
    const row = buildRoster([enrolled('a')], [student('a', 'Maya', 'Alvarez')], [saved('a', 'draft', { performance: 6 })])[0];
    expect(row.evaluation?.performance).toBeNull();
  });
});

describe('words', () => {
  it('labels each rating and says when there is none', () => {
    expect(ratingLabel(1)).toBe('Needs work');
    expect(ratingLabel(5)).toBe('Outstanding');
    expect(ratingLabel(null)).toBe('Not rated');
  });

  it('counts submitted of total', () => {
    expect(progressText(12, 15)).toBe('12 of 15 submitted');
    expect(progressText(0, 0)).toBe('No dancers on the roster');
  });
});

describe('the lock a teacher sees before the form', () => {
  it('locks a teacher when the switch is off', () => {
    expect(lockReason({ enabled: false, round: 'Fall midterm' }, false)).toMatch(/closed right now/);
  });

  it('never locks an admin when a round is named', () => {
    expect(lockReason({ enabled: false, round: 'Fall midterm' }, true)).toBeNull();
  });

  it('locks everyone when no round is named, and tells an admin what to do', () => {
    expect(lockReason({ enabled: true, round: '  ' }, false)).toMatch(/No evaluation round is open/);
    expect(lockReason({ enabled: true, round: '' }, true)).toMatch(/Name one below/);
  });

  it('says nothing while the settings are still loading', () => {
    expect(lockReason(null, false)).toBeNull();
  });
});

describe('the export, as the function returns it', () => {
  const payload = {
    summary: {
      round: 'Fall midterm', total: 3, submitted: 1, draft: 1, not_started: 1,
      by_class: [{
        class_id: 'cls-1', class_name: 'Jr Ballet 2', total: 3, submitted: 1,
        missing: [
          { student_id: 'b', name: 'Eli Boateng', state: 'draft' },
          { student_id: 'c', name: 'Noor Chen', state: 'not_started' },
        ],
      }],
    },
    evaluations: [{
      student_id: 'a', class_id: 'cls-1', season: '2026-2027', first_name: 'Maya', last_name: 'Alvarez',
      class_name: 'Jr Ballet 2', category: 'academy', instructor_name: 'Jess Park', evaluation_id: 'ev-a',
      round: 'Fall midterm', performance: 4, attendance: 5, showmanship: 3, comment: 'Lovely lines',
      move_up: true, submitted_at: '2026-10-20T01:00:00Z', state: 'submitted',
    }],
  };

  it('maps the summary and the rows', () => {
    const r = toExportResult(payload);
    expect(r.summary).toMatchObject({ round: 'Fall midterm', total: 3, submitted: 1, draft: 1, notStarted: 1 });
    expect(r.summary.byClass[0].missing).toEqual([
      { studentId: 'b', name: 'Eli Boateng', state: 'draft' },
      { studentId: 'c', name: 'Noor Chen', state: 'not_started' },
    ]);
    expect(r.evaluations[0]).toMatchObject({ firstName: 'Maya', moveUp: true, state: 'submitted', performance: 4 });
  });

  it('warns how many are not filled out and names them, drafts marked', () => {
    const notice = missingNotice(toExportResult(payload).summary);
    expect(notice.headline).toBe('1 of 3 submitted — 2 not filled out (1 still a draft).');
    expect(notice.lines).toEqual(['Jr Ballet 2: Eli Boateng (draft), Noor Chen']);
  });

  it('says so plainly when everything is in, or nothing matched', () => {
    expect(missingNotice({ round: 'r', total: 4, submitted: 4, draft: 0, notStarted: 0, byClass: [] }).headline)
      .toBe('All 4 evaluations are submitted.');
    expect(missingNotice({ round: 'r', total: 0, submitted: 0, draft: 0, notStarted: 0, byClass: [] }).headline)
      .toBe('Nothing matched those filters.');
  });

  it('files each PDF under the season and class, or under the dancer', () => {
    const row = toExportResult(payload).evaluations[0];
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    expect(zipPath(row, 'class', clean)).toBe('2026-2027/jr-ballet-2/alvarez-maya-fall-midterm.pdf');
    expect(zipPath(row, 'dancer', clean)).toBe('alvarez-maya/jr-ballet-2-fall-midterm.pdf');
  });

  it('survives an empty payload', () => {
    expect(toExportResult(null).summary.total).toBe(0);
    expect(toExportResult({}).evaluations).toEqual([]);
  });
});

describe('what a family reads', () => {
  const fam = (over: Partial<FamilyEvaluation>): FamilyEvaluation => ({
    id: 'x', studentId: 'a', firstName: 'Maya', lastName: 'Alvarez', classId: 'cls-1', className: 'Jr Ballet 2',
    instructorName: null, season: '2026-2027', round: 'Fall midterm', performance: 4, attendance: 5,
    showmanship: 3, comment: '', moveUp: false, submittedAt: '2026-10-20T01:00:00Z', ...over,
  });

  it('groups by dancer, newest season first, newest round first', () => {
    const groups = groupFamilyEvaluations([
      fam({ id: '1', round: 'Fall midterm', submittedAt: '2026-10-20T01:00:00Z' }),
      fam({ id: '2', round: 'Final', submittedAt: '2027-05-01T01:00:00Z' }),
      fam({ id: '3', season: '2025-2026', round: 'Final', submittedAt: '2026-05-01T01:00:00Z' }),
      fam({ id: '4', studentId: 'b', firstName: 'Eli' }),
    ]);

    expect(groups.map(g => g.name)).toEqual(['Eli', 'Maya']);
    const maya = groups[1];
    expect(maya.seasons.map(s => s.season)).toEqual(['2026-2027', '2025-2026']);
    expect(maya.seasons[0].rounds.map(r => r.id)).toEqual(['2', '1']);
  });

  it('is empty for a family with nothing submitted', () => {
    expect(groupFamilyEvaluations([])).toEqual([]);
  });
});

describe('the default season for a filter', () => {
  it('is the season most classes are in, newest on a tie', () => {
    expect(currentSeason([{ season: '2026-2027' }, { season: '2026-2027' }, { season: '2025-2026' }])).toBe('2026-2027');
    expect(currentSeason([{ season: '2025-2026' }, { season: '2026-2027' }])).toBe('2026-2027');
    expect(currentSeason([{ season: null }])).toBeNull();
  });
});

describe('submit all, from the roster', () => {
  const row = (id: string, first: string, ev: any) => ({ studentId: id, firstName: first, lastName: 'Chen', evaluation: ev });
  const ev = (status: 'draft' | 'submitted', over: any = {}) => ({
    id: `ev-${status}`, studentId: 'x', classId: 'c', season: 's', round: 'r',
    performance: 4, attendance: 5, showmanship: 3, comment: '', moveUp: false, status,
    submittedAt: null, updatedAt: null, ...over,
  });

  it('sends only complete drafts, and names everyone it leaves behind', () => {
    const plan = planSubmitAll([
      row('a', 'Ada', ev('draft')),
      row('b', 'Bo', ev('draft', { showmanship: null })),
      row('c', 'Cy', null),
      row('d', 'Di', ev('submitted')),
    ]);
    expect(plan.ready.map((r: any) => r.firstName)).toEqual(['Ada']);
    expect(plan.incomplete.map((r: any) => r.firstName)).toEqual(['Bo']);
    expect(plan.notStarted.map((r: any) => r.firstName)).toEqual(['Cy']);
    expect(plan.submitted.map((r: any) => r.firstName)).toEqual(['Di']);
    expect(submitAllSummary(plan)).toBe(
      '1 evaluation is complete and will be sent to families. Still missing a rating, left as drafts: Bo Chen. Not started: Cy Chen.',
    );
  });

  it('says so when nothing is ready, and when everything is already in', () => {
    expect(submitAllSummary(planSubmitAll([row('c', 'Cy', null)]))).toMatch(/^Nothing is ready to submit yet\./);
    expect(submitAllSummary(planSubmitAll([row('d', 'Di', ev('submitted'))]))).toBe('Everything is already submitted.');
  });
});
