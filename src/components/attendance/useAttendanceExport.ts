import { useCallback, useRef, useState } from 'react';
import { RecordRow } from '../../lib/attendanceRecords';
import { shareOrDownloadCSV, shareOrDownloadFile } from '../hours/hoursUtils';
import { ExportMeta, buildAttendanceCSV } from './attendanceExport';

/**
 * Turning attendance rows into a file, for every screen that offers one.
 *
 * The records list and a class's history both export, and they must behave the
 * same way: one file per tap, a word for every state, and the same filename
 * rules. Two copies of this would drift the first time one of them was fixed.
 *
 * The busy ref is the second-tap guard from CLAUDE.md ("slow taps"): a tap can
 * land between the first tap and the re-render that disables the button, and
 * on a phone the share sheet takes long enough for that to happen.
 */

export type Delivery =
  | { kind: 'idle' }
  | { kind: 'busy'; what: string }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

export const useAttendanceExport = (generatedBy?: string) => {
  const [delivery, setDelivery] = useState<Delivery>({ kind: 'idle' });
  const busy = useRef(false);

  const run = useCallback(async (what: string, make: () => Promise<{ how: string; rowCount: number }>) => {
    if (busy.current) return;
    busy.current = true;
    setDelivery({ kind: 'busy', what });
    try {
      const { how, rowCount } = await make();
      setDelivery(how === 'cancelled'
        ? { kind: 'idle' }
        : { kind: 'done', message: `${rowCount} rows ${how === 'shared' ? 'shared' : 'downloaded'}.` });
    } catch (e: any) {
      setDelivery({ kind: 'error', message: e?.message || 'Could not build that export. Try again.' });
    } finally {
      busy.current = false;
    }
  }, []);

  const exportCSV = useCallback((rows: RecordRow[], meta: ExportMeta) => run('Building the CSV…', async () => {
    const { csv, filename, rowCount } = buildAttendanceCSV(rows, meta);
    return { how: await shareOrDownloadCSV(filename, csv), rowCount };
  }), [run]);

  const exportPDF = useCallback((rows: RecordRow[], meta: ExportMeta, truncated = false) => run('Building the PDF…', async () => {
    // Dynamic: jsPDF is a large chunk and must not load for anyone who only
    // ever looks at these screens.
    const { buildAttendancePDF } = await import('./attendancePdf');
    const { blob, filename, rowCount } = await buildAttendancePDF(rows, { ...meta, generatedBy, truncated });
    return { how: await shareOrDownloadFile(filename, blob, 'application/pdf'), rowCount };
  }), [run, generatedBy]);

  return { delivery, busy: delivery.kind === 'busy', exportCSV, exportPDF, reset: () => setDelivery({ kind: 'idle' }) };
};
