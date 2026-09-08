import { WorkHoursEntry, WorkHoursPay } from '../../types';
import { buildPayrollCSV, EmployeeRollup, PayrollLookups } from './payrollExport';

/**
 * Every cell is quoted by toCSV, so a minimal RFC-4180 reader is enough and
 * beats substring matching: these assertions are about which column a number
 * lands in, which a `toContain` check cannot see.
 */
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

const findRow = (rows: string[][], firstCell: string) =>
  rows.find(r => r[0] === firstCell);

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

// Alice worked two shifts in "Teaching" either side of a raise: 8 hrs frozen
// at 25.00, then 4 hrs frozen at 30.00. Bob has 5 pending hrs at today's
// 20.00 and 3 hrs that were rejected. Dana logged nothing.
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

const ROLLUPS: EmployeeRollup[] = [
  rollup({
    employeeId: 'bob', name: 'Bob Zimmer',
    entries: [BOB_PENDING, BOB_REJECTED],
    total: 5, approved: 0, pending: 5, rejected: 3, days: 2,
    approvedPay: 0, estimatedPendingPay: 100,
  }),
  rollup({
    employeeId: 'alice', name: 'Alice Adams',
    entries: [ALICE_2, ALICE_1],
    total: 12, approved: 12, pending: 0, rejected: 0, days: 2,
    approvedPay: 320, estimatedPendingPay: 0,
  }),
  rollup({ employeeId: 'dana', name: 'Dana Cole' }),
];

const build = (rollups = ROLLUPS, range = RANGE) =>
  parseCSV(buildPayrollCSV({
    rollups,
    range,
    lookups,
    generatedAt: new Date('2026-09-07T12:00:00Z'),
    generatedBy: 'Tony Z',
  }).csv);

describe('buildPayrollCSV', () => {
  it('gives every person their own summary line, with the team total as an extra line rather than the only one', () => {
    const rows = build();

    const alice = findRow(rows, 'Alice Adams')!;
    expect(alice[6]).toBe('12.00');   // total hrs to pay
    expect(alice[8]).toBe('320.00');  // approved pay
    expect(alice[10]).toBe('320.00'); // total pay

    const bob = findRow(rows, 'Bob Zimmer')!;
    expect(bob[6]).toBe('5.00');
    expect(bob[8]).toBe('0.00');
    expect(bob[9]).toBe('100.00');    // est. pending pay
    expect(bob[10]).toBe('100.00');

    const team = findRow(rows, 'TEAM TOTAL')!;
    expect(team[10]).toBe('420.00');
  });

  it('sorts people alphabetically, not by hours worked', () => {
    const names = build()
      .filter(r => ['Alice Adams', 'Bob Zimmer', 'Dana Cole'].includes(r[0]))
      .map(r => r[0]);
    expect(names.slice(0, 3)).toEqual(['Alice Adams', 'Bob Zimmer', 'Dana Cole']);
  });

  it('keeps someone who logged nothing on the summary, flagged, so the gap is visible', () => {
    const dana = findRow(build(), 'Dana Cole')!;
    expect(dana[6]).toBe('0.00');
    expect(dana[11]).toBe('No hours logged in this period');
  });

  it('splits one category into two lines when the rate changed mid-period', () => {
    const rows = build();
    const teaching = rows.filter(r => r[0] === 'Alice Adams' && r[1] === 'Teaching');

    expect(teaching).toHaveLength(2);
    expect(teaching.map(r => [r[2], r[3], r[4]])).toEqual([
      ['25.00', '8.00', '200.00'],
      ['30.00', '4.00', '120.00'],
    ]);
  });

  it('subtotals the rate breakdown per person', () => {
    const total = findRow(build(), 'TOTAL - Alice Adams')!;
    expect(total[7]).toBe('12.00');   // total hrs
    expect(total[8]).toBe('320.00');  // total pay
  });

  it('leaves the amount column numeric for a pending entry instead of appending "(est.)"', () => {
    const rows = build();
    const detail = rows.find(r => r[0] === 'Bob Zimmer' && r[1] === '2026-08-10')!;

    expect(detail[9]).toBe('20.00');   // hourly rate
    expect(detail[10]).toBe('100.00'); // amount — parses as a number
    expect(detail[11]).toBe('Pending - estimate at current rate, not yet approved');
    expect(rows.some(r => r.some(c => c.includes('(est.)')))).toBe(false);
  });

  it('reports rejected hours on their own line and pays nothing for them', () => {
    const rows = build();
    const rejected = rows.find(r => r[0] === 'Bob Zimmer' && r[1] === '2026-08-11')!;

    expect(rejected[10]).toBe('');   // no amount
    expect(rejected[11]).toBe('Rejected - not paid');

    const bobTotal = rows.filter(r => r[0] === 'TOTAL - Bob Zimmer').pop()!;
    expect(bobTotal[6]).toBe('5.00');    // payable hours only
    expect(bobTotal[10]).toBe('100.00');
    expect(findRow(rows, 'REJECTED - Bob Zimmer')![6]).toBe('3.00');
  });

  it('orders one person’s shifts forwards, whatever order they arrive in', () => {
    const dates = build()
      .filter(r => r[0] === 'Alice Adams' && /^\d{4}-/.test(r[1]))
      .map(r => r[1]);
    expect(dates).toEqual(['2026-08-03', '2026-08-17']);
  });

  it('flags an approved entry that was locked with no rate, on the line and in the summary', () => {
    const noRate = entry({ id: 'c1', employeeId: 'cara', categoryId: 'teach', totalHours: 6, endTime: '15:00' });
    FROZEN.c1 = { workHoursId: 'c1', rateSnapshot: 0, payAmount: 0, rateMissing: true, frozenAt: '2026-08-04T00:00:00Z' };

    const rows = build([
      rollup({
        employeeId: 'cara', name: 'Cara Diaz', entries: [noRate],
        total: 6, approved: 6, days: 1, missingRateCount: 1,
      }),
    ]);

    expect(findRow(rows, 'Cara Diaz')![11]).toContain('locked at 0.00');

    const detail = rows.find(r => r[0] === 'Cara Diaz' && r[1] === '2026-08-03')!;
    expect(detail[9]).toBe('');  // no misleading 0.00 rate
    expect(detail[11]).toBe('Approved - NO RATE SET, locked at 0.00');

    const rate = rows.find(r => r[0] === 'Cara Diaz' && r[1] === 'Teaching')!;
    expect(rate[9]).toContain('NO RATE SET');
  });

  it('reports nothing to export for a period with no shifts', () => {
    const result = buildPayrollCSV({
      rollups: [rollup({ employeeId: 'dana', name: 'Dana Cole' })],
      range: RANGE,
      lookups,
    });
    expect(result.entryCount).toBe(0);
    expect(result.employeeCount).toBe(0);
  });

  it('names the file after the period, and does not put 0000-01-01 in an all-time filename', () => {
    expect(buildPayrollCSV({ rollups: ROLLUPS, range: RANGE, lookups }).filename)
      .toBe('payroll-hours_2026-08-01_to_2026-08-31.csv');

    expect(buildPayrollCSV({
      rollups: ROLLUPS,
      range: { start: '0000-01-01', end: '9999-12-31', label: 'All time' },
      lookups,
    }).filename).toBe('payroll-hours_all-time.csv');
  });

  it('pads every row to the same width so the file opens square', () => {
    const widths = new Set(build().map(r => r.length));
    expect(widths).toEqual(new Set([13]));
  });
});
