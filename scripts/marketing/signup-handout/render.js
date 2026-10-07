#!/usr/bin/env node
/**
 * Render the one-page sign-up handout to a print-ready PDF.
 *
 *   node render.js [--out path.pdf] [--png] [--size letter|a4]
 *
 * Chromium rather than a PDF library, because the point of this page is that it
 * carries the studio's actual type (Kanit, Barlow, JetBrains Mono) and the app's
 * actual screens. Drawing those by hand in reportlab would mean maintaining a
 * second, diverging copy of the brand. The text stays real text in the output —
 * selectable, searchable, and sharp at any print resolution.
 *
 * `--png` also writes a screenshot, which is what to look at while editing: a
 * PDF has to be opened to be judged, a PNG does not.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HERE = __dirname;
const REPO = path.resolve(HERE, '../../..');

function findBundled(prefix, ...rel) {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(root)) return null;
  const dir = fs.readdirSync(root).filter(d => d.startsWith(prefix)).sort().pop();
  if (!dir) return null;
  const p = path.join(root, dir, ...rel);
  return fs.existsSync(p) ? p : null;
}
const CHROME = findBundled('chromium-', 'chrome-linux', 'chrome');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i === -1 ? d : args[i + 1]; };
const has = n => args.includes('--' + n);

/* Letter is the default because the studio is in the US. A4 is the same page
   with a different box: 1123px tall instead of 1056, so the only thing that
   moves is how much air sits above the help panel, which is pinned to the
   bottom with margin-top:auto. */
const SIZES = {
  letter: { w: 816, h: 1056, css: '8.5in 11in' },
  a4:     { w: 794, h: 1123, css: '210mm 297mm' },
};
const SIZE = SIZES[arg('size', 'letter')];
if (!SIZE) { console.error('--size must be letter or a4'); process.exit(1); }

const OUT = path.resolve(arg('out',
  path.join(REPO, 'docs/marketing/how-to-create-your-account-handout.pdf')));

/** Inline the fonts and the brand mark so the page renders with no network. */
function buildHtml() {
  let html = fs.readFileSync(path.join(HERE, 'handout.html'), 'utf8');
  const fontCss = fs.readFileSync(path.join(HERE, '../assets/fonts.css'), 'utf8');
  const logo = fs.readFileSync(path.join(REPO, 'public/brand/logos/didc-mark-3d.png'));
  html = html.replace('__FONT_CSS__', fontCss);
  html = html.split('__LOGO__').join('data:image/png;base64,' + logo.toString('base64'));
  html = html.replace('@page { size: 8.5in 11in; margin: 0; }', `@page { size: ${SIZE.css}; margin: 0; }`);
  html = html.replace('html,body{width:816px;height:1056px;background:#FFFFFF}',
    `html,body{width:${SIZE.w}px;height:${SIZE.h}px;background:#FFFFFF}`);
  html = html.replace('#page{position:relative;width:816px;height:1056px;',
    `#page{position:relative;width:${SIZE.w}px;height:${SIZE.h}px;`);
  return html;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'didc-handout-'));
  const file = path.join(tmp, 'handout.html');
  fs.writeFileSync(file, buildHtml());

  const browser = await chromium.launch({
    executablePath: CHROME || undefined,
    args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--font-render-hinting=none'],
  });
  const page = await browser.newPage({ viewport: { width: SIZE.w, height: SIZE.h } });
  await page.goto('file://' + file);
  await page.evaluate(() => document.fonts.ready);

  /* If the content has outgrown the sheet this is where you find out, rather
     than in the print shop: the PDF would quietly spill onto a second page. */
  const overflow = await page.evaluate(h => {
    const el = document.getElementById('page');
    return { needs: el.scrollHeight, has: h };
  }, SIZE.h);
  if (overflow.needs > overflow.has) {
    console.error(`content is ${overflow.needs - overflow.has}px taller than the sheet ` +
      `(${overflow.needs} > ${overflow.has}) — it will break onto a second page.`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.pdf({
    path: OUT,
    width: SIZE.css.split(' ')[0],
    height: SIZE.css.split(' ')[1],
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  if (has('png')) {
    const png = OUT.replace(/\.pdf$/, '.png');
    await page.screenshot({ path: png, fullPage: false });
    console.log(png);
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`${OUT}\n${kb} KB · ${SIZE.css} · 1 page`);
})();
