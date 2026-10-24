// User-level operations shared by the toolbar, keyboard, menus and canvas.
import * as api from './api';
import {
  addElements,
  columnOrderAt,
  commit,
  getState,
  makeElement,
  maxZ,
  patchElement,
  setState,
  toast,
  uid,
  dependents,
} from './store';
import { COLUMN_CHILD_TYPES, type El, type ElementType } from './types';
import { allRects, contains, viewCenter } from './viewport';

export interface Placement {
  x: number;
  y: number;
  columnId?: string | null;
  index?: number;
}

// Where a new element lands: at a canvas point, or inside a column.
function place(type: ElementType, at: Placement) {
  if (at.columnId && COLUMN_CHILD_TYPES.includes(type)) {
    return { columnId: at.columnId, order: columnOrderAt(at.columnId, at.index ?? Infinity), x: 0, y: 0 };
  }
  return { columnId: null, x: Math.round(at.x), y: Math.round(at.y) };
}

let cascade = 0;
// A point near the middle of the view, nudged so repeated clicks don't stack exactly.
export function centerPlacement(): Placement {
  const c = viewCenter();
  cascade = (cascade + 1) % 6;
  return { x: c.x - 135 + cascade * 24, y: c.y - 80 + cascade * 24 };
}

// Finds the column (if any) under a world point, for dropping new things into it.
export function columnAt(point: { x: number; y: number }, exclude: string[] = []): { id: string; index: number } | null {
  const { elements, boardId } = getState();
  const rects = allRects();
  let best: El | null = null;
  for (const el of Object.values(elements)) {
    if (el.type !== 'column' || el.parentId !== boardId || el.section !== 'canvas' || exclude.includes(el.id)) continue;
    const r = rects.get(el.id);
    if (r && contains(r, point, 8) && (!best || el.z > best.z)) best = el;
  }
  if (!best) return null;
  return { id: best.id, index: columnIndexAt(best.id, point.y, exclude) };
}

export function columnIndexAt(columnId: string, y: number, exclude: string[] = []): number {
  const { elements } = getState();
  const rects = allRects();
  const kids = Object.values(elements)
    .filter((el) => el.columnId === columnId && el.section === 'canvas' && !exclude.includes(el.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  let index = 0;
  for (const kid of kids) {
    const r = rects.get(kid.id);
    if (r && y > r.y + r.h / 2) index++;
  }
  return index;
}

export function createElement(type: ElementType, at: Placement = centerPlacement()): El | null {
  if (type === 'image' || type === 'file') {
    pickFiles(type === 'image' ? 'image/*' : '*/*', (files) => addFiles(files, at));
    return null;
  }
  const el = makeElement(type, place(type, at)) as El;
  if (type === 'line') {
    const line = el as Extract<El, { type: 'line' }>;
    line.content = { ...line.content, from: { x: at.x, y: at.y }, to: { x: at.x + 180, y: at.y } };
    addElements([el]);
    return el;
  }
  addElements([el], { edit: type !== 'swatch' });
  return el;
}

export function pickFiles(accept: string, onPick: (files: File[]) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = true;
  input.onchange = () => {
    if (input.files?.length) onPick([...input.files]);
  };
  input.click();
}

function imageRatio(src: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth ? img.naturalHeight / img.naturalWidth : undefined);
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

export async function addFiles(files: File[], at: Placement = centerPlacement()) {
  if (files.length === 0) return;
  toast(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`);
  const created: El[] = [];
  let offset = 0;
  let index = at.index ?? Infinity;
  for (const file of files) {
    try {
      const up = await api.upload(file);
      const isImage = up.mime.startsWith('image/');
      const spot = { ...at, x: at.x + offset, y: at.y + offset, index };
      const el = isImage
        ? makeElement('image', { ...place('image', spot), content: { src: up.url, ratio: await imageRatio(up.url) } })
        : makeElement('file', { ...place('file', spot), content: { src: up.url, name: up.name, size: up.size, mime: up.mime } });
      created.push(el);
      offset += 24;
      index++;
    } catch {
      toast(`Couldn't upload ${file.name}`);
    }
  }
  if (created.length) {
    addElements(created);
    toast(`Added ${created.length} file${created.length === 1 ? '' : 's'}`);
  }
}

export function isUrl(text: string) {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

export function addLink(url: string, at: Placement = centerPlacement()) {
  const el = makeElement('link', { ...place('link', at), content: { url: url.trim(), loading: true } });
  addElements([el]);
  void fetchLinkPreview(el.id, url.trim());
  return el;
}

export async function fetchLinkPreview(id: string, url: string) {
  patchElement(id, { content: { url, loading: true } }, { history: false });
  const info = await api.unfurl(url).catch(() => ({ ok: false }) as api.Unfurled);
  if (!getState().elements[id]) return;
  patchElement(
    id,
    {
      content: {
        url,
        loading: false,
        title: info.title ?? null,
        description: info.description ?? null,
        image: info.image ?? null,
        site: info.site ?? hostOf(url),
      },
    },
    { history: false },
  );
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function addTextNote(text: string, at: Placement = centerPlacement()) {
  const html = text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const el = makeElement('note', { ...place('note', at), content: { html } });
  addElements([el]);
}

// ---------------------------------------------------------------- copy / paste / duplicate

const CLIP_MARK = 'canvasnotes/elements:';
let internalClipboard: El[] = [];

// Elements plus everything inside them (column children, board contents).
function withDependents(ids: string[]): El[] {
  const { elements } = getState();
  const all = new Set<string>();
  for (const id of ids) {
    if (!elements[id]) continue;
    all.add(id);
    dependents(id).forEach((d) => all.add(d));
  }
  return [...all].map((id) => elements[id]).filter((el) => el.section === 'canvas');
}

// Deep-copies elements with fresh ids, remapping internal references.
function cloneTree(source: El[], roots: Set<string>, boardId: string, dx: number, dy: number): El[] {
  const idMap = new Map(source.map((el) => [el.id, uid()]));
  const now = Date.now();
  let z = maxZ(boardId);
  return source.map((el) => {
    const isRoot = roots.has(el.id);
    const copy = {
      ...structuredClone(el),
      id: idMap.get(el.id)!,
      parentId: isRoot ? boardId : idMap.get(el.parentId) ?? el.parentId,
      columnId: el.columnId ? idMap.get(el.columnId) ?? (isRoot ? el.columnId : null) : null,
      x: isRoot && !el.columnId ? el.x + dx : el.x,
      y: isRoot && !el.columnId ? el.y + dy : el.y,
      z: isRoot ? ++z : el.z,
      createdAt: now,
      updatedAt: now,
    } as El;
    if (copy.type === 'line') {
      const c = copy.content;
      const remap = (end: typeof c.from) => {
        const mapped = end.id ? idMap.get(end.id) : undefined;
        return { x: end.x + (isRoot ? dx : 0), y: end.y + (isRoot ? dy : 0), id: mapped ?? null };
      };
      copy.content = { ...c, from: remap(c.from), to: remap(c.to) };
    }
    return copy;
  });
}

export function duplicate(ids = getState().selection) {
  const { elements, boardId } = getState();
  const roots = new Set(ids.filter((id) => elements[id]));
  if (roots.size === 0) return;
  // Lines between duplicated elements come along.
  for (const el of Object.values(elements)) {
    if (el.type === 'line' && el.parentId === boardId && el.section === 'canvas') {
      const { from, to } = el.content;
      if (from.id && to.id && roots.has(from.id) && roots.has(to.id)) roots.add(el.id);
    }
  }
  const copies = cloneTree(withDependents([...roots]), roots, boardId, 24, 24);
  const newRootIds = copies.filter((c) => c.parentId === boardId && !copies.some((o) => o.id === c.columnId)).map((c) => c.id);
  addElements(copies, { select: false });
  setState({ selection: newRootIds });
}

export function copySelection() {
  const { selection, elements } = getState();
  if (selection.length === 0) return false;
  internalClipboard = withDependents(selection).map((el) => structuredClone(el));
  const rootIds = selection.filter((id) => elements[id]);
  const text = rootIds.map((id) => plainText(elements[id])).filter(Boolean).join('\n\n');
  void navigator.clipboard?.writeText(`${text}\n${CLIP_MARK}${rootIds.join(',')}`.trim()).catch(() => {});
  return true;
}

export function pasteInternal(at: Placement) {
  if (internalClipboard.length === 0) return false;
  const ids = new Set(internalClipboard.map((e) => e.id));
  const roots = new Set(internalClipboard.filter((e) => !ids.has(e.parentId) && !(e.columnId && ids.has(e.columnId))).map((e) => e.id));
  const { boardId } = getState();
  const rootEls = internalClipboard.filter((e) => roots.has(e.id) && !e.columnId);
  const minX = rootEls.length ? Math.min(...rootEls.map((e) => e.x)) : at.x;
  const minY = rootEls.length ? Math.min(...rootEls.map((e) => e.y)) : at.y;
  const source = internalClipboard.map((e) => (roots.has(e.id) ? { ...e, columnId: null } : e)) as El[];
  const copies = cloneTree(source, roots, boardId, at.x - minX, at.y - minY);
  addElements(copies, { select: false });
  setState({ selection: copies.filter((c) => c.parentId === boardId && !c.columnId).map((c) => c.id) });
  return true;
}

export function clipboardTextIsInternal(text: string) {
  return text.includes(CLIP_MARK) && internalClipboard.length > 0;
}

// ---------------------------------------------------------------- moving between boards

export function moveToBoard(ids: string[], targetBoardId: string) {
  const { elements } = getState();
  const moving = ids.map((id) => elements[id]).filter((el) => el && el.id !== targetBoardId) as El[];
  if (moving.length === 0) return;
  // Refuse to move a board into itself or its own descendants.
  for (const el of moving) {
    if (el.type === 'board' && (el.id === targetBoardId || dependents(el.id).includes(targetBoardId))) {
      toast("Can't move a board inside itself");
      return;
    }
  }
  const existing = Object.values(elements).filter((e) => e.parentId === targetBoardId && e.section === 'canvas' && !e.columnId);
  const right = existing.length ? Math.max(...existing.map((e) => e.x + e.w)) + 60 : 80;
  const minX = Math.min(...moving.map((e) => e.x));
  const minY = Math.min(...moving.map((e) => e.y));
  let z = maxZ(targetBoardId);
  const changes: Record<string, El> = {};
  for (const el of moving) {
    const dx = right - minX;
    const dy = 80 - minY;
    const next = { ...el, parentId: targetBoardId, columnId: null, x: el.x + dx, y: el.y + dy, z: ++z, updatedAt: Date.now() } as El;
    if (next.type === 'line') {
      const c = next.content;
      next.content = { ...c, from: { ...c.from, x: c.from.x + dx, y: c.from.y + dy }, to: { ...c.to, x: c.to.x + dx, y: c.to.y + dy } };
    }
    changes[el.id] = next;
  }
  commit(changes);
  setState({ selection: [] });
  const title = targetBoardId === 'root' ? 'Home' : (elements[targetBoardId] as Extract<El, { type: 'board' }>).content.title || 'board';
  toast(`Moved ${moving.length} item${moving.length === 1 ? '' : 's'} to ${title}`);
}

// ---------------------------------------------------------------- text helpers

export function htmlToText(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html.replace(/<\/(p|h\d|li|blockquote|pre)>/g, '$&\n');
  return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export function plainText(el: El): string {
  switch (el.type) {
    case 'note':
      return htmlToText(el.content.html);
    case 'board':
    case 'column':
      return el.content.title;
    case 'todo':
      return [el.content.title, ...el.content.items.map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`)].filter(Boolean).join('\n');
    case 'link':
      return [el.content.title, el.content.url].filter(Boolean).join('\n');
    case 'image':
      return el.content.caption || '';
    case 'swatch':
      return [el.content.name, el.content.hex].filter(Boolean).join(' ');
    case 'file':
      return el.content.name;
    case 'line':
      return el.content.label || '';
  }
}

// Empty notes and to-dos are discarded when you stop editing them, like Milanote.
export function isBlank(el: El) {
  if (el.type === 'note') return htmlToText(el.content.html) === '' && !/<(img|hr)/.test(el.content.html);
  if (el.type === 'todo') return !el.content.title.trim() && el.content.items.every((i) => !i.text.trim());
  if (el.type === 'link') return !el.content.url.trim();
  return false;
}
