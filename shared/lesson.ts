import { BLANK, type Cloze, type ItemKind, type Lesson, type Mcq, type Reorder, type Section } from './schema.ts';
import type { ItemStatus } from './srs.ts';

/** 閃卡:寫作或口說的錯誤沒有標準答案可比對,由學生看完正確說法後自己判斷記不記得。 */
export interface Flashcard {
  front: string;
  back: string;
  explanation: string;
}

/** 聽寫(聽完打出來)與跟讀(看著唸出來):都以單字正確率判定。 */
export interface SpokenSentence {
  sentence: string;
  explanation: string;
}

/**
 * 訂正:看著自己原本寫錯(或說錯)的句子,把正確的說法打出來。和聽寫一樣以單字正確率判定。
 * 只看老師改好的句子很快就忘;自己動手打一次,才會注意到差在哪裡。
 */
export interface Rewrite {
  /** 學生原本的句子。 */
  original: string;
  /** 正確的說法。 */
  sentence: string;
  explanation: string;
}

export type Exercise =
  | ({ type: 'mcq' } & Mcq)
  // hintFree:看提示不扣分。單字題才有(見 scoring.ts 的 gradeExercise)。
  | ({ type: 'cloze'; hintFree?: boolean } & Cloze)
  | ({ type: 'reorder' } & Reorder)
  | ({ type: 'flashcard' } & Flashcard)
  | ({ type: 'dictation' } & SpokenSentence)
  | ({ type: 'readAloud' } & SpokenSentence)
  | ({ type: 'rewrite' } & Rewrite);

/** 以單字正確率判定的題型:聽寫、跟讀、訂正。 */
export type SentenceExercise = Extract<Exercise, { type: 'dictation' | 'readAloud' | 'rewrite' }>;
export const isSentenceExercise = (exercise: Exercise): exercise is SentenceExercise =>
  exercise.type === 'dictation' || exercise.type === 'readAloud' || exercise.type === 'rewrite';

/** 閃卡的兩種作答。 */
export const FLASHCARD_KNOWN = 'known';
export const FLASHCARD_FORGOT = 'forgot';

export interface LessonExercise {
  /** 題號,同時是作答紀錄的索引鍵。由位置決定,不依賴 AI 產生的編號。 */
  key: string;
  section: Section;
  kind: ItemKind;
  /** 回顧清單上顯示的標題。 */
  label: string;
  exercise: Exercise;
  /** 作答時需要一起顯示的內容,例如閱讀題的課文。 */
  context?: string;
}

/** 不會 / 不熟項目庫裡的一個項目,附帶重考用的題目。 */
export interface ReviewItemView {
  id: number;
  kind: ItemKind;
  label: string;
  answer: string;
  explanation: string;
  context: string | null;
  status: ItemStatus;
  wrongCount: number;
  lastSeen: string;
  dueDate: string;
  quiz: Exercise;
}

/** 口說階段裡,跟讀與情境對話各佔的比重。 */
export const SPEAKING_WEIGHTS = { readAloud: 0.4, conversation: 0.6 } as const;

/** 把課程內容攤平成一份有題號的客觀題清單,前後端都用它來對題目與作答。 */
export function lessonExercises(lesson: Lesson): LessonExercise[] {
  const list: LessonExercise[] = [];
  lesson.listening.questions.forEach((q, i) =>
    list.push({
      key: `listening.q.${i}`,
      section: 'listening',
      kind: 'listening',
      label: q.prompt,
      exercise: { type: 'mcq', ...q },
      context: lesson.passage.text,
    }),
  );
  lesson.listening.dictation.forEach((sentence, i) =>
    list.push({ key: `listening.d.${i}`, section: 'listening', kind: 'listening', label: sentence, exercise: { type: 'dictation', sentence, explanation: '' } }),
  );
  lesson.reading.questions.forEach((q, i) =>
    list.push({
      key: `reading.${i}`,
      section: 'reading',
      kind: 'reading',
      label: q.prompt,
      exercise: { type: 'mcq', ...q },
      context: lesson.passage.text,
    }),
  );
  lesson.vocab.forEach((v, i) =>
    list.push({ key: `vocab.${i}`, section: 'language', kind: 'vocab', label: v.word, exercise: { type: 'cloze', ...v.cloze, hintFree: true } }),
  );
  const point = lesson.grammar.point;
  lesson.grammar.mcq.forEach((q, i) =>
    list.push({ key: `grammar.mcq.${i}`, section: 'language', kind: 'grammar', label: point, exercise: { type: 'mcq', ...q } }),
  );
  lesson.grammar.cloze.forEach((q, i) =>
    list.push({ key: `grammar.cloze.${i}`, section: 'language', kind: 'grammar', label: point, exercise: { type: 'cloze', ...q } }),
  );
  lesson.grammar.reorder.forEach((q, i) =>
    list.push({ key: `grammar.reorder.${i}`, section: 'language', kind: 'grammar', label: point, exercise: { type: 'reorder', ...q } }),
  );
  lesson.speaking.readAloud.forEach((sentence, i) =>
    list.push({ key: `speaking.r.${i}`, section: 'speaking', kind: 'speaking', label: sentence, exercise: { type: 'readAloud', sentence, explanation: '' } }),
  );
  return list;
}

export const reviewKey = (itemId: number) => `review.${itemId}`;

/** 暖身複習的題目:到期的不會 / 不熟項目。 */
export function reviewExercises(review: ReviewItemView[]): LessonExercise[] {
  return review.map((item) => ({
    key: reviewKey(item.id),
    section: 'review',
    kind: item.kind,
    label: item.label,
    exercise: item.quiz,
    context: item.context ?? undefined,
  }));
}

/** 顯示給學生看的正確答案。 */
export function correctAnswerText(exercise: Exercise): string {
  switch (exercise.type) {
    case 'mcq':
      return exercise.options[exercise.answerIndex] ?? '';
    case 'cloze':
      return exercise.sentence.replace(BLANK, exercise.answers[0] ?? '');
    case 'reorder':
      return exercise.sentence;
    case 'flashcard':
      return exercise.back;
    case 'dictation':
    case 'readAloud':
    case 'rewrite':
      return exercise.sentence;
  }
}

/** 重組題要排列的字:去掉句尾標點,標點另外固定顯示。 */
export function reorderWords(sentence: string): { words: string[]; ending: string } {
  const match = sentence.trim().match(/^(.*?)([.!?]*)$/s);
  const body = match?.[1] ?? sentence;
  return { words: body.split(/\s+/).filter(Boolean), ending: match?.[2] ?? '' };
}

/** 把字數算出來(以空白分隔的英文字)。 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
