import type { PreparedStatus } from '../shared/api.ts';
import { STAGE_MINUTES, type Lesson, type LessonNovelty, type Level, type Minutes, type Stage } from '../shared/schema.ts';
import { AiError, type AiProvider } from './ai/provider.ts';
import type { Db } from './db.ts';
import { createLesson, type LessonStudent, type NewLesson } from './lessons.ts';
import { STARTER_MINUTES, starterFor } from './starters/index.ts';
import { expectedSeconds } from './timings.ts';

// 讓學生按「開始」時不用等。新課的長度依學習階段固定(STAGE_MINUTES),一堂課有三個來源,依序嘗試:
//
// 1. 庫存:之前備好的課。每位使用者在每個「等級 + 學習階段」存一堂,
//    所以切到別的等級再切回來,原本備好的還在。
// 2. 起始課:程式內建的 24 堂課(4 個學習階段 × 6 個等級),都是 20 分鐘的份量。
//    使用者在某個組合還沒上過課時,第一堂直接用它,不呼叫 AI;所以國中以上的第一堂比之後的課短一點。
// 3. 現場產生:以上都沒有時才請 AI 產生,這時學生需要等。網頁不會讓學生走到這一步:
//    沒有備好的課時,畫面上是「備課」按鈕(prepare),備好了才出現「開始」。
//
// 開課之後,程式會在背景把這個組合的下一堂補進庫存。

interface StockRow {
  user_id: number;
  level: Level;
  stage: Stage;
  minutes: Minutes;
  topic: string;
  grammar_point: string;
  lesson_json: string;
  novelty_json: string | null;
}

export type LessonSource = 'prepared' | 'starter' | 'generated';

export interface PreparerOptions {
  /** 是否在背景預先備課。關閉時仍然會使用內建的起始課,學生也仍然可以自己按「備課」。 */
  enabled: boolean;
  /** 是否使用內建的起始課;沒指定就是使用。只有測試「請 AI 產生課程」的流程時才關掉。 */
  starters?: boolean;
  /** 目前時間(毫秒);測試時可以替換。 */
  now?: () => number;
  /** 背景備好一堂課時呼叫(用來接著做那堂課的聽力音檔)。 */
  onPrepared?: (userId: number) => void;
}

export interface Preparer {
  /** 開課時取得一堂課:庫存 → 起始課 → 現場產生。 */
  obtain(student: LessonStudent): Promise<{ made: NewLesson; source: LessonSource }>;
  /** 在背景把這位學生目前的等級與階段的下一堂課備好。不會等它完成。 */
  replenish(student: LessonStudent): void;
  /** 學生按下「備課」:把下一堂課備好才回來(已經有課可以上就直接回來)。備不成時丟出錯誤,讓畫面說明原因。 */
  prepare(student: LessonStudent): Promise<void>;
  /** 下一堂課現在能不能馬上開始、要等多久。 */
  status(student: Pick<LessonStudent, 'id' | 'level' | 'stage'>): PreparedStatus;
  /** 等這位使用者的背景工作全部做完(測試用)。 */
  idle(userId: number): Promise<void>;
}

export function createPreparer(db: Db, ai: AiProvider, options: PreparerOptions): Preparer {
  const now = options.now ?? Date.now;

  // 同一位使用者一次只產生一堂課,依到達順序排隊。
  // 兩堂同時產生的話,它們看到的「上過的課」一樣,會挑到同一個主題與文法重點。
  const locks = new Map<number, Promise<unknown>>();
  // 正在產生的那一堂(用來回報狀態與預估剩餘時間)。
  const generating = new Map<number, { level: Level; stage: Stage; startedAt: number }>();
  // 背景工作:每位使用者最多一個,workers 存它的完成訊號,wanted 存它最新的目標。
  const workers = new Map<number, Promise<void>>();
  const wanted = new Map<number, LessonStudent>();

  function withLock<T>(userId: number, work: () => Promise<T>): Promise<T> {
    const previous = locks.get(userId) ?? Promise.resolve();
    const next = previous.then(work, work);
    // 留下一個不會失敗的版本給下一個排隊的人接著等。
    const settled = next.catch(() => undefined);
    locks.set(userId, settled);
    void settled.then(() => {
      if (locks.get(userId) === settled) locks.delete(userId);
    });
    return next;
  }

  /** 這位學生的新課要上多久。 */
  const lengthFor = (student: Pick<LessonStudent, 'stage'>): Minutes => STAGE_MINUTES[student.stage];

  const stocked = (student: Pick<LessonStudent, 'id' | 'level' | 'stage'>) =>
    db
      .prepare('SELECT * FROM prepared_lessons WHERE user_id = ? AND level = ? AND stage = ? AND minutes = ?')
      .get(student.id, student.level, student.stage, lengthFor(student)) as StockRow | undefined;

  /** 從庫存取出一堂課(取出後就從庫存移除)。 */
  function takeStock(student: LessonStudent): NewLesson | null {
    const row = stocked(student);
    if (!row) return null;
    db.prepare('DELETE FROM prepared_lessons WHERE user_id = ? AND level = ? AND stage = ? AND minutes = ?').run(student.id, student.level, student.stage, row.minutes);
    return {
      level: row.level,
      stage: row.stage,
      minutes: row.minutes,
      topic: row.topic,
      grammarPoint: row.grammar_point,
      lesson: JSON.parse(row.lesson_json) as Lesson,
      novelty: row.novelty_json ? (JSON.parse(row.novelty_json) as LessonNovelty) : null,
    };
  }

  function putStock(userId: number, made: NewLesson): void {
    db.prepare(
      `INSERT OR REPLACE INTO prepared_lessons (user_id, level, stage, minutes, topic, grammar_point, lesson_json, novelty_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(userId, made.level, made.stage, made.minutes, made.topic, made.grammarPoint, JSON.stringify(made.lesson), made.novelty ? JSON.stringify(made.novelty) : null);
  }

  /** 這位使用者在這個等級與學習階段是否還沒上過任何課(起始課只給這種情況用)。 */
  function isNewCombination(student: Pick<LessonStudent, 'id' | 'level' | 'stage'>): boolean {
    const row = db.prepare('SELECT 1 FROM sessions WHERE user_id = ? AND level = ? AND stage = ? AND retake_of IS NULL LIMIT 1').get(student.id, student.level, student.stage);
    return row === undefined;
  }

  const starterApplies = (student: Pick<LessonStudent, 'id' | 'level' | 'stage'>) => options.starters !== false && isNewCombination(student);

  /** 產生一堂課;期間記下「正在產生哪一堂」,讓畫面可以顯示狀態與預估時間。 */
  async function generate(student: LessonStudent): Promise<NewLesson> {
    generating.set(student.id, { level: student.level, stage: student.stage, startedAt: now() });
    try {
      return await createLesson(db, ai, student, lengthFor(student));
    } finally {
      generating.delete(student.id);
    }
  }

  /** 把這位學生的下一堂課備進庫存(已經有了就不做)。和這位使用者其他的產生工作排隊,一次只做一堂。 */
  function stockUp(student: LessonStudent): Promise<void> {
    return withLock(student.id, async () => {
      if (stocked(student)) return;
      putStock(student.id, await generate(student));
      console.log(`[prepare] 使用者 ${student.id}:${student.level} ${lengthFor(student)} 分鐘的課已經備好`);
      options.onPrepared?.(student.id);
    });
  }

  async function work(userId: number): Promise<void> {
    for (;;) {
      // 每做完一堂就重新看一次目標:這段時間裡學生可能已經換了等級。
      const target = wanted.get(userId);
      if (!target || stocked(target)) return;
      try {
        await stockUp(target);
      } catch (err) {
        // 失敗多半是額度用完或模型忙線。先停下來,避免一直碰壁;下次開課、上完課或學生按「備課」時會再試。
        const reason = err instanceof AiError ? `${err.code}:${err.detail ?? err.message}` : String(err);
        console.warn(`[prepare] 使用者 ${userId}:下一堂課沒有備好(${reason}),暫停背景備課`);
        return;
      }
    }
  }

  return {
    async obtain(student) {
      const ready = takeStock(student);
      if (ready) return { made: ready, source: 'prepared' };

      if (starterApplies(student)) {
        const starter = starterFor(student.level, student.stage);
        return { made: { level: student.level, stage: student.stage, minutes: STARTER_MINUTES, ...starter, novelty: null }, source: 'starter' };
      }

      // 排隊等這位使用者正在產生的那一堂做完,再輪到自己。
      return withLock(student.id, async () => {
        // 排隊的時候,背景可能剛好把這堂課備好了。
        const arrived = takeStock(student);
        if (arrived) return { made: arrived, source: 'prepared' as const };
        return { made: await generate(student), source: 'generated' as const };
      });
    },

    async prepare(student) {
      if (starterApplies(student)) return;
      await stockUp(student);
    },

    replenish(student) {
      if (!options.enabled) return;
      wanted.set(student.id, student);
      if (workers.has(student.id)) return;
      const done = work(student.id).finally(() => {
        workers.delete(student.id);
        wanted.delete(student.id);
      });
      workers.set(student.id, done);
    },

    status(student) {
      const expected = expectedSeconds(db, 'lesson');
      const current = generating.get(student.id);
      // 正在產生的那一堂預估還要多久。已經超過預估時間時,至少算幾秒,不顯示 0。
      const remaining = current ? Math.max(Math.min(5, expected), expected - (now() - current.startedAt) / 1000) : 0;
      const minutes = lengthFor(student);
      if (stocked(student)) return { minutes, state: 'ready', source: 'prepared', waitSeconds: 0 };
      if (starterApplies(student)) return { minutes: STARTER_MINUTES, state: 'ready', source: 'starter', waitSeconds: 0 };
      // 正在產生的就是這一堂:等它做完就好。
      if (current && current.level === student.level && current.stage === student.stage) return { minutes, state: 'preparing', source: null, waitSeconds: Math.round(remaining) };
      // 還沒備好。現在按「備課」的話,要先等正在產生的那一堂(剛換等級時,是別的等級的課)做完,再產生這一堂。
      return { minutes, state: 'none', source: null, waitSeconds: Math.round(remaining + expected) };
    },

    async idle(userId) {
      await workers.get(userId);
      await locks.get(userId);
    },
  };
}
