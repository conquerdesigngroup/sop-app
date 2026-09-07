/**
 * Renders packet.html to PDF via the project's Playwright Chromium.
 * Usage: node print.js <html-path> <pdf-path>
 */
const path = require('path');
const { chromium } = require(path.join(process.env.PROJECT_DIR, 'node_modules', 'playwright'));

(async () => {
  const [htmlPath, pdfPath] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(htmlPath), { waitUntil: 'networkidle' });
  // Make sure webfonts have actually arrived before printing.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  await browser.close();
  console.log('WROTE', pdfPath);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
