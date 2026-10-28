// Fetches a page's title, description and preview image for link cards.
import { publicFetch } from './netguard.mjs';

const TIMEOUT_MS = 6000;
const MAX_BYTES = 1024 * 1024;

const codePoint = (n) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d{1,7});/g, (_, n) => codePoint(Number(n)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n) => codePoint(parseInt(n, 16)))
    .trim();
}

// Meta tags are read one bounded tag at a time: a single regex across the whole
// page could backtrack for minutes on a crafted page and stall the server.
export function metaContent(html, keys) {
  const found = new Map();
  for (const [tag] of html.matchAll(/<meta\b[^>]{0,4000}>/gi)) {
    const attrs = {};
    for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1].toLowerCase()] = m[2] ?? m[3];
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content?.trim() && !found.has(key)) found.set(key, attrs.content);
  }
  for (const key of keys) if (found.has(key)) return decodeEntities(found.get(key));
  return null;
}

async function readLimited(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString('utf8');
}

export async function unfurl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (!/^https?:$/.test(url.protocol)) return { ok: false, error: 'Only http(s) links are supported' };

  const fallback = { ok: false, url: url.href, site: url.hostname.replace(/^www\./, '') };
  try {
    const response = await publicFetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; CanvasNotes/0.1; link preview)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !type.includes('html')) return fallback;
    const html = await readLimited(response);
    const titleTag = html.match(/<title[^>]{0,200}>([^<]{0,2000})<\/title>/i);
    const image = metaContent(html, ['og:image', 'twitter:image', 'twitter:image:src']);
    let imageUrl = null;
    if (image) {
      try {
        imageUrl = new URL(image, response.url).href;
      } catch {}
    }
    return {
      ok: true,
      url: url.href,
      site: metaContent(html, ['og:site_name']) || fallback.site,
      title: metaContent(html, ['og:title', 'twitter:title']) || (titleTag ? decodeEntities(titleTag[1]) : null),
      description: metaContent(html, ['og:description', 'twitter:description', 'description']),
      image: imageUrl,
    };
  } catch {
    return fallback;
  }
}
