// Accounts: email + password sign-up and sign-in, with a session cookie per
// browser. Cookies (unlike HTTP Basic auth) keep working in iOS home-screen apps.
// Only a SHA-256 of each session token is stored, so a copy of the database
// can't be used to sign in.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
// scrypt cost: 2^15 × 8 × 128 bytes = 32 MB and ~50 ms per hash.
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const COOKIE = 'cn_sid';
const MAX_AGE = 60 * 60 * 24 * 365; // one year, in seconds
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

// A per-install secret for signing cookies that aren't sessions (unlocked boards).
export function installSecret(dataDir) {
  const secretFile = path.join(dataDir, '.session-secret');
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(secretFile, 'utf8').trim();
}

const fail = (status, error) => ({ status, body: { error } });
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const key = await scrypt(String(password).normalize('NFKC'), salt, 64, SCRYPT);
  return { salt, hash: key.toString('hex') };
}

async function passwordMatches(user, password) {
  const { hash } = await hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// A fixed-size sliding window per key (an IP address or an email).
export function rateLimiter(max, windowMs) {
  const hits = new Map();
  // Old keys are dropped now and then, so millions of random emails or IPs can't fill memory.
  let lastSweep = Date.now();
  const sweep = () => {
    const now = Date.now();
    if (now - lastSweep < windowMs && hits.size < 10000) return;
    lastSweep = now;
    for (const [key, list] of hits) if (!list.some((t) => now - t < windowMs)) hits.delete(key);
  };
  return {
    get size() {
      return hits.size;
    },
    blocked(key) {
      const now = Date.now();
      const list = hits.get(key);
      if (!list) return false;
      const recent = list.filter((t) => now - t < windowMs);
      if (recent.length) hits.set(key, recent);
      else hits.delete(key);
      return recent.length >= max;
    },
    hit(key) {
      sweep();
      const list = hits.get(key) || [];
      list.push(Date.now());
      hits.set(key, list);
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

export function cookieOf(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

// options: { signups: 'open' | 'closed', inviteCode, trustProxy, legacyFiles(): [{name, size}] }
export function createAccounts(store, options = {}) {
  const loginByIp = rateLimiter(10, 15 * 60 * 1000);
  const loginByEmail = rateLimiter(10, 15 * 60 * 1000);
  const signupByIp = rateLimiter(10, 60 * 60 * 1000);
  const sensitive = rateLimiter(10, 15 * 60 * 1000); // password checks while signed in

  const clientIp = (req) =>
    (options.trustProxy && (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
  const secure = (req) => req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted;
  const sessionCookie = (req, token) =>
    `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure(req) ? '; Secure' : ''}`;
  const clearCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
  const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });

  function startSession(req, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    store.createSession(tokenHash(token), userId, MAX_AGE * 1000);
    return sessionCookie(req, token);
  }

  // Whether a new account may be created right now (the first one always may, so
  // a fresh install with sign-ups closed can still create its owner).
  const signupsOpen = () => options.signups !== 'closed' || store.userCount() === 0;

  return {
    signupInfo: () => ({ open: signupsOpen(), invite: !!options.inviteCode }),

    // The signed-in user for this request, or null.
    userOf(req) {
      const token = cookieOf(req, COOKIE);
      if (!token || token.length > 100) return null;
      return store.sessionUser(tokenHash(token));
    },

    async signup(req, { email, password, name, invite } = {}) {
      const ip = clientIp(req);
      if (signupByIp.blocked(ip)) return fail(429, 'Too many new accounts from here. Try again later.');
      if (!signupsOpen()) return fail(403, 'Sign-ups are closed on this server.');
      if (options.inviteCode && store.userCount() > 0) {
        const a = crypto.createHash('sha256').update(String(invite ?? '')).digest();
        const b = crypto.createHash('sha256').update(options.inviteCode).digest();
        if (!crypto.timingSafeEqual(a, b)) return fail(403, 'That invite code is not valid.');
      }
      email = String(email ?? '').trim().toLowerCase();
      name = String(name ?? '').trim().slice(0, 80);
      if (email.length > 254 || !EMAIL_RE.test(email)) return fail(400, 'Enter a valid email address.');
      if (typeof password !== 'string' || password.length < MIN_PASSWORD) return fail(400, `Use at least ${MIN_PASSWORD} characters for your password.`);
      if (password.length > 200) return fail(400, 'That password is too long.');
      if (store.userByEmail(email)) return fail(409, 'An account with this email already exists. Sign in instead.');
      signupByIp.hit(ip);
      const { salt, hash } = await hashPassword(password);
      const id = crypto.randomUUID();
      try {
        store.createUser({ id, email, name, salt, hash }, { claimLegacy: true, legacyFiles: options.legacyFiles?.() ?? [] });
      } catch (err) {
        // Two sign-ups for the same email at once: the unique index rejects the second.
        if (/UNIQUE/.test(String(err.message))) return fail(409, 'An account with this email already exists. Sign in instead.');
        throw err;
      }
      return { status: 200, body: { ok: true, user: { id, email, name } }, headers: { 'set-cookie': startSession(req, id) } };
    },

    async login(req, { email, password } = {}) {
      const ip = clientIp(req);
      email = String(email ?? '').trim().toLowerCase();
      if (loginByIp.blocked(ip) || loginByEmail.blocked(email)) return fail(429, 'Too many attempts. Try again in a few minutes.');
      const user = store.userByEmail(email);
      // Hash even for unknown emails, so timing doesn't reveal which emails have accounts.
      const ok = user ? await passwordMatches(user, password ?? '') : (await hashPassword(String(password ?? '')), false);
      if (!ok) {
        loginByIp.hit(ip);
        loginByEmail.hit(email);
        return fail(401, 'Wrong email or password.');
      }
      loginByEmail.reset(email);
      return { status: 200, body: { ok: true, user: publicUser(user) }, headers: { 'set-cookie': startSession(req, user.id) } };
    },

    logout(req) {
      const token = cookieOf(req, COOKIE);
      if (token) store.deleteSession(tokenHash(token));
      return { status: 200, body: { ok: true }, headers: { 'set-cookie': clearCookie } };
    },

    updateProfile(user, { name } = {}) {
      store.setName(user.id, String(name ?? '').trim().slice(0, 80));
      return { status: 200, body: { ok: true } };
    },

    // Signs out every other browser; this one stays signed in.
    async changePassword(req, user, { current, next } = {}) {
      if (sensitive.blocked(user.id)) return fail(429, 'Too many attempts. Try again in a few minutes.');
      const full = store.userById(user.id);
      if (!(await passwordMatches(full, current ?? ''))) {
        sensitive.hit(user.id);
        return fail(401, 'Your current password is incorrect.');
      }
      if (typeof next !== 'string' || next.length < MIN_PASSWORD) return fail(400, `Use at least ${MIN_PASSWORD} characters for your password.`);
      if (next.length > 200) return fail(400, 'That password is too long.');
      const { salt, hash } = await hashPassword(next);
      store.setPassword(user.id, salt, hash);
      store.deleteOtherSessions(user.id, tokenHash(cookieOf(req, COOKIE)));
      return { status: 200, body: { ok: true } };
    },

    // Returns the uploaded file names that no other account uses (safe to delete from disk).
    async deleteAccount(req, user, { password } = {}) {
      if (sensitive.blocked(user.id)) return fail(429, 'Too many attempts. Try again in a few minutes.');
      const full = store.userById(user.id);
      if (!(await passwordMatches(full, password ?? ''))) {
        sensitive.hit(user.id);
        return fail(401, 'Your password is incorrect.');
      }
      const orphans = store.deleteUser(user.id);
      return { status: 200, body: { ok: true }, headers: { 'set-cookie': clearCookie }, orphans };
    },

    // For the command-line reset (there's no email service to send reset links).
    async resetPassword(email, next) {
      const user = store.userByEmail(String(email).trim().toLowerCase());
      if (!user) return false;
      const { salt, hash } = await hashPassword(next);
      store.setPassword(user.id, salt, hash);
      store.deleteOtherSessions(user.id, '');
      return true;
    },
  };
}
