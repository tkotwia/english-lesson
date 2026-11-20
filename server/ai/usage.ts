import type { UsageRow } from '../../shared/schema.ts';
import type { Db } from '../db.ts';
import type { AiUsage, UsageRecorder } from './provider.ts';

const PACIFIC_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' });

/**
 * 額度週期的日期。Gemini 的每日額度在太平洋時間午夜重置,
 * 所以用量要以太平洋日期歸戶,畫面上的數字才能和 AI Studio 的上限對照。
 */
export function quotaDate(now: Date = new Date()): string {
  return PACIFIC_DATE.format(now);
}

export function recordUsage(db: Db, userId: number, usage: AiUsage, now: Date = new Date()): void {
  db.prepare(
    `INSERT INTO api_usage (user_id, date, model, calls, input_tokens, output_tokens, total_ms)
     VALUES (?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT (user_id, date, model) DO UPDATE SET
       calls = calls + 1,
       input_tokens = input_tokens + excluded.input_tokens,
       output_tokens = output_tokens + excluded.output_tokens,
       total_ms = total_ms + excluded.total_ms`,
  ).run(userId, quotaDate(now), usage.model, usage.inputTokens, usage.outputTokens, Math.round(usage.durationMs));
}

export function usageRecorder(db: Db, userId: number): UsageRecorder {
  return (usage) => recordUsage(db, userId, usage);
}

export function getUsage(db: Db, userId: number, date: string): UsageRow[] {
  const rows = db
    .prepare(
      `SELECT model, calls, input_tokens AS inputTokens, output_tokens AS outputTokens, total_ms AS totalMs
       FROM api_usage WHERE user_id = ? AND date = ? ORDER BY model`,
    )
    .all(userId, date);
  return rows.map((row) => ({ ...row })) as unknown as UsageRow[];
}
