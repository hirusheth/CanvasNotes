// External services: Wikimedia Commons image search (no key needed) and the
// optional "AI Ideas" brainstorm, which uses Claude when an API key is set.

const UA = 'CanvasNotes/0.2 (personal notes app; image search)';

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export async function searchImages(query) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return { results: [] };
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${q}`,
    gsrnamespace: '6',
    gsrlimit: '30',
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata|mime',
    iiurlwidth: '400',
  }).toString();
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) return { results: [], error: 'Image search is unavailable right now' };
  const data = await res.json();
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return {
    results: pages
      .map((p) => {
        const info = p.imageinfo?.[0];
        if (!info || !/^image\//.test(info.mime || '')) return null;
        const meta = info.extmetadata || {};
        return {
          title: p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''),
          thumb: info.thumburl,
          url: info.width > 1600 ? info.thumburl.replace(/\/\d+px-/, '/1600px-') : info.url,
          page: info.descriptionurl,
          author: stripHtml(meta.Artist?.value).slice(0, 80),
          license: stripHtml(meta.LicenseShortName?.value),
          ratio: info.width ? info.height / info.width : null,
        };
      })
      .filter(Boolean),
  };
}

// Downloads an image chosen from search into the uploads folder. Only Wikimedia's
// file host is allowed, so this can't be used to make the server fetch arbitrary URLs.
export async function fetchImportable(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error('Invalid URL'), { status: 400 });
  }
  if (url.protocol !== 'https:' || url.hostname !== 'upload.wikimedia.org') throw Object.assign(new Error('Only Wikimedia Commons images can be imported'), { status: 400 });
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.startsWith('image/')) throw Object.assign(new Error('Could not download that image'), { status: 502 });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 25 * 1024 * 1024) throw Object.assign(new Error('Image too large'), { status: 413 });
  const name = decodeURIComponent(url.pathname.split('/').pop() || 'image');
  return { buf, name, mime: type };
}

const IDEAS_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A short heading for the set of ideas' },
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, detail: { type: 'string' } },
        required: ['title', 'detail'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'ideas'],
  additionalProperties: false,
};

// POST /api/ai-ideas { prompt, context } → { title, ideas: [{ title, detail }] }
export async function generateIdeas({ prompt, context }) {
  const topic = String(prompt || '').trim().slice(0, 2000);
  if (!topic) return { status: 400, body: { error: 'Describe what you want ideas for' } };
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    return { status: 501, body: { error: 'AI Ideas needs the @anthropic-ai/sdk package installed on the server' } };
  }
  const client = new Anthropic();
  const notes = Array.isArray(context) ? context.map((c) => String(c).slice(0, 500)).slice(0, 30) : [];
  try {
    // fallbacks: "default" re-runs a declined request on a suitable model inside the same call.
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: IDEAS_SCHEMA } },
      system:
        'You help someone brainstorm on a visual notes board. Give 6 to 10 distinct, concrete ideas. Each has a short title (under 8 words) and one or two sentences of detail. Match the language of the request.',
      messages: [
        {
          role: 'user',
          content: notes.length ? `What I'm working on:\n${topic}\n\nNotes already on the board:\n- ${notes.join('\n- ')}` : topic,
        },
      ],
    });
    if (response.stop_reason === 'refusal') return { status: 422, body: { error: "Claude couldn't help with that request" } };
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) return { status: 502, body: { error: 'No ideas came back' } };
    return { status: 200, body: JSON.parse(text) };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || /api key|credential|auth/i.test(String(err?.message))) {
      return { status: 501, body: { error: 'AI Ideas is off. Set ANTHROPIC_API_KEY on the server to turn it on.' } };
    }
    if (err instanceof Anthropic.RateLimitError) return { status: 429, body: { error: 'Claude is rate-limited. Try again shortly.' } };
    if (err instanceof Anthropic.APIError) return { status: 502, body: { error: `Claude API error (${err.status})` } };
    if (err instanceof SyntaxError) return { status: 502, body: { error: 'Could not read the ideas Claude returned' } };
    throw err;
  }
}
