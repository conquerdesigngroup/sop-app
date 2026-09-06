import type { HolidayId } from '../flag';
import type { HolidayTheme } from '../types';

/**
 * The theme registry.
 *
 * Each holiday is a DYNAMIC import, so its act code and — because the sprite
 * URLs are imported by that module — its art both live in a chunk that is only
 * ever requested when the flag names it. A build with REACT_APP_HOLIDAY unset
 * never reaches this file at all.
 *
 * Themes not built yet resolve to null rather than throwing. A flag naming a
 * holiday that does not exist should leave the front door exactly as it was,
 * not break it.
 */
export const loadTheme = async (id: HolidayId): Promise<HolidayTheme | null> => {
  switch (id) {
    case 'halloween':
      return (await import('./halloween')).halloween;
    default:
      return null;
  }
};
