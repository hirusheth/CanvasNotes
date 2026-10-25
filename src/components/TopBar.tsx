import { useEffect, useRef, useState } from 'react';
import { boardPath, getState, navigate, patchElement, redo, setState, setTheme, toast, undo, useStore, load } from '../store';
import { allRects, fitRects, getViewport, setViewport, useViewport, zoomAt } from '../viewport';
import { ROOT_ID, type El } from '../types';
import * as api from '../api';
import { t } from '../i18n';

export function TopBar() {
  const boardId = useStore((s) => s.boardId);
  // Recompute the trail when any board title changes.
  const trailKey = useStore((s) => boardPath(s.boardId).map((b) => `${b.id}\u0000${b.title}`).join('\u0001'));
  const trail = trailKey.split('\u0001').map((p) => {
    const [id, title] = p.split('\u0000');
    return { id, title };
  });
  const saveStatus = useStore((s) => s.saveStatus);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const theme = useStore((s) => s.theme);
  const vp = useViewport(boardId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);

  return (
    <header className="topbar">
      <div className="brand" onClick={() => navigate(ROOT_ID)} title={t('Home')}>
        <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden>
          <rect x="3" y="5" width="12" height="16" rx="2.5" fill="#f4c95d" />
          <rect x="17" y="9" width="12" height="18" rx="2.5" fill="#61a5c2" />
        </svg>
      </div>
      <nav className="crumbs" aria-label={t('Boards')}>
        {trail.map((b, i) => {
          const last = i === trail.length - 1;
          if (last && renaming && b.id !== ROOT_ID) {
            return (
              <input
                key={b.id}
                className="crumb-input"
                autoFocus
                defaultValue={b.title}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
                onBlur={(e) => {
                  setRenaming(false);
                  const title = e.target.value.trim();
                  if (title) patchElement(b.id, { content: { title } });
                }}
              />
            );
          }
          return (
            <span key={b.id} className="crumb-wrap">
              {i > 0 && <span className="crumb-sep">/</span>}
              <button
                data-crumb={last ? undefined : b.id}
                className={`crumb ${last ? 'current' : ''}`}
                onClick={() => (last ? b.id !== ROOT_ID && setRenaming(true) : navigate(b.id))}
                title={last && b.id !== ROOT_ID ? 'Rename board' : `Go to ${b.title}`}
              >
                {b.title}
              </button>
            </span>
          );
        })}
      </nav>
      <div className="topbar-right">
        <span className={`save-status ${saveStatus}`} title={saveStatus === 'error' ? 'Retrying — the server could not be reached' : undefined}>
          {saveStatus === 'saved' ? t('Saved') : saveStatus === 'saving' ? t('Saving…') : t('Offline, retrying')}
        </span>
        <div className="btn-group">
          <button className="icon-btn" disabled={!canUndo} onClick={undo} title={t('Undo (Ctrl Z)')}>
            ↶
          </button>
          <button className="icon-btn" disabled={!canRedo} onClick={redo} title={t('Redo (Ctrl Shift Z)')}>
            ↷
          </button>
        </div>
        <div className="btn-group zoom">
          <button className="icon-btn" onClick={() => zoomAt(boardId, 1 / 1.2)} title={t('Zoom out (Ctrl −)')}>
            −
          </button>
          <button className="zoom-level" onClick={() => setViewport(boardId, { ...getViewport(boardId), zoom: 1 })} title={t('Reset to 100%')}>
            {Math.round(vp.zoom * 100)}%
          </button>
          <button className="icon-btn" onClick={() => zoomAt(boardId, 1.2)} title={t('Zoom in (Ctrl +)')}>
            +
          </button>
          <button className="icon-btn" onClick={() => fitRects(boardId, [...allRects().values()])} title={t('Fit everything (Shift 1)')}>
            ⤢
          </button>
        </div>
        <button className="icon-btn quick-btn" onClick={() => setState({ panel: getState().panel === 'quick' ? null : 'quick' })} title={t('Quick notes (from any device)')}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 4h10l4 4v12H5z" />
            <path d="M9 12h6M9 16h4M12 8v0" />
          </svg>
        </button>
        <button className="icon-btn hide-sm" onClick={() => setState({ panel: getState().panel === 'export' ? null : 'export' })} title={t('Export board')}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </svg>
        </button>
        <button className="icon-btn hide-sm" onClick={() => setState({ presenting: true, selection: [], editingId: null, panel: null })} title={t('Presentation mode (Ctrl Shift P)')}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M10 8v5l4-2.5zM8 21h8M12 17v4" />
          </svg>
        </button>
        <button className="search-btn" onClick={() => setState({ panel: 'search' })} title={t('Search (Ctrl K)')}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <span>{t('Search')}</span>
          <kbd>{t('Ctrl K')}</kbd>
        </button>
        <button
          className="icon-btn hide-sm"
          onClick={() => setTheme(theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system')}
          title={`Theme: ${theme}`}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            {theme === 'dark' ? (
              <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
            ) : theme === 'light' ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
              </>
            )}
          </svg>
        </button>
        <div className="menu-anchor">
          <button className="icon-btn" onClick={() => setMenuOpen((o) => !o)} title={t('More')}>
            ⋯
          </button>
          {menuOpen && <MoreMenu onClose={() => setMenuOpen(false)} />}
        </div>
      </div>
    </header>
  );
}

function MoreMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('.menu-anchor')) onClose();
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [onClose]);

  const importFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const elements: El[] = Array.isArray(data) ? data : data.elements;
        if (!Array.isArray(elements)) throw new Error('No elements in file');
        const replace = window.confirm(
          `Import ${elements.length} items.\n\nOK = replace everything with this backup\nCancel = merge into current boards`,
        );
        await api.importElements(elements, replace ? 'replace' : 'merge');
        await load();
        toast(t('Imported {n} items', { n: elements.length }));
      } catch (err) {
        toast(`Import failed: ${err instanceof Error ? err.message : err}`);
      }
    };
    input.click();
  };

  return (
    <div ref={ref} className="menu dropdown" role="menu">
      <a className="menu-link" href="/api/export" download onClick={onClose}>
        {t('Export backup (JSON)')}
      </a>
      <button
        onClick={() => {
          onClose();
          importFile();
        }}
      >
        {t('Import backup…')}
      </button>
      <div className="menu-sep" />
      {(
        [
          ['Settings', 'settings'],
          ['Templates', 'templates'],
          ['Unsorted', 'inbox'],
          ['Export board', 'export'],
          ['Trash', 'trash'],
        ] as const
      ).map(([label, panel]) => (
        <button
          key={panel}
          onClick={() => {
            onClose();
            setState({ panel });
          }}
        >
          {t(label)}
        </button>
      ))}
      <button
        onClick={() => {
          onClose();
          setState({ modal: { kind: 'labels', ids: [] } });
        }}
      >
        {t('Manage labels')}
      </button>
      <div className="menu-sep" />
      <button
        onClick={() => {
          onClose();
          fitRects(getState().boardId, [...allRects().values()]);
        }}
      >
        {t('Zoom to fit')} <kbd>⇧ 1</kbd>
      </button>
      <button
        onClick={() => {
          onClose();
          setState({ presenting: true, selection: [], editingId: null, panel: null });
        }}
      >
        {t('Presentation mode')}
      </button>
      <button
        onClick={() => {
          onClose();
          setTheme(getState().theme === 'dark' ? 'light' : 'dark');
        }}
      >
        {t('Toggle dark mode')}
      </button>
      {getState().authEnabled && (
        <button className="danger" onClick={() => void api.logout()}>
          {t('Sign out')}
        </button>
      )}
      <button
        onClick={() => {
          onClose();
          setState({ panel: 'shortcuts' });
        }}
      >
        {t('Keyboard shortcuts')} <kbd>?</kbd>
      </button>
      <div className="menu-sep" />
      <div className="menu-note">{Object.keys(getState().elements).length} items stored locally</div>
    </div>
  );
}
