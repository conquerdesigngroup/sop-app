import { RecordRow } from '../../lib/attendanceRecords';
import { ExportMeta, reasonLabel, slug, statusLabel, tally } from './attendanceExport';

/**
 * The printable attendance report.
 *
 * A download rather than a print window, for the same reason the timesheet is:
 * a print dialog is a detour, it is awkward on a phone, and it leaves the
 * person to find "Save as PDF" in a menu before they have a file.
 *
 * jsPDF is behind a dynamic import so it stays its own chunk. It is a few
 * hundred KB and only an admin exporting records ever needs it; it has no
 * business in the bundle a parent downloads on a phone, or in the one a teacher
 * loads to mark a register.
 *
 * WHY IT IS GROUPED BY DATE AND THEN BY CLASS
 *
 * Because that is the shape of the question. Nobody reads an attendance report
 * front to back; they look up "what happened in Jr Ballet on the 9th". A flat
 * table sorted by date makes that a scan, and grouping makes it a lookup — and
 * it lets each class carry its own totals, which is the line most of these
 * reports are actually printed for.
 *
 * The layout is drawn by hand rather than with a table plugin, matching
 * timesheetPdf.ts: same reason, one fewer dependency, and full control of what
 * happens when a class runs off the bottom of a page.
 */

const LETTER_W = 612;   // points, portrait
const LETTER_H = 792;
const MARGIN = 40;
const CONTENT_W = LETTER_W - MARGIN * 2;
const BOTTOM = LETTER_H - MARGIN;

const INK = 20;
const MUTED = 120;
const FAINT = 205;

// Dancer, Status, Counted, Reason. Reason takes the slack because it is the
// only column that holds a sentence.
const COLS = [
  { label: 'DANCER', width: 190, align: 'left' as const },
  { label: 'STATUS', width: 80, align: 'left' as const },
  { label: 'COUNTED', width: 60, align: 'left' as const },
  { label: 'REASON', width: CONTENT_W - 330, align: 'left' as const },
];

export interface AttendancePDFResult {
  blob: Blob;
  filename: string;
  rowCount: number;
  classCount: number;
}

const toText = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** UTC-anchored so no local zone can shift the weekday by one. */
const prettyDay = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  const [, m, day] = iso.split('-').map(Number);
  return `${DAYS[d.getUTCDay()]} ${MONTHS[m - 1]} ${day}`;
};

export const buildAttendancePDF = async (
  rows: RecordRow[],
  meta: ExportMeta & { generatedBy?: string; truncated?: boolean },
): Promise<AttendancePDFResult> => {
  // date -> class -> rows, both in the order a person would look them up.
  const byDate = new Map<string, Map<string, RecordRow[]>>();
  rows.forEach(r => {
    const classes = byDate.get(r.sessionDate) ?? new Map<string, RecordRow[]>();
    const list = classes.get(r.className) ?? [];
    list.push(r);
    classes.set(r.className, list);
    byDate.set(r.sessionDate, classes);
  });

  const dates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
  let classCount = 0;

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  doc.setFont('helvetica', 'normal');

  const title = meta.subject
    ? `Attendance - ${meta.subject} - ${meta.range.label}`
    : `Attendance - ${meta.range.label}`;
  doc.setProperties({ title, creator: 'DIDC' });

  let y = MARGIN;

  const rule = (weight = 0.5, shade = FAINT) => {
    doc.setDrawColor(shade);
    doc.setLineWidth(weight);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  };

  /** Clip to the column rather than run into the next one. */
  const fit = (value: string, width: number): string => {
    const room = width - 6;
    if (room <= 0 || doc.getTextWidth(value) <= room) return value;
    let shown = value;
    while (shown.length > 1 && doc.getTextWidth(shown + '...') > room) shown = shown.slice(0, -1);
    return shown.replace(/\s+$/, '') + '...';
  };

  const columnHeader = () => {
    doc.setFontSize(7);
    doc.setTextColor(MUTED);
    doc.setFont('helvetica', 'bold');
    let x = MARGIN;
    COLS.forEach(c => {
      doc.text(c.label, x, y);
      x += c.width;
    });
    doc.setFont('helvetica', 'normal');
    y += 5;
    rule(0.8, INK);
    y += 12;
  };

  const needRoom = (pt: number, repeatHeader = true) => {
    if (y + pt <= BOTTOM) return;
    doc.addPage();
    y = MARGIN;
    if (repeatHeader) columnHeader();
  };

  // ---- cover block
  doc.setFontSize(16);
  doc.setTextColor(INK);
  doc.setFont('helvetica', 'bold');
  doc.text(meta.subject ? `Attendance — ${meta.subject}` : 'Attendance', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  y += 6;
  rule(1.2, INK);
  y += 16;

  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(meta.range.label, MARGIN, y);
  y += 13;
  doc.text([
    `Generated ${new Date().toLocaleString('en-US')}`,
    ...(meta.generatedBy ? [`by ${meta.generatedBy}`] : []),
  ].join('  ·  '), MARGIN, y);
  y += 18;

  // ---- the totals the report is printed for
  const all = tally(rows);
  doc.setFontSize(10);
  doc.setTextColor(INK);
  doc.text([
    `${all.present} present`,
    `${all.late} late`,
    `${all.absent} absent`,
    `${all.sick} sick`,
    `${all.excused} excused`,
    `${all.unmarked} not marked`,
  ].join('   ·   '), MARGIN, y);
  y += 14;
  doc.text(
    all.percent === null
      ? 'No classes in this range have counted yet.'
      : `${all.attended} of ${all.counted} counted attendances — ${all.percent}%`,
    MARGIN, y,
  );
  y += 16;

  /*
   * A truncated report must say so ON the report.
   *
   * The screen that produced it will have warned too, but the PDF is the thing
   * that gets emailed, printed and filed — and by then nobody remembers a
   * dialog. An incomplete report that does not admit it is worse than no
   * report, because it will be reconciled against and trusted.
   */
  if (meta.truncated) {
    doc.setFontSize(9);
    doc.setTextColor(200, 30, 60);
    doc.text('INCOMPLETE — too many records for one export. Narrow the range and run it again.', MARGIN, y);
    doc.setTextColor(INK);
    y += 16;
  }

  if (rows.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(MUTED);
    doc.text('No attendance records in this range.', MARGIN, y);
  }

  // ---- date by date
  dates.forEach(date => {
    const classes = byDate.get(date)!;
    const names = Array.from(classes.keys()).sort();

    needRoom(60, false);
    y += 8;
    doc.setFontSize(12);
    doc.setTextColor(INK);
    doc.setFont('helvetica', 'bold');
    doc.text(prettyDay(date), MARGIN, y);
    doc.setFont('helvetica', 'normal');
    y += 5;
    rule(1, INK);
    y += 14;

    names.forEach(name => {
      const classRows = classes.get(name)!;
      classCount += 1;
      const t = tally(classRows);

      // Keep a class heading with at least a couple of its rows rather than
      // stranding it alone at the foot of a page.
      needRoom(70, false);

      doc.setFontSize(10);
      doc.setTextColor(INK);
      doc.setFont('helvetica', 'bold');
      doc.text(fit(name, CONTENT_W - 150), MARGIN, y);
      doc.setFont('helvetica', 'normal');

      doc.setFontSize(8);
      doc.setTextColor(MUTED);
      const right = t.percent === null ? `${classRows.length} on roster` : `${t.attended}/${t.counted} · ${t.percent}%`;
      doc.text(right, MARGIN + CONTENT_W, y, { align: 'right' });
      y += 11;

      const teacher = classRows[0]?.teachers;
      if (teacher) {
        doc.setFontSize(8);
        doc.setTextColor(MUTED);
        doc.text(fit(teacher, CONTENT_W), MARGIN, y);
        y += 11;
      }

      columnHeader();

      classRows.forEach(r => {
        needRoom(16);
        doc.setFontSize(9);
        doc.setTextColor(INK);
        const cells = [
          `${r.lastName}, ${r.firstName}`,
          statusLabel(r),
          r.countsTowardTotal ? 'Yes' : 'No',
          reasonLabel(r),
        ];
        let x = MARGIN;
        cells.forEach((cell, i) => {
          doc.text(fit(toText(cell), COLS[i].width), x, y);
          x += COLS[i].width;
        });
        y += 14;
      });

      y += 6;
      rule(0.4, FAINT);
      y += 10;
    });
  });

  const name = meta.subject ? `attendance_${slug(meta.subject)}` : 'attendance';

  return {
    blob: doc.output('blob'),
    filename: `${name}_${meta.range.from}_to_${meta.range.to}.pdf`,
    rowCount: rows.length,
    classCount,
  };
};
