import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { STAGE_MINUTES } from '../shared/schema.ts';

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
  result TEXT NOT NULL,
  responses_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_item_events_date ON item_events (item_id, date);

-- 分級測驗:備好還沒用的(ready)、作答中的(in_progress)與做完的(completed)都在這張表。
CREATE TABLE IF NOT EXISTS placement_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  test_json TEXT NOT NULL,
  answers_json TEXT,
  level_before TEXT,
  recommended TEXT,
  bands_json TEXT,
  local_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_placement_tests_user ON placement_tests (user_id, status);

CREATE TABLE IF NOT EXISTS task_timings (
  task TEXT PRIMARY KEY,
  average_ms REAL NOT NULL,
  samples INTEGER NOT NULL
);
`;

/** 開啟(必要時建立)資料庫。傳入 ':memory:' 可取得測試用的記憶體資料庫。 */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migratePreparedLessons(db);
  dropUnusedPreparedLessons(db);
  // 較早版本建立的資料庫沒有這些欄位;補上欄位,原有的資料不變。
  ensureColumn(db, 'sessions', 'retake_of', 'INTEGER REFERENCES sessions(id) ON DELETE SET NULL');
  ensureColumn(db, 'sessions', 'grammar_point', 'TEXT');
  ensureColumn(db, 'sessions', 'novelty_json', 'TEXT');
  ensureColumn(db, 'api_usage', 'total_ms', 'INTEGER NOT NULL DEFAULT 0');
  // 學生答錯時的作答內容(JSON 陣列)。NULL 表示較早版本留下的紀錄,當時沒有存。
  ensureColumn(db, 'item_events', 'responses_json', 'TEXT');
  return db;
}

// 預先備好的課。每位使用者在每個「等級 + 學習階段 + 課程長度」各存一堂,
// 所以切換等級之後,原本備好的課還留著,切回來可以直接用。
const PREPARED_LESSONS = `
CREATE TABLE prepared_lessons (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  stage TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  topic TEXT NOT NULL,
  grammar_point TEXT NOT NULL,
  lesson_json TEXT NOT NULL,
  novelty_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, level, stage, minutes)
);
`;

/**
 * 啟動時清掉不會再被取用的備好的課。留著的話,程式還會替它們製作、保留聽力音檔,白白用掉額度與空間。
 * 備好的課只是庫存,不是上課紀錄。
 * - 長度不符的:課程長度現在依學習階段固定(STAGE_MINUTES),以前可以自己選長度時備的其他長度已經用不到。
 * - 學習階段不符的:使用者已經改到別的學習階段(升學,或更正設定),替原本階段備的課不會再上。
 * 替別的「等級」備的課不清:切到別的等級看看再切回來很常見,切回來時可以直接上。
 */
function dropUnusedPreparedLessons(db: Db): void {
  for (const [stage, minutes] of Object.entries(STAGE_MINUTES)) {
    db.prepare('DELETE FROM prepared_lessons WHERE stage = ? AND minutes != ?').run(stage, minutes);
  }
  db.exec('DELETE FROM prepared_lessons WHERE stage != (SELECT stage FROM users WHERE users.id = prepared_lessons.user_id)');
}

/**
 * 建立預先備課的資料表。較早的版本每位使用者只存一堂(主鍵只有 user_id);
 * 遇到那種舊表就重建成新的格式,並把原本備好的那一堂搬過來。
 */
function migratePreparedLessons(db: Db): void {
  const columns = db.prepare(`PRAGMA table_info(prepared_lessons)`).all() as unknown as { name: string; pk: number }[];
  if (columns.length === 0) {
    db.exec(PREPARED_LESSONS);
    return;
  }
  const keyColumns = columns.filter((column) => column.pk > 0).map((column) => column.name);
  if (keyColumns.length > 1) return; // 已經是新的格式

  transaction(db, () => {
    db.exec('ALTER TABLE prepared_lessons RENAME TO prepared_lessons_old');
    db.exec(PREPARED_LESSONS);
    db.exec(`INSERT OR IGNORE INTO prepared_lessons (user_id, level, stage, minutes, topic, grammar_point, lesson_json, novelty_json, created_at)
             SELECT user_id, level, stage, minutes, topic, grammar_point, lesson_json, novelty_json, created_at FROM prepared_lessons_old`);
    db.exec('DROP TABLE prepared_lessons_old');
  });
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
