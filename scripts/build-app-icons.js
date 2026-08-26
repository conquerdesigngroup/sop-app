#!/usr/bin/env node
/**
 * Render the app icon set from the DIDC outline wordmark.
 *
 *   npm install --no-save sharp && node scripts/build-app-icons.js
 *
 * sharp is deliberately NOT a dependency. Icons change perhaps once a year, and
 * a 30MB native module in every install and every Vercel build to serve that is
 * a bad trade. The outputs are committed; this script exists so they can be
 * regenerated on purpose rather than being undocumented binaries nobody can
 * reproduce.
 *
 * WHY THE MARK IS NOT THE WHOLE ICON
 *
 * didc-outline-white.svg is 300x68 — about 4.4:1. Centred at full width in a
 * square it would be a fifth of the height, so the icon is mostly empty. The
 * widths below are the compromise: as large as each context allows.
 *
 * TWO SIZES OF THE SAME ICON, FOR A REASON
 *
 * Android crops a `maskable` icon to a circle of 80% diameter and throws the
 * corners away. A wordmark spanning 80% of the width would lose the D and the C.
 * The maskable variants are therefore drawn narrower so the whole word sits
 * inside that circle, and are declared separately in manifest.json — one icon
 * marked "any maskable" (which is what this project had) forces the same
 * artwork through both treatments and one of them always looks wrong.
 *
 * Geometry check for the 70% maskable width: the mark is then 70/4.4 = 15.9% of
 * the canvas tall, so it spans +/-7.9% from centre. The safe circle's half-width
 * at that offset is sqrt(0.40^2 - 0.079^2) = 39.2% -> 78.4% usable. 70 < 78.4,
 * so the word clears the mask with room to spare.
 *
 * No rounded corners are baked in. iOS and Android both apply their own mask,
 * and a pre-rounded square gets rounded twice.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const MARK = path.join(ROOT, 'public/brand/logos/didc-outline-white.svg');
const OUT = path.join(ROOT, 'public');

/** manifest.json background_color / theme_color. The icon must not disagree. */
const VOID = { r: 11, g: 11, b: 13, alpha: 1 };

const TARGETS = [
  { file: 'icon-192.png', size: 192, markWidth: 0.8 },
  { file: 'icon-512.png', size: 512, markWidth: 0.8 },
  { file: 'icon-maskable-192.png', size: 192, markWidth: 0.7 },
  { file: 'icon-maskable-512.png', size: 512, markWidth: 0.7 },
  // iOS applies its own squircle and never a circle, so this matches the "any"
  // width rather than the narrower maskable one.
  { file: 'apple-touch-icon.png', size: 180, markWidth: 0.8 },
  // NO FAVICONS HERE, DELIBERATELY. Rendered at 32px the four letters collapse
  // into an illegible smudge — the outline mark is drawn with a hairline inline
  // that simply has nowhere to go below about 64px. Shipping that would trade a
  // legible old mark in the browser tab for an unreadable new one, so the tab
  // keeps favicon-32x32.png until a mark that survives 16px is chosen. A filled
  // single letter is the usual answer; that is a brand decision, not a build step.
];

const svg = fs.readFileSync(MARK);

const build = async ({ file, size, markWidth }) => {
  const width = Math.round(size * markWidth);

  // Rasterise the mark at 4x the needed width and let the resize step average
  // it down. Going straight to `width` at default density leaves the hairline
  // inline of the outline mark aliased into grey mush at small sizes.
  const mark = await sharp(svg, { density: 72 * 4 })
    .resize({ width, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: VOID },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, file));

  const { size: bytes } = fs.statSync(path.join(OUT, file));
  console.log(`  ${file.padEnd(26)} ${size}x${size}  mark ${Math.round(markWidth * 100)}%  ${(bytes / 1024).toFixed(1)}kB`);
};

(async () => {
  console.log('Rendering app icons from didc-outline-white.svg\n');
  for (const t of TARGETS) await build(t);
  console.log('\nDone. Remember manifest.json and index.html must reference these names.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
