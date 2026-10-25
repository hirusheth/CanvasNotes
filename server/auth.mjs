// Password login for a hosted, single-user install. When CANVASNOTES_PASSWORD
// is set, every request needs a signed session cookie obtained from the login
// page. Cookies (unlike HTTP Basic auth) keep working in iOS home-screen apps.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const COOKIE = 'cn_session';
const MAX_AGE = 60 * 60 * 24 * 365; // one year
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

// A per-install secret, so signed cookies can't be forged from the password alone.
export function installSecret(dataDir) {
  const secretFile = path.join(dataDir, '.session-secret');
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(secretFile, 'utf8').trim();
}

export function createAuth({ password, dataDir }) {
  if (!password) return null;
  const secret = installSecret(dataDir);
  // Changing the password changes the key, which signs everyone out.
  const key = crypto.createHmac('sha256', secret).update(password).digest();
  const attempts = new Map();

  const sign = (payload) => crypto.createHmac('sha256', key).update(payload).digest('base64url');
  const issue = () => {
    const payload = `v1.${Math.floor(Date.now() / 1000) + MAX_AGE}`;
    return `${payload}.${sign(payload)}`;
  };
  const valid = (token) => {
    const parts = (token || '').split('.');
    if (parts.length !== 3) return false;
    const payload = `${parts[0]}.${parts[1]}`;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(parts[2]);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given) && Number(parts[1]) > Date.now() / 1000;
  };
  const cookieOf = (req) => {
    for (const part of (req.headers.cookie || '').split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === COOKIE) return v.join('=');
    }
    return null;
  };
  const secure = (req) => req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';

  return {
    isAuthed: (req) => valid(cookieOf(req)),
    // Returns { ok, status, headers, body } for POST /api/login.
    login(req, given) {
      const ip = clientIp(req);
      const now = Date.now();
      const recent = (attempts.get(ip) || []).filter((t) => now - t < WINDOW_MS);
      if (recent.length >= MAX_ATTEMPTS) return { status: 429, body: { error: 'Too many attempts. Try again in a few minutes.' } };
      const a = crypto.createHash('sha256').update(String(given ?? '')).digest();
      const b = crypto.createHash('sha256').update(password).digest();
      if (!crypto.timingSafeEqual(a, b)) {
        recent.push(now);
        attempts.set(ip, recent);
        return { status: 401, body: { error: 'Wrong password' } };
      }
      attempts.delete(ip);
      const cookie = `${COOKIE}=${issue()}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure(req) ? '; Secure' : ''}`;
      return { status: 200, headers: { 'set-cookie': cookie }, body: { ok: true } };
    },
    logoutHeaders: () => ({ 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` }),
  };
}

export const LOGIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark"><title>Canvas Notes · Sign in</title>
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon-192.png">
<style>
:root{--bg:#eeece8;--card:#fff;--text:#24262b;--muted:#6b7079;--accent:#3a7bd5;--danger:#d6455d}
@media (prefers-color-scheme:dark){:root{--bg:#1b1c1f;--card:#2a2c31;--text:#e7e8ea;--muted:#a8acb4;--accent:#6aa3f0}}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
form{background:var(--card);padding:28px;border-radius:14px;width:min(360px,100%);box-shadow:0 10px 30px rgba(0,0,0,.12)}
h1{font-size:20px;margin:12px 0 4px}p{margin:0 0 18px;color:var(--muted)}
input{width:100%;font:inherit;padding:12px;border-radius:8px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;margin-bottom:12px}
button{width:100%;font:inherit;font-weight:600;padding:12px;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer}
.err{color:var(--danger);min-height:1.5em;margin:4px 0 0;font-size:14px}
</style></head><body>
<form id="f"><svg viewBox="0 0 32 32" width="40" height="40"><rect x="3" y="5" width="12" height="16" rx="2.5" fill="#f4c95d"/><rect x="17" y="9" width="12" height="18" rx="2.5" fill="#61a5c2"/></svg>
<h1>Canvas Notes</h1><p>Enter your password to open your boards.</p>
<input id="p" type="password" autocomplete="current-password" placeholder="Password" autofocus required>
<button>Sign in</button><div class="err" id="e"></div></form>
<script>
document.getElementById('f').onsubmit=async(ev)=>{ev.preventDefault();const e=document.getElementById('e');e.textContent='';
const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:document.getElementById('p').value})});
if(r.ok)location.reload();else{const d=await r.json().catch(()=>({}));e.textContent=d.error||'Sign-in failed';}};
</script></body></html>`;
