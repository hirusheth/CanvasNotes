// Security checks: attacks one account (or a stranger) could try against another.
//   node tests/run-security.mjs [check ids, e.g. S1,S8]
// Starts its own servers (ports 5201–5204) and a hostile "other site" on 5205.
// Needs Node 24 and Chrome. EVIDENCE_DIR keeps screenshots and a JSON report.
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { createSuite, ROOT, PNG, wait, rand, assert } from './harness.mjs';
import { metaContent } from '../server/unfurl.mjs';
import { publicFetch, isPrivateAddress } from '../server/netguard.mjs';
import { rateLimiter } from '../server/accounts.mjs';

const suite = await createSuite('security');
const { check, shot, fact } = suite;
const S = await suite.startServer('main', 5201);
const B = S.base;

// Alice is the attacker in most checks, Bob the victim (or the other way round).
const alice = await suite.newPage();
const bob = await suite.newPage();
const aliceEmail = `alice-${rand()}@example.com`;
const bobEmail = `bob-${rand()}@example.com`;
await suite.signup(alice, B, aliceEmail, 'alice-password');
await suite.signup(bob, B, bobEmail, 'bob-password');

const ops = (page, list, headers = {}) => page.request.post(`${B}/api/ops`, { data: { ops: list }, headers });
const state = async (page) => (await (await page.request.get(`${B}/api/state`)).json()).elements;
const el = (id, type, content, extra = {}) => ({ id, type, parentId: 'root', section: 'canvas', x: 420, y: 160, z: 5, width: 300, columnId: null, createdAt: Date.now(), updatedAt: Date.now(), content, ...extra });
const token = () => `pub${rand()}${rand()}${rand()}${rand()}`;

// A page "ran" the attack if any of these markers appear.
const PWN = `window.__pwned=1;document.title='PWNED';document.body.insertAdjacentHTML('beforeend','<div id=pwned style=\\'position:fixed;inset:0;background:red;color:#fff;font:40px sans-serif;z-index:99999\\'>XSS RAN</div>')`;
const ran = (page) => page.evaluate(() => !!(window.__pwned || document.getElementById('pwned') || document.title === 'PWNED'));
const XSS_HTML = [
  `<p>img onerror<img src="x" onerror="${PWN.replace(/"/g, '&quot;')}"></p>`,
  `<p>script tag</p><script>${PWN}</script>`,
  `<p>svg onload</p><svg onload="${PWN.replace(/"/g, '&quot;')}"></svg>`,
  `<p>iframe srcdoc</p><iframe srcdoc="<script>parent.${PWN.replace(/"/g, '&quot;')}</script>"></iframe>`,
  `<p><a href="javascript:${PWN.replace(/"/g, '&quot;')}">javascript link</a></p>`,
  `<p>details ontoggle<details open ontoggle="${PWN.replace(/"/g, '&quot;')}"><summary>x</summary></details></p>`,
  `<p>mutation <noscript><p title="</noscript><img src=x onerror=${PWN.replace(/[\s"']/g, '')}>"></noscript></p>`,
  `<p style="position:fixed;inset:0;z-index:9999;background:#fff">FAKE "SESSION EXPIRED — ENTER PASSWORD" OVERLAY</p>`,
  `<p><span style="color: #c0392b">coloured text stays</span></p>`,
].join('');

// ------------------------------------------------------------------ XSS
let pubToken;
await check('S1', "Stored XSS: script hidden in a note never runs, for the owner or for anyone opening it from a public link", async () => {
  pubToken = token();
  const boardId = `xss-${rand()}`;
  await ops(alice, [
    { op: 'put', el: el(boardId, 'board', { title: 'Totally normal board', publicToken: pubToken }, { x: 120, y: 120, width: 120 }) },
    { op: 'put', el: el(`xn-${rand()}`, 'note', { html: XSS_HTML }, { parentId: boardId, x: 80, y: 60, width: 520 }) },
    { op: 'put', el: el(`xr-${rand()}`, 'note', { html: XSS_HTML }) },
  ]);
  await alice.goto(B);
  await alice.waitForSelector('.toolbar');
  await wait(1500);
  assert(!(await ran(alice)), 'script ran in the owner\'s app');
  await shot(alice, 'owner view - attack text shown as plain content');
  // Bob is signed in and opens Alice's public link: the dangerous case (his session is on this site).
  await bob.goto(`${B}/p/${pubToken}`);
  await bob.waitForSelector('[data-el]');
  await wait(1500);
  assert(!(await ran(bob)), 'script ran for a signed-in visitor of the public link');
  const overlay = await bob.evaluate(() => [...document.querySelectorAll('.rich-text p')].find((p) => /OVERLAY/.test(p.textContent)));
  assert(overlay !== undefined, 'note text missing');
  const position = await bob.evaluate(() => getComputedStyle([...document.querySelectorAll('.rich-text p')].find((p) => /OVERLAY/.test(p.textContent))).position);
  assert(position !== 'fixed', 'the full-screen overlay style was kept');
  const colour = await bob.evaluate(() => document.querySelector('.rich-text span[style*="color"]')?.getAttribute('style'));
  assert(/color/.test(colour || ''), 'harmless text colour was stripped too');
  // Inspect the real DOM (the payload labels themselves contain words like "onerror" as text).
  const dangerous = await bob.evaluate(() =>
    [...document.querySelectorAll('.rich-text, .rich-text *')].flatMap((n) => [
      ...(/^(SCRIPT|IFRAME|SVG|OBJECT|EMBED)$/i.test(n.tagName) ? [n.tagName] : []),
      ...[...n.attributes].filter((a) => /^on/i.test(a.name) || a.name === 'srcdoc' || (/^(href|src)$/.test(a.name) && /^\s*javascript:/i.test(a.value))).map((a) => `${n.tagName}[${a.name}]`),
    ]),
  );
  assert(dangerous.length === 0, `dangerous markup in the page: ${dangerous.join(', ')}`);
  await shot(bob, 'signed-in visitor of the public link - nothing ran');
  fact('9 payloads: img onerror, <script>, svg onload, iframe srcdoc, javascript: link, details ontoggle, noscript mutation XSS, full-screen fake overlay, plus coloured text that must survive');
  fact(`rendered DOM has no script/iframe/svg elements, no on* or srcdoc attributes, no javascript: URLs · overlay position: ${position} · colour kept: ${colour}`);
});

await check('S2', 'XSS through an imported backup, search, export and print: still inert', async () => {
  const imp = await bob.request.post(`${B}/api/import`, { data: { elements: [el(`imp-${rand()}`, 'note', { html: XSS_HTML }, { x: 700, y: 300 })], mode: 'merge' } });
  assert(imp.ok(), `import ${imp.status()}`);
  await bob.goto(B);
  await bob.waitForSelector('.toolbar');
  await wait(1200);
  assert(!(await ran(bob)), 'imported note ran a script');
  await bob.keyboard.press('Control+k');
  await bob.keyboard.type('javascript');
  await wait(800);
  assert(!(await ran(bob)), 'search results ran a script');
  await shot(bob, 'search over the imported note');
  await bob.keyboard.press('Escape');
  // Board export to Markdown and Word builds text from the same HTML.
  await bob.locator('.topbar button[title="Export board"]').click().catch(() => {});
  await wait(500);
  for (const label of ['Markdown', 'Word document']) {
    const dl = bob.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await bob.locator('.side-panel button', { hasText: label }).first().click().catch(() => {});
    await dl;
  }
  await wait(500);
  assert(!(await ran(bob)), 'export ran a script');
});

await check('S3', 'Uploaded HTML, SVG and script files never run as this site: they download, inside a sandbox', async () => {
  const files = [
    ['evil.html', 'text/html', `<script>${PWN}</script><h1>evil page</h1>`],
    ['evil.svg', 'image/svg+xml', `<svg xmlns="http://www.w3.org/2000/svg" onload="${PWN.replace(/"/g, '&quot;')}"><circle r="40" cx="50" cy="50" fill="red"/></svg>`],
    ['evil.js', 'text/javascript', PWN],
    ['evil.xml', 'application/xml', `<x:script xmlns:x="http://www.w3.org/1999/xhtml">${PWN}</x:script>`],
  ];
  for (const [name, type, body] of files) {
    const up = await alice.request.post(`${B}/api/upload?name=${name}`, { data: Buffer.from(body), headers: { 'content-type': type } });
    const { url } = await up.json();
    const res = await alice.request.get(`${B}${url}`);
    const h = res.headers();
    assert(/sandbox/.test(h['content-security-policy'] || ''), `${name}: no sandbox CSP`);
    if (name !== 'evil.svg') assert(/attachment/.test(h['content-disposition'] || ''), `${name}: not sent as a download`);
    assert(h['x-content-type-options'] === 'nosniff', `${name}: no nosniff`);
    assert(!/text\/html|javascript|xml/.test(h['content-type'] || '') || name === 'evil.svg', `${name}: served as ${h['content-type']}`);
    // Open it the way a victim would: as the top page, in the owner's own (signed-in) browser.
    const tab = await suite.newPage({ storageState: await alice.context().storageState(), acceptDownloads: true });
    await tab.goto(`${B}${url}`).catch(() => {});
    await wait(700);
    assert(!(await ran(tab).catch(() => false)), `${name} ran a script when opened`);
    if (name === 'evil.svg') await shot(tab, 'uploaded SVG opened directly - drawn, script blocked');
    fact(`${name}: ${h['content-type']} · ${h['content-disposition'] || 'inline'} · CSP sandbox`);
    await tab.close();
  }
  // The same SVG still works as a picture on a board.
  const { url } = await (await alice.request.post(`${B}/api/upload?name=pic.svg`, { data: Buffer.from(files[1][2].replace('red', 'teal')), headers: { 'content-type': 'image/svg+xml' } })).json();
  await ops(alice, [{ op: 'put', el: el(`svg-${rand()}`, 'image', { src: url, caption: 'uploaded SVG as an image card' }, { x: 900, y: 120, width: 160 }) }]);
  await alice.goto(B);
  await alice.waitForSelector('.toolbar');
  await wait(1200);
  assert(!(await ran(alice)), 'SVG image card ran a script');
  await shot(alice, 'SVG still shows as an image card');
});

await check('S4', '"javascript:" links: a link card or a note link with one opens nothing and runs nothing', async () => {
  const linkId = `jl-${rand()}`;
  await ops(alice, [{ op: 'put', el: el(linkId, 'link', { url: `javascript:${PWN}`, title: 'Click me' }, { x: 120, y: 420, width: 260 }) }]);
  await alice.goto(B);
  await alice.waitForSelector(`[data-el="${linkId}"]`);
  const popups = [];
  alice.context().on('page', (p) => popups.push(p));
  await alice.locator(`[data-el="${linkId}"]`).dblclick();
  await alice.locator(`[data-el="${linkId}"] a`).first().click({ timeout: 1500 }).catch(() => {});
  await wait(800);
  for (const p of popups) assert(!(await ran(p).catch(() => false)), 'a popup ran the script');
  assert(!(await ran(alice)), 'the link ran a script');
  const href = await alice.locator(`[data-el="${linkId}"] a`).first().getAttribute('href').catch(() => null);
  assert(!href || !/^javascript:/i.test(href), `link href is ${href}`);
  await shot(alice, 'javascript link card - inert');
  fact(`popups opened: ${popups.length}; link href: ${href ?? '(none)'}`);
});

await check('S5', 'Content-Security-Policy on every page: scripts only from this site; the sign-in page uses a one-time nonce', async () => {
  const app = await alice.request.get(`${B}/`);
  const csp = app.headers()['content-security-policy'] || '';
  assert(/script-src 'self'(;|$)/.test(csp) && /object-src 'none'/.test(csp) && /frame-ancestors 'self'/.test(csp), `app CSP: ${csp}`);
  const signin = await fetch(`${B}/`);
  const scsp = signin.headers.get('content-security-policy') || '';
  const nonce = scsp.match(/nonce-([^']+)/)?.[1];
  assert(nonce && (await signin.text()).includes(`nonce="${nonce}"`), `sign-in CSP: ${scsp}`);
  const again = (await fetch(`${B}/`)).headers.get('content-security-policy');
  assert(again !== scsp, 'nonce is reused between requests');
  // Even if markup got in, an inline script is blocked by the browser.
  await alice.goto(B);
  await alice.waitForSelector('.toolbar');
  const violations = [];
  alice.on('console', (m) => /Content Security Policy/.test(m.text()) && violations.push(m.text()));
  await alice.evaluate((code) => {
    const s = document.createElement('script');
    s.textContent = code;
    document.head.append(s);
    document.body.insertAdjacentHTML('beforeend', `<img src="x" onerror="${code.replace(/"/g, '&quot;')}">`);
  }, PWN);
  await wait(600);
  assert(!(await ran(alice)), 'an injected inline script ran despite the CSP');
  fact(`app: ${csp}`);
  fact(`sign-in page: ${scsp.replace(nonce, '…')}`);
  fact(`injected <script> and onerror attribute both blocked (${violations.length} CSP violation messages)`);
});

// ------------------------------------------------------------------ request forgery and framing
const evil = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><h1>Win a prize!</h1>
<iframe id="frame" src="${B}/" width="600" height="300"></iframe>
<form id="f" method="POST" action="${B}/api/ops" enctype="text/plain"><input name='{"ops":[{"op":"put","el":{"id":"planted","type":"note","parentId":"root","section":"canvas","content":{"html":"planted by evil site"}}}],"x":"' value='"}'></form>
<script>
fetch('${B}/api/state',{credentials:'include'}).then(r=>r.text()).then(t=>document.title='READ:'+t.slice(0,40)).catch(()=>document.title='blocked');
setTimeout(()=>document.getElementById('f').submit(),300);
</script>`);
});
await new Promise((r) => evil.listen(5205, '127.0.0.1', r));

await check('S6', 'Cross-site request forgery: a hostile page can neither change nor read your boards', async () => {
  // Same machine, different port = a different origin (and the same "site", so SameSite alone wouldn't stop it).
  const tab = await suite.newPage({ storageState: await alice.context().storageState() });
  await tab.goto('http://127.0.0.1:5205/');
  await wait(2500);
  const elements = await state(alice);
  assert(!elements.some((e) => e.id === 'planted'), 'the forged form planted a note');
  const title = await tab.title().catch(() => '');
  assert(!/READ:\{/.test(title), `the hostile page read the API: ${title}`);
  const direct = await alice.request.post(`${B}/api/ops`, { data: { ops: [] }, headers: { origin: 'http://127.0.0.1:5205' } });
  assert(direct.status() === 403, `foreign Origin → ${direct.status()}`);
  for (const route of ['/api/login', '/api/signup', '/api/logout', '/api/account/delete', '/api/import']) {
    const r = await alice.request.post(`${B}${route}`, { data: {}, headers: { origin: 'https://evil.example' } });
    assert(r.status() === 403, `${route} from a foreign origin → ${r.status()}`);
  }
  fact(`forged text/plain form POST → refused (no "planted" note); cross-origin fetch of /api/state → unreadable (title: ${title.slice(0, 30) || '(empty)'})`);
  fact('POST /api/ops, /login, /signup, /logout, /account/delete, /import with a foreign Origin → 403');
});

await check('S7', 'Clickjacking: another site cannot show the app inside a frame', async () => {
  const tab = await suite.newPage({ storageState: await alice.context().storageState() });
  await tab.goto('http://127.0.0.1:5205/');
  await wait(1500);
  const frame = tab.frames().find((f) => f.url().startsWith(B));
  const loaded = frame ? await frame.evaluate(() => !!document.querySelector('.toolbar, #email')).catch(() => false) : false;
  assert(!loaded, 'the app rendered inside a foreign frame');
  await shot(tab, 'hostile page - frame refused, forged form had no effect');
  const h = (await alice.request.get(`${B}/`)).headers();
  assert(h['x-frame-options'] === 'SAMEORIGIN', `x-frame-options ${h['x-frame-options']}`);
  fact(`x-frame-options: ${h['x-frame-options']}; CSP frame-ancestors 'self'`);
});

// ------------------------------------------------------------------ server-side
await check('S8', 'Path traversal: no request can read the database, the server code or files outside the upload folder', async () => {
  const sid = (await alice.context().cookies(B)).find((c) => c.name === 'cn_sid').value;
  const probes = [
    '/files/../canvasnotes.db', '/files/..%2fcanvasnotes.db', '/files/%2e%2e/canvasnotes.db', '/files/%252e%252e%252fcanvasnotes.db',
    '/files/....//canvasnotes.db', '/files/..%5ccanvasnotes.db', '/files/%00../canvasnotes.db', '/assets/../../server/index.mjs',
    '/assets/..%2f..%2fserver%2findex.mjs', '/..%2f..%2f..%2fetc%2fpasswd', '/files/.session-secret', '/files/../.session-secret',
  ];
  const results = [];
  for (const p of probes) {
    const res = await new Promise((resolve) => {
      const req = http.request(`${B}${p}`, { headers: { cookie: `cn_sid=${sid}` }, path: p }, (r) => {
        let body = '';
        r.on('data', (d) => (body += d));
        r.on('end', () => resolve({ status: r.statusCode, body }));
      });
      req.on('error', () => resolve({ status: 0, body: '' }));
      req.end();
    });
    assert(!/SQLite format|createServer|root:x:0|^[0-9a-f]{64}$/.test(res.body), `${p} leaked file contents`);
    results.push(`${p} → ${res.status}`);
  }
  fact(results.join(' · '));
});

await check('S9', 'Injection: SQL-looking emails, ids and passwords are just text', async () => {
  const p = await suite.newPage();
  const weird = `x'); DROP TABLE users; --@example.com`;
  const r1 = await suite.signup(p, B, `"' OR 1=1 --"@example.com`, "' OR '1'='1");
  const r2 = await p.request.post(`${B}/api/login`, { data: { email: "' OR 1=1 --", password: "' OR '1'='1" }, headers: { 'x-forwarded-for': '10.200.0.1' } });
  assert(r2.status() === 401, `SQL-style login → ${r2.status()}`);
  const r3 = await ops(alice, [{ op: 'put', el: el("a'; DELETE FROM elements; --", 'note', { html: '<p>quote id</p>' }) }]);
  assert(r3.ok(), `quoted id put → ${r3.status()}`);
  const bobAfter = await state(bob);
  assert(bobAfter.length > 0, "Bob's data disappeared");
  const r4 = await suite.signup(p, B, weird, 'password-123');
  fact(`sign-up with a quote-laden email → ${r1.status()} / ${r4.status()} (400 = rejected as an invalid email, 200 = stored as plain text); SQL-style login → 401; id with "DELETE FROM" stored as an id; other accounts untouched`);
});

await check('S10', 'Errors never reveal internals (no stack traces, paths or SQL)', async () => {
  const bad = [
    await alice.request.post(`${B}/api/ops`, { data: '{not json', headers: { 'content-type': 'application/json' } }),
    await alice.request.post(`${B}/api/ops`, { data: { ops: [{ op: 'explode' }] } }),
    await alice.request.post(`${B}/api/ops`, { data: { ops: [{ op: 'put', el: { id: 42 } }] } }),
    await alice.request.post(`${B}/api/ops`, { data: { ops: 'nope' } }),
    await alice.request.get(`${B}/api/nope`),
    await alice.request.post(`${B}/api/board-lock`, { data: { id: { $gt: '' }, password: ['x'] } }),
  ];
  const out = [];
  for (const r of bad) {
    const text = await r.text();
    assert(!/at .*\.m?js:\d+|\/home\/|node:internal|SQLITE|sqlite/i.test(text), `leak: ${text.slice(0, 120)}`);
    assert(r.status() < 500, `server error ${r.status()}: ${text.slice(0, 80)}`);
    out.push(`${r.status()} ${text.slice(0, 50)}`);
  }
  fact(out.join(' · '));
});

await check('S11', 'Size limits: oversized requests, cards and accounts are refused, not stored', async () => {
  const s = await suite.startServer('limits', 5202, { CANVASNOTES_DATA_MB: '1' });
  const p = await suite.newPage();
  await suite.signup(p, s.base, `big-${rand()}@example.com`);
  const huge = await p.request.post(`${s.base}/api/ops`, { data: Buffer.alloc(51 * 1024 * 1024, 32), headers: { 'content-type': 'application/json' } }).catch((e) => ({ status: () => 413, err: e }));
  assert(huge.status() === 413, `51 MB body → ${huge.status()}`);
  const card = await p.request.post(`${s.base}/api/ops`, { data: { ops: [{ op: 'put', el: el('big', 'note', { html: 'x'.repeat(6 * 1024 * 1024) }) }] } });
  assert(card.status() === 413, `6 MB card → ${card.status()}`);
  const fill = [];
  for (let i = 0; i < 3; i++) fill.push(await p.request.post(`${s.base}/api/ops`, { data: { ops: [{ op: 'put', el: el(`f${i}`, 'note', { html: 'y'.repeat(400 * 1024) }) }] } }));
  assert(fill[0].ok() && fill[1].ok() && fill[2].status() === 413, `1 MB account: ${fill.map((r) => r.status())}`);
  const stored = await (await p.request.get(`${s.base}/api/state`)).json();
  assert(!stored.elements.some((e) => e.id === 'f2' || e.id === 'big'), 'refused cards were stored anyway');
  fact(`51 MB request → 413 · 6 MB card → 413 · 1 MB account: 400 KB ok, 400 KB ok, third → 413 and not stored`);
});

await check('S12', "Server-side request forgery: link previews can't be pointed at private addresses, however the address is written", async () => {
  const targets = [
    'http://127.0.0.1:5201/api/state', 'http://localhost:5201/', 'http://[::1]:5201/', 'http://[::ffff:127.0.0.1]:5201/', 'http://[::ffff:7f00:1]:5201/',
    'http://2130706433:5201/', 'http://0x7f000001:5201/', 'http://0177.0.0.1:5201/', 'http://127.1:5201/', 'http://0.0.0.0:5201/',
    'http://169.254.169.254/latest/meta-data/', 'http://192.168.1.1/', 'http://10.0.0.1/', 'http://172.16.0.1/', 'http://100.100.100.100/', 'file:///etc/passwd', 'ftp://127.0.0.1/',
  ];
  const out = [];
  for (const t of targets) {
    const r = await (await alice.request.get(`${B}/api/unfurl?url=${encodeURIComponent(t)}`)).json();
    assert(!r.ok && !r.title, `${t} was fetched`);
    out.push(new URL(t).host || t);
  }
  let blocked = 0;
  for (const t of ['http://localhost:5201/', 'http://127.0.0.1:5201/']) {
    try {
      await publicFetch(t);
    } catch (e) {
      if (/not reachable/.test(e.message)) blocked++;
    }
  }
  assert(blocked === 2, 'publicFetch reached a local address');
  assert(isPrivateAddress('::ffff:10.0.0.5') && isPrivateAddress('fd00::1') && isPrivateAddress('fe80::1') && !isPrivateAddress('93.184.216.34'), 'address classifier wrong');
  fact(`refused: ${out.join(', ')}`);
  fact('the address is checked by the socket at connect time, so DNS rebinding (public name → private IP) is refused too');
});

await check('S13', 'A crafted web page cannot freeze the server through the link-preview parser', async () => {
  const evilHtml = '<meta property="og:title" ' + ' a="x"'.repeat(150000) + ' content="x'.repeat(2) + '<meta ' + 'name=a '.repeat(100000);
  const t0 = performance.now();
  metaContent(evilHtml, ['og:title', 'twitter:title', 'og:description', 'twitter:description', 'description', 'og:image', 'twitter:image', 'og:site_name']);
  const ms = Math.round(performance.now() - t0);
  assert(ms < 500, `parsing took ${ms} ms`);
  const normal = metaContent('<head><meta content="Hi there" property="og:title"><meta name="description" content=\'desc\'></head>', ['og:title']);
  assert(normal === 'Hi there', `normal page parsed as ${normal}`);
  fact(`${(evilHtml.length / 1e6).toFixed(1)} MB adversarial page parsed in ${ms} ms (limit 500 ms)`);
});

await check('S14', 'Sessions: a new random session on every sign-in (no fixation), unforgeable cookies, sign-out ends it on the server', async () => {
  const p = await suite.newPage();
  const email = `sess-${rand()}@example.com`;
  await suite.signup(p, B, email, 'sess-password');
  await p.context().addCookies([{ name: 'cn_sid', value: 'attacker-chosen-session', url: B }]);
  const login = async () => {
    const r = await p.request.post(`${B}/api/login`, { data: { email, password: 'sess-password' }, headers: { 'x-forwarded-for': '10.201.0.1' } });
    return (r.headers()['set-cookie'] || '').match(/cn_sid=([^;]+)/)[1];
  };
  const a = await login();
  const b = await login();
  assert(a !== 'attacker-chosen-session' && a !== b && a.length >= 40, 'session id not fresh per sign-in');
  const forged = await fetch(`${B}/api/state`, { headers: { cookie: `cn_sid=${a.slice(0, -2)}xx` } });
  assert(forged.status === 401, `tampered cookie → ${forged.status}`);
  const unlockForged = await fetch(`${B}/api/state`, { headers: { cookie: `cn_sid=${a}; cn_unlocked=${encodeURIComponent('someboard.AAAAAAAAAAAAAAAAAAAAAA')}` } });
  assert(unlockForged.ok, 'forged unlock cookie broke the request');
  fact(`attacker-set cookie replaced on sign-in; two sign-ins → two different ${a.length}-character tokens; one changed character → 401`);
});

await check('S15', 'Locked boards: a forged unlock cookie does not reveal them', async () => {
  const boardId = `lk-${rand()}`;
  await ops(alice, [{ op: 'put', el: el(boardId, 'board', { title: 'Locked' }) }, { op: 'put', el: el(`lkn-${rand()}`, 'note', { html: '<p>locked secret</p>' }, { parentId: boardId }) }]);
  await alice.request.post(`${B}/api/board-lock`, { data: { id: boardId, password: 'lock-pass' } });
  const sid = (await alice.context().cookies(B)).find((c) => c.name === 'cn_sid').value;
  for (const forged of [`${boardId}.AAAAAAAAAAAAAAAAAAAAAA`, `${boardId}.`, boardId, `${boardId}.${'x'.repeat(22)},${boardId}`]) {
    const st = await (await fetch(`${B}/api/state`, { headers: { cookie: `cn_sid=${sid}; cn_unlocked=${encodeURIComponent(forged)}` } })).json();
    assert(!JSON.stringify(st).includes('locked secret'), `forged unlock "${forged}" revealed the board`);
  }
  let last;
  for (let i = 0; i < 11; i++) last = await alice.request.post(`${B}/api/board-unlock`, { data: { id: boardId, password: `guess${i}` } });
  assert(last.status() === 429, `11 wrong board passwords → ${last.status()}`);
  fact('4 forged unlock cookies → contents still hidden; 11 wrong board passwords → 429');
});

await check('S16', 'Account takeover via extra fields: sign-up and profile updates ignore id, email or role fields', async () => {
  const p = await suite.newPage();
  const email = `mass-${rand()}@example.com`;
  const r = await suite.signup(p, B, email, 'password-123', { id: 'admin', role: 'admin', isAdmin: true });
  const user = (await r.json()).user;
  assert(user.id !== 'admin', 'client chose the account id');
  await p.request.post(`${B}/api/account/profile`, { data: { name: 'Mallory', email: aliceEmail, id: 'x' } });
  const me = (await (await p.request.get(`${B}/api/state`)).json()).user;
  assert(me.email === email && me.name === 'Mallory', `profile update changed ${JSON.stringify(me)}`);
  fact(`sign-up with id/role/isAdmin → server-made id ${user.id.slice(0, 8)}…; profile update with another email → email unchanged`);
});

await check('S17', 'Prototype pollution: "__proto__" keys in saved data are stored as plain data', async () => {
  const r = await alice.request.post(`${B}/api/ops`, { data: '{"ops":[{"op":"put","el":{"id":"proto","type":"note","content":{"__proto__":{"polluted":true},"html":"<p>x</p>"},"__proto__":{"isAdmin":true}}}]}', headers: { 'content-type': 'application/json' } });
  assert(r.ok(), `put ${r.status()}`);
  const st = await (await alice.request.get(`${B}/api/state`)).json();
  assert(st.user && !st.user.isAdmin && !st.polluted, 'response picked up polluted fields');
  const fresh = await (await bob.request.get(`${B}/api/state`)).json();
  assert(!fresh.isAdmin && !fresh.user.isAdmin, "another account's response is polluted");
});

await check('S18', 'Brute-force bookkeeping cannot exhaust memory', async () => {
  const limiter = rateLimiter(10, 1000);
  for (let i = 0; i < 30000; i++) limiter.hit(`k${i}`);
  const peak = limiter.size;
  const realNow = Date.now;
  Date.now = () => realNow() + 5000;
  limiter.hit('after');
  Date.now = realNow;
  assert(limiter.size < 10, `old keys kept: ${limiter.size}`);
  fact(`30,000 distinct keys → peak ${peak} entries, ${limiter.size} after the window passed`);
});

await check('S19', 'Response headers: nosniff, framing, referrer, permissions, HSTS behind HTTPS, no caching of private data', async () => {
  const api = await alice.request.get(`${B}/api/state`);
  const page = await alice.request.get(`${B}/`);
  const https = await alice.request.get(`${B}/`, { headers: { 'x-forwarded-proto': 'https' } });
  const up = await (await alice.request.post(`${B}/api/upload?name=a.png`, { data: PNG, headers: { 'content-type': 'image/png' } })).json();
  const file = await alice.request.get(`${B}${up.url}`);
  const h = page.headers();
  assert(h['x-content-type-options'] === 'nosniff' && h['referrer-policy'] && /camera=\(\)/.test(h['permissions-policy'] || '') && h['cross-origin-opener-policy'] === 'same-origin', `page headers ${JSON.stringify(h).slice(0, 200)}`);
  assert(/no-store/.test(api.headers()['cache-control'] || ''), 'API responses may be cached');
  assert(/max-age=31536000/.test(https.headers()['strict-transport-security'] || ''), 'no HSTS behind HTTPS');
  assert(!page.headers()['strict-transport-security'], 'HSTS sent over plain HTTP');
  assert(/^private/.test(file.headers()['cache-control'] || ''), `upload cache-control ${file.headers()['cache-control']}`);
  assert(!/express|node/i.test(h['x-powered-by'] || '') && !h.server, 'server software advertised');
  fact(`API cache-control: ${api.headers()['cache-control']} · upload: ${file.headers()['cache-control']} · HSTS (https): ${https.headers()['strict-transport-security']}`);
});

await check('S20', 'Sign-in timing does not reveal which emails have accounts', async () => {
  const time = async (email) => {
    const t0 = performance.now();
    await fetch(`${B}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.202.${Math.floor(Math.random() * 250)}.1` }, body: JSON.stringify({ email, password: 'wrong-password' }) });
    return performance.now() - t0;
  };
  const known = [];
  const unknown = [];
  for (let i = 0; i < 4; i++) {
    known.push(await time(bobEmail));
    unknown.push(await time(`nobody-${rand()}@example.com`));
  }
  const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const ratio = med(known) / med(unknown);
  assert(ratio > 0.5 && ratio < 2, `known ${med(known).toFixed(0)} ms vs unknown ${med(unknown).toFixed(0)} ms`);
  fact(`median wrong-password time: existing email ${med(known).toFixed(0)} ms, unknown email ${med(unknown).toFixed(0)} ms`);
});

await check('S21', 'Dependencies: npm audit finds no known vulnerabilities', async () => {
  let out;
  try {
    out = execFileSync('npm', ['audit', '--json'], { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    out = e.stdout;
  }
  const counts = JSON.parse(out).metadata.vulnerabilities;
  const total = Object.values(counts).reduce((a, b) => a + b, 0) - (counts.total ?? 0);
  assert(total === 0, `vulnerabilities: ${JSON.stringify(counts)}`);
  fact(`npm audit: ${JSON.stringify(counts)}`);
});

evil.close();
await suite.finish();
