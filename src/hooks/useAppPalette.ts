import { useCallback, useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useRefreshable } from '../contexts/RefreshContext';
import {
  AppPalette,
  DEFAULT_PALETTE_ID,
  applyPalette,
  currentPalette,
  effectivePaletteId,
  findPalette,
  onPaletteChange,
} from '../lib/appPalettes';

/**
 * The app-wide color palette a super admin picked in Settings → App colors.
 *
 * Stored beside the Home background, in the single row of home_scene_setting
 * (columns palette and palette_ends_on, v81). That row is readable by anyone,
 * signed in or not, since v79, so the front door, the login screens and the
 * parent portal all wear the same palette as staff.
 *
 * The last value seen is cached in localStorage and applied by index.tsx
 * before React renders (applyCachedPalette), so a holiday palette does not
 * flash pink on every launch.
 *
 * Before v81 is applied the columns do not exist. That reads as "default
 * palette" and is not an error.
 */

export interface AppPaletteSetting {
  palette: string;
  /** Last day the palette shows, YYYY-MM-DD; null = until someone switches it back. */
  endsOn: string | null;
}

const CACHE_KEY = 'didc_app_palette';
const TABLE = 'home_scene_setting';

const readCache = (): AppPaletteSetting | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AppPaletteSetting) : null;
  } catch {
    return null;
  }
};

let memory: AppPaletteSetting | null = readCache();
const listeners = new Set<(s: AppPaletteSetting | null) => void>();

const publish = (s: AppPaletteSetting | null) => {
  memory = s;
  try {
    if (s) localStorage.setItem(CACHE_KEY, JSON.stringify(s));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* private window: the in-memory copy still works */
  }
  applyPalette(effectivePaletteId(s));
  listeners.forEach(l => l(s));
};

/** Called once from index.tsx, before the first render. */
export const applyCachedPalette = () => applyPalette(effectivePaletteId(memory));

const isMissingColumn = (message: string) =>
  /palette|home_scene_setting/.test(message) && /does not exist|schema cache|not find/i.test(message);

export const useAppPalette = () => {
  const [setting, setSetting] = useState<AppPaletteSetting | null>(memory);
  const requestRef = useRef(0);
  const enabled = !!isSupabaseConfigured();

  useEffect(() => {
    listeners.add(setSetting);
    return () => { listeners.delete(setSetting); };
  }, []);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    const { data, error } = await supabase
      .from(TABLE)
      .select('palette, palette_ends_on')
      .eq('id', 1)
      .maybeSingle();
    if (request !== requestRef.current) return;
    if (error) {
      if (isMissingColumn(error.message || '')) { publish(null); return; }
      throw error;
    }
    publish(data ? { palette: data.palette || DEFAULT_PALETTE_ID, endsOn: data.palette_ends_on || null } : null);
  }, []);

  useEffect(() => {
    if (enabled) load().catch(e => console.warn('[AppPalette] load failed', e));
  }, [enabled, load]);

  useRefreshable(load, enabled);

  /** Super admin only; the database refuses anyone else (v78). */
  const save = useCallback(async (next: AppPaletteSetting) => {
    // update, not upsert: the row exists since v78, and an upsert would have
    // to send the Home background's columns too.
    const { data, error } = await supabase
      .from(TABLE)
      .update({ palette: next.palette, palette_ends_on: next.endsOn, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Only a super admin can change the app colors.');
    publish(next);
  }, []);

  const activeId = effectivePaletteId(setting);
  return {
    setting,
    activePaletteId: activeId,
    activePalette: findPalette(activeId)!,
    save,
  };
};

/** The palette currently applied on <html>. Re-renders when it changes. */
export const useCurrentPalette = (): AppPalette => {
  const [p, setP] = useState(currentPalette);
  useEffect(() => onPaletteChange(setP), []);
  return p;
};

/**
 * The applied accent as a literal hex, for canvas and WebGL, which cannot
 * resolve var(--c-accent). Re-renders when the palette changes.
 */
export const useAccentHex = (): string => useCurrentPalette().accent;

/** Mounted once in App: keeps the palette current for every visitor. */
export const AppPaletteSync: FC = () => {
  useAppPalette();
  return null;
};
