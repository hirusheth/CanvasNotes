import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getState, maxZ, navigate, patchElements, startEditing, trashElements, makeElement, addElements } from '../store';
import { CARD_COLORS, type El, type ElementType } from '../types';
import { duplicate, fetchLinkPreview } from '../actions';

export interface MenuState {
  x: number;
  y: number;
  targetIds: string[];
  world?: { x: number; y: number };
}

const COLORABLE = new Set(['note', 'column', 'board', 'todo', 'line', 'link', 'file']);

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });

  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) });
  }, [menu]);

  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', esc);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', esc);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const { elements } = getState();
  const targets = menu.targetIds.map((id) => elements[id]).filter(Boolean) as El[];
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const addAt = (type: ElementType) =>
    run(() => {
      const el = makeElement(type, { x: Math.round(menu.world!.x), y: Math.round(menu.world!.y) }) as El;
      addElements([el], { edit: type !== 'swatch' });
    });

  if (targets.length === 0) {
    return (
      <div ref={ref} className="menu" style={{ left: pos.x, top: pos.y }} role="menu">
        <button onClick={addAt('note')}>Add note here</button>
        <button onClick={addAt('todo')}>Add to-do list here</button>
        <button onClick={addAt('column')}>Add column here</button>
        <button onClick={addAt('board')}>Add board here</button>
      </div>
    );
  }

  const single = targets.length === 1 ? targets[0] : null;
  const colorable = targets.every((t) => COLORABLE.has(t.type));
  const lines = targets.filter((t): t is Extract<El, { type: 'line' }> => t.type === 'line');
  const ids = targets.map((t) => t.id);

  return (
    <div ref={ref} className="menu" style={{ left: pos.x, top: pos.y }} role="menu">
      {colorable && (
        <div className="menu-colors">
          {CARD_COLORS.map((c) => (
            <button
              key={c.name}
              title={c.name}
              className={`swatch-dot ${c.value ? `color-${c.value}` : 'no-color'} ${single && (single.color ?? null) === c.value ? 'active' : ''}`}
              onClick={run(() => patchElements(Object.fromEntries(ids.map((id) => [id, { color: c.value }]))))}
            />
          ))}
        </div>
      )}
      {single?.type === 'board' && <button onClick={run(() => navigate(single.id))}>Open board</button>}
      {single && ['note', 'todo', 'column', 'board', 'link', 'swatch', 'image', 'line'].includes(single.type) && (
        <button onClick={run(() => startEditing(single.id))}>{single.type === 'image' ? 'Edit caption' : single.type === 'line' ? 'Edit label' : 'Edit'}</button>
      )}
      {single?.type === 'link' && single.content.url && (
        <>
          <button onClick={run(() => window.open(single.content.url, '_blank', 'noopener'))}>Open link</button>
          <button onClick={run(() => void fetchLinkPreview(single.id, single.content.url))}>Refresh preview</button>
        </>
      )}
      {(single?.type === 'image' || single?.type === 'file') && (
        <a className="menu-link" href={single.content.src} download={single.type === 'file' ? single.content.name : undefined} target="_blank" rel="noopener" onClick={onClose}>
          {single.type === 'file' ? 'Download' : 'Open original'}
        </a>
      )}
      {lines.length > 0 && (
        <>
          <div className="menu-sep" />
          <div className="menu-row">
            {(['end', 'both', 'none'] as const).map((arrow) => (
              <button
                key={arrow}
                className={lines.every((l) => l.content.arrow === arrow) ? 'active' : ''}
                onClick={run(() => patchElements(Object.fromEntries(lines.map((l) => [l.id, { content: { arrow } }]))))}
              >
                {arrow === 'end' ? '→' : arrow === 'both' ? '↔' : '—'}
              </button>
            ))}
            <button
              className={lines.every((l) => l.content.dashed) ? 'active' : ''}
              onClick={run(() => patchElements(Object.fromEntries(lines.map((l) => [l.id, { content: { dashed: !lines.every((x) => x.content.dashed) } }]))))}
            >
              ┄
            </button>
          </div>
        </>
      )}
      <div className="menu-sep" />
      <button onClick={run(() => duplicate(ids))}>
        Duplicate <kbd>Ctrl D</kbd>
      </button>
      {targets.some((t) => !t.columnId && t.type !== 'line') && (
        <>
          <button onClick={run(() => { let z = maxZ(); patchElements(Object.fromEntries(ids.map((id) => [id, { z: ++z }]))); })}>Bring to front</button>
          <button
            onClick={run(() => {
              const minZ = Math.min(...Object.values(getState().elements).filter((e) => e.parentId === getState().boardId).map((e) => e.z));
              let z = minZ - ids.length;
              patchElements(Object.fromEntries(ids.map((id) => [id, { z: z++ }])));
            })}
          >
            Send to back
          </button>
        </>
      )}
      <div className="menu-sep" />
      <button className="danger" onClick={run(() => trashElements(ids))}>
        Move to Trash <kbd>Del</kbd>
      </button>
    </div>
  );
}
