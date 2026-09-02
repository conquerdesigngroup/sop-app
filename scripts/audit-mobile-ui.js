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
  // The two below are not phones and are not here for the notch. They exist
  // because every width above was BELOW theme.breakpoints.mobile (480px), so
  // every route was only ever measured in its isMobile layout. /job-tasks
  // stacks its filter row into a column below 480 and leaves it a nowrap flex
  // row above — which does not fit again until roughly 660px. A select ran 164px
  // off the right edge for that whole band and four green phones said CLEAN.
  // Any breakpoint the app switches on needs a sample on BOTH sides of it.
  { name: 'iPhone SE / iPad Slide Over', width: 320, height: 568, statusBar: 20 },
  { name: 'iPad split view', width: 507, height: 768, statusBar: 0 },
  // Same rule again, one breakpoint up. isMobileOrTablet is width < 768, and
  // every size above is below it — so with only those six, /classes was
  // measured six times in its phone layout and never once in the desktop one
  // it switches to at 768. Not a phone, and not here for the notch.
  { name: 'iPad portrait', width: 820, height: 1180, statusBar: 0 },
];

const PUBLIC_ROUTES = [
  '/', '/login', '/reset-password', '/portal',
  // The client login build (W1 of CLIENT-AUTH-BUILD.md). These routes only
  // exist when the app was BUILT with REACT_APP_CLIENT_AUTH=true — with the
  // flag off they fall through to the portal home redirect and the audit
  // measures that redirect instead of the pages. Run the audit against a
  // flag-on build before shipping changes to them.
  '/portal/login', '/portal/signup', '/portal/update-password',
  // The parent portal's program pages. Left out until the calendar grew a month
  // view and it turned out nothing here had ever been measured on a phone — the
  // portal is the half of this app that is ONLY ever opened on one.
  //
  // Only allstars: both programs render the same components through the same
  // ProgramGate layout, so auditing the second would measure the same JSX twice.
  '/portal/allstars',
  '/portal/allstars/classes',
  '/portal/allstars/updates',
  '/portal/allstars/documents',
  '/portal/allstars/calendar',
];

// Portal program pages sit behind a studio access code. The flag it sets is
// localStorage and is documented in src/lib/portal.ts as a convenience rather
// than a security boundary — portal content is readable by `anon` either way —
// so the audit grants itself access instead of holding a code. Without this
// every route above measures the same access-gate screen.
//
// It also picks which calendar mode gets measured. The month grid is seven
// columns inside a phone width and is the layout that can actually overflow;
// the list is a single-column stack. So month is the default, and the list is
// checked with AUDIT_PORTAL_VIEW=list rather than by not checking it.
const PORTAL_VIEW = process.env.AUDIT_PORTAL_VIEW === 'list' ? 'list' : 'month';

// Same reasoning again for /classes, but only above 768px: below that the page
// renders a phone layout with a day strip and no view switch at all, and this
// setting does nothing. On the iPad portrait sample it picks which of the three
// desktop views gets measured — month is seven columns, week is a row of
// side-scrolling day columns and is the one that can push the PAGE sideways if
// its own overflow container is ever lost, list is a single-column stack.
//
// Three runs, not one, before shipping a change to that page:
//   AUDIT_CLASSES_VIEW=list npm run audit:mobile
//   AUDIT_CLASSES_VIEW=week npm run audit:mobile
//   npm run audit:mobile
const CLASSES_VIEW = ['list', 'week'].includes(process.env.AUDIT_CLASSES_VIEW)
  ? process.env.AUDIT_CLASSES_VIEW
  : 'month';

const PORTAL_ACCESS_INIT = `
  try {
    localStorage.setItem('didc_portal_access_allstars', 'granted');
    localStorage.setItem('didc_portal_access_academy', 'granted');
    localStorage.setItem('didc_portal_calendar_view', '${PORTAL_VIEW}');
    localStorage.setItem('didc_portal_classes_view', '${CLASSES_VIEW}');
  } catch (e) {}
`;

const AUTH_ROUTES = [
  '/dashboard', '/sop', '/job-tasks', '/task-library', '/my-tasks',
  '/calendar', '/hours-input', '/hours', '/alerts', '/archive',
  '/team', '/settings', '/profile', '/activity-log', '/portal-admin',
  // Admin-only client roster page. /portal/account is signed-in-CLIENT-only,
  // which the audit's staff session cannot reach (staff get redirected), so
  // it has no row here — check it by hand on a phone with a client login.
  '/portal-admin/clients',
  // Super-admin only. A session below that rank is redirected to /dashboard and
  // the row passes having measured the wrong page, so these lines are only
  // meaningful when AUDIT_EMAIL names a super admin.
  //
  // All three tabs, because they are three different layouts behind one path:
  // Classes carries the widest filter row in the app (four division chips plus
  // seven days), and auditing only the default tab would measure the narrowest
  // of the three and report the route CLEAN.
  '/portal-admin/viewer',
  '/portal-admin/viewer?view=dancers',
  '/portal-admin/viewer?view=classes',
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
        // Comment lines are prose, not layout. The rule below is important
        // enough that people write it down — PortalSheet's header explains at
        // length why it uses 88dvh and not 100vh — and flagging the
        // explanation as the bug it warns against trains everyone to ignore
        // this check. A commented-out `// height: '100vh'` is skipped too,
        // which is correct: it is not styling anything.
        const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);

        // ANY vh unit, not just 100vh. A modal at maxHeight: 90vh overflows the
        // visible area on iOS exactly like a container at 100vh does, and pushes
        // its Save button off the bottom of the screen — which is worse, because
        // the page looks fine until you try to use it. calc(100vh - Xpx) is the
        // same bug wearing a hat. Matching a digit immediately before `vh` skips
        // `dvh`, whose preceding character is the d.
        if (!isComment && /\dvh\b/.test(line)) {
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

  // The element that REPORTS an overflow is rarely the one causing it — a div
  // sitting at a negative left is usually the innocent first child of a flex
  // parent that centres or right-aligns content it cannot fit. Without the
  // chain you are reading style files and guessing which ancestor did it.
  const chainOf = (el) => {
    const out = [];
    for (let n = el.parentElement, i = 0; n && i < 5; n = n.parentElement, i++) {
      const s = getComputedStyle(n);
      const bits = [n.tagName.toLowerCase(), `w:${Math.round(n.getBoundingClientRect().width)}`];
      if (s.display.includes('flex') || s.display.includes('grid')) bits.push(`d:${s.display}`);
      if (s.justifyContent && s.justifyContent !== 'normal') bits.push(`j:${s.justifyContent}`);
      if (s.flexWrap && s.flexWrap !== 'nowrap') bits.push(`wrap:${s.flexWrap}`);
      if (s.overflowX !== 'visible') bits.push(`ox:${s.overflowX}`);
      if (s.minWidth !== '0px' && s.minWidth !== 'auto') bits.push(`minW:${s.minWidth}`);
      out.push(bits.join(','));
    }
    return out.join(' < ');
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
        detail: `${describe(el)} spans ${Math.round(r.left)}→${Math.round(r.right)} in a ${vw}px viewport`
          + `\n         via ${chainOf(el)}`,
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
  let routes = email && password ? [...PUBLIC_ROUTES, ...AUTH_ROUTES] : [...PUBLIC_ROUTES];

  // Re-checking one fix should not cost a six-minute full sweep — that is how a
  // verification step quietly stops being run. Both filters are opt-in, so an
  // unqualified `npm run audit:mobile` still means everything.
  //   AUDIT_ROUTES=/hours,/task-library   AUDIT_DEVICES='iPhone 15,Android'
  let devices = DEVICES;
  if (process.env.AUDIT_ROUTES) {
    const want = process.env.AUDIT_ROUTES.split(',').map((r) => r.trim()).filter(Boolean);
    routes = routes.filter((r) => want.includes(r));
    if (!routes.length) {
      console.error(`AUDIT_ROUTES matched no known route. Known: ${[...PUBLIC_ROUTES, ...AUTH_ROUTES].join(' ')}`);
      process.exit(2);
    }
  }
  if (process.env.AUDIT_DEVICES) {
    const want = process.env.AUDIT_DEVICES.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
    devices = DEVICES.filter((d) => want.some((w) => d.name.toLowerCase().includes(w)));
    if (!devices.length) {
      console.error(`AUDIT_DEVICES matched no device. Known: ${DEVICES.map((d) => d.name).join(' | ')}`);
      process.exit(2);
    }
  }

  const browser = await chromium.launch();
  const findings = [];

  for (const device of devices) {
    const ctx = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    await ctx.addInitScript(PORTAL_ACCESS_INIT);
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
  console.log(
    `routes ${routes.length}  devices ${devices.length}  ` +
    `portal calendar in ${PORTAL_VIEW} view, classes in ${CLASSES_VIEW} view`
  );
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
