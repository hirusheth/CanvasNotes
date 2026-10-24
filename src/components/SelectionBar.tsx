import { getState, navigate, setState, startEditing, trashElements, useStore } from '../store';
import { duplicate } from '../actions';
import { openDrawing } from '../elements/Sketch';
import { openDocument } from '../elements/MoreBodies';
import type { MenuState } from './ContextMenu';

const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

// On touch screens there's no right-click or keyboard, so selected cards get
// a floating bar with the common actions and the full menu behind "More".
export function SelectionBar({ onMenu }: { onMenu(menu: MenuState): void }) {
  const selection = useStore((s) => s.selection);
  const editing = useStore((s) => s.editingId);
  const single = useStore((s) => (s.selection.length === 1 ? s.elements[s.selection[0]] : undefined));
  if (!coarse || selection.length === 0 || editing) return null;

  const open = () => {
    if (!single) return;
    if (single.type === 'board') navigate(single.id);
    else if (single.type === 'alias') navigate(single.content.boardId);
    else if (single.type === 'sketch') openDrawing(single.id);
    else if (single.type === 'document') openDocument(single.id);
    else if (single.type === 'image' || single.type === 'file') window.open(single.content.src, '_blank', 'noopener');
    else startEditing(single.id);
  };
  const openLabel = !single
    ? null
    : ['board', 'alias', 'document'].includes(single.type)
      ? 'Open'
      : single.type === 'sketch'
        ? 'Draw'
        : single.type === 'image' || single.type === 'file'
          ? 'View'
          : 'Edit';

  return (
    <div className="selection-bar" onPointerDown={(e) => e.stopPropagation()}>
      <span className="sel-count">{selection.length} selected</span>
      {openLabel && <button onClick={open}>{openLabel}</button>}
      <button onClick={() => duplicate()}>Duplicate</button>
      <button
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onMenu({ x: r.left, y: r.top - 8, targetIds: getState().selection });
        }}
      >
        More
      </button>
      <button className="danger" onClick={() => trashElements(getState().selection)}>
        Delete
      </button>
      <button onClick={() => setState({ selection: [] })} aria-label="Done">
        ✕
      </button>
    </div>
  );
}
