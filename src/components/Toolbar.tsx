import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createElement, columnAt, centerPlacement, pickFiles, addFiles } from '../actions';
import { getState, setState, useStore } from '../store';
import type { ElementType } from '../types';
import { isOverCanvas, screenToWorld } from '../viewport';

interface Tool {
  type: ElementType;
  label: string;
  icon: ReactNode;
  hint: string;
}

const I = ({ d, children }: { d?: string; children?: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d ? <path d={d} /> : children}
  </svg>
);

const TOOLS: Tool[] = [
  { type: 'note', label: 'Note', hint: 'Rich text note', icon: <I><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" /></I> },
  { type: 'link', label: 'Link', hint: 'Web link with preview', icon: <I d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /> },
  { type: 'todo', label: 'To-do', hint: 'Checklist', icon: <I><rect x="4" y="4.5" width="5" height="5" rx="1" /><path d="M5.3 7l1 1 1.6-1.8M12 7h8M12 16h8" /><rect x="4" y="13.5" width="5" height="5" rx="1" /></I> },
  { type: 'line', label: 'Line', hint: 'Connect cards with an arrow', icon: <I d="M5 19L19 5M19 5h-6M19 5v6" /> },
  { type: 'board', label: 'Board', hint: 'A board inside this board', icon: <I><rect x="3.5" y="4" width="7" height="9" rx="1.2" /><rect x="13.5" y="4" width="7" height="5" rx="1.2" /><rect x="13.5" y="11.5" width="7" height="8.5" rx="1.2" /><rect x="3.5" y="15.5" width="7" height="4.5" rx="1.2" /></I> },
  { type: 'column', label: 'Column', hint: 'Stack cards in a column', icon: <I><rect x="6" y="3.5" width="12" height="17" rx="2" /><path d="M9 7.5h6M9 11.5h6M9 15.5h6" /></I> },
  { type: 'image', label: 'Image', hint: 'Upload images', icon: <I><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M20.5 16l-5-5-8 8" /></I> },
  { type: 'file', label: 'Upload', hint: 'Upload any file', icon: <I d="M12 16V4M7 9l5-5 5 5M5 20h14" /> },
  { type: 'swatch', label: 'Colour', hint: 'Colour swatch', icon: <I><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none" /></I> },
];

interface Ghost {
  tool: Tool;
  x: number;
  y: number;
}

export function Toolbar() {
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const activeTool = useStore((s) => s.tool);
  const trashCount = useStore((s) => Object.values(s.elements).filter((e) => e.section === 'trash').length);
  const dragging = useRef(false);

  const activate = (tool: Tool) => {
    if (tool.type === 'line') {
      setState({ tool: getState().tool === 'line' ? null : 'line', selection: [], editingId: null });
      return;
    }
    createElement(tool.type, centerPlacement());
  };

  const dropAt = (tool: Tool, clientX: number, clientY: number) => {
    if (!isOverCanvas(clientX, clientY)) return;
    const p = screenToWorld(clientX, clientY);
    const column = columnAt(p);
    const at = { x: p.x - 30, y: p.y - 20, ...(column ? { columnId: column.id, index: column.index } : {}) };
    if (tool.type === 'image' || tool.type === 'file') {
      pickFiles(tool.type === 'image' ? 'image/*' : '*/*', (files) => addFiles(files, at));
    } else {
      createElement(tool.type, at);
    }
  };

  // Dragging a tool onto the board creates it where it is dropped; a plain click is handled by onClick.
  const onPointerDown = (e: RPointerEvent, tool: Tool) => {
    if (e.button !== 0 || tool.type === 'line') return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    dragging.current = false;
    const move = (ev: PointerEvent) => {
      if (!dragging.current && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      dragging.current = true;
      setGhost({ tool, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGhost(null);
      if (dragging.current) dropAt(tool, ev.clientX, ev.clientY);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onClick = (tool: Tool) => {
    if (dragging.current) {
      dragging.current = false;
      return;
    }
    activate(tool);
  };

  return (
    <>
      <nav className="toolbar" aria-label="Add to board">
        {TOOLS.map((tool) => (
          <button
            key={tool.type}
            className={`tool ${activeTool === tool.type ? 'active' : ''}`}
            title={`${tool.hint} — click or drag onto the board`}
            onPointerDown={(e) => onPointerDown(e, tool)}
            onClick={() => onClick(tool)}
          >
            {tool.icon}
            <span>{tool.label}</span>
          </button>
        ))}
        <div className="toolbar-spacer" />
        <button className="tool" title="Trash" onClick={() => setState({ panel: getState().panel === 'trash' ? null : 'trash' })}>
          <I d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
          <span>Trash{trashCount ? ` ${trashCount}` : ''}</span>
        </button>
      </nav>
      {ghost && (
        <div className="tool-ghost" style={{ left: ghost.x, top: ghost.y }}>
          {ghost.tool.icon}
          <span>{ghost.tool.label}</span>
        </div>
      )}
    </>
  );
}
