import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefreshable } from '../contexts/RefreshContext';
import { DEFAULT_SCENE_ID, effectiveSceneId } from '../lib/homeScenes';

/**
 * The seasonal background chosen for staff Home, from the single row of
 * home_scene_setting (v78). One studio-wide setting: a super admin picks it in
 * Settings and every staff member's Home shows it.
 *
 * The last value seen is kept in memory and in localStorage, so Home paints
 * the right background on its first frame instead of flashing the everyday
 * contour field and then swapping.
 *
 * Before v78 is applied the table does not exist. That reads as "no seasonal
 * scene" and is not an error: the refresh button should not report a failure
 * for a feature nobody has switched on.
 */

export interface HomeSceneSetting {
  scene: string;
  /** Last day the scene shows, YYYY-MM-DD; null = until someone turns it off. */
  endsOn: string | null;
}

const CACHE_KEY = 'didc_home_scene';
const TABLE = 'home_scene_setting';

const readCache = (): HomeSceneSetting | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as HomeSceneSetting) : null;
  } catch {
    return null;
  }
};

let memory: HomeSceneSetting | null = readCache();
const listeners = new Set<(s: HomeSceneSetting | null) => void>();

const publish = (s: HomeSceneSetting | null) => {
  memory = s;
  try {
    if (s) localStorage.setItem(CACHE_KEY, JSON.stringify(s));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* private window: the in-memory copy still works */
  }
  listeners.forEach(l => l(s));
};

const isMissingTable = (message: string) =>
  /home_scene_setting/.test(message) && /does not exist|schema cache|not find/i.test(message);

export const useHomeScene = () => {
  const { isAuthenticated } = useAuth();
  const [setting, setSetting] = useState<HomeSceneSetting | null>(memory);
  const requestRef = useRef(0);
  const enabled = !!(isAuthenticated && isSupabaseConfigured());

  useEffect(() => {
    listeners.add(setSetting);
    return () => { listeners.delete(setSetting); };
  }, []);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    const { data, error } = await supabase.from(TABLE).select('scene, ends_on').eq('id', 1).maybeSingle();
    if (request !== requestRef.current) return;
    if (error) {
      if (isMissingTable(error.message || '')) { publish(null); return; }
      throw error;
    }
    publish(data ? { scene: data.scene || DEFAULT_SCENE_ID, endsOn: data.ends_on || null } : null);
  }, []);

  useEffect(() => {
    if (enabled) load().catch(e => console.warn('[HomeScene] load failed', e));
  }, [enabled, load]);

  useRefreshable(load, enabled);

  /** Super admin only; the database refuses anyone else (v78). */
  const save = useCallback(async (next: HomeSceneSetting) => {
    const { error } = await supabase
      .from(TABLE)
      .upsert({ id: 1, scene: next.scene, ends_on: next.endsOn, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
    publish(next);
  }, []);

  return {
    setting,
    /** What Home should draw today, after the end date and unknown ids are applied. */
    activeSceneId: effectiveSceneId(setting),
    save,
  };
};
