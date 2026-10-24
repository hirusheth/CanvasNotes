import { createContext, useContext, type PointerEvent, type MouseEvent } from 'react';
import type { El, Rect } from '../types';

export type DropTarget = { kind: 'column'; id: string; index: number } | { kind: 'board'; id: string };

export interface DragState {
  ids: string[];
  dx: number;
  dy: number;
  target: DropTarget | null;
  startRects: Map<string, Rect>;
}

export interface CanvasApi {
  drag: DragState | null;
  // Card held long enough on a touch screen to be dragged.
  armedId: string | null;
  onItemPointerDown(e: PointerEvent, el: El): void;
  onItemDoubleClick(e: MouseEvent, el: El): void;
  onItemContextMenu(e: MouseEvent, el: El): void;
  observe(node: HTMLElement | null): void;
}

export const CanvasContext = createContext<CanvasApi | null>(null);

export function useCanvas(): CanvasApi {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas outside Canvas');
  return ctx;
}
