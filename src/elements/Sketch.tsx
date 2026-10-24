import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { getState, patchElement, setState, useElement } from '../store';
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

export function SketchView({ strokes, ratio }: { strokes: Stroke[]; ratio: number }) {
  return (
    <div className="sketch-frame" style={{ aspectRatio: `1 / ${ratio}` }}>
      {strokes.length ? <StrokesSvg strokes={strokes} ratio={ratio} className="sketch-svg" /> : <div className="sketch-empty">Double-click to start drawing</div>}
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
  const isImage = el?.type === 'image';
  const initial = el?.type === 'sketch' ? el.content.strokes : el?.type === 'image' ? el.content.annotation ?? [] : [];
  const ratio = el?.type === 'sketch' ? el.content.ratio : el?.type === 'image' ? el.content.ratio ?? 0.66 : 0.66;
  const [strokes, setStrokes] = useState<Stroke[]>(initial);
  const [redoStack, setRedo] = useState<Stroke[][]>([]);
  const [undoStack, setUndo] = useState<Stroke[][]>([]);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState(() => localStorage.getItem('cn:pen') || PEN_COLORS[0]);
  const [prevColor, setPrevColor] = useState(PEN_COLORS[1]);
  const [weight, setWeight] = useState(6);
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef<Stroke | null>(null);
  const [, force] = useState(0);

  const close = () => setState({ modal: null });
  const save = () => {
    if (!el) return close();
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
      } else if (!mod && e.key.toLowerCase() === 'e') setTool('eraser');
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

  const onDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const [x, y] = toLocal(e);
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
          <span className="fb-sep" />
          {PEN_COLORS.map((c) => (
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
            {isImage && el.type === 'image' && <img src={el.content.src} alt="" draggable={false} />}
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
                <path key={i} d={pathFor(s)} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ))}
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
