import {
  correctAnswerText,
  FLASHCARD_KNOWN,
  lessonExercises,
  reviewExercises,
  SPEAKING_WEIGHTS,
  type Exercise,
  type ReviewItemView,
} from './lesson.ts';
import type { ExerciseAnswer, Grade, Lesson, Outcome, Section, SectionResult, SessionResult, SessionState, WeakPoint } from './schema.ts';

/** 各階段的配分,合計 100。某階段無法進行時,其餘階段等比例放大。 */
export const SECTION_WEIGHTS: Record<Section, number> = {
  review: 10,
  listening: 15,
  reading: 15,
  language: 20,
  speaking: 20,
  writing: 20,
};

export const MAX_ATTEMPTS = 2;

/** 比對答案前的正規化:不計大小寫、標點、多餘空白,並統一各種撇號。 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 聽寫與跟讀:單字正確率達到這個比例算答對。 */
export const ACCURACY_CORRECT = 0.9;
/** 聽寫與跟讀:單字正確率達到這個比例(但未達答對標準)算不熟,低於則算不會。 */
export const ACCURACY_UNFAMILIAR = 0.7;

/**
 * 單字正確率:兩句話依序對得上的單字數,除以較長那一句的字數。
 * 少寫、多寫、寫錯或順序不對都會拉低正確率。
 */
export function wordAccuracy(expected: string, actual: string): number {
  const a = normalizeAnswer(expected).split(' ').filter(Boolean);
  const b = normalizeAnswer(actual).split(' ').filter(Boolean);
  if (a.length === 0 || b.length === 0) return 0;
  // 最長共同子序列:依序對得上的單字數。
  let previous = new Array<number>(b.length + 1).fill(0);
  for (const word of a) {
    const current = [0];
    for (let j = 1; j <= b.length; j++) {
      current[j] = word === b[j - 1] ? previous[j - 1]! + 1 : Math.max(previous[j]!, current[j - 1]!);
    }
    previous = current;
  }
  return previous[b.length]! / Math.max(a.length, b.length);
}

/** 單次作答是否正確。選擇題的作答內容是選項索引(字串)。 */
export function checkAnswer(exercise: Exercise, response: string): boolean {
  switch (exercise.type) {
    case 'mcq':
      return response.trim() !== '' && Number(response) === exercise.answerIndex;
    case 'cloze': {
      const given = normalizeAnswer(response);
      return given !== '' && exercise.answers.some((answer) => normalizeAnswer(answer) === given);
    }
    case 'reorder':
      return normalizeAnswer(response) === normalizeAnswer(exercise.sentence);
    case 'flashcard':
      return response === FLASHCARD_KNOWN;
    case 'dictation':
    case 'readAloud':
      return wordAccuracy(exercise.sentence, response) >= ACCURACY_CORRECT;
  }
}

/** 一題最多可以作答幾次。閃卡是自我評量,只有一次。 */
export function maxAttempts(exercise: Exercise): number {
  return exercise.type === 'flashcard' ? 1 : MAX_ATTEMPTS;
}

export interface ExerciseGrade {
  outcome: Outcome;
  /** 得分比例:1、0.5 或 0。 */
  credit: number;
}

/**
 * 一題的判定:
 * - 第一次就對且沒看提示:滿分。
 * - 第二次才對,或看了提示才對:半分,記為「不熟」。
 * - 兩次都錯,或沒作答:零分,記為「不會」。
 */
export function gradeExercise(exercise: Exercise, answer: ExerciseAnswer | undefined): ExerciseGrade {
  const attempts = answer?.attempts.slice(0, maxAttempts(exercise)) ?? [];
  const correctAt = attempts.findIndex((attempt) => checkAnswer(exercise, attempt));
  if (correctAt === -1) {
    // 聽寫與跟讀:沒達到答對標準,但大部分的字都對,算不熟而不是不會。
    if (exercise.type === 'dictation' || exercise.type === 'readAloud') {
      const best = Math.max(0, ...attempts.map((attempt) => wordAccuracy(exercise.sentence, attempt)));
      if (best >= ACCURACY_UNFAMILIAR) return { outcome: 'unfamiliar', credit: 0.5 };
    }
    return { outcome: 'unknown', credit: 0 };
  }
  if (correctAt === 0 && !answer?.hintUsed) return { outcome: 'correct', credit: 1 };
  return { outcome: 'unfamiliar', credit: 0.5 };
}

/** 這一題是否已經作答完畢(答對了,或用完兩次機會)。 */
export function isExerciseDone(exercise: Exercise, answer: ExerciseAnswer | undefined): boolean {
  if (!answer) return false;
  return answer.attempts.length >= maxAttempts(exercise) || answer.attempts.some((attempt) => checkAnswer(exercise, attempt));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 把各階段的得分率(0–100)合成總分。
 * 只有傳入的階段才計分,它們的配分等比例放大到合計 100,所以滿分永遠是 100。
 */
export function combineScore(percents: Partial<Record<Section, number>>): { score: number; sections: SectionResult[] } {
  const present = (Object.keys(SECTION_WEIGHTS) as Section[]).filter((section) => percents[section] !== undefined);
  const totalWeight = present.reduce((sum, section) => sum + SECTION_WEIGHTS[section], 0);
  if (totalWeight === 0) return { score: 0, sections: [] };

  const sections = present.map((section) => ({
    section,
    percent: round1(percents[section]!),
    weight: round1((SECTION_WEIGHTS[section] / totalWeight) * 100),
  }));
  const score = present.reduce((sum, section) => sum + percents[section]! * (SECTION_WEIGHTS[section] / totalWeight), 0);
  return { score: round1(score), sections };
}

export const DEFAULT_CLOSING = 'Good work today. See you next time!';

const meanCredit = (items: { credit: number }[]) => (items.reduce((sum, item) => sum + item.credit, 0) / items.length) * 100;

/**
 * 一堂課的最終結果。
 * - 客觀題(含聽寫、跟讀)由這裡依作答紀錄判分。
 * - 寫作與情境對話由 AI 批改(grade);兩者都沒做時 grade 為 null。
 * - 無法進行的部分不計分,配分由其餘部分分攤:
 *   沒有到期的複習項目 → 沒有暖身複習;瀏覽器不能朗讀 → 沒有聽力;
 *   不能語音辨識 → 口說只算對話;AI 對話服務無法使用 → 口說只算跟讀。
 * review 是這堂課開始時到期的複習項目。
 */
export function buildSessionResult(lesson: Lesson, state: SessionState, grade: Grade | null, review: ReviewItemView[] = []): SessionResult {
  const { tts, stt } = state.capabilities;
  const graded = [...reviewExercises(review), ...lessonExercises(lesson)]
    // 不能朗讀就沒有聽力題;不能語音辨識就沒有跟讀題。
    .filter((item) => (item.section === 'listening' ? tts : item.section === 'speaking' ? stt : true))
    .map((item) => ({ ...item, ...gradeExercise(item.exercise, state.answers[item.key]) }));
  const inSection = (section: Section) => graded.filter((item) => item.section === section);

  const wroteSomething = state.writing.trim() !== '';
  const talked = state.chat.some((turn) => turn.role === 'student');
  const writingGrade = grade && wroteSomething ? grade.writing : null;
  const speakingGrade = grade && talked ? grade.speaking : null;

  const percents: Partial<Record<Section, number>> = {};
  for (const section of ['review', 'listening', 'reading', 'language'] as const) {
    const items = inSection(section);
    if (items.length > 0) percents[section] = meanCredit(items);
  }

  // 口說 = 跟讀與情境對話,依比重合成;缺其中一項時只算另一項,兩項都缺就不計口說。
  const speakingParts: { percent: number; weight: number }[] = [];
  const readAloud = inSection('speaking');
  if (readAloud.length > 0) speakingParts.push({ percent: meanCredit(readAloud), weight: SPEAKING_WEIGHTS.readAloud });
  if (!state.chatUnavailable) speakingParts.push({ percent: speakingGrade?.score ?? 0, weight: SPEAKING_WEIGHTS.conversation });
  if (speakingParts.length > 0) {
    const total = speakingParts.reduce((sum, part) => sum + part.weight, 0);
    percents.speaking = speakingParts.reduce((sum, part) => sum + part.percent * part.weight, 0) / total;
  }

  percents.writing = writingGrade?.score ?? 0;

  const weakPoints: WeakPoint[] = [];
  for (const item of graded) {
    if (item.outcome === 'correct') continue;
    weakPoints.push({
      key: item.key,
      kind: item.kind,
      outcome: item.outcome,
      label: item.label,
      answer: correctAnswerText(item.exercise),
      explanation: item.exercise.explanation,
    });
  }
  for (const error of grade?.errors ?? []) {
    // 沒有交寫作或沒有對話時,不採用 AI 對那一部分回報的錯誤。
    if (error.source === 'writing' ? !wroteSomething : !talked) continue;
    weakPoints.push({
      key: null,
      kind: error.source,
      outcome: error.severity,
      label: error.original,
      answer: error.corrected,
      explanation: error.explanation,
    });
  }

  return {
    ...combineScore(percents),
    weakPoints,
    writing: writingGrade,
    speaking: speakingGrade,
    closing: grade?.closing ?? DEFAULT_CLOSING,
  };
}
