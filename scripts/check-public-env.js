#!/usr/bin/env node
/**
 * Fail the build if a secret-shaped variable is about to be compiled into the
 * public JavaScript bundle.
 *
 * WHY THIS EXISTS
 *
 * Create React App inlines every REACT_APP_* variable into the bundle at build
 * time. It is not read from a server at runtime — it becomes a literal string
 * in build/static/js/, served to anyone who opens the app, signed in or not.
 *
 * That is not a hypothetical here. The studio's Google OAuth client secret
 * shipped this way as REACT_APP_GOOGLE_CLIENT_SECRET and was served in plain
 * text from didc.app until it was moved into the `google-oauth` Edge Function.
 * Nothing in the toolchain objected, because nothing was watching. This is the
 * thing that watches.
 *
 * WHAT IT CHECKS
 *
 * Any REACT_APP_* name containing SECRET, PASSWORD, PRIVATE, CREDENTIAL or
 * SERVICE_ACCOUNT. Matching on the *name* rather than trying to sniff values
 * keeps this predictable and keeps secrets out of this script's own output —
 * it prints names only, never values.
 *
 * REACT_APP_SUPABASE_ANON_KEY deliberately does not match. The anon key is
 * public by design; it is the RLS policies that protect that data, not the
 * secrecy of the key. A blanket rule on _KEY would flag it every build and
 * teach everyone to ignore this check.
 *
 * WHERE IT LOOKS
 *
 * Both the ambient environment (how Vercel supplies vars) and the .env files
 * on disk (how a local build supplies them). The second half matters: CRA loads
 * .env files itself, inside react-scripts, so a secret sitting in .env.local is
 * absent from process.env at the time this prebuild hook runs and would sail
 * straight past a check that only read process.env.
 *
 * The file list and its precedence mirror react-scripts/config/env.js.
 */

const fs = require('fs');
const path = require('path');

const FORBIDDEN = /SECRET|PASSWORD|PRIVATE|CREDENTIAL|SERVICE_ACCOUNT/;
const PREFIX = 'REACT_APP_';

const root = path.resolve(__dirname, '..');
const nodeEnv = process.env.NODE_ENV || 'production';

// Same files, same order, as react-scripts loads them.
const envFiles = [
  `.env.${nodeEnv}.local`,
  `.env.${nodeEnv}`,
  '.env.local',
  '.env',
].map((f) => path.join(root, f));

/** Variable names defined in a .env file. Values are never read. */
const namesInFile = (file) => {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=')[0].trim())
    .filter(Boolean);
};

// origin is kept per name so the message can say where to go and delete it.
const found = new Map();

for (const name of Object.keys(process.env)) {
  if (name.startsWith(PREFIX) && FORBIDDEN.test(name)) {
    found.set(name, 'the build environment (Vercel project settings)');
  }
}

for (const file of envFiles) {
  for (const name of namesInFile(file)) {
    if (name.startsWith(PREFIX) && FORBIDDEN.test(name) && !found.has(name)) {
      found.set(name, path.relative(root, file));
    }
  }
}

if (found.size === 0) process.exit(0);

console.error('');
console.error('  BUILD STOPPED — a secret would be compiled into the public bundle.');
console.error('');
for (const [name, origin] of found) {
  console.error(`    ${name}`);
  console.error(`      defined in: ${origin}`);
}
console.error('');
console.error('  Every REACT_APP_* variable is inlined into build/static/js/ and served');
console.error('  to anyone who loads the app. A secret must never be one of them.');
console.error('');
console.error('  Move it server-side — a Supabase Edge Function reading it from Deno.env');
console.error('  — then delete the REACT_APP_* copy from wherever it is listed above.');
console.error('  See supabase/functions/google-oauth/ for the shape of that fix.');
console.error('');
console.error('  If this name is genuinely public and safe, add it to the exemptions in');
console.error('  scripts/check-public-env.js and say why.');
console.error('');

process.exit(1);
