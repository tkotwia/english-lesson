import type { PreparedStatus } from '../shared/api.ts';
import type { Lesson, LessonNovelty, Level, Minutes, Stage } from '../shared/schema.ts';
import { AiError, type AiProvider } from './ai/provider.ts';
import type { Db } from './db.ts';
import { createLesson, type LessonStudent, type NewLesson } from './lessons.ts';

// 預先備課:學生開始上一堂課時,就在背景把「下一堂」準備好存起來。
// 下次按「開始」時直接取用,不必等 AI 產生(實測現場產生一堂課要 40–80 秒)。
//
// 每位使用者最多存一堂備好的課。它是照當時的等級、學習階段與課程長度產生的,
// 取用時這三項有任何一項不同,就丟掉重新產生。

interface PreparedRow {
  user_id: number;
  level: Level;
  stage: Stage;
  minutes: Minutes;
  topic: string;
  grammar_point: string;
  lesson_json: string;
  novelty_json: string;
}

export interface Preparer {
  /** 在背景準備下一堂課。已經有可用的、或正在準備中,就什麼都不做。不會等它完成。 */
  ensure(student: LessonStudent, minutes: Minutes): void;
  /**
   * 開課時取用備好的課。背景還在準備時會等它做完。
   * 符合這次要求的就取出(並從存放處移除);不符合的丟掉並回傳 null,由呼叫的人現場產生。
   */
  take(student: LessonStudent, minutes: Minutes): Promise<NewLesson | null>;
  /** 目前的狀態,給開始上課的畫面顯示。 */
  status(student: Pick<LessonStudent, 'id' | 'level' | 'stage'>): PreparedStatus;
  /** 等這位使用者的背景準備做完(測試用)。 */
  idle(userId: number): Promise<void>;
}

export function createPreparer(db: Db, ai: AiProvider, enabled: boolean): Preparer {
  // 正在背景準備中的工作。只存在記憶體裡:程式重啟後沒做完的就算了,下次開課時現場產生。
  const inFlight = new Map<number, { minutes: Minutes; done: Promise<void> }>();

  const stored = (userId: number) => db.prepare('SELECT * FROM prepared_lessons WHERE user_id = ?').get(userId) as PreparedRow | undefined;
  const remove = (userId: number) => db.prepare('DELETE FROM prepared_lessons WHERE user_id = ?').run(userId);
  const fits = (row: PreparedRow, student: Pick<LessonStudent, 'level' | 'stage'>, minutes?: Minutes) =>
    row.level === student.level && row.stage === student.stage && (minutes === undefined || row.minutes === minutes);

  function save(userId: number, made: NewLesson): void {
    db.prepare(
      `INSERT OR REPLACE INTO prepared_lessons (user_id, level, stage, minutes, topic, grammar_point, lesson_json, novelty_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(userId, made.level, made.stage, made.minutes, made.topic, made.grammarPoint, JSON.stringify(made.lesson), JSON.stringify(made.novelty));
  }

  return {
    ensure(student, minutes) {
      if (!enabled || inFlight.has(student.id)) return;
      const existing = stored(student.id);
      if (existing && fits(existing, student, minutes)) return;

      const done = (async () => {
        try {
          save(student.id, await createLesson(db, ai, student, minutes));
          console.log(`[prepare] 使用者 ${student.id} 的下一堂課(${minutes} 分鐘)已經備好`);
        } catch (err) {
          // 背景準備失敗不影響正在上的課;下次開課時會現場產生,到時候有問題再明確告訴學生。
          const reason = err instanceof AiError ? `${err.code}:${err.detail ?? err.message}` : String(err);
          console.warn(`[prepare] 使用者 ${student.id} 的下一堂課沒有備好(${reason})`);
        } finally {
          inFlight.delete(student.id);
        }
      })();
      inFlight.set(student.id, { minutes, done });
    },

    async take(student, minutes) {
      await inFlight.get(student.id)?.done;
      const row = stored(student.id);
      if (!row) return null;
      remove(student.id);
      if (!fits(row, student, minutes)) {
        console.log(`[prepare] 使用者 ${student.id} 備好的課是 ${row.level}/${row.minutes} 分鐘,這次要 ${student.level}/${minutes} 分鐘,改為現場產生`);
        return null;
      }
      return {
        level: row.level,
        stage: row.stage,
        minutes: row.minutes,
        topic: row.topic,
        grammarPoint: row.grammar_point,
        lesson: JSON.parse(row.lesson_json) as Lesson,
        novelty: JSON.parse(row.novelty_json) as LessonNovelty,
      };
    },

    status(student) {
      const working = inFlight.get(student.id);
      if (working) return { state: 'preparing', minutes: working.minutes };
      const row = stored(student.id);
      // 等級或學習階段改過之後,那堂備好的課已經不適用了。
      if (row && fits(row, student)) return { state: 'ready', minutes: row.minutes };
      return { state: 'none', minutes: null };
    },

    async idle(userId) {
      await inFlight.get(userId)?.done;
    },
  };
}
