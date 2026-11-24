import { z } from 'zod';
import type { ReviewItemView } from './lesson.ts';
import { PlacementAnswersSchema, type BandResult, type PlacementTest } from './placement.ts';
import { ExerciseAnswerSchema, type Level, type Minutes, type Outcome, type RetakeSummary, type SectionResult } from './schema.ts';
import type { ItemStatus } from './srs.ts';

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
}

export interface ReviewListItem extends ReviewItemView {
  /** 在查詢的日期範圍內,被記為不會 / 不熟 / 手動標記的次數。 */
  misses: number;
  /** 這段期間最近一次答錯時,學生的作答(選擇題是選項的文字)。手動標記或當時沒有記錄時是空的。 */
  wrongAnswers: string[];
}

/** 這位使用者在目前的等級與學習階段下,下一堂課準備得怎麼樣。 */
export interface PreparedStatus {
  /** 下一堂課的長度:依學習階段固定;內建的起始課是 20 分鐘的份量。 */
  minutes: Minutes;
  /** ready:可以馬上開始;preparing:老師正在備這一堂;none:還沒備好,要按「備課」。 */
  state: 'ready' | 'preparing' | 'none';
  /** 可以馬上開始的原因:prepared 是備好的課,starter 是內建的起始課。 */
  source: 'prepared' | 'starter' | null;
  /** 現在開始備課(或等正在備的那一堂做完),預估要等幾秒(由過去實際花費的時間推估);可以馬上開始時是 0。 */
  waitSeconds: number;
}

/** 等待 AI 時的預估秒數,用來畫進度條。由過去實際花費的時間推估。 */
export interface TaskTimings {
  lesson: number;
  grade: number;
  /** 出一份分級測驗。 */
  placement: number;
}

/** 作答中的分級測驗。 */
export interface PlacementAttempt {
  id: number;
  test: PlacementTest;
  /** builtin:內建的題目;ai:老師(AI)出的題目。 */
  source: 'builtin' | 'ai';
  /**
   * 這次是「之前做過的內建題目」時的原因(沒有 API key,或老師現在出不了合格的題目);否則是 null。
   * 題目看過了,結果可能比實際程度高,所以要讓學生知道。
   */
  repeatReason: string | null;
}

/** 一次分級測驗的結果。 */
export interface PlacementResult {
  id: number;
  date: string;
  /** 測驗當時的等級。 */
  levelBefore: Level;
  /** 測驗建議的等級。 */
  recommended: Level;
  bands: BandResult[];
}

/** 單字表裡的一個字:在某一堂課學到的重點單字,以及當時與現在的狀況。 */
export interface WordListItem {
  word: string;
  pos: string;
  meaning: string;
  example: string;
  /** 教這個字的那堂課。 */
  sessionId: number;
  date: string;
  lessonTitle: string;
  /** 當初在課堂上作答的結果:correct 第一次就對,unfamiliar 不熟,unknown 不會。 */
  outcome: Outcome;
  /** 當初答錯時填的內容。 */
  wrongAnswers: string[];
  /** 當時或課後有沒有手動標過「我不熟」。 */
  flagged: boolean;
  /** 現在在間隔複習裡的狀態;不在複習中(較早的版本答對的字沒有排進複習)是 null。 */
  status: ItemStatus | null;
}

export interface WordList {
  level: Level;
  words: WordListItem[];
}

export interface PlacementStatus {
  /** 現在按開始能不能馬上作答。 */
  ready: boolean;
  /** 不能馬上作答時,預估要等幾秒(老師正在出題,或按開始後才出題)。 */
  waitSeconds: number;
  /** 沒有設定 API key、內建的題目又已經做過:只能再做同一份題目。 */
  repeatsBuiltin: boolean;
  /** 有一份做到一半的測驗。 */
  inProgress: boolean;
  /** 做過的測驗,由新到舊。 */
  results: PlacementResult[];
}

/** 免費額度的上限到了(Google 回 429)時,顯示給使用者看的通知。 */
export interface QuotaNotice {
  id: number;
  /** 發生的時間(ISO 8601)。 */
  at: string;
  model: string;
  /** 當時在做什麼:lesson 備課、grade 批改、chat 對話、ask 問老師、placement 分級測驗出題、live 即時對話、speech 製作聽力音檔。 */
  task: string;
  /** minute:每分鐘的上限;day:每日的上限;unknown:看不出是哪一種。 */
  scope: 'minute' | 'day' | 'unknown';
  /** Google 建議等幾秒再試;不知道時是 null。 */
  retryAfterSeconds: number | null;
}

/** 「即時對話」頁面的自由對話:一次對話裡學生可以說幾輪。(課程裡的情境對話輪數依課程長度而定。) */
export const LIVE_TURNS = 5;

/** 學生安靜多久(毫秒)算說完了。比一般語音對話常用的值長,給學生停下來想的空間。 */
export const LIVE_SILENCE_MS = 1200;

/** 一堂課的聽力課文與聽寫句子裡,已經用自然的聲音唸好的音檔。沒有音檔的文字由瀏覽器朗讀。 */
export interface LessonAudioInfo {
  /** 文字 → 音檔的網址。 */
  clips: Record<string, string>;
  /** 伺服器是否還在背景製作這位使用者的音檔(是的話,過一下再問可能會多幾段)。 */
  working: boolean;
}

/** 開始一場即時語音對話後回傳的資訊。 */
export interface LiveSessionInfo {
  id: string;
  /** 學生可以說幾輪。 */
  turns: number;
  /** 聊的主題或情境。 */
  topic: string;
  /** 學生的聲音要用的取樣率,以及老師的聲音的取樣率(都是 16 位元單聲道 PCM)。 */
  inputRate: number;
  outputRate: number;
}

/** 對話進行中,伺服器陸續送給瀏覽器的內容(一行一個 JSON)。 */
export type LiveEvent =
  /** 學生這段話的文字稿片段。 */
  | { type: 'heard'; text: string }
  /** 老師說的話的文字稿片段。 */
  | { type: 'said'; text: string }
  /** 老師的聲音片段,base64 編碼的 PCM。 */
  | { type: 'audio'; data: string }
  /** 老師說完一輪。turnsLeft 是學生還可以說幾輪。 */
  | { type: 'done'; turnsLeft: number }
  /** 學生開口打斷了老師,還沒播完的聲音要立刻停掉。 */
  | { type: 'interrupted' }
  /** 對話結束(輪數用完,或時間到了)。 */
  | { type: 'ended' }
  | { type: 'error'; code: string; message: string };

export const PlacementCompleteSchema = z.object({
  answers: PlacementAnswersSchema,
  /** 作答時瀏覽器能不能朗讀;不能的話沒有聽力題。 */
  tts: z.boolean(),
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
