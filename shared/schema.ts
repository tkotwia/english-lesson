import { z } from 'zod';

// ---- 學習階段與 CEFR 等級 ----
// 兩者刻意分開:CEFR 等級決定語言難度,學習階段決定主題與語氣。

export const STAGES = ['elementary', 'junior', 'senior', 'university'] as const;
export const StageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof StageSchema>;

export const STAGE_LABELS: Record<Stage, string> = {
  elementary: '國小',
  junior: '國中',
  senior: '高中',
  university: '大學',
};

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const LevelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof LevelSchema>;

export const DEFAULT_LEVEL_BY_STAGE: Record<Stage, Level> = {
  elementary: 'A1',
  junior: 'A2',
  senior: 'B1',
  university: 'B2',
};

// ---- 使用者 ----

const NameSchema = z.string().trim().min(1, '請輸入名稱').max(20, '名稱最多 20 個字');

export const NewUserSchema = z.object({
  name: NameSchema,
  stage: StageSchema,
  level: LevelSchema.optional(),
});
export type NewUser = z.infer<typeof NewUserSchema>;

export const UserPatchSchema = z.object({
  name: NameSchema.optional(),
  stage: StageSchema.optional(),
  level: LevelSchema.optional(),
});
export type UserPatch = z.infer<typeof UserPatchSchema>;

export const ApiKeyBodySchema = z.object({
  apiKey: z.string().trim().max(200),
});

/** 傳給瀏覽器的使用者資料。完整的 API key 絕不包含在內,只有末四碼。 */
export interface PublicUser {
  id: number;
  name: string;
  stage: Stage;
  level: Level;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  createdAt: string;
}

// ---- AI 用量與狀態 ----

export type AiTier = 'quality' | 'chat';

export type AiErrorCode = 'no_key' | 'invalid_key' | 'quota' | 'bad_output' | 'unavailable';

export interface UsageRow {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** 這些呼叫合計等了多久(毫秒);除以次數就是平均每次的等待時間。 */
  totalMs: number;
}

export interface SettingsStatus {
  provider: string;
  models: Record<AiTier, string[]>;
  /** 額度週期的日期(太平洋時間),Gemini 的每日額度以此重置。 */
  quotaDate: string;
  usage: UsageRow[];
}

export type KeyTestResult =
  | { ok: true; model: string }
  | { ok: false; code: AiErrorCode; message: string; detail?: string };

// ---- 課程內容(由 AI 產生) ----
// 刻意不用 union 型別:結構化輸出對扁平的 schema 最穩定,日後換供應商也最不容易出問題。
// 跨欄位的規則(答案索引不可超出選項數等)AI 端無法強制,由 superRefine 在收到後檢查。

const Text = z.string().trim().min(1);

/** 克漏字句子裡代表空格的記號。 */
export const BLANK = '___';

export const McqSchema = z.object({
  prompt: Text,
  options: z.array(Text).min(3).max(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: Text,
});
export type Mcq = z.infer<typeof McqSchema>;

export const ClozeSchema = z.object({
  sentence: Text,
  answers: z.array(Text).min(1).max(4),
  hint: Text,
  explanation: Text,
});
export type Cloze = z.infer<typeof ClozeSchema>;

export const ReorderSchema = z.object({
  sentence: Text,
  translation: Text,
  explanation: Text,
});
export type Reorder = z.infer<typeof ReorderSchema>;

export const VocabSchema = z.object({
  word: Text,
  pos: Text,
  meaning: Text,
  example: Text,
  cloze: ClozeSchema,
});
export type Vocab = z.infer<typeof VocabSchema>;

export const LessonSchema = z
  .object({
    title: Text,
    intro: Text,
    passage: z.object({ text: Text, translation: z.string() }),
    glossary: z.array(z.object({ word: Text, meaning: Text })),
    listening: z.object({
      questions: z.array(McqSchema).min(2),
      dictation: z.array(Text).min(1),
    }),
    reading: z.object({ questions: z.array(McqSchema).min(2) }),
    vocab: z.array(VocabSchema).min(4),
    grammar: z.object({
      point: Text,
      explanation: Text,
      examples: z.array(Text).min(2),
      mcq: z.array(McqSchema),
      cloze: z.array(ClozeSchema),
      reorder: z.array(ReorderSchema),
    }),
    speaking: z.object({
      readAloud: z.array(Text).min(2),
      scenario: Text,
      opening: Text,
    }),
    writing: z.object({
      prompt: Text,
      minWords: z.number().int().min(1),
      tips: z.array(Text),
    }),
  })
  .superRefine((lesson, ctx) => {
    const checkMcq = (mcq: Mcq, where: string) => {
      if (mcq.answerIndex >= mcq.options.length) ctx.addIssue({ code: 'custom', message: `${where}:答案索引超出選項數` });
      if (new Set(mcq.options).size !== mcq.options.length) ctx.addIssue({ code: 'custom', message: `${where}:選項重複` });
    };
    const checkCloze = (cloze: Cloze, where: string) => {
      if (cloze.sentence.split(BLANK).length !== 2) ctx.addIssue({ code: 'custom', message: `${where}:句子必須剛好有一個 ${BLANK} 空格` });
    };
    lesson.listening.questions.forEach((q, i) => checkMcq(q, `聽力題 ${i + 1}`));
    lesson.reading.questions.forEach((q, i) => checkMcq(q, `閱讀題 ${i + 1}`));
    lesson.vocab.forEach((v, i) => checkCloze(v.cloze, `單字題 ${i + 1}`));
    lesson.grammar.mcq.forEach((q, i) => checkMcq(q, `文法選擇題 ${i + 1}`));
    lesson.grammar.cloze.forEach((q, i) => checkCloze(q, `文法克漏字 ${i + 1}`));
    lesson.grammar.reorder.forEach((q, i) => {
      if (q.sentence.split(/\s+/).length < 3) ctx.addIssue({ code: 'custom', message: `文法重組題 ${i + 1}:句子至少要 3 個字` });
    });
    const grammarCount = lesson.grammar.mcq.length + lesson.grammar.cloze.length + lesson.grammar.reorder.length;
    if (grammarCount < 3) ctx.addIssue({ code: 'custom', message: '文法練習至少要 3 題' });
  });
export type Lesson = z.infer<typeof LessonSchema>;

// ---- 批改結果(由 AI 產生) ----

export const GradeSchema = z.object({
  writing: z.object({
    score: z.number().min(0).max(100),
    corrected: z.string(),
    comment: Text,
  }),
  /** 情境對話的評分。沒有進行對話時,這個分數不會被採用。 */
  speaking: z.object({
    score: z.number().min(0).max(100),
    comment: Text,
  }),
  errors: z.array(
    z.object({
      /** 錯誤出自寫作還是對話。 */
      source: z.enum(['writing', 'speaking']),
      original: Text,
      corrected: Text,
      explanation: Text,
      /** unfamiliar:偶發的小錯;unknown:觀念性或反覆出現的錯誤。 */
      severity: z.enum(['unfamiliar', 'unknown']),
    }),
  ),
  closing: Text,
});
export type Grade = z.infer<typeof GradeSchema>;

// ---- 上課進度與結果 ----

export const LESSON_MINUTES = [20, 30, 40] as const;
export const MinutesSchema = z.union([z.literal(20), z.literal(30), z.literal(40)]);
export type Minutes = z.infer<typeof MinutesSchema>;

/** 老師在對話中對學生某句話的糾正。 */
export const CorrectionSchema = z.object({
  original: Text,
  corrected: Text,
  explanation: Text,
});
export type Correction = z.infer<typeof CorrectionSchema>;

export const ChatTurnSchema = z.object({
  role: z.enum(['teacher', 'student']),
  text: z.string(),
  /** 老師針對這句學生發言的糾正(只出現在學生的發言上)。 */
  corrections: z.array(CorrectionSchema).default([]),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

/** AI 在對話中每一輪的回覆。 */
export const ChatReplySchema = z.object({
  reply: Text,
  corrections: z.array(CorrectionSchema).max(2),
});
export type ChatReply = z.infer<typeof ChatReplySchema>;

/** AI 對「問老師」的回答。 */
export const AskReplySchema = z.object({ answer: Text });

export const ChatBodySchema = z.object({ message: z.string().trim().min(1, '請先說點什麼').max(500) });
export const AskBodySchema = z.object({ question: z.string().trim().min(1, '請輸入問題').max(300) });

/** 情境對話中學生要說幾輪,依課程長度而定。 */
export const CHAT_TURNS: Record<20 | 30 | 40, number> = { 20: 5, 30: 6, 40: 8 };
/** 每堂課最多可以問老師幾次,避免耗盡每日額度。 */
export const MAX_ASKS = 5;

export const ExerciseAnswerSchema = z.object({
  /** 依序記錄每次作答的內容,最多兩次。 */
  attempts: z.array(z.string().max(1000)).max(2),
  hintUsed: z.boolean(),
});
export type ExerciseAnswer = z.infer<typeof ExerciseAnswerSchema>;

export const SessionStateSchema = z.object({
  /** 目前進行到第幾個階段(從 0 起算)。 */
  step: z.number().int().min(0).default(0),
  answers: z.record(z.string(), ExerciseAnswerSchema).default({}),
  writing: z.string().max(5000).default(''),
  /** 學生手動按過「我不熟」的對象(題號,或 glossary.N)。 */
  flags: z.array(z.string().max(100)).default([]),
  /** 這台瀏覽器能不能朗讀(tts)與語音辨識(stt)。不能的部分不計分,配分由其餘部分分攤。 */
  capabilities: z.object({ tts: z.boolean(), stt: z.boolean() }).default({ tts: true, stt: true }),
  /** 與老師的情境對話紀錄。由伺服器寫入,瀏覽器送來的內容不會被採用。 */
  chat: z.array(ChatTurnSchema).default([]),
  /** AI 對話服務無法使用(例如額度用完)而跳過對話時為 true,對話不計分。 */
  chatUnavailable: z.boolean().default(false),
  /** 「問老師」的問答紀錄。由伺服器寫入。 */
  asks: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  /** 課前重溫上一課(流暢度練習)的紀錄。不計分;沒做的項目是 null。 */
  fluency: z
    .object({
      /** 計時重讀上一課課文的速度(每分鐘幾個字)。 */
      readingWpm: z.number().int().min(0).max(2000).nullable().default(null),
      /** 一分鐘重述時說出(或打出)的英文字數。 */
      retellWords: z.number().int().min(0).max(2000).nullable().default(null),
    })
    .default({ readingWpm: null, retellWords: null }),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export const NewSessionSchema = z.object({
  userId: z.number().int().positive(),
  minutes: MinutesSchema,
});

export type Section = 'review' | 'listening' | 'reading' | 'language' | 'speaking' | 'writing';
export type ItemKind = 'vocab' | 'grammar' | 'reading' | 'listening' | 'speaking' | 'writing';
/** correct:第一次就對;unfamiliar:不熟;unknown:不會。 */
export type Outcome = 'correct' | 'unfamiliar' | 'unknown';

export interface SectionResult {
  section: Section;
  /** 這個階段的得分率,0–100。 */
  percent: number;
  /** 這個階段在本堂課實際佔的配分(已依可進行的階段等比例調整,合計 100)。 */
  weight: number;
}

export interface WeakPoint {
  /** 對應的練習題代號;AI 批改找出的錯誤沒有題號。 */
  key: string | null;
  kind: ItemKind;
  outcome: Exclude<Outcome, 'correct'>;
  /** 顯示給學生看的標題,例如單字本身或題目。 */
  label: string;
  /** 正確答案或正確說法。 */
  answer: string;
  explanation: string;
}

export interface SessionResult {
  score: number;
  sections: SectionResult[];
  weakPoints: WeakPoint[];
  writing: Grade['writing'] | null;
  /** 情境對話的評分;沒有進行對話時為 null。 */
  speaking: Grade['speaking'] | null;
  closing: string;
}

/** 產生新課時,程式拿它和先前的課比對的結果。 */
export interface LessonNovelty {
  /** 比對了幾堂先前的課。 */
  compared: number;
  /** 課文與最相似的舊課文的相似度,0–1(連續三個字的片段有多少比例相同)。 */
  passageSimilarity: number;
  /** 最相似的那堂舊課;沒有任何重疊時為 null。 */
  similarTo: { sessionId: number; title: string; date: string } | null;
  /** 這堂課的重點單字裡,之前已經當過重點單字的。 */
  repeatedVocab: string[];
  /** 第一次產生的課文和舊課幾乎相同,因此重新產生過一次。 */
  regenerated: boolean;
}

/** 一次重上的摘要。 */
export interface RetakeSummary {
  id: number;
  date: string;
  score: number;
}

export interface SessionView {
  id: number;
  userId: number;
  localDate: string;
  level: Level;
  stage: Stage;
  minutes: Minutes;
  topic: string;
  status: 'in_progress' | 'completed';
  lesson: Lesson;
  /** 這堂課開始時到期的複習項目(暖身複習的題目)。 */
  review: import('./lesson.ts').ReviewItemView[];
  state: SessionState;
  result: SessionResult | null;
  /** 這是重上的課時,原本那堂課的編號。重上只當練習,不計入日曆與月平均。 */
  retakeOf: number | null;
  /** 這堂課之後重上過的紀錄(只有原本那堂課才有)。 */
  retakes: RetakeSummary[];
  /** 產生這堂課時的重覆檢查結果;舊資料或重上的課沒有。 */
  novelty: LessonNovelty | null;
  /** 上一堂上完的課,給課前的流暢度練習用;沒有上過別的課時為 null。 */
  previous: PreviousLesson | null;
  /** 課後建議看的影片(符合這堂課的等級);課還沒上完,或這個等級沒有影片時為 null。 */
  video: VideoSuggestion | null;
}

/** 課後延伸聆聽的影片。課堂上的輸入量不夠,靠這個補。 */
export interface VideoSuggestion {
  url: string;
  title: string;
  channel: string;
  /** 大約幾分鐘;不知道時為 null。 */
  minutes: number | null;
  /** 同一系列的其他影片(頻道或播放清單)。 */
  seriesUrl: string;
}

/** 上一堂課的課文,以及學生最近一次流暢度練習的成績(用來和這次比較)。 */
export interface PreviousLesson {
  title: string;
  text: string;
  lastReadingWpm: number | null;
  lastRetellWords: number | null;
}

// ---- 顯示用的名稱與等級設定(前後端共用) ----

/** 中文輔助的程度:full 用中文解釋;partial 中英並用;none 全英文。 */
export type ZhSupport = 'full' | 'partial' | 'none';

export const ZH_SUPPORT: Record<Level, ZhSupport> = {
  A1: 'full',
  A2: 'full',
  B1: 'partial',
  B2: 'none',
  C1: 'none',
  C2: 'none',
};

export const SECTION_LABELS: Record<Section, string> = {
  review: '暖身複習',
  listening: '聽力',
  reading: '閱讀',
  language: '單字與文法',
  speaking: '口說',
  writing: '寫作',
};

export const KIND_LABELS: Record<ItemKind, string> = {
  vocab: '單字',
  grammar: '文法',
  reading: '閱讀',
  listening: '聽力',
  speaking: '口說',
  writing: '寫作',
};

export const OUTCOME_LABELS: Record<Exclude<Outcome, 'correct'>, string> = {
  unknown: '不會',
  unfamiliar: '不熟',
};
