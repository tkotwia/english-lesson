import type { LengthStatus, PreparedStatus } from '../shared/api.ts';
import { LESSON_MINUTES, type Lesson, type LessonNovelty, type Level, type Minutes, type Stage } from '../shared/schema.ts';
import { AiError, type AiProvider } from './ai/provider.ts';
import type { Db } from './db.ts';
import { createLesson, type LessonStudent, type NewLesson } from './lessons.ts';
import { STARTER_MINUTES, starterFor } from './starters/index.ts';
import { expectedSeconds } from './timings.ts';

// 讓學生按「開始」時盡量不用等。一堂課有三個來源,依序嘗試:
//
// 1. 庫存:之前在背景備好的課。每位使用者在每個「等級 + 學習階段 + 課程長度」各存一堂,
//    所以切到別的等級再切回來,原本備好的還在。
// 2. 起始課:程式內建的 24 堂 20 分鐘課(4 個學習階段 × 6 個等級)。
//    使用者在某個組合還沒上過課時,第一堂 20 分鐘的課直接用它,不呼叫 AI。
// 3. 現場產生:以上都沒有時才請 AI 產生,這時學生需要等。
//
// 開課之後,程式會在背景把這個組合的 20、30、40 分鐘各補一堂進庫存。

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
  /** 是否在背景預先備課。關閉時仍然會使用內建的起始課。 */
  enabled: boolean;
  /** 背景要備哪些長度的課。 */
  minutes: readonly Minutes[];
  /** 目前時間(毫秒);測試時可以替換。 */
  now?: () => number;
  /** 背景備好一堂課時呼叫(用來接著做那堂課的聽力音檔)。 */
  onPrepared?: (userId: number) => void;
}

export interface Preparer {
  /** 開課時取得一堂課:庫存 → 起始課 → 現場產生。 */
  obtain(student: LessonStudent, minutes: Minutes): Promise<{ made: NewLesson; source: LessonSource }>;
  /** 在背景把這位學生目前的等級與階段各長度的庫存補齊,preferred 那個長度先做。不會等它完成。 */
  replenish(student: LessonStudent, preferred: Minutes): void;
  /** 各種課程長度現在能不能馬上開始、要等多久。 */
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
  const generating = new Map<number, { level: Level; stage: Stage; minutes: Minutes; startedAt: number }>();
  // 背景工作:每位使用者最多一個,workers 存它的完成訊號,wanted 存它最新的目標。
  const workers = new Map<number, Promise<void>>();
  const wanted = new Map<number, { student: LessonStudent; preferred: Minutes }>();

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

  const stocked = (student: Pick<LessonStudent, 'id' | 'level' | 'stage'>, minutes: Minutes) =>
    db.prepare('SELECT * FROM prepared_lessons WHERE user_id = ? AND level = ? AND stage = ? AND minutes = ?').get(student.id, student.level, student.stage, minutes) as
      | StockRow
      | undefined;

  /** 從庫存取出一堂課(取出後就從庫存移除)。 */
  function takeStock(student: LessonStudent, minutes: Minutes): NewLesson | null {
    const row = stocked(student, minutes);
    if (!row) return null;
    db.prepare('DELETE FROM prepared_lessons WHERE user_id = ? AND level = ? AND stage = ? AND minutes = ?').run(student.id, student.level, student.stage, minutes);
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

  const starterApplies = (student: Pick<LessonStudent, 'id' | 'level' | 'stage'>, minutes: Minutes) =>
    minutes === STARTER_MINUTES && isNewCombination(student);

  /** 產生一堂課;期間記下「正在產生哪一堂」,讓畫面可以顯示狀態與預估時間。 */
  async function generate(student: LessonStudent, minutes: Minutes): Promise<NewLesson> {
    generating.set(student.id, { level: student.level, stage: student.stage, minutes, startedAt: now() });
    try {
      return await createLesson(db, ai, student, minutes);
    } finally {
      generating.delete(student.id);
    }
  }

  /** 背景要補的長度:先做 preferred(學生剛用掉的那個長度最可能再用),其餘照 20、30、40 的順序。 */
  function missingLengths(student: LessonStudent, preferred: Minutes): Minutes[] {
    const order = [preferred, ...LESSON_MINUTES.filter((minutes) => minutes !== preferred)];
    return order.filter((minutes) => options.minutes.includes(minutes) && !stocked(student, minutes));
  }

  async function work(userId: number): Promise<void> {
    for (;;) {
      // 每做完一堂就重新看一次目標:學生可能已經換了等級,或某個長度已經被補上。
      const target = wanted.get(userId);
      if (!target) return;
      const [minutes] = missingLengths(target.student, target.preferred);
      if (minutes === undefined) return;
      try {
        await withLock(userId, async () => {
          if (stocked(target.student, minutes)) return;
          putStock(userId, await generate(target.student, minutes));
          console.log(`[prepare] 使用者 ${userId}:${target.student.level} ${minutes} 分鐘的課已經備好`);
          options.onPrepared?.(userId);
        });
      } catch (err) {
        // 失敗多半是額度用完或模型忙線。剩下的長度先不做,避免一直碰壁;下次開課或上完課時會再試。
        const reason = err instanceof AiError ? `${err.code}:${err.detail ?? err.message}` : String(err);
        console.warn(`[prepare] 使用者 ${userId}:${minutes} 分鐘的課沒有備好(${reason}),暫停背景備課`);
        return;
      }
    }
  }

  return {
    async obtain(student, minutes) {
      const ready = takeStock(student, minutes);
      if (ready) return { made: ready, source: 'prepared' };

      if (starterApplies(student, minutes)) {
        const starter = starterFor(student.level, student.stage);
        return { made: { level: student.level, stage: student.stage, minutes, ...starter, novelty: null }, source: 'starter' };
      }

      // 排隊等這位使用者正在產生的那一堂做完,再輪到自己。
      return withLock(student.id, async () => {
        // 排隊的時候,背景可能剛好把這個長度備好了。
        const arrived = takeStock(student, minutes);
        if (arrived) return { made: arrived, source: 'prepared' as const };
        return { made: await generate(student, minutes), source: 'generated' as const };
      });
    },

    replenish(student, preferred) {
      if (!options.enabled) return;
      wanted.set(student.id, { student, preferred });
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
      const sameCombination = (other: { level: Level; stage: Stage }) => other.level === student.level && other.stage === student.stage;
      // 背景工作接下來還會替這個等級與階段準備哪些長度(含正在產生的那一堂)。
      const target = workers.has(student.id) ? wanted.get(student.id) : undefined;
      const queued = target && sameCombination(target.student) ? missingLengths(target.student, target.preferred) : [];

      const lengths = LESSON_MINUTES.map((minutes): LengthStatus => {
        if (stocked(student, minutes)) return { minutes, state: 'ready', source: 'prepared', waitSeconds: 0 };
        if (starterApplies(student, minutes)) return { minutes, state: 'ready', source: 'starter', waitSeconds: 0 };
        // 正在產生的就是這一堂:等它做完就好。
        if (current && sameCombination(current) && current.minutes === minutes) return { minutes, state: 'preparing', source: null, waitSeconds: Math.round(remaining) };
        // 其餘的現在按開始的話,要先等正在產生的那一堂做完,再產生自己這一堂(學生的要求會排在背景工作前面)。
        // 背景已經排定要做的標成 preparing:不必按開始,等一下也會備好。
        return { minutes, state: queued.includes(minutes) ? 'preparing' : 'none', source: null, waitSeconds: Math.round(remaining + expected) };
      });
      return { lengths };
    },

    async idle(userId) {
      await workers.get(userId);
      await locks.get(userId);
    },
  };
}
