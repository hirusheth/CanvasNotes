// Converts the HTML that TipTap produces into Markdown, for document and
// board exports. Handles the node types the editor can create.

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replace(/([*_`])/g, '\\$1');
  if (!(node instanceof HTMLElement)) return '';
  const inner = [...node.childNodes].map(inline).join('');
  switch (node.tagName) {
    case 'STRONG':
    case 'B':
      return inner.trim() ? `**${inner}**` : inner;
    case 'EM':
    case 'I':
      return inner.trim() ? `*${inner}*` : inner;
    case 'S':
    case 'DEL':
      return `~~${inner}~~`;
    case 'CODE':
      return '`' + (node.textContent || '') + '`';
    case 'MARK':
      return `==${inner}==`;
    case 'A':
      return `[${inner}](${node.getAttribute('href') || ''})`;
    case 'BR':
      return '  \n';
    default:
      return inner;
  }
}

function block(node: Node, depth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').trim() ? inline(node) + '\n\n' : '';
  if (!(node instanceof HTMLElement)) return '';
  const pad = '  '.repeat(depth);
  switch (node.tagName) {
    case 'H1':
      return `# ${inline(node)}\n\n`;
    case 'H2':
      return `## ${inline(node)}\n\n`;
    case 'H3':
      return `### ${inline(node)}\n\n`;
    case 'P':
      return `${inline(node)}\n\n`;
    case 'HR':
      return '---\n\n';
    case 'PRE':
      return '```\n' + (node.textContent || '') + '\n```\n\n';
    case 'BLOCKQUOTE':
      return (
        [...node.childNodes]
          .map((c) => block(c))
          .join('')
          .trim()
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n') + '\n\n'
      );
    case 'UL':
    case 'OL': {
      const ordered = node.tagName === 'OL';
      const task = node.getAttribute('data-type') === 'taskList';
      const items = [...node.children].map((li, i) => {
        const checked = li.getAttribute('data-checked') === 'true';
        const marker = task ? `- [${checked ? 'x' : ' '}]` : ordered ? `${i + 1}.` : '-';
        const parts: string[] = [];
        const nested: string[] = [];
        li.querySelectorAll(':scope > p, :scope > div > p').forEach((p) => parts.push(inline(p)));
        li.querySelectorAll(':scope > ul, :scope > ol, :scope > div > ul, :scope > div > ol').forEach((l) => nested.push(block(l, depth + 1)));
        const text = parts.length ? parts.join(' ') : inline(li);
        return `${pad}${marker} ${text}\n${nested.join('')}`;
      });
      return items.join('') + (depth === 0 ? '\n' : '');
    }
    case 'DIV':
      if (node.hasAttribute('data-callout')) {
        const body = [...node.childNodes].map((c) => block(c)).join('').trim();
        return body.split('\n').map((l) => `> ${l}`).join('\n').replace(/^> /, '> **Note:** ') + '\n\n';
      }
      return [...node.childNodes].map((c) => block(c, depth)).join('');
    default:
      return inline(node) + '\n\n';
  }
}

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return [...doc.body.childNodes]
    .map((n) => block(n))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A Word-compatible document: Word opens HTML saved with the msword type.
export function htmlToWordDoc(title: string, html: string) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${title}</title></head><body>${html}</body></html>`;
}

export function safeFileName(name: string) {
  return (name || 'untitled').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80).trim() || 'untitled';
}

export function printHtml(title: string, html: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#222}img{max-width:100%}pre{background:#f4f4f4;padding:10px;border-radius:6px}blockquote{border-left:3px solid #ccc;margin:0;padding-left:12px;color:#555}[data-callout]{background:#fff6d6;padding:8px 12px;border-radius:6px}</style></head><body>${html}<script>window.onload=()=>{window.print()}<\/script></body></html>`,
  );
  w.document.close();
}
