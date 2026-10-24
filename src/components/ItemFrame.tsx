import { memo } from 'react';
import { useElement, useStore } from '../store';
import { ElementBody } from '../elements/ElementBody';
import { useCanvas } from './canvasContext';

const RESIZABLE = new Set(['note', 'todo', 'image', 'link', 'column', 'file', 'swatch']);

// Positions one element on the canvas (or in a column) and routes its pointer
// events to the canvas, which owns selection and dragging.
export const ItemFrame = memo(function ItemFrame({ id, inColumn = false }: { id: string; inColumn?: boolean }) {
  const el = useElement(id);
  const selected = useStore((s) => s.selection.includes(id));
  const editing = useStore((s) => s.editingId === id);
  const ctx = useCanvas();
  if (!el || el.type === 'line') return null;

  const drag = ctx.drag;
  const dragging = !!drag && drag.ids.includes(id);
  const dropTarget = drag?.target?.id === id;
  const classes = [
    'item',
    `item-${el.type}`,
    el.color ? `color-${el.color}` : '',
    selected ? 'selected' : '',
    editing ? 'editing' : '',
    inColumn ? 'in-column' : '',
    dragging ? (inColumn ? 'drag-source' : 'dragging') : '',
    dropTarget ? 'drop-target' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const style = inColumn
    ? undefined
    : {
        left: el.x,
        top: el.y,
        width: el.type === 'board' ? undefined : el.w,
        zIndex: dragging ? 1_000_000 + el.z : el.z,
        transform: dragging ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined,
      };

  return (
    <div
      className={classes}
      style={style}
      data-el={id}
      ref={ctx.observe}
      onPointerDown={(e) => ctx.onItemPointerDown(e, el)}
      onDoubleClick={(e) => ctx.onItemDoubleClick(e, el)}
      onContextMenu={(e) => ctx.onItemContextMenu(e, el)}
    >
      <ElementBody el={el} editing={editing} selected={selected} />
      {selected && !inColumn && !editing && RESIZABLE.has(el.type) && <div className="resize-handle" data-resize title="Drag to resize" />}
    </div>
  );
});
