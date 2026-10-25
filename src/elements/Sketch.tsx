import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { commit, getState, patchElement, setState, useElement } from '../store';
import type { Stroke } from '../types';

// Strokes are stored in a 1000-unit-wide coordinate space so they scale with the card.
export const SKETCH_W = 1000;

export const PEN_COLORS = ['#24262b', '#e0566f', '#f0803c', '#e0b100', '#2fae78', '#3a8fd9', '#8a6be0', '#ffffff'];
const WEIGHTS = [3, 6, 12, 24];

function pathFor(s: Stroke) {
  const p = s.points;
  if (p.length < 2) return '';
  if (p.length === 2) return `M${p[0]},${p[1]} l0.01,0`;
  let d = `M${p[0]},${p[1]}`;
  // Smooth with quadratic curves through midpoints.
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2;
    const my = (p[i + 1] + p[i + 3]) / 2;
    d += ` Q${p[i]},${p[i + 1]} ${mx},${my}`;
  }
  d += ` L${p[p.length - 2]},${p[p.length - 1]}`;
  return d;
}

export function StrokesSvg({ strokes, ratio, className }: { strokes: Stroke[]; ratio: number; className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${SKETCH_W} ${SKETCH_W * ratio}`} preserveAspectRatio="none">
      {strokes.map((s, i) => (
        <path key={i} d={pathFor(s)} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

export function SketchView({ strokes, ratio, background }: { strokes: Stroke[]; ratio: number; background?: string | null }) {
  return (
    <div className="sketch-frame" style={{ aspectRatio: `1 / ${ratio}` }}>
      {background && <img className="sketch-bg" src={background} alt="" draggable={false} />}
      {strokes.length ? (
        <StrokesSvg strokes={strokes} ratio={ratio} className="sketch-svg" />
      ) : (
        !background && <div className="sketch-empty">Double-click to start drawing</div>
      )}
    </div>
  );
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hits(s: Stroke, x: number, y: number, radius: number) {
  const p = s.points;
  if (p.length === 2) return Math.hypot(p[0] - x, p[1] - y) < radius + s.width / 2;
  for (let i = 0; i < p.length - 2; i += 2) if (distToSegment(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) < radius + s.width / 2) return true;
  return false;
}

// Full-screen drawing editor for sketch cards and for drawing on images.
export function DrawingModal({ id }: { id: string }) {
  const el = useElement(id);
  const background = el?.type === 'image' ? el.content.src : el?.type === 'sketch' ? el.content.background ?? null : null;
  const initial = el?.type === 'sketch' ? el.content.strokes : el?.type === 'image' ? el.content.annotation ?? [] : [];
  const ratio = el?.type === 'sketch' ? el.content.ratio : el?.type === 'image' ? el.content.ratio ?? 0.66 : 0.66;
  const [strokes, setStrokes] = useState<Stroke[]>(initial);
  const [redoStack, setRedo] = useState<Stroke[][]>([]);
  const [undoStack, setUndo] = useState<Stroke[][]>([]);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'select' | 'eyedropper'>('pen');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showPalette, setShowPalette] = useState(true);
  const [box, setBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const dragFrom = useRef<{ x: number; y: number; base: Stroke[] } | null>(null);
  const [color, setColor] = useState(() => localStorage.getItem('cn:pen') || PEN_COLORS[0]);
  const [prevColor, setPrevColor] = useState(PEN_COLORS[1]);
  const [weight, setWeight] = useState(6);
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef<Stroke | null>(null);
  const [, force] = useState(0);

  const close = () => setState({ modal: null });
  const save = () => {
    if (!el) return close();
    // A new sketch closed without drawing anything is discarded, like an empty note.
    if (el.type === 'sketch' && strokes.length === 0 && el.content.strokes.length === 0) {
      commit({ [id]: null }, { history: false });
      return close();
    }
    if (el.type === 'sketch') patchElement(id, { content: { strokes } });
    else if (el.type === 'image') patchElement(id, { content: { annotation: strokes } });
    close();
  };
  const commitStrokes = (next: Stroke[]) => {
    setUndo((u) => [...u, strokes]);
    setRedo([]);
    setStrokes(next);
  };
  const undo = () => {
    if (!undoStack.length) return;
    setRedo((r) => [...r, strokes]);
    setStrokes(undoStack[undoStack.length - 1]);
    setUndo((u) => u.slice(0, -1));
  };
  const redo = () => {
    if (!redoStack.length) return;
    setUndo((u) => [...u, strokes]);
    setStrokes(redoStack[redoStack.length - 1]);
    setRedo((r) => r.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape' || (mod && e.key.toLowerCase() === 's')) {
        e.preventDefault();
        e.stopPropagation();
        save();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
        e.preventDefault();
        commitStrokes(strokes.filter((_, i) => !selected.has(i)));
        setSelected(new Set());
      } else if (!mod && e.key.toLowerCase() === 'v') setTool('select');
      else if (!mod && e.key.toLowerCase() === 'i') setTool('eyedropper');
      else if (!mod && e.key.toLowerCase() === 'c') setShowPalette((v) => !v);
      else if (!mod && e.key.toLowerCase() === 'e') setTool('eraser');
      else if (!mod && (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'b')) setTool('pen');
      else if (!mod && e.key.toLowerCase() === 'x') {
        setColor(prevColor);
        setPrevColor(color);
      } else if (e.key === '[' || e.key === ']') {
        const i = WEIGHTS.indexOf(weight);
        setWeight(WEIGHTS[Math.max(0, Math.min(WEIGHTS.length - 1, i + (e.key === ']' ? 1 : -1)))]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!el) return null;

  const toLocal = (e: PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SKETCH_W, ((e.clientY - r.top) / r.height) * SKETCH_W * ratio];
  };

  // Eyedropper: take the colour of a stroke under the pointer, or of the image pixel.
  const pickColor = async (x: number, y: number) => {
    const hit = [...strokes].reverse().find((s) => hits(s, x, y, 12));
    if (hit) return applyPicked(hit.color);
    if (!background) return;
    const img = new Image();
    img.src = background;
    await img.decode().catch(() => {});
    if (!img.naturalWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(Math.floor((x / SKETCH_W) * img.naturalWidth), Math.floor((y / (SKETCH_W * ratio)) * img.naturalHeight), 1, 1).data;
    applyPicked(`#${[px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
  };
  const applyPicked = (c: string) => {
    setPrevColor(color);
    setColor(c);
    setTool('pen');
  };

  const bboxOf = (st: Stroke) => {
    const xs = st.points.filter((_, i) => i % 2 === 0);
    const ys = st.points.filter((_, i) => i % 2 === 1);
    return { x1: Math.min(...xs) - st.width / 2, y1: Math.min(...ys) - st.width / 2, x2: Math.max(...xs) + st.width / 2, y2: Math.max(...ys) + st.width / 2 };
  };

  const onDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const [x, y] = toLocal(e);
    if (tool === 'eyedropper') {
      void pickColor(x, y);
      return;
    }
    if (tool === 'select') {
      const hitIndex = strokes.findIndex((st) => hits(st, x, y, 10));
      if (hitIndex >= 0) {
        const nextSel = selected.has(hitIndex) ? selected : new Set([hitIndex]);
        setSelected(nextSel);
        dragFrom.current = { x, y, base: strokes };
      } else {
        setSelected(new Set());
        setBox({ x1: x, y1: y, x2: x, y2: y });
      }
      return;
    }
    if (tool === 'eraser') {
      const kept = strokes.filter((s) => !hits(s, x, y, 10));
      if (kept.length !== strokes.length) commitStrokes(kept);
      drawing.current = { color: 'eraser', width: 0, points: [] };
      return;
    }
    drawing.current = { color, width: weight, points: [Math.round(x), Math.round(y)] };
    force((n) => n + 1);
  };
  const onMove = (e: PointerEvent) => {
    if (tool === 'select') {
      const [x, y] = toLocal(e);
      if (dragFrom.current) {
        const { base } = dragFrom.current;
        const dx = x - dragFrom.current.x;
        const dy = y - dragFrom.current.y;
        setStrokes(base.map((st, i) => (selected.has(i) ? { ...st, points: st.points.map((v, j) => Math.round(v + (j % 2 ? dy : dx))) } : st)));
      } else if (box) {
        setBox({ ...box, x2: x, y2: y });
      }
      return;
    }
    const d = drawing.current;
    if (!d) return;
    const [x, y] = toLocal(e);
    if (d.color === 'eraser') {
      setStrokes((cur) => {
        const kept = cur.filter((s) => !hits(s, x, y, 10));
        return kept.length === cur.length ? cur : kept;
      });
      return;
    }
    const n = d.points.length;
    if (Math.hypot(x - d.points[n - 2], y - d.points[n - 1]) < 2) return;
    d.points.push(Math.round(x), Math.round(y));
    force((n2) => n2 + 1);
  };
  const onUp = () => {
    if (tool === 'select') {
      if (dragFrom.current) {
        const base = dragFrom.current.base;
        dragFrom.current = null;
        if (base !== strokes) {
          setUndo((u) => [...u, base]);
          setRedo([]);
        }
      } else if (box) {
        const r = { x1: Math.min(box.x1, box.x2), y1: Math.min(box.y1, box.y2), x2: Math.max(box.x1, box.x2), y2: Math.max(box.y1, box.y2) };
        const sel = new Set<number>();
        strokes.forEach((st, i) => {
          const b = bboxOf(st);
          if (b.x1 < r.x2 && b.x2 > r.x1 && b.y1 < r.y2 && b.y2 > r.y1) sel.add(i);
        });
        setSelected(sel);
        setBox(null);
      }
      return;
    }
    const d = drawing.current;
    drawing.current = null;
    if (!d || d.color === 'eraser') return;
    commitStrokes([...strokes, d]);
  };

  const live = drawing.current && drawing.current.color !== 'eraser' ? [...strokes, drawing.current] : strokes;

  return (
    <div className="overlay draw-overlay">
      <div className="draw-shell" role="dialog" aria-label="Drawing">
        <div className="draw-tools">
          <button className={tool === 'pen' ? 'active' : ''} onClick={() => setTool('pen')} title="Pen (P)">
            ✎ Pen
          </button>
          <button className={tool === 'eraser' ? 'active' : ''} onClick={() => setTool('eraser')} title="Eraser (E)">
            ⌫ Eraser
          </button>
          <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title="Selection tool (V): drag to select, drag strokes to move, Delete to remove">
            ⬚ Select
          </button>
          <button className={tool === 'eyedropper' ? 'active' : ''} onClick={() => setTool('eyedropper')} title="Colour eyedropper (I)">
            💧 Pick
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => {
                commitStrokes(strokes.filter((_, i) => !selected.has(i)));
                setSelected(new Set());
              }}
            >
              Delete {selected.size}
            </button>
          )}
          <span className="fb-sep" />
          <button className={showPalette ? 'active' : ''} onClick={() => setShowPalette((v) => !v)} title="Toggle colour palette (C)">
            🎨
          </button>
          {showPalette && PEN_COLORS.map((c) => (
            <button
              key={c}
              className={`pen-color ${color === c ? 'active' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => {
                setPrevColor(color);
                setColor(c);
                setTool('pen');
                try {
                  localStorage.setItem('cn:pen', c);
                } catch {}
              }}
            />
          ))}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Custom colour" />
          <span className="fb-sep" />
          {WEIGHTS.map((w) => (
            <button key={w} className={`pen-weight ${weight === w ? 'active' : ''}`} onClick={() => setWeight(w)} title={`Line weight ${w}`}>
              <span style={{ width: Math.min(18, w), height: Math.min(18, w) }} />
            </button>
          ))}
          <span className="fb-sep" />
          <button onClick={undo} disabled={!undoStack.length} title="Undo (Ctrl Z)">
            ↶
          </button>
          <button onClick={redo} disabled={!redoStack.length} title="Redo (Ctrl Shift Z)">
            ↷
          </button>
          <div className="draw-spacer" />
          <button onClick={close}>Discard</button>
          <button className="primary" onClick={save} title="Save (Esc or Ctrl S)">
            Save
          </button>
        </div>
        <div className="draw-stage">
          <div className="draw-paper" style={{ aspectRatio: `1 / ${ratio}`, ['--paper-ratio' as string]: ratio }}>
            {background && <img src={background} alt="" draggable={false} />}
            <svg
              ref={svgRef}
              className={`draw-svg ${tool}`}
              viewBox={`0 0 ${SKETCH_W} ${SKETCH_W * ratio}`}
              preserveAspectRatio="none"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              {live.map((s, i) => (
                <path key={i} d={pathFor(s)} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" strokeLinejoin="round" className={selected.has(i) ? 'stroke-selected' : ''} />
              ))}
              {[...selected].map((i) => {
                const st = strokes[i];
                if (!st) return null;
                const b = bboxOf(st);
                return <rect key={`sel-${i}`} x={b.x1} y={b.y1} width={b.x2 - b.x1} height={b.y2 - b.y1} className="stroke-box" />;
              })}
              {box && <rect x={Math.min(box.x1, box.x2)} y={Math.min(box.y1, box.y2)} width={Math.abs(box.x2 - box.x1)} height={Math.abs(box.y2 - box.y1)} className="select-box" />}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

export function openDrawing(id: string) {
  if (getState().elements[id]) setState({ modal: { kind: 'draw', id }, editingId: null });
}
