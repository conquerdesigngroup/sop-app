import { useCallback, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { addEventToCalendar } from '../../lib/portalIcs';
import { PortalEvent } from '../../types';

/**
 * "Add to my calendar", with the bit that tells the parent what just happened.
 *
 * The two delivery routes land very differently, so they get different words.
 * The iOS share sheet is its own confirmation — saying "Added!" over the top of
 * it would be claiming something the app cannot actually know, since the parent
 * may still pick Messages. A desktop download, by contrast, produces a file in
 * a folder and no visible calendar change at all, which needs explaining.
 */
export const useAddToCalendar = () => {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = useCallback(async (event: PortalEvent) => {
    setBusyId(event.id);
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
      setBusyId(null);
    }
  }, [toast]);

  return { add, busyId };
};
