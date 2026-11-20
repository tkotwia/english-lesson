import type { Lesson, LessonNovelty } from '../shared/schema.ts';
import { normalizeAnswer } from '../shared/scoring.ts';

// 重覆檢查:新產生的課和這位使用者先前的課比對。由程式計算,不靠 AI 自己說「我沒有重覆」。

/** 課文相似度達到這個比例就視為幾乎相同,會重新產生一次。 */
export const DUPLICATE_THRESHOLD = 0.5;

const SHINGLE_SIZE = 3;

/** 把文字切成「連續三個字」的片段集合。兩篇不同的文章即使主題相同,也很少有大量相同的三字片段。 */
function shingles(text: string): Set<string> {
  const words = normalizeAnswer(text).split(' ').filter(Boolean);
  const set = new Set<string>();
  if (words.length < SHINGLE_SIZE) {
    if (words.length > 0) set.add(words.join(' '));
    return set;
  }
  for (let i = 0; i <= words.length - SHINGLE_SIZE; i++) set.add(words.slice(i, i + SHINGLE_SIZE).join(' '));
  return set;
}

/**
 * 兩篇課文的相似度,0–1:相同的三字片段數,除以兩篇合計的不同片段數(Jaccard 係數)。
 * 完全相同是 1;只改幾個字仍然很高;主題相同但重新寫過的文章通常在 0.1 以下。
 */
export function passageSimilarity(a: string, b: string): number {
  const left = shingles(a);
  const right = shingles(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const piece of left) if (right.has(piece)) shared++;
  return shared / (left.size + right.size - shared);
}

/** 比對時需要的舊課資料。 */
export interface PastLesson {
  id: number;
  date: string;
  title: string;
  passage: string;
  vocab: string[];
}

/** 把新課和所有舊課比對:課文最像哪一堂、像到什麼程度,以及哪些重點單字以前教過。 */
export function checkNovelty(lesson: Lesson, past: PastLesson[]): Omit<LessonNovelty, 'regenerated'> {
  let best = 0;
  let similarTo: LessonNovelty['similarTo'] = null;
  for (const previous of past) {
    const similarity = passageSimilarity(lesson.passage.text, previous.passage);
    if (similarity > best) {
      best = similarity;
      similarTo = { sessionId: previous.id, title: previous.title, date: previous.date };
    }
  }

  const taught = new Set(past.flatMap((previous) => previous.vocab.map((word) => word.toLowerCase())));
  const repeatedVocab = lesson.vocab.map((vocab) => vocab.word).filter((word) => taught.has(word.toLowerCase()));

  return { compared: past.length, passageSimilarity: Math.round(best * 1000) / 1000, similarTo, repeatedVocab };
}
