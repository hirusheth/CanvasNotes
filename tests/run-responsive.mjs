// The account screens at 16 device sizes (6 phones, 5 tablets, 5 desktops):
// sign-in, create account, errors, the account menu, the Account dialog and a
// public board. Each state is measured (sideways overflow, things past the
// screen edge, cut-off text, small tap targets, tiny input text that makes iOS
// zoom) and screenshotted.
//   node tests/run-responsive.mjs [check ids]      (ports 5211)
import { createSuite, rand, assert, wait } from './harness.mjs';

const SIZES = [
  [320, 568, 'phone'], [360, 740, 'phone'], [375, 667, 'phone'], [390, 844, 'phone'], [414, 896, 'phone'], [430, 932, 'phone'],
  [768, 1024, 'tablet'], [820, 1180, 'tablet'], [1024, 768, 'tablet'], [1024, 1366, 'tablet'], [1180, 820, 'tablet'],
  [1280, 800, 'desktop'], [1366, 768, 'desktop'], [1440, 900, 'desktop'], [1536, 864, 'desktop'], [1920, 1080, 'desktop'],
];

const suite = await createSuite('responsive');
const { check, shot, fact } = suite;
const S = await suite.startServer('main', 5211, { CANVASNOTES_INVITE_CODE: 'invite-123' });
const B = S.base;
// The owner account (first one needs no invite) with a published board to view.
const owner = await suite.newPage();
const email = `owner-${rand()}@example.com`;
await suite.signup(owner, B, email, 'owner-password', { name: 'Yash Example With A Long Name' });
const token = `pub${rand()}${rand()}${rand()}${rand()}`;
await owner.request.post(`${B}/api/ops`, {
  data: {
    ops: [
      { op: 'put', el: { id: 'pubboard', type: 'board', parentId: 'root', section: 'canvas', x: 100, y: 100, z: 1, width: 120, columnId: null, createdAt: 1, updatedAt: 1, content: { title: 'Shared plan', publicToken: token } } },
      { op: 'put', el: { id: 'pubnote', type: 'note', parentId: 'pubboard', section: 'canvas', x: 40, y: 40, z: 1, width: 260, columnId: null, createdAt: 1, updatedAt: 1, content: { html: '<p>A published note anyone with the link can read.</p>' } } },
    ],
  },
});
const storage = await owner.context().storageState();

// Measures the current page; returns a list of problems (empty = fine).
async function measure(page, kind) {
  return page.evaluate((touch) => {
    const problems = [];
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const over = document.documentElement.scrollWidth - vw;
    if (over > 0) problems.push(`page scrolls sideways by ${over}px`);
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
    };
    const scope = document.querySelector('.dialog, form#f') || document.body;
    for (const el of scope.querySelectorAll('button, input:not([type=hidden]), a, label, h1, h2, h3, p')) {
      if (!visible(el) || el.closest('[hidden]')) continue;
      // Strips that scroll sideways on purpose (the phone toolbar) may run past the edge.
      let scroller = el.parentElement;
      while (scroller && !(scroller.scrollWidth > scroller.clientWidth && /auto|scroll/.test(getComputedStyle(scroller).overflowX))) scroller = scroller.parentElement;
      if (scroller && scroller !== document.documentElement && scroller !== document.body) continue;
      const r = el.getBoundingClientRect();
      // Inside a scroller the element may be below the fold on purpose; only sideways matters there.
      if (r.right > vw + 1 || r.left < -1) problems.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.placeholder || '').trim().slice(0, 24)}" past the side edge (${Math.round(r.left)}–${Math.round(r.right)} of ${vw})`);
      if (/^(BUTTON|LABEL|H1|H2|H3|A)$/.test(el.tagName) && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') problems.push(`text cut in ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 24)}" (${el.clientWidth}/${el.scrollWidth}px)`);
      if (touch && /^(BUTTON|INPUT)$/.test(el.tagName) && r.height < 40 && !el.closest('.menu')) problems.push(`small tap target ${el.tagName.toLowerCase()} "${(el.textContent || el.placeholder || el.type).trim().slice(0, 20)}" ${Math.round(r.height)}px tall`);
      if (touch && el.tagName === 'INPUT' && parseFloat(getComputedStyle(el).fontSize) < 16) problems.push(`input font ${getComputedStyle(el).fontSize} (iOS zooms in)`);
    }
    const dialog = document.querySelector('.dialog');
    if (dialog) {
      const r = dialog.getBoundingClientRect();
      const body = dialog.querySelector('.account-body');
      if (r.bottom > vh + 1 && !(body && body.scrollHeight > body.clientHeight)) problems.push(`dialog runs ${Math.round(r.bottom - vh)}px below the screen and can't scroll`);
    }
    return problems;
  }, kind !== 'desktop');
}

async function pageAt([w, h, kind], options = {}) {
  return suite.newPage({ viewport: { width: w, height: h }, ...(kind === 'desktop' ? {} : { hasTouch: true, isMobile: true }), ...options });
}

async function eachSize(label, open) {
  const issues = [];
  for (const size of SIZES) {
    const page = await pageAt(size, open.options);
    await open.run(page, size);
    await wait(250);
    const problems = await measure(page, size[2]);
    await shot(page, `${label} ${size[0]}x${size[1]}`);
    if (problems.length) issues.push(`${size[0]}×${size[1]}: ${[...new Set(problems)].join('; ')}`);
    await page.context().close();
  }
  fact(`${SIZES.length} sizes measured: overflow, side edges, cut text, tap targets ≥ 40px and input text ≥ 16px on touch, dialog reachable`);
  assert(issues.length === 0, issues.slice(0, 4).join(' | '));
}

await check('R1', 'Sign-in page at every size', () =>
  eachSize('sign-in', { run: async (p) => { await p.goto(B); await p.waitForSelector('#email'); } }));

await check('R2', 'Create-account page (with the invite field) at every size', () =>
  eachSize('create account', { run: async (p) => { await p.goto(`${B}/#signup`); await p.waitForSelector('#invite'); } }));

await check('R3', 'Sign-in error message at every size', () =>
  eachSize('wrong password', {
    run: async (p) => {
      await p.goto(B);
      await p.fill('#email', `nobody-${rand()}@example.com`);
      await p.fill('#password', 'wrong-password');
      await p.click('#submit');
      await p.waitForFunction(() => document.getElementById('e').textContent.length > 0);
    },
  }));

await check('R4', 'Account menu (⋯) with the email at every size', () =>
  eachSize('account menu', {
    options: { storageState: storage },
    run: async (p) => {
      await p.goto(B);
      await p.waitForSelector('.toolbar');
      await p.click('.topbar button[title="More"]');
      await p.waitForSelector('.menu .menu-hint');
      const box = await p.locator('.menu button', { hasText: 'Account' }).first().boundingBox();
      const vw = p.viewportSize().width;
      if (!box || box.x < 0 || box.x + box.width > vw + 1) throw new Error(`Account item off screen at ${vw}px: ${JSON.stringify(box)}`);
    },
  }));

await check('R5', 'Account dialog (name, password) at every size', () =>
  eachSize('account dialog', {
    options: { storageState: storage },
    run: async (p) => {
      await p.goto(B);
      await p.waitForSelector('.toolbar');
      await p.click('.topbar button[title="More"]');
      await p.locator('.menu button', { hasText: 'Account' }).first().click();
      await p.waitForSelector('.account-section');
    },
  }));

await check('R6', 'Account dialog scrolled to Delete account at every size (the button can be reached)', () =>
  eachSize('account dialog - delete', {
    options: { storageState: storage },
    run: async (p) => {
      await p.goto(B);
      await p.waitForSelector('.toolbar');
      await p.click('.topbar button[title="More"]');
      await p.locator('.menu button', { hasText: 'Account' }).first().click();
      await p.waitForSelector('.danger-zone');
      await p.locator('.danger-btn').scrollIntoViewIfNeeded();
      const r = await p.locator('.danger-btn').boundingBox();
      const vh = p.viewportSize().height;
      if (!r || r.y + r.height > vh + 1 || r.y < 0) throw new Error(`Delete button unreachable at ${p.viewportSize().width}×${vh}: ${JSON.stringify(r)}`);
    },
  }));

await check('R7', 'Public read-only board opened by a signed-out visitor at every size', () =>
  eachSize('public board', { run: async (p) => { await p.goto(`${B}/p/${token}`); await p.waitForSelector('[data-el]'); } }));

await suite.finish();
