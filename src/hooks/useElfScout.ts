import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useRefreshable } from '../contexts/RefreshContext';
import type { ElfSetting } from '../lib/elfScout';

/**
 * The Christmas elf switch a super admin flips in Settings → Christmas elf.
 *
 * Stored in the single row of home_scene_setting (columns elf_enabled,
 * elf_ends_on, elf_on_portal; migration v82), which everyone can read since
 * v79 and only a super admin can write since v78.
 *
 * Before v82 is applied the columns do not exist: that reads as "off" and is
 * not an error. The last value is cached in localStorage so he does not have
 * to wait for a round trip to sit down.
 */

const CACHE_KEY = 'didc_elf_setting';
const TABLE = 'home_scene_setting';

const readCache = (): ElfSetting | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ElfSetting) : null;
  } catch {
    return null;
  }
};

let memory: ElfSetting | null = readCache();
const listeners = new Set<(s: ElfSetting | null) => void>();

const publish = (s: ElfSetting | null) => {
  memory = s;
  try {
    if (s) localStorage.setItem(CACHE_KEY, JSON.stringify(s));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* private window: the in-memory copy still works */
  }
  listeners.forEach(l => l(s));
};

export const isMissingElfColumn = (message: string) =>
  /elf_|home_scene_setting/.test(message) && /does not exist|schema cache|not find/i.test(message);

/**
 * @param active Load and register with the refresh button only while true.
 *   The host mounts on every page, and most visitors never need it fetched
 *   twice; Settings passes true.
 */
export const useElfScout = (active: boolean = true) => {
  const [setting, setSetting] = useState<ElfSetting | null>(memory);
  const requestRef = useRef(0);
  const enabled = active && !!isSupabaseConfigured();

  useEffect(() => {
    listeners.add(setSetting);
    return () => { listeners.delete(setSetting); };
  }, []);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    const { data, error } = await supabase
      .from(TABLE)
      .select('elf_enabled, elf_ends_on, elf_on_portal')
      .eq('id', 1)
      .maybeSingle();
    if (request !== requestRef.current) return;
    if (error) {
      if (isMissingElfColumn(error.message || '')) { publish(null); return; }
      throw error;
    }
    publish(data
      ? { enabled: !!data.elf_enabled, endsOn: data.elf_ends_on || null, onPortal: !!data.elf_on_portal }
      : null);
  }, []);

  useEffect(() => {
    if (enabled) load().catch(e => console.warn('[ElfScout] load failed', e));
  }, [enabled, load]);

  useRefreshable(load, enabled);

  /** Super admin only; the database refuses anyone else (v78). */
  const save = useCallback(async (next: ElfSetting) => {
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        elf_enabled: next.enabled,
        elf_ends_on: next.endsOn,
        elf_on_portal: next.onPortal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Only a super admin can switch the Christmas elf on or off.');
    publish(next);
  }, []);

  return { setting, save };
};
