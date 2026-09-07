import type { Sprite } from './types';

/**
 * Loading the art, and surviving not loading it.
 *
 * THE ONE PROPERTY THIS FILE PROTECTS
 *
 * The decorative layer must never be able to break the front door. These two
 * tiles are the only way into either half of the product, so every failure here
 * degrades to "that character does not appear" and never to a thrown error, a
 * broken-image glyph or a layout shift.
 *
 * That is why sprites are drawn from a decoded bitmap rather than an <img> in
 * the tree: a failed <img> reserves space, shows a glyph and can shift the page.
 * A failed decode here leaves `img: null`, the director declines to cast any act
 * that needs it, and nobody ever knows.
 *
 * A note on the offline case, because the failure is silent BY DESIGN and looks
 * accidental: public/service-worker.js falls back to caches.match('/index.html')
 * for a failed asset fetch, so an offline sprite request resolves with status
 * 200 and an HTML body. decode() rejects on that, which lands in exactly the
 * same null path as a 404. Intended, not a bug.
 *
 * The cache is module-level and keyed by URL, so StrictMode's double mount in
 * development, a theme toggle (which re-runs the whole effect) and navigating
 * away and back all cost zero extra fetches.
 */

interface Entry {
  sprite: Sprite;
  /** Resolves either way — a failure is a resolved sprite with a null img. */
  settled: Promise<void>;
}

const cache = new Map<string, Entry>();

const load = (url: string, w: number, h: number): Entry => {
  const existing = cache.get(url);
  if (existing) return existing;

  const sprite: Sprite = { img: null, w, h };
  const settled = new Promise<void>((resolve) => {
    if (typeof Image !== 'function') {
      resolve();
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    const done = () => {
      sprite.img = img;
      resolve();
    };
    const fail = () => {
      // Left null forever. Every act needing it stays permanently ineligible.
      console.warn(`[holiday] sprite unavailable, its acts will not run: ${url}`);
      resolve();
    };
    img.onload = () => {
      // decode() so the first drawImage never stalls the compositor; onload
      // alone can still hand back an undecoded bitmap.
      if (typeof img.decode === 'function') {
        img.decode().then(done, fail);
      } else {
        done();
      }
    };
    img.onerror = fail;
    img.src = url;
  });

  const entry: Entry = { sprite, settled };
  cache.set(url, entry);
  return entry;
};

export interface SpriteStore {
  sprites: Record<string, Sprite>;
  /** True once the art exists. False while decoding AND false forever on failure. */
  ready(key: string): boolean;
  /** Fires as each sprite settles, so a still frame can be repainted. */
  subscribe(cb: () => void): () => void;
  dispose(): void;
}

export const createSpriteStore = (
  manifest: Record<string, { url: string; w: number; h: number }>,
  keys: readonly string[]
): SpriteStore => {
  const sprites: Record<string, Sprite> = {};
  const listeners = new Set<() => void>();
  let alive = true;

  keys.forEach((key) => {
    const spec = manifest[key];
    if (!spec) return;
    const entry = load(spec.url, spec.w, spec.h);
    sprites[key] = entry.sprite;
    entry.settled.then(() => {
      if (alive) listeners.forEach((cb) => cb());
    });
  });

  return {
    sprites,
    ready: (key) => Boolean(sprites[key]?.img),
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      alive = false;
      listeners.clear();
    },
  };
};
