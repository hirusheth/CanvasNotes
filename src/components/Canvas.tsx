import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  addElements,
  columnOrderAt,
  commit,
  getState,
  makeElement,
  maxZ,
  navigate,
  setState,
  startEditing,
  useStore,
} from '../store';
import { COLUMN_CHILD_TYPES, type El, type LineEnd, type Rect } from '../types';
import {
  allRects,
  contains,
  getViewport,
  intersects,
  registerCanvas,
  replaceRects,
  screenToWorld,
  setViewport,
  useViewport,
  zoomAt,
  centerOn,
  getRect,
} from '../viewport';
import { addFiles, addLink, addTextNote, columnIndexAt, isUrl, moveToBoard } from '../actions';
import { CanvasContext, type CanvasApi, type DragState, type DropTarget } from './canvasContext';
import { ItemFrame } from './ItemFrame';
import { LinesLayer, type LineDraft } from './LinesLayer';
import { ContextMenu, type MenuState } from './ContextMenu';
import { ElementBody } from '../elements/ElementBody';

type Gesture =
  | { kind: 'pan'; startX: number; startY: number; vx: number; vy: number }
  | { kind: 'marquee'; start: { x: number; y: number }; base: string[] }
  | {
      kind: 'item';
      id: string;
      startClient: { x: number; y: number };
      startWorld: { x: number; y: number };
      moved: boolean;
      wasSelected: boolean;
      shift: boolean;
      ids: string[];
    }
  | { kind: 'resize'; id: string; startX: number; startW: number }
  | { kind: 'line-new'; from: LineEnd }
  | { kind: 'line-end'; lineId: string; which: 'from' | 'to' };

const DRAG_THRESHOLD = 4;

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

// Top-level elements of the board, ordered by z. Returned as a joined string
// so content edits don't re-render the whole canvas.
function topLevelKey(s: ReturnType<typeof getState>) {
  return Object.values(s.elements)
    .filter((el) => el.parentId === s.boardId && el.section === 'canvas' && !el.columnId && el.type !== 'line')
    .sort((a, b) => a.z - b.z)
    .map((el) => el.id)
    .join(',');
}

// The smallest visible element under a world point (column children beat their column).
function elementAt(point: { x: number; y: number }, exclude: Set<string> = new Set()): string | null {
  const { elements } = getState();
  let best: string | null = null;
  let bestArea = Infinity;
  for (const [id, r] of allRects()) {
    if (exclude.has(id) || elements[id]?.type === 'line') continue;
    if (contains(r, point) && r.w * r.h < bestArea) {
      best = id;
      bestArea = r.w * r.h;
    }
  }
  return best;
}

export function Canvas() {
  const boardId = useStore((s) => s.boardId);
  const tool = useStore((s) => s.tool);
  const loaded = useStore((s) => s.loaded);
  const focusRequest = useStore((s) => s.focusRequest);
  const ids = useStore(topLevelKey);
  const topLevel = useMemo(() => (ids ? ids.split(',') : []), [ids]);
  const vp = useViewport(boardId);

  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const spaceDown = useRef(false);
  const [panning, setPanning] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [lineDraft, setLineDraft] = useState<LineDraft | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    registerCanvas(canvasRef.current, boardId);
    return () => registerCanvas(null, boardId);
  }, [boardId]);

  // ------------------------------------------------------------ measuring

  const measure = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const zoom = getViewport(getState().boardId).zoom;
    const origin = world.getBoundingClientRect();
    const next = new Map<string, Rect>();
    world.querySelectorAll<HTMLElement>('[data-el]').forEach((node) => {
      const r = node.getBoundingClientRect();
      next.set(node.dataset.el!, {
        x: (r.left - origin.left) / zoom,
        y: (r.top - origin.top) / zoom,
        w: r.width / zoom,
        h: r.height / zoom,
      });
    });
    replaceRects(next);
  }, []);

  const observer = useMemo(() => {
    let frame = 0;
    return new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
  }, [measure]);
  useEffect(() => () => observer.disconnect(), [observer]);

  useLayoutEffect(() => {
    measure();
  });

  // ------------------------------------------------------------ focus requests (search, etc.)

  useEffect(() => {
    if (!focusRequest || !loaded) return;
    const raf = requestAnimationFrame(() => {
      const el = getState().elements[focusRequest.id];
      const targetId = el?.columnId ?? focusRequest.id;
      const r = getRect(focusRequest.id) ?? getRect(targetId);
      if (r) centerOn(boardId, r, Math.max(getViewport(boardId).zoom, 0.8));
      setState({ selection: [focusRequest.id], focusRequest: null });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusRequest, boardId, loaded, ids]);

  // ------------------------------------------------------------ wheel & keys

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.scrollable')) return;
      e.preventDefault();
      const bid = getState().boardId;
      if (e.ctrlKey || e.metaKey) {
        zoomAt(bid, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)), e.clientX, e.clientY);
      } else {
        const v = getViewport(bid);
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        const scale = e.deltaMode === 1 ? 20 : 1;
        setViewport(bid, { ...v, x: v.x - dx * scale, y: v.y - dy * scale });
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target) && !spaceDown.current) {
        spaceDown.current = true;
        setPanning(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        if (gesture.current?.kind !== 'pan') setPanning(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ------------------------------------------------------------ gestures

  const capture = (e: RPointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const startPan = (e: RPointerEvent) => {
    const v = getViewport(boardId);
    gesture.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, vx: v.x, vy: v.y };
    setPanning(true);
    capture(e);
  };

  const startLine = (e: RPointerEvent, fromId: string | null) => {
    const p = screenToWorld(e.clientX, e.clientY);
    const from: LineEnd = { id: fromId, x: p.x, y: p.y };
    gesture.current = { kind: 'line-new', from };
    setLineDraft({ from, to: { x: p.x, y: p.y } });
    capture(e);
  };

  const onBackgroundPointerDown = (e: RPointerEvent) => {
    setMenu(null);
    if (e.button === 2) return;
    if (e.button === 1 || spaceDown.current || (e.pointerType === 'touch' && !tool)) return startPan(e);
    if (e.button !== 0) return;
    if (isTypingTarget(document.activeElement)) (document.activeElement as HTMLElement).blur();
    if (tool === 'line') return startLine(e, null);
    const start = screenToWorld(e.clientX, e.clientY);
    const base = e.shiftKey ? getState().selection : [];
    gesture.current = { kind: 'marquee', start, base };
    setState({ selection: base, editingId: null });
    capture(e);
  };

  const onItemPointerDown: CanvasApi['onItemPointerDown'] = (e, el) => {
    setMenu(null);
    if (e.button === 2) {
      e.stopPropagation();
      return;
    }
    if (e.button === 1 || spaceDown.current) {
      e.stopPropagation();
      return startPan(e);
    }
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const state = getState();
    // Text editing inside the element being edited keeps native behaviour.
    if (state.editingId === el.id && (isTypingTarget(target) || target.closest('[data-editor]'))) {
      e.stopPropagation();
      return;
    }
    if (target.closest('[data-nodrag]')) {
      e.stopPropagation();
      if (!state.selection.includes(el.id)) setState({ selection: [el.id], editingId: null });
      return;
    }
    e.stopPropagation();
    if (isTypingTarget(document.activeElement)) (document.activeElement as HTMLElement).blur();
    if (tool === 'line') return startLine(e, el.id);
    if (target.closest('[data-resize]')) {
      gesture.current = { kind: 'resize', id: el.id, startX: e.clientX, startW: el.w };
      capture(e);
      return;
    }
    const wasSelected = state.selection.includes(el.id);
    let selection = state.selection;
    if (e.shiftKey) selection = wasSelected ? selection : [...selection, el.id];
    else if (!wasSelected) selection = [el.id];
    setState({ selection, editingId: state.editingId === el.id ? el.id : null });
    gesture.current = {
      kind: 'item',
      id: el.id,
      startClient: { x: e.clientX, y: e.clientY },
      startWorld: screenToWorld(e.clientX, e.clientY),
      moved: false,
      wasSelected,
      shift: e.shiftKey,
      ids: selection,
    };
    // Pointer capture starts with the drag itself, so clicks and double-clicks still reach the card.
  };

  const onLineHandleDown = (e: RPointerEvent, lineId: string, which: 'from' | 'to') => {
    e.stopPropagation();
    gesture.current = { kind: 'line-end', lineId, which };
    const line = getState().elements[lineId];
    if (line?.type === 'line') setLineDraft({ lineId, from: line.content.from, to: line.content.to });
    capture(e);
  };

  const onLinePointerDown = (e: RPointerEvent, line: El) => {
    onItemPointerDown(e, line);
  };

  function computeDropTarget(point: { x: number; y: number }, moving: string[]): DropTarget | null {
    const { elements } = getState();
    const exclude = new Set(moving);
    for (const id of moving) for (const [cid, el] of Object.entries(elements)) if (el.columnId === id) exclude.add(cid);
    const rects = allRects();
    // A board card under the pointer takes everything.
    let board: El | null = null;
    for (const [id, r] of rects) {
      const el = elements[id];
      if (el?.type === 'board' && !exclude.has(id) && contains(r, point) && (!board || el.z > board.z)) board = el;
    }
    if (board) return { kind: 'board', id: board.id };
    const allColumnable = moving.every((id) => elements[id] && COLUMN_CHILD_TYPES.includes(elements[id].type));
    if (!allColumnable) return null;
    let column: El | null = null;
    for (const [id, r] of rects) {
      const el = elements[id];
      if (el?.type === 'column' && !exclude.has(id) && contains(r, point, 6) && (!column || el.z > column.z)) column = el;
    }
    if (column) return { kind: 'column', id: column.id, index: columnIndexAt(column.id, point.y, moving) };
    return null;
  }

  const onPointerMove = (e: RPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const p = screenToWorld(e.clientX, e.clientY);
    switch (g.kind) {
      case 'pan': {
        const v = getViewport(boardId);
        setViewport(boardId, { ...v, x: g.vx + e.clientX - g.startX, y: g.vy + e.clientY - g.startY });
        break;
      }
      case 'marquee': {
        const r = { x: Math.min(g.start.x, p.x), y: Math.min(g.start.y, p.y), w: Math.abs(p.x - g.start.x), h: Math.abs(p.y - g.start.y) };
        setMarquee(r);
        const { elements } = getState();
        const hits: string[] = [];
        for (const [id, rect] of allRects()) {
          const el = elements[id];
          if (el && !el.columnId && intersects(r, rect)) hits.push(id);
        }
        for (const el of Object.values(elements)) {
          if (el.type !== 'line' || el.parentId !== boardId || el.section !== 'canvas') continue;
          const box = lineBox(el);
          if (box && intersects(r, box)) hits.push(el.id);
        }
        setState({ selection: [...new Set([...g.base, ...hits])] });
        break;
      }
      case 'item': {
        if (!g.moved && Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y) < DRAG_THRESHOLD) return;
        if (!g.moved) {
          g.moved = true;
          capture(e);
          // Dragging something selected along with its column parent would double-move it.
          const { elements } = getState();
          g.ids = g.ids.filter((id) => !(elements[id]?.columnId && g.ids.includes(elements[id].columnId!)));
          setState({ editingId: null });
        }
        const startRects = drag?.startRects ?? new Map(g.ids.map((id) => [id, allRects().get(id) ?? lineBox(getState().elements[id]) ?? { x: 0, y: 0, w: 0, h: 0 }]));
        const dx = p.x - g.startWorld.x;
        const dy = p.y - g.startWorld.y;
        setDrag({ ids: g.ids, dx, dy, startRects, target: computeDropTarget(p, g.ids) });
        break;
      }
      case 'resize': {
        const zoom = getViewport(boardId).zoom;
        const el = getState().elements[g.id];
        if (!el) return;
        const min = el.type === 'swatch' ? 80 : 140;
        const w = Math.max(min, Math.min(1600, Math.round(g.startW + (e.clientX - g.startX) / zoom)));
        commit({ [g.id]: { ...el, w, updatedAt: Date.now() } as El }, { coalesce: `resize:${g.id}` });
        break;
      }
      case 'line-new': {
        setLineDraft({ from: g.from, to: { x: p.x, y: p.y, id: elementAt(p, new Set(g.from.id ? [g.from.id] : [])) } });
        break;
      }
      case 'line-end': {
        const line = getState().elements[g.lineId];
        if (line?.type !== 'line') return;
        const other = line.content[g.which === 'from' ? 'to' : 'from'];
        const end = { x: p.x, y: p.y, id: elementAt(p, new Set(other.id ? [other.id] : [])) };
        setLineDraft({ lineId: g.lineId, from: g.which === 'from' ? end : line.content.from, to: g.which === 'to' ? end : line.content.to });
        break;
      }
    }
  };

  const finishItemDrag = (d: DragState) => {
    const state = getState();
    const { elements } = state;
    const target = d.target;
    if (target?.kind === 'board') {
      moveToBoard(d.ids, target.id);
      return;
    }
    const changes: Record<string, El> = {};
    const now = Date.now();
    let z = maxZ();
    if (target?.kind === 'column') {
      let order = columnOrderAt(target.id, target.index, d.ids);
      const step = 0.001;
      const sorted = [...d.ids].sort((a, b) => (d.startRects.get(a)?.y ?? 0) - (d.startRects.get(b)?.y ?? 0));
      for (const id of sorted) {
        const el = elements[id];
        changes[id] = { ...el, columnId: target.id, order, updatedAt: now } as El;
        order += step;
      }
    } else {
      for (const id of d.ids) {
        const el = elements[id];
        if (!el) continue;
        if (el.type === 'line') {
          const c = el.content;
          const shift = (end: LineEnd) => (end.id ? end : { ...end, x: end.x + d.dx, y: end.y + d.dy });
          changes[id] = { ...el, content: { ...c, from: shift(c.from), to: shift(c.to) }, updatedAt: now };
          continue;
        }
        const r = d.startRects.get(id);
        const fromColumn = !!el.columnId;
        changes[id] = {
          ...el,
          columnId: null,
          x: Math.round((fromColumn && r ? r.x : el.x) + d.dx),
          y: Math.round((fromColumn && r ? r.y : el.y) + d.dy),
          w: fromColumn && r ? Math.round(r.w) : el.w,
          z: ++z,
          updatedAt: now,
        } as El;
      }
    }
    commit(changes);
  };

  const onPointerUp = (e: RPointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!spaceDown.current) setPanning(false);
    if (!g) return;
    switch (g.kind) {
      case 'marquee':
        setMarquee(null);
        break;
      case 'item': {
        if (g.moved && drag) {
          finishItemDrag(drag);
        } else if (!g.moved) {
          const el = getState().elements[g.id];
          if (g.shift && g.wasSelected) setState({ selection: getState().selection.filter((id) => id !== g.id) });
          else if (!g.shift && g.wasSelected && getState().selection.length === 1 && el && el.type !== 'board' && el.type !== 'image' && el.type !== 'file') {
            // Clicking an already-selected card starts editing it.
            startEditing(g.id);
          } else if (!g.shift) setState({ selection: [g.id] });
        }
        setDrag(null);
        break;
      }
      case 'line-new': {
        const p = screenToWorld(e.clientX, e.clientY);
        const draft = lineDraft;
        setLineDraft(null);
        setState({ tool: null });
        if (!draft) break;
        let to = draft.to;
        if (!to.id && Math.hypot(p.x - g.from.x, p.y - g.from.y) < 10) to = { x: g.from.x + 180, y: g.from.y };
        const line = makeElement('line', { content: { from: g.from, to, arrow: 'end' } });
        addElements([line]);
        break;
      }
      case 'line-end': {
        const draft = lineDraft;
        setLineDraft(null);
        const line = getState().elements[g.lineId];
        if (draft && line?.type === 'line') {
          commit({ [line.id]: { ...line, content: { ...line.content, from: draft.from, to: draft.to }, updatedAt: Date.now() } });
        }
        break;
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== canvasRef.current && e.target !== worldRef.current) return;
    const p = screenToWorld(e.clientX, e.clientY);
    const note = makeElement('note', { x: Math.round(p.x - 20), y: Math.round(p.y - 20) });
    addElements([note], { edit: true });
  };

  const onItemDoubleClick: CanvasApi['onItemDoubleClick'] = (e, el) => {
    e.stopPropagation();
    if (el.type === 'board') navigate(el.id);
    else if (el.type === 'link' && getState().editingId !== el.id && el.content.url) window.open(el.content.url, '_blank', 'noopener');
    else if (el.type === 'image' || el.type === 'file') window.open(el.content.src, '_blank', 'noopener');
    else startEditing(el.id);
  };

  const onItemContextMenu: CanvasApi['onItemContextMenu'] = (e, el) => {
    e.preventDefault();
    e.stopPropagation();
    const sel = getState().selection;
    if (!sel.includes(el.id)) setState({ selection: [el.id], editingId: null });
    setMenu({ x: e.clientX, y: e.clientY, targetIds: sel.includes(el.id) ? sel : [el.id] });
  };

  const onBackgroundContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setState({ selection: [], editingId: null });
    setMenu({ x: e.clientX, y: e.clientY, targetIds: [], world: screenToWorld(e.clientX, e.clientY) });
  };

  // ------------------------------------------------------------ external drops

  const onDragOver = (e: React.DragEvent) => {
    if ([...e.dataTransfer.types].some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const p = screenToWorld(e.clientX, e.clientY);
    const column = computeDropTarget(p, ['__external__']);
    const at = { x: p.x, y: p.y, ...(column?.kind === 'column' ? { columnId: column.id, index: column.index } : {}) };
    const files = [...e.dataTransfer.files];
    if (files.length) return void addFiles(files, at);
    const uri = e.dataTransfer.getData('text/uri-list').split('\n').find((l) => l && !l.startsWith('#'));
    const text = e.dataTransfer.getData('text/plain');
    if (uri && isUrl(uri)) addLink(uri, at);
    else if (text && isUrl(text)) addLink(text, at);
    else if (text.trim()) addTextNote(text, at);
  };

  // ------------------------------------------------------------ render

  const api: CanvasApi = { drag, onItemPointerDown, onItemDoubleClick, onItemContextMenu, observe: (n) => n && observer.observe(n) };
  const grid = 24 * vp.zoom;
  const ghosts = drag ? drag.ids.filter((id) => getState().elements[id]?.columnId) : [];

  return (
    <CanvasContext.Provider value={api}>
      <div
        ref={canvasRef}
        className={`canvas ${panning ? 'panning' : ''} ${tool === 'line' ? 'tool-line' : ''}`}
        style={{ backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${vp.x}px ${vp.y}px` }}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={onBackgroundContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div ref={worldRef} className="world" style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` }}>
          <LinesLayer boardId={boardId} draft={lineDraft} drag={drag} onLinePointerDown={onLinePointerDown} onHandlePointerDown={onLineHandleDown} />
          {topLevel.map((id) => (
            <ItemFrame key={id} id={id} />
          ))}
          {ghosts.map((id) => {
            const el = getState().elements[id];
            const r = drag!.startRects.get(id);
            if (!el || !r) return null;
            return (
              <div key={`ghost-${id}`} className={`item item-${el.type} drag-ghost ${el.color ? `color-${el.color}` : ''}`} style={{ left: r.x + drag!.dx, top: r.y + drag!.dy, width: r.w }}>
                <ElementBody el={el} editing={false} selected />
              </div>
            );
          })}
          {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
        </div>
        {loaded && topLevel.length === 0 && <EmptyBoardHint />}
      </div>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </CanvasContext.Provider>
  );
}

export function lineBox(el: El | undefined): Rect | null {
  if (!el || el.type !== 'line') return null;
  const a = endPoint(el.content.from);
  const b = endPoint(el.content.to);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) || 1, h: Math.abs(a.y - b.y) || 1 };
}

function endPoint(end: LineEnd) {
  const r = end.id ? getRect(end.id) : undefined;
  return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : { x: end.x, y: end.y };
}

function EmptyBoardHint() {
  return (
    <div className="empty-hint">
      <h2>This board is empty</h2>
      <p>Double-click anywhere to write a note, drag a tool in from the left, or drop images, files and links here.</p>
    </div>
  );
}
