// A small spreadsheet formula engine for table cards. Supports numbers,
// cell references (A1), ranges (A1:B3), + - * / ^, parentheses, unary minus,
// comparison operators, & for text, and the functions below. Errors mirror
// Milanote's: circular references, division by zero and parse errors.

export type CellValue = number | string | boolean;

type FormulaCode = '#CIRCULAR' | '#DIV/0' | '#PARSE' | '#REF' | '#NAME' | '#VALUE';

export class FormulaError extends Error {
  code: FormulaCode;
  constructor(code: FormulaCode) {
    super(code);
    this.code = code;
  }
}

export const FORMULA_MESSAGES: Record<FormulaError['code'], string> = {
  '#CIRCULAR': 'Circular reference detected',
  '#DIV/0': "Numbers can't be divided by zero",
  '#PARSE': 'Parsing error',
  '#REF': 'Reference outside the table',
  '#NAME': 'Unknown function',
  '#VALUE': 'Wrong kind of value',
};

export function colName(i: number): string {
  let s = '';
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ref'; r: number; c: number }
  | { t: 'range'; r1: number; c1: number; r2: number; c2: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const rest = src.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^([A-Za-z]{1,3})(\d+):([A-Za-z]{1,3})(\d+)/))) {
      out.push({ t: 'range', c1: colIndex(m[1]), r1: Number(m[2]) - 1, c2: colIndex(m[3]), r2: Number(m[4]) - 1 });
    } else if ((m = rest.match(/^([A-Za-z]{1,3})(\d+)(?![\w(])/))) {
      out.push({ t: 'ref', c: colIndex(m[1]), r: Number(m[2]) - 1 });
    } else if ((m = rest.match(/^\d+(\.\d+)?(e[+-]?\d+)?%?/i))) {
      const pct = m[0].endsWith('%');
      out.push({ t: 'num', v: parseFloat(m[0]) / (pct ? 100 : 1) });
    } else if ((m = rest.match(/^[A-Za-z_][\w.]*/))) {
      out.push({ t: 'id', v: m[0].toUpperCase() });
    } else if ((m = rest.match(/^"([^"]*)"/))) {
      out.push({ t: 'str', v: m[1] });
    } else if ((m = rest.match(/^(<=|>=|<>|[-+*/^(),:<>=&])/))) {
      out.push({ t: 'op', v: m[0] });
    } else {
      throw new FormulaError('#PARSE');
    }
    i += m![0].length;
  }
  return out;
}

type Getter = (r: number, c: number) => CellValue;

function toNumber(v: CellValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v.trim() === '') return 0;
  const n = parseNumber(v);
  if (n === null) throw new FormulaError('#VALUE');
  return n;
}

export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(/[,\s]/g, '').replace(/^[$€£₹¥]/, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i.test(cleaned)) return null;
  const pct = cleaned.endsWith('%');
  return parseFloat(cleaned) / (pct ? 100 : 1);
}

const FUNCTIONS: Record<string, (args: CellValue[][]) => CellValue> = {
  SUM: (a) => nums(a).reduce((s, n) => s + n, 0),
  AVERAGE: (a) => {
    const n = nums(a);
    if (!n.length) throw new FormulaError('#DIV/0');
    return n.reduce((s, x) => s + x, 0) / n.length;
  },
  AVG: (a) => FUNCTIONS.AVERAGE(a),
  MIN: (a) => (nums(a).length ? Math.min(...nums(a)) : 0),
  MAX: (a) => (nums(a).length ? Math.max(...nums(a)) : 0),
  COUNT: (a) => nums(a).length,
  COUNTA: (a) => a.flat().filter((v) => v !== '' && v !== false).length,
  ABS: (a) => Math.abs(toNumber(a[0]?.[0] ?? 0)),
  ROUND: (a) => {
    const d = toNumber(a[1]?.[0] ?? 0);
    const f = 10 ** d;
    return Math.round(toNumber(a[0]?.[0] ?? 0) * f) / f;
  },
  SQRT: (a) => Math.sqrt(toNumber(a[0]?.[0] ?? 0)),
  POWER: (a) => toNumber(a[0]?.[0] ?? 0) ** toNumber(a[1]?.[0] ?? 0),
  IF: (a) => (truthy(a[0]?.[0]) ? a[1]?.[0] ?? true : a[2]?.[0] ?? false),
  AND: (a) => a.flat().every(truthy),
  OR: (a) => a.flat().some(truthy),
  NOT: (a) => !truthy(a[0]?.[0]),
  CONCAT: (a) => a.flat().map(String).join(''),
  LEN: (a) => String(a[0]?.[0] ?? '').length,
  UPPER: (a) => String(a[0]?.[0] ?? '').toUpperCase(),
  LOWER: (a) => String(a[0]?.[0] ?? '').toLowerCase(),
  TODAY: () => new Date().toISOString().slice(0, 10),
};

function truthy(v: CellValue | undefined): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return !!v && v.toUpperCase() !== 'FALSE';
}

function nums(args: CellValue[][]): number[] {
  const out: number[] = [];
  for (const v of args.flat()) {
    if (typeof v === 'number') out.push(v);
    else if (typeof v === 'string' && parseNumber(v) !== null) out.push(parseNumber(v)!);
  }
  return out;
}

// Recursive-descent parser that evaluates as it goes.
function evaluate(tokens: Token[], get: Getter, rows: number, cols: number): CellValue {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError('#PARSE');
    pos++;
  };
  const checkRef = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) throw new FormulaError('#REF');
  };

  const comparison = (): CellValue => {
    let left = concat();
    while (peek()?.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes((peek() as { v: string }).v)) {
      const op = (tokens[pos++] as { v: string }).v;
      const right = concat();
      const a = typeof left === 'string' && parseNumber(left) === null ? left : toNumber(left);
      const b = typeof right === 'string' && parseNumber(right) === null ? right : toNumber(right);
      left =
        op === '=' ? a === b : op === '<>' ? a !== b : op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
    }
    return left;
  };
  const concat = (): CellValue => {
    let left = additive();
    while (isOp('&')) {
      pos++;
      left = String(left) + String(additive());
    }
    return left;
  };
  const additive = (): CellValue => {
    let left = multiplicative();
    while (isOp('+') || isOp('-')) {
      const op = (tokens[pos++] as { v: string }).v;
      const right = toNumber(multiplicative());
      left = op === '+' ? toNumber(left) + right : toNumber(left) - right;
    }
    return left;
  };
  const multiplicative = (): CellValue => {
    let left = power();
    while (isOp('*') || isOp('/')) {
      const op = (tokens[pos++] as { v: string }).v;
      const right = toNumber(power());
      if (op === '/' && right === 0) throw new FormulaError('#DIV/0');
      left = op === '*' ? toNumber(left) * right : toNumber(left) / right;
    }
    return left;
  };
  const power = (): CellValue => {
    const base = unary();
    if (isOp('^')) {
      pos++;
      return toNumber(base) ** toNumber(power());
    }
    return base;
  };
  const unary = (): CellValue => {
    if (isOp('-')) {
      pos++;
      return -toNumber(unary());
    }
    if (isOp('+')) {
      pos++;
      return toNumber(unary());
    }
    return primary();
  };
  const argList = (): CellValue[][] => {
    const args: CellValue[][] = [];
    expect('(');
    if (isOp(')')) {
      pos++;
      return args;
    }
    for (;;) {
      const tok = peek();
      if (tok?.t === 'range') {
        pos++;
        const vals: CellValue[] = [];
        for (let r = Math.min(tok.r1, tok.r2); r <= Math.max(tok.r1, tok.r2); r++)
          for (let c = Math.min(tok.c1, tok.c2); c <= Math.max(tok.c1, tok.c2); c++) {
            checkRef(r, c);
            vals.push(get(r, c));
          }
        args.push(vals);
      } else {
        args.push([comparison()]);
      }
      if (isOp(',')) {
        pos++;
        continue;
      }
      expect(')');
      return args;
    }
  };
  const primary = (): CellValue => {
    const tok = tokens[pos++];
    if (!tok) throw new FormulaError('#PARSE');
    switch (tok.t) {
      case 'num':
        return tok.v;
      case 'str':
        return tok.v;
      case 'ref':
        checkRef(tok.r, tok.c);
        return get(tok.r, tok.c);
      case 'id': {
        if (tok.v === 'TRUE') return true;
        if (tok.v === 'FALSE') return false;
        const fn = FUNCTIONS[tok.v];
        if (!fn) throw new FormulaError('#NAME');
        return fn(argList());
      }
      case 'op':
        if (tok.v === '(') {
          const v = comparison();
          expect(')');
          return v;
        }
        throw new FormulaError('#PARSE');
      default:
        throw new FormulaError('#PARSE');
    }
  };

  const result = comparison();
  if (pos !== tokens.length) throw new FormulaError('#PARSE');
  return result;
}

export interface Evaluated {
  value: CellValue;
  error?: FormulaError['code'];
}

// Evaluates every cell of a grid, resolving references with cycle detection.
export function evaluateGrid(cells: string[][]): Evaluated[][] {
  const rows = cells.length;
  const cols = Math.max(0, ...cells.map((r) => r.length));
  const cache = new Map<string, Evaluated>();
  const visiting = new Set<string>();

  const cell = (r: number, c: number): Evaluated => {
    const key = `${r}:${c}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const raw = cells[r]?.[c] ?? '';
    let result: Evaluated;
    if (!raw.startsWith('=')) {
      const n = parseNumber(raw);
      result = { value: n !== null && raw.trim() !== '' ? n : raw };
    } else if (visiting.has(key)) {
      throw new FormulaError('#CIRCULAR');
    } else {
      visiting.add(key);
      try {
        const value = evaluate(tokenize(raw.slice(1)), (rr, cc) => {
          const v = cell(rr, cc);
          if (v.error) throw new FormulaError(v.error);
          return v.value;
        }, rows, cols);
        result = { value: typeof value === 'number' && !Number.isFinite(value) ? '#NUM' : value };
      } catch (err) {
        result = { value: '', error: err instanceof FormulaError ? err.code : '#PARSE' };
      } finally {
        visiting.delete(key);
      }
    }
    cache.set(key, result);
    return result;
  };

  return cells.map((row, r) => Array.from({ length: cols }, (_, c) => (row ? cell(r, c) : { value: '' })));
}
