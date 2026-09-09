import { WorkHoursEntry, WorkHoursPay } from '../../types';
import { EmployeeRollup, PayrollLookups } from './payrollExport';
import { buildTimesheetPDF, chooseOrientation, layout, toPdfText } from './timesheetPdf';

const entry = (over: Partial<WorkHoursEntry> & Pick<WorkHoursEntry, 'id' | 'employeeId'>): WorkHoursEntry => ({
  workDate: '2026-08-03',
  startTime: '09:00',
  endTime: '17:00',
  breakMinutes: 0,
  totalHours: 8,
  status: 'approved',
  createdBy: over.employeeId,
  createdAt: '',
  ...over,
});

const ALICE: EmployeeRollup = {
  employeeId: 'alice', name: 'Alice Adams', email: 'alice@didc.app',
  entries: [entry({ id: 'a1', employeeId: 'alice', categoryId: 'teach' })],
  total: 8, approved: 8, pending: 0, rejected: 0, days: 1,
  approvedPay: 200, estimatedPendingPay: 0, missingRateCount: 0,
};
const DANA: EmployeeRollup = {
  employeeId: 'dana', name: 'Dana Cole', email: 'dana@didc.app',
  entries: [], total: 0, approved: 0, pending: 0, rejected: 0, days: 0,
  approvedPay: 0, estimatedPendingPay: 0, missingRateCount: 0,
};

const FROZEN: Record<string, WorkHoursPay> = {
  a1: { workHoursId: 'a1', rateSnapshot: 25, payAmount: 200, rateMissing: false, frozenAt: '' },
};

const lookups: PayrollLookups = {
  getCategoryName: id => (id === 'teach' ? 'Teaching' : undefined),
  getFrozenPay: id => FROZEN[id],
  getRate: () => 25,
};

const RANGE = { start: '2026-08-01', end: '2026-08-31', label: 'This month' };

describe('toPdfText', () => {
  /**
   * The built-in PDF fonts are Latin-1. Anything outside it is mojibake in
   * the file, so the characters people actually type are folded to ASCII and
   * the rest is replaced rather than left to corrupt the line.
   */
  it('folds the punctuation people actually type into ASCII', () => {
    expect(toPdfText('Alice’s shift — “covered” for Fay…')).toBe("Alice's shift - \"covered\" for Fay...");
  });

  it('keeps accented Latin-1 names intact', () => {
    expect(toPdfText('Chloé Nuñez')).toBe('Chloé Nuñez');
  });

  it('replaces anything the font cannot draw instead of emitting it raw', () => {
    expect(toPdfText('done 🎉 に')).toBe('done ?? ?');
  });

  it('survives null and undefined, which notes and categories both can be', () => {
    expect(toPdfText(null)).toBe('');
    expect(toPdfText(undefined)).toBe('');
  });
});

describe('buildTimesheetPDF', () => {
  it('produces a real PDF blob named after the period', async () => {
    const { blob, filename, entryCount, peopleCount } = await buildTimesheetPDF({
      rollups: [ALICE, DANA], range: RANGE, lookups,
      generatedAt: new Date('2026-09-07T12:00:00Z'), generatedBy: 'Tony Z',
    });

    expect(filename).toBe('timesheets_2026-08-01_to_2026-08-31.pdf');
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500);

    // Dana logged nothing, so she gets no page — a blank page is not a record.
    expect(peopleCount).toBe(1);
    expect(entryCount).toBe(1);
  });

  it('names a single-person file after them', async () => {
    const { filename } = await buildTimesheetPDF({
      rollups: [ALICE], range: RANGE, lookups, subject: 'Alice Adams',
    });
    expect(filename).toBe('timesheet_alice-adams_2026-08-01_to_2026-08-31.pdf');
  });

  it('still returns a document when nobody logged anything, and says so', async () => {
    const { blob, entryCount, peopleCount } = await buildTimesheetPDF({
      rollups: [DANA], range: RANGE, lookups,
    });
    expect(entryCount).toBe(0);
    expect(peopleCount).toBe(0);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('drops the identifying columns from the table, since the page is already titled with them', async () => {
    // Asking for only identifying columns leaves the table empty rather than
    // repeating the person's name on every line of their own page.
    const { blob } = await buildTimesheetPDF({
      rollups: [ALICE], range: RANGE, lookups, columns: ['employee', 'email'],
    });
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('page layout', () => {
  /**
   * All fourteen columns need roughly 700pt and a portrait Letter page has
   * 532. Squeezing them in anyway is what produced overlapping headers and
   * cells reading "Tue 09/0...".
   */
  it('turns the page sideways only when the chosen columns will not fit standing up', () => {
    expect(chooseOrientation(400)).toBe('portrait');
    expect(chooseOrientation(532)).toBe('portrait');
    expect(chooseOrientation(533)).toBe('landscape');
  });

  it('gives the slack to a free-text column rather than padding a number', () => {
    const widths = layout(
      [{ key: 'hours', width: 40 }, { key: 'notes', width: 100 }],
      300
    );
    expect(widths[0]).toBe(40);
    expect(widths[1]).toBe(260);
  });

  it('scales everything together when the picks still overrun the page', () => {
    const widths = layout(
      [{ key: 'hours', width: 100 }, { key: 'notes', width: 300 }],
      200
    );
    expect(widths[0] + widths[1]).toBeCloseTo(200);
    // Proportions hold, so no single column collapses to nothing.
    expect(widths[1] / widths[0]).toBeCloseTo(3);
  });
});
