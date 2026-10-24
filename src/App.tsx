import { useEffect } from 'react';
import {
  boardPath,
  commit,
  getState,
  load,
  navigate,
  patchElements,
  redo,
  setState,
  startEditing,
  trashElements,
  undo,
  useStore,
  subscribeState,
} from './store';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { TopBar } from './components/TopBar';
import { SearchPalette, ShortcutsPanel, Toast, TrashPanel } from './components/Panels';
import {
  addFiles,
  addLink,
  addTextNote,
  clipboardTextIsInternal,
  columnAt,
  copySelection,
  duplicate,
  isBlank,
  isUrl,
  pasteInternal,
  centerPlacement,
  fetchLinkPreview,
} from './actions';
import { allRects, fitRects, getViewport, setViewport, zoomAt } from './viewport';
import type { El } from './types';

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

// Where pasted things land: the last pointer position over the board, or the view centre.
let lastPointer: { x: number; y: number } | null = null;
window.addEventListener('pointermove', (e) => {
  lastPointer = { x: e.clientX, y: e.clientY };
});

function pastePlacement() {
  const canvas = document.querySelector('.canvas')?.getBoundingClientRect();
  if (lastPointer && canvas && lastPointer.x > canvas.left && lastPointer.y > canvas.top && lastPointer.x < canvas.right && lastPointer.y < canvas.bottom) {
    const vp = getViewport(getState().boardId);
    const x = (lastPointer.x - canvas.left - vp.x) / vp.zoom;
    const y = (lastPointer.y - canvas.top - vp.y) / vp.zoom;
    const column = columnAt({ x, y });
    return { x, y, ...(column ? { columnId: column.id, index: column.index } : {}) };
  }
  return centerPlacement();
}

// Discard notes and lists left empty when editing stops, like Milanote does.
let previousEditing: string | null = null;
subscribeState(() => {
  const { editingId, elements } = getState();
  if (editingId === previousEditing) return;
  const prev = previousEditing ? elements[previousEditing] : undefined;
  previousEditing = editingId;
  if (prev && isBlank(prev)) commit({ [prev.id]: null }, { history: false });
});

function onKeyDown(e: KeyboardEvent) {
  const state = getState();
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (mod && key === 'k') {
    e.preventDefault();
    setState({ panel: state.panel === 'search' ? null : 'search' });
    return;
  }
  if (state.panel && e.key === 'Escape') {
    setState({ panel: null });
    return;
  }
  if (isTyping(e.target) || state.panel === 'search') return;

  const { selection, boardId } = state;
  if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if (mod && key === 'y') {
    e.preventDefault();
    redo();
  } else if (mod && key === 'a') {
    e.preventDefault();
    const ids = Object.values(state.elements)
      .filter((el) => el.parentId === boardId && el.section === 'canvas' && !el.columnId)
      .map((el) => el.id);
    setState({ selection: ids, editingId: null });
  } else if (mod && key === 'd') {
    e.preventDefault();
    duplicate();
  } else if (mod && key === 'c') {
    if (copySelection()) e.preventDefault();
  } else if (mod && key === 'x') {
    if (copySelection()) {
      e.preventDefault();
      trashElements(selection);
    }
  } else if (mod && (key === '=' || key === '+')) {
    e.preventDefault();
    zoomAt(boardId, 1.2);
  } else if (mod && key === '-') {
    e.preventDefault();
    zoomAt(boardId, 1 / 1.2);
  } else if (mod && key === '0') {
    e.preventDefault();
    setViewport(boardId, { ...getViewport(boardId), zoom: 1 });
  } else if (e.shiftKey && (e.key === '!' || e.code === 'Digit1')) {
    fitRects(boardId, [...allRects().values()]);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selection.length) {
      e.preventDefault();
      trashElements(selection);
    } else if (e.key === 'Backspace' && boardId !== 'root') {
      const path = boardPath(boardId);
      navigate(path[path.length - 2]?.id ?? 'root');
    }
  } else if (e.key === 'Escape') {
    setState({ selection: [], editingId: null, tool: null });
  } else if (e.key === 'Enter' && selection.length === 1) {
    e.preventDefault();
    const el = state.elements[selection[0]];
    if (el?.type === 'board') navigate(el.id);
    else startEditing(selection[0]);
  } else if (key === 'l' && !mod) {
    setState({ tool: state.tool === 'line' ? null : 'line' });
  } else if (e.key === '?') {
    setState({ panel: 'shortcuts' });
  } else if (e.key.startsWith('Arrow') && selection.length) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    const patches: Record<string, Partial<El>> = {};
    for (const id of selection) {
      const el = state.elements[id];
      if (el && !el.columnId && el.type !== 'line') patches[id] = { x: el.x + dx, y: el.y + dy };
    }
    patchElements(patches, { coalesce: 'nudge' });
  }
}

function onPaste(e: ClipboardEvent) {
  if (isTyping(e.target) || getState().panel) return;
  const data = e.clipboardData;
  if (!data) return;
  const at = pastePlacement();
  const files = [...data.files];
  if (files.length) {
    e.preventDefault();
    void addFiles(files, at);
    return;
  }
  const text = data.getData('text/plain');
  if (clipboardTextIsInternal(text) && pasteInternal(at)) {
    e.preventDefault();
    return;
  }
  if (!text.trim()) return;
  e.preventDefault();
  if (isUrl(text)) addLink(text, at);
  else addTextNote(text, at);
}

export function App() {
  const loaded = useStore((s) => s.loaded);
  const loadError = useStore((s) => s.loadError);
  const panel = useStore((s) => s.panel);
  const theme = useStore((s) => s.theme);
  const boardId = useStore((s) => s.boardId);
  const boardTitle = useStore((s) => {
    const path = boardPath(s.boardId);
    return path[path.length - 1].title;
  });

  useEffect(() => {
    void load().then(() => {
      // Finish link previews that were interrupted by a reload.
      for (const el of Object.values(getState().elements)) {
        if (el.type === 'link' && el.content.loading && el.content.url) void fetchLinkPreview(el.id, el.content.url);
      }
    });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.title = boardId === 'root' ? 'Canvas Notes' : `${boardTitle} · Canvas Notes`;
  }, [boardId, boardTitle]);

  if (loadError) {
    return (
      <div className="splash">
        <h1>Couldn't reach the Canvas Notes server</h1>
        <p>{loadError}</p>
        <button onClick={() => void load()}>Try again</button>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <Toolbar />
        {loaded ? <Canvas key={boardId} /> : <div className="splash">Loading…</div>}
        {panel === 'trash' && <TrashPanel />}
      </div>
      {panel === 'search' && <SearchPalette />}
      {panel === 'shortcuts' && <ShortcutsPanel />}
      <Toast />
    </div>
  );
}
