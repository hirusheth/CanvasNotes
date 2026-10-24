// Fetches a page's title, description and preview image for link cards.
const TIMEOUT_MS = 6000;
const MAX_BYTES = 1024 * 1024;

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .trim();
}

function metaContent(html, keys) {
  for (const key of keys) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i'),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1].trim()) return decodeEntities(m[1]);
    }
  }
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
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; CanvasNotes/0.1; link preview)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !type.includes('html')) return fallback;
    const html = await readLimited(response);
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
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
