import { useCallback, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import {
  CalendarTarget,
  downloadIcsFile,
  openCalendarUrl,
  shareOrDownloadIcs,
} from '../../lib/calendarTarget';
import { copyCalendarLink } from '../../utils/calendarExport';

/**
 * The ways a parent can take a studio date away with them, and the bit
 * that tells them what just happened.
 *
 * WHY SEVERAL AND NOT ONE
 *
 * This used to be a single button that built an .ics. That is the *general*
 * answer and the worst *specific* one: a parent on Google Calendar — most of
 * them — got a file, a download notification, and a second job to do later,
 * when Google will take a link and show them a filled-in event with a Save
 * button. Handing the file to someone whose calendar can be addressed directly
 * is the app making its own life easy.
 *
 * Each route gets its own words, because they land differently:
 *
 *   - A web handoff opens a tab the parent can see. Saying "Added!" over it
 *     would claim something that has not happened yet — they still have to
 *     press Save — so it only says where they have been sent.
 *   - The iOS share sheet IS its own confirmation, and the parent may still
 *     pick Messages. It stays quiet.
 *   - A download produces a file in a folder and no visible calendar change
 *     at all, which is the one case that needs explaining.
 *
 * It takes a CalendarTarget rather than an event, so that a one-off studio
 * date and a weekly class that runs to the end of the season go out through
 * the same five routes and the same five sentences.
 */
export const useAddToCalendar = () => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const openGoogle = useCallback((target: CalendarTarget) => {
    openCalendarUrl(target.google);
    toast.info('Opening Google Calendar — press Save there to keep it.');
  }, [toast]);

  const openOutlook = useCallback((target: CalendarTarget) => {
    // Only ever reached from a row the sheet draws when `outlook` is set.
    if (!target.outlook) return;
    openCalendarUrl(target.outlook);
    toast.info('Opening Outlook — press Save there to keep it.');
  }, [toast]);

  /** Apple Calendar and anything else that reads an .ics. */
  const saveToDevice = useCallback(async (target: CalendarTarget) => {
    setBusy(true);
    try {
      const outcome = await shareOrDownloadIcs(target.ics(), target.fileName, target.title);
      if (outcome === 'downloaded') {
        toast.success('Calendar file saved — open it to add the date.');
      }
      // 'shared' and 'cancelled' both stay quiet: the sheet spoke for itself.
    } catch (err) {
      console.error('Add to calendar failed:', err);
      toast.error('Could not create the calendar file.');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  /** The same file, but never via the sheet — for a parent who wants the file. */
  const downloadFile = useCallback((target: CalendarTarget) => {
    try {
      downloadIcsFile(target.ics(), target.fileName);
      toast.success('Calendar file saved — open it to add the date.');
    } catch (err) {
      console.error('Download .ics failed:', err);
      toast.error('Could not create the calendar file.');
    }
  }, [toast]);

  /** The Google link, which is the one a parent can paste to someone else. */
  const copyLink = useCallback(async (target: CalendarTarget) => {
    const ok = await copyCalendarLink(target.google);
    if (ok) toast.success('Link copied.');
    else toast.error('Could not copy the link.');
  }, [toast]);

  return { openGoogle, openOutlook, saveToDevice, downloadFile, copyLink, busy };
};
