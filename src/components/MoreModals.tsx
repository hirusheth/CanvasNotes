import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { load, patchElement, setState, toast, useElement } from '../store';
import type { ElementOf } from '../types';
import * as api from '../api';
import { addAiIdeas, insertSearchImage, type ImageResult } from '../moreActions';
import { formatSize } from '../elements/ElementBody';
import { timeAgo } from './Panels';
import { hour12, numLocale } from '../locale';
import { t } from '../i18n';

const close = () => setState({ modal: null });

function useEscape() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}

function Dialog({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  useEscape();
  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`dialog ${wide ? 'wide-dialog' : ''}`} role="dialog" aria-label={title}>
        <div className="side-head">
          <h2>{t(title)}</h2>
          <button className="icon-btn" onClick={close} title={t('Close')}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- crop

type Box = { x: number; y: number; w: number; h: number };

export function CropModal({ id }: { id: string }) {
  const el = useElement(id) as ElementOf<'image'> | undefined;
  const [box, setBox] = useState<Box>(() => (el?.type === 'image' && el.content.crop) || { x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: string; sx: number; sy: number; start: Box } | null>(null);
  if (!el || el.type !== 'image') return null;

  const onDown = (e: PointerEvent, mode: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: box };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    const r = stage.current?.getBoundingClientRect();
    if (!d || !r) return;
    const dx = (e.clientX - d.sx) / r.width;
    const dy = (e.clientY - d.sy) / r.height;
    let { x, y, w, h } = d.start;
    if (d.mode === 'move') {
      x = Math.min(1 - w, Math.max(0, x + dx));
      y = Math.min(1 - h, Math.max(0, y + dy));
    } else {
      if (d.mode.includes('w')) {
        const nx = Math.min(x + w - 0.05, Math.max(0, x + dx));
        w += x - nx;
        x = nx;
      }
      if (d.mode.includes('e')) w = Math.min(1 - x, Math.max(0.05, w + dx));
      if (d.mode.includes('n')) {
        const ny = Math.min(y + h - 0.05, Math.max(0, y + dy));
        h += y - ny;
        y = ny;
      }
      if (d.mode.includes('s')) h = Math.min(1 - y, Math.max(0.05, h + dy));
    }
    setBox({ x, y, w, h });
  };

  return (
    <Dialog title={t('Crop image')} wide>
      <div className="crop-stage-wrap">
        <div ref={stage} className="crop-stage" style={{ aspectRatio: `1 / ${el.content.ratio ?? 0.66}` }} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
          <img src={el.content.src} alt="" draggable={false} />
          <div
            className="crop-box"
            style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
            onPointerDown={(e) => onDown(e, 'move')}
          >
            {['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].map((h) => (
              <span key={h} className={`crop-handle h-${h}`} onPointerDown={(e) => onDown(e, h)} />
            ))}
          </div>
        </div>
      </div>
      <div className="trash-actions dialog-actions">
        <button onClick={() => (patchElement(id, { content: { crop: null } }), close())}>{t('Reset')}</button>
        <button className="primary" onClick={() => (patchElement(id, { content: { crop: box } }), close())}>
          {t('Crop')}
        </button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- file info

export function FileInfoModal({ id }: { id: string }) {
  const el = useElement(id);
  const [dims, setDims] = useState<string | null>(null);
  const [bytes, setBytes] = useState<number | null>(null);
  const src = el?.type === 'image' || el?.type === 'file' ? el.content.src : '';
  useEffect(() => {
    if (!src) return;
    if (el?.type === 'image') {
      const img = new Image();
      img.onload = () => setDims(`${img.naturalWidth} × ${img.naturalHeight} px`);
      img.src = src;
    }
    fetch(src, { method: 'HEAD' })
      .then((r) => setBytes(Number(r.headers.get('content-length')) || null))
      .catch(() => {});
  }, [src, el?.type]);
  if (!el || (el.type !== 'image' && el.type !== 'file')) return null;
  const rows: [string, string][] = [
    ['Name', el.type === 'file' ? el.content.name : el.content.caption || src.split('/').pop() || ''],
    ['Type', el.type === 'file' ? el.content.mime : src.split('.').pop()?.toUpperCase() + ' image'],
    ['Size', el.type === 'file' ? formatSize(el.content.size) : bytes ? formatSize(bytes) : '…'],
    ...(dims ? ([['Dimensions', dims]] as [string, string][]) : []),
    ['Added', `${new Date(el.createdAt).toLocaleString(numLocale(), { hour12: hour12() })} (${timeAgo(el.createdAt)})`],
    ['Link', location.origin + src],
  ];
  return (
    <Dialog title={t('File info')}>
      <dl className="shortcut-list file-info">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{t(k)}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

// ---------------------------------------------------------------- image search

export function ImageSearchModal({ at }: { at?: { x: number; y: number; columnId?: string | null; index?: number } }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ImageResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/image-search?q=${encodeURIComponent(query)}`).then((r) => r.json());
      setResults(res.results ?? []);
      if (res.error) setError(res.error);
    } catch {
      setError('Image search is unavailable right now');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={t('Search images')} wide>
      <div className="image-search-bar">
        <input
          className="palette-input"
          autoFocus
          placeholder={t('Search images... (free images from Wikimedia Commons)')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
        />
        <button className="primary" onClick={() => void search()} disabled={busy}>
          {busy ? t('Searching…') : t('Search')}
        </button>
      </div>
      {error && <p className="side-sub">{error}</p>}
      <div className="image-grid scrollable">
        {results?.length === 0 && <p className="palette-empty">No images found for “{query}”.</p>}
        {results?.map((r) => (
          <button
            key={r.url}
            className="image-result"
            title={`${r.title}${r.author ? ` — ${r.author}` : ''} (${r.license})`}
            onClick={async () => {
              close();
              try {
                await insertSearchImage(r, at);
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Could not add that image');
              }
            }}
          >
            <img src={r.thumb} alt={r.title} loading="lazy" referrerPolicy="no-referrer" />
            <span>{r.author || r.title}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- AI ideas

export function AiIdeasModal({ at }: { at?: { x: number; y: number } }) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addAiIdeas(prompt, at);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={t('AI Ideas')}>
      <p className="side-sub">{t('Describe what you\'re working on. Claude suggests ideas and adds them to this board as a column of notes, using the notes already here as context.')}</p>
      <div className="export-section">
        <textarea
          className="ai-prompt"
          autoFocus
          rows={4}
          placeholder={t('e.g. Names for a small coffee shop by the beach')}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && void go()}
        />
        {error && <p className="error-text">{error}</p>}
        <button className="primary" onClick={() => void go()} disabled={busy || !prompt.trim()}>
          {busy ? t('Thinking…') : t('Get ideas')}
        </button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- board password

export function BoardPasswordModal({ id, mode }: { id: string; mode: 'set' | 'unlock' | 'remove' }) {
  const board = useElement(id) as ElementOf<'board'> | undefined;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = mode === 'set' ? 'Password protect board' : mode === 'unlock' ? t('Unlock board') : t('Remove password');
  const submit = async () => {
    if (mode === 'set' && password !== confirm) return setError("The passwords don't match");
    setBusy(true);
    setError(null);
    try {
      const url = mode === 'set' ? '/api/board-lock' : mode === 'unlock' ? '/api/board-unlock' : '/api/board-unlock-remove';
      await api.postJson(url, { id, password });
      close();
      await load();
      toast(mode === 'set' ? 'Board is now password protected' : mode === 'unlock' ? t('Board unlocked') : t('Password removed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={title}>
      <div className="export-section">
        <p className="side-sub">
          {mode === 'set'
            ? `“${board?.content.title || t('This board')}” and everything inside it will stay hidden until the password is entered. It locks again when the browser closes.`
            : mode === 'unlock'
              ? t('Enter password to view this board')
              : t('Enter the current password to remove protection.')}
        </p>
        <input type="password" autoFocus placeholder={t('Password')} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && mode !== 'set' && void submit()} />
        {mode === 'set' && <input type="password" placeholder={t('Confirm password')} value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />}
        {error && <p className="error-text">{error}</p>}
        <button className="primary" onClick={() => void submit()} disabled={busy || !password}>
          {mode === 'set' ? 'Protect board' : mode === 'unlock' ? t('Unlock board') : t('Remove password')}
        </button>
      </div>
    </Dialog>
  );
}
