// Canvas Notes server: a JSON API over a local SQLite file, uploaded files on
// disk, link previews, and the built client (or Vite middleware in --dev).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openStore } from './store.mjs';
import { unfurl } from './unfurl.mjs';

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

function authorized(req) {
  if (!PASSWORD) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const [, pass = ''] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(/:(.*)/s);
  const a = Buffer.from(pass);
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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
      return send(res, 200, { elements: store.all() });
    case 'POST /api/ops': {
      const { ops } = await readJson(req);
      if (!Array.isArray(ops)) return send(res, 400, { error: 'ops must be an array' });
      store.apply(ops);
      return send(res, 200, { ok: true, applied: ops.length });
    }
    case 'POST /api/upload': {
      const name = (url.searchParams.get('name') || 'file').slice(0, 200);
      const body = await readBody(req, MAX_UPLOAD);
      const ext = (path.extname(name).toLowerCase().match(/^\.[a-z0-9]{1,8}$/) || [''])[0];
      const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 32);
      const fileName = hash + ext;
      const target = path.join(FILES_DIR, fileName);
      if (!fs.existsSync(target)) fs.writeFileSync(target, body);
      return send(res, 200, {
        url: `/files/${fileName}`,
        name,
        size: body.length,
        mime: req.headers['content-type'] || MIME[ext] || 'application/octet-stream',
      });
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
    default:
      return send(res, 404, { error: 'Unknown API route' });
  }
}

let vite = null;
if (DEV) {
  const { createServer } = await import('vite');
  vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!authorized(req)) {
    return send(res, 401, 'Authentication required', { 'www-authenticate': 'Basic realm="Canvas Notes"' });
  }
  try {
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
});

function shutdown() {
  server.close();
  vite?.close();
  store.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
