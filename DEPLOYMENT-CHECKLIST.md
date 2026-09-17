# Deployment Checklist

## How a deploy happens

Vercel is connected to this repository, so **pushing to `main` is the deploy**.
There is no separate release step and no `vercel --prod` to run: the push starts
a production build, and when it goes READY the `didc.app` and `www.didc.app`
aliases move to it. A push to any other branch builds a preview on its own URL
and touches nothing families can see — which is the cheap way to look at a
change on a real phone before it is live.

```bash
git push origin main      # production, didc.app
git push origin my-branch # preview only
```

Watch it at https://vercel.com/tony-zs-projects/sop-app. A CRA build here takes
about a minute.

## Before you push

```bash
npm test -- --watchAll=false
npx tsc --noEmit               # ignore the two tsconfig deprecation notices
npm run build                  # must end with "service worker stamped: …"
```

For anything that changes the UI, also run the mobile audit — it is mandatory,
and CLAUDE.md explains why at length:

```bash
npm start                      # in another terminal
npm run audit:mobile
```

A bare run checks the public routes only and says so loudly — read that note,
it tells you how many signed-in routes it skipped, and it is the larger half of
the app. Those need `AUDIT_EMAIL` and `AUDIT_PASSWORD`.

`npm run build` runs two guards of its own. `prebuild` refuses to build if a
secret-shaped `REACT_APP_*` variable is about to be inlined into the public
bundle (`scripts/check-public-env.js` — the Google client secret shipped that
way once). `postbuild` stamps the service worker, below, and exits non-zero
rather than shipping an unstamped one.

## The version number: no longer part of deploying

**You do not need to bump the version to ship.** This section used to be first
in this file and it was wrong — `src/version.ts` read `1.0.22` across many
deploys because nothing depends on it any more.

What the bump used to be for was cache-busting, and that is now automatic. A
browser installs a new service worker only when `service-worker.js` differs
byte-for-byte from the one it has, so a hand-typed `CACHE_VERSION` that nobody
remembered to change meant no install, no cache eviction and no update banner —
which is exactly what happened for 37 consecutive merges. `postbuild` now runs
`scripts/stamp-service-worker.js`, which rewrites `CACHE_VERSION` in the **built**
worker to `<package version>+<digest>`, where the digest covers every
content-hashed file CRA emitted. It moves when any shipped byte moves, and not
otherwise. The source file keeps its readable version string and is never
dirtied.

So bump the version only when you want **Settings → About** to show a new
number — a milestone, or something you want to be able to ask a parent to read
back to you over the phone:

```bash
./update-version.sh 1.0.23
```

That rewrites all four places at once: `package.json`, `src/version.ts`,
`public/service-worker.js` and `public/manifest.json`. **Nothing else to edit** —
`SettingsPage.tsx` imports `APP_VERSION` from `src/version.ts` and always has,
so the old instruction here to hand-edit it in two places was editing a file
that reads the constant.

## After the deploy

- [ ] Vercel shows the deployment READY with target `production`
- [ ] Open didc.app and confirm the change is there
- [ ] Hard-refresh, or wait ~60s, and confirm the update banner appears on a
      device that had the app open — this is what proves the new worker
      installed
- [ ] If you bumped the version, Settings → About shows it

## If someone is stuck on an old build

First check Settings → Cache & Data against the deployed digest; if they match,
it is not a cache problem.

Tell them:

1. Settings (gear icon)
2. Scroll to **Cache & Data**
3. **Clear All Cache & Reload**

### Forcing it for everyone

Rare, and only when the stamp cannot do its job — a worker that is itself
broken, for instance. Give the version a suffix and deploy:

```bash
./update-version.sh 1.0.23-force-clear
```

The stamp keeps the package version as its prefix, so this reaches the built
worker as `1.0.23-force-clear+<digest>` and every installed client sees a new
worker and evicts its caches.

## Quick fixes

### Old logo persisting
Not a cache issue if it survives a cache clear. Check `public/` for old logo
files and any hardcoded image URLs. Note that `BRAND_MARK` in `src/theme.ts` is
the only mark any screen should draw.

### Old SOP or portal data persisting
That is database data, not cache — clearing the cache will not touch it. Check
the rows in Supabase.

### Service worker not updating
- Confirm the build ended with `service worker stamped: …` and that the digest
  differs from the previous deploy's
- DevTools → Application → Service Workers
- Last resort: Unregister → close all tabs → reopen

### `EPERM: operation not permitted, uv_cwd` from npm
Nothing to do with this project — the repo lives in iCloud Drive and macOS is
refusing npm access. System Settings → Privacy & Security → Full Disk Access,
add Terminal, then quit it fully (⌘Q).
