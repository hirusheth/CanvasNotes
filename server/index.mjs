// Canvas Notes server: a JSON API over a local SQLite file, uploaded files on
// disk, link previews, and the built client (or Vite middleware in --dev).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openStore } from './store.mjs';
import { unfurl } from './unfurl.mjs';
import { buildZip } from './zip.mjs';
import { createAuth, installSecret, LOGIN_PAGE } from './auth.mjs';
import { createBoards } from './boards.mjs';
import { fetchImportable, generateIdeas, searchImages } from './integrations.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT || 5180);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const FILES_DIR = path.join(DATA_DIR, 'files');
const DIST_DIR = path.join(ROOT, 'dist');
const PASSWORD = process.env.CANVASNOTES_PASSWORD || '';
const MAX_UPLOAD = 100 * 1024 * 1024;
const MAX_JSON = 50 * 1024 * 1024;

fs.mkdirSync(FILES_DIR, { recursive: true });
const store = openStore(path.join(DATA_DIR, 'canvasnotes.db'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  const isBuffer = Buffer.isBuffer(body);
  const payload = isBuffer || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': isBuffer || typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json',
    ...headers,
  });
  res.end(payload);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req, MAX_JSON);
  try {
    return JSON.parse(raw.toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

const auth = createAuth({ password: PASSWORD, dataDir: DATA_DIR });
const boards = createBoards({ store, secret: installSecret(DATA_DIR) });
// Files the login page itself needs before signing in.
const PUBLIC_PATHS = new Set(['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.svg']);

// What a signed-out visitor may load: the sign-in page's assets, and published boards.
function isPublicRequest(pathname) {
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/assets/') || pathname.startsWith('/api/public/') || pathname.startsWith('/p/')) return true;
  return pathname.startsWith('/files/') && boards.publishedFiles().has(pathname);
}

function saveUpload(body, name, mime) {
  const ext = (path.extname(name).toLowerCase().match(/^\.[a-z0-9]{1,8}$/) || [''])[0];
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 32);
  const fileName = hash + ext;
  const target = path.join(FILES_DIR, fileName);
  if (!fs.existsSync(target)) fs.writeFileSync(target, body);
  return { url: `/files/${fileName}`, name, size: body.length, mime: mime || MIME[ext] || 'application/octet-stream' };
}

function serveFile(res, filePath, { immutable = false } = {}) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not found');
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// Resolves a request path inside `base`, refusing anything that escapes it.
function safeJoin(base, requestPath) {
  const resolved = path.resolve(base, '.' + path.posix.normalize('/' + decodeURIComponent(requestPath)));
  return resolved.startsWith(base + path.sep) || resolved === base ? resolved : null;
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  switch (route) {
    case 'GET /api/state':
      return send(res, 200, { elements: boards.visible(req), auth: !!auth });
    case 'POST /api/ops': {
      const { ops } = await readJson(req);
      if (!Array.isArray(ops)) return send(res, 400, { error: 'ops must be an array' });
      store.apply(ops);
      return send(res, 200, { ok: true, applied: ops.length });
    }
    case 'POST /api/upload': {
      const name = (url.searchParams.get('name') || 'file').slice(0, 200);
      const body = await readBody(req, MAX_UPLOAD);
      return send(res, 200, saveUpload(body, name, req.headers['content-type']));
    }
    case 'GET /api/image-search':
      return send(res, 200, await searchImages(url.searchParams.get('q')));
    case 'POST /api/import-url': {
      const { url: target } = await readJson(req);
      const { buf, name, mime } = await fetchImportable(target);
      return send(res, 200, saveUpload(buf, name, mime));
    }
    case 'POST /api/ai-ideas': {
      const result = await generateIdeas(await readJson(req));
      return send(res, result.status, result.body);
    }
    case 'POST /api/board-lock':
    case 'POST /api/board-unlock':
    case 'POST /api/board-unlock-remove': {
      const body = await readJson(req);
      const fn = url.pathname.endsWith('remove') ? 'removeLock' : url.pathname.endsWith('unlock') ? 'unlock' : 'lock';
      const result = boards[fn](req, body);
      return send(res, result.status, result.body, result.headers);
    }
    case 'GET /api/unfurl': {
      const target = url.searchParams.get('url') || '';
      return send(res, 200, await unfurl(target));
    }
    case 'GET /api/export':
      return send(
        res,
        200,
        { app: 'canvasnotes', version: 1, exportedAt: new Date().toISOString(), elements: store.all() },
        { 'content-disposition': `attachment; filename="canvasnotes-${new Date().toISOString().slice(0, 10)}.json"` },
      );
    case 'POST /api/import': {
      const { elements, mode } = await readJson(req);
      if (!Array.isArray(elements)) return send(res, 400, { error: 'elements must be an array' });
      store.importAll(elements, mode === 'replace');
      return send(res, 200, { ok: true, imported: elements.length });
    }
    default: {
      const zipMatch = req.method === 'GET' && url.pathname.match(/^\/api\/board-files\/([\w-]+)$/);
      if (zipMatch) return sendBoardZip(res, zipMatch[1], boards.visible(req));
      const pubMatch = req.method === 'GET' && url.pathname.match(/^\/api\/public\/([\w-]+)$/);
      if (pubMatch) {
        const pub = boards.published(pubMatch[1]);
        return pub ? send(res, 200, pub) : send(res, 404, { error: 'This board is no longer published' });
      }
      return send(res, 404, { error: 'Unknown API route' });
    }
  }
}

// Every uploaded image/file on a board and its sub-boards, as one ZIP.
function sendBoardZip(res, boardId, all) {
  const byParent = new Map();
  for (const el of all) {
    if (el.section === 'trash') continue;
    if (!byParent.has(el.parentId)) byParent.set(el.parentId, []);
    byParent.get(el.parentId).push(el);
  }
  const entries = [];
  const used = new Set();
  const walk = (id, prefix, seen) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const el of byParent.get(id) || []) {
      const src = el.type === 'image' || el.type === 'file' ? el.content?.src : null;
      if (src && src.startsWith('/files/')) {
        const file = safeJoin(FILES_DIR, src.slice('/files/'.length));
        if (file && fs.existsSync(file)) {
          const base = (el.type === 'file' ? el.content.name : el.content.caption) || path.basename(file);
          let name = prefix + base.replace(/[\\/:*?"<>|]+/g, '-');
          if (!path.extname(name)) name += path.extname(file);
          let n = 1;
          while (used.has(name)) name = name.replace(/(\.[^.]*)?$/, (ext) => ` (${n++})${ext}`);
          used.add(name);
          entries.push({ name, data: fs.readFileSync(file) });
        }
      }
      if (el.type === 'board') walk(el.id, `${prefix}${(el.content?.title || 'board').replace(/[\\/:*?"<>|]+/g, '-')}/`, seen);
    }
  };
  walk(boardId, '', new Set());
  if (entries.length === 0) return send(res, 404, 'No files found on this board');
  const zip = buildZip(entries);
  res.writeHead(200, {
    'content-type': 'application/zip',
    'content-length': zip.length,
    'content-disposition': `attachment; filename="canvasnotes-files-${boardId}.zip"`,
  });
  res.end(zip);
}

let vite = null;
if (DEV) {
  const { createServer } = await import('vite');
  vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  try {
    if (auth) {
      if (req.method === 'POST' && url.pathname === '/api/login') {
        const { password } = await readJson(req);
        const result = auth.login(req, password);
        return send(res, result.status, result.body, result.headers);
      }
      if (req.method === 'POST' && url.pathname === '/api/logout') return send(res, 200, { ok: true }, auth.logoutHeaders());
      if (!auth.isAuthed(req) && !isPublicRequest(url.pathname)) {
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/')) return send(res, 401, { error: 'Sign in required' });
        return send(res, 200, LOGIN_PAGE, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      }
    }
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/files/')) {
      const file = safeJoin(FILES_DIR, url.pathname.slice('/files/'.length));
      return file ? serveFile(res, file, { immutable: true }) : send(res, 404, 'Not found');
    }
    if (vite) return vite.middlewares(req, res, () => send(res, 404, 'Not found'));
    const file = url.pathname === '/' ? null : safeJoin(DIST_DIR, url.pathname);
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return serveFile(res, file, { immutable: url.pathname.startsWith('/assets/') });
    }
    if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
      return send(res, 500, 'Client not built. Run `npm run build` first, or use `npm run dev`.');
    }
    return serveFile(res, path.join(DIST_DIR, 'index.html'));
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) send(res, status, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Canvas Notes ${DEV ? '(dev) ' : ''}running at http://${HOST}:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  const local = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
  if (!local && !PASSWORD) {
    console.warn('WARNING: listening on the network without CANVASNOTES_PASSWORD — anyone who can reach this port can read and edit your notes.');
  }
});

function shutdown() {
  server.close();
  vite?.close();
  store.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
