#!/usr/bin/env node
/**
 * Render the "How to create your account" motion graphic to an MP4.
 *
 * The animation in template.html is a pure function of time: nothing moves on
 * its own, every property is computed by `__seek(t)`. So we drive it frame by
 * frame rather than screen-recording it, which is why the output is exactly
 * 15.000s with no dropped or duplicated frames however slow the machine is.
 *
 *   node render.js [--fps 30] [--out path.mp4] [--frame 6.2]
 *
 * `--frame` renders a single still at that timestamp instead of the video —
 * use it while iterating on the design, it takes about a second.
 */
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HERE = __dirname;
const REPO = path.resolve(HERE, '../../..');

/* Chromium ships with Playwright's browser bundle in CI and in the cloud
   sandbox. Fall back to whatever Playwright finds on a normal laptop. */
function findBundled(prefix, ...rel) {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(root)) return null;
  const dir = fs.readdirSync(root).filter(d => d.startsWith(prefix)).sort().pop();
  if (!dir) return null;
  const p = path.join(root, dir, ...rel);
  return fs.existsSync(p) ? p : null;
}
const CHROME = findBundled('chromium-', 'chrome-linux', 'chrome');

/* NOT the ffmpeg inside the Playwright bundle. That one is compiled
   --disable-everything with VP8/WebM only, so it cannot write the H.264 this
   outputs and fails with "Unrecognized option 'preset'". Use ffmpeg-static
   (npm i --no-save ffmpeg-static) or a system ffmpeg. */
function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { return require('ffmpeg-static'); } catch (e) { /* not installed */ }
  return 'ffmpeg';
}
const FFMPEG = findFfmpeg();

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i === -1 ? dflt : args[i + 1];
};

const FPS = Number(arg('fps', 30));
const OUT = path.resolve(arg('out', path.join(REPO, 'docs/marketing/how-to-create-your-account.mp4')));
const SINGLE = arg('frame', null);

/** Inline the fonts and the brand mark so the page renders with no network. */
function buildHtml() {
  let html = fs.readFileSync(path.join(HERE, 'template.html'), 'utf8');
  const fontCss = fs.readFileSync(path.join(HERE, 'assets/fonts.css'), 'utf8');
  const logo = fs.readFileSync(path.join(REPO, 'public/brand/logos/didc-mark-3d.png'));
  html = html.replace('__FONT_CSS__', fontCss);
  html = html.split('__LOGO__').join('data:image/png;base64,' + logo.toString('base64'));
  return html;
}

(async () => {
  const html = buildHtml();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'didc-signup-'));
  const page4 = path.join(tmp, 'scene.html');
  fs.writeFileSync(page4, html);

  const browser = await chromium.launch({
    executablePath: CHROME || undefined,
    args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--font-render-hinting=none'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('file://' + page4);
  await page.evaluate(() => document.fonts.ready);

  if (SINGLE !== null) {
    const t = Number(SINGLE);
    await page.evaluate(tt => window.__seek(tt), t);
    const still = path.join(HERE, `frame-${t.toFixed(2)}.png`);
    await page.screenshot({ path: still });
    await browser.close();
    console.log('still →', still);
    return;
  }

  const DUR = await page.evaluate(() => window.__dur);
  const total = Math.round(DUR * FPS);
  const dir = path.join(tmp, 'frames');
  fs.mkdirSync(dir);

  process.stdout.write(`rendering ${total} frames @ ${FPS}fps `);
  for (let i = 0; i < total; i++) {
    await page.evaluate(t => window.__seek(t), i / FPS);
    await page.screenshot({ path: path.join(dir, String(i).padStart(4, '0') + '.png') });
    if (i % 50 === 0) process.stdout.write('.');
  }
  process.stdout.write(' done\n');
  await browser.close();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  /* yuv420p + even dimensions so it plays in Safari, Messages and PowerPoint.
     faststart puts the index first: it starts playing before it has downloaded. */
  const enc = spawnSync(FFMPEG, [
    '-y', '-framerate', String(FPS), '-i', path.join(dir, '%04d.png'),
    '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '19',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0',
    '-movflags', '+faststart', OUT,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (enc.status !== 0) {
    console.error(enc.stderr.toString().split('\n').slice(-25).join('\n'));
    console.error(`\nframes kept at ${dir} — re-encode without re-rendering once ffmpeg works.`);
    console.error('ffmpeg used:', FFMPEG);
    process.exit(1);
  }

  /* A poster frame, for anywhere the video is linked rather than embedded. */
  const poster = OUT.replace(/\.mp4$/, '-poster.jpg');
  spawnSync(FFMPEG, ['-y', '-i', path.join(dir, String(Math.round(1.0 * FPS)).padStart(4, '0') + '.png'),
    '-q:v', '3', poster], { stdio: 'ignore' });

  fs.rmSync(tmp, { recursive: true, force: true });
  const mb = (fs.statSync(OUT).size / 1048576).toFixed(2);
  console.log(`\n${OUT}\n${mb} MB · 1920x1080 · ${FPS}fps · ${DUR}s`);
  console.log(poster);
})();
