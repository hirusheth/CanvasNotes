// Runs tests/parity.e2e.js in headless Chrome against a running Canvas Notes.
//   CANVASNOTES_URL=http://127.0.0.1:5180 node tests/run-parity.mjs [sections]
// Use an empty DATA_DIR: the checks create their own boards. Sections default to all (A–I).
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const sections = process.argv[2] || 'ABCDEFGHI';
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
page.__sections = sections;
page.__base = process.env.CANVASNOTES_URL || 'http://127.0.0.1:5180';

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
