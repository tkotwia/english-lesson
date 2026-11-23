import { z } from 'zod';
import { LEVELS, LevelSchema, McqSchema, type Level, type Mcq } from './schema.ts';

// 分級測驗:從 A1 到 C2 每個等級一組題目,由低到高作答,用來建議該在哪個等級上課。
// 全部是選擇題、每題只作答一次、由程式判分;作答時不呼叫 AI。

/** 每個等級各有幾題:單字、文法、閱讀(共用一篇短文)、聽力(共用一段朗讀內容)。合計 8 題。 */
export const PLACEMENT_COUNTS = { vocab: 2, grammar: 3, reading: 2, listening: 1 } as const;

/** 通過一個等級需要答對的比例。4 個選項亂猜 8 題,猜對 6 題以上的機率不到 1%。 */
export const PLACEMENT_PASS_RATIO = 0.75;

const Text = z.string().trim().min(1);

export const PlacementBandSchema = z.object({
  level: LevelSchema,
  /** 單字題:選出符合句意的字,或選出字義。 */
  vocab: z.array(McqSchema).min(2).max(4),
  /** 文法題:考這個等級的文法。 */
  grammar: z.array(McqSchema).min(2).max(4),
  /** 閱讀題:一篇這個等級的短文,和它的理解題。 */
  reading: z.object({ passage: Text, questions: z.array(McqSchema).min(1).max(3) }),
  /** 聽力題:由瀏覽器朗讀、不顯示文字的一段話,和它的理解題。瀏覽器不能朗讀時不考。 */
  listening: z.object({ script: Text, questions: z.array(McqSchema).min(1).max(2) }),
});
export type PlacementBand = z.infer<typeof PlacementBandSchema>;

export const PlacementTestSchema = z.object({
  /** 由低到高,每個等級一組。 */
  bands: z.array(PlacementBandSchema).length(LEVELS.length),
});
export type PlacementTest = z.infer<typeof PlacementTestSchema>;

// answerIndex 用一般的數字:整數型別在輸出格式裡會帶上下限,同樣會被當成太複雜。
const DraftMcqSchema = z.object({ prompt: z.string(), options: z.array(z.string()), answerIndex: z.number(), explanation: z.string() });

/**
 * 請 AI 出題時交給模型的輸出格式:欄位和 PlacementTestSchema 相同,但不帶任何數量與範圍的限制。
 * 六個等級、每級好幾個有長度限制的陣列疊在一起,模型的結構化輸出會以「格式太複雜」拒絕(實測回 400)。
 * 所以限制寫在提示裡,拿到內容後再用 PlacementTestSchema 嚴格檢查。
 */
export const PlacementDraftSchema = z.object({
  bands: z.array(
    z.object({
      level: LevelSchema,
      vocab: z.array(DraftMcqSchema),
      grammar: z.array(DraftMcqSchema),
      reading: z.object({ passage: z.string(), questions: z.array(DraftMcqSchema) }),
      listening: z.object({ script: z.string(), questions: z.array(DraftMcqSchema) }),
    }),
  ),
});

/**
 * 把每一題的選項順序打亂,正確答案跟著移動。
 * 模型出題時,正確答案常常集中在前面的位置(實測有一份 48 題沒有任何一題的答案在第四個選項);
 * 學生發現規律就能靠猜過關。位置交給程式決定,就不必指望模型自己分散。
 */
export function shuffleOptions(test: PlacementTest, random: () => number = Math.random): PlacementTest {
  const shuffled = (mcq: Mcq): Mcq => {
    const order = mcq.options.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    return { ...mcq, options: order.map((index) => mcq.options[index]!), answerIndex: order.indexOf(mcq.answerIndex) };
  };
  return {
    bands: test.bands.map((band) => ({
      level: band.level,
      vocab: band.vocab.map(shuffled),
      grammar: band.grammar.map(shuffled),
      reading: { passage: band.reading.passage, questions: band.reading.questions.map(shuffled) },
      listening: { script: band.listening.script, questions: band.listening.questions.map(shuffled) },
    })),
  };
}

/** 以題號為鍵的作答:學生選的選項是第幾個(從 0 起算)。 */
export const PlacementAnswersSchema = z.record(z.string().max(40), z.number().int().min(0).max(3));
export type PlacementAnswers = z.infer<typeof PlacementAnswersSchema>;

export type PlacementKind = keyof typeof PLACEMENT_COUNTS;

export interface PlacementQuestion {
  /** 題號,同時是作答紀錄的鍵,例如 A2.grammar.1。 */
  key: string;
  level: Level;
  kind: PlacementKind;
  mcq: Mcq;
  /** 閱讀題要先讀的短文。 */
  passage?: string;
  /** 聽力題要聽的內容(不顯示文字)。 */
  script?: string;
}

/** 測驗的題目必須依 A1 到 C2 的順序各有一組;順序不對就無法由低到高判定。 */
export function hasAllBandsInOrder(test: PlacementTest): boolean {
  return test.bands.length === LEVELS.length && test.bands.every((band, index) => band.level === LEVELS[index]);
}

/** 某個等級要作答的題目,依作答順序排列。瀏覽器不能朗讀時沒有聽力題。 */
export function bandQuestions(band: PlacementBand, tts: boolean): PlacementQuestion[] {
  const { level } = band;
  const of = (kind: PlacementKind, items: Mcq[], extra: Partial<PlacementQuestion> = {}): PlacementQuestion[] =>
    items.map((mcq, index) => ({ key: `${level}.${kind}.${index}`, level, kind, mcq, ...extra }));
  return [
    ...of('vocab', band.vocab),
    ...of('grammar', band.grammar),
    ...of('reading', band.reading.questions, { passage: band.reading.passage }),
    ...(tts ? of('listening', band.listening.questions, { script: band.listening.script }) : []),
  ];
}

export interface BandResult {
  level: Level;
  correct: number;
  total: number;
  passed: boolean;
}

export interface PlacementOutcome {
  /** 作答過的等級,由低到高;遇到第一個沒通過的等級就停。 */
  bands: BandResult[];
  /** 建議上課的等級:第一個沒通過的等級;全部通過就是 C2。 */
  level: Level;
}

/** 通過這個等級至少要答對幾題。 */
export const passMark = (total: number): number => Math.ceil(total * PLACEMENT_PASS_RATIO);

function gradeBand(band: PlacementBand, answers: PlacementAnswers, tts: boolean): BandResult {
  const questions = bandQuestions(band, tts);
  const correct = questions.filter((question) => answers[question.key] === question.mcq.answerIndex).length;
  return { level: band.level, correct, total: questions.length, passed: correct >= passMark(questions.length) };
}

/**
 * 測驗結果。由低到高一級一級看:
 * - 通過(答對四分之三以上)就繼續看下一級;
 * - 第一個沒通過的等級,就是建議上課的等級:這一級的內容還沒掌握,正好是要學的。
 * 之後的等級不看:較難的等級靠猜也可能湊到分數,不能拿來抵消前面沒通過的等級。
 * 沒作答的題目算錯。
 */
export function placementOutcome(test: PlacementTest, answers: PlacementAnswers, tts: boolean): PlacementOutcome {
  const bands: BandResult[] = [];
  for (const band of test.bands) {
    const result = gradeBand(band, answers, tts);
    bands.push(result);
    if (!result.passed) return { bands, level: band.level };
  }
  return { bands, level: LEVELS[LEVELS.length - 1]! };
}

/**
 * 作答到一半時,接下來要答哪一題;null 表示測驗結束。
 * 一個等級的題目全部答完才判定:通過就進下一級,沒通過就結束,不必把更難的題目做完。
 */
export function nextQuestion(test: PlacementTest, answers: PlacementAnswers, tts: boolean): PlacementQuestion | null {
  for (const band of test.bands) {
    const questions = bandQuestions(band, tts);
    const open = questions.find((question) => answers[question.key] === undefined);
    if (open) return open;
    if (!gradeBand(band, answers, tts).passed) return null;
  }
  return null;
}
