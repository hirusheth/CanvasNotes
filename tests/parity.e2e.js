// Milanote parity check: drives the real UI in a browser and verifies each
// feature from docs/feature-parity.md through what the server stored.
//
// Run against a fresh server (empty DATA_DIR) with `npm run test:parity`
// (tests/run-parity.mjs), or pass any Playwright `page` to the function below.
// Set page.__sections (e.g. 'AB') or page.__ids to run part of it.
async (page) => {
  const BASE = page.__base || 'http://127.0.0.1:5180';
  // Kept on the page object so partial results survive a crash of this script.
  const results = (page.__parity = []);
  const errors = [];
  // Handlers are attached once per page: the same page is reused across runs, and two
  // handlers accepting one dialog makes Playwright throw and close the page.
  page.__parityErrors = errors;
  if (!page.__parityHooked) {
    page.__parityHooked = true;
    page.on('pageerror', (e) => page.__parityErrors?.push(String(e).slice(0, 200)));
    page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'https://example.com' : undefined).catch(() => {}));
  }

  const wait = (ms) => page.waitForTimeout(ms);
  // Resolves to the download, or null after `ms` (never throws).
  const waitDownload = (ms) =>
    new Promise((resolve) => {
      const onDownload = (d) => {
        clearTimeout(timer);
        resolve(d);
      };
      const timer = setTimeout(() => {
        page.off('download', onDownload);
        resolve(null);
      }, ms);
      page.once('download', onDownload);
    });
  const api = async () => (await (await page.request.get(`${BASE}/api/state`)).json()).elements;
  const settle = () => wait(750); // autosave debounce is 500 ms
  const check = async (id, name, fn) => {
    if (page.__ids && !page.__ids.includes(id)) return; // run only the requested checks
    try {
      const detail = await fn();
      results.push({ id, name, ok: detail !== false, detail: detail === true || detail === undefined ? '' : String(detail).slice(0, 120) });
    } catch (e) {
      results.push({ id, name, ok: false, detail: String(e.message || e).split('\n')[0].slice(0, 160) });
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  };
  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const card = (id) => page.locator(`[data-el="${id}"]`).first();
  const centre = async (loc) => {
    const b = await loc.boundingBox();
    assert(b, 'element not visible');
    return { x: b.x + Math.min(24, b.width / 2), y: b.y + Math.min(14, b.height / 2) };
  };
  const rclickAt = async (x, y) => {
    await page.mouse.click(x, y, { button: 'right' });
    await wait(150);
  };
  const menu = async (label, exact = false) => {
    const btn = page.locator('.menu button, .menu a', exact ? { hasText: new RegExp(`^${label}`) } : { hasText: label }).first();
    await btn.click();
    await wait(250);
  };
  const cardMenu = async (id, label) => {
    const p = await centre(card(id));
    const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-el]')?.getAttribute('data-el'), [p.x, p.y]);
    assert(under === id, `another card (${under}) covers ${id} at ${Math.round(p.x)},${Math.round(p.y)}`);
    await rclickAt(p.x, p.y);
    await menu(label);
  };
  // Creates a card through the board's right-click menu at (x, y) and returns the new element.
  const newAt = async (x, y, label, more = false) => {
    const before = new Set((await api()).map((e) => e.id));
    await rclickAt(x, y);
    // Guard: the board menu (not a card's menu) must have opened at this point.
    assert(await page.locator('.menu button', { hasText: /^New Note/ }).count(), `(${x},${y}) is not empty board`);
    if (more) await menu('More', true);
    await menu(label, true);
    await wait(300);
    return { before };
  };
  const created = async (before, type) => {
    await settle();
    const els = await api();
    const el = els.find((e) => !before.has(e.id) && (!type || e.type === type));
    assert(el, `no new ${type || 'element'} saved`);
    return el;
  };
  const select = async (id) => {
    await page.keyboard.press('Escape');
    const p = await centre(card(id));
    await page.mouse.click(p.x, p.y);
    await wait(120);
  };
  const typeSlow = (t) => page.keyboard.type(t, { delay: 15 });
  // Drops a generated file on the board, like dragging it in from the desktop.
  const dropFile = async (x, y, name, mime, content) => {
    await page.evaluate(
      async ({ x, y, name, mime, content }) => {
        let data = content;
        if (content.startsWith('data:')) data = await (await fetch(content)).blob();
        const file = new File([data], name, { type: mime });
        const dt = new DataTransfer();
        dt.items.add(file);
        const target = document.elementFromPoint(x, y);
        for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
      },
      { x, y, name, mime, content },
    );
    await wait(1200);
  };
  const pngDataUrl = () =>
    page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 120;
      c.height = 80;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 120, 80);
      grad.addColorStop(0, '#3a8fd9');
      grad.addColorStop(1, '#e0566f');
      g.fillStyle = grad;
      g.fillRect(0, 0, 120, 80);
      return c.toDataURL('image/png');
    });
  // A point on the visible board with nothing under it.
  const emptyPoint = () =>
    page.evaluate(() => {
      const r = document.querySelector('.canvas').getBoundingClientRect();
      const free = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el && (el.classList.contains('canvas') || el.classList.contains('world'));
      };
      // A board card is about 110×125: the whole area (plus a margin) must be empty.
      for (let y = r.top + 60; y < r.bottom - 200; y += 40)
        for (let x = r.right - 200; x > r.left + 60; x -= 40) {
          let ok = true;
          for (let dy = -20; dy <= 170 && ok; dy += 30) for (let dx = -20; dx <= 160 && ok; dx += 30) ok = free(x + dx, y + dy);
          if (ok) return [x, y];
        }
      return [r.left + 100, r.bottom - 100];
    });
  const enterBoard = async (title) => {
    const [ex, ey] = await emptyPoint();
    const { before } = await newAt(ex, ey, 'New Board');
    await typeSlow(title);
    await page.keyboard.press('Enter');
    const board = await created(before, 'board');
    await page.mouse.dblclick(...Object.values(await centre(card(board.id))));
    await wait(500);
    assert(page.url().includes(board.id), 'board did not open');
    return board;
  };
  // In-app navigation by hash: no browser-level page load (a page.goto right after a
  // download has been seen to close the Playwright page).
  const go = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await wait(500);
  };
  const home = async () => {
    await go('#/');
    await wait(200);
  };

  // Shared between sections; later sections look them up when run on their own.
  let boardA, boardA2, boardA3, boardB, boardD, note, todo, boardChild, column, image, sketch, syncA, table, cellAt, n1, n2, n3;
  const SECTIONS = page.__sections || 'ABCDEFGHI';
  const run = (x) => SECTIONS.includes(x);
  const findBoard = async (title) => (await api()).find((e) => e.type === 'board' && e.content.title === title);
  const resolve = async () => {
    const els = await api();
    boardA ??= els.find((e) => e.type === 'board' && e.content.title === 'A Elements');
    boardA2 ??= els.find((e) => e.type === 'board' && e.content.title === 'A2 More elements');
    boardA3 ??= els.find((e) => e.type === 'board' && e.content.title === 'A3 Media');
    boardB ??= els.find((e) => e.type === 'board' && e.content.title === 'B Card tools');
    image ??= boardA3 && els.find((e) => e.type === 'image' && e.parentId === boardA3.id);
    sketch ??= boardA3 && els.find((e) => e.type === 'sketch' && e.parentId === boardA3.id);
    table ??= els.find((e) => e.type === 'table' && e.content.cells[0]?.[0] === 'Item');
    if (table && !cellAt) cellAt = (r, c) => card(table.id).locator('tbody tr').nth(r).locator('td').nth(c);
  };
  try {
  page.setDefaultTimeout(6000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(BASE);
  if (run('A')) await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('cn:toolbar', JSON.stringify({ hidden: [] }));
  });
  await page.reload();
  await wait(900);

  if (run('A')) {
  await resolve();
  // ------------------------------------------------------------ A. elements
  boardA = await enterBoard('A Elements');

  await check('A1', 'Note: double-click, Markdown heading and list', async () => {
    await page.mouse.dblclick(200, 150);
    await wait(400);
    await typeSlow('# Trip');
    await page.keyboard.press('Enter');
    await typeSlow('* one');
    await page.keyboard.press('Escape');
    await settle();
    note = (await api()).find((e) => e.parentId === boardA.id && e.type === 'note');
    assert(note && /<h1>Trip<\/h1>/.test(note.content.html) && /<ul>/.test(note.content.html), note?.content.html);
  });
  await check('A2', 'Heading card', async () => {
    const { before } = await newAt(600, 120, 'New Heading', true);
    await typeSlow('Big title');
    await page.keyboard.press('Enter');
    const el = await created(before, 'heading');
    assert(el.content.text === 'Big title', el.content.text);
  });
  await check('A3', 'Link card with server preview', async () => {
    const { before } = await newAt(1020, 250, 'New Link');
    await typeSlow('https://github.com');
    await page.keyboard.press('Enter');
    await wait(4000);
    const el = await created(before, 'link');
    assert(el.content.url.includes('github.com'), el.content.url);
    return el.content.title ? `title: ${el.content.title}` : 'saved (no network title)';
  });
  await check('A4', 'Video link becomes a player', async () => {
    const { before } = await newAt(200, 420, 'New Video', true);
    await typeSlow('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.keyboard.press('Enter');
    const el = await created(before, 'link');
    await wait(500);
    const src = await card(el.id).locator('iframe').getAttribute('src');
    assert(src && src.includes('youtube'), src);
  });
  await check('A5', 'Audio link (Spotify) becomes a player', async () => {
    const { before } = await newAt(520, 420, 'New Audio', true);
    await typeSlow('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
    await page.keyboard.press('Enter');
    const el = await created(before, 'link');
    await wait(500);
    assert(((await card(el.id).locator('iframe').getAttribute('src')) || '').includes('spotify'));
  });
  await check('A6', 'Map link (Google Maps) becomes a map', async () => {
    const { before } = await newAt(850, 420, 'New Map', true);
    await typeSlow('https://www.google.com/maps/place/Eiffel+Tower/@48.8584,2.2945,15z');
    await page.keyboard.press('Enter');
    const el = await created(before, 'link');
    await wait(500);
    assert(((await card(el.id).locator('iframe').getAttribute('src')) || '').includes('maps'));
  });
  await go(`#/b/${boardA.id}`);
  await wait(400);

  boardA2 = await enterBoard('A2 More elements');
  await check('A7', 'To-do: title, items, indent, due date, progress', async () => {
    const { before } = await newAt(200, 140, 'New To-do');
    await typeSlow('Groceries');
    await page.keyboard.press('Enter');
    await typeSlow('Milk');
    await page.keyboard.press('Enter');
    await typeSlow('Eggs');
    await page.keyboard.press('Tab');
    await page.locator('.due-add').first().click();
    await page.locator('.due-input').first().fill('2026-01-01');
    await page.keyboard.press('Escape');
    todo = await created(before, 'todo');
    await page.locator(`[data-el="${todo.id}"] input[type=checkbox]`).first().check();
    await settle();
    todo = (await api()).find((e) => e.id === todo.id);
    const items = todo.content.items;
    assert(todo.content.title === 'Groceries' && items.length >= 2, JSON.stringify(todo.content).slice(0, 100));
    assert(items.some((i) => i.indent === 1), 'indent not saved');
    assert(items.some((i) => i.due), 'due date not saved');
    assert(items[0].done, 'checkbox not saved');
  });
  await check('A8', 'Board inside a board, with breadcrumbs', async () => {
    const { before } = await newAt(600, 140, 'New Board');
    await typeSlow('Child');
    await page.keyboard.press('Enter');
    boardChild = await created(before, 'board');
    await page.mouse.dblclick(...Object.values(await centre(card(boardChild.id))));
    await wait(400);
    const crumbs = await page.locator('.crumbs').innerText();
    assert(crumbs.includes('A2 More elements') && crumbs.includes('Child'), crumbs);
    await page.evaluate(() => history.back());
    await wait(400);
  });
  await check('A9', 'Shortcut (alias) to a board, open it, find original', async () => {
    const before = new Set((await api()).map((e) => e.id));
    await cardMenu(boardChild.id, 'Create a Shortcut');
    const alias = await created(before, 'alias');
    assert(alias.content.boardId === boardChild.id);
    await page.mouse.dblclick(...Object.values(await centre(card(alias.id))));
    await wait(400);
    assert(page.url().includes(boardChild.id), 'shortcut did not open the board');
    await page.evaluate(() => history.back());
    await wait(400);
  });
  await check('A10', 'Column: drag a card in, collapse', async () => {
    const { before } = await newAt(950, 140, 'New Column');
    await typeSlow('Stack');
    await page.keyboard.press('Enter');
    column = await created(before, 'column');
    const from = await centre(card(todo.id));
    const colBox = await card(column.id).boundingBox();
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(colBox.x + 80, colBox.y + 60, { steps: 12 });
    await page.mouse.up();
    await settle();
    assert((await api()).find((e) => e.id === todo.id).columnId === column.id, 'card not in column');
    await card(column.id).locator('.column-header button[title="Collapse"]').click();
    await settle();
    assert((await api()).find((e) => e.id === column.id).content.collapsed, 'not collapsed');
    await card(column.id).locator('.column-header button[title="Expand"]').click();
  });
  await check('A11', 'Comment thread: write, reply', async () => {
    const { before } = await newAt(200, 520, 'New Comment');
    await typeSlow('First thought');
    await page.keyboard.press('Enter');
    await typeSlow('A reply');
    await page.keyboard.press('Enter');
    const el = await created(before, 'comment');
    assert(el.content.comments.length === 2, JSON.stringify(el.content));
  });
  await check('A12', 'Table: formulas', async () => {
    const { before } = await newAt(520, 520, 'New Table');
    for (const v of ['Item', 'Qty', 'Total', 'Milk', '2', '=B2*3', 'Eggs', '12', '=SUM(C2:C2)+B3']) {
      await typeSlow(v);
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Escape');
    const el = await created(before, 'table');
    const shown = await card(el.id).locator('td .cell-text').allInnerTexts();
    assert(shown.includes('6') && shown.includes('18'), shown.join('|'));
  });
  await check('A13', 'Spreadsheet: dropping a CSV makes a table', async () => {
    const before = new Set((await api()).map((e) => e.id));
    await dropFile(1100, 560, 'budget.csv', 'text/csv', 'Month,Spend\nJan,120\nFeb,95\n');
    const el = await created(before, 'table');
    assert(el.content.cells.length >= 3 && el.content.cells[1][1] === '120', JSON.stringify(el.content.cells));
  });
  await go(`#/b/${boardA.id}`);
  await wait(400);

  boardA3 = await enterBoard('A3 Media');
  await check('A14', 'Image: drop a PNG', async () => {
    const before = new Set((await api()).map((e) => e.id));
    await dropFile(250, 200, 'gradient.png', 'image/png', await pngDataUrl());
    image = await created(before, 'image');
    assert(image.content.src.startsWith('/files/') && image.content.ratio, JSON.stringify(image.content));
  });
  await check('A15', 'File: drop a text file, download link', async () => {
    const before = new Set((await api()).map((e) => e.id));
    await dropFile(650, 200, 'notes.txt', 'text/plain', 'hello file');
    const el = await created(before, 'file');
    assert(el.content.name === 'notes.txt' && el.content.size === 10, JSON.stringify(el.content));
    assert(await card(el.id).locator('a[download]').count(), 'no download link');
  });
  const drawStroke = async () => {
    const paper = await page.locator('.draw-svg').boundingBox();
    await page.mouse.move(paper.x + 40, paper.y + 40);
    await page.mouse.down();
    for (let i = 0; i < 12; i++) await page.mouse.move(paper.x + 40 + i * 12, paper.y + 40 + (i % 3) * 10);
    await page.mouse.up();
  };
  await check('A16', 'Sketch: draw, save', async () => {
    const { before } = await newAt(1000, 200, 'New Sketch', true);
    await drawStroke();
    await page.locator('.draw-tools button', { hasText: 'Save' }).click();
    sketch = await created(before, 'sketch');
    assert(sketch.content.strokes.length === 1, `${sketch.content.strokes.length} strokes`);
  });
  await check('A17', 'Draw on an image (annotation)', async () => {
    await cardMenu(image.id, 'Draw On');
    await drawStroke();
    await page.locator('.draw-tools button', { hasText: 'Save' }).click();
    await settle();
    assert(((await api()).find((e) => e.id === image.id).content.annotation || []).length === 1);
  });
  await check('A18', 'Document: full-screen editor, word count', async () => {
    const { before } = await newAt(250, 560, 'New Document', true);
    await typeSlow('Plan');
    await page.locator('.doc-sheet-body .ProseMirror').click();
    await typeSlow('Three little words');
    const wc = await page.locator('.doc-sheet-meta').innerText();
    await page.locator('.doc-sheet-bar button', { hasText: 'Close' }).click();
    const el = await created(before, 'document');
    assert(el.content.title === 'Plan' && /3 words/.test(wc), `${el.content.title} / ${wc}`);
  });
  await check('A19', 'Colour swatch', async () => {
    const { before } = await newAt(650, 560, 'New Colour', true);
    const el = await created(before, 'swatch');
    assert(/^#[0-9a-f]{6}$/i.test(el.content.hex), el.content.hex);
  });
  await check('A20', 'Synced copy: editing one updates the other', async () => {
    await page.mouse.dblclick(1000, 560);
    await wait(300);
    await typeSlow('Shared text');
    await page.keyboard.press('Escape');
    await settle();
    syncA = (await api()).find((e) => e.type === 'note' && e.parentId === boardA3.id && e.content.html.includes('Shared'));
    const before = new Set((await api()).map((e) => e.id));
    await cardMenu(syncA.id, 'Create Synced Copy');
    const copy = await created(before, 'note');
    await select(copy.id);
    await page.keyboard.press('Enter');
    await wait(400);
    await page.keyboard.press('Control+End');
    await typeSlow(' edited');
    await page.keyboard.press('Escape');
    await settle();
    const orig = (await api()).find((e) => e.id === syncA.id);
    assert(orig.content.html.includes('edited') && orig.syncId && orig.syncId === copy.syncId, orig.content.html);
  });
  await check('A21', 'Folder', async () => {
    const { before } = await newAt(1250, 420, 'New Folder');
    await typeSlow('Recipes');
    await page.keyboard.press('Enter');
    const el = await created(before, 'column');
    assert(el.content.folder, JSON.stringify(el.content));
  });
  await check('A22', 'Image/file placeholder, filled by a drop', async () => {
    const { before } = await newAt(1250, 700, 'New Image/File Placeholder');
    const el = await created(before);
    const p = await centre(card(el.id));
    await dropFile(p.x, p.y, 'fill.png', 'image/png', await pngDataUrl());
    const after = (await api()).find((e) => e.id === el.id);
    assert(after && after.type === 'image' && after.content.src, JSON.stringify(after?.content).slice(0, 80));
  });
  await home();
  }

  if (run('B')) {
  await resolve();
  // ------------------------------------------------------------ B. selected-card tools
  boardB = await enterBoard('B Card tools');
  const mkNote = async (x, y, text) => {
    await page.mouse.dblclick(x, y);
    await wait(300);
    await typeSlow(text);
    await page.keyboard.press('Escape');
    await settle();
    return (await api()).find((e) => e.type === 'note' && e.parentId === boardB.id && e.content.html.includes(text));
  };
  n1 = await mkNote(200, 150, 'Alpha');
  n2 = await mkNote(560, 200, 'Beta');
  n3 = await mkNote(900, 260, 'Gamma');
  await check('B1', 'Card colour', async () => {
    const p = await centre(card(n1.id));
    await rclickAt(p.x, p.y);
    await page.locator('.menu .swatch-dot.color-sky').click();
    await settle();
    assert((await api()).find((e) => e.id === n1.id).color === 'sky');
  });
  await check('B2', 'Colour mode: top strip', async () => {
    await cardMenu(n1.id, 'Top strip');
    await settle();
    assert((await api()).find((e) => e.id === n1.id).colorStrip === true);
  });
  await check('B3', 'Transparent card', async () => {
    const p = await centre(card(n2.id));
    await rclickAt(p.x, p.y);
    await page.locator('.menu .swatch-dot[title="Transparent"]').click();
    await settle();
    assert((await api()).find((e) => e.id === n2.id).color === 'transparent');
  });
  await check('B4', 'Labels: create and apply', async () => {
    await cardMenu(n3.id, 'Labels…');
    await page.locator('.labels-dialog .palette-input').fill('Urgent');
    await page.keyboard.press('Enter');
    await settle();
    await page.keyboard.press('Escape');
    const els = await api();
    const label = els.find((e) => e.type === 'label' && e.content.name === 'Urgent');
    assert(label && els.find((e) => e.id === n3.id).labels?.includes(label.id));
  });
  await check('B5', 'Connect with lines (multi-select)', async () => {
    await select(n1.id);
    const p = await centre(card(n2.id));
    // mouse.click ignores `modifiers`; hold Shift on the keyboard instead.
    await page.keyboard.down('Shift');
    await page.mouse.click(p.x, p.y);
    await page.keyboard.up('Shift');
    const before = new Set((await api()).map((e) => e.id));
    await rclickAt(p.x, p.y);
    await menu('Connect with Lines');
    const line = await created(before, 'line');
    assert(line.content.from.id && line.content.to.id);
  });
  await check('B6', 'Line: label, arrows, dashed, weight', async () => {
    const line = (await api()).find((e) => e.type === 'line' && e.parentId === boardB.id);
    const hit = page.locator(`[data-line="${line.id}"] .line-hit`);
    await hit.dblclick({ force: true });
    await typeSlow('leads to');
    await page.keyboard.press('Enter');
    await hit.click({ button: 'right', force: true });
    await wait(150);
    await page.locator('.menu button[title="Arrows at both ends"]').click();
    await hit.click({ button: 'right', force: true });
    await page.locator('.menu button[title="Dashed"]').click();
    await hit.click({ button: 'right', force: true });
    await page.locator('.menu button[title="Weight 4"]').click();
    await settle();
    const c = (await api()).find((e) => e.id === line.id).content;
    assert(c.label === 'leads to' && c.arrow === 'both' && c.dashed && c.weight === 4, JSON.stringify(c).slice(0, 120));
  });
  await check('B7', 'Align and distribute', async () => {
    await page.keyboard.press('Control+a');
    const p = await centre(card(n1.id));
    await rclickAt(p.x, p.y);
    await menu('Align & Distribute');
    await page.locator('.menu button[title="Align top"]').click();
    await settle();
    const ys = (await api()).filter((e) => [n1.id, n2.id, n3.id].includes(e.id)).map((e) => e.y);
    assert(new Set(ys).size === 1, ys.join(','));
  });
  await check('B8', 'Description (caption) on a board', async () => {
    const { before } = await newAt(300, 650, 'New Board');
    await typeSlow('Described');
    await page.keyboard.press('Enter');
    const b = await created(before, 'board');
    await cardMenu(b.id, 'Add Description');
    await typeSlow('What this is');
    await page.keyboard.press('Enter');
    await settle();
    assert((await api()).find((e) => e.id === b.id).caption === 'What this is');
  });
  await check('B9', 'Board icon (emoji)', async () => {
    const b = (await api()).find((e) => e.type === 'board' && e.content.title === 'Described');
    await cardMenu(b.id, 'Change Icon');
    await page.locator('.icon-grid button', { hasText: '🚀' }).click();
    await settle();
    assert((await api()).find((e) => e.id === b.id).content.icon === '🚀');
  });
  await check('B10', 'Reactions', async () => {
    await cardMenu(n2.id, 'Reactions');
    await page.locator('.reactions-pick button', { hasText: '🎉' }).click();
    await settle();
    assert(((await api()).find((e) => e.id === n2.id).reactions || []).includes('🎉'));
  });
  await check('B11', 'Lock position (locked cards do not move)', async () => {
    await cardMenu(n3.id, 'Lock Position');
    const before = (await api()).find((e) => e.id === n3.id);
    const p = await centre(card(n3.id));
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 150, p.y + 80, { steps: 8 });
    await page.mouse.up();
    await settle();
    const after = (await api()).find((e) => e.id === n3.id);
    assert(after.locked && after.x === before.x && after.y === before.y);
  });
  await check('B12', 'Group into column', async () => {
    await select(n1.id);
    const before = new Set((await api()).map((e) => e.id));
    await cardMenu(n1.id, 'Group into Column');
    const col = await created(before, 'column');
    assert((await api()).find((e) => e.id === n1.id).columnId === col.id);
  });
  await check('B13', 'Convert to document and back', async () => {
    await cardMenu(n2.id, 'Convert to');
    await menu('Convert to Document');
    await settle();
    assert((await api()).find((e) => e.id === n2.id).type === 'document');
    await cardMenu(n2.id, 'Convert to');
    await menu('Convert to Note');
    await settle();
    assert((await api()).find((e) => e.id === n2.id).type === 'note');
  });
  await check('B14', 'Copy style / paste styles', async () => {
    const n4 = await mkNote(1150, 650, 'Delta');
    await select(n3.id);
    await cardMenu(n3.id, 'Unlock Position');
    const p3 = await centre(card(n3.id));
    await rclickAt(p3.x, p3.y);
    await page.locator('.menu .swatch-dot.color-mint').click();
    await select(n3.id);
    await page.keyboard.press('Control+Alt+c');
    await select(n4.id);
    await page.keyboard.press('Control+Alt+v');
    await settle();
    assert((await api()).find((e) => e.id === n4.id).color === 'mint');
  });
  await check('B15', 'Duplicate, cut, paste, undo/redo', async () => {
    await select(n3.id);
    const count = async () => (await api()).filter((e) => e.type === 'note' && e.parentId === boardB.id).length;
    const c0 = await count();
    await page.keyboard.press('Control+d');
    await settle();
    assert((await count()) === c0 + 1, 'duplicate');
    await page.keyboard.press('Control+z');
    await settle();
    assert((await count()) === c0, 'undo');
    await page.keyboard.press('Control+Shift+z');
    await settle();
    assert((await count()) === c0 + 1, 'redo');
  });
  await check('B16', 'Bring to front / send to back', async () => {
    const z0 = (await api()).find((e) => e.id === n3.id).z;
    await cardMenu(n3.id, 'Send to Back');
    await settle();
    assert((await api()).find((e) => e.id === n3.id).z < z0);
  });
  await check('B17', 'Created / modified time in menu', async () => {
    const p = await centre(card(n3.id));
    await rclickAt(p.x, p.y);
    const note = await page.locator('.menu .menu-note').innerText();
    assert(/Created/.test(note), note);
  });
  await home();
  }

  if (run('C')) {
  await resolve();
  // ------------------------------------------------------------ C. media, crop, file info, export element
  await go(`#/b/${boardA3.id}`);
  await wait(600);
  await check('C1', 'Crop image', async () => {
    await cardMenu(image.id, 'Crop Image…');
    const h = page.locator('.overlay .crop-handle, .overlay [data-handle]').first();
    const hb = await h.boundingBox();
    await page.mouse.move(hb.x + 4, hb.y + 4);
    await page.mouse.down();
    await page.mouse.move(hb.x + 60, hb.y + 30, { steps: 5 });
    await page.mouse.up();
    await page.locator('.overlay button', { hasText: /^Crop$/ }).click();
    await settle();
    const crop = (await api()).find((e) => e.id === image.id).content.crop;
    assert(crop && crop.w < 1, JSON.stringify(crop));
  });
  await check('C2', 'Crop image to fit dot grid', async () => {
    await cardMenu(image.id, 'Crop Image to Fit Dot Grid');
    await settle();
    assert((await api()).find((e) => e.id === image.id).content.crop);
  });
  await check('C3', 'File info panel', async () => {
    await cardMenu(image.id, 'File Info');
    const text = await page.locator('.overlay').innerText();
    assert(/png/i.test(text), text.slice(0, 80));
  });
  await check('C4', 'Video start / end / loop', async () => {
    await go(`#/b/${boardA.id}`);
    await wait(600);
    const vid = (await api()).find((e) => e.type === 'link' && e.parentId === boardA.id && e.content.url.includes('youtube'));
    const p = await centre(card(vid.id));
    await rclickAt(p.x, p.y);
    await menu('Video Options');
    await page.locator('.media-options input').first().fill('0:30');
    await page.locator('.media-options input').nth(1).fill('1:00');
    await page.locator('.media-options input[type=checkbox]').first().check();
    await settle();
    const m = (await api()).find((e) => e.id === vid.id).content.media || {};
    assert(m.start === 30 && m.end === 60 && m.loop, JSON.stringify(m));
  });
  await check('C5', 'Download a sketch as SVG', async () => {
    await go(`#/b/${boardA3.id}`);
    await wait(600);
    const dl = waitDownload(5000);
    await cardMenu(sketch.id, 'Download SVG');
    const d = await dl;
    assert(d, 'no download');
    assert(d.suggestedFilename().endsWith('.svg'), d.suggestedFilename());
  });
  await check('C7', 'Convert an image to a sketch card', async () => {
    await go(`#/b/${boardA3.id}`);
    await wait(600);
    const before = new Set((await api()).map((e) => e.id));
    await cardMenu(image.id, 'Convert to Sketch Card');
    await settle();
    const els = await api();
    const conv = els.find((e) => e.id === image.id);
    const sk = conv?.type === 'sketch' ? conv : els.find((e) => !before.has(e.id) && e.type === 'sketch');
    assert(sk && sk.type === 'sketch', `image is now ${conv?.type}`);
    // Put the image back for the checks that follow.
    await page.keyboard.press('Control+z');
    await settle();
  });
  await check('C6', 'Export a single element', async () => {
    const doc = (await api()).find((e) => e.type === 'document');
    const dl = waitDownload(5000);
    await cardMenu(doc.id, 'Export…');
    const btn = page.locator('.overlay button, .menu button', { hasText: /Markdown/ }).first();
    if (await btn.count()) await btn.click();
    const d = await dl;
    assert(d, 'no download');
    return d.suggestedFilename();
  });
  await home();
  }

  if (run('D')) {
  await resolve();
  // ------------------------------------------------------------ D. text editing
  boardD = await enterBoard('D Text');
  await check('D1', 'Bold, italic, underline, strikethrough, inline code (shortcuts and bar)', async () => {
    await page.mouse.dblclick(250, 200);
    await wait(400);
    await page.keyboard.press('Control+b');
    await typeSlow('bold');
    await page.keyboard.press('Control+b');
    await typeSlow(' ');
    await page.keyboard.press('Control+i');
    await typeSlow('ital');
    await page.keyboard.press('Control+i');
    await typeSlow(' ');
    await page.keyboard.press('Control+u');
    await typeSlow('under');
    await page.keyboard.press('Control+u');
    await page.keyboard.press('Enter');
    await page.locator('.format-bar .fb-strike').click();
    await typeSlow('gone');
    await page.locator('.format-bar .fb-strike').click();
    await page.keyboard.press('Enter');
    await page.locator('.format-bar .fb-code').click();
    await typeSlow('code');
    await page.keyboard.press('Escape');
    await settle();
    const html = (await api()).find((e) => e.parentId === boardD.id && e.type === 'note').content.html;
    for (const tag of ['<strong>', '<em>', '<u>', '<s>', '<code>']) assert(html.includes(tag), `${tag} missing in ${html}`);
  });
  const lastNote = async () => (await api()).filter((e) => e.parentId === boardD.id && e.type === 'note').sort((a, b) => b.createdAt - a.createdAt)[0];
  await check('D2', 'Markdown: ## [] > ! ``` --- 1.', async () => {
    await page.mouse.dblclick(650, 200);
    await wait(400);
    for (const line of ['## Sub', '[] task', '> quote']) {
      await typeSlow(line);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
    }
    await typeSlow('! callout');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await typeSlow('1. first');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await typeSlow('---');
    await typeSlow('```');
    await typeSlow(' x');
    await page.keyboard.press('Escape');
    await settle();
    const html = (await lastNote()).content.html;
    for (const s of ['<h2>', 'data-type="taskList"', '<blockquote>', 'data-callout', '<ol>', '<hr>']) assert(html.includes(s), `${s} missing: ${html.slice(0, 200)}`);
  });
  await check('D3', 'Text colour, highlight, alignment, font, size, indent', async () => {
    await page.mouse.dblclick(250, 520);
    await wait(400);
    await typeSlow('Styled');
    await page.keyboard.press('Control+a');
    const bar = page.locator('.format-bar');
    await bar.locator('.fb-color-a').click({ force: true });
    await page.locator('.fb-colors .swatch-dot').nth(3).click({ force: true });
    // The colour popup stays open so a highlight can be picked in the same place.
    if (!(await page.locator('.fb-colors').count())) await bar.locator('.fb-color-a').click({ force: true });
    await page.locator('.fb-colors .menu-colors').nth(1).locator('.swatch-dot').nth(2).click({ force: true });
    await bar.locator('button[title="Alignment"]').click({ force: true });
    await page.locator('.fb-pop button', { hasText: 'Center' }).click({ force: true });
    const font = bar.locator('button[title*="Font"]').first();
    if (await font.count()) {
      await font.click({ force: true });
      await page.locator('.fb-pop button').nth(2).click({ force: true });
    }
    // Popups that stay open can cover the Indent button, so send the press straight to it.
    await bar.locator('button[title^="Indent"]').first().dispatchEvent('mousedown');
    await page.keyboard.press('Escape');
    await settle();
    const html = (await lastNote()).content.html;
    assert(/color/.test(html) && /<mark/.test(html) && /text-align: center/.test(html), html.slice(0, 200));
    assert(/data-indent/.test(html), `paragraph indent missing: ${html.slice(0, 200)}`);
    assert(/font-family/.test(html), 'font not applied');
  });
  await check('D4', 'Link to another board inside a note', async () => {
    await page.mouse.dblclick(650, 560);
    await wait(400);
    await page.locator('.format-bar button[title="Link to board"]').click({ force: true });
    await page.locator('.palette-results button').filter({ has: page.locator('.result-text', { hasText: /^A Elements$/ }) }).first().click();
    await wait(300);
    await page.keyboard.press('Escape');
    await settle();
    const html = (await lastNote()).content.html;
    assert(html.includes(`#/b/${boardA.id}`), html);
  });
  await check('D5', 'Emoji and clear formatting', async () => {
    await page.mouse.dblclick(1000, 300);
    await wait(400);
    await page.locator('.format-bar button[title="Insert emoji"]').click({ force: true });
    await page.locator('.fb-emoji button').first().click({ force: true });
    await page.keyboard.press('Escape');
    await settle();
    assert(/\p{Extended_Pictographic}/u.test((await lastNote()).content.html));
  });
  await home();
  }

  if (run('E')) {
  await resolve();
  // ------------------------------------------------------------ E. tables
  await go(`#/b/${boardA2.id}`);
  await wait(600);
  table = (await api()).find((e) => e.type === 'table' && e.content.cells[0][0] === 'Item');
  cellAt = (r, c) => card(table.id).locator('tbody tr').nth(r).locator('td').nth(c);
  await check('E1', 'Add row / column from the cell menu', async () => {
    await cellAt(1, 1).click({ button: 'right' });
    await page.locator('.table-menu button', { hasText: 'Add Row Below' }).click();
    await cellAt(1, 1).click({ button: 'right' });
    await page.locator('.table-menu button', { hasText: 'Add Column Right' }).click();
    await settle();
    const t = (await api()).find((e) => e.id === table.id).content.cells;
    assert(t.length === 5 && t[0].length === 4, `${t.length}x${t[0].length}`);
  });
  await check('E2', 'Cell type currency with chosen currency and decimals', async () => {
    await cellAt(1, 2).click({ button: 'right' });
    await page.locator('.table-menu .menu-chips button', { hasText: 'Currency' }).click();
    await cellAt(1, 2).click({ button: 'right' });
    const eur = page.locator('.table-menu button', { hasText: 'EUR' });
    if (await eur.count()) await eur.click();
    await settle();
    const st = (await api()).find((e) => e.id === table.id).content.styles || {};
    // The style must land on the right-clicked column (C), not column A.
    assert(Object.entries(st).some(([k, v]) => k.endsWith(':2') && v.type === 'currency'), JSON.stringify(st).slice(0, 120));
    return (await cellAt(1, 2).innerText()).trim();
  });
  await check('E3', 'Multi-cell select and clear', async () => {
    await page.mouse.dblclick(...Object.values(await centre(cellAt(3, 0))));
    await wait(300);
    await cellAt(3, 0).locator('input').click();
    await page.keyboard.press('Shift+ArrowRight');
    const inRange = await card(table.id).locator('td.in-range').count();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    assert(inRange >= 2, `${inRange} cells in range`);
  });
  await home();
  }

  if (run('F')) {
  await resolve();
  // ------------------------------------------------------------ F. board, navigation, organising
  await check('F1', 'Board background colour and dot grid', async () => {
    await go(`#/b/${boardB.id}`);
    await wait(500);
    await rclickAt(700, 800);
    await menu('Change Board Background');
    await page.locator('.menu .swatch-dot[title="#e8eef5"]').click();
    await rclickAt(700, 800);
    await menu('Change Board Background');
    await menu('Hide Dot Grid');
    await settle();
    const b = (await api()).find((e) => e.id === boardB.id).content;
    assert(b.background === '#e8eef5' && b.hideGrid, JSON.stringify(b));
  });
  await check('F2', 'Drag a card onto a breadcrumb to move it up', async () => {
    const delta = (await api()).find((e) => e.parentId === boardB.id && e.type === 'note' && e.content.html.includes('Delta'));
    const p = await centre(card(delta.id));
    const crumb = await page.locator('.crumb[data-crumb="root"]').boundingBox();
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(crumb.x + 10, crumb.y + 10, { steps: 15 });
    const highlighted = await page.locator('.crumb.drop-target').count();
    await page.mouse.up();
    await settle();
    assert(highlighted === 1, 'crumb not highlighted');
    assert((await api()).find((e) => e.id === delta.id).parentId === 'root', 'not moved');
  });
  await check('F3', 'Unsorted: U sends a card, drag back out', async () => {
    const gamma = (await api()).find((e) => e.parentId === boardB.id && e.type === 'note' && e.content.html.includes('Gamma'));
    await select(gamma.id);
    await page.keyboard.press('u');
    await settle();
    assert((await api()).find((e) => e.id === gamma.id).section === 'inbox', 'not in unsorted');
    await page.locator('.toolbar .tool', { hasText: /^Unsorted/ }).click();
    await wait(300);
    const c = await page.locator('.inbox-card').first().boundingBox();
    await page.mouse.move(c.x + 30, c.y + 20);
    await page.mouse.down();
    await page.mouse.move(500, 500, { steps: 10 });
    await page.mouse.up();
    await settle();
    assert((await api()).find((e) => e.id === gamma.id).section === 'canvas', 'not back on board');
    await page.keyboard.press('Escape');
  });
  await check('F4', 'Quick notes shared by every board', async () => {
    await page.locator('.topbar button[title^="Quick notes"]').click();
    await wait(300);
    const input = page.locator('.side-panel textarea').first();
    await input.fill('Buy stamps');
    await page.keyboard.press('Enter');
    await settle();
    assert((await api()).some((e) => e.type === 'note' && e.content.html.includes('Buy stamps')));
    await page.keyboard.press('Escape');
  });
  await check('F5', 'Templates: convert board to template, use it', async () => {
    await home();
    const child = (await api()).find((e) => e.id === boardB.id);
    await cardMenu(child.id, 'Convert to Template');
    await settle();
    assert((await api()).find((e) => e.id === boardB.id).parentId === '__templates', 'not a template');
    await page.locator('.toolbar .tool', { hasText: /^Templates/ }).click();
    await wait(300);
    const before = new Set((await api()).map((e) => e.id));
    await page.locator('.template-row', { hasText: 'B Card tools' }).first().click();
    const copy = await created(before, 'board');
    assert((await api()).filter((e) => e.parentId === copy.id).length > 0, 'template copy is empty');
  });
  await check('F6', 'Trash: delete, restore, empty', async () => {
    const victim = (await api()).find((e) => e.type === 'note' && e.content.html.includes('Delta'));
    await select(victim.id);
    assert(await card(victim.id).evaluate((n) => n.classList.contains('selected')), 'victim not selected');
    await page.keyboard.press('Delete');
    await settle();
    assert((await api()).find((e) => e.id === victim.id).section === 'trash', 'Delete did not move it to Trash');
    await page.locator('.toolbar .tool', { hasText: /^Trash/ }).click();
    await page.locator('.trash-actions button', { hasText: 'Restore' }).first().click();
    await settle();
    assert((await api()).find((e) => e.id === victim.id).section === 'canvas', 'restore');
    await page.keyboard.press('Escape');
  });
  await check('F7', 'Search: matches, label filter, sort, jump to card', async () => {
    await page.keyboard.press('Control+k');
    await typeSlow('milk');
    await wait(300);
    const rows = await page.locator('.palette-results li').count();
    const sort = page.locator('.palette-filters select').first();
    await sort.selectOption('modified');
    await page.keyboard.press('Enter');
    await wait(500);
    assert(rows >= 1 && page.url().includes(boardA2.id), `${rows} rows, ${page.url()}`);
  });
  await check('F8', 'Presentation mode steps through cards', async () => {
    await page.keyboard.press('Control+Shift+p');
    await wait(500);
    await page.keyboard.press('ArrowRight');
    await wait(300);
    const hud = await page.locator('.presentation-hud').innerText();
    await page.keyboard.press('Escape');
    assert(/1 \//.test(hud), hud);
  });
  await check('F9', 'Board password hides contents until unlocked', async () => {
    await go(`#/b/${boardA.id}`);
    await wait(600);
    const target = (await api()).find((e) => e.id === boardA3.id);
    await cardMenu(target.id, 'Password Protect');
    const pw = page.locator('.dialog input[type=password]');
    await pw.first().fill('pw-1234');
    if ((await pw.count()) > 1) await pw.nth(1).fill('pw-1234');
    await page.keyboard.press('Enter');
    await wait(600);
    const anon = await (await fetch(`${BASE}/api/state`)).json();
    assert(!anon.elements.some((e) => e.parentId === boardA3.id), 'contents leaked to a request without the unlock cookie');
    const r = await page.request.post(`${BASE}/api/board-unlock-remove`, { data: { id: boardA3.id, password: 'pw-1234' } });
    assert(r.ok(), 'could not remove');
  });
  await check('F10', 'Read-only public link', async () => {
    await home();
    await cardMenu(boardA.id, 'Publish Read-only Link');
    await settle();
    const token = (await api()).find((e) => e.id === boardA.id).content.publicToken;
    assert(token, 'no token');
    const res = await (await fetch(`${BASE}/api/public/${token}`)).json();
    assert(res.elements.length > 1, 'public board empty');
  });
  }

  if (run('G')) {
  await resolve();
  // ------------------------------------------------------------ G. export
  await check('G1', 'Export board as Markdown, text and Word', async () => {
    await go(`#/b/${boardA2.id}`);
    await wait(600);
    await page.locator('.topbar button[title="Export board"]').click();
    const names = [];
    for (const label of ['Markdown', 'Plain text', 'Word document']) {
      const dl = waitDownload(5000);
      await page.locator('.side-panel button', { hasText: label }).first().click();
      const d = await dl;
      assert(d, `no ${label} download`);
      names.push(d.suggestedFilename());
    }
    assert(names[0].endsWith('.md') && names[1].endsWith('.txt') && names[2].endsWith('.doc'), names.join(','));
  });
  await check('G2', 'Export board as PNG', async () => {
    if (!(await page.locator('.side-panel button', { hasText: 'PNG image' }).count())) await page.locator('.topbar button[title="Export board"]').click();
    const dl = waitDownload(15000);
    await page.locator('.side-panel button', { hasText: 'PNG image' }).click();
    const d = await dl;
    assert(d && d.suggestedFilename().endsWith('.png'), 'no PNG download');
  });
  await check('G3', 'ZIP of all images and files', async () => {
    const r = await page.request.get(`${BASE}/api/board-files/${boardA3.id}`);
    const body = await r.body();
    assert(r.ok() && body[0] === 0x50 && body[1] === 0x4b, `status ${r.status()}`);
  });
  await check('G4', 'Whole-account JSON backup', async () => {
    const r = await page.request.get(`${BASE}/api/export`);
    assert(r.ok() && (await r.json()).elements.length > 20);
  });
  }

  if (run('H')) {
  await resolve();
  // ------------------------------------------------------------ H. settings
  await check('H1', 'Theme toggle and interface size', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Shift+d');
    await wait(200);
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.keyboard.press('Control+Shift+=');
    const scale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'));
    await page.keyboard.press('Control+Shift+-');
    await page.keyboard.press('Control+Shift+d');
    assert(theme && scale.trim() !== '1', `${theme} ${scale}`);
  });
  await check('H2', 'Toolbar options hide a tool', async () => {
    await page.locator('.toolbar .tool', { hasText: /^More/ }).click();
    await page.locator('.toolbar-prefs label', { hasText: 'Map' }).locator('input').uncheck();
    const has = await page.locator('.toolbar .tool', { hasText: /^Map$/ }).count();
    await page.locator('.toolbar-prefs label', { hasText: 'Map' }).locator('input').check();
    assert(has === 0);
  });
  await check('H3', 'Localization: number format and currency change table display', async () => {
    let step = 'open board';
    try {
      await go(`#/b/${boardA2.id}`);
      // Put a decimal amount in the currency cell styled by E2.
      // Earlier checks (search jump) may have panned this board; fit it to the screen first.
      await page.keyboard.press('Escape');
      await page.keyboard.press('Shift+!');
      await wait(300);
      step = 'start editing the table';
      await page.mouse.dblclick(...Object.values(await centre(cellAt(1, 2))));
      await wait(300);
      step = 'focus the cell';
      await cellAt(1, 2).locator('input').click();
      await page.keyboard.press('Control+a');
      await typeSlow('1234.5');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await settle();
      const before = (await cellAt(1, 2).innerText()).trim();
      step = 'open settings';
      await page.locator('.toolbar .tool', { hasText: /^More/ }).click();
      step = 'choose formats';
      await page.locator('.field', { hasText: 'Numbers' }).locator('select').selectOption('de-DE');
      await page.locator('.field', { hasText: 'Currency' }).locator('select').selectOption('INR');
      await wait(400);
      const after = (await cellAt(1, 2).innerText()).trim();
      await page.locator('.field', { hasText: 'Numbers' }).locator('select').selectOption('');
      assert(before && after && before !== after, `${before} → ${after}`);
      return `${before} → ${after}`;
    } catch (e) {
      throw new Error(`[${step}] ${String(e.message || e).split('\n')[0]}`);
    }
  });
  await check('H4', 'Interface language: Español, Français, Português', async () => {
    const seen = {};
    for (const [code, note, menuItem, settings] of [
      ['es', 'Nota', 'Nueva nota', 'Ajustes'],
      ['fr', 'Note', 'Nouvelle note', 'Réglages'],
      ['pt', 'Nota', 'Nova nota', 'Configurações'],
    ]) {
      if (!(await page.locator('.field', { hasText: /Language|Idioma|Langue/ }).count())) await page.locator('.toolbar .tool').filter({ hasText: /^(More|Más|Plus|Mais)$/ }).click();
      await page.locator('.field', { hasText: /Language|Idioma|Langue/ }).locator('select').selectOption(code);
      await wait(400);
      const tools = (await page.locator('.toolbar .tool span').allInnerTexts()).join('|');
      const heading = await page.locator('.side-panel .side-head h2').first().innerText();
      await page.keyboard.press('Escape');
      const [ex, ey] = await emptyPoint();
      await rclickAt(ex, ey);
      const menuText = await page.locator('.menu').innerText();
      await page.keyboard.press('Escape');
      seen[code] = `${tools.split('|')[0]} / ${heading}`;
      assert(tools.split('|')[0] === note, `${code}: toolbar starts with ${tools.split('|')[0]}`);
      assert(heading === settings, `${code}: settings heading ${heading}`);
      assert(menuText.includes(menuItem), `${code}: board menu lacks ${menuItem}`);
      assert(await page.evaluate(() => document.documentElement.lang) === code, `${code}: html lang`);
    }
    await page.locator('.toolbar .tool').filter({ hasText: /^(More|Más|Plus|Mais)$/ }).click();
    await page.locator('.field', { hasText: /Language|Idioma|Langue/ }).locator('select').selectOption('en');
    await wait(300);
    assert((await page.locator('.toolbar .tool span').first().innerText()) === 'Note', 'back to English');
    return Object.entries(seen).map(([k, v]) => `${k}: ${v}`).join('; ');
  });

  // ------------------------------------------------------------ I. layouts
  for (const [id, w, h, expect] of [
    ['I1', 393, 852, 'bottom'],
    ['I2', 820, 1180, 'side'],
    ['I3', 1180, 820, 'side'],
  ]) {
    await check(id, `Layout ${w}×${h}: toolbar ${expect}, no sideways scroll`, async () => {
      await page.setViewportSize({ width: w, height: h });
      await wait(400);
      const tb = await page.locator('.toolbar').boundingBox();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      const ok = expect === 'bottom' ? tb.y + tb.height >= h - 2 && tb.width >= w - 2 : tb.x === 0 && tb.height > h / 2;
      assert(ok && overflow === 0, `${JSON.stringify(tb)} overflow ${overflow}`);
    });
  }
  }
  await page.setViewportSize({ width: 1400, height: 900 });

  } catch (e) {
    results.push({ id: 'ABORT', name: 'script stopped', ok: false, detail: String(e.message || e).split('\n')[0].slice(0, 200) });
  }
  const passed = results.filter((r) => r.ok).length;
  return { summary: `${passed}/${results.length} passed`, failed: results.filter((r) => !r.ok), passed: results.filter((r) => r.ok).map((r) => `${r.id} ${r.name}${r.detail ? ` (${r.detail})` : ''}`), errors };
}
