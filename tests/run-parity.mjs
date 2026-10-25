// Runs tests/parity.e2e.js in headless Chrome against a running Canvas Notes.
//   CANVASNOTES_URL=http://127.0.0.1:5180 node tests/run-parity.mjs [sections]
// Use an empty DATA_DIR: the checks create their own boards. Sections default to all (A–K).
// Section K also starts a second, password-protected server (port 5191) for the sign-in check.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const sections = process.argv[2] || 'ABCDEFGHIJK';
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
page.__sections = sections;
page.__base = process.env.CANVASNOTES_URL || 'http://127.0.0.1:5180';

let authServer, authDir;
if (sections.includes('K')) {
  authDir = await mkdtemp(path.join(tmpdir(), 'canvasnotes-auth-'));
  const port = 5191;
  page.__authPassword = 'parity-secret';
  authServer = spawn(process.execPath, [new URL('../server/index.mjs', import.meta.url).pathname], {
    env: { ...process.env, PORT: String(port), DATA_DIR: authDir, CANVASNOTES_PASSWORD: page.__authPassword },
    stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    const up = await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`).then((r) => r.ok, () => false);
    if (up) {
      page.__authBase = `http://127.0.0.1:${port}`;
      break;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

const source = await readFile(new URL('./parity.e2e.js', import.meta.url), 'utf8');
const run = (0, eval)(source);
const started = Date.now();
const result = await run(page);
await browser.close();
authServer?.kill();
if (authDir) await rm(authDir, { recursive: true, force: true });

for (const line of result.passed) console.log(`PASS ${line}`);
for (const f of result.failed) console.log(`FAIL ${f.id} ${f.name} — ${f.detail}`);
if (result.errors.length) console.log(`Page errors:\n  ${result.errors.join('\n  ')}`);
console.log(`\n${result.summary} in ${Math.round((Date.now() - started) / 1000)} s`);
process.exit(result.failed.length ? 1 : 0);
