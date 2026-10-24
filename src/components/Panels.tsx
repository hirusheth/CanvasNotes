import { useEffect, useMemo, useRef, useState } from 'react';
import { boardPath, deleteForever, getState, navigate, restoreElement, setState, useStore } from '../store';
import { ROOT_ID, type El } from '../types';
import { plainText } from '../actions';

const TYPE_LABEL: Record<El['type'], string> = {
  note: 'Note',
  board: 'Board',
  column: 'Column',
  todo: 'To-do',
  image: 'Image',
  link: 'Link',
  line: 'Line',
  swatch: 'Colour',
  file: 'File',
};

function close() {
  setState({ panel: null });
}

function boardTitle(id: string) {
  return boardPath(id)
    .map((b) => b.title)
    .join(' / ');
}

// ---------------------------------------------------------------- search

export function SearchPalette() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const elements = useStore((s) => s.elements);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const live = Object.values(elements).filter((el) => el.section === 'canvas' && el.type !== 'line' && isLive(el, elements));
    if (!q) {
      return live
        .filter((el) => el.type === 'board')
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 12)
        .map((el) => ({ el, text: plainText(el), score: 0 }));
    }
    const terms = q.split(/\s+/);
    return live
      .map((el) => {
        const text = plainText(el);
        const lower = text.toLowerCase();
        if (!terms.every((t) => lower.includes(t))) return null;
        const score = (el.type === 'board' ? 3 : 0) + (lower.startsWith(terms[0]) ? 2 : 0) + el.updatedAt / 1e13;
        return { el, text, score };
      })
      .filter((r): r is { el: El; text: string; score: number } => !!r)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }, [query, elements]);

  const open = (el: El) => {
    close();
    if (el.type === 'board' && !query.trim()) return navigate(el.id);
    navigate(el.parentId);
    setState({ focusRequest: { id: el.id, nonce: Date.now() } });
  };

  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Search">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search notes, boards, to-dos, links…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && results[active]) open(results[active].el);
          }}
        />
        <div className="palette-hint">{query.trim() ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Recent boards'}</div>
        <ul className="palette-results scrollable">
          {results.map((r, i) => (
            <li key={r.el.id}>
              <button className={i === active ? 'active' : ''} onMouseEnter={() => setActive(i)} onClick={() => open(r.el)}>
                <span className={`type-pill type-${r.el.type}`}>{TYPE_LABEL[r.el.type]}</span>
                <span className="result-text">
                  <Highlight text={snippet(r.text, query)} query={query} />
                </span>
                <span className="result-where">{boardTitle(r.el.parentId)}</span>
              </button>
            </li>
          ))}
          {query.trim() && results.length === 0 && <li className="palette-empty">Nothing matches “{query}”.</li>}
        </ul>
      </div>
    </div>
  );
}

// An element is searchable only if every board above it is also on the canvas.
function isLive(el: El, elements: Record<string, El>) {
  const seen = new Set<string>();
  let parentId = el.parentId;
  if (el.columnId && elements[el.columnId]?.section !== 'canvas') return false;
  while (parentId !== ROOT_ID) {
    if (seen.has(parentId)) return false;
    seen.add(parentId);
    const parent = elements[parentId];
    if (!parent || parent.section !== 'canvas') return false;
    parentId = parent.parentId;
  }
  return true;
}

function snippet(text: string, query: string) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const first = query.trim().toLowerCase().split(/\s+/)[0];
  const i = first ? flat.toLowerCase().indexOf(first) : -1;
  if (i < 50) return flat.slice(0, 140) || '(empty)';
  return '…' + flat.slice(i - 40, i + 100);
}

function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${terms.join('|')})`, 'gi'));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

// ---------------------------------------------------------------- trash

export function TrashPanel() {
  const elements = useStore((s) => s.elements);
  const trashed = Object.values(elements)
    .filter((el) => el.section === 'trash')
    .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
  const [confirming, setConfirming] = useState(false);

  return (
    <aside className="side-panel" aria-label="Trash">
      <div className="side-head">
        <h2>Trash</h2>
        <button className="icon-btn" onClick={close} title="Close">
          ✕
        </button>
      </div>
      <p className="side-sub">Restore things you removed, or delete them for good.</p>
      <ul className="trash-list scrollable">
        {trashed.length === 0 && <li className="trash-empty">Trash is empty.</li>}
        {trashed.map((el) => (
          <li key={el.id}>
            <div className="trash-item">
              <span className={`type-pill type-${el.type}`}>{TYPE_LABEL[el.type]}</span>
              <div className="trash-text">
                <div className="trash-title">{plainText(el).slice(0, 90) || (el.type === 'image' ? 'Image' : 'Untitled')}</div>
                <div className="trash-where">
                  from {boardTitle(el.parentId)} · {timeAgo(el.trashedAt ?? el.updatedAt)}
                </div>
              </div>
            </div>
            <div className="trash-actions">
              <button
                onClick={() => {
                  restoreElement(el.id);
                }}
              >
                Restore
              </button>
              <button className="danger" onClick={() => deleteForever([el.id])}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {trashed.length > 0 && (
        <div className="side-foot">
          {confirming ? (
            <>
              <span>Delete {trashed.length} items forever?</span>
              <button
                className="danger solid"
                onClick={() => {
                  deleteForever(trashed.map((t) => t.id));
                  setConfirming(false);
                }}
              >
                Delete all
              </button>
              <button onClick={() => setConfirming(false)}>Cancel</button>
            </>
          ) : (
            <button className="danger" onClick={() => setConfirming(true)}>
              Empty trash
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

// ---------------------------------------------------------------- shortcuts

const SHORTCUTS: [string, string][] = [
  ['Double-click the board', 'New note'],
  ['Click a selected card / Enter', 'Edit it'],
  ['Double-click a board card', 'Open board'],
  ['Space + drag, middle-drag, or scroll', 'Move around'],
  ['Ctrl + scroll, Ctrl + / Ctrl −', 'Zoom'],
  ['Shift 1 / Ctrl 0', 'Fit everything / 100%'],
  ['Drag on empty space', 'Select several cards'],
  ['Shift + click', 'Add to selection'],
  ['Ctrl A', 'Select all'],
  ['Ctrl D', 'Duplicate'],
  ['Ctrl C / Ctrl V', 'Copy / paste cards, text, links, images'],
  ['Delete / Backspace', 'Move to Trash'],
  ['Arrow keys (Shift for 10×)', 'Nudge selection'],
  ['Ctrl Z / Ctrl Shift Z', 'Undo / redo'],
  ['Ctrl K', 'Search everything'],
  ['L', 'Line tool'],
  ['Esc', 'Stop editing, clear selection'],
  ['Backspace on the board', 'Go up a level when nothing is selected'],
  ['In a note: # ## * 1. [] > ``` ---', 'Heading, list, checklist, quote, code, divider'],
];

export function ShortcutsPanel() {
  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog" role="dialog" aria-label="Keyboard shortcuts">
        <div className="side-head">
          <h2>Shortcuts</h2>
          <button className="icon-btn" onClick={close} title="Close">
            ✕
          </button>
        </div>
        <dl className="shortcut-list">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !visible) return null;
  return (
    <div className="toast" role="status">
      {toast.text}
    </div>
  );
}

export function isPanelOpen() {
  return getState().panel !== null;
}
