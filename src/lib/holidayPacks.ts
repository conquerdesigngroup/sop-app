import { DEFAULT_PALETTE_ID, findPalette } from './appPalettes';
import { DEFAULT_SCENE_ID, HolidaySeason, findScene, suggestedEnd } from './homeScenes';

/**
 * Holiday packs: one tap in Settings sets the Home background and the app
 * colors (with their garland) together, and the same "until" date on both,
 * so a holiday switches on, and back off, as one thing.
 *
 * A pack only names a scene id and a palette id; both are validated by
 * holidayPacks.test.ts against HOME_SCENES and APP_PALETTES.
 */
export interface HolidayPack {
  id: string;
  name: string;
  scene: string;
  palette: string;
  /** Drives the suggested end date; none for the everyday pack. */
  season?: HolidaySeason;
}

export const HOLIDAY_PACKS: HolidayPack[] = [
  { id: 'everyday', name: 'Everyday', scene: DEFAULT_SCENE_ID, palette: DEFAULT_PALETTE_ID },
  { id: 'halloween', name: 'Halloween', scene: 'moon', palette: 'halloween', season: 'halloween' },
  { id: 'thanksgiving', name: 'Thanksgiving', scene: 'harvest', palette: 'thanksgiving', season: 'thanksgiving' },
  { id: 'christmas', name: 'Christmas', scene: 'village', palette: 'christmas_duo', season: 'christmas' },
  { id: 'newyear', name: "New Year's", scene: 'champagne', palette: 'new_year', season: 'newyear' },
  { id: 'valentines', name: "Valentine's", scene: 'hearts', palette: 'valentines', season: 'valentines' },
  { id: 'recital', name: 'Recital season', scene: 'stage', palette: 'spring', season: 'recital' },
];

/** The end date a pack sets on both the background and the colors. */
export const packEndsOn = (pack: HolidayPack, today = new Date()): string | null =>
  pack.season ? suggestedEnd(pack.season, today) : null;

/** Which pack is on now, if the live background and colors match one exactly. */
export const activePackId = (sceneId: string, paletteId: string): string | null =>
  HOLIDAY_PACKS.find(p => p.scene === sceneId && p.palette === paletteId)?.id ?? null;

export const packIsValid = (p: HolidayPack) =>
  (p.scene === DEFAULT_SCENE_ID || !!findScene(p.scene)) && !!findPalette(p.palette);
