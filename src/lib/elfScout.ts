import { localDayKey } from './homeScenes';

/**
 * The Christmas elf scout: a little felt elf who hides somewhere in the app
 * each day. Whoever spots him taps him, he bursts into sparkles with "You
 * found me, fa la la la la!", and he stays gone on that device until the next
 * morning, when he has moved somewhere else.
 *
 * A super admin switches him on in Settings → Christmas elf (columns elf_* on
 * home_scene_setting, migration v82). Everything in this file is pure so the
 * hiding place can be tested and so every device agrees where he is: the page
 * and the perch are both picked from the date, not at random.
 *
 * "Perch" is any visible card-like box on the page; he sits on its top edge
 * with his legs over the front, like a shelf. A component can offer itself
 * explicitly with data-elf-perch, and data-elf-perch="off" keeps him off it.
 */

export type ElfAudience = 'staff' | 'portal';

export interface ElfPage {
  /** Stable key, matched against the current path by elfPageKey. */
  key: string;
  /** What a super admin is told in Settings: "Today he is on …". */
  label: string;
  /** Where "Go find him" goes. For the portal this is relative to a program. */
  path: string;
}

/** Pages every member of staff can open, whatever their role. */
export const ELF_STAFF_PAGES: ElfPage[] = [
  { key: 'dashboard', label: 'Home', path: '/dashboard' },
  { key: 'my-tasks', label: 'My Tasks', path: '/my-tasks' },
  { key: 'calendar', label: 'Calendar', path: '/calendar' },
  { key: 'sop', label: 'SOPs', path: '/sop' },
  { key: 'reports', label: 'Shift reports', path: '/reports' },
  { key: 'profile', label: 'My account', path: '/profile' },
];

/** Pages every family can open. The program pages count for every program. */
export const ELF_PORTAL_PAGES: ElfPage[] = [
  { key: 'portal', label: 'the portal home', path: '/portal' },
  { key: 'program', label: 'a section overview', path: '' },
  { key: 'classes', label: 'Classes', path: 'classes' },
  { key: 'updates', label: 'Updates', path: 'updates' },
  { key: 'calendar', label: 'the calendar', path: 'calendar' },
];

/** Fired on window when Settings brings him back on this device. */
export const ELF_RESET_EVENT = 'didc-elf-reset';

export const ELF_MESSAGE = 'You found me, fa la la la la!';

export interface ElfSetting {
  enabled: boolean;
  /** Last day he hides, YYYY-MM-DD; null = until switched off. */
  endsOn: string | null;
  /** Parents can find him on the portal too. */
  onPortal: boolean;
}

/** Is he out today? Off the morning after endsOn. */
export const elfIsOut = (s: ElfSetting | null | undefined, today: string = localDayKey()): boolean =>
  !!s && s.enabled && (!s.endsOn || today <= s.endsOn);

/** FNV-1a: small, stable, and the same in every browser. */
export const hashString = (str: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** Whole days since 2000-01-01, by local calendar date. */
const dayNumber = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000) - 10_957;
};

/** A shuffled order of 0..n-1, the same for a given seed everywhere. */
const shuffled = (n: number, seed: string): number[] => {
  const order = Array.from({ length: n }, (_, i) => i);
  let h = hashString(seed);
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
};

const cycleOrder = (cycle: number, n: number, audience: ElfAudience): number[] => {
  const order = shuffled(n, `elf-page-${audience}:${cycle}`);
  // Never the same page two days running, across the seam between cycles too.
  if (n > 1 && order[0] === shuffled(n, `elf-page-${audience}:${cycle - 1}`)[n - 1]) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
};

/**
 * Which page he hides on, as an index into the audience's page list. He works
 * through every page in a shuffled order before any repeats, and never hides
 * on the same page two days running: that is the whole point of hiding.
 */
export const elfPageIndex = (day: string, audience: ElfAudience): number => {
  const n = (audience === 'staff' ? ELF_STAFF_PAGES : ELF_PORTAL_PAGES).length;
  const k = dayNumber(day);
  const cycle = Math.floor(k / n);
  return cycleOrder(cycle, n, audience)[k - cycle * n];
};

export const elfPageFor = (day: string, audience: ElfAudience): ElfPage =>
  (audience === 'staff' ? ELF_STAFF_PAGES : ELF_PORTAL_PAGES)[elfPageIndex(day, audience)];

const PORTAL_STATIC = new Set(['profile', 'policies', 'evaluations', 'login', 'signup', 'update-password', 'account']);

/**
 * The page key for a path, or null for pages he never hides on (the front
 * door, sign-in screens, detail pages, management pages).
 */
export const elfPageKey = (pathname: string, audience: ElfAudience): string | null => {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (audience === 'staff') {
    const hit = ELF_STAFF_PAGES.find(p => p.path === path);
    return hit ? hit.key : null;
  }
  if (path === '/portal') return 'portal';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'portal' || parts.length < 2 || PORTAL_STATIC.has(parts[1])) return null;
  if (parts.length === 2) return 'program';
  if (parts.length === 3 && ['classes', 'updates', 'calendar'].includes(parts[2])) return parts[2];
  return null;
};

export interface ElfPerchPlan {
  /** Index into the candidate list (document order). */
  index: number;
  /** Where along the top edge he sits, 0 = left, 1 = right. */
  along: number;
}

/** Which of the page's perches, and where along it. */
export const elfPerchPlan = (day: string, audience: ElfAudience, count: number): ElfPerchPlan => {
  const h = hashString(`elf-perch-${audience}:${day}`);
  // Prefer the first few perches: a hiding place three screens down on a
  // long list is a hiding place nobody finds. Weighted toward the top half.
  const reach = Math.max(1, Math.min(count, 6));
  return {
    index: count > 0 ? h % reach : 0,
    along: 0.12 + ((h >>> 8) % 1000) / 1000 * 0.76,
  };
};

// ------------------------------------------------------------- found today

const FOUND_KEY = 'didc_elf_found';

/** True once he was found on this device today. */
export const elfFoundToday = (day: string = localDayKey()): boolean => {
  try {
    return localStorage.getItem(FOUND_KEY) === day;
  } catch {
    return false;
  }
};

export const markElfFound = (day: string = localDayKey()) => {
  try {
    localStorage.setItem(FOUND_KEY, day);
  } catch {
    /* private window: he comes back on reload, which is harmless */
  }
};

export const forgetElfFound = () => {
  try {
    localStorage.removeItem(FOUND_KEY);
  } catch {
    /* nothing to forget */
  }
};
