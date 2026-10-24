import { useEffect, useState } from 'react';
import { getState, navigate, setState, useStore } from '../store';
import { allRects, centerOn, canvasRect, fitRects } from '../viewport';

// Presentation mode: hides the interface, goes full screen, and steps through
// the board's cards in reading order with the arrow keys or space.
export function Presentation() {
  const boardId = useStore((s) => s.boardId);
  const [step, setStep] = useState(-1);

  const order = () => {
    const { elements } = getState();
    return [...allRects()]
      .filter(([id]) => {
        const el = elements[id];
        return el && !el.columnId && el.type !== 'line';
      })
      .sort(([, a], [, b]) => (Math.abs(a.y - b.y) > 60 ? a.y - b.y : a.x - b.x));
  };

  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    const t = setTimeout(() => fitRects(getState().boardId, [...allRects().values()]), 60);
    const onFs = () => {
      if (!document.fullscreenElement) setState({ presenting: false });
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      clearTimeout(t);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    setStep(-1);
  }, [boardId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const items = order();
      if (e.key === 'Escape') {
        setState({ presenting: false });
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        go(Math.min(items.length - 1, step + 1), items);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        go(Math.max(-1, step - 1), items);
      } else if (e.key === 'Enter' && step >= 0) {
        const el = getState().elements[items[step]?.[0]];
        if (el?.type === 'board') navigate(el.id);
      } else if (e.key === 'Backspace') {
        const parent = getState().elements[boardId]?.parentId;
        if (parent) navigate(parent);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const go = (next: number, items = order()) => {
    setStep(next);
    if (next < 0) return fitRects(boardId, items.map(([, r]) => r));
    const r = items[next]?.[1];
    if (!r) return;
    const c = canvasRect();
    const zoom = c ? Math.min(2, (c.width * 0.7) / r.w, (c.height * 0.7) / r.h) : 1;
    centerOn(boardId, r, zoom);
  };

  const total = order().length;
  return (
    <div className="presentation-hud">
      <span>{step < 0 ? 'Overview' : `${step + 1} / ${total}`}</span>
      <span className="hud-hint">← → to move · Enter opens a board · Esc to exit</span>
      <button onClick={() => setState({ presenting: false })}>Exit</button>
    </div>
  );
}
