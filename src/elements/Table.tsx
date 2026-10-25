import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { patchElement, startEditing, toast } from '../store';
import type { CellStyle, CellType, ElementOf, TableContent } from '../types';
import { colName, evaluateGrid, FORMULA_MESSAGES, type Evaluated } from '../formula';
import { parseDelimited } from '../moreActions';
import { defaultCurrency, hour12, numLocale } from '../locale';
import { t } from '../i18n';

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
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY'];
const DATE_FORMATS: { value: NonNullable<CellStyle['dateFormat']>; label: string }[] = [
  { value: 'short', label: '1/2/26' },
  { value: 'medium', label: 'Jan 2, 2026' },
  { value: 'long', label: 'Friday, January 2, 2026' },
  { value: 'iso', label: '2026-01-02' },
];

const key = (r: number, c: number) => `${r}:${c}`;

type Cell = { r: number; c: number };
type Range = { r1: number; c1: number; r2: number; c2: number };

const norm = (a: Cell, b: Cell): Range => ({ r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) });
const inRange = (rg: Range | null, r: number, c: number) => !!rg && r >= rg.r1 && r <= rg.r2 && c >= rg.c1 && c <= rg.c2;

// The last cells copied from any table, so "Paste Values" can paste results instead of formulas.
let copiedValues: string[][] | null = null;

export function formatValue(v: Evaluated, style: CellStyle | undefined, raw: string): string {
  if (v.error) return v.error;
  const type = style?.type ?? 'auto';
  const value = v.value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    const decimals = style?.decimals ?? undefined;
    const digits = decimals === undefined || decimals === null ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
    const grouping = style?.thousands === false ? { useGrouping: false } : {};
    switch (type) {
      case 'currency':
        return value.toLocaleString(numLocale(), { style: 'currency', currency: style?.currency || defaultCurrency(), ...digits, ...grouping });
      case 'percentage':
        return value.toLocaleString(numLocale(), { style: 'percent', maximumFractionDigits: 2, ...digits, ...grouping });
      case 'number':
        return value.toLocaleString(numLocale(), { maximumFractionDigits: 6, ...digits, ...grouping });
      case 'text':
      case 'date':
        return raw;
      default:
        return raw.startsWith('=') || decimals !== undefined ? value.toLocaleString(numLocale(), { maximumFractionDigits: 6, ...digits, ...grouping }) : raw.trim();
    }
  }
  if (type === 'date' && value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const fmt = style?.dateFormat ?? 'medium';
      if (fmt === 'iso') return d.toISOString().slice(0, 10);
      const hasTime = /\d{1,2}:\d{2}/.test(String(value));
      const dateStyle = fmt === 'short' ? 'short' : fmt === 'long' ? 'full' : 'medium';
      return hasTime
        ? d.toLocaleString(numLocale(), { dateStyle, timeStyle: 'short', hour12: hour12() })
        : d.toLocaleDateString(numLocale(), { dateStyle });
    }
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
  const [active, setActive] = useState<Cell | null>(null);
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const range: Range | null = active && anchor && (anchor.r !== active.r || anchor.c !== active.c) ? norm(anchor, active) : null;

  const update = (patch: Partial<TableContent>, coalesce?: string) => patchElement(el.id, { content: patch }, coalesce ? { coalesce } : undefined);
  const grid = () => cells.map((row) => [...row, ...Array(Math.max(0, cols - row.length)).fill('')]);

  const setCell = (r: number, c: number, text: string) => {
    const next = grid();
    next[r][c] = text;
    update({ cells: next }, `table:${el.id}:${r}:${c}`);
  };

  useEffect(() => {
    if (editing && !active) {
      // Start in the first empty cell, so a new table fills from its top-left.
      const flat = cells.flatMap((row, r) => row.map((v, c) => ({ r, c, v })));
      const empty = flat.find((x) => !x.v.trim());
      setActive(empty ? { r: empty.r, c: empty.c } : { r: 0, c: 0 });
      setAnchor(null);
    }
    if (!editing) {
      setActive(null);
      setAnchor(null);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (editing && active) inputs.current.get(key(active.r, active.c))?.focus();
  }, [editing, active]);

  const move = (r: number, c: number, extend = false) => {
    const next = { r: Math.max(0, Math.min(cells.length - 1, r)), c: Math.max(0, Math.min(cols - 1, c)) };
    if (extend) setAnchor((a) => a ?? active);
    else setAnchor(null);
    setActive(next);
  };

  // The selected block (or the active cell) as a rectangle.
  const selection = (): Range | null => range ?? (active ? { r1: active.r, c1: active.c, r2: active.r, c2: active.c } : null);

  const clearRange = (rg: Range) => {
    const next = grid();
    for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) next[r][c] = '';
    update({ cells: next });
  };

  const copyRange = (rg: Range, cut = false) => {
    const raw: string[][] = [];
    const vals: string[][] = [];
    for (let r = rg.r1; r <= rg.r2; r++) {
      raw.push(cells[r].slice(rg.c1, rg.c2 + 1).map((v) => v ?? ''));
      vals.push(values[r].slice(rg.c1, rg.c2 + 1).map((v, i) => (v.error ? '' : formatValue(v, styles[key(r, rg.c1 + i)], cells[r][rg.c1 + i] ?? ''))));
    }
    copiedValues = vals;
    void navigator.clipboard?.writeText(raw.map((row) => row.join('\t')).join('\n')).catch(() => {});
    if (cut) clearRange(rg);
    toast(`${cut ? t('Cut') : t('Copied')} ${(rg.r2 - rg.r1 + 1) * (rg.c2 - rg.c1 + 1)} cells`);
  };

  // Paste a block of cells at the active cell, growing the table if needed.
  const pasteBlock = (block: string[][]) => {
    if (!active || !block.length) return;
    const next = grid();
    const needRows = active.r + block.length;
    const needCols = Math.max(cols, active.c + Math.max(...block.map((b) => b.length)));
    while (next.length < needRows) next.push(Array(needCols).fill(''));
    for (const row of next) while (row.length < needCols) row.push('');
    block.forEach((row, i) => row.forEach((v, j) => (next[active.r + i][active.c + j] = v)));
    update({ cells: next });
    setAnchor(active);
    setActive({ r: active.r + block.length - 1, c: active.c + Math.max(...block.map((b) => b.length)) - 1 });
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.trim())) return; // single value: let the input handle it
    e.preventDefault();
    pasteBlock(parseDelimited(text, text.includes('\t') ? '\t' : ','));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const mod = e.ctrlKey || e.metaKey;
    const rg = range;
    if (rg && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      clearRange(rg);
    } else if (mod && (e.key === 'c' || e.key === 'x') && rg) {
      e.preventDefault();
      copyRange(rg, e.key === 'x');
    } else if (mod && e.key === 'c' && !(e.currentTarget.selectionEnd! > e.currentTarget.selectionStart!)) {
      // Nothing highlighted in the input: copy the whole cell (so Paste Values works).
      copyRange({ r1: r, c1: c, r2: r, c2: c });
    } else if (mod && e.key === 'a' && e.shiftKey) {
      e.preventDefault();
      setAnchor({ r: 0, c: 0 });
      setActive({ r: cells.length - 1, c: cols - 1 });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (!e.shiftKey && c === cols - 1 && r === cells.length - 1) {
        addRow(cells.length);
        setAnchor(null);
        setActive({ r: r + 1, c: 0 });
      } else if (e.shiftKey) move(c === 0 ? r - 1 : r, c === 0 ? cols - 1 : c - 1);
      else move(c === cols - 1 ? r + 1 : r, c === cols - 1 ? 0 : c + 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!e.shiftKey && r === cells.length - 1) {
        addRow(cells.length);
        setAnchor(null);
        setActive({ r: r + 1, c });
      } else move(r + (e.shiftKey ? -1 : 1), c);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(r + (e.key === 'ArrowUp' ? -1 : 1), c, e.shiftKey);
    } else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      move(r, c + (e.key === 'ArrowLeft' ? -1 : 1), true);
    } else if (e.key === 'Escape') {
      if (rg) setAnchor(null);
      else startEditing(null);
    }
  };

  const addRow = (at: number) => {
    const next = grid();
    next.splice(at, 0, Array(cols).fill(''));
    update({ cells: next, styles: shiftStyles(styles, 'row', at, 1) });
  };
  const addCol = (at: number) => {
    update({ cells: grid().map((row) => [...row.slice(0, at), '', ...row.slice(at)]), styles: shiftStyles(styles, 'col', at, 1) });
  };
  const removeRows = (r1: number, r2: number) => {
    if (cells.length - (r2 - r1 + 1) < 1) return;
    let st = styles;
    for (let r = r2; r >= r1; r--) st = shiftStyles(st, 'row', r, -1);
    update({ cells: cells.filter((_, i) => i < r1 || i > r2), styles: st });
    setAnchor(null);
  };
  const removeCols = (c1: number, c2: number) => {
    if (cols - (c2 - c1 + 1) < 1) return;
    let st = styles;
    for (let c = c2; c >= c1; c--) st = shiftStyles(st, 'col', c, -1);
    update({ cells: grid().map((row) => row.filter((_, i) => i < c1 || i > c2)), styles: st });
    setAnchor(null);
  };
  const moveRow = (r: number, d: number) => {
    const t = r + d;
    if (t < 0 || t >= cells.length) return;
    const next = grid();
    [next[r], next[t]] = [next[t], next[r]];
    update({ cells: next });
  };
  const moveCol = (c: number, d: number) => {
    const t = c + d;
    if (t < 0 || t >= cols) return;
    update({
      cells: grid().map((row) => {
        [row[c], row[t]] = [row[t], row[c]];
        return row;
      }),
    });
  };
  // Style the selected block, or the whole column for cell types and formats.
  // Style a block of cells (the right-clicked cell or the selection), or whole columns.
  const styleCells = (patch: Partial<CellStyle>, wholeColumn = false, target?: Range) => {
    const rg = target ?? selection() ?? { r1: 0, c1: 0, r2: 0, c2: 0 };
    const next = { ...styles };
    for (let c = rg.c1; c <= rg.c2; c++) {
      const rows = wholeColumn ? cells.map((_, i) => i) : Array.from({ length: rg.r2 - rg.r1 + 1 }, (_, i) => rg.r1 + i);
      for (const r of rows) next[key(r, c)] = { ...next[key(r, c)], ...patch };
    }
    update({ styles: next });
  };

  const onContext = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!inRange(range, r, c)) {
      setAnchor(null);
      if (editing) setActive({ r, c });
    }
    setMenu({ x: e.clientX, y: e.clientY, r, c });
  };

  const menuRange = (m: Menu): Range => (range && inRange(range, m.r, m.c) ? range : { r1: m.r, c1: m.c, r2: m.r, c2: m.c });

  return (
    <div className="card table-card">
      {editing ? (
        <input
          className="table-title-input"
          defaultValue={title}
          placeholder={t('New Table')}
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
                  <th
                    key={c}
                    className="col-label"
                    title={t('Select column')}
                    onClick={() => {
                      setAnchor({ r: 0, c });
                      setActive({ r: cells.length - 1, c });
                    }}
                    onContextMenu={(e) => onContext(e, active?.r ?? 0, c)}
                  >
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
                    <td
                      key={c}
                      style={style}
                      title={v.error ? t(FORMULA_MESSAGES[v.error]) : undefined}
                      className={`${v.error ? 'cell-error' : ''} ${inRange(range, r, c) ? 'in-range' : ''}`}
                      onContextMenu={(e) => onContext(e, r, c)}
                      onMouseDown={(e) => {
                        if (editing && e.shiftKey && active) {
                          e.preventDefault();
                          setAnchor((a) => a ?? active);
                          setActive({ r, c });
                        }
                      }}
                    >
                      {st?.type === 'checkbox' ? (
                        <input type="checkbox" data-nodrag checked={/^(true|1|yes|x)$/i.test(raw.trim())} onChange={(e) => setCell(r, c, e.target.checked ? 'TRUE' : 'FALSE')} />
                      ) : editing ? (
                        <input
                          ref={(n) => {
                            if (n) inputs.current.set(key(r, c), n);
                            else inputs.current.delete(key(r, c));
                          }}
                          className={`cell-input ${isActive ? 'active' : ''}`}
                          value={isActive ? raw : raw.startsWith('=') || st?.type ? formatValue(v, st, raw) : raw}
                          style={{ textAlign: style.textAlign }}
                          onFocus={() => {
                            if (!isActive) {
                              setActive({ r, c });
                              setAnchor(null);
                            }
                          }}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          onKeyDown={(e) => onKey(e, r, c)}
                          onPaste={onPaste}
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
          <button onClick={() => addRow(cells.length)}>{t('+ Row')}</button>
          <button onClick={() => addCol(cols)}>{t('+ Column')}</button>
          <label>
            <input type="checkbox" checked={header} onChange={(e) => update({ header: e.target.checked })} /> {t('Header row')}
          </label>
          {active && (
            <span className="table-ref">
              {range ? `${colName(range.c1)}${range.r1 + 1}:${colName(range.c2)}${range.r2 + 1}` : `${colName(active.c)}${active.r + 1}`}
            </span>
          )}
        </div>
      )}
      {menu && (
        <TableMenu
          menu={menu}
          style={styles[key(menu.r, menu.c)]}
          multi={!!range && inRange(range, menu.r, menu.c)}
          onClose={() => setMenu(null)}
          actions={{
            addRowAbove: () => addRow(menuRange(menu).r1),
            addRowBelow: () => addRow(menuRange(menu).r2 + 1),
            addColLeft: () => addCol(menuRange(menu).c1),
            addColRight: () => addCol(menuRange(menu).c2 + 1),
            removeRow: () => removeRows(menuRange(menu).r1, menuRange(menu).r2),
            removeCol: () => removeCols(menuRange(menu).c1, menuRange(menu).c2),
            moveRowUp: () => moveRow(menu.r, -1),
            moveRowDown: () => moveRow(menu.r, 1),
            moveColLeft: () => moveCol(menu.c, -1),
            moveColRight: () => moveCol(menu.c, 1),
            clear: () => clearRange(menuRange(menu)),
            copy: () => copyRange(menuRange(menu)),
            cut: () => copyRange(menuRange(menu), true),
            paste: async () => {
              const text = await navigator.clipboard?.readText().catch(() => '');
              if (!editing) startEditing(el.id);
              setActive({ r: menu.r, c: menu.c });
              if (text) setTimeout(() => pasteBlockAt(menu, parseDelimited(text, text.includes('\t') ? '\t' : ',')), 0);
            },
            pasteValues: () => {
              if (!copiedValues) return toast('Copy some cells first');
              pasteBlockAt(menu, copiedValues);
            },
            style: (patch, col) => styleCells(patch, col, menuRange(menu)),
          }}
        />
      )}
    </div>
  );

  function pasteBlockAt(m: Menu, block: string[][]) {
    const next = grid();
    const needCols = Math.max(cols, m.c + Math.max(...block.map((b) => b.length)));
    while (next.length < m.r + block.length) next.push(Array(needCols).fill(''));
    for (const row of next) while (row.length < needCols) row.push('');
    block.forEach((row, i) => row.forEach((v, j) => (next[m.r + i][m.c + j] = v)));
    update({ cells: next });
  }
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

type MenuActions = Record<
  'addRowAbove' | 'addRowBelow' | 'addColLeft' | 'addColRight' | 'removeRow' | 'removeCol' | 'moveRowUp' | 'moveRowDown' | 'moveColLeft' | 'moveColRight' | 'clear' | 'copy' | 'cut' | 'paste' | 'pasteValues',
  () => void
> & { style(patch: Partial<CellStyle>, wholeColumn?: boolean): void };

function TableMenu({ menu, style, multi, onClose, actions }: { menu: Menu; style?: CellStyle; multi: boolean; onClose(): void; actions: MenuActions }) {
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
  const type = style?.type ?? 'auto';
  // Portalled: a fixed-position menu inside the scaled canvas would be positioned relative to it.
  return createPortal(
    <div
      ref={ref}
      className="menu table-menu"
      style={{ left: Math.min(menu.x, window.innerWidth - 260), top: Math.max(8, Math.min(menu.y, window.innerHeight - 520)) }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="menu-row">
        <button onClick={run(actions.cut)}>{t('Cut')}</button>
        <button onClick={run(actions.copy)}>{t('Copy')}</button>
        <button onClick={run(actions.paste)}>{t('Paste')}</button>
      </div>
      <button onClick={run(actions.pasteValues)}>{t('Paste Values')}</button>
      <div className="menu-sep" />
      <button onClick={run(actions.addRowAbove)}>{multi ? t('Add Rows Above') : t('Add Row Above')}</button>
      <button onClick={run(actions.addRowBelow)}>{multi ? t('Add Rows Below') : t('Add Row Below')}</button>
      <button onClick={run(actions.addColLeft)}>{multi ? t('Add Columns Left') : t('Add Column Left')}</button>
      <button onClick={run(actions.addColRight)}>{multi ? t('Add Columns Right') : t('Add Column Right')}</button>
      <div className="menu-row">
        <button title={t('Move row up')} onClick={run(actions.moveRowUp)}>↑</button>
        <button title={t('Move row down')} onClick={run(actions.moveRowDown)}>↓</button>
        <button title={t('Move column left')} onClick={run(actions.moveColLeft)}>←</button>
        <button title={t('Move column right')} onClick={run(actions.moveColRight)}>→</button>
      </div>
      <div className="menu-sep" />
      <div className="menu-label">{t('Cell type (whole column)')}</div>
      <div className="menu-chips">
        {CELL_TYPES.map((ct) => (
          <button key={ct.value} className={type === ct.value ? 'active' : ''} onClick={run(() => actions.style({ type: ct.value }, true))}>
            {t(ct.label)}
          </button>
        ))}
      </div>
      {(type === 'number' || type === 'currency' || type === 'percentage' || type === 'auto') && (
        <>
          <div className="menu-label">{t('Decimals')}</div>
          <div className="menu-chips">
            {[null, 0, 1, 2, 3].map((d) => (
              <button key={String(d)} className={(style?.decimals ?? null) === d ? 'active' : ''} onClick={run(() => actions.style({ decimals: d }, true))}>
                {d === null ? 'Auto' : d}
              </button>
            ))}
            <button className={style?.thousands === false ? '' : 'active'} title={t('Thousands separator')} onClick={run(() => actions.style({ thousands: style?.thousands === false }, true))}>
              1,000
            </button>
          </div>
        </>
      )}
      {type === 'currency' && (
        <>
          <div className="menu-label">{t('Currency')}</div>
          <div className="menu-chips">
            {CURRENCIES.map((cur) => (
              <button key={cur} className={(style?.currency ?? defaultCurrency()) === cur ? 'active' : ''} onClick={run(() => actions.style({ currency: cur }, true))}>
                {cur}
              </button>
            ))}
          </div>
        </>
      )}
      {type === 'date' && (
        <>
          <div className="menu-label">{t('Date format')}</div>
          <div className="menu-chips">
            {DATE_FORMATS.map((f) => (
              <button key={f.value} className={(style?.dateFormat ?? 'medium') === f.value ? 'active' : ''} onClick={run(() => actions.style({ dateFormat: f.value }, true))}>
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="menu-label">{t('Alignment')}</div>
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
      <div className="menu-label">{t('Colour')}</div>
      <div className="menu-colors">
        {CELL_COLORS.map((c) => (
          <button key={c ?? 'none'} className={`swatch-dot ${c ? '' : 'no-color'}`} style={c ? { background: c } : undefined} onClick={run(() => actions.style({ bg: c }))} />
        ))}
      </div>
      <div className="menu-sep" />
      <button onClick={run(actions.clear)}>{multi ? t('Clear Cells') : t('Clear Cell')}</button>
      <button className="danger" onClick={run(actions.removeRow)}>
        {multi ? t('Delete Rows') : t('Delete Row')}
      </button>
      <button className="danger" onClick={run(actions.removeCol)}>
        {multi ? t('Delete Columns') : t('Delete Column')}
      </button>
    </div>,
    document.body,
  );
}
