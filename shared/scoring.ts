import {
  correctAnswerText,
  FLASHCARD_KNOWN,
  isSentenceExercise,
  type Rewrite,
  lessonExercises,
  reviewExercises,
  SPEAKING_WEIGHTS,
  type Exercise,
  type ReviewItemView,
} from './lesson.ts';
import { BLANK, type ExerciseAnswer, type Grade, type Lesson, type Outcome, type Section, type SectionResult, type SessionResult, type SessionState, type WeakPoint } from './schema.ts';

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

const wordsOf = (text: string): string[] => normalizeAnswer(text).split(' ').filter(Boolean);

/** 最長共同子序列:expected 裡的每個字,有沒有依序對上 actual 裡的字。 */
function matchInOrder(expected: string[], actual: string[]): boolean[] {
  const rows = expected.length;
  const columns = actual.length;
  // lengths[i][j]:expected 的前 i 個字與 actual 的前 j 個字,最多能依序對上幾個。
  const lengths = Array.from({ length: rows + 1 }, () => new Array<number>(columns + 1).fill(0));
  for (let i = 1; i <= rows; i++) {
    for (let j = 1; j <= columns; j++) {
      lengths[i]![j] = expected[i - 1] === actual[j - 1] ? lengths[i - 1]![j - 1]! + 1 : Math.max(lengths[i - 1]![j]!, lengths[i]![j - 1]!);
    }
  }
  const matched = new Array<boolean>(rows).fill(false);
  for (let i = rows, j = columns; i > 0 && j > 0; ) {
    if (expected[i - 1] === actual[j - 1]) {
      matched[i - 1] = true;
      i--;
      j--;
    } else if (lengths[i - 1]![j]! >= lengths[i]![j - 1]!) i--;
    else j--;
  }
  return matched;
}

/**
 * 單字正確率:兩句話依序對得上的單字數,除以較長那一句的字數。
 * 少寫、多寫、寫錯或順序不對都會拉低正確率。
 */
export function wordAccuracy(expected: string, actual: string): number {
  const a = wordsOf(expected);
  const b = wordsOf(actual);
  if (a.length === 0 || b.length === 0) return 0;
  return matchInOrder(a, b).filter(Boolean).length / Math.max(a.length, b.length);
}

/**
 * 跟讀時要用哪一段辨識結果計分。
 * 瀏覽器的語音辨識邊聽邊猜,等學生停頓或按下「唸完了」時會把整句重新判斷一次,有時把唸對的字換成別的字:
 * 學生在畫面上看到自己唸對了,送出後卻被算錯。所以錄音過程中畫面上出現過的文字都算數,取最接近原句的那一段。
 * other 比 preferred 更接近原句時才用 other;一樣接近時維持 preferred。
 */
export function closerTranscript(sentence: string, preferred: string, other: string): string {
  return wordAccuracy(sentence, other) > wordAccuracy(sentence, preferred) ? other : preferred;
}

/**
 * 訂正題:學生是不是真的把錯的地方改對了。
 * 長句子只改一個字時,照抄原本錯的句子也有九成以上的字是對的;只看正確率的話,沒訂正也會過關。
 * 所以另外要求:正確說法裡「原句沒有的字」都要出現,而且不能和原句一模一樣。
 */
function appliesCorrection(exercise: Rewrite, response: string): boolean {
  const corrected = wordsOf(exercise.sentence);
  const original = wordsOf(exercise.original);
  const given = wordsOf(response);
  if (given.join(' ') === original.join(' ')) return false;
  const inOriginal = matchInOrder(corrected, original);
  const inResponse = matchInOrder(corrected, given);
  return corrected.every((_, index) => inOriginal[index] || inResponse[index]);
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
    case 'rewrite':
      return wordAccuracy(exercise.sentence, response) >= ACCURACY_CORRECT && appliesCorrection(exercise, response);
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
    // 聽寫、跟讀與訂正:沒達到答對標準,但大部分的字都對,算不熟而不是不會。
    if (isSentenceExercise(exercise)) {
      const best = Math.max(0, ...attempts.map((attempt) => wordAccuracy(exercise.sentence, attempt)));
      if (best >= ACCURACY_UNFAMILIAR) return { outcome: 'unfamiliar', credit: 0.5 };
    }
    return { outcome: 'unknown', credit: 0 };
  }
  // 看了提示才答對只有半分。單字題例外:練習時單字表是收起來的,一句話的空格常常不只一個字填得進去,
  // 提示(中文意思與第一個字母)是在告訴學生「要填的是哪一個字」,看它不算偷看答案。
  const hintCounts = answer?.hintUsed === true && !(exercise.type === 'cloze' && exercise.hintFree === true);
  if (correctAt === 0 && !hintCounts) return { outcome: 'correct', credit: 1 };
  return { outcome: 'unfamiliar', credit: 0.5 };
}

/**
 * 學生跳過了這一題。只有跟讀可以跳過:複習時不一定方便出聲(在圖書館、旁邊有人在睡),
 * 不讓跳過的話,整份複習會卡在那一題。跳過的題不算對也不算錯:不計分,複習的排程往後延一天。
 * 畫面只在複習時提供跳過;新課自己的跟讀題不能用它躲掉(見 buildSessionResult)。
 */
export function isSkipped(exercise: Exercise, answer: ExerciseAnswer | undefined): boolean {
  return exercise.type === 'readAloud' && answer?.skipped === true;
}

/** 這一題是否已經作答完畢(答對了、用完兩次機會,或跳過了)。 */
export function isExerciseDone(exercise: Exercise, answer: ExerciseAnswer | undefined): boolean {
  if (!answer) return false;
  if (isSkipped(exercise, answer)) return true;
  return answer.attempts.length >= maxAttempts(exercise) || answer.attempts.some((attempt) => checkAnswer(exercise, attempt));
}

/**
 * 學生答錯時的作答內容,寫成看得懂的文字(選擇題是選項的文字,不是第幾個選項)。
 * 回顧時用來讓學生看到自己當時錯在哪裡。閃卡是自我評量,沒有作答內容。
 */
export function wrongResponses(exercise: Exercise, answer: ExerciseAnswer | undefined): string[] {
  if (exercise.type === 'flashcard') return [];
  const attempts = answer?.attempts.slice(0, maxAttempts(exercise)) ?? [];
  const texts = attempts
    .filter((attempt) => !checkAnswer(exercise, attempt))
    .map((attempt) => (exercise.type === 'mcq' ? (attempt.trim() === '' ? '' : (exercise.options[Number(attempt)] ?? '')) : attempt.trim()))
    .filter(Boolean);
  return [...new Set(texts)];
}

/** 正確答案的一段文字;missed 表示這一段是學生答錯的地方,顯示時要標出來。 */
export interface MarkedText {
  text: string;
  missed: boolean;
}

/**
 * 把正確答案切成幾段,標出學生答錯的地方,讓學生一眼看到差在哪裡:
 * - 克漏字:空格裡該填的字。
 * - 重組、聽寫、跟讀:沒有依序對上的字(大小寫與標點不同不算錯)。
 * - 選擇題與閃卡整個答案就是一個選項或說法,不標。
 * response 是學生答錯的那一次作答;沒有(或沒有內容)就什麼都不標。
 */
export function markSolution(exercise: Exercise, response: string | undefined): MarkedText[] {
  const plain: MarkedText[] = [{ text: correctAnswerText(exercise), missed: false }];
  if (response === undefined || exercise.type === 'mcq' || exercise.type === 'flashcard') return plain;

  if (exercise.type === 'cloze') {
    const at = exercise.sentence.indexOf(BLANK);
    if (at === -1 || response.trim() === '') return plain;
    return [
      { text: exercise.sentence.slice(0, at), missed: false },
      { text: exercise.answers[0] ?? '', missed: true },
      { text: exercise.sentence.slice(at + BLANK.length), missed: false },
    ].filter((part) => part.text !== '');
  }

  const given = wordsOf(response);
  if (given.length === 0) return plain;
  // 畫面上的一個字(例如 well-known)比對時可能算成好幾個字;其中任何一個沒對上,整個字都標出來。
  const tokens = exercise.sentence.trim().split(/\s+/);
  const tokenWords = tokens.map(wordsOf);
  const matched = matchInOrder(tokenWords.flat(), given);
  let next = 0;
  const missed = tokenWords.map((words) => {
    const flags = matched.slice(next, next + words.length);
    next += words.length;
    return flags.includes(false);
  });

  const parts: MarkedText[] = [];
  const add = (text: string, isMissed: boolean) => {
    const last = parts.at(-1);
    if (last && last.missed === isMissed) last.text += text;
    else parts.push({ text, missed: isMissed });
  };
  tokens.forEach((token, index) => {
    // 連續答錯的字連同中間的空白標成一整段。
    if (index > 0) add(' ', missed[index]! && missed[index - 1]!);
    add(token, missed[index]!);
  });
  return parts;
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
    // 暖身複習裡跳過的跟讀題不計分。新課自己的跟讀題不適用:那裡的「跳過」照樣算沒作答。
    .filter((item) => !(item.section === 'review' && isSkipped(item.exercise, state.answers[item.key])))
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
