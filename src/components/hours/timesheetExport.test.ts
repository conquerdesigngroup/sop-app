import { WorkHoursEntry, WorkHoursPay } from '../../types';
import { EmployeeRollup, PayrollLookups } from './payrollExport';
import { DEFAULT_COLUMNS, MINIMAL_COLUMNS, PDF_DEFAULT_COLUMNS, buildFlatCSV, orderColumns } from './timesheetExport';

/** Same minimal RFC-4180 reader as payrollExport.test — every cell is quoted. */
const parseCSV = (csv: string): string[][] =>
  csv.split('\r\n').map(line => {
    const cells: string[] = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
        else if (c === '"') inQuotes = false;
        else cell += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { cells.push(cell); cell = ''; }
      else cell += c;
    }
    cells.push(cell);
    return cells;
  });

const entry = (over: Partial<WorkHoursEntry> & Pick<WorkHoursEntry, 'id' | 'employeeId'>): WorkHoursEntry => ({
  workDate: '2026-08-03',
  startTime: '09:00',
  endTime: '17:00',
  breakMinutes: 0,
  totalHours: 8,
  status: 'approved',
  createdBy: over.employeeId,
  createdAt: '2026-08-03T18:00:00Z',
  ...over,
});

const rollup = (over: Partial<EmployeeRollup> & Pick<EmployeeRollup, 'employeeId' | 'name'>): EmployeeRollup => ({
  email: `${over.employeeId}@example.com`,
  entries: [],
  total: 0,
  approved: 0,
  pending: 0,
  rejected: 0,
  days: 0,
  approvedPay: 0,
  estimatedPendingPay: 0,
  missingRateCount: 0,
  ...over,
});

const RANGE = { start: '2026-08-01', end: '2026-08-31', label: 'This month' };

// Alice worked two "Teaching" shifts either side of a raise: 8 hrs frozen at
// 25.00, then 4 hrs frozen at 30.00. Bob has 5 pending hrs at today's 20.00
// and 3 hrs that were rejected. Dana logged nothing.
const ALICE_1 = entry({ id: 'a1', employeeId: 'alice', workDate: '2026-08-03', categoryId: 'teach', totalHours: 8 });
const ALICE_2 = entry({ id: 'a2', employeeId: 'alice', workDate: '2026-08-17', categoryId: 'teach', totalHours: 4, endTime: '13:00' });
const BOB_PENDING = entry({ id: 'b1', employeeId: 'bob', workDate: '2026-08-10', categoryId: 'front', totalHours: 5, status: 'pending', endTime: '14:00' });
const BOB_REJECTED = entry({ id: 'b2', employeeId: 'bob', workDate: '2026-08-11', categoryId: 'front', totalHours: 3, status: 'rejected', endTime: '12:00' });

const FROZEN: Record<string, WorkHoursPay> = {
  a1: { workHoursId: 'a1', rateSnapshot: 25, payAmount: 200, rateMissing: false, frozenAt: '2026-08-04T00:00:00Z' },
  a2: { workHoursId: 'a2', rateSnapshot: 30, payAmount: 120, rateMissing: false, frozenAt: '2026-08-18T00:00:00Z' },
};

const CATEGORIES: Record<string, string> = { teach: 'Teaching', front: 'Front desk' };
const RATES: Record<string, number> = { 'bob|front': 20 };

const lookups: PayrollLookups = {
  getCategoryName: id => (id ? CATEGORIES[id] : undefined),
  getFrozenPay: id => FROZEN[id],
  getRate: (employeeId, categoryId) => RATES[`${employeeId}|${categoryId}`],
};

const ALICE = rollup({
  employeeId: 'alice', name: 'Alice Adams',
  entries: [ALICE_2, ALICE_1],
  total: 12, approved: 12, days: 2, approvedPay: 320,
});
const BOB = rollup({
  employeeId: 'bob', name: 'Bob Zimmer',
  entries: [BOB_PENDING, BOB_REJECTED],
  total: 5, pending: 5, rejected: 3, days: 2, estimatedPendingPay: 100,
});
const DANA = rollup({ employeeId: 'dana', name: 'Dana Cole' });

const ROLLUPS = [BOB, ALICE, DANA];

/**
 * Look a column up by its header rather than by position. Columns are chosen
 * at runtime now, so a fixed index is only ever right for one column set.
 */
const col = (rows: string[][], header: string): number => {
  const i = rows[0].indexOf(header);
  if (i < 0) throw new Error(`no "${header}" column in [${rows[0].join(', ')}]`);
  return i;
};
const cell = (rows: string[][], row: string[], header: string) => row[col(rows, header)];

describe('buildFlatCSV', () => {
  it('is a rectangle: one header row, one row per shift, and nothing else', () => {
    const { csv, rowCount, employeeCount } = buildFlatCSV({ rollups: ROLLUPS, range: RANGE, lookups });
    const rows = parseCSV(csv);

    // 4 shifts across Alice and Bob. Dana logged nothing and gets no row —
    // an empty row is a signal on the panel, but noise in an import.
    expect(rowCount).toBe(4);
    expect(employeeCount).toBe(2);
    expect(rows).toHaveLength(5);

    // The thing that makes it importable: no titled blocks, no subtotals, no
    // TEAM TOTAL. Every row after the header is a shift.
    rows.slice(1).forEach(r => {
      expect(cell(rows, r, 'Date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(cell(rows, r, 'Employee')).not.toMatch(/TOTAL/i);
    });

    // Every row is the same width, or a spreadsheet shears the columns.
    const width = rows[0].length;
    rows.forEach(r => expect(r).toHaveLength(width));
  });

  it('prices each approved shift at the rate frozen on the day, not today’s', () => {
    const rows = parseCSV(buildFlatCSV({ rollups: [ALICE], range: RANGE, lookups }).csv);

    // Ascending by date — a timesheet reads forwards, unlike the panel.
    const [, first, second] = rows;
    expect(cell(rows, first, 'Date')).toBe('2026-08-03');
    expect(cell(rows, first, 'Hourly rate')).toBe('25.00');
    expect(cell(rows, first, 'Amount')).toBe('200.00');

    expect(cell(rows, second, 'Date')).toBe('2026-08-17');
    expect(cell(rows, second, 'Hourly rate')).toBe('30.00');   // she had a raise mid-period
    expect(cell(rows, second, 'Amount')).toBe('120.00');
  });

  it('keeps a rejected shift visible but leaves its Amount blank, never 0.00', () => {
    const rows = parseCSV(buildFlatCSV({ rollups: [BOB], range: RANGE, lookups }).csv);
    const rejected = rows.find(r => cell(rows, r, 'Status') === 'rejected')!;

    expect(cell(rows, rejected, 'Hours')).toBe('3.00');
    expect(cell(rows, rejected, 'Work category')).toBe('Front desk');
    // A 0.00 would be summed into a payment by a naive import; a blank cannot.
    expect(cell(rows, rejected, 'Amount')).toBe('');
    expect(cell(rows, rejected, 'Hourly rate')).toBe('');
  });

  it('labels a pending shift as an estimate rather than passing it off as owed', () => {
    const rows = parseCSV(buildFlatCSV({ rollups: [BOB], range: RANGE, lookups }).csv);
    const pending = rows.find(r => cell(rows, r, 'Status') === 'pending')!;

    expect(cell(rows, pending, 'Amount')).toBe('100.00');
    expect(cell(rows, pending, 'Pay basis')).toMatch(/estimate/i);
  });

  it('names the file after the person when one is exported, and by range otherwise', () => {
    expect(buildFlatCSV({ rollups: [ALICE], range: RANGE, lookups, subject: 'Alice Adams' }).filename)
      .toBe('hours_alice-adams_2026-08-01_to_2026-08-31.csv');

    expect(buildFlatCSV({ rollups: ROLLUPS, range: RANGE, lookups }).filename)
      .toBe('hours_2026-08-01_to_2026-08-31.csv');

    expect(buildFlatCSV({
      rollups: ROLLUPS,
      range: { start: '0000-01-01', end: '9999-12-31', label: 'All time' },
      lookups,
    }).filename).toBe('hours_all-time.csv');
  });

  it('reports zero rows for a period nobody worked, rather than a header-only file', () => {
    expect(buildFlatCSV({ rollups: [DANA], range: RANGE, lookups }).rowCount).toBe(0);
  });
});

describe('column selection', () => {
  it('exports only the columns asked for, in the declared order not the picked order', () => {
    const rows = parseCSV(buildFlatCSV({
      rollups: [ALICE],
      range: RANGE,
      lookups,
      // Deliberately out of order — the file must still read left to right.
      columns: ['hours', 'employee', 'category'],
    }).csv);

    expect(rows[0]).toEqual(['Employee', 'Hours', 'Work category']);
    expect(rows[1]).toEqual(['Alice Adams', '8.00', 'Teaching']);
  });

  it('offers a “just hours and category” set that still says who and when', () => {
    const rows = parseCSV(buildFlatCSV({
      rollups: [ALICE], range: RANGE, lookups, columns: MINIMAL_COLUMNS,
    }).csv);

    // Without the person and the date the rows cannot be told apart, so both
    // stay in the minimal set.
    expect(rows[0]).toEqual(['Employee', 'Date', 'Hours', 'Work category']);
    expect(rows).toHaveLength(3);
  });

  it('leaves the internal employee id out of the default set', () => {
    expect(DEFAULT_COLUMNS).not.toContain('employeeId');
    expect(orderColumns(['employeeId', 'hours']).map(c => c.key)).toEqual(['employeeId', 'hours']);
  });

  it('keeps Pay basis in the spreadsheet but off the printed page by default', () => {
    // The CSV is where someone questions a figure and needs the reasoning;
    // on paper it just repeats the Status column and eats the width.
    expect(DEFAULT_COLUMNS).toContain('basis');
    expect(PDF_DEFAULT_COLUMNS).not.toContain('basis');

    // Nothing else differs — this is one column, not a separate column model.
    expect(DEFAULT_COLUMNS.filter(c => c !== 'basis')).toEqual(PDF_DEFAULT_COLUMNS);
  });

  it('ignores a column key it does not know rather than emitting a blank column', () => {
    const rows = parseCSV(buildFlatCSV({
      rollups: [ALICE], range: RANGE, lookups, columns: ['hours', 'nope' as any],
    }).csv);
    expect(rows[0]).toEqual(['Hours']);
  });
});
