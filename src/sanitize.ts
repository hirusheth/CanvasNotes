// Every piece of stored HTML can come from someone else (a shared or published
// board, an imported backup), so it is cleaned before it reaches the page.
import DOMPurify from 'dompurify';

const SAFE_URL = /^(?:https?:|mailto:|tel:|\/(?!\/)|#|\.{0,2}\/)/i;

// A URL that is safe to open or link to: web, mail and in-app links only (no
// javascript:, data: or other schemes that could run code in this site).
export function safeUrl(raw: string | null | undefined): string | null {
  const url = String(raw ?? '').trim();
  return url && SAFE_URL.test(url) ? url : null;
}

// The inline styles the editor writes (text colour, highlight, alignment, font,
// indent). Anything else, like position: fixed, could draw over the app.
const STYLE_PROPS = new Set(['color', 'background-color', 'text-align', 'font-family', 'font-size', 'margin-left']);
function cleanStyle(style: string): string {
  return style
    .split(';')
    .map((decl) => decl.trim())
    .filter((decl) => {
      const i = decl.indexOf(':');
      if (i < 0) return false;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const value = decl.slice(i + 1);
      return STYLE_PROPS.has(prop) && !/url\(|expression|[<>\\]|@import/i.test(value);
    })
    .join('; ');
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const style = node.getAttribute('style');
  if (style !== null) {
    const clean = cleanStyle(style);
    if (clean) node.setAttribute('style', clean);
    else node.removeAttribute('style');
  }
  // Checklists render a checkbox; any other input becomes an inert checkbox
  // (elements are never removed inside a hook, which DOMPurify warns against).
  if (node.tagName === 'INPUT' && node.getAttribute('type') !== 'checkbox') {
    node.setAttribute('type', 'checkbox');
    node.setAttribute('disabled', '');
  }
  if (node.tagName === 'A') {
    const href = node.getAttribute('href');
    if (href !== null && !safeUrl(href)) node.removeAttribute('href');
    if (node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer');
  }
  for (const attr of ['src', 'srcset']) {
    const value = node.getAttribute(attr);
    // Images may be uploads, web images or inline data images; nothing else.
    if (value !== null && !/^(?:https?:|\/(?!\/)|data:image\/(?:png|jpe?g|gif|webp|avif);)/i.test(value.trim())) node.removeAttribute(attr);
  }
});

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'svg', 'math'],
    ALLOW_DATA_ATTR: true,
  });
}

// Plain text of stored HTML without letting the browser load or run anything in it.
export function htmlToTextSafe(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return doc.body.textContent || '';
}

export function escapeHtml(text: string): string {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
