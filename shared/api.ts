import { z } from 'zod';
import type { ReviewItemView } from './lesson.ts';
import type { LevelUpSuggestion } from './levelup.ts';
import { ExerciseAnswerSchema, type Level, type RetakeSummary, type SectionResult } from './schema.ts';

// 日曆、進度與回顧相關 API 的請求與回應格式。

export interface CalendarSession {
  id: number;
  title: string;
  level: Level;
  score: number;
  sections: SectionResult[];
  weakCount: number;
  /** 這堂課之後重上過的紀錄。重上的分數不計入當日分數與月平均。 */
  retakes: RetakeSummary[];
}

export interface CalendarDay {
  date: string;
  /** 當日分數:當天所有完成課程的平均。 */
  score: number;
  sessions: CalendarSession[];
}

export interface CalendarMonth {
  month: string;
  /** 月分數:有上課日的每日分數平均;整個月沒上課時為 null。 */
  average: number | null;
  days: CalendarDay[];
}

export interface ProgressSummary {
  today: string;
  todayScore: number | null;
  monthAverage: number | null;
  /** 今天到期、等待複習的項目數。 */
  dueCount: number;
  suggestion: LevelUpSuggestion | null;
}

export interface ReviewListItem extends ReviewItemView {
  /** 在查詢的日期範圍內,被記為不會 / 不熟 / 手動標記的次數。 */
  misses: number;
}

/** 下一堂課有沒有預先備好。 */
export interface PreparedStatus {
  /** none:沒有;preparing:正在背景準備;ready:已經備好。 */
  state: 'none' | 'preparing' | 'ready';
  /** 備好(或正在準備)的是幾分鐘的課;選這個長度可以馬上開始。 */
  minutes: 20 | 30 | 40 | null;
}

export const LevelDecisionSchema = z.object({
  userId: z.number().int().positive(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  decision: z.enum(['accepted', 'declined']),
});

export const ReviewResultsSchema = z.object({
  userId: z.number().int().positive(),
  /** 以項目編號為鍵的作答紀錄;由伺服器依項目庫裡的題目重新判分。 */
  answers: z.record(z.string().regex(/^\d+$/), ExerciseAnswerSchema),
});

export const FlagSchema = z.object({
  /** 要標為「我不熟」的對象:題號(如 vocab.0、reading.1)或 glossary.N。 */
  target: z.string().min(1).max(100),
});
