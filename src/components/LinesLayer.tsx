import { useMemo, useRef, useEffect, type PointerEvent } from 'react';
import { getState, patchElement, startEditing, useStore } from '../store';
import type { El, LineEnd, Rect } from '../types';
import { getRect, useRectsVersion } from '../viewport';
import type { DragState } from './canvasContext';

export interface LineDraft {
  lineId?: string;
  from: LineEnd;
  to: LineEnd;
}

type Pt = { x: number; y: number };

function linesKey(s: ReturnType<typeof getState>, boardId: string) {
  return Object.values(s.elements)
    .filter((el) => el.type === 'line' && el.parentId === boardId && el.section === 'canvas')
    .map((el) => `${el.id}:${el.updatedAt}`)
    .join(',');
}

// Where the segment from the rect's centre toward `toward` crosses the rect's border, plus a gap.
function clipToRect(r: Rect, toward: Pt, gap = 8): Pt {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx !== 0 ? (r.w / 2 + gap) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (r.h / 2 + gap) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy, 1);
  return { x: cx + dx * s, y: cy + dy * s };
}

function rectFor(end: LineEnd, drag: DragState | null): Rect | null | undefined {
  if (!end.id) return null;
  const r = getRect(end.id);
  if (!r) return undefined; // attached element isn't visible here
  const el = getState().elements[end.id];
  // Column children being dragged keep their measured spot; the ghost moves instead.
  if (drag && drag.ids.includes(end.id) && el?.columnId) return { ...r, x: r.x + drag.dx, y: r.y + drag.dy };
  return r;
}

export function resolveLine(from: LineEnd, to: LineEnd, drag: DragState | null, lineId?: string): [Pt, Pt] | null {
  const shiftFree = (end: LineEnd): Pt =>
    drag && lineId && drag.ids.includes(lineId) && !end.id ? { x: end.x + drag.dx, y: end.y + drag.dy } : { x: end.x, y: end.y };
  const ra = rectFor(from, drag);
  const rb = rectFor(to, drag);
  if (ra === undefined || rb === undefined) return null;
  const ca = ra ? { x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 } : shiftFree(from);
  const cb = rb ? { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 } : shiftFree(to);
  const a = ra ? clipToRect(ra, cb) : ca;
  const b = rb ? clipToRect(rb, ca) : cb;
  return [a, b];
}

interface Props {
  boardId: string;
  draft: LineDraft | null;
  drag: DragState | null;
  onLinePointerDown(e: PointerEvent, line: El): void;
  onHandlePointerDown(e: PointerEvent, lineId: string, which: 'from' | 'to'): void;
}

export function LinesLayer({ boardId, draft, drag, onLinePointerDown, onHandlePointerDown }: Props) {
  useRectsVersion();
  const key = useStore((s) => linesKey(s, boardId));
  const selection = useStore((s) => s.selection);
  const editingId = useStore((s) => s.editingId);
  const lines = useMemo(
    () => (key ? key.split(',').map((k) => getState().elements[k.split(':')[0]]).filter((el): el is Extract<El, { type: 'line' }> => el?.type === 'line') : []),
    [key],
  );

  return (
    <svg className="lines-layer" width="1" height="1" overflow="visible">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" className="arrow-head" />
        </marker>
      </defs>
      {lines.map((line) => {
        const isDraft = draft?.lineId === line.id;
        const pts = resolveLine(isDraft ? draft!.from : line.content.from, isDraft ? draft!.to : line.content.to, drag, line.id);
        if (!pts) return null;
        const [a, b] = pts;
        const selected = selection.includes(line.id);
        const { arrow, dashed, label } = line.content;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return (
          <g key={line.id} className={`line ${selected ? 'selected' : ''} ${line.color ? `stroke-${line.color}` : ''}`} data-line={line.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="line-hit" onPointerDown={(e) => onLinePointerDown(e, line)} onDoubleClick={(e) => { e.stopPropagation(); startEditing(line.id); }} />
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className="line-stroke"
              style={line.content.weight ? { strokeWidth: line.content.weight } : undefined}
              strokeDasharray={dashed ? '8 6' : undefined}
              markerEnd={arrow !== 'none' ? 'url(#arrow)' : undefined}
              markerStart={arrow === 'both' ? 'url(#arrow)' : undefined}
            />
            {editingId === line.id ? (
              <LabelEditor line={line} at={mid} />
            ) : (
              label && (
                <text x={mid.x} y={mid.y} className="line-label" textAnchor="middle" dominantBaseline="central" paintOrder="stroke" onPointerDown={(e) => onLinePointerDown(e, line)}>
                  {label}
                </text>
              )
            )}
            {selected && !drag && (
              <>
                <circle cx={a.x} cy={a.y} r={7} className="line-handle" onPointerDown={(e) => onHandlePointerDown(e, line.id, 'from')} />
                <circle cx={b.x} cy={b.y} r={7} className="line-handle" onPointerDown={(e) => onHandlePointerDown(e, line.id, 'to')} />
              </>
            )}
          </g>
        );
      })}
      {draft && !draft.lineId && (() => {
        const pts = resolveLine(draft.from, draft.to, null);
        if (!pts) return null;
        return <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} className="line-stroke draft" markerEnd="url(#arrow)" />;
      })()}
    </svg>
  );
}

function LabelEditor({ line, at }: { line: Extract<El, { type: 'line' }>; at: Pt }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <foreignObject x={at.x - 90} y={at.y - 16} width={180} height={32}>
      <input
        ref={ref}
        className="line-label-input"
        defaultValue={line.content.label ?? ''}
        placeholder="Label"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
        onBlur={(e) => {
          const label = e.target.value.trim();
          if (label !== (line.content.label ?? '')) patchElement(line.id, { content: { label } });
          startEditing(null);
        }}
      />
    </foreignObject>
  );
}
