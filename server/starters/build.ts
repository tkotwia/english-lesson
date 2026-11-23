import type { Cloze, Mcq, Reorder, Vocab } from '../../shared/schema.ts';

// 撰寫起始課時用的小工具:讓課程內容寫起來精簡,欄位順序固定,不容易漏寫。

export const mcq = (prompt: string, options: string[], answerIndex: number, explanation: string): Mcq => ({ prompt, options, answerIndex, explanation });

/** 克漏字。answers 可以給一個字串,或給多個都正確的答案。 */
export const cloze = (sentence: string, answers: string | string[], hint: string, explanation: string): Cloze => ({
  sentence,
  answers: [answers].flat(),
  hint,
  explanation,
});

export const reorder = (sentence: string, translation: string, explanation: string): Reorder => ({ sentence, translation, explanation });

export const vocab = (word: string, pos: string, meaning: string, example: string, practice: Cloze): Vocab => ({ word, pos, meaning, example, cloze: practice });

export const term = (word: string, meaning: string) => ({ word, meaning });
