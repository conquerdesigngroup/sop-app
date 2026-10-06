import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EnrollmentImportModal, { describeFailure } from './EnrollmentImportModal';
import { RefreshProvider, useRefresh } from '../../contexts/RefreshContext';
import { EnrollmentImportResult } from '../../lib/enrollmentImport';

/**
 * The roster sync screen, driven the way the office drives it.
 *
 * The rules are tested against a real Postgres in scripts/sql-tests; what is
 * pinned here is the screen's half of the contract (CLAUDE.md, "Slow taps"):
 *
 *   - choosing a file previews it at once, with a bar and words, and the
 *     preview can be abandoned;
 *   - Apply disables itself and a second tap starts nothing — including one
 *     landing before the re-render that disables it;
 *   - it ends on a sentence saying what happened, or what refused and why;
 *   - what the database says blocks a whole file is shown, and Apply is not
 *     offered; a place that cannot be dropped yet is listed, and the rest goes;
 *   - a large drop, a large addition and an export older than the last sync
 *     wait for a confirmation in words;
 *   - a week with only tag changes, or a family seen for the first time, still
 *     offers to save them;
 *   - an apply that does not answer says so, and then lets the dialog close;
 *   - the first sync can only record a starting point, and shows nothing to act on;
 *   - the preview re-checks itself on refresh, and says so when it changed.
 *
 * Every name and address here is invented. The repo is public.
 */

const mockRun = jest.fn();
jest.mock('../../lib/enrollmentImport', () => {
  const actual = jest.requireActual('../../lib/enrollmentImport');
  return { ...actual, runEnrollmentImport: (...args: unknown[]) => mockRun(...args) };
});

const HEADER = 'Contact Id,First Name,Last Name,Phone,Email,Last Activity,Tags,All Students,DI Notes';
const CSV = `${HEADER}\n` +
  'c-100,Pat,Alvarez,,alvarez@example.com,Sep 24 2026 09:10 AM,"mini jazz 1 (dana/m-4pm), open tap (lee/f-7pm)",Maya Alvarez,\n' +
  'c-200,Jo,Boateng,,boateng@example.com,Sep 23 2026 04:00 PM,"junior ballet 2 (lee/t-5pm)","Eli Boateng\nNoor Boateng",';

const COUNTS: EnrollmentImportResult['counts'] = {
  contacts: 2, families: 2, adds: 1, drops: 1, held_drops: 0, unassigned: 0, conflicts: 0, blocked: 0,
  first_seen_families: 0, new_families: 0, new_dancers: 0, not_imported: 0, merged_contacts: 0,
  email_conflicts: 0, missing_families: 0, held_untagged: 0, tagged_unheld: 0, spelling_matches: 0,
  memory_changes: 2, unmatched_class_tags: 0,
};

const plan = (over: Partial<EnrollmentImportResult> = {}): EnrollmentImportResult => ({
  mode: 'preview',
  filename: 'contacts.csv',
  as_of: '2026-10-01',
  drop_day: '2026-09-30',
  first_import: false,
  last_sync_on: '2026-09-24',
  plan_hash: 'plan-hash-1',
  baseline_hash: 'baseline-hash-1',
  confirm_drops: false,
  confirm_adds: false,
  counts: COUNTS,
  adds: [{
    student_id: 's-1', student_name: 'Maya Alvarez', new_dancer: false, household_id: 'h-1',
    family: 'Alvarez', email: 'alvarez@example.com', class_id: 'k-5', class_name: 'Open Tap',
    day_of_week: 5, start_time: '19:00:00', reason: 'only_dancer',
  }],
  drops: [{
    enrollment_id: 'e-9', student_id: 's-3', student_name: 'Noor Boateng', household_id: 'h-2',
    family: 'Boateng', email: 'boateng@example.com', class_id: 'k-2', class_name: 'Teen Hip Hop',
    day_of_week: 3, start_time: '18:00:00', enrolled_on: '2026-08-31', last_day: '2026-09-30',
  }],
  held_drops: [],
  whole_class_drops: [],
  unassigned: [],
  conflicts: [],
  blocked: [],
  first_seen_families: [],
  new_families: [],
  not_imported: [],
  merged_contacts: [],
  email_conflicts: [],
  missing_families: [],
  held_untagged: [],
  tagged_unheld: [],
  unmatched_tags: [],
  spelling_matches: [],
  memory_changes: { added: 1, removed: 1, families_seen: 0 },
  baseline_counts: { families: 2, tags: 3 },
  ...over,
});

const FP = {
  attendance: { rows: 16, md5: 'a' }, sessions: { rows: 40, md5: 'b' },
  history: { rows: 16, md5: 'c' }, past_rosters: { rows: 30, md5: 'd', before: '2026-10-01' },
};

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const chooseFile = (csv = CSV, name = 'contacts.csv') => {
  const input = screen.getByLabelText('Contacts CSV file');
  fireEvent.change(input, { target: { files: [new File([csv], name, { type: 'text/csv' })] } });
};

let refreshNow: (() => Promise<unknown>) | null = null;
const RefreshProbe: React.FC = () => {
  const { refresh } = useRefresh();
  refreshNow = () => refresh('manual');
  return null;
};

const renderModal = (onApplied = jest.fn(), onClose = jest.fn()) => {
  render(
    <RefreshProvider>
      <RefreshProbe />
      <EnrollmentImportModal isOpen onClose={onClose} onApplied={onApplied} />
    </RefreshProvider>,
  );
  return { onApplied, onClose };
};

beforeEach(() => {
  refreshNow = null;
});

it('previews a chosen file straight away, says so while it waits, and Cancel abandons it', async () => {
  const first = deferred<EnrollmentImportResult>();
  mockRun.mockReturnValueOnce(first.promise);
  renderModal();

  chooseFile();
  expect(await screen.findByRole('progressbar', { name: /comparing with the rosters/i })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Comparing 2 contacts with the class rosters — this takes a few seconds. Keep this page open.');

  // Only what the RPC needs left the browser: no phone, notes or activity date.
  const [mode, contacts, expected, filename] = mockRun.mock.calls[0];
  expect([mode, expected, filename]).toEqual(['preview', null, 'contacts.csv']);
  expect(contacts).toEqual([
    expect.objectContaining({ contact_id: 'c-100', tags: ['mini jazz 1 (dana/m-4pm)', 'open tap (lee/f-7pm)'], students: ['Maya Alvarez'] }),
    expect.objectContaining({ contact_id: 'c-200', students: ['Eli Boateng', 'Noor Boateng'] }),
  ]);
  expect(JSON.stringify(contacts)).not.toMatch(/Sep 2[34]/);

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Choose CSV file' })).toBeInTheDocument();

  // The abandoned preview arriving late changes nothing.
  await act(async () => { first.resolve(plan()); });
  expect(screen.queryByText(/to add/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Choose CSV file' })).toBeInTheDocument();
});

it('refuses a file that is not the contacts export before anything is sent', async () => {
  renderModal();
  chooseFile('Title,Location,Days\nMini Jazz 1 (dana/m-4pm),Studio,Mon', 'classes.csv');
  expect(await screen.findByText(/looks like a different export/)).toBeInTheDocument();
  expect(mockRun).not.toHaveBeenCalled();
});

it('applies once however often Apply is tapped, shows progress, and ends saying what happened', async () => {
  mockRun.mockResolvedValueOnce(plan());
  const { onApplied } = renderModal();
  chooseFile();

  expect(await screen.findByText('1 to add · 1 to drop')).toBeInTheDocument();
  expect(screen.getByText('Maya Alvarez')).toBeInTheDocument();
  expect(screen.getByText(/→ Open Tap · Fri 7:00 PM/)).toBeInTheDocument();
  expect(screen.getByText(/leaves Teen Hip Hop · Wed 6:00 PM/)).toBeInTheDocument();
  expect(screen.getByText(/last on the roster Wed 30 Sep/)).toBeInTheDocument();
  expect(screen.getByText(/New places start Thu 1 Oct\. A dancer who leaves is on the roster up to and including Wed 30 Sep\./))
    .toBeInTheDocument();

  const applied = deferred<EnrollmentImportResult>();
  mockRun.mockReturnValueOnce(applied.promise);
  const button = screen.getByRole('button', { name: 'Apply 2 changes' });
  // Two taps inside one turn: the second lands before React re-renders the
  // button as disabled, so only the busy ref stands in its way.
  act(() => { button.click(); button.click(); });
  fireEvent.click(button);

  expect(screen.getByRole('progressbar', { name: /applying the roster changes/i })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Applying 2 changes — this takes a few seconds. Keep this page open.');
  expect(screen.getByRole('status')).toHaveTextContent('either every change goes through or none does');
  expect(screen.getByRole('button', { name: /applying/i })).toBeDisabled();
  expect(mockRun).toHaveBeenCalledTimes(2);
  expect(mockRun.mock.calls[1].slice(0, 3)).toEqual(['apply', expect.any(Array), 'plan-hash-1']);
  expect(mockRun.mock.calls[1][4]).toBe(false);

  await act(async () => {
    applied.resolve(plan({ mode: 'apply', applied: true, fingerprint: { before: FP, after: FP } }));
  });
  expect(await screen.findByText('Done — 1 dancer added, 1 dropped.')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Attendance is unchanged (16 marks before and after)');
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(onApplied).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
});

it('says what refused an apply, that nothing changed, and offers only a fresh preview', async () => {
  mockRun.mockResolvedValueOnce(plan());
  renderModal();
  chooseFile();
  const apply = await screen.findByRole('button', { name: 'Apply 2 changes' });

  mockRun.mockRejectedValueOnce(new Error(
    'The rosters, the class list or the date have changed since this preview. Preview the file again, then apply.'));
  fireEvent.click(apply);
  expect(await screen.findByText(/changed since this preview/)).toBeInTheDocument();
  expect(screen.getByText('Tap Preview again to see the rosters as they are now.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Apply/ })).toBeNull();

  mockRun.mockResolvedValueOnce(plan({ plan_hash: 'plan-hash-2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview again' }));
  expect(await screen.findByRole('button', { name: 'Apply 2 changes' })).toBeEnabled();
  expect(mockRun.mock.calls.map(c => c[0])).toEqual(['preview', 'apply', 'preview']);
});

it('shows what blocks a whole file and does not offer to apply it', async () => {
  mockRun.mockResolvedValueOnce(plan({
    counts: { ...COUNTS, blocked: 1 },
    blocked: [{
      kind: 'class', reason: 'duplicate_class_title', on: null, detail: 'old jazz (x/m-5pm)',
      student_name: null, class_name: null, day_of_week: null, start_time: null,
    }],
  }));
  renderModal();
  chooseFile();

  expect(await screen.findByText(
    'More than one class has the Enrolio title "old jazz (x/m-5pm)", so its tag cannot be told apart. Keep ' +
    'exactly one of them switched on in the app, or rename one in Enrolio and import classes again.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Can’t apply yet' })).toBeDisabled();
});

it('lists a place that cannot be dropped yet for a person, and still applies the rest', async () => {
  mockRun.mockResolvedValueOnce(plan({
    counts: { ...COUNTS, held_drops: 2 },
    held_drops: [{
      student_id: 's-3', student_name: 'Noor Boateng', family: 'Boateng', reason: 'starts_after_drop_day',
      on: '2026-10-20', class_id: 'k-2', class_name: 'Teen Hip Hop', day_of_week: 3, start_time: '18:00:00',
    }, {
      student_id: 's-2', student_name: 'Eli Boateng', family: 'Boateng', reason: 'marked_after_drop_day',
      on: '2026-10-01', class_id: 'k-1', class_name: 'Mini Jazz 1', day_of_week: 1, start_time: '16:00:00',
    }],
  }));
  renderModal();
  chooseFile();

  expect(await screen.findByText(
    'the place starts Tue 20 Oct, but the tag is gone from Enrolio. If they are not coming, the place has to ' +
    'be ended by hand; left alone, a sync from Wed 21 Oct drops it.')).toBeInTheDocument();
  expect(screen.getByText(
    'was marked in this class on Thu 1 Oct, after the tag went from Enrolio. If they have left, sync again ' +
    'tomorrow and the place is dropped; if not, put the tag back in Enrolio.')).toBeInTheDocument();
  expect(screen.getByText('1 to add · 1 to drop · 2 for a person to decide')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply 2 changes' })).toBeEnabled();
});

it('waits for the large-drop confirmation, and sends it', async () => {
  mockRun.mockResolvedValueOnce(plan({ confirm_drops: true }));
  renderModal();
  chooseFile();
  const apply = await screen.findByRole('button', { name: 'Apply 2 changes' });
  expect(apply).toBeDisabled();

  fireEvent.click(screen.getByLabelText(/really left/));
  expect(apply).toBeEnabled();

  mockRun.mockResolvedValueOnce(plan({ applied: true, fingerprint: { before: FP, after: FP } }));
  fireEvent.click(apply);
  await waitFor(() => expect(mockRun).toHaveBeenCalledTimes(2));
  expect(mockRun.mock.calls[1][4]).toBe(true);
});

it('says a whole class lost its tag in words that hold, held places apart', async () => {
  mockRun.mockResolvedValueOnce(plan({
    whole_class_drops: [{ class_id: 'k-2', class_name: 'Teen Hip Hop', day_of_week: 3, start_time: '18:00:00', dropping: 1, held: 1, families: 2 }],
  }));
  renderModal();
  chooseFile();
  expect(await screen.findByText('Teen Hip Hop · Wed 6:00 PM — the tag is gone from every family in this file tagged for it'))
    .toBeInTheDocument();
  expect(screen.getByText('1 dancer to drop · 1 held · 2 families')).toBeInTheDocument();
});

it('waits for both confirmations when a sync is large both ways, and sends them', async () => {
  mockRun.mockResolvedValueOnce(plan({
    confirm_drops: true, confirm_adds: true, counts: { ...COUNTS, adds: 1, new_families: 12 },
  }));
  renderModal();
  chooseFile();
  const apply = await screen.findByRole('button', { name: 'Apply 14 changes' });
  expect(screen.getByText(/This adds 1 place and 12 new families at\s+once — more than a usual week\./)).toBeInTheDocument();
  expect(apply).toBeDisabled();

  fireEvent.click(screen.getByLabelText(/these places and families are right/));
  expect(apply).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/really left/));
  expect(apply).toBeEnabled();

  mockRun.mockResolvedValueOnce(plan({ applied: true, fingerprint: { before: FP, after: FP } }));
  fireEvent.click(apply);
  await waitFor(() => expect(mockRun).toHaveBeenCalledTimes(2));
  expect(mockRun.mock.calls[1][4]).toBe(true);
});

it('waits for a confirmation before applying a file older than the last sync', async () => {
  // The file's newest activity is 24 Sep; the rosters were synced on the 28th.
  mockRun.mockResolvedValueOnce(plan({ last_sync_on: '2026-09-28' }));
  renderModal();
  chooseFile();
  expect(await screen.findByText(/The newest activity in this file is from Thu 24 Sep, but the rosters were\s+last synced on Mon 28 Sep/))
    .toBeInTheDocument();
  const apply = screen.getByRole('button', { name: 'Apply 2 changes' });
  expect(apply).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/this is the export I mean to apply/));
  expect(apply).toBeEnabled();
});

it('offers to save tag changes in a week with no roster change', async () => {
  mockRun.mockResolvedValueOnce(plan({
    counts: { ...COUNTS, adds: 0, drops: 0, memory_changes: 2 }, adds: [], drops: [],
    memory_changes: { added: 1, removed: 1, families_seen: 0 },
  }));
  renderModal();
  chooseFile();
  expect(await screen.findByText('No roster changes in this file')).toBeInTheDocument();
  expect(screen.getByText(/2 tags changed in Enrolio/)).toBeInTheDocument();

  mockRun.mockResolvedValueOnce(plan({
    counts: { ...COUNTS, adds: 0, drops: 0, memory_changes: 2 }, adds: [], drops: [],
    applied: true, fingerprint: { before: FP, after: FP },
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Save for the next sync' }));
  expect(await screen.findByText('Saved for the next sync — no roster changes.')).toBeInTheDocument();
  expect(mockRun.mock.calls[1][0]).toBe('apply');
});

it('says a first-seen family\'s tags are its own, not tags that changed in Enrolio', async () => {
  mockRun.mockResolvedValueOnce(plan({
    counts: { ...COUNTS, adds: 0, drops: 0, first_seen_families: 1, memory_changes: 4 }, adds: [], drops: [],
    memory_changes: { added: 3, removed: 0, families_seen: 1 },
    first_seen_families: [{ household_id: 'h-7', family: 'Gupta', email: 'gupta@example.com', tags: 3, active_enrollments: 1 }],
  }));
  renderModal();
  chooseFile();
  expect(await screen.findByText(/No roster changes, but 1 family is in a sync for the first time, with 3 class tags to record\./))
    .toBeInTheDocument();
  expect(screen.queryByText(/changed in Enrolio/)).toBeNull();
});

it('offers to save a family seen for the first time with no class tag, and asks nobody to check it', async () => {
  mockRun.mockResolvedValueOnce(plan({
    counts: { ...COUNTS, adds: 0, drops: 0, first_seen_families: 1, memory_changes: 1 }, adds: [], drops: [],
    memory_changes: { added: 0, removed: 0, families_seen: 1 },
    first_seen_families: [{ household_id: 'h-7', family: 'Gupta', email: 'gupta@example.com', tags: 0, active_enrollments: 0 }],
  }));
  renderModal();
  chooseFile();
  expect(await screen.findByText(/1 family is in a sync for the first time\. Saving keeps the next sync right/)).toBeInTheDocument();
  expect(screen.getByText(/1 family in a sync for the first time, with no class tags — nothing to check/)).toBeInTheDocument();
  expect(screen.queryByText(/for a person/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Save for the next sync' })).toBeEnabled();
});

it('offers only a starting point on the first sync, with nothing to act on shown', async () => {
  mockRun.mockResolvedValueOnce(plan({
    first_import: true, last_sync_on: null,
    new_families: [{ row: 9, contact_id: 'c-9', email: 'ito@example.com', contact_name: 'Ken Ito', family: 'Ito', dancers: ['Mei Ito'] }],
  }));
  const { onApplied } = renderModal();
  chooseFile();

  expect(await screen.findByText('First sync — nothing will change on the rosters')).toBeInTheDocument();
  expect(screen.getByText(/This records the 3 class tags in this file, and the\s+2 families it lists/)).toBeInTheDocument();
  expect(screen.getByText(/1 contact in this file is not in the app yet\. The first sync after this one adds it\./)).toBeInTheDocument();
  expect(screen.queryByText(/to add/i)).toBeNull();
  expect(screen.queryByText('Maya Alvarez')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Apply/ })).toBeNull();

  mockRun.mockResolvedValueOnce(plan({ mode: 'baseline', first_import: true, recorded: true, tags_recorded: 3 }));
  fireEvent.click(screen.getByRole('button', { name: 'Record as starting point' }));
  expect(await screen.findByText('Starting point recorded — 3 class tags across 2 families.')).toBeInTheDocument();
  expect(mockRun.mock.calls[1][0]).toBe('baseline');
  expect(mockRun.mock.calls[1][2]).toBe('baseline-hash-1');
  expect(onApplied).toHaveBeenCalledTimes(1);
});

it('lists what needs a person, says what resolves it, and offers no Apply when nothing would change', async () => {
  mockRun.mockResolvedValueOnce(plan({
    counts: { ...COUNTS, adds: 0, drops: 0, unassigned: 4, first_seen_families: 1, memory_changes: 0 },
    adds: [],
    drops: [],
    memory_changes: { added: 0, removed: 0, families_seen: 0 },
    unassigned: [{
      household_id: 'h-2', family: 'Boateng', email: 'boateng@example.com', class_id: 'k-5',
      class_name: 'Open Tap', day_of_week: 5, start_time: '19:00:00', age_min: null, age_max: null,
      reason: 'several_siblings_in_age_range',
      dancers: [{ name: 'Eli Boateng', age: 6 }, { name: 'Noor Boateng', age: 10 }],
      export_names: ['Eli Boateng', 'Noor Boateng'], unknown_names: [], inactive_names: [],
    }, {
      household_id: 'h-1', family: 'Alvarez', email: 'alvarez@example.com', class_id: 'k-1',
      class_name: 'Mini Jazz 1', day_of_week: 1, start_time: '16:00:00', age_min: 5, age_max: 7,
      reason: 'export_names_unknown_dancer',
      dancers: [{ name: 'Maya Alvarez', age: 14 }],
      export_names: ['Tomas Alvarez', 'Mya Alvarez'],
      unknown_names: [{ name: 'Mya Alvarez', likely: 'Maya Alvarez' }, { name: 'Tomas Alvarez', likely: null }],
      inactive_names: [],
    }, {
      household_id: 'h-3', family: 'Eriksen', email: 'eriksen@example.com', class_id: 'k-1',
      class_name: 'Mini Jazz 1', day_of_week: 1, start_time: '16:00:00', age_min: 5, age_max: 7,
      reason: 'only_dancer_outside_age_range',
      dancers: [{ name: 'Ingrid Eriksen', age: 13 }],
      export_names: [], unknown_names: [], inactive_names: [],
    }, {
      household_id: 'h-4', family: 'Chen', email: 'chen@example.com', class_id: 'k-3',
      class_name: 'Junior Ballet', day_of_week: 2, start_time: '17:00:00', age_min: 8, age_max: 11,
      reason: 'export_names_inactive_dancer',
      dancers: [{ name: 'Otis Chen', age: 7 }],
      export_names: ['Tomas Chen'], unknown_names: [], inactive_names: [{ name: 'Tomas Chen', dancer: 'Tomas Chen' }],
    }],
    first_seen_families: [{ household_id: 'h-7', family: 'Gupta', email: 'gupta@example.com', tags: 3, active_enrollments: 1 }],
  }));
  renderModal();
  chooseFile();

  expect(await screen.findByText(
    'Eli Boateng (6), Noor Boateng (10) — the class has no age range, so it could be any of them. ' +
    'The app cannot choose for you: correct the tag in Enrolio, or have the place added by hand.')).toBeInTheDocument();
  expect(screen.getByText(
    'Enrolio lists Mya Alvarez — perhaps Maya Alvarez, spelled differently. If so, the two spellings need to ' +
    'match — in Enrolio, or in the app by hand — and the next sync places this tag. If not, add them with the ' +
    'roster import (with a birthday). Enrolio lists Tomas Alvarez, who is not in the app. If new, add them with ' +
    'the roster import (with a birthday), and the next sync places this tag.')).toBeInTheDocument();
  expect(screen.getByText(
    'Enrolio lists Tomas Chen, marked inactive in the app — probably back. If so, have them set active by hand, ' +
    'and the next sync places this tag.')).toBeInTheDocument();
  expect(screen.getByText(/Ingrid Eriksen \(13\) is the family’s only dancer, and this class is for dancers aged 5–7 — 3 or more years off\./))
    .toBeInTheDocument();
  expect(screen.getByText(/first time in a sync/)).toBeInTheDocument();
  expect(screen.getByText('5 for a person to decide')).toBeInTheDocument();
  expect(screen.getByText(/except a family seen for the first time/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Apply|Save for the next sync/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
});

it('lists the names it took for a dancer the app spells differently', async () => {
  mockRun.mockResolvedValueOnce(plan({
    counts: { ...COUNTS, spelling_matches: 1 },
    spelling_matches: [{ family: 'Alvarez', export_name: 'Maya Lucia Alvarez', dancer: 'Maya Alvarez' }],
  }));
  renderModal();
  chooseFile();
  const fold = await screen.findByText(/1 name in Enrolio spelled differently from the app — taken as the same dancer/);
  fireEvent.click(fold);
  expect(screen.getByText('Maya Lucia Alvarez → Maya Alvarez')).toBeInTheDocument();
});

it('says so when an apply does not answer, and then lets the dialog close', async () => {
  mockRun.mockResolvedValueOnce(plan());
  const { onClose } = renderModal();
  chooseFile();
  const apply = await screen.findByRole('button', { name: 'Apply 2 changes' });

  jest.useFakeTimers();
  try {
    mockRun.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(apply);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    act(() => { jest.advanceTimersByTime(44_000); });
    expect(screen.getByRole('status')).not.toHaveTextContent('Still waiting');

    act(() => { jest.advanceTimersByTime(1_000); });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Still no answer — the connection may have dropped. You can close this now: the sync either went through ' +
      'completely or changed nothing. Preview the file again to see which');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }

  // Opened again, a new preview offers Cancel, not a leftover Close.
  mockRun.mockResolvedValueOnce(plan());
  chooseFile();
  expect(await screen.findByRole('button', { name: 'Apply 2 changes' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
});

it('re-checks the preview on refresh, and says so — and asks again — when it changed', async () => {
  mockRun.mockResolvedValueOnce(plan({ confirm_drops: true }));
  renderModal();
  chooseFile();
  await screen.findByRole('button', { name: 'Apply 2 changes' });
  fireEvent.click(screen.getByLabelText(/really left/));
  expect(screen.getByRole('button', { name: 'Apply 2 changes' })).toBeEnabled();

  mockRun.mockResolvedValueOnce(plan({
    plan_hash: 'plan-hash-2',
    confirm_drops: true,
    counts: { ...COUNTS, adds: 2 },
    adds: [...plan().adds, { ...plan().adds[0], student_name: 'Eli Boateng', student_id: 's-2' }],
  }));
  await act(async () => { await refreshNow!(); });
  expect(await screen.findByText(/Updated just now — the rosters changed while this was open/)).toBeInTheDocument();
  // The confirmation was for the old list; it has to be given again.
  expect(screen.getByRole('button', { name: 'Apply 3 changes' })).toBeDisabled();
  expect(mockRun.mock.calls.map(c => c[0])).toEqual(['preview', 'preview']);

  fireEvent.click(screen.getByLabelText(/really left/));
  mockRun.mockResolvedValueOnce(plan({ applied: true, fingerprint: { before: FP, after: FP } }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply 3 changes' }));
  await waitFor(() => expect(mockRun).toHaveBeenCalledTimes(3));
  // Applying sends the hash of the preview now on screen.
  expect(mockRun.mock.calls[2][2]).toBe('plan-hash-2');
});

describe('describeFailure', () => {
  it('shows the database’s own sentence as written', () => {
    expect(describeFailure(new Error('Nothing was changed — sync again tomorrow.'), 'x'))
      .toBe('Nothing was changed — sync again tomorrow.');
    expect(describeFailure(new Error('Not authorised'), 'x')).toBe('Not authorised.');
  });

  it('blames the connection only when the request never arrived', () => {
    expect(describeFailure(new TypeError('Failed to fetch'), 'x'))
      .toBe('Couldn’t reach the database. Check your connection and try again.');
    expect(describeFailure(new Error(''), 'The sync failed.'))
      .toBe('The sync failed. Check your connection and try again.');
  });
});
