import { useEffect, useMemo, useRef, useState } from 'react';
import { addElements, boardPath, commit, getState, makeElement, patchElement, patchElements, setState, useElement, useStore } from '../store';
import { LABEL_COLORS, LABELS_PARENT, ROOT_ID, type El, type ElementOf } from '../types';
import { RichText } from '../elements/RichText';
import { DrawingModal } from '../elements/Sketch';
import { wordCount } from '../elements/MoreBodies';
import { downloadText, htmlToMarkdown, htmlToWordDoc, printHtml, safeFileName } from '../markdown';
import { htmlToText, pickFiles } from '../actions';
import * as api from '../api';
import { AiIdeasModal, BoardPasswordModal, CropModal, FileInfoModal, ImageSearchModal } from './MoreModals';

const close = () => setState({ modal: null });

export function ModalHost() {
  const modal = useStore((s) => s.modal);
  if (!modal) return null;
  switch (modal.kind) {
    case 'draw':
      return <DrawingModal id={modal.id} />;
    case 'document':
      return <DocumentModal id={modal.id} />;
    case 'labels':
      return <LabelsModal ids={modal.ids} />;
    case 'icon':
      return <IconModal id={modal.id} />;
    case 'boardLink':
      return <BoardLinkModal onPick={modal.onPick} />;
    case 'crop':
      return <CropModal id={modal.id} />;
    case 'fileInfo':
      return <FileInfoModal id={modal.id} />;
    case 'imageSearch':
      return <ImageSearchModal at={modal.at} />;
    case 'aiIdeas':
      return <AiIdeasModal at={modal.at} />;
    case 'boardPassword':
      return <BoardPasswordModal id={modal.id} mode={modal.mode} />;
  }
}

function useEscape(fn: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fn();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fn]);
}

// ---------------------------------------------------------------- document editor

function DocumentModal({ id }: { id: string }) {
  const el = useElement(id) as ElementOf<'document'> | undefined;
  const [exportOpen, setExportOpen] = useState(false);
  useEscape(close);
  if (!el || el.type !== 'document') return null;
  const { title, html } = el.content;
  const words = wordCount(html);
  const name = safeFileName(title || 'document');
  const exports: [string, () => void][] = [
    ['Markdown', () => downloadText(`${name}.md`, `# ${title || 'Untitled'}\n\n${htmlToMarkdown(html)}\n`, 'text/markdown')],
    ['Plain text', () => downloadText(`${name}.txt`, `${title}\n\n${htmlToText(html)}\n`)],
    ['Word document', () => downloadText(`${name}.doc`, htmlToWordDoc(title, `<h1>${title}</h1>${html}`), 'application/msword')],
    ['PDF (print)', () => printHtml(title || 'Document', `<h1>${title}</h1>${html}`)],
  ];
  return (
    <div className="overlay doc-overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="doc-sheet" role="dialog" aria-label="Document">
        <div className="doc-sheet-bar">
          <span className="doc-sheet-meta">
            {words} word{words === 1 ? '' : 's'}
          </span>
          <div className="menu-anchor">
            <button className="ghost-btn" onClick={() => setExportOpen((o) => !o)}>
              Export as…
            </button>
            {exportOpen && (
              <div className="menu dropdown" role="menu">
                {exports.map(([label, fn]) => (
                  <button key={label} onClick={() => (fn(), setExportOpen(false))}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="primary" onClick={close}>
            Close
          </button>
        </div>
        <input
          className="doc-sheet-title"
          defaultValue={title}
          placeholder="New Document"
          autoFocus={!title}
          onChange={(e) => patchElement(id, { content: { title: e.target.value } }, { coalesce: `doc-title:${id}` })}
        />
        <div className="doc-sheet-body">
          <RichText
            html={html}
            placeholder="Start typing…"
            autofocus={!!title}
            onChange={(next) => patchElement(id, { content: { html: next } }, { coalesce: `doc:${id}` })}
            onDone={close}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- labels

export function useLabels(): ElementOf<'label'>[] {
  const key = useStore((s) =>
    Object.values(s.elements)
      .filter((e) => e.type === 'label' && e.section === 'canvas')
      .map((e) => `${e.id}:${e.updatedAt}`)
      .join(','),
  );
  return useMemo(
    () =>
      key
        ? (key.split(',').map((k) => getState().elements[k.split(':')[0]]) as ElementOf<'label'>[]).sort((a, b) => a.content.name.localeCompare(b.content.name))
        : [],
    [key],
  );
}

function labelUsage(labelId: string) {
  return Object.values(getState().elements).filter((e) => e.labels?.includes(labelId) && e.section === 'canvas').length;
}

function LabelsModal({ ids }: { ids: string[] }) {
  const labels = useLabels();
  const elements = useStore((s) => s.elements);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEscape(close);
  useEffect(() => inputRef.current?.focus(), []);
  const targets = ids.map((id) => elements[id]).filter(Boolean) as El[];
  const has = (labelId: string) => targets.length > 0 && targets.every((t) => t.labels?.includes(labelId));
  const toggle = (labelId: string) => {
    const on = !has(labelId);
    patchElements(
      Object.fromEntries(
        targets.map((t) => [t.id, { labels: on ? [...new Set([...(t.labels ?? []), labelId])] : (t.labels ?? []).filter((l) => l !== labelId) }]),
      ),
    );
  };
  const create = () => {
    const name = query.trim();
    if (!name) return;
    const label = makeElement('label', {
      parentId: LABELS_PARENT,
      content: { name, color: LABEL_COLORS[labels.length % LABEL_COLORS.length] },
      x: 0,
      y: 0,
      w: 0,
    });
    addElements([label], { select: false });
    setState({ selection: ids });
    patchElements(Object.fromEntries(targets.map((t) => [t.id, { labels: [...(t.labels ?? []), label.id] }])));
    setQuery('');
  };
  const shown = labels.filter((l) => l.content.name.toLowerCase().includes(query.trim().toLowerCase()));
  const exact = labels.some((l) => l.content.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog labels-dialog" role="dialog" aria-label="Labels">
        <div className="side-head">
          <h2>Labels</h2>
          <button className="icon-btn" onClick={close} title="Close">
            ✕
          </button>
        </div>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Enter label name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (shown.length === 1 && exact) toggle(shown[0].id);
              else create();
            }
          }}
        />
        <ul className="label-list scrollable">
          {labels.length === 0 && !query && <li className="palette-empty">Labels let you visually categorise your content.</li>}
          {shown.map((l) => (
            <li key={l.id}>
              {editing === l.id ? (
                <LabelEditor label={l} onDone={() => setEditing(null)} />
              ) : (
                <div className="label-line">
                  <label>
                    {targets.length > 0 && <input type="checkbox" checked={has(l.id)} onChange={() => toggle(l.id)} />}
                    <span className="label-chip" style={{ background: l.content.color }}>
                      {l.content.name}
                    </span>
                  </label>
                  <span className="label-usage">{labelUsage(l.id)} cards</span>
                  <button className="icon-btn small" onClick={() => setEditing(l.id)} title="Edit label">
                    ✎
                  </button>
                </div>
              )}
            </li>
          ))}
          {query.trim() && !exact && (
            <li>
              <button className="create-label" onClick={create}>
                Create label ‘{query.trim()}’
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function LabelEditor({ label, onDone }: { label: ElementOf<'label'>; onDone(): void }) {
  const [name, setName] = useState(label.content.name);
  const [confirm, setConfirm] = useState(false);
  const remove = () => {
    const changes: Record<string, El | null> = { [label.id]: null };
    for (const el of Object.values(getState().elements)) {
      if (el.labels?.includes(label.id)) changes[el.id] = { ...el, labels: el.labels.filter((l) => l !== label.id) } as El;
    }
    commit(changes);
    onDone();
  };
  return (
    <div className="label-editor">
      <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (patchElement(label.id, { content: { name } }), onDone())} />
      <div className="menu-colors">
        {LABEL_COLORS.map((c) => (
          <button key={c} className={`swatch-dot ${label.content.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => patchElement(label.id, { content: { color: c } })} />
        ))}
      </div>
      <div className="trash-actions">
        {confirm ? (
          <>
            <span>Delete this label?</span>
            <button className="danger solid" onClick={remove}>
              Yes
            </button>
            <button onClick={() => setConfirm(false)}>No</button>
          </>
        ) : (
          <>
            <button className="danger" onClick={() => setConfirm(true)}>
              Delete
            </button>
            <button
              onClick={() => {
                if (name.trim()) patchElement(label.id, { content: { name: name.trim() } });
                onDone();
              }}
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- board icon

const ICONS = '📁 📌 💡 ⭐ ❤️ 🔥 ✅ 📝 📚 🎨 🎬 🎵 📷 ✈️ 🏠 💼 🛒 💰 📈 🧠 🧪 🛠️ 🎯 🗓️ 🌱 🍳 🏃 🎮 🧳 🎁 🌍 🐶 ☕ 🚀 🔒 📦'.split(' ');

function IconModal({ id }: { id: string }) {
  const el = useElement(id) as ElementOf<'board'> | undefined;
  const [query, setQuery] = useState('');
  useEscape(close);
  if (!el || el.type !== 'board') return null;
  const set = (patch: Partial<ElementOf<'board'>['content']>) => patchElement(id, { content: patch });
  const letters = query.trim().slice(0, 2).toUpperCase();
  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog icon-dialog" role="dialog" aria-label="Board icon">
        <div className="side-head">
          <h2>Icon</h2>
          <button className="icon-btn" onClick={close} title="Close">
            ✕
          </button>
        </div>
        <input className="palette-input" placeholder="Type letters, numbers or paste an emoji" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="icon-grid">
          {letters && (
            <button onClick={() => (set({ icon: query.trim().slice(0, 2), iconImage: null }), close())} className="icon-letters">
              {letters}
            </button>
          )}
          {ICONS.map((i) => (
            <button key={i} onClick={() => (set({ icon: i, iconImage: null }), close())}>
              {i}
            </button>
          ))}
        </div>
        <div className="trash-actions icon-actions">
          <button
            onClick={() =>
              pickFiles('image/*', async ([file]) => {
                const up = await api.upload(file);
                set({ iconImage: up.url });
                close();
              })
            }
          >
            Upload an image (160 × 160 works best)
          </button>
          <button onClick={() => (set({ icon: '', iconImage: null }), close())}>Use default</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- board picker (for links to boards)

function BoardLinkModal({ onPick }: { onPick: (boardId: string, title: string) => void }) {
  const [query, setQuery] = useState('');
  const elements = useStore((s) => s.elements);
  useEscape(close);
  const boards = [{ id: ROOT_ID, title: 'Home' }].concat(
    Object.values(elements)
      .filter((e): e is ElementOf<'board'> => e.type === 'board' && e.section === 'canvas' && e.parentId !== LABELS_PARENT && e.id !== ROOT_ID)
      .map((b) => ({ id: b.id, title: b.content.title || 'Untitled board' })),
  );
  const shown = boards.filter((b) => b.title.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Link to board">
        <input className="palette-input" autoFocus placeholder="Search board..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className="palette-results scrollable">
          {shown.length === 0 && <li className="palette-empty">No boards found</li>}
          {shown.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => {
                  close();
                  onPick(b.id, b.title);
                }}
              >
                <span className="type-pill type-board">Board</span>
                <span className="result-text">{b.title}</span>
                <span className="result-where">{boardPath(b.id).slice(0, -1).map((p) => p.title).join(' / ')}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
