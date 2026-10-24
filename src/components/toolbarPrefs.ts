// Which tools the left toolbar shows (Milanote's "Toolbar options").

export const ALL_TOOL_IDS = [
  'note',
  'link',
  'todo',
  'line',
  'board',
  'column',
  'comment',
  'table',
  'image',
  'file',
  'sketch',
  'document',
  'heading',
  'swatch',
  'video',
  'audio',
  'map',
] as const;

export type ToolId = (typeof ALL_TOOL_IDS)[number];

export const TOOL_LABELS: Record<ToolId, string> = {
  note: 'Note',
  link: 'Link',
  todo: 'To-do',
  line: 'Line',
  board: 'Board',
  column: 'Column',
  comment: 'Comment',
  table: 'Table',
  image: 'Image',
  file: 'Upload',
  sketch: 'Sketch',
  document: 'Document',
  heading: 'Heading',
  swatch: 'Colour',
  video: 'Video',
  audio: 'Audio',
  map: 'Map',
};

const DEFAULT_HIDDEN: ToolId[] = ['heading', 'video', 'audio', 'map'];
const KEY = 'cn:toolbar';
const listeners = new Set<() => void>();

export function getToolbarPrefs(): { hidden: ToolId[] } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { hidden: DEFAULT_HIDDEN };
}

export function setToolbarPrefs(prefs: { hidden: ToolId[] }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {}
  listeners.forEach((l) => l());
}

export function onToolbarPrefs(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
