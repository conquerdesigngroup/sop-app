#!/usr/bin/env node
/**
 * Stamp the built service worker with the bundle's own content hash.
 *
 * WHY THIS EXISTS
 *
 * A browser installs a new service worker only when service-worker.js differs
 * byte-for-byte from the one it already has. CACHE_VERSION in the source is a
 * hand-typed string, bumped by update-version.sh — which is wired into nothing
 * and has to be remembered.
 *
 * It was not remembered. public/service-worker.js last changed on 2026-08-27
 * and 37 merges reached production after it. For all 37, every installed
 * browser compared the new worker against the old one, found them identical,
 * and did nothing: no install, no activate, no cache eviction, and — because
 * onUpdate only fires for a genuinely new worker — no update banner, ever. An
 * open tab or a home-screen app kept running whatever it had.
 *
 * That is not a mistake anyone should be asked to avoid by discipline forty
 * times in a row. So the build does it.
 *
 * WHY A DIGEST OF EVERY ASSET, NOT A TIMESTAMP AND NOT main.js
 *
 * A timestamp changes on every build, including rebuilds of identical source.
 * That would hand every user a worker update and a cache eviction for a deploy
 * that changed nothing — churn, and a banner that cries wolf.
 *
 * main.js alone is not enough either, and that is the subtler trap: the app is
 * code-split, so the whole parent profile lives in a lazy chunk. A change
 * confined to that chunk leaves main.js byte-identical — and keying on it would
 * have shipped exactly the silent-stale-app bug this script exists to kill.
 *
 * So the digest covers every content-hashed file CRA emits. It moves when any
 * shipped byte moves, and not otherwise.
 *
 * WHY THE BUILD OUTPUT AND NOT THE SOURCE
 *
 * Rewriting public/service-worker.js would dirty the working tree on every
 * build and put a machine-generated hash into every diff. The source keeps its
 * readable version string; only build/ is stamped.
 */

const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', 'build');
const SW = path.join(BUILD, 'service-worker.js');
const MANIFEST = path.join(BUILD, 'asset-manifest.json');

const fail = (msg) => {
  // Loud, and non-zero. A silently un-stamped worker is the exact failure this
  // script exists to prevent, so it must never be the quiet outcome.
  console.error(`\n  stamp-service-worker: ${msg}\n`);
  process.exit(1);
};

if (!fs.existsSync(SW)) fail(`no service worker at ${SW}`);
if (!fs.existsSync(MANIFEST)) fail(`no asset-manifest.json at ${MANIFEST}`);

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const files = manifest.files || {};
const entries = Object.keys(files).sort().map((k) => `${k}=${files[k]}`);
if (!entries.length) fail('asset-manifest.json lists no files');

// Every emitted filename carries CRA's content hash, so digesting the sorted
// manifest is a digest of the whole build — main bundle, every lazy chunk, CSS
// and media alike.
const hash = require('crypto')
  .createHash('sha256')
  .update(entries.join('\n'))
  .digest('hex')
  .slice(0, 12);

const version = require(path.join(__dirname, '..', 'package.json')).version;
const stamp = `${version}+${hash}`;

const source = fs.readFileSync(SW, 'utf8');
const RE = /const CACHE_VERSION = '[^']*';/;
if (!RE.test(source)) fail('CACHE_VERSION declaration not found in the built service worker — has its shape changed?');

const stamped = source.replace(RE, `const CACHE_VERSION = '${stamp}';`);
if (stamped === source) fail('substitution produced no change, refusing to ship an unstamped worker');

fs.writeFileSync(SW, stamped);
console.log(`  service worker stamped: CACHE_VERSION = '${stamp}'`);
