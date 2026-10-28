// Runs tests/parity.e2e.js in headless Chrome against a running Canvas Notes.
//   CANVASNOTES_URL=http://127.0.0.1:5180 node tests/run-parity.mjs [sections]
// Use an empty DATA_DIR: the checks create their own boards. Sections default to all (A–K).
// The runner signs up a fresh account first; accounts themselves are tested by
// tests/run-accounts.mjs.
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const sections = process.argv[2] || 'ABCDEFGHIJK';
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
page.__sections = sections;
page.__base = process.env.CANVASNOTES_URL || 'http://127.0.0.1:5180';

const email = `parity-${Date.now()}@example.com`;
const signup = await context.request.post(`${page.__base}/api/signup`, { data: { email, password: 'parity-password' } });
if (!signup.ok()) {
  console.error(`Could not create the test account: ${signup.status()} ${await signup.text()}`);
  process.exit(1);
}

const source = await readFile(new URL('./parity.e2e.js', import.meta.url), 'utf8');
const run = (0, eval)(source);
const started = Date.now();
const result = await run(page);
await browser.close();

for (const line of result.passed) console.log(`PASS ${line}`);
for (const f of result.failed) console.log(`FAIL ${f.id} ${f.name} — ${f.detail}`);
if (result.errors.length) console.log(`Page errors:\n  ${result.errors.join('\n  ')}`);
console.log(`\n${result.summary} in ${Math.round((Date.now() - started) / 1000)} s`);
process.exit(result.failed.length ? 1 : 0);
