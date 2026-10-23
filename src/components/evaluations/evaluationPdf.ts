import { CRITERIA, EvaluationSnapshot, prettyDate, ratingLabel } from '../../lib/evaluations';
import { slug } from '../attendance/attendanceExport';

/**
 * One evaluation as a one-page PDF — the snapshot card, printed.
 *
 * jsPDF stays behind a dynamic import for the reason attendancePdf gives: it is
 * a few hundred KB and only an admin exporting ever needs it. The layout is
 * drawn by hand, letter portrait, same constants as the attendance report so
 * the two files look like they came from the same office.
 *
 * A DRAFT SAYS SO ON THE PAGE. The export can include drafts when an admin
 * ticks the box, and a draft that prints like a finished evaluation will be
 * handed to a family as one. The word is on the document, not only the screen.
 */

const LETTER_W = 612;
const LETTER_H = 792;
const MARGIN = 54;
const CONTENT_W = LETTER_W - MARGIN * 2;

const INK = 20;
const MUTED = 120;
const FAINT = 205;

export interface EvaluationPDFResult {
  blob: Blob;
  bytes: Uint8Array;
  filename: string;
}

export const evaluationFilename = (s: EvaluationSnapshot): string =>
  `evaluation_${slug(`${s.lastName}-${s.firstName}`)}_${slug(s.className)}_${slug(s.round)}.pdf`;

export const buildEvaluationPDF = async (s: EvaluationSnapshot): Promise<EvaluationPDFResult> => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  doc.setFont('helvetica', 'normal');
  doc.setProperties({ title: `Evaluation - ${s.firstName} ${s.lastName} - ${s.className}`, creator: 'DIDC' });

  let y = MARGIN;

  const rule = (weight = 0.5, shade = FAINT) => {
    doc.setDrawColor(shade);
    doc.setLineWidth(weight);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  };

  // ---- heading
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.setFont('helvetica', 'bold');
  doc.text('CLASS EVALUATION', MARGIN, y);
  doc.text(s.round.toUpperCase(), MARGIN + CONTENT_W, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 22;

  doc.setFontSize(22);
  doc.setTextColor(INK);
  doc.setFont('helvetica', 'bold');
  doc.text(`${s.firstName} ${s.lastName}`, MARGIN, y);
  doc.setFont('helvetica', 'normal');
  y += 8;
  rule(1.2, INK);
  y += 18;

  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  const facts = [
    ['Class', s.className],
    ['Season', s.season],
    ['Round', s.round],
    ...(s.instructorName ? [['Teacher', s.instructorName]] : []),
    [s.state === 'submitted' ? 'Submitted' : 'Status', s.state === 'submitted' ? prettyDate(s.submittedAt) : 'DRAFT — not yet submitted'],
  ];
  facts.forEach(([label, value]) => {
    doc.setTextColor(MUTED);
    doc.text(label, MARGIN, y);
    doc.setTextColor(s.state !== 'submitted' && label === 'Status' ? 180 : INK);
    doc.text(String(value), MARGIN + 90, y);
    y += 15;
  });
  y += 10;

  // ---- the three ratings
  CRITERIA.forEach(c => {
    const value = s[c.key];
    doc.setFontSize(11);
    doc.setTextColor(INK);
    doc.setFont('helvetica', 'bold');
    doc.text(c.label, MARGIN, y);
    doc.setFont('helvetica', 'normal');

    // Five squares, filled up to the rating. Drawn, not typed, so the file
    // has no dependency on a glyph the PDF font may not carry.
    let x = MARGIN + 160;
    for (let i = 1; i <= 5; i += 1) {
      doc.setDrawColor(INK);
      doc.setLineWidth(0.8);
      if (value !== null && i <= value) {
        doc.setFillColor(INK, INK, INK);
        doc.rect(x, y - 9, 11, 11, 'FD');
      } else {
        doc.rect(x, y - 9, 11, 11, 'D');
      }
      x += 16;
    }

    doc.setFontSize(10);
    doc.setTextColor(MUTED);
    doc.text(value === null ? 'Not rated' : `${ratingLabel(value)}  (${value} of 5)`, x + 10, y);
    y += 12;

    doc.setFontSize(8.5);
    doc.setTextColor(MUTED);
    doc.text(c.hint, MARGIN, y);
    y += 20;
  });

  y += 4;
  rule(0.5, FAINT);
  y += 18;

  // ---- comment
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.setFont('helvetica', 'bold');
  doc.text("Teacher's comments", MARGIN, y);
  doc.setFont('helvetica', 'normal');
  y += 16;

  doc.setFontSize(10.5);
  doc.setTextColor(s.comment.trim() ? INK : MUTED);
  const lines: string[] = doc.splitTextToSize(s.comment.trim() || 'No comment left.', CONTENT_W);
  lines.forEach(line => {
    if (y > LETTER_H - MARGIN - 40) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, MARGIN, y);
    y += 14;
  });
  y += 14;

  // ---- move up
  if (y > LETTER_H - MARGIN - 40) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFontSize(10.5);
  doc.setTextColor(INK);
  doc.setFont('helvetica', 'bold');
  doc.text(s.moveUp ? 'Recommended to move up to the next class.' : 'Recommended to continue at this level.', MARGIN, y);
  doc.setFont('helvetica', 'normal');

  // ---- footer
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text(`DIDC  ·  Generated ${new Date().toLocaleDateString('en-US')}`, MARGIN, LETTER_H - MARGIN + 10);

  const bytes = new Uint8Array(doc.output('arraybuffer'));
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    bytes,
    filename: evaluationFilename(s),
  };
};
