#!/usr/bin/env node
/**
 * Catch mobile layout regressions before they ship.
 *
 *   npm start                       # in another terminal
 *   npm install --no-save playwright && npx playwright install chromium
 *   node scripts/audit-mobile-ui.js
 *
 * WHY THIS EXISTS
 *
 * The login screen shipped with its logo tucked under the iPhone status bar and
 * a band of dead space at the bottom, and it had been that way on most staff
 * pages for months. Nobody caught it because checking a phone layout meant
 * remembering to check a phone layout. This is the check, so it stops being a
 * thing anyone has to remember.
 *
 * THE TWO BUGS IT WAS BUILT FOR
 *
 * 1. `100vh` on iOS is the LARGE viewport — the height the page would have if
 *    the browser's chrome were collapsed. It is taller than what you can
 *    actually see, so a "full screen" container runs off the bottom and drags
 *    its content up under the top edge. `100dvh` is the visible height and is
 *    what these layouts meant all along.
 *
 * 2. index.html sets `viewport-fit=cover`, deliberately — see the note there.
 *    That extends the page under the notch and the home indicator, which makes
 *    `env(safe-area-inset-*)` padding mandatory rather than optional. A
 *    full-screen page without it puts its first element behind the clock.
 *
 * WHAT IT CHECKS
 *
 * Static, over src/:      any remaining `vh` unit (they should all be `dvh`).
 * In a real browser, per route per device size:
 *   - horizontal overflow, ignoring anything inside a deliberate x-scroller
 *   - elements clipped above the top of the viewport
 *   - content sitting in the status-bar band on a page that applies no
 *     safe-area padding — the closest honest proxy for the notch, because
 *     Chromium reports env(safe-area-inset-*) as 0 and there is no API to
 *     make it lie
 *
 * AUTHENTICATED ROUTES
 *
 * Most staff pages need a session. Supply one and they are audited too:
 *
 *   AUDIT_EMAIL=you@example.com AUDIT_PASSWORD=... node scripts/audit-mobile-ui.js
 *
 * Without those it audits the public routes and says which ones it skipped, so
 * a clean run never quietly means "I checked almost nothing".
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.AUDIT_BASE || 'http://localhost:3002';
const ROOT = path.resolve(__dirname, '..');

/**
 * statusBar is the real safe-area-inset-top each device reports, not a guess.
 * The Dynamic Island phones are the worst case at 59px and are the reason this
 * list exists: the login logo sat at y=49, which cleared a 47px assumption by
 * two pixels and was still underneath the island on the phone that found it.
 * Chromium reports env(safe-area-inset-*) as 0 and gives no way to override it,
 * so the band is applied here instead of emulated.
 */
const DEVICES = [
  { name: 'iPhone 15 Pro', width: 393, height: 852, statusBar: 59 },
  { name: 'iPhone 14', width: 390, height: 844, statusBar: 47 },
  { name: 'iPhone X', width: 375, height: 812, statusBar: 44 },
  { name: 'small Android', width: 360, height: 740, statusBar: 24 },
];

const PUBLIC_ROUTES = ['/', '/login', '/reset-password', '/portal'];

const AUTH_ROUTES = [
  '/dashboard', '/sop', '/job-tasks', '/task-library', '/my-tasks',
  '/calendar', '/hours-input', '/hours', '/alerts', '/archive',
  '/team', '/settings', '/profile', '/activity-log', '/portal-admin',
];

// ---------------------------------------------------------------- static scan

const staticScan = () => {
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx|css)$/.test(entry.name)) continue;
      fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
        // ANY vh unit, not just 100vh. A modal at maxHeight: 90vh overflows the
        // visible area on iOS exactly like a container at 100vh does, and pushes
        // its Save button off the bottom of the screen — which is worse, because
        // the page looks fine until you try to use it. calc(100vh - Xpx) is the
        // same bug wearing a hat. Matching a digit immediately before `vh` skips
        // `dvh`, whose preceding character is the d.
        if (/\dvh\b/.test(line)) {
          hits.push({ file: path.relative(ROOT, full), line: i + 1, text: line.trim() });
        }
      });
    }
  };
  walk(path.join(ROOT, 'src'));
  return hits;
};

// ------------------------------------------------------------- browser checks

/**
 * Runs inside the page. Returns plain data only — nothing here may reference
 * anything from the Node scope.
 */
const collect = (statusBar) => {
  const vw = window.innerWidth;
  const problems = [];

  const inScroller = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : '';
    const text = (el.textContent || '').trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };

  // Does the page apply ANY safe-area padding near the top? If it does, the
  // status-bar band check is skipped — the page has thought about it, and
  // Chromium resolves the inset to 0 so we cannot measure the real result.
  const rootish = [document.body, ...document.body.children].filter(Boolean);
  const handlesSafeArea = rootish.some((el) => {
    const s = el.getAttribute('style') || '';
    return s.includes('safe-area-inset');
  }) || !!document.querySelector('[style*="safe-area-inset"]');

  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;

    if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) {
      problems.push({
        kind: 'horizontal-overflow',
        detail: `${describe(el)} spans ${Math.round(r.left)}→${Math.round(r.right)} in a ${vw}px viewport`,
      });
    }

    if (r.top < -1 && cs.position !== 'fixed' && !inScroller(el)) {
      problems.push({ kind: 'clipped-above-top', detail: `${describe(el)} top is ${Math.round(r.top)}` });
    }

    // Only leaf-ish elements, or every wrapper reports the same thing.
    if (!handlesSafeArea && el.children.length === 0 && r.top < statusBar && r.bottom > 0) {
      problems.push({
        kind: 'under-status-bar',
        detail: `${describe(el)} sits at y=${Math.round(r.top)}, inside the ${statusBar}px status bar`,
      });
    }
  });

  return {
    problems,
    docWidth: document.documentElement.scrollWidth,
    viewportWidth: vw,
    handlesSafeArea,
  };
};

// ------------------------------------------------------------------- runner

(async () => {
  const staticHits = staticScan();

  const email = process.env.AUDIT_EMAIL;
  const password = process.env.AUDIT_PASSWORD;
  const routes = email && password ? [...PUBLIC_ROUTES, ...AUTH_ROUTES] : [...PUBLIC_ROUTES];

  const browser = await chromium.launch();
  const findings = [];

  for (const device of DEVICES) {
    const ctx = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();

    if (email && password) {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(4000);
    }

    for (const route of routes) {
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(900);
        const res = await page.evaluate(collect, device.statusBar);

        if (res.docWidth > res.viewportWidth + 1) {
          findings.push({
            device: device.name, route, kind: 'document-overflow',
            detail: `document is ${res.docWidth}px wide in a ${res.viewportWidth}px viewport`,
          });
        }
        // One entry per kind per route — twenty children of one broken flex row
        // is one bug, and listing it twenty times buries the next one.
        const seen = new Set();
        for (const p of res.problems) {
          if (seen.has(p.kind)) continue;
          seen.add(p.kind);
          const count = res.problems.filter((q) => q.kind === p.kind).length;
          findings.push({
            device: device.name, route, kind: p.kind,
            detail: count > 1 ? `${p.detail}  (+${count - 1} more)` : p.detail,
          });
        }
      } catch (e) {
        findings.push({ device: device.name, route, kind: 'load-failed', detail: e.message.split('\n')[0] });
      }
    }

    await ctx.close();
  }

  await browser.close();

  // ------------------------------------------------------------------ report
  console.log('\nMOBILE UI AUDIT\n' + '='.repeat(64));
  console.log(`base ${BASE}`);
  console.log(`routes ${routes.length}  devices ${DEVICES.length}`);
  if (!email || !password) {
    console.log(`\n  NOTE: no AUDIT_EMAIL/AUDIT_PASSWORD, so ${AUTH_ROUTES.length} signed-in`);
    console.log('  routes were NOT checked. A clean run below does not cover them.');
  }

  console.log(`\n1. STATIC — vh units in src/ (use dvh)  (${staticHits.length})`);
  if (!staticHits.length) console.log('   none');
  staticHits.forEach((h) => console.log(`   ${h.file}:${h.line}  ${h.text.slice(0, 76)}`));

  console.log(`\n2. RENDERED — geometry problems  (${findings.length})`);
  if (!findings.length) console.log('   none');
  const byRoute = {};
  findings.forEach((f) => { (byRoute[f.route] ||= []).push(f); });
  Object.entries(byRoute).forEach(([route, list]) => {
    console.log(`\n   ${route}`);
    list.forEach((f) => console.log(`     [${f.device}] ${f.kind}: ${f.detail}`));
  });

  console.log('\n' + '='.repeat(64));
  const total = staticHits.length + findings.length;
  console.log(total === 0 ? 'CLEAN' : `${total} issue(s) to look at`);
  process.exit(total === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
