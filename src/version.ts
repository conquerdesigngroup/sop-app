/**
 * The app's version, in one place for everything that lives under src/.
 *
 * There are two other copies that cannot import this one — public/manifest.json
 * and public/service-worker.js are static files served as-is, outside the
 * bundle. `./update-version.sh <version>` rewrites all three together, and it
 * is the only supported way to change this: bumping one without the others is
 * how an update fails to reach installed phones.
 *
 * The service worker copy is the load-bearing one. A browser decides whether to
 * install a new worker by byte-comparing the fetched service-worker.js with the
 * installed one, so if CACHE_VERSION does not change the file is identical, no
 * install fires, no update banner appears, and the old cache is never evicted.
 */
export const APP_VERSION = '1.0.15';
