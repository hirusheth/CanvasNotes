// Board-level features that need the server's authority: password-protected
// boards (contents are withheld until unlocked) and read-only public links.
// Everything is per account: `userId` is the signed-in user (or, for a public
// link, the board's owner).
import crypto from 'node:crypto';

const UNLOCK_COOKIE = 'cn_unlocked';

function cookieValue(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

export function createBoards({ store, secret }) {
  const attempts = new Map();
  const sign = (id, lock) => crypto.createHmac('sha256', secret).update(`${id}:${lock.hash}`).digest('base64url').slice(0, 22);
  const hashPassword = (password, salt) => crypto.scryptSync(String(password), salt, 32).toString('hex');

  const verify = (lock, password) => {
    const given = Buffer.from(hashPassword(password, lock.salt), 'hex');
    const stored = Buffer.from(lock.hash, 'hex');
    return given.length === stored.length && crypto.timingSafeEqual(given, stored);
  };

  // Board ids this browser has unlocked (a session cookie of signed ids).
  const unlockedFor = (req, locks) => {
    const ids = new Set();
    for (const entry of cookieValue(req, UNLOCK_COOKIE).split(',')) {
      const [id, sig] = entry.split('.');
      const lock = id && locks.get(id);
      if (lock && sig === sign(id, lock)) ids.add(id);
    }
    return ids;
  };

  const unlockCookie = (req, locks, addId) => {
    const ids = unlockedFor(req, locks);
    if (addId) ids.add(addId);
    const value = [...ids].filter((id) => locks.has(id)).map((id) => `${id}.${sign(id, locks.get(id))}`).join(',');
    // No Max-Age: protected boards lock again when the browser closes, like Milanote.
    const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '';
    return `${UNLOCK_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${secure}`;
  };

  // Everything below a set of boards (sub-boards included).
  const descendants = (elements, roots) => {
    const byParent = new Map();
    for (const el of elements) {
      if (!byParent.has(el.parentId)) byParent.set(el.parentId, []);
      byParent.get(el.parentId).push(el);
    }
    const out = new Set();
    const queue = [...roots];
    while (queue.length) {
      const id = queue.pop();
      for (const child of byParent.get(id) || []) {
        if (out.has(child.id)) continue;
        out.add(child.id);
        queue.push(child.id);
      }
    }
    return out;
  };

  let filesCache = { version: -1, files: new Set() };

  // Wrong board passwords, counted per account.
  const limited = (req, userId) => {
    const now = Date.now();
    const recent = (attempts.get(userId) || []).filter((t) => now - t < 15 * 60 * 1000);
    attempts.set(userId, recent);
    return { blocked: recent.length >= 10, fail: () => recent.push(now) };
  };

  return {
    // The elements this request may see, with protected boards marked.
    visible(req, userId, elements = store.all(userId)) {
      const locks = store.locks(userId);
      if (locks.size === 0) return elements;
      const unlocked = unlockedFor(req, locks);
      const lockedRoots = [...locks.keys()].filter((id) => !unlocked.has(id));
      const hidden = descendants(elements, lockedRoots);
      return elements
        .filter((el) => !hidden.has(el.id))
        .map((el) => (locks.has(el.id) ? { ...el, content: { ...el.content, protected: true, unlocked: unlocked.has(el.id) } } : el));
    },

    // POST /api/board-lock { id, password } — add or change a board's password.
    lock(req, userId, { id, password } = {}) {
      if (!id || typeof id !== 'string' || typeof password !== 'string' || password.length < 1) return { status: 400, body: { error: 'Board and password required' } };
      const locks = store.locks(userId);
      if (locks.has(id) && !unlockedFor(req, locks).has(id)) return { status: 403, body: { error: 'Unlock the board first' } };
      const salt = crypto.randomBytes(16).toString('hex');
      store.setLock(userId, id, salt, hashPassword(password, salt));
      const after = store.locks(userId);
      return { status: 200, body: { ok: true }, headers: { 'set-cookie': unlockCookie(req, after, id) } };
    },

    // POST /api/board-unlock { id, password }
    unlock(req, userId, { id, password } = {}) {
      const rate = limited(req, userId);
      if (rate.blocked) return { status: 429, body: { error: 'Too many attempts. Try again in a few minutes.' } };
      const locks = store.locks(userId);
      const lock = locks.get(id);
      if (!lock) return { status: 404, body: { error: 'This board has no password' } };
      if (!verify(lock, password)) {
        rate.fail();
        return { status: 401, body: { error: 'The password is incorrect' } };
      }
      return { status: 200, body: { ok: true }, headers: { 'set-cookie': unlockCookie(req, locks, id) } };
    },

    // POST /api/board-unlock-remove { id, password } — remove protection.
    removeLock(req, userId, { id, password } = {}) {
      const rate = limited(req, userId);
      if (rate.blocked) return { status: 429, body: { error: 'Too many attempts. Try again in a few minutes.' } };
      const locks = store.locks(userId);
      const lock = locks.get(id);
      if (!lock) return { status: 200, body: { ok: true } };
      if (!verify(lock, password)) {
        rate.fail();
        return { status: 401, body: { error: 'The password is incorrect' } };
      }
      store.removeLock(userId, id);
      return { status: 200, body: { ok: true } };
    },

    // GET /api/public/:token — a published board, read-only, without signing in.
    published(token) {
      const owner = token ? store.publisherOf(token) : null;
      if (owner === null) return null;
      const all = store.all(owner);
      const board = all.find((el) => el.type === 'board' && el.section !== 'trash' && el.content?.publicToken === token);
      if (!board) return null;
      const locks = store.locks(owner);
      const lockedInside = [...locks.keys()];
      const hidden = descendants(all, lockedInside);
      const inside = descendants(all, [board.id]);
      const elements = all.filter((el) => (el.id === board.id || inside.has(el.id)) && !hidden.has(el.id) && el.section === 'canvas' && el.type !== 'label');
      return { board: board.id, elements };
    },

    // Uploaded files referenced by published boards may be fetched without signing in.
    // Recomputed only after something was saved.
    publishedFiles() {
      if (filesCache.version === store.version) return filesCache.files;
      const files = new Set();
      for (const owner of store.publishers()) {
        for (const el of store.all(owner)) {
          if (el.type !== 'board' || !el.content?.publicToken || el.section === 'trash') continue;
          const pub = this.published(el.content.publicToken);
          for (const item of pub?.elements || []) {
            for (const src of [item.content?.src, item.content?.background, item.content?.iconImage, item.content?.image]) {
              if (typeof src === 'string' && src.startsWith('/files/')) files.add(src);
            }
          }
        }
      }
      filesCache = { version: store.version, files };
      return files;
    },
  };
}
