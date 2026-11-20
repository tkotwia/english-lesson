import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  stage TEXT NOT NULL,
  level TEXT NOT NULL,
  api_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  model TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date, model)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  level TEXT NOT NULL,
  stage TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  lesson_json TEXT NOT NULL,
  review_json TEXT NOT NULL DEFAULT '[]',
  state_json TEXT NOT NULL,
  score REAL,
  result_json TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  retake_of INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  grammar_point TEXT,
  novelty_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON sessions (user_id, local_date);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  item_key TEXT NOT NULL,
  content_json TEXT NOT NULL,
  status TEXT NOT NULL,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 1,
  due_date TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  UNIQUE (user_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_items_due ON items (user_id, status, due_date);

CREATE TABLE IF NOT EXISTS item_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  result TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_item_events_date ON item_events (item_id, date);

CREATE TABLE IF NOT EXISTS prepared_lessons (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  stage TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  topic TEXT NOT NULL,
  grammar_point TEXT NOT NULL,
  lesson_json TEXT NOT NULL,
  novelty_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS level_decisions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  average REAL NOT NULL,
  from_level TEXT NOT NULL,
  to_level TEXT NOT NULL,
  decision TEXT NOT NULL,
  decided_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, month)
);
`;

/** 開啟(必要時建立)資料庫。傳入 ':memory:' 可取得測試用的記憶體資料庫。 */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // 較早版本建立的資料庫沒有這些欄位;補上欄位,原有的資料不變。
  ensureColumn(db, 'sessions', 'retake_of', 'INTEGER REFERENCES sessions(id) ON DELETE SET NULL');
  ensureColumn(db, 'sessions', 'grammar_point', 'TEXT');
  ensureColumn(db, 'sessions', 'novelty_json', 'TEXT');
  ensureColumn(db, 'api_usage', 'total_ms', 'INTEGER NOT NULL DEFAULT 0');
  return db;
}

/** 資料表缺少某個欄位時補上。只新增欄位,不會改動或刪除既有資料。 */
function ensureColumn(db: Db, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
  if (!columns.some((existing) => existing.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/** 把多筆寫入包成一個交易:全部成功才生效,任何一筆失敗就全部還原。 */
export function transaction<T>(db: Db, work: () => T): T {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
