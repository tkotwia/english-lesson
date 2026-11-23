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

/** 某一種課程長度現在能不能馬上開始。 */
export interface LengthStatus {
  minutes: 20 | 30 | 40;
  /** ready:可以馬上開始;preparing:背景正在準備或已經排定要準備這一堂;none:按開始後才會請老師現場備課。 */
  state: 'ready' | 'preparing' | 'none';
  /** 可以馬上開始的原因:prepared 是背景備好的課,starter 是內建的起始課。 */
  source: 'prepared' | 'starter' | null;
  /** 現在按開始,預估要等幾秒(由過去實際花費的時間推估);可以馬上開始時是 0。 */
  waitSeconds: number;
}

/** 這位使用者在目前的等級與學習階段下,各種課程長度的準備狀況。 */
export interface PreparedStatus {
  lengths: LengthStatus[];
}

/** 等待 AI 時的預估秒數,用來畫進度條。由過去實際花費的時間推估。 */
export interface TaskTimings {
  lesson: number;
  grade: number;
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
