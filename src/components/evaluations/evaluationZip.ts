import { ExportRow, snapshotOfExport, zipPath } from '../../lib/evaluations';
import { slug } from '../attendance/attendanceExport';
import { buildEvaluationPDF } from './evaluationPdf';

/**
 * Many evaluations as one ZIP of PDFs, in folders.
 *
 *   by class:  Season/Class name/Last, First — Round.pdf
 *   by dancer: Last, First/Class name — Round.pdf
 *
 * fflate is imported dynamically, like jsPDF, so neither sits in the bundle a
 * parent downloads. The PDFs are generated ONE AT A TIME on purpose: a hundred
 * jsPDF documents built in parallel on a phone is a hundred documents held in
 * memory at once, and the progress bar would have nothing to say until the end.
 * Sequential, each one reports, and Cancel has a gap to land in.
 */

export interface ZipProgress {
  done: number;
  total: number;
  current: string;
}

export interface ZipResult {
  blob: Blob;
  filename: string;
  count: number;
}

export class ZipCancelled extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ZipCancelled';
  }
}

export const buildEvaluationZip = async (
  rows: ExportRow[],
  layout: 'class' | 'dancer',
  label: string,
  onProgress: (p: ZipProgress) => void,
  isCancelled: () => boolean,
): Promise<ZipResult> => {
  const { zipSync } = await import('fflate');
  const files: Record<string, Uint8Array> = {};
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i += 1) {
    if (isCancelled()) throw new ZipCancelled();
    const row = rows[i];
    onProgress({ done: i, total: rows.length, current: `${row.firstName} ${row.lastName}` });

    const { bytes } = await buildEvaluationPDF(snapshotOfExport(row));

    // Two dancers with the same name in one class would overwrite each other.
    let path = zipPath(row, layout, slug);
    let n = 2;
    while (seen.has(path)) {
      path = path.replace(/\.pdf$/, `-${n}.pdf`);
      n += 1;
    }
    seen.add(path);
    files[path] = bytes;

    // Yield so the bar can paint between documents.
    await new Promise(r => setTimeout(r, 0));
  }

  if (isCancelled()) throw new ZipCancelled();
  onProgress({ done: rows.length, total: rows.length, current: 'Zipping…' });

  // PDFs are already compressed; level 0 stores them and finishes fast.
  const zipped = zipSync(files, { level: 0 });
  return {
    blob: new Blob([zipped], { type: 'application/zip' }),
    filename: `evaluations_${slug(label)}.zip`,
    count: rows.length,
  };
};
