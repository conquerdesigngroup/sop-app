/**
 * The printable timesheet, as a PDF the browser downloads.
 *
 * A download rather than a print window: a print dialog is a detour, it is
 * awkward on a phone, and it leaves the admin to pick "Save as PDF" from a
 * menu before they have a file. The buttons on this panel all hand over a
 * file, and this one should not be the exception.
 *
 * jsPDF is loaded with a dynamic import so it is a separate chunk. It is a
 * few hundred KB and only a super admin exporting hours ever needs it; it has
 * no business in the bundle a parent downloads on a phone.
 *
 * The layout is drawn by hand rather than with a table plugin, because the
 * columns are chosen at runtime in the Export dialog and the widths have to
 * be shared out to whatever was picked.
 */

import { formatHours } from './hoursUtils';
import { EmployeeRollup, PayrollLookups } from './payrollExport';
import {
  ColumnKey,
  DEFAULT_COLUMNS,
  TimesheetExportInput,
  cellValue,
  isAllTime,
  moneyPrint,
  orderColumns,
  pricedFor,
  rangeSlug,
  slug,
  worked,
} from './timesheetExport';

export interface TimesheetPDFResult {
  blob: Blob;
  filename: string;
  /** Shifts across every page. Zero means there is nothing to produce. */
  entryCount: number;
  /** People in the document. Each starts on a new page. */
  peopleCount: number;
}

// US Letter, in points. Which way up is decided by how many columns were
// picked — see chooseOrientation.
const LETTER_SHORT = 612;
const LETTER_LONG = 792;
const MARGIN = 40;

const INK = 17;        // near-black body text
const MUTED = 105;     // labels, notes
const FAINT = 150;     // rejected rows, rules
const FLAG: [number, number, number] = [154, 0, 0];

/**
 * jsPDF's built-in fonts are WinAnsi, so anything outside Latin-1 comes out
 * as mojibake. Names and notes are free text typed by people, so the
 * characters that actually turn up — smart quotes, dashes, ellipses — are
 * folded to their ASCII equivalents, and anything else is replaced rather
 * than left to corrupt the line.
 */
export const toPdfText = (v: unknown): string =>
  String(v ?? '')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\xFF]/g, '?');

/**
 * Turn the page sideways when the chosen columns will not fit standing up.
 *
 * All fourteen columns need about 700pt, and a portrait Letter page has 532.
 * Squeezing them in anyway is what produced overlapping headers and cells
 * reading "Tue 09/0...". Someone who exports four columns still gets a normal
 * portrait timesheet.
 */
export const chooseOrientation = (needed: number): 'portrait' | 'landscape' =>
  needed > LETTER_SHORT - MARGIN * 2 ? 'landscape' : 'portrait';

/**
 * Share the page out among the chosen columns.
 *
 * Every column keeps its declared width; the slack goes to the widest text
 * column so a note or a pay basis gets the room. If the picks still overrun
 * the page after turning it sideways, everything scales down together rather
 * than letting the last column fall off the edge.
 */
export const layout = (
  specs: { key: ColumnKey; width: number }[],
  contentW: number
): number[] => {
  const total = specs.reduce((s, c) => s + c.width, 0);
  if (total === 0) return specs.map(() => 0);

  if (total > contentW) {
    const scale = contentW / total;
    return specs.map(c => c.width * scale);
  }

  const widths = specs.map(c => c.width);
  const slack = contentW - total;
  // Prefer a free-text column; fall back to the last one.
  const flexible = ['notes', 'basis', 'category', 'employee'].map(k => specs.findIndex(c => c.key === k));
  const target = flexible.find(i => i >= 0);
  widths[target === undefined ? widths.length - 1 : target] += slack;
  return widths;
};

export const buildTimesheetPDF = async ({
  rollups,
  range,
  lookups,
  columns = DEFAULT_COLUMNS,
  generatedAt = new Date(),
  generatedBy,
  subject,
}: TimesheetExportInput): Promise<TimesheetPDFResult> => {
  const people = worked(rollups);
  const entryCount = people.reduce((s, r) => s + r.entries.length, 0);

  // The person is named at the top of their own section, so repeating their
  // name and email on every line of their own table is wasted page.
  const specs = orderColumns(columns).filter(c => !c.identifies);
  const weekdayShownSeparately = specs.some(c => c.key === 'weekday');
  const orientation = chooseOrientation(specs.reduce((s, c) => s + c.width, 0));
  const PAGE_W = orientation === 'landscape' ? LETTER_LONG : LETTER_SHORT;
  const PAGE_H = orientation === 'landscape' ? LETTER_SHORT : LETTER_LONG;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const BOTTOM = PAGE_H - MARGIN;
  const widths = layout(specs, CONTENT_W);

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation });
  doc.setFont('helvetica', 'normal');

  const title = subject
    ? `Timesheet - ${subject} - ${range.label}`
    : `Team timesheets - ${range.label}`;
  doc.setProperties({ title, creator: 'DIDC' });

  let y = MARGIN;

  const text = (s: unknown, x: number, opts: { align?: 'left' | 'right' } = {}) =>
    doc.text(toPdfText(s), x, y, { align: opts.align || 'left', baseline: 'alphabetic' });

  /** Clip to the column rather than run into the next one. */
  const fit = (value: string, width: number): string => {
    const room = width - 6;
    if (room <= 0 || doc.getTextWidth(value) <= room) return value;
    let shown = value;
    while (shown.length > 1 && doc.getTextWidth(shown + '...') > room) shown = shown.slice(0, -1);
    return shown.replace(/\s+$/, '') + '...';
  };

  const rule = (weight = 0.5, shade = FAINT) => {
    doc.setDrawColor(shade);
    doc.setLineWidth(weight);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  };

  /** Column header row. Repeated whenever a person's table runs onto a new page. */
  const columnHeader = () => {
    doc.setFontSize(7);
    doc.setTextColor(MUTED);
    doc.setFont('helvetica', 'bold');
    let x = MARGIN;
    specs.forEach((c, i) => {
      const right = c.numeric;
      const shown = fit(toPdfText((c.shortLabel || c.label).toUpperCase()), widths[i]);
      doc.text(shown, right ? x + widths[i] - 4 : x, y, { align: right ? 'right' : 'left' });
      x += widths[i];
    });
    doc.setFont('helvetica', 'normal');
    y += 5;
    rule(0.8, INK);
    y += 12;
  };

  const needRoom = (pt: number) => {
    if (y + pt <= BOTTOM) return;
    doc.addPage();
    y = MARGIN;
    columnHeader();
  };

  people.forEach((r, personIndex) => {
    if (personIndex > 0) {
      doc.addPage();
      y = MARGIN;
    }

    // ---- who
    doc.setFontSize(13);
    doc.setTextColor(INK);
    doc.setFont('helvetica', 'bold');
    text(r.name, MARGIN);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    text(r.email, MARGIN + CONTENT_W, { align: 'right' });
    y += 6;
    rule(1.2, INK);
    y += 14;

    // ---- period, only on the first page of the document
    if (personIndex === 0) {
      doc.setFontSize(8);
      doc.setTextColor(MUTED);
      const meta = [
        isAllTime(range) ? 'All time' : `${range.start} to ${range.end}`,
        `Generated ${generatedAt.toLocaleString('en-US')}`,
        ...(generatedBy ? [`by ${generatedBy}`] : []),
      ].join('  ·  ');
      text(meta, MARGIN);
      y += 16;
    }

    columnHeader();

    // ---- shifts
    pricedFor(r, lookups).forEach(p => {
      needRoom(30);

      const rejected = p.entry.status === 'rejected';
      doc.setFontSize(8.5);
      doc.setTextColor(rejected ? FAINT : INK);

      let x = MARGIN;
      specs.forEach((c, i) => {
        const raw = cellValue(c.key, r, p, { forPrint: true, weekdayShownSeparately });
        const value = toPdfText(raw);
        const w = widths[i];

        if (c.money && p.rateMissing && c.key === 'amount' && !rejected) {
          doc.setTextColor(FLAG[0], FLAG[1], FLAG[2]);
        }

        // Truncate rather than let a long note run into the next column.
        const shown = fit(value, w);
        doc.text(shown, c.numeric ? x + w - 4 : x, y, { align: c.numeric ? 'right' : 'left' });
        doc.setTextColor(rejected ? FAINT : INK);
        x += w;
      });

      // A rejected shift is struck through, so it cannot be read as payable
      // by someone skimming the page.
      if (rejected) {
        doc.setDrawColor(FAINT);
        doc.setLineWidth(0.4);
        doc.line(MARGIN, y - 3, MARGIN + CONTENT_W, y - 3);
      }

      y += 13;
      doc.setDrawColor(230);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, y - 8, MARGIN + CONTENT_W, y - 8);
    });

    // ---- total
    needRoom(70);
    y += 4;
    rule(1, INK);
    y += 14;
    doc.setFontSize(9);
    doc.setTextColor(INK);
    doc.setFont('helvetica', 'bold');
    text(
      `TOTAL - ${r.entries.length} ${r.entries.length === 1 ? 'entry' : 'entries'}, `
      + `${r.days} ${r.days === 1 ? 'day' : 'days'}, ${formatHours(r.total)} hrs`,
      MARGIN
    );
    text(moneyPrint(r.approvedPay + r.estimatedPendingPay), MARGIN + CONTENT_W, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 12;

    const caveats: string[] = [];
    if (r.estimatedPendingPay > 0) {
      caveats.push(`Includes ${moneyPrint(r.estimatedPendingPay)} estimated on ${formatHours(r.pending)} pending hrs - not owed until approved.`);
    }
    if (r.rejected > 0) {
      caveats.push(`${formatHours(r.rejected)} rejected hrs are excluded.`);
    }
    if (r.missingRateCount > 0) {
      caveats.push(`${r.missingRateCount} approved ${r.missingRateCount === 1 ? 'entry' : 'entries'} locked at $0.00 with no rate set.`);
    }
    if (caveats.length > 0) {
      doc.setFontSize(7.5);
      doc.setTextColor(MUTED);
      doc.splitTextToSize(toPdfText(caveats.join(' ')), CONTENT_W).forEach((line: string) => {
        doc.text(line, MARGIN, y);
        y += 10;
      });
    }

    // ---- signatures
    needRoom(60);
    y += 26;
    const slotW = CONTENT_W / 4;
    doc.setDrawColor(INK);
    doc.setLineWidth(0.6);
    ['Employee signature', 'Date', 'Approved by', 'Date'].forEach((label, i) => {
      const x = MARGIN + slotW * i;
      doc.line(x, y, x + slotW - 18, y);
      doc.setFontSize(7);
      doc.setTextColor(MUTED);
      doc.text(label.toUpperCase(), x, y + 10);
    });
  });

  if (people.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(MUTED);
    doc.text('No hours were logged in this period.', MARGIN, MARGIN + 20);
  }

  const name = subject ? `timesheet_${slug(subject)}` : 'timesheets';

  return {
    blob: doc.output('blob'),
    filename: `${name}_${rangeSlug(range)}.pdf`,
    entryCount,
    peopleCount: people.length,
  };
};
