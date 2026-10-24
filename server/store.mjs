// Element storage. Each element is one JSON document keyed by id; the client
// owns the element schema, the server only persists it.
import { DatabaseSync } from 'node:sqlite';

export function openStore(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS elements (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const selectAll = db.prepare('SELECT data FROM elements');
  const upsert = db.prepare(
    'INSERT INTO elements (id, data, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
  );
  const remove = db.prepare('DELETE FROM elements WHERE id = ?');
  const clear = db.prepare('DELETE FROM elements');

  function transaction(fn) {
    db.exec('BEGIN');
    try {
      fn();
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function put(el) {
    if (!el || typeof el.id !== 'string' || !el.id) {
      throw Object.assign(new Error('Element needs a string id'), { status: 400 });
    }
    upsert.run(el.id, JSON.stringify(el), Date.now());
  }

  return {
    all() {
      return selectAll.all().map((row) => JSON.parse(row.data));
    },
    apply(ops) {
      transaction(() => {
        for (const op of ops) {
          if (op.op === 'put') put(op.el);
          else if (op.op === 'del' && typeof op.id === 'string') remove.run(op.id);
          else throw Object.assign(new Error(`Unknown op: ${JSON.stringify(op).slice(0, 80)}`), { status: 400 });
        }
      });
    },
    importAll(elements, replace) {
      transaction(() => {
        if (replace) clear.run();
        for (const el of elements) put(el);
      });
    },
    close() {
      db.close();
    },
  };
}
