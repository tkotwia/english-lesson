import type { ReviewListItem } from '../shared/api.ts';
import { correctAnswerText, lessonExercises, reviewExercises, reviewKey, type Exercise, type LessonExercise, type ReviewItemView } from '../shared/lesson.ts';
import type { ExerciseAnswer, ItemKind, Lesson, Outcome } from '../shared/schema.ts';
import { addDays } from '../shared/dates.ts';
import { gradeExercise, isSkipped, normalizeAnswer, wrongResponses } from '../shared/scoring.ts';
import { afterCorrect, afterLearned, afterManualFlag, afterMiss, isDue, type ItemStatus, type SrsState } from '../shared/srs.ts';
import { transaction, type Db } from './db.ts';
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

/**
 * 重考用的題目。寫作與對話的錯誤,較早的版本存成閃卡(看完正確說法後自己判斷記不記得);
 * 現在一律改成訂正題,要把正確的句子打出來。已經存下來的舊項目在這裡轉換,不必改資料庫。
 */
function quizOf(row: ItemRow, content: ItemContent): Exercise {
  const { quiz } = content;
  if ((row.kind === 'writing' || row.kind === 'speaking') && quiz.type === 'flashcard') {
    return { type: 'rewrite', original: quiz.front, sentence: quiz.back, explanation: quiz.explanation };
  }
  return quiz;
}

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
    quiz: quizOf(row, content),
  };
}

/** responses 是學生這次答錯的內容;沒有答錯的內容(答對、手動標記、自評)就是空的。 */
function addEvent(db: Db, itemId: number, sessionId: number | null, date: string, result: string, responses: string[]): void {
  db.prepare('INSERT INTO item_events (item_id, session_id, date, result, responses_json) VALUES (?, ?, ?, ?, ?)').run(
    itemId,
    sessionId,
    date,
    result,
    JSON.stringify(responses),
  );
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
  /** 學生答錯的內容,回顧時顯示。手動標記與 AI 批改找出的錯誤沒有。 */
  responses?: string[];
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
  addEvent(db, itemId, input.sessionId, input.date, input.miss, input.responses ?? []);
  return itemId;
}

/**
 * 課堂上第一次就答對的新單字也放進項目庫,從明天開始間隔複習。
 * 這個字已經在項目庫裡(以前學過或錯過)就不動它:它的複習進度照原本的走。
 */
export function recordLearned(db: Db, input: Omit<MissInput, 'miss' | 'responses'>): void {
  const existing = db.prepare('SELECT id FROM items WHERE user_id = ? AND item_key = ?').get(input.userId, input.itemKey);
  if (existing) return;
  const srs = afterLearned(input.date);
  const result = db
    .prepare(
      `INSERT INTO items (user_id, kind, item_key, content_json, status, wrong_count, interval_days, due_date, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    )
    .run(input.userId, input.kind, input.itemKey, JSON.stringify(input.content), srs.status, srs.intervalDays, srs.dueDate, input.date, input.date);
  addEvent(db, Number(result.lastInsertRowid), input.sessionId, input.date, 'correct', []);
}

/**
 * 複習一個既有項目後更新間隔:答對就拉長,否則歸零。
 * 還沒到期就提前練習而答對的,不拉長間隔:否則一天內連續練習幾次就會被標為已掌握,
 * 失去「隔一段時間還記得」的意義。
 */
export function recordReviewResult(db: Db, itemId: number, outcome: Outcome, sessionId: number | null, date: string, responses: string[] = []): void {
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as ItemRow | undefined;
  if (!row) return;
  if (outcome === 'correct' && !isDue(srsOf(row), date)) {
    db.prepare('UPDATE items SET last_seen = ? WHERE id = ?').run(date, itemId);
    addEvent(db, itemId, sessionId, date, outcome, responses);
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
  addEvent(db, itemId, sessionId, date, outcome, responses);
}

/**
 * 學生跳過了這個複習項目:不算對也不算錯,間隔不變,只是明天再出現。
 * 把到期日改成明天(而不是留在原本的日期)是為了排序:到期的項目是最久沒複習的排前面,
 * 一直跳過的項目如果留在最前面,會佔住暖身複習的名額,把其他項目擠出去。
 * 還沒到期的項目(提前練習時)不動,否則反而把它提早了。
 */
export function postponeReview(db: Db, itemId: number, date: string): void {
  db.prepare('UPDATE items SET due_date = ? WHERE id = ? AND due_date <= ?').run(addDays(date, 1), itemId, date);
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

/**
 * 在日期範圍內被記為不會、不熟或手動標記過的項目(回顧頁用)。
 * wrongAnswers 是這段期間最近一次答錯時學生的作答。
 */
export function missedItemsInRange(db: Db, userId: number, from: string, to: string): ReviewListItem[] {
  const rows = db
    .prepare(
      `SELECT items.*, COUNT(item_events.id) AS misses,
         (SELECT latest.responses_json FROM item_events AS latest
          WHERE latest.item_id = items.id AND latest.date BETWEEN :from AND :to
            AND latest.responses_json IS NOT NULL AND latest.responses_json != '[]'
          ORDER BY latest.id DESC LIMIT 1) AS responses_json
       FROM items JOIN item_events ON item_events.item_id = items.id
       WHERE items.user_id = :userId AND item_events.date BETWEEN :from AND :to AND item_events.result IN ('unknown', 'unfamiliar', 'manual')
       GROUP BY items.id
       ORDER BY items.kind, misses DESC, items.last_seen DESC, items.id`,
    )
    .all({ userId, from, to }) as unknown as (ItemRow & { misses: number; responses_json: string | null })[];
  return rows.map((row) => ({
    ...toReviewView(row),
    misses: row.misses,
    wrongAnswers: row.responses_json ? (JSON.parse(row.responses_json) as string[]) : [],
  }));
}

/** 依項目庫裡存的題目重新判分,回傳每個項目的結果(跳過的是 skipped)。項目必須屬於這位使用者。 */
export function gradeReviewAnswers(
  db: Db,
  userId: number,
  answers: Record<string, ExerciseAnswer>,
): { itemId: number; outcome: Outcome | 'skipped'; responses: string[] }[] {
  return Object.entries(answers).map(([id, answer]) => {
    const row = db.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?').get(Number(id), userId) as ItemRow | undefined;
    if (!row) throw new HttpError(404, `找不到複習項目 ${id}`);
    const quiz = quizOf(row, JSON.parse(row.content_json) as ItemContent);
    if (isSkipped(quiz, answer)) return { itemId: row.id, outcome: 'skipped', responses: [] };
    return { itemId: row.id, outcome: gradeExercise(quiz, answer).outcome, responses: wrongResponses(quiz, answer) };
  });
}

/**
 * 較早的版本沒有記下學生答錯時的作答。那些作答還留在當時的上課紀錄裡,這裡把它找回來補上,
 * 讓更新之前的錯誤在回顧頁也看得到當時答了什麼。只補還沒補過的紀錄,回傳補了幾筆。
 * 單獨做複習練習時的作答當時沒有存,無法補。
 */
export function backfillResponses(db: Db): number {
  const pending = db
    .prepare(
      `SELECT item_events.id, item_events.item_id, item_events.session_id, item_events.result, items.item_key
       FROM item_events JOIN items ON items.id = item_events.item_id
       WHERE item_events.responses_json IS NULL AND item_events.session_id IS NOT NULL
       ORDER BY item_events.session_id, item_events.id`,
    )
    .all() as unknown as { id: number; item_id: number; session_id: number; result: string; item_key: string }[];
  if (pending.length === 0) return 0;

  interface Taken {
    sessionId: number;
    lesson: Map<string, LessonExercise>;
    review: LessonExercise[];
    answers: Record<string, ExerciseAnswer>;
  }
  const load = (sessionId: number): Taken => {
    const row = db.prepare('SELECT id, retake_of, lesson_json, review_json, state_json FROM sessions WHERE id = ?').get(sessionId) as unknown as {
      id: number;
      retake_of: number | null;
      lesson_json: string;
      review_json: string;
      state_json: string;
    };
    const exercises = lessonExercises(JSON.parse(row.lesson_json) as Lesson);
    return {
      sessionId,
      // 重上的課,弱點項目的鍵用的是原本那堂課的編號。
      lesson: new Map(exercises.map((exercise) => [itemKeyForExercise(exercise, row.retake_of ?? row.id), exercise])),
      review: reviewExercises(JSON.parse(row.review_json) as ReviewItemView[]),
      answers: (JSON.parse(row.state_json) as { answers?: Record<string, ExerciseAnswer> }).answers ?? {},
    };
  };

  const update = db.prepare('UPDATE item_events SET responses_json = ? WHERE id = ?');
  let taken: Taken | null = null;
  transaction(db, () => {
    for (const event of pending) {
      if (taken?.sessionId !== event.session_id) taken = load(event.session_id);
      // 同一個項目在一堂課裡可能出現兩次(課程的題目,以及暖身複習):用判定結果相同的那一題。
      const candidates = [taken.lesson.get(event.item_key), taken.review.find((exercise) => exercise.key === reviewKey(event.item_id))];
      const source = candidates.find((exercise) => exercise && gradeExercise(exercise.exercise, taken!.answers[exercise.key]).outcome === event.result);
      update.run(JSON.stringify(source ? wrongResponses(source.exercise, taken.answers[source.key]) : []), event.id);
    }
  });
  return pending.length;
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
    case 'rewrite':
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

/** AI 批改找出的寫作或對話錯誤:做成訂正題,複習時要把正確的句子打出來。 */
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
      quiz: { type: 'rewrite', original, sentence: corrected, explanation },
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
