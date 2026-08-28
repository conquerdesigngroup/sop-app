import { useCallback, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import {
  addEventToCalendar,
  downloadEventIcs,
  googleCalendarUrl,
  openCalendarUrl,
  outlookCalendarUrl,
} from '../../lib/portalIcs';
import { copyCalendarLink } from '../../utils/calendarExport';
import { PortalEvent } from '../../types';

/**
 * The five ways a parent can take a studio date away with them, and the bit
 * that tells them what just happened.
 *
 * WHY FIVE AND NOT ONE
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
 */
export const useAddToCalendar = () => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const openGoogle = useCallback((event: PortalEvent) => {
    openCalendarUrl(googleCalendarUrl(event));
    toast.info('Opening Google Calendar — press Save there to keep it.');
  }, [toast]);

  const openOutlook = useCallback((event: PortalEvent) => {
    openCalendarUrl(outlookCalendarUrl(event));
    toast.info('Opening Outlook — press Save there to keep it.');
  }, [toast]);

  /** Apple Calendar and anything else that reads an .ics. */
  const saveToDevice = useCallback(async (event: PortalEvent) => {
    setBusy(true);
    try {
      const outcome = await addEventToCalendar(event);
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
  const downloadFile = useCallback((event: PortalEvent) => {
    try {
      downloadEventIcs(event);
      toast.success('Calendar file saved — open it to add the date.');
    } catch (err) {
      console.error('Download .ics failed:', err);
      toast.error('Could not create the calendar file.');
    }
  }, [toast]);

  /** The Google link, which is the one a parent can paste to someone else. */
  const copyLink = useCallback(async (event: PortalEvent) => {
    const ok = await copyCalendarLink(googleCalendarUrl(event));
    if (ok) toast.success('Link copied.');
    else toast.error('Could not copy the link.');
  }, [toast]);

  return { openGoogle, openOutlook, saveToDevice, downloadFile, copyLink, busy };
};
