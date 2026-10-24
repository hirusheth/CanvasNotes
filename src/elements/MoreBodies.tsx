import { useEffect, useRef, useState } from 'react';
import { getState, patchElement, setState, startEditing, uid, useStore } from '../store';
import { CAPTION_TYPES, type El, type ElementOf } from '../types';
import { htmlToText } from '../actions';

const stopEditing = () => startEditing(null);

// ---------------------------------------------------------------- heading

export function HeadingBody({ el, editing }: { el: ElementOf<'heading'>; editing: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [editing]);
  const size = el.content.size ?? 'large';
  if (editing) {
    return (
      <textarea
        ref={ref}
        className={`heading heading-${size} heading-input`}
        defaultValue={el.content.text}
        placeholder="Heading"
        rows={1}
        onInput={(e) => {
          const t = e.currentTarget;
          t.style.height = 'auto';
          t.style.height = `${t.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onBlur={(e) => {
          patchElement(el.id, { content: { text: e.target.value.trim() } });
          stopEditing();
        }}
      />
    );
  }
  return <div className={`heading heading-${size} ${el.content.text ? '' : 'placeholder'}`}>{el.content.text || 'Heading'}</div>;
}

// ---------------------------------------------------------------- board shortcut (alias)

export function AliasBody({ el }: { el: ElementOf<'alias'> }) {
  const target = useStore((s) => s.elements[el.content.boardId]);
  const missing = !target || target.type !== 'board' || target.section === 'trash';
  const board = !missing ? (target as ElementOf<'board'>) : null;
  return (
    <div className="board-card alias-card">
      <div className={`board-tile ${board?.color ? `tile-${board.color}` : ''}`}>
        <span className="board-icon">
          {board?.content.iconImage ? <img src={board.content.iconImage} alt="" draggable={false} /> : board?.content.icon || '▦'}
        </span>
        <span className="alias-badge" title="Shortcut">
          ↪
        </span>
      </div>
      <div className="board-title">{missing ? 'Board not found' : board!.content.title || 'Untitled board'}</div>
      <div className="board-meta">Shortcut</div>
    </div>
  );
}

// ---------------------------------------------------------------- comment thread

function timeLabel(t: number) {
  const d = new Date(t);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function CommentBody({ el, editing }: { el: ElementOf<'comment'>; editing: boolean }) {
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { comments } = el.content;
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const list = editId
      ? comments.map((c) => (c.id === editId ? { ...c, text, editedAt: Date.now() } : c))
      : [...comments, { id: uid(), text, at: Date.now() }];
    patchElement(el.id, { content: { comments: list } });
    setDraft('');
    setEditId(null);
  };

  return (
    <div className="card comment-card">
      <div className="comment-head">
        <span className="comment-icon">💬</span>
        <span>{comments.length ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : 'Comment'}</span>
      </div>
      <ul className="comment-list">
        {comments.map((c, i) => (
          <li key={c.id}>
            <div className="comment-meta">
              <strong>{i === 0 ? 'You' : 'Reply'}</strong> · {timeLabel(c.at)}
              {c.editedAt ? ' · edited' : ''}
              {editing && (
                <span className="comment-tools" data-nodrag>
                  <button onClick={() => (setEditId(c.id), setDraft(c.text), inputRef.current?.focus())}>Edit</button>
                  <button onClick={() => patchElement(el.id, { content: { comments: comments.filter((x) => x.id !== c.id) } })}>Delete</button>
                </span>
              )}
            </div>
            <div className="comment-text">{c.text}</div>
          </li>
        ))}
      </ul>
      {(editing || comments.length === 0) && (
        <div className="comment-form" data-nodrag={editing ? true : undefined}>
          {editing ? (
            <>
              <textarea
                ref={inputRef}
                value={draft}
                rows={2}
                placeholder={editId ? 'Update your comment…' : comments.length ? 'Reply…' : 'Write a comment…'}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  } else if (e.key === 'Escape') stopEditing();
                }}
              />
              <button className="primary" onClick={send} disabled={!draft.trim()}>
                {editId ? 'Save' : comments.length ? 'Reply' : 'Send'}
              </button>
            </>
          ) : (
            <div className="placeholder">Write a comment…</div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- document card

export function wordCount(html: string) {
  const text = htmlToText(html);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

export function DocumentBody({ el }: { el: ElementOf<'document'> }) {
  const text = htmlToText(el.content.html);
  const words = wordCount(el.content.html);
  return (
    <div className="card document-card">
      <div className="doc-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v4h4M9 12h6M9 15.5h6M9 9h3" />
        </svg>
      </div>
      <div className="doc-text">
        <div className={`doc-title ${el.content.title ? '' : 'placeholder'}`}>{el.content.title || 'New Document'}</div>
        <div className="doc-excerpt">{text ? text.slice(0, 160) : 'Double-click to start typing'}</div>
        <div className="doc-meta">
          {words} word{words === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  );
}

export function openDocument(id: string) {
  setState({ modal: { kind: 'document', id }, editingId: null });
}

// ---------------------------------------------------------------- shared card extras

export function CardExtras({ el }: { el: El }) {
  // Select a string so the store snapshot is stable between renders.
  const labelKey = useStore((s) =>
    (el.labels ?? [])
      .map((id) => s.elements[id])
      .filter((l) => l?.type === 'label')
      .map((l) => `${l!.id}:${l!.updatedAt}`)
      .join(','),
  );
  const labels = labelKey ? labelKey.split(',').map((k) => getState().elements[k.split(':')[0]] as ElementOf<'label'>) : [];
  const editingCaption = useStore((s) => s.captionEditId === el.id);
  const showCaption = CAPTION_TYPES.includes(el.type) && (el.caption || editingCaption);
  if (!labels.length && !showCaption && !el.locked) return null;
  return (
    <>
      {el.locked && (
        <span className="lock-badge" title="Position locked">
          🔒
        </span>
      )}
      {labels.length > 0 && (
        <div className="label-row">
          {labels.map((l) => (
            <span key={l.id} className="label-chip" style={{ background: l.content.color }}>
              {l.content.name}
            </span>
          ))}
        </div>
      )}
      {showCaption &&
        (editingCaption ? (
          <CaptionInput el={el} />
        ) : (
          <div className="card-caption" onDoubleClick={(e) => (e.stopPropagation(), setState({ captionEditId: el.id }))}>
            {el.caption}
          </div>
        ))}
    </>
  );
}

function CaptionInput({ el }: { el: El }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <textarea
      ref={ref}
      className="card-caption caption-edit"
      data-nodrag
      defaultValue={el.caption ?? ''}
      placeholder="Add a description"
      rows={2}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const caption = e.target.value.trim() || null;
        if (caption !== (getState().elements[el.id]?.caption ?? null)) patchElement(el.id, { caption });
        setState({ captionEditId: null });
      }}
    />
  );
}
