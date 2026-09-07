/**
 * Screenshots every .page section of packet.html to pgN.png and reports
 * any page whose content overflows its fixed 8.5x11in box.
 * Usage: node proof.js <html-path> <out-dir> [pageFilter e.g. 1,3,5]
 */
const path = require('path');
const { chromium } = require(path.join(process.env.PROJECT_DIR, 'node_modules', 'playwright'));

(async () => {
  const [htmlPath, outDir, filter] = process.argv.slice(2);
  const only = filter ? filter.split(',').map(Number) : null;
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1.4 });
  await page.goto('file://' + path.resolve(htmlPath), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  const pages = await page.$$('.page');
  console.log('PAGES', pages.length);
  for (let i = 0; i < pages.length; i++) {
    const n = i + 1;
    const info = await pages[i].evaluate((el) => {
      const overflows = [];
      // does anything spill outside the fixed page box?
      const pr = el.getBoundingClientRect();
      el.querySelectorAll('*').forEach((child) => {
        const r = child.getBoundingClientRect();
        if (r.height === 0 && r.width === 0) return;
        if (r.bottom > pr.bottom + 1 || r.right > pr.right + 1 || r.left < pr.left - 1) {
          const tag = child.tagName.toLowerCase() + (child.className && typeof child.className === 'string' ? '.' + child.className.split(' ')[0] : '');
          overflows.push(`${tag} bottom=${Math.round(r.bottom - pr.bottom)} right=${Math.round(r.right - pr.right)}`);
        }
      });
      return overflows.slice(0, 5);
    });
    if (info.length) console.log(`PAGE ${n} OVERFLOW:`, info.join(' | '));
    if (only && !only.includes(n)) continue;
    await pages[i].screenshot({ path: path.join(outDir, `pg${String(n).padStart(2, '0')}.png`) });
  }
  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
