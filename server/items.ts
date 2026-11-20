import type { ReviewListItem } from '../shared/api.ts';
import { correctAnswerText, type Exercise, type LessonExercise, type ReviewItemView } from '../shared/lesson.ts';
import type { ItemKind, Lesson, Outcome } from '../shared/schema.ts';
import { gradeExercise, normalizeAnswer } from '../shared/scoring.ts';
import { afterCorrect, afterManualFlag, afterMiss, isDue, type ItemStatus, type SrsState } from '../shared/srs.ts';
import type { Db } from './db.ts';
import { HttpError } from './errors.ts';

// 不會 / 不熟項目庫:每個項目記錄內容、重考用的題目,以及間隔重複的狀態。

export interface ItemContent {
  label: string;
  answer: string;
  explanation: string;
  context: string | null;
  quiz: Exercise;
}

interface ItemRow {
  id: number;
  user_id: number;
  kind: ItemKind;
  item_key: string;
  content_json: string;
  status: ItemStatus;
  wrong_count: number;
  interval_days: number;
  due_date: string;
  first_seen: string;
  last_seen: string;
}

/** 記錄在 item_events 的結果。manual 是學生自己按「我不熟」。 */
export type MissKind = 'unknown' | 'unfamiliar' | 'manual';

const srsOf = (row: ItemRow): SrsState => ({ status: row.status, intervalDays: row.interval_days, dueDate: row.due_date });

export function toReviewView(row: ItemRow): ReviewItemView {
  const content = JSON.parse(row.content_json) as ItemContent;
  return {
    id: row.id,
    kind: row.kind,
    label: content.label,
    answer: content.answer,
    explanation: content.explanation,
    context: content.context,
    status: row.status,
    wrongCount: row.wrong_count,
    lastSeen: row.last_seen,
    dueDate: row.due_date,
    quiz: content.quiz,
  };
}

function addEvent(db: Db, itemId: number, sessionId: number | null, date: string, result: string): void {
  db.prepare('INSERT INTO item_events (item_id, session_id, date, result) VALUES (?, ?, ?, ?)').run(itemId, sessionId, date, result);
}

export interface MissInput {
  userId: number;
  kind: ItemKind;
  /** 用來辨識「同一個弱點」的鍵;同一個單字再錯一次會累加在同一個項目上。 */
  itemKey: string;
  content: ItemContent;
  miss: MissKind;
  sessionId: number | null;
  date: string;
}

/** 記下一個弱點:新的就建立項目,已存在就累加錯誤次數並把間隔歸零。 */
export function recordMiss(db: Db, input: MissInput): number {
  const existing = db.prepare('SELECT * FROM items WHERE user_id = ? AND item_key = ?').get(input.userId, input.itemKey) as ItemRow | undefined;
  const srs = input.miss === 'manual' ? afterManualFlag(existing ? srsOf(existing) : null, input.date) : afterMiss(input.miss, input.date);
  // 手動標記不是答錯,不計入錯誤次數。
  const wrongDelta = input.miss === 'manual' ? 0 : 1;
  const content = JSON.stringify(input.content);

  let itemId: number;
  if (existing) {
    itemId = existing.id;
    db.prepare(
      `UPDATE items SET content_json = ?, status = ?, interval_days = ?, due_date = ?, last_seen = ?, wrong_count = wrong_count + ? WHERE id = ?`,
    ).run(content, srs.status, srs.intervalDays, srs.dueDate, input.date, wrongDelta, itemId);
  } else {
    const result = db
      .prepare(
        `INSERT INTO items (user_id, kind, item_key, content_json, status, wrong_count, interval_days, due_date, first_seen, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.userId, input.kind, input.itemKey, content, srs.status, wrongDelta, srs.intervalDays, srs.dueDate, input.date, input.date);
    itemId = Number(result.lastInsertRowid);
  }
  addEvent(db, itemId, input.sessionId, input.date, input.miss);
  return itemId;
}

/**
 * 複習一個既有項目後更新間隔:答對就拉長,否則歸零。
 * 還沒到期就提前練習而答對的,不拉長間隔:否則一天內連續練習幾次就會被標為已掌握,
 * 失去「隔一段時間還記得」的意義。
 */
export function recordReviewResult(db: Db, itemId: number, outcome: Outcome, sessionId: number | null, date: string): void {
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as ItemRow | undefined;
  if (!row) return;
  if (outcome === 'correct' && !isDue(srsOf(row), date)) {
    db.prepare('UPDATE items SET last_seen = ? WHERE id = ?').run(date, itemId);
    addEvent(db, itemId, sessionId, date, outcome);
    return;
  }
  const srs = outcome === 'correct' ? afterCorrect(srsOf(row), date) : afterMiss(outcome, date);
  db.prepare('UPDATE items SET status = ?, interval_days = ?, due_date = ?, last_seen = ?, wrong_count = wrong_count + ? WHERE id = ?').run(
    srs.status,
    srs.intervalDays,
    srs.dueDate,
    date,
    outcome === 'correct' ? 0 : 1,
    itemId,
  );
  addEvent(db, itemId, sessionId, date, outcome);
}

/** 今天到期的項目,最久沒複習的排前面。 */
export function dueItems(db: Db, userId: number, today: string, limit: number): ReviewItemView[] {
  const rows = db
    .prepare(`SELECT * FROM items WHERE user_id = ? AND status != 'mastered' AND due_date <= ? ORDER BY due_date, id LIMIT ?`)
    .all(userId, today, limit) as unknown as ItemRow[];
  return rows.map(toReviewView);
}

/** 學生還不熟的單字(錯最多次、最近才出現的優先),產生新課文時自然地再放進去。 */
export function weakVocabWords(db: Db, userId: number, limit: number): string[] {
  const rows = db
    .prepare(`SELECT content_json FROM items WHERE user_id = ? AND kind = 'vocab' AND status != 'mastered' ORDER BY wrong_count DESC, last_seen DESC, id DESC LIMIT ?`)
    .all(userId, limit) as unknown as { content_json: string }[];
  return rows.map((row) => (JSON.parse(row.content_json) as ItemContent).label);
}

export function dueCount(db: Db, userId: number, today: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM items WHERE user_id = ? AND status != 'mastered' AND due_date <= ?`).get(userId, today) as {
    n: number;
  };
  return row.n;
}

/** 在日期範圍內被記為不會、不熟或手動標記過的項目(回顧頁用)。 */
export function missedItemsInRange(db: Db, userId: number, from: string, to: string): ReviewListItem[] {
  const rows = db
    .prepare(
      `SELECT items.*, COUNT(item_events.id) AS misses
       FROM items JOIN item_events ON item_events.item_id = items.id
       WHERE items.user_id = ? AND item_events.date BETWEEN ? AND ? AND item_events.result IN ('unknown', 'unfamiliar', 'manual')
       GROUP BY items.id
       ORDER BY items.kind, misses DESC, items.last_seen DESC, items.id`,
    )
    .all(userId, from, to) as unknown as (ItemRow & { misses: number })[];
  return rows.map((row) => ({ ...toReviewView(row), misses: row.misses }));
}

/** 依項目庫裡存的題目重新判分,回傳每個項目的結果。項目必須屬於這位使用者。 */
export function gradeReviewAnswers(
  db: Db,
  userId: number,
  answers: Record<string, { attempts: string[]; hintUsed: boolean }>,
): { itemId: number; outcome: Outcome }[] {
  return Object.entries(answers).map(([id, answer]) => {
    const row = db.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?').get(Number(id), userId) as ItemRow | undefined;
    if (!row) throw new HttpError(404, `找不到複習項目 ${id}`);
    const quiz = (JSON.parse(row.content_json) as ItemContent).quiz;
    return { itemId: row.id, outcome: gradeExercise(quiz, answer).outcome };
  });
}

// ---- 從課程內容建立項目 ----

function exerciseText(exercise: Exercise): string {
  switch (exercise.type) {
    case 'mcq':
      return exercise.prompt;
    case 'cloze':
    case 'reorder':
    case 'dictation':
    case 'readAloud':
      return exercise.sentence;
    case 'flashcard':
      return exercise.front;
  }
}

/** 一題練習對應的項目鍵。單字以字本身為鍵;閱讀題與聽力理解題離開課文就沒有意義,所以綁定在那堂課上。 */
export function itemKeyForExercise(item: LessonExercise, sessionId: number): string {
  if (item.kind === 'vocab') return `vocab:${item.label.toLowerCase()}`;
  if (item.context !== undefined) return `${item.kind}:${sessionId}:${item.key}`;
  return `${item.kind}:${normalizeAnswer(exerciseText(item.exercise))}`;
}

export function contentForExercise(item: LessonExercise): ItemContent {
  return {
    label: item.label,
    answer: correctAnswerText(item.exercise),
    explanation: item.exercise.explanation,
    context: item.context ?? null,
    quiz: item.exercise,
  };
}

/** AI 批改找出的寫作或對話錯誤:沒有題目可重考,做成閃卡讓學生自我評量。 */
export function correctionItem(
  kind: 'writing' | 'speaking',
  original: string,
  corrected: string,
  explanation: string,
): { itemKey: string; content: ItemContent } {
  return {
    itemKey: `${kind}:${normalizeAnswer(original)}`,
    content: {
      label: original,
      answer: corrected,
      explanation,
      context: null,
      quiz: { type: 'flashcard', front: original, back: corrected, explanation },
    },
  };
}

/** 課文生字表裡的字:做成「看英文想意思」的閃卡。 */
export function glossaryItem(lesson: Lesson, index: number): { itemKey: string; content: ItemContent } | null {
  const entry = lesson.glossary[index];
  if (!entry) return null;
  return {
    itemKey: `vocab:${entry.word.toLowerCase()}`,
    content: {
      label: entry.word,
      answer: entry.meaning,
      explanation: entry.meaning,
      context: null,
      quiz: { type: 'flashcard', front: entry.word, back: entry.meaning, explanation: entry.meaning },
    },
  };
}
