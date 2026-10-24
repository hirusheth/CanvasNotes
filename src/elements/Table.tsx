import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { patchElement, startEditing } from '../store';
import type { CellStyle, CellType, ElementOf, TableContent } from '../types';
import { colName, evaluateGrid, FORMULA_MESSAGES, type Evaluated } from '../formula';

const CELL_TYPES: { value: CellType; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date & Time' },
];
const CELL_COLORS = [null, '#fff3bf', '#ffe0cc', '#ffd9df', '#e9e0ff', '#d7ecff', '#d5f5e6', '#e2e5ea'];

const key = (r: number, c: number) => `${r}:${c}`;

function formatValue(v: Evaluated, style: CellStyle | undefined, raw: string): string {
  if (v.error) return v.error;
  const type = style?.type ?? 'auto';
  const value = v.value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    switch (type) {
      case 'currency':
        return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
      case 'percentage':
        return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
      case 'text':
        return raw;
      case 'date':
        return raw;
      default:
        return raw.startsWith('=') ? value.toLocaleString(undefined, { maximumFractionDigits: 6 }) : raw.trim();
    }
  }
  if (type === 'date' && value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return String(value);
}

function align(style: CellStyle | undefined, v: Evaluated): 'left' | 'center' | 'right' {
  if (style?.align) return style.align;
  if (style?.type === 'checkbox') return 'center';
  return typeof v.value === 'number' && !v.error ? 'right' : 'left';
}

interface Menu {
  x: number;
  y: number;
  r: number;
  c: number;
}

export function TableBody({ el, editing }: { el: ElementOf<'table'>; editing: boolean }) {
  const { cells, styles = {}, header = true, title } = el.content;
  const values = useMemo(() => evaluateGrid(cells), [cells]);
  const cols = Math.max(1, ...cells.map((r) => r.length));
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const update = (patch: Partial<TableContent>, coalesce?: string) => patchElement(el.id, { content: patch }, coalesce ? { coalesce } : undefined);

  const setCell = (r: number, c: number, text: string) => {
    const next = cells.map((row) => [...row]);
    while (next[r].length < cols) next[r].push('');
    next[r][c] = text;
    update({ cells: next }, `table:${el.id}:${r}:${c}`);
  };

  useEffect(() => {
    if (editing && !active) {
      // Start in the first empty cell, so a new table fills from its top-left.
      const flat = cells.flatMap((row, r) => row.map((v, c) => ({ r, c, v })));
      const empty = flat.find((x) => !x.v.trim());
      setActive(empty ? { r: empty.r, c: empty.c } : { r: 0, c: 0 });
    }
    if (!editing) setActive(null);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (editing && active) inputs.current.get(key(active.r, active.c))?.focus();
  }, [editing, active]);

  const move = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(cells.length - 1, r));
    const cc = Math.max(0, Math.min(cols - 1, c));
    setActive({ r: rr, c: cc });
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!e.shiftKey && c === cols - 1 && r === cells.length - 1) {
        addRow(cells.length);
        setActive({ r: r + 1, c: 0 });
      } else if (e.shiftKey) move(c === 0 ? r - 1 : r, c === 0 ? cols - 1 : c - 1);
      else move(c === cols - 1 ? r + 1 : r, c === cols - 1 ? 0 : c + 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!e.shiftKey && r === cells.length - 1) {
        addRow(cells.length);
        setActive({ r: r + 1, c });
      } else move(r + (e.shiftKey ? -1 : 1), c);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(r - 1, c);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(r + 1, c);
    } else if (e.key === 'Escape') {
      startEditing(null);
    }
  };

  const addRow = (at: number) => {
    const next = cells.map((row) => [...row]);
    next.splice(at, 0, Array(cols).fill(''));
    update({ cells: next, styles: shiftStyles(styles, 'row', at, 1) });
  };
  const addCol = (at: number) => {
    update({ cells: cells.map((row) => [...row.slice(0, at), '', ...row.slice(at)]), styles: shiftStyles(styles, 'col', at, 1) });
  };
  const removeRow = (r: number) => {
    if (cells.length <= 1) return;
    update({ cells: cells.filter((_, i) => i !== r), styles: shiftStyles(styles, 'row', r, -1) });
  };
  const removeCol = (c: number) => {
    if (cols <= 1) return;
    update({ cells: cells.map((row) => row.filter((_, i) => i !== c)), styles: shiftStyles(styles, 'col', c, -1) });
  };
  const moveRow = (r: number, d: number) => {
    const t = r + d;
    if (t < 0 || t >= cells.length) return;
    const next = cells.map((row) => [...row]);
    [next[r], next[t]] = [next[t], next[r]];
    update({ cells: next });
  };
  const moveCol = (c: number, d: number) => {
    const t = c + d;
    if (t < 0 || t >= cols) return;
    update({
      cells: cells.map((row) => {
        const n = [...row];
        [n[c], n[t]] = [n[t] ?? '', n[c] ?? ''];
        return n;
      }),
    });
  };
  const styleCell = (r: number, c: number, patch: Partial<CellStyle>, wholeColumn = false) => {
    const next = { ...styles };
    const targets = wholeColumn ? cells.map((_, i) => key(i, c)) : [key(r, c)];
    for (const k of targets) next[k] = { ...next[k], ...patch };
    update({ styles: next });
  };

  const onContext = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, r, c });
  };

  return (
    <div className="card table-card">
      {editing ? (
        <input
          className="table-title-input"
          defaultValue={title}
          placeholder="New Table"
          data-nodrag
          onChange={(e) => update({ title: e.target.value }, `table-title:${el.id}`)}
          onKeyDown={(e) => e.key === 'Escape' && startEditing(null)}
        />
      ) : (
        title && <div className="table-title">{title}</div>
      )}
      <div className="table-scroll scrollable">
        <table className={header ? 'has-header' : ''}>
          {editing && (
            <thead>
              <tr>
                {Array.from({ length: cols }, (_, c) => (
                  <th key={c} className="col-label" onContextMenu={(e) => onContext(e, active?.r ?? 0, c)}>
                    {colName(c)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {cells.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: cols }, (_, c) => {
                  const raw = row[c] ?? '';
                  const st = styles[key(r, c)];
                  const v = values[r]?.[c] ?? { value: '' };
                  const isActive = editing && active?.r === r && active?.c === c;
                  const style = { textAlign: align(st, v), background: st?.bg ?? undefined, fontWeight: st?.bold || (header && r === 0) ? 600 : undefined };
                  return (
                    <td key={c} style={style} title={v.error ? FORMULA_MESSAGES[v.error] : undefined} className={v.error ? 'cell-error' : ''} onContextMenu={(e) => onContext(e, r, c)}>
                      {st?.type === 'checkbox' ? (
                        <input
                          type="checkbox"
                          data-nodrag
                          checked={/^(true|1|yes|x)$/i.test(raw.trim())}
                          onChange={(e) => setCell(r, c, e.target.checked ? 'TRUE' : 'FALSE')}
                        />
                      ) : editing ? (
                        <input
                          ref={(n) => {
                            if (n) inputs.current.set(key(r, c), n);
                            else inputs.current.delete(key(r, c));
                          }}
                          className={`cell-input ${isActive ? 'active' : ''}`}
                          value={isActive ? raw : raw.startsWith('=') ? formatValue(v, st, raw) : raw}
                          style={{ textAlign: style.textAlign }}
                          onFocus={() => !isActive && setActive({ r, c })}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          onKeyDown={(e) => onKey(e, r, c)}
                        />
                      ) : (
                        <span className="cell-text">{formatValue(v, st, raw)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="table-actions" data-nodrag>
          <button onClick={() => addRow(cells.length)}>+ Row</button>
          <button onClick={() => addCol(cols)}>+ Column</button>
          <label>
            <input type="checkbox" checked={header} onChange={(e) => update({ header: e.target.checked })} /> Header row
          </label>
          {active && <span className="table-ref">{colName(active.c)}{active.r + 1}</span>}
        </div>
      )}
      {menu && (
        <TableMenu
          menu={menu}
          style={styles[key(menu.r, menu.c)]}
          onClose={() => setMenu(null)}
          actions={{
            addRowAbove: () => addRow(menu.r),
            addRowBelow: () => addRow(menu.r + 1),
            addColLeft: () => addCol(menu.c),
            addColRight: () => addCol(menu.c + 1),
            removeRow: () => removeRow(menu.r),
            removeCol: () => removeCol(menu.c),
            moveRowUp: () => moveRow(menu.r, -1),
            moveRowDown: () => moveRow(menu.r, 1),
            moveColLeft: () => moveCol(menu.c, -1),
            moveColRight: () => moveCol(menu.c, 1),
            clear: () => setCell(menu.r, menu.c, ''),
            style: (patch, col) => styleCell(menu.r, menu.c, patch, col),
          }}
        />
      )}
    </div>
  );
}

function shiftStyles(styles: Record<string, CellStyle>, axis: 'row' | 'col', at: number, delta: number) {
  const out: Record<string, CellStyle> = {};
  for (const [k, v] of Object.entries(styles)) {
    let [r, c] = k.split(':').map(Number);
    const idx = axis === 'row' ? r : c;
    if (delta < 0 && idx === at) continue;
    if (idx >= at) {
      if (axis === 'row') r += delta;
      else c += delta;
    }
    out[`${r}:${c}`] = v;
  }
  return out;
}

function TableMenu({
  menu,
  style,
  onClose,
  actions,
}: {
  menu: Menu;
  style?: CellStyle;
  onClose(): void;
  actions: Record<'addRowAbove' | 'addRowBelow' | 'addColLeft' | 'addColRight' | 'removeRow' | 'removeCol' | 'moveRowUp' | 'moveRowDown' | 'moveColLeft' | 'moveColRight' | 'clear', () => void> & {
    style(patch: Partial<CellStyle>, wholeColumn?: boolean): void;
  };
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [onClose]);
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  // Portalled: a fixed-position menu inside the scaled canvas would be positioned relative to it.
  return createPortal(
    <div
      ref={ref}
      className="menu table-menu"
      style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 460) }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button onClick={run(actions.addRowAbove)}>Add Row Above</button>
      <button onClick={run(actions.addRowBelow)}>Add Row Below</button>
      <button onClick={run(actions.addColLeft)}>Add Column Left</button>
      <button onClick={run(actions.addColRight)}>Add Column Right</button>
      <div className="menu-sep" />
      <div className="menu-row">
        <button title="Move row up" onClick={run(actions.moveRowUp)}>↑</button>
        <button title="Move row down" onClick={run(actions.moveRowDown)}>↓</button>
        <button title="Move column left" onClick={run(actions.moveColLeft)}>←</button>
        <button title="Move column right" onClick={run(actions.moveColRight)}>→</button>
      </div>
      <div className="menu-sep" />
      <div className="menu-label">Cell type (whole column)</div>
      <div className="menu-chips">
        {CELL_TYPES.map((t) => (
          <button key={t.value} className={(style?.type ?? 'auto') === t.value ? 'active' : ''} onClick={run(() => actions.style({ type: t.value }, true))}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="menu-label">Alignment</div>
      <div className="menu-row">
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} className={style?.align === a ? 'active' : ''} onClick={run(() => actions.style({ align: a }))}>
            {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
          </button>
        ))}
        <button className={style?.bold ? 'active' : ''} onClick={run(() => actions.style({ bold: !style?.bold }))}>
          <b>B</b>
        </button>
      </div>
      <div className="menu-label">Colour</div>
      <div className="menu-colors">
        {CELL_COLORS.map((c) => (
          <button key={c ?? 'none'} className={`swatch-dot ${c ? '' : 'no-color'}`} style={c ? { background: c } : undefined} onClick={run(() => actions.style({ bg: c }))} />
        ))}
      </div>
      <div className="menu-sep" />
      <button onClick={run(actions.clear)}>Clear Cell</button>
      <button className="danger" onClick={run(actions.removeRow)}>
        Delete Row
      </button>
      <button className="danger" onClick={run(actions.removeCol)}>
        Delete Column
      </button>
    </div>,
    document.body,
  );
}
