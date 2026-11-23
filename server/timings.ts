import type { TaskTimings } from '../shared/api.ts';
import type { Db } from './db.ts';

// 記錄「等 AI 做完一件事」實際花了多久,用來在等待時顯示進度條與預估剩餘時間。
// AI 產生課程是單次呼叫,過程中拿不到真正的進度,所以只能用過去的實際時間來推估。

export type TimedTask = keyof TaskTimings;

/** 還沒有任何紀錄時使用的預估秒數。來自 2026-11-20 的實測:產生一堂課 40–79 秒。 */
const DEFAULT_SECONDS: TaskTimings = { lesson: 60, grade: 30, placement: 60 };

/** 新的一筆時間佔多少比重。用移動平均,換了模型或設定之後預估會跟著調整,不會被很久以前的紀錄拖住。 */
const NEW_SAMPLE_WEIGHT = 0.3;

export function recordTaskTiming(db: Db, task: TimedTask, milliseconds: number): void {
  const row = db.prepare('SELECT average_ms FROM task_timings WHERE task = ?').get(task) as { average_ms: number } | undefined;
  if (!row) {
    db.prepare('INSERT INTO task_timings (task, average_ms, samples) VALUES (?, ?, 1)').run(task, milliseconds);
    return;
  }
  const average = row.average_ms * (1 - NEW_SAMPLE_WEIGHT) + milliseconds * NEW_SAMPLE_WEIGHT;
  db.prepare('UPDATE task_timings SET average_ms = ?, samples = samples + 1 WHERE task = ?').run(average, task);
}

/** 預估做這件事要幾秒。有實際紀錄就用紀錄的平均,沒有就用預設值。 */
export function expectedSeconds(db: Db, task: TimedTask): number {
  const row = db.prepare('SELECT average_ms FROM task_timings WHERE task = ?').get(task) as { average_ms: number } | undefined;
  return row ? Math.round(row.average_ms / 100) / 10 : DEFAULT_SECONDS[task];
}

export function taskTimings(db: Db): TaskTimings {
  return { lesson: expectedSeconds(db, 'lesson'), grade: expectedSeconds(db, 'grade'), placement: expectedSeconds(db, 'placement') };
}
