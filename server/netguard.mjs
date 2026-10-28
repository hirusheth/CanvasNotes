// Outbound fetches on behalf of users (link previews). Refuses private,
// loopback and link-local addresses, so a link card can't be used to read the
// server's own network (routers, cloud metadata, other local services).
// The address is checked when the connection is made (not in a separate DNS
// lookup first), so a hostname can't pass the check and then resolve to a
// private address. Redirects are followed by hand so every hop is checked.
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';

const MAX_REDIRECTS = 5;

function privateV4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) return privateV4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) || v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    if (mapped.length === 2) return privateV4(mapped[1]);
    const n = (parseInt(mapped[1], 16) << 16) | parseInt(mapped[2], 16);
    return privateV4([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
  }
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff') || v6.startsWith('64:ff9b:');
}

const blocked = () => Object.assign(new Error('That address is not reachable from here'), { code: 'EBLOCKED' });

// dns.lookup with every answer checked; used by the socket itself.
function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) return callback(blocked());
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

function request(url, { headers = {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && isPrivateAddress(host)) return reject(blocked());
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, { headers, signal, lookup: guardedLookup, agent: false }, resolve);
    req.on('error', reject);
    req.end();
  });
}

// A small fetch(): returns a standard Response whose `url` is the final address.
export async function publicFetch(input, { headers, signal } = {}) {
  let url = new URL(input);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!/^https?:$/.test(url.protocol)) throw new Error('Only http(s) links are supported');
    const res = await request(url, { headers, signal });
    const location = res.statusCode >= 300 && res.statusCode < 400 && res.headers.location;
    if (location) {
      res.resume();
      url = new URL(location, url);
      continue;
    }
    const responseHeaders = new Headers();
    for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) responseHeaders.set(k, Array.isArray(v) ? v.join(', ') : String(v));
    const body = [204, 304].includes(res.statusCode) ? null : Readable.toWeb(res);
    const response = new Response(body, { status: res.statusCode, headers: responseHeaders });
    return Object.defineProperty(response, 'url', { value: url.href });
  }
  throw new Error('Too many redirects');
}
